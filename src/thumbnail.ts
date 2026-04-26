import fs from "node:fs/promises";
import path from "node:path";

import type { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

import { THUMBNAIL_STYLE_GUIDE } from "./config/gemini";
import type { ThumbnailResult } from "./types";
import { generateImage } from "./ai";
import { ensureDir, retry, sanitizeFileName, timestampCompact } from "./utils";

const THUMBNAIL_WIDTH = 1280;
const THUMBNAIL_HEIGHT = 720;

function buildThumbnailPrompt(input: string, headline: string): string {
  return `
${input}

[스타일 규칙]
${THUMBNAIL_STYLE_GUIDE}

[후처리용 제목]
${headline}

[중요]
- 이미지 내부에는 읽을 수 있는 텍스트를 넣지 말 것
- 한글, 영문, 숫자, 로고, 워터마크를 그리지 말 것
- 후처리에서 제목을 합성할 수 있도록 중앙 하단에 적당한 여백을 남길 것
`.trim();
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function splitHeadline(headline: string, maxLineLength = 10): string[] {
  const normalized = headline.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return ["Developer Notes"];
  }

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLineLength || current === "") {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  const firstLine = lines.at(0);
  if (lines.length === 1 && firstLine && firstLine.length > maxLineLength) {
    return [
      firstLine.slice(0, maxLineLength),
      firstLine.slice(maxLineLength, maxLineLength * 2),
      firstLine.slice(maxLineLength * 2),
    ].filter(Boolean);
  }

  return lines.slice(0, 3);
}

function buildOverlaySvg(headline: string): Buffer {
  const lines = splitHeadline(headline);
  const fontSize = lines.length >= 3 ? 78 : 92;
  const lineHeight = fontSize + 14;
  const firstY = THUMBNAIL_HEIGHT - 170 - lineHeight * (lines.length - 1);
  const accentIndex = lines.length > 1 ? lines.length - 1 : 0;

  const textSvg = lines
    .map((line, index) => {
      const fill = index === accentIndex ? "#ffe14a" : "#ffffff";
      const y = firstY + index * lineHeight;
      return `<text x="76" y="${y}" fill="${fill}" stroke="rgba(8,15,37,0.28)" stroke-width="10" paint-order="stroke">${escapeXml(line)}</text>`;
    })
    .join("");

  const svg = `
  <svg width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" viewBox="0 0 ${THUMBNAIL_WIDTH} ${THUMBNAIL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(10,37,64,0.02)" />
        <stop offset="46%" stop-color="rgba(10,37,64,0.08)" />
        <stop offset="100%" stop-color="rgba(6,24,48,0.72)" />
      </linearGradient>
      <linearGradient id="badge" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#1677ff" />
        <stop offset="100%" stop-color="#3aa6ff" />
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="rgba(0,0,0,0.55)" />
      </filter>
    </defs>
    <rect width="1280" height="720" fill="url(#shade)" />
    <rect x="64" y="58" width="300" height="58" rx="29" fill="url(#badge)" opacity="0.96" />
    <text
      x="214"
      y="95"
      text-anchor="middle"
      fill="#ffffff"
      font-family="Apple SD Gothic Neo, Pretendard, Noto Sans KR, sans-serif"
      font-size="28"
      font-weight="800"
      letter-spacing="0.4"
    >초보 개발자 가이드</text>
    <g
      font-family="Apple SD Gothic Neo, Pretendard, Noto Sans KR, sans-serif"
      font-size="${fontSize}"
      font-weight="800"
      filter="url(#shadow)"
    >${textSvg}</g>
  </svg>
  `.trim();

  return Buffer.from(svg);
}

async function composeThumbnail(background: Buffer, headline: string): Promise<Buffer> {
  return sharp(background)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: "cover" })
    .composite([{ input: buildOverlaySvg(headline) }])
    .png()
    .toBuffer();
}

export async function createThumbnail(
  ai: GoogleGenAI,
  config: {
    model: string;
    outputDir: string;
    allowRetry: boolean;
  },
  payload: {
    slug: string;
    prompt: string;
    headline: string;
  },
): Promise<ThumbnailResult> {
  await ensureDir(config.outputDir);

  const finalPrompt = buildThumbnailPrompt(payload.prompt, payload.headline);
  const attempts = config.allowRetry ? 2 : 1;

  return retry("thumbnail generation", attempts, async () => {
    const result = await generateImage({
      ai,
      model: config.model,
      prompt: finalPrompt,
    });

    const fileName = `${sanitizeFileName(payload.slug)}--${timestampCompact()}.png`;
    const filePath = path.join(config.outputDir, fileName);
    const composed = await composeThumbnail(result.bytes, payload.headline);

    await fs.writeFile(filePath, composed);

    return {
      path: filePath,
      prompt: finalPrompt,
      mimeType: "image/png",
    };
  });
}
