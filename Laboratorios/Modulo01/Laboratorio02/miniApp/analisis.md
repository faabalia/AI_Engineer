# Análisis — Pruebas con datos reales

Se ejecutó la mini-app (`npx tsx miniApp.ts < textos/<archivo>.txt`) con tres textos sin datos personales: uno corto, uno medio y uno largo. El texto medio se ejecutó tres veces en total (una y dos más) para ver si el resultado cambia.

## Tabla de pruebas

| Texto | Tokens entrada | Tokens salida | ¿Correcto? |
|---|---|---|---|
| Corto (abejas) | 99 | 143 | Sí: 3 puntos claros y fieles al texto |
| Medio (teletrabajo), ejecución 1 | 254 | 181 | Sí |
| Medio, ejecución 2 | 254 | 201 | Sí, con redacción distinta |
| Medio, ejecución 3 | 254 | 182 | Sí, con redacción distinta |
| Largo (energía solar) | 2612 | 254 | Sí |

En las cinco ejecuciones el motivo de fin fue `stop`: ninguna respuesta se cortó por el límite de longitud.

## Análisis

### Tokens

La entrada crece casi en proporción a la longitud del texto: de 99 a 254 y a 2612 tokens según el texto es más largo. La salida casi no crece: pasa de 143 a 254 tokens aunque el texto largo es muchísimo más extenso, porque siempre se piden 3 puntos. Lo que controlo con el límite de longitud (`max_completion_tokens`, o instrucciones como "máximo 25 palabras por punto") es la salida. Lo que no controlo es la entrada: la fija el texto del usuario, y el prompt `system` fijo se suma en cada llamada. El límite tampoco evita pagar por un texto largo; solo evita que la respuesta se alargue.

### Variabilidad

Sí cambió. En las tres ejecuciones del texto medio los puntos tratan los mismos temas (ventajas y desafíos, modelo híbrido, costes y gestión), pero la redacción y los títulos varían: el punto 1 fue "Beneficios y desafíos equilibrados" en dos ejecuciones y "Ventajas equilibradas con desafíos" en otra, y el punto 3 se tituló "Cambios en costos y gestión", "Impacto económico y de gestión" e "Inversión en nuevas áreas". Los tokens de salida también variaron (181, 201 y 182). Para estabilizarlo bajaría `temperature` a 0, aunque eso no garantiza una salida idéntica. También fijaría un formato exacto ("exactamente 3 viñetas, una frase de máximo 20 palabras, sin título ni negritas"), añadiría un ejemplo de salida esperada e indicaría el criterio de orden, por ejemplo el orden de aparición en el texto.

### Trade-offs

La tarea es resumir en 3 puntos: no requiere razonamiento complejo ni conocimiento externo, y los resultados fueron correctos y fieles en los tres textos. Por eso basta el modelo `fast`, que es Haiku (el valor por defecto en `miniApp.ts`), que además es más barato y rápido que uno grande. Todavía estoy aprendiendo a trabajar con IA, así que no sé todo lo que habría que hacer, pero con 10.000 textos al día lo que cambiaría, según lo que he entendido hasta ahora, sería esto:

- Seguiría con el modelo pequeño. Si la tarea sale bien con uno barato, no tiene sentido pagar más por uno grande, y con tantos textos el coste se nota.
- Acortaría el mensaje `system`, porque se envía en cada llamada y, multiplicado por 10.000, suma muchos tokens.
- Dejaría el límite de longitud de la respuesta y pediría un formato muy concreto, para que los resultados sean más parecidos y baratos.
- Revisaría a mano de vez en cuando algunos resultados, porque no podría leer 10.000 resúmenes y no quiero fiarme sin comprobar.
- Pensaría qué hacer con los textos muy largos (cortarlos o dividirlos) y qué pasa si la API falla o dice que hay demasiadas peticiones, por ejemplo volver a intentarlo después. Esto último tendría que buscar cómo se hace bien.
- Si no hace falta la respuesta al instante, preguntaría si hay una forma de enviarlos todos juntos más barata.

## Reto opcional — comparar `fast` con `smart`

Ejecuté el texto largo (`textos/largo.txt`) dos veces, la primera con `MODELO=fast` (Haiku) y la segunda con `MODELO=smart` (Sonnet), y medí el tiempo con `time npx tsx miniApp.ts < textos/largo.txt`, todo en una sola línea.

| | `fast` (Haiku) | `smart` (Sonnet) |
|---|---|---|
| Tokens de entrada | 2612 | 2612 |
| Tokens de salida | 254 | 219 |
| Tiempo total | 2,6 s | 4,8 s |
| Motivo de fin | `stop` | `stop` |

**Calidad.** Los dos resúmenes son correctos, fieles al texto y tienen 3 puntos que cubren las mismas ideas: la caída de costes de más del 80%, los desafíos técnicos y ambientales (intermitencia, baterías y reciclaje de paneles) y el crecimiento futuro integrado con otras renovables para descarbonizar. `fast` añade detalles como el autoconsumo doméstico y la necesidad de un respaldo regulatorio estable. `smart` es algo más conciso y menciona que los analistas prevén el crecimiento. No veo una diferencia de calidad clara a favor de ninguno: para esta tarea los dos resuelven bien.

**Consumo.** La entrada es idéntica (2612 tokens), porque depende solo del texto. La salida es menor con `smart` (219 frente a 254, unos 35 tokens menos), pero la diferencia es pequeña y se debe sobre todo a que escribió menos.

**Tiempo.** `smart` tardó 4,8 s frente a 2,6 s de `fast`, es decir, casi el doble. Solo se hizo una medición por modelo y el tiempo depende también de la red y del servicio en ese momento, así que es un dato orientativo, aunque la diferencia es lo bastante grande como para tenerla en cuenta.

**Conclusión.** Para esta tarea no compensa pasar de smart a fast. La calidad es equivalente, el consumo es casi igual y la respuesta tarda casi el doble. Resumir en 3 puntos es una tarea sencilla que `fast` resuelve bien. Solo pensaría en `smart` si la tarea exigiera más razonamiento o si los resúmenes de `fast` empezaran a fallar.
