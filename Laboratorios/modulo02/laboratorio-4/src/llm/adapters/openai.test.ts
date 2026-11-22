import { describe, it, expect, vi } from "vitest";
import { APIConnectionError, APIConnectionTimeoutError, APIError } from "openai";
import { OpenAIAdapter, type OpenAIChatClient } from "./openai.js";
import { LlmError } from "../errors.js";

const completion = (overrides: Record<string, unknown> = {}) => ({
  model: "fast-2025",
  choices: [{ message: { content: "hola" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  ...overrides,
});

function adapterWith(create: ReturnType<typeof vi.fn>) {
  const client = { chat: { completions: { create } } } as unknown as OpenAIChatClient;
  return new OpenAIAdapter(client);
}

const request = { model: "fast", messages: [{ role: "user" as const, content: "hi" }] };

describe("OpenAIAdapter", () => {
  it("traduce la petición del contrato a la API de OpenAI", async () => {
    const create = vi.fn().mockResolvedValue(completion());

    await adapterWith(create).chat({
      ...request,
      messages: [
        { role: "system", content: "sé breve" },
        { role: "user", content: "hi" },
      ],
      maxTokens: 100,
      temperature: 0.3,
    });

    expect(create).toHaveBeenCalledWith({
      model: "fast",
      messages: [
        { role: "system", content: "sé breve" },
        { role: "user", content: "hi" },
      ],
      max_tokens: 100,
      temperature: 0.3,
    });
  });

  it("traduce la respuesta al contrato", async () => {
    const response = await adapterWith(vi.fn().mockResolvedValue(completion())).chat(request);

    expect(response).toEqual({
      text: "hola",
      stopReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      model: "fast-2025",
    });
  });

  it.each([
    ["stop", "stop"],
    ["length", "length"],
    ["content_filter", "content_filter"],
    ["tool_calls", "other"],
    [null, "other"],
  ])("finish_reason %s -> %s", async (finish, expected) => {
    const create = vi
      .fn()
      .mockResolvedValue(completion({ choices: [{ message: { content: "x" }, finish_reason: finish }] }));

    expect((await adapterWith(create).chat(request)).stopReason).toBe(expected);
  });

  it("devuelve texto vacío si el contenido es null", async () => {
    const create = vi
      .fn()
      .mockResolvedValue(completion({ choices: [{ message: { content: null }, finish_reason: "stop" }] }));

    expect((await adapterWith(create).chat(request)).text).toBe("");
  });

  it("usa 0 tokens si el destino no informa del uso", async () => {
    const create = vi.fn().mockResolvedValue(completion({ usage: undefined }));

    expect((await adapterWith(create).chat(request)).usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });

  it("trata una respuesta sin choices como fallo pasajero", async () => {
    const create = vi.fn().mockResolvedValue(completion({ choices: [] }));

    await expect(adapterWith(create).chat(request)).rejects.toMatchObject({ retryable: true });
  });

  describe("errores", () => {
    const failWith = (error: unknown) => adapterWith(vi.fn().mockRejectedValue(error)).chat(request);

    it.each([429, 500, 503])("el estado %i es reintentable", async (status) => {
      const error = APIError.generate(status, {}, "fallo", new Headers());

      const thrown = await failWith(error).catch((e: unknown) => e);

      expect(thrown).toBeInstanceOf(LlmError);
      expect(thrown).toMatchObject({ retryable: true, status, cause: error });
    });

    it.each([400, 401, 404])("el estado %i NO es reintentable", async (status) => {
      const error = APIError.generate(status, {}, "fallo", new Headers());

      await expect(failWith(error)).rejects.toMatchObject({ retryable: false, status });
    });

    it("un error de conexión es reintentable", async () => {
      await expect(failWith(new APIConnectionError({ message: "caída" }))).rejects.toMatchObject({
        retryable: true,
      });
    });

    it("un timeout es reintentable", async () => {
      await expect(failWith(new APIConnectionTimeoutError())).rejects.toMatchObject({ retryable: true });
    });

    it("deja pasar tal cual los errores desconocidos", async () => {
      const bug = new TypeError("bug");

      await expect(failWith(bug)).rejects.toBe(bug);
    });
  });
});
