import { createAiClient } from "./ai";
import { loadConfig, requirePipelineConfig } from "./config/env";
import { injectSelectedImages } from "./image";
import { RunLogger } from "./logger";
import { appendRunLogToPage, createNotionClient, fetchPostFromPage, previewOriginalHtml } from "./notion";
import { buildXPost, publishToX } from "./publish-x";
import { publishToTistory } from "./publish-tistory";
import { rewriteBodyMarkdown } from "./rewrite";
import { createThumbnail } from "./thumbnail";
import { buildTistoryHtml, markdownToHtml, transformPost } from "./transform";
import type { ArticleImageAsset, ReadyPost } from "./types";
import { downloadImageToDataUrl, retry } from "./utils";

function getPageRef(cliArg: string | undefined, config: { pageUrl?: string; pageId?: string }): string {
  const input = cliArg?.trim() || config.pageUrl?.trim() || config.pageId?.trim();
  if (!input) {
    throw new Error("Provide a Notion page link or page ID as the first CLI argument, or set NOTION_PAGE_URL.");
  }
  return input;
}

function buildTistoryTags(post: ReadyPost, hashtags: string[]): string[] {
  return [...new Set([...post.tags, ...hashtags.map((tag) => tag.replace(/^#/, ""))].filter(Boolean))].slice(0, 10);
}

async function run(): Promise<void> {
  const config = requirePipelineConfig(loadConfig());
  const logger = new RunLogger();
  const notion = createNotionClient(config.notion.apiKey);
  const ai = createAiClient(config.gemini.apiKey);

  let currentPost: ReadyPost | null = null;

  try {
    currentPost = await fetchPostFromPage(notion, {
      pageRef: getPageRef(process.argv[2], config.notion),
      titleProperty: config.notion.titleProperty,
      slugProperty: config.notion.slugProperty,
      tagsProperty: config.notion.tagsProperty,
      categoryProperty: config.notion.categoryProperty,
    });

    const activePost = currentPost;

    logger.recordDecision(`Notion 페이지 선택: ${activePost.title}`);

    const transformed = await transformPost(activePost);
    logger.recordImplementation("본문, X 초안, 이미지 선택, 썸네일 프롬프트를 로컬 규칙 기반으로 생성했습니다.");

    // ── Content rewrite (Claude) ──────────────────────────────────────────
    // Rewrites body text in the author's own words to avoid publishing
    // textbook content verbatim — rewritten to match the Tistory blog posting style.
    // Code blocks and image markers are preserved via placeholder extraction.
    // Fail-closed: throws if rewrite fails so original content is never published.
    let rewrittenMarkdown = transformed.bodyMarkdown;
    if (config.rewrite.enabled && config.rewrite.apiKey) {
      rewrittenMarkdown = await rewriteBodyMarkdown(
        config.rewrite.apiKey,
        config.rewrite.model,
        activePost.title,
        transformed.bodyMarkdown,
      );
      logger.recordImplementation("Claude로 본문 각색 완료 (티스토리 포스팅 스타일 적용).");
    }

    const finalTransformed = rewrittenMarkdown !== transformed.bodyMarkdown
      ? { ...transformed, bodyMarkdown: rewrittenMarkdown, bodyHtml: markdownToHtml(rewrittenMarkdown) }
      : transformed;

    const renderedHtml = buildTistoryHtml(finalTransformed);

    // Resolve Notion-hosted images (presigned S3 URLs expire in ~1h).
    // Download and embed as data URLs so they remain permanently accessible.
    const resolvedImageAssets = await Promise.all(
      currentPost.imageAssets.map(async (asset: ArticleImageAsset) => {
        if (asset.sourceType !== "file" || !asset.url) return asset;
        const dataUrl = await downloadImageToDataUrl(asset.url);
        return dataUrl ? { ...asset, url: dataUrl } : { ...asset, url: "" };
      }),
    );

    const articleHtml = finalTransformed.imageDecisions.length
      ? injectSelectedImages(renderedHtml, resolvedImageAssets, finalTransformed.imageDecisions)
      : renderedHtml;

    const thumbnail = await createThumbnail(
      ai,
      {
        model: config.gemini.imageModel,
        outputDir: config.gemini.thumbnailOutputDir,
        allowRetry: config.gemini.thumbnailAllowRetry,
      },
      {
        slug: currentPost.slug,
        prompt: finalTransformed.thumbnailPrompt,
        headline: finalTransformed.thumbnailHeadline,
      },
    );
    logger.recordImplementation(`썸네일 생성 완료: ${thumbnail.path}`);

    const tistoryTags = buildTistoryTags(activePost, finalTransformed.hashtags);

    const tistoryResult = await retry("tistory publish", 2, async () =>
      publishToTistory(config, {
        title: finalTransformed.title,
        html: articleHtml || previewOriginalHtml(activePost),
        thumbnailPath: thumbnail.path,
        slug: activePost.slug,
        tags: tistoryTags,
      }),
    );
    logger.recordImplementation(`티스토리 발행 처리 완료: ${tistoryResult.url}`);

    const xText = buildXPost(finalTransformed.xPostBody, tistoryResult.url, finalTransformed.hashtags);
    const xResult = await retry("x publish", 2, async () => publishToX(config, xText));
    logger.recordImplementation(`X 게시 완료: ${xResult.postId ?? "(unknown id)"}`);

    logger.recordResolution("콘텐츠 파이프라인을 정상 완료했습니다.");
    logger.addNextStep("실제 배포 후에는 Tistory 에디터 셀렉터와 발행 URL 회수 로직을 블로그 환경에 맞게 한 번 점검합니다.");

    if (!config.dryRun && currentPost && config.appendRunLogs) {
      await appendRunLogToPage(
        notion,
        currentPost.pageId,
        logger.toStructuredLog(`[Published] ${currentPost.title}`),
        {
          status: "Published",
          tistoryUrl: tistoryResult.url,
          xPostId: xResult.postId ?? "",
          thumbnailPath: thumbnail.path,
          thumbnailPrompt: thumbnail.prompt,
        },
      );
    }

    console.log("Pipeline completed.");
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message : String(error);
    logger.recordProblem(safeMessage);
    console.error(error);

    if (!config.dryRun && currentPost && config.appendRunLogs) {
      await appendRunLogToPage(
        notion,
        currentPost.pageId,
        logger.toStructuredLog(`[Error] ${currentPost.title}`),
          {
            status: "Error",
            errorMessage: safeMessage,
          },
      );
    }

    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
