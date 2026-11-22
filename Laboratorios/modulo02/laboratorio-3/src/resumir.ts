import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { callModel, callModelStreaming, makeClient, withRetries } from "./llm.js";

const SYSTEM_PROMPT =
  "Eres un asistente que resume textos. Responde SIEMPRE con exactamente 3 puntos " +
  "breves y claros, en formato de lista (1., 2., 3.), en el mismo idioma del texto. " +
  "No añadas introducción ni conclusión.";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: "boolean", default: false },
      stream: { type: "boolean", default: false },
      "max-tokens": { type: "string" },
      timeout: { type: "string", default: "30" },
      stop: { type: "string" },
    },
  });
  const entrada = positionals.join(" ").trim();
  if (!entrada)
    throw new Error(
      'Uso: resumir [--json] [--stream] [--max-tokens N] [--stop X] [--timeout S] "<texto>" | <archivo>',
    );
  const maxTokens = values["max-tokens"] ? Number(values["max-tokens"]) : undefined;
  if (maxTokens !== undefined && !(Number.isInteger(maxTokens) && maxTokens > 0))
    throw new Error("--max-tokens debe ser un entero positivo");
  const timeout = Number(values.timeout);
  if (!(timeout > 0)) throw new Error("--timeout debe ser un número positivo (segundos)");

  const texto = existsSync(entrada) ? readFileSync(entrada, "utf-8") : entrada;
  const client = makeClient(timeout);
  const messages = [{ role: "user" as const, content: texto }];
  const stream = values.stream && !values.json;
  if (!stream && !values.json) console.log("\nResumen:");

  const t0 = performance.now();
  const r = await withRetries(
    () =>
      stream
        ? callModelStreaming(client, SYSTEM_PROMPT, messages, maxTokens, values.stop)
        : callModel(client, SYSTEM_PROMPT, messages, maxTokens, values.stop),
    {
      onRetry: (n, max, err, ms) =>
        console.error(
          `reintento ${n}/${max - 1} tras ${err?.status ?? err?.message} (espera ${(ms / 1000).toFixed(1)} s)`,
        ),
    },
  );
  const totalMs = performance.now() - t0;

  if (values.json) {
    console.log(JSON.stringify(r.raw, null, 2));
    return;
  }
  if (!stream) console.log(r.text);
  if (r.finishReason === "length")
    console.error("\n⚠ Respuesta cortada por el tope de tokens (usa --max-tokens mayor)");
  console.log(`\nid: ${r.id} · modelo: ${r.model} · finish_reason: ${r.finishReason}`);
  console.log(
    `Tokens -> entrada: ${r.tokens.prompt}, salida: ${r.tokens.completion}, total: ${r.tokens.total}`,
  );
  console.log(
    stream
      ? `Tiempo -> primer trozo: ${r.firstChunkMs?.toFixed(0)} ms, total: ${totalMs.toFixed(0)} ms`
      : `Tiempo -> total: ${totalMs.toFixed(0)} ms`,
  );
}

main().catch((err) => {
  console.error(`Error: ${String(err?.message ?? err).split("\n")[0]}`);
  process.exit(1);
});
