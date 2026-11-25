# Laboratorio 6: banco de pruebas para un asistente de selección de personal

Clasifica CVs como `apto`, `descartar` o `revisar` y mide el porcentaje de acierto de cada combinación de modelo (`fast`, `smart`) y variante de prompt (`vago`, `concreto`, `vago+esquema`, `concreto+esquema`). Cada combinación se ejecuta 5 veces sobre el dev set (18 CV) y sobre el hold-out set (6 CV), y el informe muestra por separado cada conjunto.

## Ejecutarlo

```bash
npm install
cp .env.example .env     # y rellena OPENAI_API_KEY
npm run evaluar -- --pausa 4000
```

La ejecución completa son unas 960 llamadas reales (2 modelos x 4 variantes x 24 CV x 5 repeticiones). Con la pausa de 4 s tarda más de una hora.

El estudio se hace solo con salida por esquema, para que el formato quede garantizado y el acierto mida la calidad de la decisión (2 modelos x 2 variantes x 24 CV x 5 repeticiones = 480 llamadas):

```bash
npm run evaluar -- --variantes vago+esquema,concreto+esquema --pausa 4000
```

Tarda unos 40 minutos. En macOS, `caffeinate -i` evita que el equipo se duerma durante la ejecución:

```bash
caffeinate -i npm run evaluar -- --variantes vago+esquema,concreto+esquema --pausa 4000
```

Otros comandos:

| Comando | Qué hace |
| --- | --- |
| `npm test` | Ejecuta los tests (no usa el proxy) |
| `npm run typecheck` | Comprueba los tipos |
| `npm run test:coverage` | Tests con cobertura |
| `npm run ejemplo-tabla` | Imprime el informe con datos fijos de ejemplo, para ver el formato sin llamar al proxy |
| `npm run evaluar:falso` | Ejecuta el banco con un modelo que no existe (`fast-falso`): 1 repetición, solo variantes con esquema, 48 llamadas que fallan al instante (el proxy responde `401 key not allowed to access model`) |

### Opciones del script

| Opción | Qué hace | Por defecto |
| --- | --- | --- |
| `--modelos fast,smart` | Modelos a probar (ids del proxy, separados por comas) | `fast,smart` |
| `--variantes vago,concreto` | Variantes a ejecutar | todas |
| `--repeticiones 3` | Repeticiones por combinación | `5` |
| `--pausa 4000` | Milisegundos de espera entre llamadas | `1000` |

Se pasan después de `--`. Ejemplos:

```bash
# Prueba corta: un modelo, una repetición (96 llamadas)
npm run evaluar -- --modelos fast --repeticiones 1 --pausa 4000

# Solo la variante con esquema
npm run evaluar -- --modelos fast --variantes concreto+esquema --repeticiones 1 --pausa 4000

# Modelo que no existe en el proxy: todas las llamadas fallan (0 % de acierto y aviso de errores en todas las filas)
npm run evaluar:falso
```

## Cómo leer la tabla

```
modelo  prompt  conjunto  acierto (mín/medio/máx)  tiempo medio  umbral
fast    v2      dev       94% / 94% / 94%          0.5 s         ✓
```

- **prompt:** `v1` es el prompt vago y `v2` el concreto. Con esquema se muestran como `v1` y `v2`; sin esquema, como `v1 texto` y `v2 texto`.
- **acierto:** mínimo, medio y máximo entre repeticiones. La respuesta se normaliza (sin espacios ni mayúsculas) y debe ser exactamente la etiqueta esperada. Cualquier otra cosa cuenta como fallo.
- **umbral:** `✓` si el acierto **medio** alcanza el 75 %.
- **Aviso de errores:** si alguna llamada falló (por ejemplo, un 429 del proxy), debajo de la tabla aparece un aviso con las combinaciones afectadas. Esas llamadas cuentan como fallo de acierto, así que **el acierto de esas filas queda por debajo del real**.

Después de la tabla, el script lista los **casos que fallaron** (dev y hold-out): combinación, caso, etiqueta esperada, en cuántas repeticiones falló y qué respondió el modelo. Las llamadas que terminaron en error salen marcadas como `[error: ...]`.

### Evidencia en archivo

Además de mostrar el resultado por consola, el script lo guarda en `evidencias/evidencia-yyyymmdd-hhmmss.txt` (hora local; la carpeta se crea si no existe). El archivo contiene el umbral, la tabla, el aviso de errores (si lo hubo) y los casos fallados, sin las líneas de progreso. Cada ejecución genera un archivo nuevo, también la del modelo falso. Al terminar, el script imprime la ruta.

## Límite del proxy (error 429)

El proxy responde `429 Too many requests` si recibe demasiadas llamadas seguidas, y parece un límite compartido, así que puede aparecer algún 429 suelto aunque uses pausa.

