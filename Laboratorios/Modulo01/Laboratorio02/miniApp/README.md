# miniApp

Aplicación de línea de comandos (TypeScript) que envía un texto a un modelo de lenguaje a través de la API de OpenAI (o un proveedor compatible) y resuelve una de tres tareas: **resumir**, **clasificar** o **extraer** un importe. Al final muestra el motivo de fin y los tokens consumidos.

## Requisitos

- Node.js 18 o superior (se usa `await` de nivel superior y módulos ES).
- Una clave de API y, si usas un gateway o proveedor compatible, su URL base.

## Instalación

```bash
npm install
```

## Configurar el `.env`

La app lee su configuración del archivo `.env` (con `dotenv`), así la clave no aparece en el código. El `.env` real **no se versiona** (está en `.gitignore`); el repositorio incluye `.env.example` como plantilla.

1. Copia la plantilla:

   ```bash
   cp .env.example .env
   ```

2. Edita `.env` y rellena los valores:

   | Variable | ¿Obligatoria? | Descripción |
   |---|---|---|
   | `OPENAI_API_KEY` | Sí | Clave de API del proveedor. |
   | `OPENAI_BASE_URL` | Solo si usas un gateway o proveedor compatible con OpenAI | URL base de la API, por ejemplo `https://tu-endpoint.example.com/v1`. Si usas OpenAI directamente, puedes quitar esta línea. |
   | `MODELO` | No (por defecto `fast`) | Nombre del modelo a usar. |

   Ejemplo:

   ```env
   OPENAI_API_KEY=tu_clave_aqui
   OPENAI_BASE_URL=https://tu-endpoint.example.com/v1
   MODELO=fast
   ```

Notas: no pongas comillas ni espacios alrededor del `=`, y nunca subas el `.env` a un repositorio ni lo compartas.

## Cómo ejecutarla

```bash
npx tsx miniApp.ts [--tarea=resumir|clasificar|extraer] "Texto a procesar"
npx tsx miniApp.ts [--tarea=resumir|clasificar|extraer] < texto.txt
```

- **Tareas**: `resumir` (por defecto) devuelve 3 puntos clave; `clasificar` responde con una categoría de soporte (facturación, error técnico, cuenta/acceso, consulta general, queja); `extraer` devuelve el importe total mencionado, o `NO ENCONTRADO`.
- **Texto**: pásalo como primer argumento entre comillas o redirige un archivo con `<`. Si no das texto, se muestra el mensaje de uso y el programa termina con error.

Ejemplos (la carpeta `textos/` trae archivos de prueba):

```bash
npx tsx miniApp.ts < textos/medio.txt
npx tsx miniApp.ts --tarea=extraer < textos/factura.txt
npx tsx miniApp.ts --tarea=clasificar "No puedo entrar a mi cuenta desde ayer"
```

Salida: el resultado del modelo, seguido de `[fin]` (`stop` si terminó bien, `length` si se cortó por el límite de 512 tokens) y `[tokens]` con los tokens de entrada y salida.

Problemas frecuentes: si aparece un error de autenticación, revisa `OPENAI_API_KEY`; si falla la conexión o el modelo no existe, revisa `OPENAI_BASE_URL` y `MODELO`.
