/**
 * Error del cliente. `retryable` es lo único que necesita el plan de fallbacks:
 * true  -> fallo pasajero, merece probar otro destino.
 * false -> fallo de la petición, fallaría igual en cualquier destino.
 */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "LlmError";
  }
}

/** 408 (timeout), 429 (rate limit) y 5xx son pasajeros; el resto (400, 401...) no. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export interface Attempt {
  destination: string;
  model: string;
  error: LlmError;
}

/** Se lanza cuando se probaron todos los destinos del plan y todos fallaron. */
export class AllDestinationsFailedError extends LlmError {
  constructor(
    readonly logicalModel: string,
    readonly attempts: Attempt[],
  ) {
    const detail = attempts
      .map((a) => `${a.destination}/${a.model}: ${a.error.message}`)
      .join("; ");
    super(`Todos los destinos fallaron para "${logicalModel}" (${detail})`, false);
    this.name = "AllDestinationsFailedError";
  }
}
