import type { ArticleImageAsset, ImageDecision } from "./types";
import { escapeHtml } from "./utils";

function buildFigureHtml(asset: ArticleImageAsset, altText: string): string {
  const alt = altText.trim() || asset.caption || "본문 관련 이미지";
  const caption = asset.caption.trim();

  return [
    `<figure class="notion-image">`,
    `  <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(alt)}" />`,
    caption ? `  <figcaption>${escapeHtml(caption)}</figcaption>` : "",
    `</figure>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function injectSelectedImages(
  bodyHtml: string,
  imageAssets: ArticleImageAsset[],
  imageDecisions: ImageDecision[],
): string {
  const assetMap = new Map(imageAssets.map((asset) => [asset.blockId, asset]));
  let finalHtml = bodyHtml;
  const deferredFigures: string[] = [];

  for (const decision of imageDecisions) {
    const marker = `{{IMAGE:${decision.blockId}}}`;
    const asset = assetMap.get(decision.blockId);

    if (!decision.use || !asset) {
      finalHtml = finalHtml.replaceAll(marker, "");
      continue;
    }

    const figureHtml = buildFigureHtml(asset, decision.altText);
    if (finalHtml.includes(marker)) {
      finalHtml = finalHtml.replaceAll(marker, figureHtml);
    } else {
      deferredFigures.push(figureHtml);
    }
  }

  finalHtml = finalHtml.replace(/\{\{IMAGE:[^}]+\}\}/g, "");

  if (deferredFigures.length > 0) {
    finalHtml = `${finalHtml}\n\n${deferredFigures.join("\n\n")}`.trim();
  }

  return finalHtml;
}
