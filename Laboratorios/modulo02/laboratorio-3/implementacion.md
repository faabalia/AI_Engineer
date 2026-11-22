# Implementación

Explicación de cada fichero del proyecto, su función y cómo está construido.

## Vista general

```
laboratorio-3/
├── src/
│   ├── resumir.ts      # CLI: lee argumentos, orquesta y muestra resultados
│   ├── llm.ts          # Lógica reutilizable: llamadas, streaming, validación, reintentos
│   └── llm.test.ts     # Pruebas automáticas (sin red)
├── textos/ejemplo.txt  # Texto de prueba de 200 líneas
├── .env                # Credenciales y modelo (no se sube a git)
├── package.json        # Dependencias y scripts
├── tsconfig.json       # Configuración de TypeScript
├── README.md           # Uso rápido
└── implementacion.md   # Este documento
```

Flujo de una ejecución:

```
resumir.ts  →  withRetries( callModel | callModelStreaming )  →  readResponse  →  salida por consola
                    ↑ reintenta si isTransient(error)
```

---

## `src/resumir.ts` — la CLI

**Función:** punto de entrada. Interpreta lo que escribe el usuario, llama a las funciones de `llm.ts` y presenta el resultado. No contiene lógica de red ni de reintentos.

**Cómo está implementado:**

- **System prompt fijo** (`SYSTEM_PROMPT`): constante que pide exactamente 3 puntos numerados, en el idioma del texto y sin introducción ni conclusión.
- **Argumentos**: usa `parseArgs` de `node:util` (viene con Node, sin dependencias). Define cuatro opciones: `--json` y `--stream` (booleanas), `--max-tokens` y `--timeout` (cadenas que luego convierte a número).
- **Validación**: comprueba que haya entrada, que `--max-tokens` sea un entero positivo y que `--timeout` sea mayor que 0. Si algo falla, lanza un `Error` con un mensaje claro.
- **Entrada**: si el argumento coincide con una ruta existente (`existsSync`), lee el archivo; si no, lo trata como el texto a resumir.
- **Orquestación**: crea el cliente con `makeClient(timeout)`, arma `messages` con el texto del usuario y llama a `callModel` o `callModelStreaming` según `--stream`, siempre envuelto en `withRetries`. El callback `onRetry` escribe en stderr líneas como `reintento 1/3 tras 429 (espera 0.4 s)`.
- **Medición**: `performance.now()` antes y después para el tiempo total. En streaming, el tiempo al primer trozo lo trae el resultado (`firstChunkMs`).
- **Salida**:
  - Con `--json`: imprime solo `r.raw` (la respuesta completa) para que la salida sea JSON válido.
  - Sin `--json`: muestra el resumen, un aviso a stderr si `finishReason === "length"`, y una línea con `id`, modelo y `finish_reason`, otra con tokens y otra con tiempos.
  - Con `--stream` el texto ya se escribió mientras llegaba, así que no se vuelve a imprimir.
  - Si se combinan `--json` y `--stream`, gana `--json` (no se hace streaming).
- **Errores**: `main().catch(...)` imprime una sola línea `Error: <primera línea del mensaje>` y sale con código 1, sin stack trace.

---

## `src/llm.ts` — la lógica reutilizable

**Función:** todo lo relacionado con hablar con el modelo y manejar sus fallos. No tiene efectos al importarla, por eso se puede probar sin red.

### Tipos y errores

- `Msg`: mensaje `{ role: "user" | "assistant", content }`.
- `ModelResult`: lo que devuelven las llamadas: `text`, `finishReason`, `tokens {prompt, completion, total}`, `model`, `id`, `raw` (respuesta completa, para `--json`) y `firstChunkMs` (solo streaming).
- `ResponseError`: error propio con `kind` (`"empty"`, `"refusal"` o `"content_filter"`). Sirve para distinguir un problema de la respuesta de un problema de red.

### `makeClient(timeoutSec)`

Crea el cliente de OpenAI con la clave y la URL base del `.env`. El timeout se pasa de segundos a milisegundos y se fija `maxRetries: 0` para desactivar los reintentos automáticos de la librería: los reintentos los controla `withRetries`.

### `readResponse(res)`

Convierte una respuesta cruda en un `ModelResult` y la valida. Lanza `ResponseError` si:

1. no hay `choices` o el contenido está vacío (`empty`),
2. `message.refusal` tiene valor (`refusal`),
3. `finish_reason` es `content_filter` (`content_filter`).

El orden importa: se comprueba la negativa y el filtro **antes** del texto vacío, porque en esos casos el contenido suele venir vacío y el motivo real es otro. Un `finish_reason: "length"` **no** es error: se devuelve el texto parcial y la CLI avisa.

### `callModel(client, system, messages, maxTokens, stop)`

