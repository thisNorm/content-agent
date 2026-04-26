/**
 * One-time repair script: fix expired Notion image URLs in Tistory posts 58-61.
 *
 * Strategy:
 * 1. Scan Notion source pages to find image blocks by their S3 storage UUID
 *    (The UUID embedded in the S3 presigned URL path is NOT the Notion block ID —
 *     we must scan pages and match by URL content)
 * 2. Retrieve fresh presigned URLs from the matching Notion blocks
 * 3. Download → base64 data URL
 * 4. Playwright: open each Tistory edit page, replace broken src, save
 *
 * Run:  npm run repair:images
 */

import { Client } from "@notionhq/client";
import { chromium, type Page } from "playwright";
import { loadConfig, requirePipelineConfig } from "./config/env";

const cfg = requirePipelineConfig(loadConfig());
const notion = new Client({ auth: cfg.notion.apiKey });

// Tistory post → S3 storage UUIDs embedded in the broken <img src>
const POST_S3_UUIDS: Record<number, string[]> = {
  58: ["bf57a54a-c4e1-46da-98c6-3d12677bddd0"],
  59: ["c685db7f-eb2a-4553-bf28-717e7b7d6b96"],
  60: ["28ec7286-c9fe-4eca-a736-3adcf1b4b9ee"],
  61: [
    "0fd0ba4c-c87a-49f4-b5f4-198b7138dcb1",
    "c1b99ec3-21fb-4b9b-a1eb-d33a39be9f8a",
    "1fd949df-01af-495c-81c1-a5462ca6f6f0",
    "fb2e808e-ceb2-4ad4-87e6-9a63a35c133e",
  ],
};

// Notion source pages for each post (user-provided)
const NOTION_PAGES: Record<number, string> = {
  58: "34a024cf-c911-80ac-af19-e53b08ebeb33",
  59: "34b024cf-c911-8036-bdc1-e58e3e6b5162",
  60: "34c024cf-c911-80c0-9170-de903399861e",
  61: "34e024cf-c911-80d4-a19b-c051e6cc3653",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Scan a Notion page (and nested children) for image blocks. Returns s3uuid → fresh URL map. */
async function scanPageForImages(
  pageId: string,
  targetUuids: Set<string>,
  depth = 0,
): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  if (depth > 4) return found;
  try {
    let cursor: string | undefined;
    let hasMore = true;
    while (hasMore) {
      const r = await notion.blocks.children.list({
        block_id: pageId,
        page_size: 100,
        start_cursor: cursor,
      });
      for (const b of r.results) {
        const block = b as Record<string, unknown>;
        if (block["type"] === "image") {
          const img = block["image"] as Record<string, Record<string, string>> | undefined;
          const imgType = (img?.["type"] as string | undefined) ?? "external";
          const url = img?.[imgType]?.["url"] ?? "";
          const s3uuid = url.match(/amazonaws\.com\/[^/]+\/([a-f0-9-]{36})\//)?.[1];
          if (s3uuid && targetUuids.has(s3uuid)) {
            found[s3uuid] = url;
          }
        }
        if ((block["has_children"] as boolean | undefined) && depth < 4) {
          const sub = await scanPageForImages(b.id, targetUuids, depth + 1);
          Object.assign(found, sub);
        }
      }
      hasMore = r.has_more;
      cursor = r.next_cursor ?? undefined;
    }
  } catch (err) {
    console.error(`  scan err (${pageId}): ${String(err).slice(0, 80)}`);
  }
  return found;
}

async function downloadToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const rawCt = res.headers.get("content-type") ?? "image/png";
    const ct = (rawCt.split(";")[0] ?? "image/png").trim();
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`    ${(buf.length / 1024).toFixed(0)} KB`);
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch (err) {
    console.error(`  ✗ Download failed: ${String(err)}`);
    return null;
  }
}

// ─── Playwright repair ────────────────────────────────────────────────────────

