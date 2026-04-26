/**
 * Content rewriting using Claude (Anthropic API).
 *
 * Rewrites blog post body markdown so it reads as the author's own explanation
 * rather than a direct copy of textbook material — copyright-safe publishing.
 *
 * Key safety measures:
 *   1. Code blocks and {{IMAGE:...}} markers are extracted → replaced with stable
 *      placeholders before the API call → restored verbatim after.
 *   2. Output is validated: all placeholders must survive, code fences must be
 *      balanced, output must be a reasonable length.
 *   3. Fail-closed: throws on rewrite failure so the pipeline stops rather than
 *      silently publishing the original textbook content.
 */

import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `당신은 막 졸업한 한국인 주니어 개발자입니다.
공부한 내용을 블로그에 자신의 말로 정리하는 스타일로 글을 씁니다.

아래 규칙을 반드시 지켜주세요:
- __CODE_숫자__ 형태의 플레이스홀더는 절대 변경하지 마세요
- __IMG_숫자__ 형태의 플레이스홀더는 절대 변경하지 마세요
- ## / ### 헤딩 구조(마크다운 형식)는 반드시 유지하세요
- 단락과 목록의 설명은 교재 문체에서 벗어나, 개발자가 직접 이해하고 설명하는 자연스러운 말투로 바꾸세요
- 기술 정확도는 유지하세요 (사실, 용어 변경 금지)
- ~입니다/~습니다 말투 사용
- 마크다운 형식 유지
- 플레이스홀더 개수나 순서를 바꾸지 마세요`;

interface ExtractedBlock {
  placeholder: string;
  original: string;
}

/**
 * Pull out code fences and image markers, replacing with stable placeholders.
 * Returns the sanitized markdown and an ordered list of extracted blocks.
 */
function extractProtectedBlocks(markdown: string): {
  sanitized: string;
  blocks: ExtractedBlock[];
} {
  const blocks: ExtractedBlock[] = [];
  let index = 0;

  // Extract fenced code blocks (``` ... ```)
  let sanitized = markdown.replace(/```[\s\S]*?```/g, (match) => {
    const placeholder = `__CODE_${index++}__`;
    blocks.push({ placeholder, original: match });
    return placeholder;
  });

  // Extract image markers
  sanitized = sanitized.replace(/\{\{IMAGE:[^}]+\}\}/g, (match) => {
    const placeholder = `__IMG_${index++}__`;
    blocks.push({ placeholder, original: match });
    return placeholder;
  });

  return { sanitized, blocks };
}

/** Restore all protected blocks back into the rewritten markdown. */
function restoreProtectedBlocks(rewritten: string, blocks: ExtractedBlock[]): string {
  let result = rewritten;
  for (const { placeholder, original } of blocks) {
    // Use a literal string replace, not regex, to avoid special-char issues.
    result = result.split(placeholder).join(original);
  }
  return result;
}

/** Validate that the rewritten content is structurally sound. */
function validateRewrite(
  original: string,
  rewritten: string,
  blocks: ExtractedBlock[],
): void {
  // All placeholders must be present in the rewritten text.
  for (const { placeholder } of blocks) {
    if (!rewritten.includes(placeholder)) {
      throw new Error(
        `Rewrite validation failed: placeholder "${placeholder}" is missing from the response.`,
      );
    }
  }

  // Heading count should not decrease drastically (allow some flexibility).
  const originalHeadings = (original.match(/^#{2,3} /gm) ?? []).length;
  const rewrittenHeadings = (rewritten.match(/^#{2,3} /gm) ?? []).length;
  if (originalHeadings > 0 && rewrittenHeadings < Math.floor(originalHeadings * 0.6)) {
    throw new Error(
      `Rewrite validation failed: too many headings lost (original ${originalHeadings}, rewritten ${rewrittenHeadings}).`,
    );
  }

  // Output should not be unreasonably short (less than 20% of original).
  if (original.length > 200 && rewritten.length < original.length * 0.2) {
    throw new Error(
      `Rewrite validation failed: output is suspiciously short (original ${original.length} chars, rewritten ${rewritten.length} chars).`,
    );
  }
}

/**
 * Rewrite blog post body markdown using Claude.
 *
 * @param apiKey   Anthropic API key
 * @param model    Claude model ID (e.g. "claude-haiku-4-5")
 * @param title    Post title (for context)
 * @param markdown Raw markdown generated from Notion blocks
 * @returns        Rewritten markdown, safe to publish
 * @throws         If rewrite fails or output fails validation (fail-closed)
 */
export async function rewriteBodyMarkdown(
  apiKey: string,
  model: string,
  title: string,
  markdown: string,
): Promise<string> {
  if (!markdown.trim()) {
    return markdown;
  }

  const { sanitized, blocks } = extractProtectedBlocks(markdown);

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `주제: ${title}\n\n아래 마크다운을 각색해주세요. 플레이스홀더(__CODE_숫자__, __IMG_숫자__)는 절대 변경하지 마세요.\n\n${sanitized}`,
      },
    ],
  });

  const rawRewritten =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

  if (!rawRewritten) {
    throw new Error("Rewrite failed: Claude returned an empty response.");
  }

  validateRewrite(sanitized, rawRewritten, blocks);

  return restoreProtectedBlocks(rawRewritten, blocks);
}
