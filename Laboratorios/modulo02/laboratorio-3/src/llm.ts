import OpenAI from "openai";

export type Msg = { role: "user" | "assistant"; content: string };

export interface ModelResult {
  text: string;
  finishReason: string;
  tokens: { prompt: number; completion: number; total: number };
  model: string;
  id: string;
  raw: unknown; // respuesta completa (para --json)
  firstChunkMs?: number; // solo en streaming
}

export class ResponseError extends Error {
  constructor(
    public kind: "empty" | "refusal" | "content_filter",
    message: string,
  ) {
    super(message);
  }
}

export function makeClient(timeoutSec: number): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    timeout: timeoutSec * 1000,
    maxRetries: 0, // los reintentos los controlamos nosotros
  });
}

const modelo = () => process.env.MODELO ?? "gpt-4o-mini";

/** Extrae lo importante de una respuesta (completa) y valida que sea utilizable. */
export function readResponse(res: any): ModelResult {
  const choice = res?.choices?.[0];
  if (!choice) throw new ResponseError("empty", "La respuesta no trae choices");
  const finishReason: string = choice.finish_reason ?? "unknown";
  if (choice.message?.refusal)
    throw new ResponseError("refusal", `El modelo se negó: ${choice.message.refusal}`);
  if (finishReason === "content_filter")
    throw new ResponseError("content_filter", "Respuesta bloqueada por el filtro de contenido");
  const text: string = choice.message?.content ?? "";
  if (!text.trim()) throw new ResponseError("empty", "La respuesta está vacía");
  return {
    text,
    finishReason,
    tokens: {
      prompt: res.usage?.prompt_tokens ?? 0,
      completion: res.usage?.completion_tokens ?? 0,
      total: res.usage?.total_tokens ?? 0,
    },
    model: res.model,
    id: res.id,
    raw: res,
  };
}

export async function callModel(
  client: OpenAI,
  system: string,
  messages: Msg[],
  maxTokens?: number,
  stop?: string | string[],
): Promise<ModelResult> {
  const res = await client.chat.completions.create({
    model: modelo(),
    messages: [{ role: "system", content: system }, ...messages],
    max_tokens: maxTokens,
    stop,
  });
  return readResponse(res);
}

/** Igual que callModel pero escribe el texto a medida que llega. */
export async function callModelStreaming(
  client: OpenAI,
  system: string,
  messages: Msg[],
  maxTokens?: number,
  stop?: string | string[],
  onText: (t: string) => void = (t) => process.stdout.write(t),
): Promise<ModelResult> {
  const t0 = performance.now();
  const stream = await client.chat.completions.create({
    model: modelo(),
    messages: [{ role: "system", content: system }, ...messages],
    max_tokens: maxTokens,
    stop,
    stream: true,
    stream_options: { include_usage: true },
  });
  let content = "";
  let finish: string | null = null;
  let refusal = "";
  let id = "";
  let model = "";
  let usage: any;
  let firstChunkMs: number | undefined;
  for await (const chunk of stream) {
    id ||= chunk.id;
    model ||= chunk.model;
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finish = choice.finish_reason;
    if (choice.delta?.refusal) refusal += choice.delta.refusal;
    const piece = choice.delta?.content;
    if (piece) {
      firstChunkMs ??= performance.now() - t0;
      content += piece;
      onText(piece);
    }
  }
  const res = {
    id,
    model,
    usage,
    choices: [
      { finish_reason: finish, message: { content, refusal: refusal || null } },
    ],
  };
  return { ...readResponse(res), firstChunkMs };
}

export function isTransient(err: any): boolean {
  if (err instanceof ResponseError) return false;
  if (
    err instanceof OpenAI.APIConnectionTimeoutError ||
    err instanceof OpenAI.APIConnectionError
  )
    return true;
  const status: number | undefined = err?.status;
  if (status === undefined) return false;
  if (status === 429) {
    // 429 por presupuesto agotado no se arregla esperando
    const info = `${err?.code ?? ""} ${err?.error?.code ?? ""} ${err?.message ?? ""}`;
    return !/budget|presupuesto|insufficient|quota/i.test(info);
  }
  return status >= 500;
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  opts: {
    maxAttempts?: number;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
    onRetry?: (attempt: number, max: number, err: any, waitMs: number) => void;
  } = {},
): Promise<T> {
  const max = opts.maxAttempts ?? 4;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= max || !isTransient(err)) throw err;
      // full jitter: aleatorio entre 0 y min(30 s, 1 s × 2^intento)
      const waitMs = random() * Math.min(30_000, 1000 * 2 ** (attempt - 1));
      opts.onRetry?.(attempt, max, err, waitMs);
      await sleep(waitMs);
    }
  }
}
