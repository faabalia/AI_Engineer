import type { Adapter, ChatRequest, ChatResponse } from "./contract.js";
import type { LlmConfig } from "./config.js";
import { AllDestinationsFailedError, LlmError, type Attempt } from "./errors.js";

/**
 * Cliente que ve la aplicación. Resuelve el modelo lógico a su lista de
 * destinos y los prueba en orden. No conoce ningún proveedor: solo habla con
 * adaptadores a través del contrato.
 */
export class LlmClient {
  constructor(
    private readonly config: LlmConfig,
    private readonly adapters: ReadonlyMap<string, Adapter>,
  ) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const targets = Object.hasOwn(this.config.logical_models, request.model)
      ? this.config.logical_models[request.model]
      : undefined;
    if (!targets) {
      throw new LlmError(`Modelo lógico desconocido: "${request.model}"`, false);
    }

    const attempts: Attempt[] = [];
    for (const target of targets) {
      const adapter = this.adapters.get(target.destination);
      if (!adapter) {
        throw new Error(`No hay adaptador para el destino "${target.destination}"`);
      }

      try {
        const response = await adapter.chat({
          model: target.model,
          messages: request.messages,
          maxTokens: request.maxTokens,
          temperature: request.temperature,
        });
        return {
          ...response,
          destination: target.destination,
          attempts: attempts.map(({ destination, model, error }) => ({
            destination,
            model,
            status: error.status,
            message: error.message,
          })),
        };
      } catch (error) {
        // Solo los fallos pasajeros pasan al siguiente destino. Un 400 (o un
        // error de programación) fallaría igual en todos: se propaga ya.
        if (!(error instanceof LlmError) || !error.retryable) throw error;
        attempts.push({ destination: target.destination, model: target.model, error });
      }
    }

    throw new AllDestinationsFailedError(request.model, attempts);
  }
}