Separa las tres piezas: instrucciones (`system`), conversación (`messages`) y parámetros (`maxTokens`, `stop`). Antepone el mensaje de sistema, llama a `chat.completions.create` y pasa el resultado por `readResponse`. El modelo sale de `process.env.MODELO` (por defecto `gpt-4o-mini`).

### `callModelStreaming(...)`

Misma firma que `callModel` más un callback `onText` (por defecto escribe en stdout). Pide `stream: true` y `stream_options: { include_usage: true }`, y recorre los trozos con `for await`:

- guarda `id` y `model` del primer trozo,
- escribe y acumula cada `delta.content`, y registra el tiempo del **primer** trozo con contenido,
- guarda `finish_reason` y `refusal` cuando llegan,
- el último trozo trae `usage` y `choices` vacío, por eso se comprueba `chunk.usage` antes de saltarse los trozos sin `choices`.

Al terminar ensambla un objeto con la misma forma que una respuesta normal y lo pasa por `readResponse`. Así devuelve **lo mismo** que `callModel` y reutiliza las mismas validaciones.

### `isTransient(err)`

Decide si un error merece reintento:

| Error | ¿Se reintenta? |
|---|---|
| `ResponseError` | No |
| Timeout o error de conexión | Sí |
| 429 (límite de ritmo) | Sí |
| 429 cuyo código o mensaje contiene `budget`, `quota`, `insufficient` o `presupuesto` | No (presupuesto agotado) |
| 5xx | Sí |
| 400, 401, 403, 404 y demás | No |
| Sin `status` y no es de conexión | No |

La regla del presupuesto es provisional: se basa en palabras del mensaje porque no se ha observado el error real del servicio.

### `withRetries(fn, opts)`

Ejecuta `fn` hasta un máximo de 4 intentos. Si falla y el error es transitorio, espera y reintenta; si no, relanza el error original.

La espera usa *full jitter*: un valor aleatorio entre 0 y `min(30 s, 1 s × 2^(intento-1))`. Así los esperas máximas son 1 s, 2 s y 4 s tras los intentos 1, 2 y 3. `sleep`, `random` y `onRetry` son inyectables, lo que permite probar sin esperar de verdad y con valores deterministas.

---

## `src/llm.test.ts` — pruebas

**Función:** verifica la lógica sin llamar al servicio. Se ejecuta con `npm test` (`tsx --test`, usando el ejecutor de `node:test`).

**Cómo está implementado:** usa funciones falsas que lanzan errores con un `status` dado (`httpErr(503)`) y un `sleep` vacío, así que corren en milisegundos. Las 6 pruebas:

1. Un 503 se reintenta y acaba bien al tercer intento.
2. Un 400 no se reintenta (una sola llamada).
3. Con fallos continuos se rinde tras 4 intentos.
4. Con `random: () => 1` las esperas son `[1000, 2000, 4000]`, lo que valida el tope exponencial.
5. `isTransient` devuelve lo esperado para 429, 5xx, 4xx, presupuesto agotado, timeout de conexión y `ResponseError`.
6. `readResponse` extrae bien los campos y lanza error para respuesta vacía, negativa y filtro de contenido; `length` no lanza.

---

## `textos/ejemplo.txt`

Texto de 200 líneas sobre energías renovables y transición energética, organizado en cuatro temas que se repiten bajo encabezados `##`. Sirve para probar la lectura desde archivo, el consumo de tokens con una entrada larga (≈4 000 tokens) y la comparación con y sin streaming.

---

## Ficheros de configuración

- **`package.json`**: proyecto ESM (`"type": "module"`). Dependencias: `openai` y `dotenv`. De desarrollo: `tsx` (ejecuta TypeScript directamente), `typescript` y `@types/node`. Scripts: `resumir` (`tsx src/resumir.ts`) y `test`.
- **`tsconfig.json`**: `target` es2022, `module` y `moduleResolution` en `nodenext`, `strict`, `noEmit` (solo comprueba tipos, `tsx` hace la ejecución) y `types: ["node"]` para reconocer `node:fs`, `node:util` y `process`. Se comprueba con `npx tsc --noEmit`.
- **`.env`**: `OPENAI_API_KEY`, `OPENAI_BASE_URL` y `MODELO`. Contiene la clave: no debe subirse a git.
- **`README.md`**: guía rápida de instalación, uso y opciones.

## Decisiones de diseño

- **Separar CLI y lógica**: `llm.ts` no imprime ni lee argumentos, por eso se prueba aislado.
- **Reintentos propios**: se desactivan los de la librería para controlar qué errores se reintentan y cuánto se espera, y para poder mostrar cada reintento.
- **Un único punto de validación**: tanto la llamada normal como la de streaming terminan en `readResponse`.
- **Importaciones con `.js`**: en TypeScript con `nodenext` se importa `./llm.js` aunque el archivo sea `.ts`.
