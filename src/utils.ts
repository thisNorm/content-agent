import fs from "node:fs/promises";
import path from "node:path";

export function invariant<T>(
  value: T | null | undefined | "",
  message: string,
): asserts value is T {
  if (value === null || value === undefined || value === "") {
    throw new Error(message);
  }
}

export async function ensureDir(targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
}

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeFileName(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function chunkText(input: string, size = 1800): string[] {
  if (!input.trim()) {
    return [];
  }

  const chunks: string[] = [];
  for (let index = 0; index < input.length; index += size) {
    chunks.push(input.slice(index, index + size));
  }

  return chunks;
}

export function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function timestampCompact(): string {
  const date = new Date();
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ];

  return parts.join("");
}

export function trimToLength(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export async function retry<T>(
  label: string,
  attempts: number,
  work: (attempt: number) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      console.warn(`[retry] ${label} failed on attempt ${attempt}: ${String(error)}`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function resolveProjectPath(projectRoot: string, target: string): string {
  return path.isAbsolute(target) ? target : path.join(projectRoot, target);
}

export function mimeTypeToExtension(mimeType: string): string {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "bin";
}
