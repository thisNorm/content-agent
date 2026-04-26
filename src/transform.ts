import { marked } from "marked";

import { X_STYLE_GUIDE } from "./config/x";
import type { BlockNode, ReadyPost, TransformedContent } from "./types";
import { dedupe, escapeHtml, trimToLength } from "./utils";

marked.setOptions({
  gfm: true,
});

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function splitSentences(input: string): string[] {
  return input
    .split(/(?<=[.!?])\s+|(?<=[다요음함됨]\.)\s+|\n+/)
    .map(normalizeWhitespace)
    .filter(Boolean);
}

function takeMeaningfulText(blocks: BlockNode[]): string[] {
  const collected: string[] = [];

  for (const block of blocks) {
    if (["paragraph", "heading_2", "heading_3", "quote"].includes(block.type) && block.text.trim()) {
      collected.push(normalizeWhitespace(block.text));
    }

    if (block.children.length > 0) {
      collected.push(...takeMeaningfulText(block.children));
    }
  }

  return collected;
}

function takeHeadingTexts(blocks: BlockNode[]): string[] {
  const headings: string[] = [];

  for (const block of blocks) {
    if ((block.type === "heading_2" || block.type === "heading_3") && block.text.trim()) {
      headings.push(normalizeWhitespace(block.text));
    }

    if (block.children.length > 0) {
      headings.push(...takeHeadingTexts(block.children));
    }
  }

  return headings;
}

function buildHook(post: ReadyPost, summarySource: string): string {
  if (summarySource) {
    return `${post.title}는 처음 보면 복잡해 보이지만, 핵심 흐름만 잡으면 훨씬 쉽게 이해할 수 있습니다. 이 글에서는 ${summarySource}를 중심으로 빠르게 정리합니다.`;
  }

  return `${post.title}는 처음 접하면 용어가 많아 어렵게 느껴질 수 있지만, 큰 흐름부터 보면 이해가 훨씬 쉬워집니다. 이 글에서는 꼭 필요한 핵심만 부담 없이 정리합니다.`;
}

function buildConclusion(post: ReadyPost, headings: string[]): string {
  const focus = headings.slice(0, 3).join(", ");
  if (focus) {
    return `${post.title}를 이해할 때는 ${focus}처럼 큰 흐름을 먼저 잡는 것이 중요합니다. 세부 명령어나 구현은 그다음에 붙여도 늦지 않습니다.`;
  }

  return `${post.title}는 개념을 한 번에 외우기보다 흐름과 역할을 먼저 이해하면 훨씬 빠르게 익힐 수 있습니다. 핵심 구조를 먼저 잡고 예제로 반복해 보세요.`;
}

function buildSeoDescription(post: ReadyPost, textSnippets: string[]): string {
  const base = textSnippets.slice(0, 2).join(" ");
  const summary = base || `${post.title}의 핵심 개념과 흐름을 초보자 기준으로 정리한 글입니다.`;
  return trimToLength(summary, 160);
}

