import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const createAgent = vi.fn((_configuracion: unknown) => ({ invoke }));
const modelRetryMiddleware = vi.fn((opciones: unknown) => ({ middleware: "reintentos", opciones }));
const chatOpenAI = vi.fn();

vi.mock("langchain", () => ({
  createAgent: (configuracion: unknown) => createAgent(configuracion),
  modelRetryMiddleware: (opciones: unknown) => modelRetryMiddleware(opciones),
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    constructor(opciones: unknown) {
      chatOpenAI(opciones);
    }
  },
}));

const { crearClasificador, esErrorReintentable, RECURSION_LIMIT } = await import("./clasificador.js");

const env = { OPENAI_API_KEY: "clave-de-prueba", OPENAI_BASE_URL: "https://proxy.test/v1" };

/** Configuración con la que se creó el agente en la llamada n (empezando en 0). */
function configuracionDelAgente(n = 0): Record<string, unknown> {
  return createAgent.mock.calls[n]?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("crearClasificador con esquema", () => {
  it("devuelve la decisión de structuredResponse", async () => {
    invoke.mockResolvedValue({ structuredResponse: { decision: "revisar" }, messages: [] });
    expect(await crearClasificador(env)("smart", "prompt", "cv", true)).toBe("revisar");
  });

  it("crea un agente sin tools, con el prompt como systemPrompt y responseFormat", async () => {
    invoke.mockResolvedValue({ structuredResponse: { decision: "apto" }, messages: [] });
    await crearClasificador(env)("fast", "mi prompt", "cv", true);

    const configuracion = configuracionDelAgente();
    expect(configuracion.tools).toEqual([]);
    expect(configuracion.systemPrompt).toBe("mi prompt");
    expect(configuracion.responseFormat).toBeDefined();
  });

  it("el esquema solo admite las tres decisiones", async () => {
    invoke.mockResolvedValue({ structuredResponse: { decision: "apto" }, messages: [] });
    await crearClasificador(env)("fast", "p", "cv", true);
    const { responseFormat } = configuracionDelAgente() as {
      responseFormat: { safeParse: (valor: unknown) => { success: boolean } };
    };

    expect(responseFormat.safeParse({ decision: "descartar" }).success).toBe(true);
    expect(responseFormat.safeParse({ decision: "quizás" }).success).toBe(false);
    expect(responseFormat.safeParse({}).success).toBe(false);
  });

  it("falla si la respuesta estructurada no cumple el esquema", async () => {
    invoke.mockResolvedValue({ structuredResponse: { decision: "quizás" }, messages: [] });
    await expect(crearClasificador(env)("fast", "p", "cv", true)).rejects.toThrow();
  });
});

describe("crearClasificador sin esquema", () => {
  it("devuelve el texto del último mensaje tal cual", async () => {
    invoke.mockResolvedValue({ messages: [{ content: "primero" }, { content: "  Apto \n" }] });
    expect(await crearClasificador(env)("fast", "p", "cv", false)).toBe("  Apto \n");
  });

  it("no usa responseFormat", async () => {
    invoke.mockResolvedValue({ messages: [{ content: "apto" }] });
    await crearClasificador(env)("fast", "p", "cv", false);
    expect(configuracionDelAgente()).not.toHaveProperty("responseFormat");
    expect(configuracionDelAgente().tools).toEqual([]);
  });

  it("si el contenido no es texto lo devuelve serializado", async () => {
    invoke.mockResolvedValue({ messages: [{ content: [{ type: "text", text: "apto" }] }] });
    expect(await crearClasificador(env)("fast", "p", "cv", false)).toBe('[{"type":"text","text":"apto"}]');
  });
});

describe("crearClasificador (común)", () => {
  it("envía el CV como mensaje del usuario y fija el límite de recursión", async () => {
    invoke.mockResolvedValue({ messages: [{ content: "apto" }] });
    await crearClasificador(env)("fast", "p", "el cv", false);

    expect(invoke).toHaveBeenCalledWith({ messages: [{ role: "user", content: "el cv" }] }, { recursionLimit: RECURSION_LIMIT });
    expect(RECURSION_LIMIT).toBe(5);
  });

  it("crea el modelo con la clave y la URL del entorno, sin reintentos propios", async () => {
    invoke.mockResolvedValue({ messages: [{ content: "apto" }] });
    await crearClasificador(env)("smart", "p", "cv", false);

    expect(chatOpenAI).toHaveBeenCalledWith({
      model: "smart",
      apiKey: "clave-de-prueba",
      configuration: { baseURL: "https://proxy.test/v1" },
      maxRetries: 0,
    });
  });

  it("añade el middleware de reintentos con backoff, solo para errores reintentables", async () => {
    invoke.mockResolvedValue({ messages: [{ content: "apto" }] });
    await crearClasificador(env)("fast", "p", "cv", false);

    expect(modelRetryMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 5,
        initialDelayMs: 1000,
        backoffFactor: 1.5,
        retryOn: esErrorReintentable,
        onFailure: "error",
      }),
    );
    expect(configuracionDelAgente().middleware).toHaveLength(1);
  });

  it("reutiliza el agente para el mismo modelo, prompt y modo de salida", async () => {
    invoke.mockResolvedValue({ messages: [{ content: "apto" }] });
    const clasificar = crearClasificador(env);

    await clasificar("fast", "p", "cv 1", false);
    await clasificar("fast", "p", "cv 2", false);
    expect(createAgent).toHaveBeenCalledTimes(1);

    await clasificar("smart", "p", "cv 1", false);
    await clasificar("fast", "otro prompt", "cv 1", false);
    expect(createAgent).toHaveBeenCalledTimes(3);
  });

  it("usa agentes distintos con y sin esquema", async () => {
    invoke.mockResolvedValue({ structuredResponse: { decision: "apto" }, messages: [{ content: "apto" }] });
    const clasificar = crearClasificador(env);

    await clasificar("fast", "p", "cv", false);
    await clasificar("fast", "p", "cv", true);
    expect(createAgent).toHaveBeenCalledTimes(2);
  });

  it("propaga el error si el agente falla (el runner lo registra)", async () => {
    invoke.mockRejectedValue(new Error("429"));
    await expect(crearClasificador(env)("fast", "p", "cv", false)).rejects.toThrow("429");
  });
});

describe("esErrorReintentable", () => {
  const conEstado = (status: number) => Object.assign(new Error("fallo"), { status });

  it.each([408, 409, 429, 500, 502, 503])("reintenta con el estado %i", (status) => {
    expect(esErrorReintentable(conEstado(status))).toBe(true);
  });

  it.each([400, 401, 403, 404])("no reintenta con el estado %i", (status) => {
    expect(esErrorReintentable(conEstado(status))).toBe(false);
  });

  it("reintenta los fallos de conexión, que no tienen estado", () => {
    const error = new Error("fallo de red");
    error.name = "APIConnectionError";
    expect(esErrorReintentable(error)).toBe(true);
  });

  it("no reintenta un error cualquiera sin estado", () => {
    expect(esErrorReintentable(new Error("fallo de programación"))).toBe(false);
  });
});
