import { Client, type AppendBlockChildrenParameters } from "@notionhq/client";

import type { BlockNode, ReadyPost, StructuredLog } from "./types";
import { chunkText, dedupe, escapeHtml, nowIso } from "./utils";

type NotionObject = Record<string, unknown> & {
  id: string;
  type: string;
  has_children?: boolean;
};

type PropertyMap = Record<string, Record<string, unknown>>;

export function createNotionClient(apiKey: string): Client {
  return new Client({ auth: apiKey });
}

function richTextToPlainText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (typeof item === "object" && item !== null && "plain_text" in item) {
        const text = item.plain_text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .join("");
}

function titlePropertyToText(property: Record<string, unknown> | undefined): string {
  if (!property) {
    return "";
  }
  return richTextToPlainText(property.title);
}

function richTextPropertyToText(property: Record<string, unknown> | undefined): string {
  if (!property) {
    return "";
  }
  return richTextToPlainText(property.rich_text);
}

function selectPropertyToText(property: Record<string, unknown> | undefined): string {
  if (!property) {
    return "";
  }

  const select = property.select;
  if (typeof select === "object" && select !== null && "name" in select) {
    const name = select.name;
    return typeof name === "string" ? name : "";
  }

  return "";
}

function multiSelectToTexts(property: Record<string, unknown> | undefined): string[] {
  if (!property || !Array.isArray(property.multi_select)) {
    return [];
  }

  return property.multi_select
    .map((entry) => {
      if (typeof entry === "object" && entry !== null && "name" in entry) {
        const name = entry.name;
        return typeof name === "string" ? name : "";
      }
      return "";
    })
    .filter(Boolean);
}

function slugify(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getBlockData(block: NotionObject): Record<string, unknown> {
  const value = block[block.type];
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

async function fetchBlockTree(client: Client, blockId: string): Promise<BlockNode[]> {
  const blocks: NotionObject[] = [];
  let cursor: string | undefined;

  do {
    const response = await client.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });

    blocks.push(...(response.results as unknown as NotionObject[]));
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  const normalized: BlockNode[] = [];

  for (const block of blocks) {
    const children = block.has_children ? await fetchBlockTree(client, block.id) : [];
    const data = getBlockData(block);

    switch (block.type) {
      case "heading_1":
      case "heading_2":
      case "heading_3":
      case "paragraph":
      case "bulleted_list_item":
      case "numbered_list_item":
      case "quote":
        normalized.push({
          id: block.id,
          type: block.type,
          text: richTextToPlainText(data.rich_text),
          children,
        });
        break;
      case "code":
        normalized.push({
          id: block.id,
          type: "code",
          text: richTextToPlainText(data.rich_text),
          language: typeof data.language === "string" ? data.language : "text",
          children,
        });
        break;
      case "image": {
        const imageType = typeof data.type === "string" ? data.type : "external";
        const imageSource = data[imageType];
        const url =
          typeof imageSource === "object" &&
          imageSource !== null &&
          "url" in imageSource &&
          typeof imageSource.url === "string"
            ? imageSource.url
            : "";
        normalized.push({
          id: block.id,
          type: "image",
          text: richTextToPlainText(data.caption),
          image: {
            blockId: block.id,
            url,
            caption: richTextToPlainText(data.caption),
            sourceType: imageType === "external" ? "external" : "file",
          },
          children,
        });
        break;
      }
      default:
        normalized.push({
          id: block.id,
          type: "unsupported",
          text: "",
          children,
        });
    }
  }

  return normalized;
}

export function extractNotionPageId(input: string): string {
  const trimmed = input.trim();
  const directMatch = trimmed.match(/[0-9a-fA-F]{32}/);
  if (directMatch) {
    const raw = directMatch[0].toLowerCase();
    return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  }

  const hyphenatedMatch = trimmed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (hyphenatedMatch) {
    return hyphenatedMatch[0].toLowerCase();
  }

  throw new Error("Could not extract a Notion page ID from the provided link or ID.");
}

function renderBlockForPrompt(block: BlockNode, depth = 0, ordinal = 1): string {
  const indent = "  ".repeat(depth);
  const nested = block.children
    .map((child, index) => renderBlockForPrompt(child, depth + 1, index + 1))
    .join("\n");

  switch (block.type) {
    case "heading_1":
      return `# ${block.text}`;
    case "heading_2":
      return `## ${block.text}`;
    case "heading_3":
      return `### ${block.text}`;
    case "paragraph":
      return `${block.text}`;
    case "bulleted_list_item":
      return `${indent}- ${block.text}${nested ? `\n${nested}` : ""}`;
    case "numbered_list_item":
      return `${indent}${ordinal}. ${block.text}${nested ? `\n${nested}` : ""}`;
    case "quote":
      return `> ${block.text}`;
    case "code":
      return `\`\`\`${block.language ?? "text"}\n${block.text}\n\`\`\``;
    case "image":
      return `[IMAGE id=${block.id} caption="${block.image?.caption ?? ""}" url="${block.image?.url ?? ""}"]`;
    default:
      return "";
  }
}

function collectImageAssets(blocks: BlockNode[]): ReadyPost["imageAssets"] {
  const assets: ReadyPost["imageAssets"] = [];

  for (const block of blocks) {
    if (block.image?.url) {
      assets.push(block.image);
    }
    if (block.children.length > 0) {
      assets.push(...collectImageAssets(block.children));
    }
  }

  return assets;
}

function findTitleFromProperties(properties: PropertyMap, preferredProperty: string): string {
  const preferred = titlePropertyToText(properties[preferredProperty]);
  if (preferred) {
    return preferred;
  }

  for (const value of Object.values(properties)) {
    if (value.type === "title") {
      return titlePropertyToText(value);
    }
  }

  return "";
}

export async function fetchPostFromPage(client: Client, config: {
  pageRef: string;
  titleProperty: string;
  slugProperty: string;
  tagsProperty: string;
  categoryProperty: string;
}): Promise<ReadyPost> {
  const pageId = extractNotionPageId(config.pageRef);
  const page = await client.pages.retrieve({ page_id: pageId });
  if (page.object !== "page" || !("properties" in page)) {
    throw new Error("The provided Notion link does not point to a readable page.");
  }

  const properties = (page.properties ?? {}) as PropertyMap;
  const title = findTitleFromProperties(properties, config.titleProperty) || "notion-post";
  const slugValue = richTextPropertyToText(properties[config.slugProperty]);
  const slug = slugValue || slugify(title);
  const tags = multiSelectToTexts(properties[config.tagsProperty]);
  const category =
    selectPropertyToText(properties[config.categoryProperty]) ||
    richTextPropertyToText(properties[config.categoryProperty]);

  const blocks = await fetchBlockTree(client, page.id);
  const promptSource = blocks
    .map((block, index) => renderBlockForPrompt(block, 0, index + 1))
    .filter(Boolean)
    .join("\n\n");

  return {
    pageId: page.id,
    title,
    slug,
    tags: dedupe(tags),
    category,
    blocks,
    promptSource,
    imageAssets: collectImageAssets(blocks),
  };
}

function textRichText(content: string) {
  return [{ type: "text" as const, text: { content: content.slice(0, 1800) } }];
}

function paragraphBlocksFromText(text: string): AppendBlockChildrenParameters["children"] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.flatMap((line) =>
    chunkText(line).map((chunk) => ({
      object: "block" as const,
      type: "paragraph" as const,
      paragraph: { rich_text: textRichText(chunk) },
    })),
  );
}

