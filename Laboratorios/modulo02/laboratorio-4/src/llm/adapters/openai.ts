import type OpenAI from "openai";
import { APIConnectionError, APIError } from "openai";
import type { Adapter, AdapterRequest, AdapterResponse, StopReason } from "../contract.js";
import { LlmError, isRetryableStatus } from "../errors.js";

/** Solo lo que usamos del SDK: así los tests pueden inyectar un cliente falso. */
export type OpenAIChatClient = Pick<OpenAI, "chat">;

function toStopReason(finishReason: string | null | undefined): StopReason {
  switch (finishReason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
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

export class OpenAIAdapter implements Adapter {
  constructor(private readonly client: OpenAIChatClient) {}

  async chat(request: AdapterRequest): Promise<AdapterResponse> {
    let completion;
    try {
      completion = await this.client.chat.completions.create({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
      });
    } catch (error) {
      throw translateError(error);
    }

    const choice = completion.choices[0];
    if (!choice) {
      // Respuesta vacía del destino: es un fallo suyo, otro destino puede responder.
      throw new LlmError("La respuesta no contiene ninguna opción (choices vacío)", true);
    }

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    return {
      text: choice.message.content ?? "",
      stopReason: toStopReason(choice.finish_reason),
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      model: completion.model,
    };
  }
}
