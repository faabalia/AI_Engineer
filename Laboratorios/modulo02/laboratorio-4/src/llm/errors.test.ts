import { describe, it, expect } from "vitest";
import { AllDestinationsFailedError, LlmError, isRetryableStatus } from "./errors.js";

describe("isRetryableStatus", () => {
  it.each([408, 429, 500, 502, 503, 504])("%i es pasajero", (status) => {
    expect(isRetryableStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])("%i es un fallo de la petición", (status) => {
    expect(isRetryableStatus(status)).toBe(false);
  });
});

describe("AllDestinationsFailedError", () => {
  it("resume los intentos en el mensaje y no es reintentable", () => {
    const error = new AllDestinationsFailedError("potente", [
      { destination: "a", model: "m1", error: new LlmError("429", true, 429) },
      { destination: "b", model: "m2", error: new LlmError("503", true, 503) },
    ]);

    expect(error.retryable).toBe(false);
    expect(error.attempts).toHaveLength(2);
    expect(error.message).toContain("potente");
    expect(error.message).toContain("a/m1: 429");
    expect(error.message).toContain("b/m2: 503");
  });
});
