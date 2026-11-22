import { withRetries } from "./llm.js";

const httpErr = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const onRetry = (n: number, max: number, err: any, ms: number) =>
  console.log(`  reintento ${n}/${max - 1} tras ${err.status} (espera ${(ms / 1000).toFixed(1)} s)`);
const opts = { onRetry, random: () => 0.3 }; // esperas cortas y repetibles

console.log("Caso A: la llamada falsa falla con 503 dos veces y luego responde");
let a = 0;
const rA = await withRetries(async () => {
  a++;
  console.log(`  intento ${a}`);
  if (a < 3) throw httpErr(503);
  return "respuesta correcta";
}, opts);
console.log(`  -> OK tras ${a} intentos: "${rA}"\n`);

console.log("Caso B: la llamada falsa falla con 400");
let b = 0;
try {
  await withRetries(async () => {
    b++;
    console.log(`  intento ${b}`);
    throw httpErr(400);
  }, opts);
} catch (e: any) {
  console.log(`  -> ${b} intento, NO se reintenta. Error: ${e.message}`);
}
