import { describe, it, expect, vi } from "vitest";
import { LlmClient } from "./client.js";
import type { Adapter, AdapterResponse, ChatRequest } from "./contract.js";
import type { LlmConfig } from "./config.js";
import { AllDestinationsFailedError, LlmError } from "./errors.js";

const config: LlmConfig = {
  logical_models: {
    rapido: [{ destination: "a", model: "fast" }],
    potente: [
      { destination: "a", model: "chaos" },
      { destination: "b", model: "backup" },
    ],
  },
  destinations: {},
};

const ok = (model: string): AdapterResponse => ({
  text: "hola",
  stopReason: "stop",
  usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
  model,
});

const request = (model: string): ChatRequest => ({
  model,
  messages: [{ role: "user", content: "hi" }],
  maxTokens: 50,
  temperature: 0.2,
});

const adapterReturning = (response: AdapterResponse) => ({
  chat: vi.fn<Adapter["chat"]>().mockResolvedValue(response),
});
const adapterFailing = (error: unknown) => ({
  chat: vi.fn<Adapter["chat"]>().mockRejectedValue(error),
});

const clientWith = (a: Adapter, b?: Adapter) =>
  new LlmClient(
    config,
    new Map<string, Adapter>(b ? [["a", a], ["b", b]] : [["a", a]]),
  );

describe("LlmClient", () => {
  it("devuelve la respuesta indicando el destino que respondió", async () => {
    const client = clientWith(adapterReturning(ok("fast")));

    const response = await client.chat(request("rapido"));

    expect(response).toEqual({ ...ok("fast"), destination: "a", attempts: [] });
  });

  it("traduce el modelo lógico al real y pasa el resto de parámetros", async () => {
    const a = adapterReturning(ok("chaos"));

    await clientWith(a).chat(request("potente"));

    expect(a.chat).toHaveBeenCalledWith({
      model: "chaos",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 50,
      temperature: 0.2,
    });
  });

  it("no llama al siguiente destino si el primero responde", async () => {
    const b = adapterReturning(ok("backup"));

    await clientWith(adapterReturning(ok("chaos")), b).chat(request("potente"));

    expect(b.chat).not.toHaveBeenCalled();
  });

  it.each([429, 503])("pasa al siguiente destino con un error pasajero (%i)", async (status) => {
    const a = adapterFailing(new LlmError("fallo", true, status));
    const b = adapterReturning(ok("backup"));

    const response = await clientWith(a, b).chat(request("potente"));

    expect(response.destination).toBe("b");
    expect(b.chat).toHaveBeenCalledWith(expect.objectContaining({ model: "backup" }));
  });

  it("informa en attempts de los destinos que fallaron antes de la respuesta", async () => {
    const a = adapterFailing(new LlmError("sobrecarga", true, 503));
    const b = adapterReturning(ok("backup"));

    const response = await clientWith(a, b).chat(request("potente"));

    expect(response.attempts).toEqual([
      { destination: "a", model: "chaos", status: 503, message: "sobrecarga" },
    ]);
  });

  it("attempts no incluye el error original: son datos simples", async () => {
    const a = adapterFailing(new LlmError("timeout", true, undefined, { cause: new Error("sdk") }));

    const response = await clientWith(a, adapterReturning(ok("backup"))).chat(request("potente"));

    expect(response.attempts[0]).not.toHaveProperty("error");
    expect(response.attempts[0]).not.toHaveProperty("cause");
    expect(response.attempts[0]?.status).toBeUndefined();
  });

  it("NO prueba el siguiente destino con un error de la petición (400)", async () => {
    const badRequest = new LlmError("400", false, 400);
    const b = adapterReturning(ok("backup"));

    await expect(
      clientWith(adapterFailing(badRequest), b).chat(request("potente")),
    ).rejects.toBe(badRequest);

    expect(b.chat).not.toHaveBeenCalled();
  });

  it("propaga sin fallback los errores que no son LlmError (bugs)", async () => {
    const bug = new TypeError("bug");
    const b = adapterReturning(ok("backup"));

    await expect(clientWith(adapterFailing(bug), b).chat(request("potente"))).rejects.toBe(bug);

    expect(b.chat).not.toHaveBeenCalled();
  });

  it("si todos fallan con errores pasajeros, lanza AllDestinationsFailedError con los intentos", async () => {
    const e1 = new LlmError("429", true, 429);
    const e2 = new LlmError("503", true, 503);

    const error = await clientWith(adapterFailing(e1), adapterFailing(e2))
      .chat(request("potente"))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AllDestinationsFailedError);
    expect((error as AllDestinationsFailedError).attempts).toEqual([
      { destination: "a", model: "chaos", error: e1 },
      { destination: "b", model: "backup", error: e2 },
    ]);
  });

  it("falla si un modelo con un solo destino tiene un error pasajero", async () => {
    const client = clientWith(adapterFailing(new LlmError("503", true, 503)));

    await expect(client.chat(request("rapido"))).rejects.toBeInstanceOf(AllDestinationsFailedError);
  });

  it.each(["desconocido", "constructor", "__proto__"])(
    "rechaza el modelo lógico desconocido %s",
    async (name) => {
      const client = clientWith(adapterReturning(ok("x")));

      await expect(client.chat(request(name))).rejects.toThrow(/desconocido/);
    },
  );

  it("avisa si falta el adaptador de un destino de la configuración", async () => {
    const client = new LlmClient(config, new Map());

    await expect(client.chat(request("rapido"))).rejects.toThrow(/No hay adaptador/);
  });
});
