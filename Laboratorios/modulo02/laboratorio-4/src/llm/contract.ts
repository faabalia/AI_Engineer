/**
 * Contrato propio del cliente. Ningún tipo de este archivo menciona a un
 * proveedor: la aplicación depende de esto y de nada más.
 */

export type Role = "system" | "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
}

export interface ChatRequest {
  /** Nombre lógico del modelo (por ejemplo "rapido"), no el de un proveedor. */
  model: string;
  messages: Message[];
  maxTokens?: number;
  /** Los destinos que no admiten este parámetro lo ignoran. */
  temperature?: number;
}

/** Por qué terminó de generar el modelo, igual para todos los proveedores. */
export type StopReason = "stop" | "length" | "content_filter" | "other";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Un destino que se probó y falló antes de que otro respondiera. Datos simples. */
export interface FailedAttempt {
  destination: string;
  model: string;
  /** Estado HTTP, si el fallo lo tuvo (un timeout o una caída de red no). */
  status?: number;
  message: string;
}

export interface ChatResponse {
  text: string;
  stopReason: StopReason;
  usage: Usage;
  /** Modelo real que respondió. */
  model: string;
  /** Destino (de la configuración) que respondió. */
  destination: string;
  /** Destinos que fallaron antes, en orden. Vacío si el primero respondió. */
  attempts: FailedAttempt[];
}

/** Lo que recibe un adaptador: ya con el modelo real, sin nombres lógicos. */
export interface AdapterRequest {
  model: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
}

export type AdapterResponse = Omit<ChatResponse, "destination" | "attempts">;

/** Traduce entre el contrato y la API de un formato concreto. */
export interface Adapter {
  chat(request: AdapterRequest): Promise<AdapterResponse>;
}