async function repairPost(
  page: Page,
  postId: number,
  replacements: Record<string, string>,
): Promise<void> {
  // Tistory edit URL: /manage/post/{id}  (NOT /manage/newpost?id=)
  const editUrl = `${cfg.tistory.baseUrl}/manage/post/${postId}`;
  console.log(`  → ${editUrl}`);

  await page.goto(editUrl, { waitUntil: "networkidle", timeout: 40_000 });

  if (page.url().includes("login")) {
    throw new Error("Session expired — run `npm run login:tistory` first.");
  }

  // Wait for TinyMCE to load the existing post content (async after page load)
  try {
    await page.waitForFunction(
      `(() => { const e = window.tinymce && window.tinymce.get('editor-tistory'); return e && e.getContent().length > 100; })()`,
      { timeout: 25_000, polling: 500 },
    );
  } catch {
    console.warn(`  ⚠ TinyMCE content not loaded within 25s for post ${postId}`);
  }

  // Replace broken Notion S3 src values with data URLs.
  // Pass replacements via window to avoid tsx/esbuild serialization issues with
  // page.evaluate() — esbuild wraps ALL functions (even arrows) with __name()
  // which doesn't exist in the browser context.
  await page.evaluate(
    `window.__repairReplacements = ${JSON.stringify(replacements)}`,
  );
  const result = await page.evaluate(`
    (() => {
      const reps = window.__repairReplacements || {};
      const replaceInHtml = (html, entries) => {
        let out = html, count = 0;
        for (const [uuid, dataUrl] of Object.entries(entries)) {
          const re = new RegExp(
            'https://prod-files-secure\\\\.s3\\\\.us-west-2\\\\.amazonaws\\\\.com/[^"]*' + uuid + '[^"]*',
            'g'
          );
          const before = out;
          out = out.replace(re, dataUrl);
          if (out !== before) count++;
        }
        return { html: out, count };
      };

      // Try TinyMCE
      const editor = window.tinymce && window.tinymce.get('editor-tistory');
      if (editor) {
        const { html, count } = replaceInHtml(editor.getContent(), reps);
        if (count > 0) { editor.setContent(html); editor.save(); editor.fire('change'); }
        return { method: 'tinymce', count };
      }

      // Fallback: contenteditable
      const ce = document.querySelector('[contenteditable="true"]');
      if (ce) {
        const { html, count } = replaceInHtml(ce.innerHTML, reps);
        if (count > 0) {
          ce.innerHTML = html;
          ce.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return { method: 'contenteditable', count };
      }

      return { method: 'not-found', count: 0 };
    })()
  `) as { method: string; count: number };

  console.log(`  Editor: ${result.method} | replaced: ${result.count}`);

  if (result.count === 0) {
    console.warn(`  ⚠ No images replaced — post ${postId} skipped`);
    return;
  }

  await page.waitForTimeout(1_000);

  // Save the post
  const saveBtn = page.locator('button:has-text("완료"), button:has-text("저장")').first();
  if ((await saveBtn.count()) > 0) {
    await saveBtn.click();
    await page.waitForTimeout(2_000);
    // Confirm publish modal if it appears
    const confirmBtn = page
      .locator('button:has-text("공개 발행"), button:has-text("확인")')
      .first();
    if ((await confirmBtn.count()) > 0) {
      await confirmBtn.click();
      await page.waitForTimeout(2_000);
    }
    console.log(`  ✓ Post ${postId} saved`);
  } else {
    console.warn(`  ⚠ Save button not found for post ${postId}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════");
  console.log("  Tistory Image Repair — Posts 58–61  ");
  console.log("═══════════════════════════════════════\n");

  // Step 1: Scan Notion pages to get fresh presigned URLs for each S3 UUID
  console.log("[ 1 / 2 ] Scanning Notion pages for images...\n");
  const s3UuidToDataUrl: Record<string, string> = {};

  for (const [postIdStr, s3Uuids] of Object.entries(POST_S3_UUIDS)) {
    const postId = Number(postIdStr);
    const pageId = NOTION_PAGES[postId];
    if (!pageId) { console.log(`Post ${postId}: no Notion page configured`); continue; }

    console.log(`Post ${postId} — scanning Notion page ${pageId}...`);
    const found = await scanPageForImages(pageId, new Set(s3Uuids));

    for (const s3uuid of s3Uuids) {
      const freshUrl = found[s3uuid];
      if (!freshUrl) { console.log(`  ✗ ${s3uuid} — not found in page`); continue; }
      process.stdout.write(`  ${s3uuid} — downloading... `);
      const dataUrl = await downloadToDataUrl(freshUrl);
      if (!dataUrl) { console.log("❌ download failed"); continue; }
      s3UuidToDataUrl[s3uuid] = dataUrl;
      console.log("✓");
    }
  }

  const fetched = Object.keys(s3UuidToDataUrl).length;
  const total = Object.values(POST_S3_UUIDS).flat().length;
  console.log(`\n  ${fetched} / ${total} images ready\n`);

  if (fetched === 0) {
    console.error("No images fetched. Aborting.");
    process.exit(1);
  }

  // Step 2: Edit Tistory posts via Playwright
  console.log("[ 2 / 2 ] Editing Tistory posts...\n");
  const browser = await chromium.launch({ headless: cfg.tistory.headless });

  try {
    const context = await browser.newContext({ storageState: cfg.tistory.authStatePath });
    const page = await context.newPage();
    page.on("dialog", (d) => d.dismiss().catch(() => undefined));

    for (const [postIdStr, s3Uuids] of Object.entries(POST_S3_UUIDS)) {
      const postId = Number(postIdStr);
      const relevant: Record<string, string> = {};
      for (const uuid of s3Uuids) {
        const dataUrl = s3UuidToDataUrl[uuid];
        if (dataUrl) relevant[uuid] = dataUrl;
      }
      if (Object.keys(relevant).length === 0) {
        console.log(`Post ${postId}: no images ready, skipping\n`);
        continue;
      }
      console.log(`Post ${postId} — ${Object.keys(relevant).length} image(s):`);
      await repairPost(page, postId, relevant);
      console.log();
    }
  } finally {
    await browser.close();
  }

  console.log("✅  Repair complete!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
