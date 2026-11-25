import { ChatOpenAI } from "@langchain/openai";
import { createAgent, modelRetryMiddleware } from "langchain";
import { z } from "zod";
import { DECISIONES } from "./acierto.js";
import type { Clasificar } from "./runner.js";

/** Esquema de la salida estructurada: un objeto con la decisión, que solo puede ser una de las tres. */
const esquemaDecision = z.object({
  decision: z.enum(DECISIONES).describe("Decisión sobre el CV: apto, descartar o revisar"),
});

/** Máximo de pasos del agente. No itera (no tiene tools), pero acota cualquier bucle inesperado. */
export const RECURSION_LIMIT = 5;

/** Reintentos de la llamada al modelo: 1 s de espera inicial, x1.5 en cada intento (unos 13 s en total). */
const REINTENTOS = { maxRetries: 5, initialDelayMs: 1000, backoffFactor: 1.5, maxDelayMs: 8000, jitter: true } as const;

/**
 * Decide si un error de la llamada al modelo merece un reintento: límite de peticiones (429),
 * tiempo agotado (408), conflicto (409), caídas del servidor (5xx) y fallos de conexión.
 * Un 400 o un 401 no mejoran reintentando.
 */
export function esErrorReintentable(error: Error): boolean {
  const { status } = error as Error & { status?: unknown };
  if (typeof status === "number") {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }
  return error.name.includes("Connection");
}

/**
 * Clasificador real, montado como un agente de LangChain sin herramientas:
 * - `systemPrompt`: el prompt de la variante; el CV viaja como mensaje del usuario.
 * - Con esquema, `responseFormat` fuerza la decisión y se lee de `structuredResponse`.
 * - Sin esquema devuelve el texto del último mensaje, tal cual.
 * - `modelRetryMiddleware` reintenta los fallos pasajeros del proxy (429, 5xx...).
 * Lee OPENAI_API_KEY y OPENAI_BASE_URL del entorno (cargar el .env es cosa del programa principal).
 */
export function crearClasificador(env: NodeJS.ProcessEnv = process.env): Clasificar {
  // Configuración común: modelo, prompt, sin tools y con reintentos.
  const base = (modelo: string, prompt: string) => ({
    model: new ChatOpenAI({
      model: modelo,
      apiKey: env.OPENAI_API_KEY,
      configuration: { baseURL: env.OPENAI_BASE_URL },
      // Los reintentos los hace el middleware: así no se duplican con los del SDK.
      maxRetries: 0,
    }),
    tools: [],
    systemPrompt: prompt,
    middleware: [modelRetryMiddleware({ ...REINTENTOS, retryOn: esErrorReintentable, onFailure: "error" })],
  });

  const crearAgenteConEsquema = (modelo: string, prompt: string) =>
    createAgent({ ...base(modelo, prompt), responseFormat: esquemaDecision });
  const crearAgenteDeTexto = (modelo: string, prompt: string) => createAgent(base(modelo, prompt));

  // Un agente por modelo y prompt, creado la primera vez que se usa. Dos cachés porque
  // los dos agentes tienen tipos distintos (solo el primero devuelve `structuredResponse`).
  const conEsquema = new Map<string, ReturnType<typeof crearAgenteConEsquema>>();
  const deTexto = new Map<string, ReturnType<typeof crearAgenteDeTexto>>();
  const entrada = (cv: string) => ({ messages: [{ role: "user" as const, content: cv }] });
  const config = { recursionLimit: RECURSION_LIMIT };

  return async (modelo, prompt, cv, esquema) => {
    const clave = JSON.stringify([modelo, prompt]);

    if (esquema) {
      let agente = conEsquema.get(clave);
      if (agente === undefined) {
        agente = crearAgenteConEsquema(modelo, prompt);
        conEsquema.set(clave, agente);
      }
      const resultado = await agente.invoke(entrada(cv), config);
      return esquemaDecision.parse(resultado.structuredResponse).decision;
    }

    let agente = deTexto.get(clave);
    if (agente === undefined) {
      agente = crearAgenteDeTexto(modelo, prompt);
      deTexto.set(clave, agente);
    }
    const resultado = await agente.invoke(entrada(cv), config);
    const contenido = resultado.messages.at(-1)?.content;
    return typeof contenido === "string" ? contenido : JSON.stringify(contenido);
  };
}
