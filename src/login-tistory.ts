import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { chromium } from "playwright";

import { loadConfig, requireLoginConfig } from "./config/env";
import { ensureDir } from "./utils";

async function main(): Promise<void> {
  const config = requireLoginConfig(loadConfig());
  const loginUrl = `https://www.tistory.com/auth/login?redirectUrl=${encodeURIComponent(`${config.baseUrl}/manage`)}`;

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  console.log("브라우저에서 티스토리 관리자 로그인을 끝내고 관리 화면까지 진입하세요.");

  const rl = readline.createInterface({ input, output });
  await rl.question("로그인이 끝났으면 Enter를 눌러 storageState를 저장합니다. ");
  rl.close();

  await ensureDir(config.authStatePath.replace(/\/[^/]+$/, ""));
  await context.storageState({ path: config.authStatePath });
  await browser.close();

  console.log(`저장 완료: ${config.authStatePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
