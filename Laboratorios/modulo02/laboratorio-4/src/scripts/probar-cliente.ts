/**
 * Prueba manual del cliente contra el proxy real (gasta unos pocos tokens).
 *
 *   npm run probar                                    -> todos los modelos lógicos del config.json
 *   npm run probar -- rapido                          -> solo los que indiques
 *   npm run probar -- --config pruebas/otro.json rapido   -> con otro archivo de configuración
 *
 * No es un test automático: necesita red y claves reales en el .env.
 */
import "dotenv/config";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { AllDestinationsFailedError, createLlmClient, loadConfig, LlmError } from "../llm/index.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: "string", default: "config.json" },
  },
});

const configPath = values.config;
const config = loadConfig(resolve(process.cwd(), configPath));
const client = createLlmClient(config);

const models = positionals.length > 0 ? positionals : Object.keys(config.logical_models);

console.log(`Config: ${configPath}`);

for (const model of models) {
  const plan = (config.logical_models[model] ?? []).map((t) => `${t.destination}/${t.model}`).join(" -> ");
  console.log(`\n=== Modelo lógico: ${model} ===`);
  console.log(`Plan:        ${plan || "(modelo desconocido)"}`);
  const started = Date.now();
  try {
    const response = await client.chat({
      model,
      messages: [
        { role: "system", content: "Responde siempre en español y de forma muy breve." },
        { role: "user", content: "¿Cuál es la capital de Francia?" },
      ],
      maxTokens: 100,
    });

    console.log(`Destino:     ${response.destination}`);
    console.log(`Modelo real: ${response.model}`);
    console.log(`Parada:      ${response.stopReason}`);
    console.log(
      `Tokens:      ${response.usage.inputTokens} entrada + ${response.usage.outputTokens} salida = ${response.usage.totalTokens}`,
    );
    console.log(`Tiempo:      ${Date.now() - started} ms`);
    console.log(`Texto:       ${response.text}`);
    for (const attempt of response.attempts) {
      console.log(
        `Intento fallido antes: ${attempt.destination}/${attempt.model} [${attempt.status ?? "sin estado"}] ${attempt.message}`,
      );
    }
  } catch (error) {
    console.log(`FALLÓ tras ${Date.now() - started} ms`);
    if (error instanceof AllDestinationsFailedError) {
      for (const attempt of error.attempts) {
        console.log(`  - ${attempt.destination}/${attempt.model}: [${attempt.error.status ?? "sin estado"}] ${attempt.error.message}`);
      }
    } else if (error instanceof LlmError) {
      console.log(`  Error ${error.status ?? "sin estado"} (reintentable: ${error.retryable}): ${error.message}`);
      console.log("  No se probó ningún otro destino.");
    } else {
      console.log("  Error inesperado:", error);
    }
    process.exitCode = 1;
  }
}
