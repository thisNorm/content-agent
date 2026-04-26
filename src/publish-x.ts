import { TwitterApi } from "twitter-api-v2";

import { X_MAX_LENGTH } from "./config/x";
import type { PipelineConfig, PublishResult } from "./types";
import { dedupe, trimToLength } from "./utils";

export function buildXPost(body: string, url: string, hashtags: string[]): string {
  const tags = dedupe(
    hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag.replace(/^#/, "")}`)),
  ).slice(0, 3);

  const suffix = [url, tags.join(" ")].filter(Boolean).join("\n");
  const availableForBody = X_MAX_LENGTH - suffix.length - 2;
  const safeBody = trimToLength(body.trim(), Math.max(0, availableForBody));

  return [safeBody, suffix].filter(Boolean).join("\n");
}

export async function publishToX(
  config: PipelineConfig,
  tweetText: string,
): Promise<PublishResult> {
  if (tweetText.length > X_MAX_LENGTH) {
    throw new Error(`X post exceeds ${X_MAX_LENGTH} characters.`);
  }

  if (config.dryRun) {
    return {
      url: "https://x.com/dry-run/status/0",
      postId: "dry-run",
    };
  }

  const client = new TwitterApi({
    appKey: config.x.appKey,
    appSecret: config.x.appSecret,
    accessToken: config.x.accessToken,
    accessSecret: config.x.accessSecret,
  });

  const response = await client.v2.tweet(tweetText);
  const postId = response.data.id;

  return {
    url: `https://x.com/i/web/status/${postId}`,
    postId,
  };
}
