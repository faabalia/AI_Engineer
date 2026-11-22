import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { LlmConfig } from "../config.js";
import type { Adapter } from "../contract.js";
import { AnthropicAdapter } from "./anthropic.js";
import { OpenAIAdapter } from "./openai.js";

export interface AdapterOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

export type AdapterFactory = (options: AdapterOptions) => Adapter;

/**
 * Un formato = una fábrica. Para soportar un formato nuevo se escribe su
 * adaptador y se añade una línea aquí; el cliente no cambia.
 *
 * maxRetries: 0 porque los reintentos los decide nuestro plan de fallbacks;
 * si el SDK también reintentara, el tiempo de espera se multiplicaría.
 */
export const defaultFactories: Readonly<Record<string, AdapterFactory>> = {
  openai: ({ baseUrl, apiKey, timeoutMs }) =>
    new OpenAIAdapter(new OpenAI({ baseURL: baseUrl, apiKey, timeout: timeoutMs, maxRetries: 0 })),
  anthropic: ({ baseUrl, apiKey, timeoutMs }) =>
    new AnthropicAdapter(new Anthropic({ baseURL: baseUrl, apiKey, timeout: timeoutMs, maxRetries: 0 })),
};

export const DEFAULT_TIMEOUT_MS = 30_000;

function requireEnv(env: NodeJS.ProcessEnv, name: string, destination: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Falta la variable de entorno ${name} (destino "${destination}")`);
  }
  return value;
}

/** Crea un adaptador por destino, leyendo URL y clave de las variables de entorno. */
export function createAdapters(
  config: LlmConfig,
  env: NodeJS.ProcessEnv,
  factories: Readonly<Record<string, AdapterFactory>> = defaultFactories,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Map<string, Adapter> {
  const adapters = new Map<string, Adapter>();
  for (const [name, destination] of Object.entries(config.destinations)) {
    const factory = Object.hasOwn(factories, destination.format)
      ? factories[destination.format]
      : undefined;
    if (!factory) {
      throw new Error(`Formato desconocido "${destination.format}" en el destino "${name}"`);
    }
    adapters.set(
      name,
      factory({
        baseUrl: requireEnv(env, destination.base_url_env, name),
        apiKey: requireEnv(env, destination.api_key_env, name),
        timeoutMs,
      }),
    );
  }
  return adapters;
}
