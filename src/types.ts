export type SupportedBlockType =
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "paragraph"
  | "bulleted_list_item"
  | "numbered_list_item"
  | "quote"
  | "code"
  | "image"
  | "unsupported";

export interface ArticleImageAsset {
  blockId: string;
  url: string;
  caption: string;
  sourceType: "external" | "file";
}

export interface BlockNode {
  id: string;
  type: SupportedBlockType;
  text: string;
  language?: string;
  image?: ArticleImageAsset;
  children: BlockNode[];
}

export interface ReadyPost {
  pageId: string;
  title: string;
  slug: string;
  tags: string[];
  category: string;
  blocks: BlockNode[];
  promptSource: string;
  imageAssets: ArticleImageAsset[];
}

export interface ImageDecision {
  blockId: string;
  use: boolean;
  altText: string;
  reason: string;
}

export interface TransformedContent {
  title: string;
  seoDescription: string;
  hook: string;
  bodyMarkdown: string;
  bodyHtml: string;
  conclusion: string;
  xPostBody: string;
  hashtags: string[];
  thumbnailPrompt: string;
  thumbnailHeadline: string;
  imageDecisions: ImageDecision[];
}

export interface ThumbnailResult {
  path: string;
  prompt: string;
  mimeType: string;
}

export interface PublishResult {
  url: string;
  postId?: string;
}

export interface StructuredLog {
  title: string;
  date: string;
  todayWork: string;
  implementation: string;
  problems: string;
  resolution: string;
  next: string;
}

export interface AppConfig {
  projectRoot: string;
  dryRun: boolean;
  notion: {
    apiKey?: string;
    pageUrl?: string;
    pageId?: string;
    titleProperty: string;
    slugProperty: string;
    tagsProperty: string;
    categoryProperty: string;
  };
  gemini: {
    apiKey?: string;
    imageModel: string;
    thumbnailOutputDir: string;
    thumbnailAllowRetry: boolean;
  };
  tistory: {
    baseUrl?: string;
    newPostUrl?: string;
    authStatePath: string;
    headless: boolean;
    timeoutMs: number;
  };
  x: {
    appKey?: string;
    appSecret?: string;
    accessToken?: string;
    accessSecret?: string;
  };
}

export interface PipelineConfig extends AppConfig {
  notion: AppConfig["notion"] & {
    apiKey: string;
  };
  gemini: AppConfig["gemini"] & {
    apiKey: string;
  };
  tistory: AppConfig["tistory"] & {
    baseUrl: string;
    newPostUrl: string;
  };
  x: AppConfig["x"] & {
    appKey: string;
    appSecret: string;
    accessToken: string;
    accessSecret: string;
  };
}

export interface LoginConfig {
  projectRoot: string;
  baseUrl: string;
  authStatePath: string;
}
