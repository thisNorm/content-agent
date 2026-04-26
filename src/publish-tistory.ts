import { chromium, type Locator, type Page } from "playwright";

import { TISTORY_SELECTORS } from "./config/selectors";
import type { PipelineConfig, PublishResult } from "./types";
import { fileExists, invariant } from "./utils";

async function firstVisibleLocator(page: Page, selectors: readonly string[]): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout: 2000 });
      return locator;
    } catch {
      continue;
    }
  }
  return null;
}

async function firstAttachedLocator(page: Page, selectors: readonly string[]): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      return locator;
    }
  }
  return null;
}

async function clickIfVisible(page: Page, selectors: readonly string[]): Promise<boolean> {
  const locator = await firstVisibleLocator(page, selectors);
  if (!locator) {
    return false;
  }
  await locator.click();
  return true;
}

async function setEditorContent(locator: Locator, html: string): Promise<void> {
  const tagName = await locator.evaluate((node) => node.tagName.toLowerCase());

  if (tagName === "textarea" || tagName === "input") {
    await locator.evaluate((node, value) => {
      const element = node as HTMLTextAreaElement | HTMLInputElement;
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, html);
    return;
  }

  await locator.evaluate((node, value) => {
    const element = node as HTMLElement;
    element.innerHTML = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, html);
}

async function setTistoryEditorContent(page: Page, html: string): Promise<void> {
  const usedTinyMce = await page.evaluate((value) => {
    const tinyMce = (globalThis as typeof globalThis & {
      tinymce?: { get: (id: string) => {
        setContent: (content: string) => void;
        save: () => void;
        fire: (event: string) => void;
        getBody: () => HTMLElement | null;
      } | undefined };
    }).tinymce;
    const editor = tinyMce?.get("editor-tistory");
    if (!editor) {
      return false;
    }

    editor.setContent(value);
    editor.save();
    editor.fire("change");
    editor.getBody()?.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, html);

  if (usedTinyMce) {
    return;
  }

  const editor =
    (await firstVisibleLocator(page, TISTORY_SELECTORS.editorRoots)) ??
    (await firstAttachedLocator(page, TISTORY_SELECTORS.editorRoots));
  invariant(editor, "Could not find a Tistory editor area.");
  await setEditorContent(editor, html);
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))].slice(0, 10);
}

async function setTags(page: Page, tags: string[]): Promise<void> {
  const normalizedTags = normalizeTags(tags);
  if (normalizedTags.length === 0) {
    return;
  }

  const tagInput = await firstVisibleLocator(page, TISTORY_SELECTORS.tagInputs);
  if (!tagInput) {
    return;
  }

  await tagInput.click();
  await tagInput.fill("");

  for (const tag of normalizedTags) {
    await tagInput.fill(tag);
    await tagInput.press("Enter");
  }
}

async function setRepresentativeImage(page: Page, thumbnailPath: string): Promise<void> {
  const existingDeleteButton = page.locator(".ReactModalPortal .box_thumb .ico_delete").first();
  if ((await existingDeleteButton.count()) > 0) {
    await existingDeleteButton.click({ force: true });
    await page.waitForTimeout(500);
  }

  const modalThumbnailInput =
    (await firstVisibleLocator(page, TISTORY_SELECTORS.modalThumbnailInputs)) ??
    (await firstAttachedLocator(page, TISTORY_SELECTORS.modalThumbnailInputs));

  if (!modalThumbnailInput) {
    return;
  }

  await modalThumbnailInput.setInputFiles(thumbnailPath);
  await page.waitForTimeout(1500);
}

export async function publishToTistory(
  config: PipelineConfig,
  payload: {
    title: string;
    html: string;
    thumbnailPath: string;
    slug: string;
    tags: string[];
  },
): Promise<PublishResult> {
  const hasThumbnail = await fileExists(payload.thumbnailPath);
  if (!hasThumbnail) {
    throw new Error(`Thumbnail file does not exist: ${payload.thumbnailPath}`);
  }

  const authStateExists = await fileExists(config.tistory.authStatePath);
  if (!authStateExists) {
    throw new Error(
      `Playwright auth state not found at ${config.tistory.authStatePath}. Run "npm run login:tistory" first.`,
    );
  }

  if (config.dryRun) {
    return {
      url: `${config.tistory.baseUrl}/dry-run/${payload.slug}`,
    };
  }

  const browser = await chromium.launch({ headless: config.tistory.headless });
  try {
    const context = await browser.newContext({
      storageState: config.tistory.authStatePath,
    });
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.dismiss().catch(() => undefined));

    await page.goto(config.tistory.newPostUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.tistory.timeoutMs,
    });

    if (page.url().includes("login")) {
      throw new Error("Tistory session is not authenticated. Refresh the storageState.");
    }

    await clickIfVisible(page, TISTORY_SELECTORS.closeButtons);

    const titleInput = await firstVisibleLocator(page, TISTORY_SELECTORS.titleInputs);
    invariant(titleInput, "Could not find a Tistory title input.");
    await titleInput.fill(payload.title);

    await setTistoryEditorContent(page, payload.html);

    await setTags(page, payload.tags);

    const publishClicked = await clickIfVisible(page, TISTORY_SELECTORS.publishButtons);
    if (!publishClicked) {
      throw new Error("Could not find the Tistory publish button.");
    }

    await setRepresentativeImage(page, payload.thumbnailPath);

    await clickIfVisible(page, TISTORY_SELECTORS.confirmPublishButtons);

    try {
      await page.waitForURL((url) => !url.toString().includes("/manage/newpost"), {
        timeout: config.tistory.timeoutMs,
      });
    } catch {
      // Fall through and use the current URL if the editor keeps the same route.
    }

    const finalUrl = page.url();
    return { url: finalUrl };
  } finally {
    await browser.close();
  }
}