export async function appendRunLogToPage(
  client: Client,
  pageId: string,
  log: StructuredLog,
  metadata: {
    status: "Published" | "Error";
    tistoryUrl?: string;
    xPostId?: string;
    thumbnailPath?: string;
    thumbnailPrompt?: string;
    errorMessage?: string;
  },
): Promise<void> {
  const children: AppendBlockChildrenParameters["children"] = [
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: textRichText(`자동 발행 로그 - ${metadata.status} - ${nowIso()}`),
      },
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: textRichText(`상태: ${metadata.status}`),
      },
    },
    ...(metadata.tistoryUrl
      ? [
          {
            object: "block" as const,
            type: "bulleted_list_item" as const,
            bulleted_list_item: {
              rich_text: textRichText(`티스토리 URL: ${metadata.tistoryUrl}`),
            },
          },
        ]
      : []),
    ...(metadata.xPostId
      ? [
          {
            object: "block" as const,
            type: "bulleted_list_item" as const,
            bulleted_list_item: {
              rich_text: textRichText(`X Post ID: ${metadata.xPostId}`),
            },
          },
        ]
      : []),
    ...(metadata.thumbnailPath
      ? [
          {
            object: "block" as const,
            type: "bulleted_list_item" as const,
            bulleted_list_item: {
              rich_text: textRichText(`썸네일 파일: ${metadata.thumbnailPath}`),
            },
          },
        ]
      : []),
    ...paragraphBlocksFromText(`오늘 한 일\n${log.todayWork}`),
    ...paragraphBlocksFromText(`구현 내용\n${log.implementation}`),
    ...paragraphBlocksFromText(`문제점\n${metadata.errorMessage || log.problems}`),
    ...paragraphBlocksFromText(`해결 방법\n${log.resolution}`),
    ...paragraphBlocksFromText(`다음 할 일\n${log.next}`),
    ...(metadata.thumbnailPrompt
      ? paragraphBlocksFromText(`썸네일 프롬프트\n${metadata.thumbnailPrompt}`)
      : []),
  ];

  for (let index = 0; index < children.length; index += 100) {
    await client.blocks.children.append({
      block_id: pageId,
      children: children.slice(index, index + 100),
    });
  }
}

export function previewOriginalHtml(post: ReadyPost): string {
  const blocks = post.blocks.map((block) => {
    switch (block.type) {
      case "heading_1":
        return `<h1>${escapeHtml(block.text)}</h1>`;
      case "heading_2":
        return `<h2>${escapeHtml(block.text)}</h2>`;
      case "heading_3":
        return `<h3>${escapeHtml(block.text)}</h3>`;
      case "paragraph":
        return `<p>${escapeHtml(block.text)}</p>`;
      case "bulleted_list_item":
        return `<ul><li>${escapeHtml(block.text)}</li></ul>`;
      case "numbered_list_item":
        return `<ol><li>${escapeHtml(block.text)}</li></ol>`;
      case "quote":
        return `<blockquote>${escapeHtml(block.text)}</blockquote>`;
      case "code":
        return `<pre><code class="language-${escapeHtml(block.language ?? "text")}">${escapeHtml(block.text)}</code></pre>`;
      case "image":
        return block.image?.url
          ? `<figure><img src="${escapeHtml(block.image.url)}" alt="${escapeHtml(block.image.caption)}" /></figure>`
          : "";
      default:
        return "";
    }
  });

  return blocks.join("\n");
}
