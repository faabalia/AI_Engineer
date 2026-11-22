# Análisis del laboratorio 4

## 1. Qué tuve que cambiar en el resto del cliente al añadir el adaptador de Anthropic

**Respuesta corta:** el cliente (`LlmClient`) no cambió nada. Lo que cambió fue el adaptador, la configuración y una línea en la fábrica. Pero al añadir Anthropic encontré cuatro sitios donde el contrato no era tan neutral como yo creía.

Diseñé el contrato pensando desde el principio en los dos formatos, no uno después del otro. Por eso no hizo falta tocar `LlmClient`: solo conoce el contrato y la lista de destinos de la configuración. Esa era la idea de tener un adaptador por formato.

### Lo que sí tocó

- **El adaptador nuevo (`adapters/anthropic.ts`).** Es el único sitio donde se nota la diferencia con OpenAI. Allí traduzco los mensajes, la respuesta y los errores.
- **`config.json`.** Declarar el destino `curso_anthropic` con su formato y sus variables de entorno.
- **Una línea en `defaultFactories`** (`adapters/index.ts`) para que el formato `anthropic` sepa qué adaptador crear.
- **Un comentario en el contrato** sobre `temperature` (ver más abajo).

### Lo que me tuve que pensar (diferencias entre las dos APIs)

| Diferencia | Cómo lo resolví |
|---|---|
| Anthropic no admite mensajes `system` dentro de la lista; van en un campo aparte. | El adaptador los separa. El contrato sigue permitiendo el rol `system`, así que la aplicación no se entera. |
| Anthropic obliga a indicar `max_tokens`; OpenAI no. | El adaptador pone 1024 si no se indica. |
| Los motivos de parada tienen nombres distintos (`end_turn`, `max_tokens`... frente a `stop`, `length`...). | El contrato tiene su propio `stopReason` y cada adaptador traduce. |
| Los tokens se llaman distinto (`input_tokens` frente a `prompt_tokens`). | El contrato tiene `usage` con `inputTokens`, `outputTokens` y `totalTokens`. |
| Las clases de error son parecidas pero distintas en cada SDK. | Cada adaptador convierte sus errores en un `LlmError` con `retryable`. |

### Qué mejoraría del contrato

Esto es lo que me ha parecido mejorable después de ver los dos adaptadores juntos:

1. **`temperature` no es tan neutral como parece.** Según la documentación de Anthropic, desde la versión de API 2026-10-21 `temperature`, `top_p` y `top_k` ya no se admiten y dan un 400. Mi adaptador de Anthropic simplemente la ignora, pero entonces el contrato dice una cosa («puedes pedir esta temperatura») y un destino hace otra. La aplicación no se entera de que se ha ignorado. Dos opciones: quitar `temperature` del contrato hasta que de verdad la necesite, o devolver en la respuesta qué parámetros se ignoraron.
2. **El valor por defecto de `max_tokens` está escondido en un adaptador.** Con OpenAI, si no lo indico, manda el servidor; con Anthropic, mando yo 1024. Eso significa que el mismo código puede devolver respuestas cortadas solo en un destino. Sería mejor que el valor por defecto fuera uno solo y viviera en el cliente o en la configuración, para que todos los destinos se comporten igual.
3. **`usage` con ceros cuando el destino no informa.** Si el destino no da los tokens, pongo 0. Pero 0 significa «no gastó nada», y lo que realmente pasa es «no lo sé». Mejor que esos campos puedan ser `undefined`.
4. **`stopReason` pierde información.** Casos como `tool_use` acaban en `other`, y `refusal` de Anthropic acaba como `content_filter`. Para depurar, ayudaría guardar también el motivo original como texto, sin tipos de ningún proveedor.

También veo una mejora que no es del contrato sino del código: **la función que traduce los errores está casi duplicada** en los dos adaptadores (`translateError`). La diferencia es solo qué clases de error comprueba cada SDK. Mientras haya dos adaptadores no es grave, pero con un tercero sí compensaría compartir la parte común.

Por último, el campo `attempts` de la respuesta no lo añadí por Anthropic. Lo añadí después, al probar con `chaos`, porque no se veía por qué había fallado el primer destino.

## 2. Por qué un 400 no debe activar el fallback

El fallback sirve para cuando **falla el destino**, no para cuando **falla la petición**:

- **Errores pasajeros** (408, 429, 5xx, timeout, caída de red): el problema es del destino en ese momento. Está saturado, caído o lento. Otro destino puede responder la misma petición sin problema, así que merece la pena probarlo.
- **Un 400** significa que la petición está mal: un parámetro inválido, un cuerpo mal formado, un texto demasiado largo. El problema va en lo que enviamos, y si enviamos lo mismo a otro destino, lo normal es que falle igual.

Las razones concretas para no hacer fallback:

1. **Gasta tiempo y dinero para nada.** Cada intento extra es otra llamada de red, con su espera (hasta el timeout de 30 s) y, según el proveedor, posible consumo de cuota. Probar tres destinos con la misma petición rota solo multiplica el desperdicio.
2. **Esconde el error de verdad.** Si el fallback se activara con un 400, el resultado sería un `AllDestinationsFailedError` con varios errores iguales, o peor, una respuesta correcta de un segundo destino que oculta que la petición estaba mal. Es mejor ver el 400 enseguida, con su mensaje, para arreglar la causa.
3. **Convierte un fallo en un comportamiento incierto.** Si la misma petición a veces va a un destino y a veces a otro según un error que en realidad era mío, los resultados dejan de ser predecibles.

En el código, esto se decide en un único sitio: el adaptador marca el error con `retryable` usando el estado HTTP (`isRetryableStatus`), y el cliente solo mira ese campo. Hay un test que comprueba que con un 400 no se llama al siguiente destino, y lo probé con el cliente real usando una clave inválida (comprobación 5 de los pantallazos).

### Matices que he aprendido

- **«Fallaría igual en cualquier destino» es una buena aproximación, no una ley.** Un 400 puede ser específico de un destino. Mi propio caso: `temperature` da un 400 en Anthropic pero OpenAI la acepta. Pero la solución correcta ahí no es el fallback: es arreglar el adaptador para que no la envíe.
- **El 401 y el 403 son un caso discutible.** Una clave inválida es un problema de ese destino, y otro destino con su propia clave podría responder. Aun así los traté como no pasajeros, porque lo normal es que sean un error de configuración que alguien debe notar, y un fallback silencioso lo taparía. Si algún día lo cambio, tendría que ser una decisión consciente y dejando rastro en `attempts`.

## Qué me llevo

- Separar el contrato de los proveedores funciona: añadir un formato no tocó el cliente.
- Pero un contrato «común» siempre esconde decisiones (valores por defecto, parámetros que algunos destinos no admiten), y esas decisiones conviene hacerlas visibles en vez de dejarlas dentro de un adaptador.
- Distinguir entre «el destino falla» y «mi petición falla» es lo que hace que un plan de fallbacks ayude en lugar de empeorar los problemas.
