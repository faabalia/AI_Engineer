import type Anthropic from "@anthropic-ai/sdk";
import { APIConnectionError, APIError } from "@anthropic-ai/sdk";
import type { Adapter, AdapterRequest, AdapterResponse, StopReason } from "../contract.js";
import { LlmError, isRetryableStatus } from "../errors.js";

/** Solo lo que usamos del SDK: así los tests pueden inyectar un cliente falso. */
export type AnthropicMessagesClient = Pick<Anthropic, "messages">;

/** Anthropic obliga a indicar max_tokens; nuestro contrato lo deja opcional. */
const DEFAULT_MAX_TOKENS = 1024;

function toStopReason(stopReason: string | null | undefined): StopReason {
  switch (stopReason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "refusal":
      return "content_filter";
    default:
      return "other";
  }
}

/** Convierte los errores del SDK en LlmError; lo que no reconoce lo deja pasar. */
function translateError(error: unknown): unknown {
  // Los timeouts son un APIConnectionError: siempre pasajeros.
  if (error instanceof APIConnectionError) {
    return new LlmError(error.message, true, undefined, { cause: error });
  }
  if (error instanceof APIError && error.status !== undefined) {
    return new LlmError(error.message, isRetryableStatus(error.status), error.status, { cause: error });
  }
  return error;
}

export class AnthropicAdapter implements Adapter {
  constructor(private readonly client: AnthropicMessagesClient) {}

  async chat(request: AdapterRequest): Promise<AdapterResponse> {
    // Anthropic no admite mensajes "system" en la lista: van en un campo aparte.
    const system = request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const messages = request.messages.flatMap((m) =>
      m.role === "system" ? [] : [{ role: m.role, content: m.content }],
    );

    let message;
    try {
      message = await this.client.messages.create({
        model: request.model,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages,
        system: system === "" ? undefined : system,
        // `temperature` se ignora a propósito: desde la versión de API 2026-10-21
        // Anthropic ya no la admite (el SDK 1.x no la tiene y la API responde 400).
      });
    } catch (error) {
      throw translateError(error);
    }

    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    return {
      text: message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join(""),
      stopReason: toStopReason(message.stop_reason),
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      model: message.model,
    };
  }
}