- Las llamadas van una a una, con una pausa configurable (`--pausa`). La pausa no cuenta en el tiempo medido. Con 1 s siguió habiendo muchos 429; con 4 s casi desaparecen.
- Además, el agente reintenta con `modelRetryMiddleware` hasta 5 veces, con 1 s de espera inicial que crece x1.5 en cada intento, solo ante errores pasajeros (429, 408, 409, 5xx y fallos de conexión). **Esos reintentos sí cuentan en el tiempo medido**, así que si hubo 429 los tiempos pueden salir inflados.

## Estructura

| Archivo | Qué contiene |
| --- | --- |
| `dataset.json` | Casos `dev` y `holdout`, cada uno con `id`, `cv` y `esperada` |
| `src/dataset.ts` | Carga y valida el dataset (etiquetas válidas, ids únicos) |
| `src/puesto.ts` | Puesto y criterios de decisión |
| `src/prompts.ts` | Las variantes: texto del prompt y si la salida usa esquema |
| `src/runner.ts` | Recorre modelo x variante x conjunto x repeticiones |
| `src/clasificador.ts` | Agente de LangChain (`createAgent`, sin tools): el prompt va en `systemPrompt`, el CV como mensaje del usuario, la decisión con `responseFormat` (zod) y reintentos con `modelRetryMiddleware` |
| `src/acierto.ts` | Normalización y porcentaje de acierto |
| `src/informe.ts`, `src/tabla.ts` | Estadísticas por combinación y tabla de texto |
| `src/fallos.ts` | Lista de casos fallados con lo que respondió el modelo |
| `src/evidencia.ts` | Texto del resultado y guardado en `evidencias/` |
| `src/ejemplo.ts` | Filas de ejemplo con datos fijos (las usan el test del formato y `ejemplo-tabla`) |
| `src/scripts/ejecutar.ts` | Script que lo une todo |
| `src/scripts/ejemplo-tabla.ts` | Imprime el informe de ejemplo |

## El agente

`src/clasificador.ts` crea un agente con `createAgent` la primera vez que se usa cada combinación de modelo, prompt y modo de salida (con o sin esquema), y lo reutiliza en el resto de llamadas:

- `tools: []`: solo clasifica, no necesita herramientas.
- `systemPrompt`: el prompt de la variante. El CV se envía como mensaje del usuario.
- `responseFormat`: con esquema, el agente devuelve `structuredResponse.decision`; sin esquema, se devuelve el texto del último mensaje.
- `middleware`: `modelRetryMiddleware` para los fallos pasajeros del proxy. Solo reintenta 429, 408, 409, 5xx y fallos de conexión; el resto de errores (por ejemplo 400, 401 o 404) fallan al instante, sin esperas.
- `invoke(..., { recursionLimit: 5 })`: acota los pasos del agente. El modelo se crea con `ChatOpenAI`, con `OPENAI_BASE_URL` indicada explícitamente.

## Evidencias

- `evidencias/`: un archivo `evidencia-yyyymmdd-hhmmss.txt` por cada ejecución (el estudio, las pruebas cortas y la del modelo falso).

## Variantes de prompt

- `vago`: pide la decisión sin criterios ni formato.
- `concreto`: puesto, criterios, formato de una palabra y CV tratado como datos.
- `vago+esquema` y `concreto+esquema`: los mismos prompts, pero la decisión se fuerza con salida estructurada (`{ decision: "apto" | "descartar" | "revisar" }`). Solo cambia el modo de salida, para aislar su efecto. Con esquema el modelo no puede responder fuera de formato.

## Añadir un modelo

Añade su identificador (el que expone el proxy) a `MODELOS` en `src/runner.ts`:

```ts
export const MODELOS = ["fast", "smart", "otro-modelo"] as const;
```

## Añadir una variante de prompt

Añade una entrada al objeto `variantes` en `src/prompts.ts`. La clave es el nombre que se usa en `--variantes`, y `etiqueta` es lo que aparece en la columna `prompt` de la tabla. `esquema: true` fuerza la decisión con salida estructurada; `false` pide texto libre:

```ts
export const variantes = {
  // ...
  conEjemplos: { prompt: promptConEjemplos, etiqueta: "v3", esquema: false },
} as const satisfies Record<string, Variante>;
```

El runner, el informe, la tabla y la opción `--variantes` leen `variantes`, así que no hay que tocar nada más.

## Aviso al añadir

`src/runner.test.ts` comprueba el número exacto de combinaciones (2 modelos x 4 variantes). Al añadir un modelo o una variante, actualiza esos tests. Además, cada combinación de modelo y variante son 120 llamadas (24 CV x 5 repeticiones), así que añadir un modelo suma 480 llamadas y añadir una variante suma 240 con la configuración actual.
