import { describe, it, expect, vi } from "vitest";
import { APIConnectionError, APIConnectionTimeoutError, APIError } from "@anthropic-ai/sdk";
import { AnthropicAdapter, type AnthropicMessagesClient } from "./anthropic.js";
import { LlmError } from "../errors.js";

const message = (overrides: Record<string, unknown> = {}) => ({
  model: "fast-2025",
  content: [{ type: "text", text: "hola" }],
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 5 },
  ...overrides,
});

function adapterWith(create: ReturnType<typeof vi.fn>) {
  const client = { messages: { create } } as unknown as AnthropicMessagesClient;
  return new AnthropicAdapter(client);
}

const request = { model: "fast", messages: [{ role: "user" as const, content: "hi" }] };

describe("AnthropicAdapter", () => {
  it("traduce la petición: system aparte y max_tokens por defecto", async () => {
    const create = vi.fn().mockResolvedValue(message());

    await adapterWith(create).chat({
      model: "fast",
      messages: [
        { role: "system", content: "sé breve" },
        { role: "user", content: "hi" },
        { role: "assistant", content: "hola" },
        { role: "user", content: "otra" },
      ],
    });

    expect(create).toHaveBeenCalledWith({
      model: "fast",
      max_tokens: 1024,
      system: "sé breve",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hola" },
        { role: "user", content: "otra" },
      ],
    });
  });

  it("une varios mensajes system y respeta maxTokens", async () => {
    const create = vi.fn().mockResolvedValue(message());

    await adapterWith(create).chat({
      model: "fast",
      maxTokens: 77,
      messages: [
        { role: "system", content: "uno" },
        { role: "system", content: "dos" },
        { role: "user", content: "hi" },
      ],
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 77, system: "uno\n\ndos" }));
  });

  it("no envía system si no hay mensajes system", async () => {
    const create = vi.fn().mockResolvedValue(message());

    await adapterWith(create).chat(request);

    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("system", expect.anything());
  });

  it("no envía temperature: la API actual de Anthropic ya no la admite", async () => {
    const create = vi.fn().mockResolvedValue(message());

    await adapterWith(create).chat({ ...request, temperature: 0.3 });

    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("temperature");
  });

  it("traduce la respuesta al contrato", async () => {
    const response = await adapterWith(vi.fn().mockResolvedValue(message())).chat(request);

    expect(response).toEqual({
      text: "hola",
      stopReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      model: "fast-2025",
    });
  });

  it("une los bloques de texto e ignora los demás", async () => {
    const create = vi.fn().mockResolvedValue(
      message({
        content: [
          { type: "text", text: "uno " },
          { type: "thinking", thinking: "..." },
          { type: "text", text: "dos" },
        ],
      }),
    );

    expect((await adapterWith(create).chat(request)).text).toBe("uno dos");
  });

  it.each([
    ["end_turn", "stop"],
    ["stop_sequence", "stop"],
    ["max_tokens", "length"],
    ["refusal", "content_filter"],
    ["tool_use", "other"],
    [null, "other"],
  ])("stop_reason %s -> %s", async (reason, expected) => {
    const create = vi.fn().mockResolvedValue(message({ stop_reason: reason }));

    expect((await adapterWith(create).chat(request)).stopReason).toBe(expected);
  });

  describe("errores", () => {
    const failWith = (error: unknown) => adapterWith(vi.fn().mockRejectedValue(error)).chat(request);

    it.each([429, 500, 529])("el estado %i es reintentable", async (status) => {
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
