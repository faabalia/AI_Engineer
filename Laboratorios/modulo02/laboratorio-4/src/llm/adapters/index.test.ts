import { describe, it, expect, vi } from "vitest";
import { createAdapters, defaultFactories, type AdapterFactory } from "./index.js";
import { AnthropicAdapter } from "./anthropic.js";
import { OpenAIAdapter } from "./openai.js";
import type { LlmConfig } from "../config.js";
import type { Adapter } from "../contract.js";

const config: LlmConfig = {
  logical_models: {},
  destinations: {
    curso: { format: "openai", base_url_env: "OA_URL", api_key_env: "OA_KEY" },
    otro: { format: "anthropic", base_url_env: "AN_URL", api_key_env: "AN_KEY" },
  },
};

const env = {
  OA_URL: "https://oa.test/v1",
  OA_KEY: "oa-secret",
  AN_URL: "https://an.test",
  AN_KEY: "an-secret",
};

describe("createAdapters", () => {
  it("crea el adaptador que corresponde al formato de cada destino", () => {
    const adapters = createAdapters(config, env);

    expect(adapters.get("curso")).toBeInstanceOf(OpenAIAdapter);
    expect(adapters.get("otro")).toBeInstanceOf(AnthropicAdapter);
  });

  it("pasa a la fábrica la URL, la clave y el timeout", () => {
    const fake: Adapter = { chat: vi.fn() };
    const factory = vi.fn<AdapterFactory>().mockReturnValue(fake);

    const adapters = createAdapters(config, env, { openai: factory, anthropic: factory }, 5000);

    expect(factory).toHaveBeenCalledWith({ baseUrl: "https://oa.test/v1", apiKey: "oa-secret", timeoutMs: 5000 });
    expect(adapters.get("curso")).toBe(fake);
  });

  it.each(["OA_URL", "OA_KEY", "AN_URL", "AN_KEY"])("falla si falta %s, nombrándola", (missing) => {
    const incomplete = { ...env, [missing]: undefined };

    expect(() => createAdapters(config, incomplete)).toThrow(new RegExp(missing));
  });

  it("falla si una variable está vacía", () => {
    expect(() => createAdapters(config, { ...env, OA_KEY: "  " })).toThrow(/OA_KEY/);
  });

  it.each(["inventado", "constructor"])("falla con el formato desconocido %s", (format) => {
    const bad: LlmConfig = {
      logical_models: {},
      destinations: { x: { format, base_url_env: "OA_URL", api_key_env: "OA_KEY" } },
    };

    expect(() => createAdapters(bad, env)).toThrow(/Formato desconocido/);
  });

  it("soporta los formatos openai y anthropic por defecto", () => {
    expect(Object.keys(defaultFactories).sort()).toEqual(["anthropic", "openai"]);
  });
});