function buildHashtags(post: ReadyPost): string[] {
  const normalizedTags = post.tags
    .map((tag) => tag.replace(/\s+/g, "").replace(/^#/, ""))
    .filter((tag) => /^[0-9A-Za-z가-힣_-]{2,20}$/.test(tag));

  if (normalizedTags.length > 0) {
    return dedupe(normalizedTags.map((tag) => `#${tag}`)).slice(0, 3);
  }

  return ["#개발", "#공부기록"];
}

/**
 * Build the X post body.
 *
 * Persona: 막 졸업한 주니어 개발자, 성장형 개발 인플루언서
 * Style: ~입니다/~습니다 말투, 가르치지 않고 함께 공부하는 느낌
 * Structure: 핵심 개념 1~2개 + 배우며 느낀 점
 * (hashtags and URL are appended by buildXPost)
 */
function buildXPostBody(post: ReadyPost, headings: string[]): string {
  const h1 = headings[0] ?? post.title;
  const h2 = headings[1] ?? "";

  const openers = [
    `${h1}${h2 ? `랑 ${h2}` : ""}의 차이가 처음엔 헷갈렸는데, 직접 정리하고 나니까 확실히 잡혔습니다.`,
    `${post.title}를 공부하면서 ${h1} 개념이 제일 낯설었는데 이제는 납득이 됩니다.`,
    `${h1}이 무슨 역할인지 몰라서 막혔는데, 구조를 그려보니 바로 이해됐습니다.`,
  ];
  const opener = openers[post.title.length % openers.length];
  const closing = h2
    ? `${h1}과 ${h2}를 연결해서 보면 전체 흐름이 한 번에 보입니다.`
    : `${post.title} 흐름을 잡고 나면 다음 개념도 훨씬 수월하게 읽힙니다.`;

  return trimToLength([opener, closing].join("\n"), 200);
}

function buildThumbnailPrompt(post: ReadyPost, headings: string[], textSnippets: string[]): string {
  const focusPoints = dedupe([...headings, ...textSnippets])
    .slice(0, 4)
    .map((item) => `- ${item}`)
    .join("\n");

  const tagText = post.tags.length ? post.tags.join(", ") : "초보 개발자, 기술 입문";

  return [
    `주제: ${post.title}`,
    `대상: ${tagText}, 특히 개념을 처음 배우는 독자`,
    `핵심 포인트:`,
    focusPoints || `- ${post.title}의 핵심 흐름이 한눈에 보이는 설명형 일러스트`,
    `톤:`,
    `- 59번 썸네일처럼 밝고 친숙한 블루 계열`,
    `- 초보자가 봐도 주제를 짐작할 수 있는 설명형 이미지`,
    `- 메인 오브젝트가 분명한 교육용 일러스트`,
    `- 추상 배경보다 서버, 클라우드, 카드, 화살표, 노트 같은 친숙한 요소 중심`,
    `- 패널, 보드, 버튼 안에 글자를 넣지 말 것`,
    `- 텍스트, 숫자, 로고, 워터마크, UI 라벨은 절대 넣지 말 것`,
    `- 모바일에서도 한눈에 보이도록 단순한 구도와 높은 대비 유지`,
    `- 중앙에는 핵심 오브젝트, 좌하단에는 제목 합성을 위한 비교적 깔끔한 여백 유지`,
    `- 추상적인 배경 패턴만으로 끝내지 말고 주제가 짐작되는 설명형 일러스트를 만들 것`,
  ].join("\n");
}

function buildThumbnailHeadline(post: ReadyPost): string {
  return trimToLength(
    post.title
      .replace(/[|:：-]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    34,
  );
}

function selectImageDecisions(post: ReadyPost): TransformedContent["imageDecisions"] {
  const prioritizedIds = new Set(
    post.imageAssets
      .map((asset, index) => ({
        blockId: asset.blockId,
        index,
        hasCaption: asset.caption.trim().length > 0,
      }))
      .sort((left, right) => {
        if (left.hasCaption === right.hasCaption) {
          return left.index - right.index;
        }
        return left.hasCaption ? -1 : 1;
      })
      .slice(0, 3)
      .map((asset) => asset.blockId),
  );

  return post.imageAssets.map((asset, index) => ({
    blockId: asset.blockId,
    use: prioritizedIds.has(asset.blockId),
    altText: asset.caption.trim() || `${post.title} 관련 이미지 ${index + 1}`,
    reason: prioritizedIds.has(asset.blockId)
      ? "본문 이해를 돕는 보조 이미지로 유지"
      : "핵심 흐름 위주로 읽히도록 본문 이미지는 최소화",
  }));
}

function paragraphChunks(text: string): string[] {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) {
    return [normalizeWhitespace(text)].filter(Boolean);
  }

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= 140 && splitSentences(candidate).length <= 2) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }
    current = sentence;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function escapeMarkdownText(input: string): string {
  return normalizeWhitespace(input).replace(/([\\`*_{}\[\]()#+\-!|>])/g, "\\$1");
}

function renderImageMarker(block: BlockNode): string {
  return block.image?.blockId ? `{{IMAGE:${block.image.blockId}}}` : "";
}

function renderBlockToMarkdown(block: BlockNode, indentLevel = 0, orderedIndex = 1): string {
  const indent = "  ".repeat(indentLevel);

  switch (block.type) {
    case "heading_1":
    case "heading_2":
      return `## ${escapeMarkdownText(block.text)}`;
    case "heading_3":
      return `### ${escapeMarkdownText(block.text)}`;
    case "paragraph":
      return paragraphChunks(block.text).map((chunk) => escapeMarkdownText(chunk)).join("\n\n");
    case "quote":
      return paragraphChunks(block.text)
        .map((chunk) => `> ${escapeMarkdownText(chunk)}`)
        .join("\n");
    case "code":
      return `\`\`\`${block.language ?? "text"}\n${block.text}\n\`\`\``;
    case "image":
      return renderImageMarker(block);
    case "bulleted_list_item": {
      const nested = block.children
        .map((child, index) =>
          renderBlockToMarkdown(
            child,
            indentLevel + 1,
            child.type === "numbered_list_item" ? index + 1 : 1,
          ),
        )
        .filter(Boolean)
        .join("\n");

      return `${indent}- ${escapeMarkdownText(block.text)}${nested ? `\n${nested}` : ""}`;
    }
    case "numbered_list_item": {
      const nested = block.children
        .map((child, index) =>
          renderBlockToMarkdown(
            child,
            indentLevel + 1,
            child.type === "numbered_list_item" ? index + 1 : 1,
          ),
        )
        .filter(Boolean)
        .join("\n");

      return `${indent}${orderedIndex}. ${escapeMarkdownText(block.text)}${nested ? `\n${nested}` : ""}`;
    }
    default:
      return "";
  }
}

function renderBlocksToMarkdown(blocks: BlockNode[]): string {
  const lines: string[] = [];
  let orderedIndex = 1;

  for (const block of blocks) {
    const markdown = renderBlockToMarkdown(block, 0, orderedIndex);
    if (!markdown) {
      continue;
    }

    lines.push(markdown);
    lines.push("");

    orderedIndex = block.type === "numbered_list_item" ? orderedIndex + 1 : 1;
  }

  return lines.join("\n").trim();
}

function markdownToHtml(markdown: string): string {
  return String(marked.parse(markdown)).trim();
}

export { markdownToHtml };

export async function transformPost(post: ReadyPost): Promise<TransformedContent> {
  const textSnippets = takeMeaningfulText(post.blocks);
  const headings = takeHeadingTexts(post.blocks);
  const summarySource = textSnippets[0] || headings[0] || "";
  const bodyMarkdown = renderBlocksToMarkdown(post.blocks);

  return {
    title: trimToLength(post.title.trim() || "notion-post", 120),
    seoDescription: buildSeoDescription(post, textSnippets),
    hook: buildHook(post, summarySource),
    bodyMarkdown,
    bodyHtml: markdownToHtml(bodyMarkdown),
    conclusion: buildConclusion(post, headings),
    xPostBody: buildXPostBody(post, headings),
    hashtags: buildHashtags(post),
    thumbnailPrompt: buildThumbnailPrompt(post, headings, textSnippets),
    thumbnailHeadline: buildThumbnailHeadline(post),
    imageDecisions: selectImageDecisions(post),
  };
}

export function buildTistoryHtml(content: TransformedContent): string {
  return [
    `<p>${escapeHtml(content.hook)}</p>`,
    content.bodyHtml,
    `<h2>마무리</h2>`,
    `<p>${escapeHtml(content.conclusion)}</p>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
