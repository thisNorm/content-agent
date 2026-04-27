/**
 * Manual post script: converts markdown to HTML and publishes to Tistory.
 * Usage: tsx src/post-manual.ts
 */
import fs from "fs";
import path from "path";
import { marked } from "marked";
import { publishToTistory } from "./publish-tistory";
import { loadConfig, requirePipelineConfig } from "./config/env";

const TITLE =
  "Kubernetes ConfigMap, Secret, Ingress 제대로 이해하기 — 앱이 뜨는 것과 운영 가능한 것은 다르다";

const TAGS = [
  "Kubernetes",
  "ConfigMap",
  "Secret",
  "Ingress",
  "k8s",
  "쿠버네티스",
  "DevOps",
];

const THUMBNAIL_PATH = path.resolve(
  __dirname,
  "../assets/thumbnails/ingress-cnfigmap-secret--20260427-174908.png",
);

const SLUG = "ingress-configmap-secret";

const MARKDOWN_PATH = path.resolve(__dirname, "../../post-content.md");

async function run(): Promise<void> {
  const config = requirePipelineConfig(loadConfig());

  const markdown = fs.readFileSync(MARKDOWN_PATH, "utf-8");
  const html = await marked.parse(markdown);

  console.log("Posting to Tistory...");
  const result = await publishToTistory(config, {
    title: TITLE,
    html,
    thumbnailPath: THUMBNAIL_PATH,
    slug: SLUG,
    tags: TAGS,
  });

  console.log("✅ Published:", result.url);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
