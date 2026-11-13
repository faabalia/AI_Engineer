// ---------------------------------------------------------------------------
// miniApp.ts — aplicación de línea de comandos que envía un texto a un modelo
// y resuelve una de tres tareas: resumir, clasificar o extraer un dato.
//
// Uso:
//   npx tsx miniApp.ts [--tarea=resumir|clasificar|extraer] "Texto"
//   npx tsx miniApp.ts [--tarea=resumir|clasificar|extraer] < texto.txt
// ---------------------------------------------------------------------------

import "dotenv/config"; // carga OPENAI_API_KEY, OPENAI_BASE_URL y MODELO desde el archivo .env
import OpenAI from "openai";

// Instrucciones FIJAS de cada tarea. Van en el mensaje con rol "system":
// no cambian entre ejecuciones, a diferencia del texto del usuario.
const TAREAS: Record<string, string> = {
  resumir:
    "Resume textos. Devuelve exactamente 3 puntos clave, concisos, en español.",
  clasificar:
    "Clasificas mensajes de soporte. Responde únicamente con una categoría de esta lista: " +
    "facturación, error técnico, cuenta/acceso, consulta general, queja. Sin explicaciones.",
  extraer:
    "Extraes datos de un texto. Devuelve únicamente el importe total mencionado " +
    "(número y moneda). Si no hay ninguno, responde: NO ENCONTRADO.",
};

// Mensaje de ayuda que se muestra cuando no se recibe texto.
const USO = `Uso:
  npx tsx miniApp.ts [--tarea=resumir|clasificar|extraer] "Texto a procesar"
  npx tsx miniApp.ts [--tarea=resumir|clasificar|extraer] < texto.txt

Por defecto la tarea es "resumir".`;

// Lee todo lo que llegue por la entrada estándar (lo que se redirige con "< archivo.txt").
async function leerStdin(): Promise<string> {
  // Si stdin es un terminal interactivo, no hay nada redirigido:
  // devolvemos vacío para no quedarnos esperando a que el usuario escriba.
  if (process.stdin.isTTY) return "";
  let datos = "";
  for await (const trozo of process.stdin) datos += trozo; // acumula los trozos del archivo
  return datos;
}

// --- 1. Leer los argumentos de la línea de comandos -------------------------
// process.argv[0] es node y [1] es el script; los argumentos reales empiezan en [2].
const args = process.argv.slice(2);

// Busca la opción --tarea=... (si no está, la tarea por defecto es "resumir").
const opcionTarea = args.find((a) => a.startsWith("--tarea="));
const tarea = opcionTarea ? opcionTarea.split("=")[1] : "resumir";

// El texto es el primer argumento que NO sea una opción (--algo).
const posicional = args.find((a) => !a.startsWith("--"));

// Si la tarea pedida no existe, se avisa y se termina con error (código 1).
if (!(tarea in TAREAS)) {
  console.error(`Tarea desconocida: "${tarea}"\n\n${USO}`);
  process.exit(1);
}

// --- 2. Obtener el texto: argumento o, si no hay, entrada estándar ----------
const texto = (posicional ?? (await leerStdin())).trim();

// Sin texto no hay nada que procesar: se explica el uso y se termina.
if (!texto) {
  console.error(USO);
  process.exit(1);
}

// --- 3. Llamar al modelo -----------------------------------------------------
// El cliente lee OPENAI_API_KEY y OPENAI_BASE_URL del entorno (cargados del .env),
// por eso la clave no aparece en el código.
const client = new OpenAI();
const MODELO = process.env.MODELO ?? "fast"; // modelo definido en .env, o "fast" por defecto

const response = await client.chat.completions.create({
  model: MODELO,
  max_completion_tokens: 512, // límite de longitud de la respuesta, en tokens
  messages: [
    { role: "system", content: TAREAS[tarea] }, // instrucciones fijas de la tarea
    { role: "user", content: texto }, // texto que cambia en cada uso
  ],
});

// --- 4. Mostrar resultado, motivo de fin y consumo ---------------------------
// La respuesta llega en una lista de opciones (choices); usamos la primera.
const eleccion = response.choices[0];
console.log(eleccion.message.content || "(respuesta vacía)");

// finish_reason: "stop" = terminó de forma natural; "length" = se cortó por el límite.
console.log(`\n[fin] ${eleccion.finish_reason}`);
if (eleccion.finish_reason === "length") {
  console.warn("⚠ La respuesta se cortó por el límite de longitud (length).");
}

// usage: tokens consumidos por la llamada (entrada = prompt, salida = respuesta).
console.log(
  `[tokens] entrada=${response.usage?.prompt_tokens} salida=${response.usage?.completion_tokens}`,
);
