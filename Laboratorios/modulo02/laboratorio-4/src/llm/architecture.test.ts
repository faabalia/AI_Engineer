import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = import.meta.dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

describe("arquitectura: la aplicación no depende de ningún proveedor", () => {
  const sdkImport = /from\s+["'](openai|@anthropic-ai\/sdk)["']/;

  it("solo los adaptadores importan los SDK de OpenAI o Anthropic", () => {
    const offenders = sourceFiles(root)
      .filter((file) => !relative(root, file).startsWith("adapters"))
      .filter((file) => sdkImport.test(readFileSync(file, "utf-8")))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });

  it("el contrato no menciona a ningún proveedor", () => {
    const contract = readFileSync(join(root, "contract.ts"), "utf-8");

    expect(contract).not.toMatch(/openai|anthropic|claude|gpt/i);
  });
});
