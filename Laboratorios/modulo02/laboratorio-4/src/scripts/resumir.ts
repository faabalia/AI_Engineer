/**
 * Prueba manual del resumidor contra el proxy real (gasta unos pocos tokens).
 *
 *   npm run resumir                                   -> resume un texto de ejemplo
 *   npm run resumir -- archivo.txt                    -> resume ese archivo
 *   npm run resumir -- archivo.txt --modelo potente --palabras 40
 *
 * No es un test automático: necesita red y claves reales en el .env.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { AllDestinationsFailedError, createLlmClient, loadConfig, LlmError } from "../llm/index.js";
import { Summarizer } from "../summarizer/summarizer.js";

const EXAMPLE_TEXT = `
Los modelos de lenguaje grandes se entrenan con enormes cantidades de texto para predecir
la siguiente palabra de una secuencia. Con ese objetivo tan simple aprenden gramática,
hechos del mundo y cierta capacidad de razonamiento. Sin embargo, no consultan una base de
datos: lo que "saben" está codificado en sus parámetros, por lo que pueden equivocarse o
inventar datos con total seguridad. Para reducir esos errores se les suele conectar a
fuentes externas, técnica conocida como generación aumentada por recuperación. Además, el
coste de usarlos depende del número de tokens procesados, así que conviene elegir el modelo
más pequeño que resuelva la tarea y tener alternativas por si un proveedor falla.
`.trim();

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    modelo: { type: "string" },
    palabras: { type: "string" },
  },
});

const file = positionals[0];
const text = file === undefined ? EXAMPLE_TEXT : readFileSync(resolve(process.cwd(), file), "utf-8");
const maxWords = values.palabras === undefined ? undefined : Number(values.palabras);

const config = loadConfig(resolve(process.cwd(), "config.json"));
const summarizer = new Summarizer(createLlmClient(config));

console.log(`Texto: ${file ?? "(ejemplo integrado)"} (${text.length} caracteres)`);
console.log(`Modelo lógico: ${values.modelo ?? "rapido (por defecto)"}`);
if (maxWords !== undefined) console.log(`Máximo de palabras: ${maxWords}`);

const started = Date.now();
try {
  const response = await summarizer.summarize(text, { model: values.modelo, maxWords });

  console.log(`\nDestino:     ${response.destination}`);
  console.log(`Modelo real: ${response.model}`);
  console.log(`Parada:      ${response.stopReason}${response.stopReason === "length" ? "  (¡resumen cortado!)" : ""}`);
  console.log(
    `Tokens:      ${response.usage.inputTokens} entrada + ${response.usage.outputTokens} salida = ${response.usage.totalTokens}`,
  );
  console.log(`Tiempo:      ${Date.now() - started} ms`);
  for (const attempt of response.attempts) {
    console.log(
      `Intento fallido antes: ${attempt.destination}/${attempt.model} [${attempt.status ?? "sin estado"}] ${attempt.message}`,
    );
  }
  console.log(`\nResumen (${response.text.split(/\s+/).filter(Boolean).length} palabras):\n${response.text}`);
} catch (error) {
  console.log(`\nFALLÓ tras ${Date.now() - started} ms`);
  if (error instanceof AllDestinationsFailedError) {
    for (const attempt of error.attempts) {
      console.log(`  - ${attempt.destination}/${attempt.model}: [${attempt.error.status ?? "sin estado"}] ${attempt.error.message}`);
    }
  } else if (error instanceof LlmError) {
    console.log(`  Error ${error.status ?? "sin estado"} (reintentable: ${error.retryable}): ${error.message}`);
  } else {
    console.log(`  ${error instanceof Error ? error.message : error}`);
  }
  process.exitCode = 1;
}
