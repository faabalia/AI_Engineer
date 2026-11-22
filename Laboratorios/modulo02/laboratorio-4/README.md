# Laboratorio 4: cliente LLM con contrato propio

La aplicación pide un **modelo lógico** (`rapido`, `potente`) y recibe siempre la misma respuesta, venga de OpenAI, de Anthropic o de otro destino. Qué modelo real y qué proveedor atienden cada nombre lo decide `config.json`, no el código.

```ts
import { createLlmClient, loadConfig } from "./src/llm/index.js";

const client = createLlmClient(loadConfig("config.json")); // lee las claves de process.env
const res = await client.chat({
  model: "rapido",
  messages: [{ role: "user", content: "Hola" }],
});
```

## El contrato (`src/llm/contract.ts`)

Ningún tipo menciona a un proveedor.

**Petición** (`ChatRequest`)

| Campo | Tipo | Notas |
|---|---|---|
| `model` | `string` | Nombre lógico, no el de un proveedor. |
| `messages` | `{ role: "system" \| "user" \| "assistant"; content: string }[]` | |
| `maxTokens?` | `number` | |
| `temperature?` | `number` | Los destinos que no la admiten la ignoran. |

**Respuesta** (`ChatResponse`)

| Campo | Tipo | Notas |
|---|---|---|
| `text` | `string` | |
| `stopReason` | `"stop" \| "length" \| "content_filter" \| "other"` | `length` = respuesta cortada. |
| `usage` | `{ inputTokens, outputTokens, totalTokens }` | `0` si el destino no informa. |
| `model` | `string` | Modelo real que respondió. |
| `destination` | `string` | Destino de `config.json` que respondió. |
| `attempts` | `FailedAttempt[]` | Destinos que fallaron antes (`destination`, `model`, `status?`, `message`). Vacío si el primero respondió. |

**Errores** (`src/llm/errors.ts`): todos son `LlmError` con `retryable`.

## Fallbacks

Cada modelo lógico tiene una lista de destinos, probados en orden.

- **Error pasajero** (408, 429, 5xx, timeout, caída de red): se prueba el siguiente destino.
- **Error de la petición** (400, 401...): se lanza al instante; fallaría igual en cualquier otro destino.
- **Todos fallan**: `AllDestinationsFailedError`, con la lista de intentos en `attempts`.

## Cómo se añade un destino nuevo

Si el destino habla un formato que ya existe (`openai` o `anthropic`), **no hay que tocar código**:

1. **Variables de entorno.** Añade la URL y la clave a `.env` y a `.env.example` (este último, sin valores).
2. **`config.json`.** Declara el destino:
   ```json
   "destinations": {
     "mi_destino": {
       "format": "openai",
       "base_url_env": "MI_DESTINO_BASE_URL",
       "api_key_env": "MI_DESTINO_API_KEY"
     }
   }
   ```
3. **Úsalo** en la lista de un modelo lógico (el orden es el orden de los fallbacks):
   ```json
   "logical_models": {
     "rapido": [
       { "destination": "curso", "model": "fast" },
       { "destination": "mi_destino", "model": "nombre-real-del-modelo" }
     ]
   }
   ```

Los errores de configuración saltan al arrancar, no en la primera petición:

- `loadConfig` falla si falta una sección, un campo o si un modelo apunta a un destino que no existe.
- `createLlmClient` falla si falta una variable de entorno o si el formato es desconocido.

### Si el formato es nuevo

Hay que añadir un adaptador, que es el único sitio donde se nota la diferencia entre proveedores:

1. Crea `src/llm/adapters/<formato>.ts` con una clase que implemente `Adapter`. Debe traducir la petición y la respuesta al contrato, y convertir los errores del SDK en `LlmError` (con `retryable` según el estado HTTP, usando `isRetryableStatus`).
2. Regístralo en `defaultFactories` (`src/llm/adapters/index.ts`) con una línea.
3. Escribe sus tests junto al adaptador (mira `openai.test.ts` como modelo).

Solo `src/llm/adapters/` puede importar SDK de proveedores; un test lo comprueba.

## Evidencias

Las capturas de pantalla de cada comprobación están en la carpeta [`evidencias/`](evidencias/). En las de llamadas reales se ve el campo `Destino`, que indica qué destino respondió.

| Captura | Comprobación | Comando |
|---|---|---|
| [`01_contrato_formato_openai.png`](evidencias/01_contrato_formato_openai.png) | El contrato con el formato OpenAI | `npm run probar -- rapido` |
| [`02_contrato_formato_anthropic.png`](evidencias/02_contrato_formato_anthropic.png) | El mismo contrato con el formato Anthropic | `npm run probar -- --config pruebas/config-anthropic.json rapido` |
| [`03_la_configuracion_manda.png`](evidencias/03_la_configuracion_manda.png) | El destino lo decide la configuración, no el código | `grep -n '"rapido"' config.json pruebas/config-anthropic.json` |
| [`04_prueba_fallback.png`](evidencias/04_prueba_fallback.png) | Fallback ante un error pasajero | `npm run probar -- --config pruebas/config-fallback.json fallback` |
| [`05_prueba_fallback_clave_erronea_fin.png`](evidencias/05_prueba_fallback_clave_erronea_fin.png) | Un error de la petición no activa el fallback | `npm run probar -- --config pruebas/config-sin-fallback.json sin_fallback` |
| [`06_prueba_fallback_todos_intentos_fallan.png`](evidencias/06_prueba_fallback_todos_intentos_fallan.png) | Todos los destinos fallan | `npm run probar -- --config pruebas/config-fallback.json fallback` |
| [`07_1_resumidor_solo_usa_el_cliente.png`](evidencias/07_1_resumidor_solo_usa_el_cliente.png) | El resumidor solo importa el cliente | `grep -n "from " src/summarizer/summarizer.ts` |
| [`07_2_solo_archivos_adapters_importan_proveedores.png`](evidencias/07_2_solo_archivos_adapters_importan_proveedores.png) | Solo los adaptadores importan los SDK | `grep -rlE 'from "(openai\|@anthropic-ai/sdk)"' src --include='*.ts' --exclude='*.test.ts'` |
| [`08_todos_los_tests.png`](evidencias/08_todos_los_tests.png) | Todos los tests pasan | `npm run test:coverage` |

Las capturas 04, 05 y 06 fuerzan cada escenario con variables de entorno puestas delante del comando, y usan las configuraciones de [`pruebas/`](pruebas/):

- **04:** `ROTO_BASE_URL=http://127.0.0.1:9 ROTO_API_KEY=x` (el primer destino es un servidor que no existe).
- **05:** `CLAVE_MALA=clave-invalida` (el primer destino usa una clave inválida).
- **06:** las de la 04 más `OPENAI_BASE_URL=http://127.0.0.1:9` (el segundo destino también es inalcanzable).

## Comandos

```
npm test                 # tests
npm run test:coverage    # tests con cobertura
npm run typecheck        # revisa los tipos
npm run build            # compila a dist/
npm run probar           # prueba manual del cliente contra el proxy real
npm run resumir -- textos/inteligencia-artificial.txt   # prueba manual del resumidor
```
