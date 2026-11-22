import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { LlmClient, createLlmClient, loadConfig } from "./index.js";

const config = loadConfig(resolve(import.meta.dirname, "../../config.json"));

const env = {
  OPENAI_BASE_URL: "https://oa.test/v1",
  OPENAI_API_KEY: "oa-secret",
  ANTHROPIC_BASE_URL: "https://an.test",
  ANTHROPIC_API_KEY: "an-secret",
};

describe("createLlmClient", () => {
  it("construye un cliente con el config.json real y el entorno dado", () => {
    expect(createLlmClient(config, env)).toBeInstanceOf(LlmClient);
  });

  it("falla pronto si falta una variable de entorno", () => {
    expect(() => createLlmClient(config, { ...env, ANTHROPIC_API_KEY: undefined })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });
});
