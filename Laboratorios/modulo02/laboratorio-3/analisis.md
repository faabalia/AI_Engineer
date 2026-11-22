# Análisis: qué aprendí y qué retos encontré

Este documento resume, con palabras sencillas, lo que se aprende al construir el resumidor y las dificultades que aparecieron por el camino.

---

## 1. Lo que aprendí

### 1.1 Una llamada al modelo devuelve mucho más que texto

Al principio solo mostraba el resumen. Pero la respuesta trae más información útil:

| Campo | Qué significa |
|---|---|
| `id` | Identificador único de la respuesta (sirve para depurar) |
| `model` | Qué modelo respondió de verdad |
| `finish_reason` | **Por qué** terminó de escribir |
| `usage` | Cuántos tokens se gastaron (entrada, salida y total) |

El campo `finish_reason` es el más importante para entender qué pasó:

- `stop`: terminó de forma natural (o porque encontró la cadena de `--stop`).
- `length`: se quedó sin tokens y **se cortó a medias**.
- `content_filter`: el contenido fue bloqueado.

**Lección:** no basta con pintar el texto. Hay que mirar *por qué* terminó, porque una respuesta cortada parece correcta pero está incompleta.

### 1.2 Una respuesta "exitosa" puede ser inútil

Que el servidor responda sin error no significa que la respuesta sirva. Puede venir vacía, el modelo puede negarse (`refusal`) o el filtro puede bloquearla. Por eso escribí `readResponse`: una función que **comprueba** la respuesta y lanza un error claro si algo va mal.

### 1.3 Separar instrucciones, mensajes y parámetros

En `callModel` cada cosa va por separado:

- **Instrucciones** (`system`): cómo debe comportarse el modelo.
- **Mensajes** (`messages`): lo que dice el usuario.
- **Parámetros** (`max_tokens`, `stop`): límites técnicos.

Así puedo cambiar una pieza sin tocar las demás. Por ejemplo, cambiar el límite de tokens sin tocar el prompt.

### 1.4 Los tokens son el "dinero" del modelo

Todo se mide en tokens: lo que envío y lo que recibo. El texto de 200 líneas gastó unos 4 000 tokens solo de entrada, mientras que la respuesta fueron unos 200. Con `--max-tokens` pongo un tope a lo que el modelo puede escribir, y con `--stop` le digo en qué texto debe parar.

### 1.5 Streaming: mismo resultado, mejor sensación

Con streaming el texto aparece poco a poco, en vez de esperar a tenerlo todo. Medí dos tiempos:

- **Primer trozo:** cuánto tarda en aparecer la primera palabra (≈1,1 s).
- **Total:** cuánto tarda en terminar (≈2,2 s, parecido al modo normal).

El total casi no cambia. Lo que mejora es la **sensación de rapidez**: el usuario ve algo a la primera palabra en vez de esperar sin ver nada. Para recibir los tokens en streaming hay que pedirlo con `stream_options: { include_usage: true }`; si no, el consumo no llega.

### 1.6 Las redes fallan, y hay que prepararse

Un programa que llama a un servicio externo **va a fallar a veces**. Lo importante es distinguir qué hacer:

| Error | Qué significa | ¿Reintentar? |
|---|---|---|
| 429 | Demasiadas peticiones | Sí, esperando un poco |
| 5xx (ej. 503) | El servidor tiene un problema | Sí |
| Timeout / conexión | La red no respondió a tiempo | Sí |
| 400 | Mi petición está mal hecha | **No** |
| 401 / 403 | No tengo permiso o clave | **No** |
| 404 | No existe lo que pido | **No** |

La idea clave: **reintentar un error que es culpa mía no sirve de nada**, solo gasta tiempo. Reintentar un fallo pasajero del servidor sí tiene sentido.

### 1.7 Esperar cada vez más, y de forma aleatoria (backoff con jitter)

Si el servidor está saturado y todos reintentamos a la vez, empeoramos el problema. La solución tiene dos partes:

1. **Backoff exponencial:** esperar cada vez más (1 s, 2 s, 4 s…) hasta un máximo de 30 s.
2. **Jitter:** elegir un tiempo **aleatorio** entre 0 y ese máximo, para que los clientes no reintenten sincronizados.

La fórmula: `espera = aleatorio(0, min(30 s, 1 s × 2^intento))`, con un máximo de 4 intentos.

### 1.8 Probar sin depender del servidor

