import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

import type { AppConfig, LoginConfig, PipelineConfig } from "../types";
import { invariant, resolveProjectPath } from "../utils";

dotenv.config();

const envSchema = z.object({
  DRY_RUN: z.string().optional(),
  NOTION_API_KEY: z.string().optional(),
  NOTION_PAGE_URL: z.string().optional(),
  NOTION_PAGE_ID: z.string().optional(),
  NOTION_TITLE_PROPERTY: z.string().default("Title"),
  NOTION_SLUG_PROPERTY: z.string().default("Slug"),
  NOTION_TAGS_PROPERTY: z.string().default("Tags"),
  NOTION_CATEGORY_PROPERTY: z.string().default("Category"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_IMAGE_MODEL: z.string().default("gemini-2.0-flash-preview-image-generation"),
  THUMBNAIL_OUTPUT_DIR: z.string().default("assets/thumbnails"),
  THUMBNAIL_ALLOW_RETRY: z.string().default("false"),
  TISTORY_BASE_URL: z.string().optional(),
  TISTORY_NEW_POST_URL: z.string().optional(),
  PLAYWRIGHT_AUTH_STATE_PATH: z.string().default("playwright/.auth/tistory.json"),
  PLAYWRIGHT_HEADLESS: z.string().default("true"),
  PLAYWRIGHT_TIMEOUT_MS: z.coerce.number().default(30000),
  X_APP_KEY: z.string().optional(),
  X_APP_SECRET: z.string().optional(),
  X_ACCESS_TOKEN: z.string().optional(),
  X_ACCESS_SECRET: z.string().optional(),
});

function parseBoolean(input: string | undefined, defaultValue: boolean): boolean {
  if (input === undefined) {
    return defaultValue;
  }
  return input.toLowerCase() === "true";
}

function resolveTistoryNewPostUrl(baseUrl?: string, explicitUrl?: string): string | undefined {
  if (explicitUrl) {
    return explicitUrl;
  }
  if (!baseUrl) {
    return undefined;
  }
  return new URL("/manage/newpost", baseUrl).toString();
}

export function loadConfig(projectRoot = process.cwd()): AppConfig {
  const env = envSchema.parse(process.env);

  return {
    projectRoot,
    dryRun: parseBoolean(env.DRY_RUN, true),
    notion: {
      apiKey: env.NOTION_API_KEY,
      pageUrl: env.NOTION_PAGE_URL,
      pageId: env.NOTION_PAGE_ID,
      titleProperty: env.NOTION_TITLE_PROPERTY,
      slugProperty: env.NOTION_SLUG_PROPERTY,
      tagsProperty: env.NOTION_TAGS_PROPERTY,
      categoryProperty: env.NOTION_CATEGORY_PROPERTY,
    },
    gemini: {
      apiKey: env.GEMINI_API_KEY,
      imageModel: env.GEMINI_IMAGE_MODEL,
      thumbnailOutputDir: resolveProjectPath(projectRoot, env.THUMBNAIL_OUTPUT_DIR),
      thumbnailAllowRetry: parseBoolean(env.THUMBNAIL_ALLOW_RETRY, false),
    },
    tistory: {
      baseUrl: env.TISTORY_BASE_URL,
      newPostUrl: resolveTistoryNewPostUrl(env.TISTORY_BASE_URL, env.TISTORY_NEW_POST_URL),
      authStatePath: resolveProjectPath(projectRoot, env.PLAYWRIGHT_AUTH_STATE_PATH),
      headless: parseBoolean(env.PLAYWRIGHT_HEADLESS, true),
      timeoutMs: env.PLAYWRIGHT_TIMEOUT_MS,
    },
    x: {
      appKey: env.X_APP_KEY,
      appSecret: env.X_APP_SECRET,
      accessToken: env.X_ACCESS_TOKEN,
      accessSecret: env.X_ACCESS_SECRET,
    },
  };
}

export function requirePipelineConfig(config: AppConfig): PipelineConfig {
  invariant(config.notion.apiKey, "NOTION_API_KEY is required.");
  invariant(config.gemini.apiKey, "GEMINI_API_KEY is required.");
  invariant(config.tistory.baseUrl, "TISTORY_BASE_URL is required.");
  invariant(config.tistory.newPostUrl, "TISTORY_NEW_POST_URL or TISTORY_BASE_URL is required.");
  invariant(config.x.appKey, "X_APP_KEY is required.");
  invariant(config.x.appSecret, "X_APP_SECRET is required.");
  invariant(config.x.accessToken, "X_ACCESS_TOKEN is required.");
  invariant(config.x.accessSecret, "X_ACCESS_SECRET is required.");

  return {
    ...config,
    notion: {
      ...config.notion,
      apiKey: config.notion.apiKey,
    },
    gemini: {
      ...config.gemini,
      apiKey: config.gemini.apiKey,
    },
    tistory: {
      ...config.tistory,
      baseUrl: config.tistory.baseUrl,
      newPostUrl: config.tistory.newPostUrl,
    },
    x: {
      ...config.x,
      appKey: config.x.appKey,
      appSecret: config.x.appSecret,
      accessToken: config.x.accessToken,
      accessSecret: config.x.accessSecret,
    },
  };
}

export function requireLoginConfig(config: AppConfig): LoginConfig {
  invariant(config.tistory.baseUrl, "TISTORY_BASE_URL is required for login:tistory.");

  return {
    projectRoot: config.projectRoot,
    baseUrl: config.tistory.baseUrl,
    authStatePath: path.resolve(config.tistory.authStatePath),
  };
}
