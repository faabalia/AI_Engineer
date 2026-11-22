import { LlmClient } from "./client.js";
import type { LlmConfig } from "./config.js";
import { createAdapters } from "./adapters/index.js";

export { LlmClient } from "./client.js";
export { loadConfig, parseConfig, type LlmConfig } from "./config.js";
export type { ChatRequest, ChatResponse, FailedAttempt, Message, Role, StopReason, Usage } from "./contract.js";
export { AllDestinationsFailedError, LlmError } from "./errors.js";

/**
 * Punto de entrada de la aplicación: arma el cliente a partir de la
 * configuración y las variables de entorno. Cargar el .env (dotenv) es cosa
 * del programa principal, no de esta librería.
 */
export function createLlmClient(config: LlmConfig, env: NodeJS.ProcessEnv = process.env): LlmClient {
  return new LlmClient(config, createAdapters(config, env));
}