Las llamadas reales son lentas, aleatorias y a veces cuestan dinero. Para probar la lógica de reintentos usé **funciones falsas** que fallan a propósito con un 503 o un 400. Así las pruebas son rápidas y siempre dan el mismo resultado. Para eso hice que `sleep` y `random` se puedan "inyectar": en las pruebas los sustituyo por versiones que no esperan de verdad.

### 1.9 Organizar el código en capas

Separé el proyecto en tres partes:

- `llm.ts`: la lógica (llamar, validar, reintentar). No imprime nada.
- `resumir.ts`: la interfaz de línea de comandos.
- `llm.test.ts`: las pruebas.

Como la lógica no depende de la consola, se puede probar sola. Esta separación me ahorró mucho trabajo.

---

### Reto 1: Errores de TypeScript con `node:fs` y `process`
**Problema:** el editor marcaba `Cannot find name 'node:fs'` y `'process'`.
**Causa:** TypeScript no conocía los tipos de Node, y faltaba un `tsconfig.json`.
**Solución:** instalar `@types/node` y `typescript`, y crear `tsconfig.json` con `"types": ["node"]`.
**Aprendizaje:** `tsx` ejecuta el código aunque haya errores de tipos, así que el programa *funcionaba* mientras el editor se quejaba. Son dos cosas distintas: ejecutar y comprobar tipos.

### Reto 2: Streaming y el último trozo
**Problema:** en streaming, los tokens no llegaban.
**Causa:** el último trozo trae `usage` pero con `choices` vacío. Si el código se salta los trozos sin `choices`, se pierde el consumo.
**Solución:** guardar `usage` **antes** de comprobar si hay `choices`.

### Reto 3 Que streaming y no-streaming devuelvan lo mismo
**Problema:** quería la misma forma de resultado en ambos modos.
**Solución:** en streaming voy acumulando el texto y al final construyo un objeto con la misma forma que una respuesta normal, y lo paso por `readResponse`. Así hay una sola validación para los dos.

### Reto 4: Un timeout también se reintenta
**Observación:** con `--timeout 0.001` el programa hizo 3 reintentos antes de fallar con `Request timed out`. Parece raro, pero es lo correcto según los requisitos: un timeout es un fallo pasajero de red. El resultado final sigue siendo un error de una sola línea.

### Reto 5: El presupuesto agotado
**Problema:** el enunciado dice que no se reintente cuando se agota el presupuesto, pero un 429 puede significar dos cosas distintas: "vas muy rápido" (se reintenta) o "se acabó tu dinero" (no).
**Solución provisional:** no reintentar un 429 cuyo mensaje o código contenga palabras como `budget`, `quota` o `insufficient`.
**Pendiente:** todavía no vi el error real del servicio, así que esta regla es una suposición que habrá que ajustar.

### Reto 6: Probar errores aleatorios
**Problema:** con el modelo `chaos` los fallos son al azar, así que no se puede predecir cuándo saldrá un reintento.
**Solución:** ejecutar varias veces. En 10 ejecuciones, 6 pasaron a la primera, 3 tras reintentos y 1 falló tras agotar los 4 intentos. Eso es justo lo que se espera de algo aleatorio.

---

## 3. Resultados que me sorprendieron

- La respuesta de 200 líneas gastó **~4 154 tokens de entrada** pero solo ~220 de salida. Entrada y salida se cuentan por separado.
- Con `--max-tokens 10` la respuesta se corta en mitad de una palabra ("La energía solar y eól"). El modelo no "termina bonito" cuando se queda sin tokens.
- El texto del resumen **cambia entre ejecuciones** (los tokens de salida variaron entre 223 y 245). Por eso comparar el número exacto de tokens entre dos ejecuciones no prueba que algo esté mal.
- Una sola medición de tiempo no es fiable: hay que repetir varias veces para comparar con y sin streaming.

---

## 4. Resumen en una frase

Llamar a un modelo es fácil; lo difícil es **hacerlo de forma fiable**: leer bien la respuesta, saber por qué terminó, controlar el coste en tokens y reaccionar con cabeza cuando algo falla (reintentar lo pasajero, no continuar ante lo permanente).

## 5. Ideas para seguir practicando

- Observar el error real de "presupuesto agotado" y ajustar `isTransient`.
- Provocar un 400 real (por ejemplo, con un modelo inexistente) y comprobar que no se reintenta.
- Comparar con y sin streaming varias veces y calcular la media.
- Añadir una prueba automática para `callModelStreaming` con un flujo falso.
