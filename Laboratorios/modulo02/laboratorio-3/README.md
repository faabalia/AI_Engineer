# Resumidor

CLI mínimo que resume un texto en 3 puntos y muestra los tokens consumidos.

## Requisitos

- Node.js 18+
- Un archivo `.env` con:

```
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
MODELO=...
```

## Instalación

```
npm install
```

## Uso

```
npm run resumir -- [opciones] "<texto>" | <archivo>
```

Ejemplos:

```
npm run resumir -- "Texto a resumir..."
npm run resumir -- textos/ejemplo.txt
npm run resumir -- --stream --max-tokens 200 textos/ejemplo.txt
```

## Opciones

| Opción | Descripción |
|---|---|
| `--json` | Imprime la respuesta completa (`id`, `model`, `finish_reason`, `usage`…) |
| `--stream` | Muestra el texto según llega y mide el tiempo hasta el primer trozo |
| `--max-tokens N` | Tope de tokens de salida; si se corta, avisa (`finish_reason: length`) |
| `--stop X` | Corta la respuesta al generar la cadena `X` (p. ej. `--stop "3."`) |
| `--timeout S` | Timeout en segundos (por defecto 30; admite decimales) |

## Comportamiento

- Reintenta hasta 4 intentos en errores 429, 5xx, timeouts y errores de conexión, con espera exponencial aleatoria (máx. 30 s). No reintenta 400, 401, 403 ni 404.
- Los errores terminan en una sola línea (`Error: ...`) con código de salida 1.
- Para probar con fallos reales: `MODELO=chaos npm run resumir -- "texto"`.

## Estructura

- `src/resumir.ts`: CLI.
- `src/llm.ts`: llamada al modelo, streaming, lectura de respuesta y reintentos.
- `src/llm.test.ts`: pruebas (`npm test`).
- `textos/ejemplo.txt`: texto de ejemplo de 200 líneas.
