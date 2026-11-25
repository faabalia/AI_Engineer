import { esAcierto, normalizar } from "./acierto.js";
import type { Decision } from "./acierto.js";
import type { Ejecucion } from "./runner.js";

interface Acumulado {
  modelo: string;
  prompt: string;
  conjunto: string;
  casoId: string;
  esperada: Decision;
  fallos: number;
  total: number;
  /** Qué respondió el modelo en las repeticiones en que falló, con cuántas veces. */
  respuestas: Map<string, number>;
}

function etiquetaRespuesta(respuesta: string, error: string | undefined): string {
  if (error !== undefined) {
    return `[error: ${error.replace(/\s+/g, " ").slice(0, 60)}]`;
  }
  const normalizada = normalizar(respuesta);
  return normalizada === "" ? "[vacía]" : normalizada;
}

/**
 * Lista los casos que fallaron en alguna repetición: combinación, caso, etiqueta esperada,
 * en cuántas repeticiones falló y qué respondió el modelo. Un fallo es una respuesta distinta
 * de la esperada o una llamada que terminó en error (que se marca aparte).
 */
export function detalleFallos(ejecuciones: readonly Ejecucion[]): string {
  const casos = new Map<string, Acumulado>();

  for (const ejecucion of ejecuciones) {
    for (const muestra of ejecucion.muestras) {
      const clave = `${ejecucion.modelo}|${ejecucion.prompt}|${ejecucion.conjunto}|${muestra.casoId}`;
      let acumulado = casos.get(clave);
      if (acumulado === undefined) {
        acumulado = {
          modelo: ejecucion.modelo,
          prompt: ejecucion.prompt,
          conjunto: ejecucion.conjunto,
          casoId: muestra.casoId,
          esperada: muestra.esperada,
          fallos: 0,
          total: 0,
          respuestas: new Map(),
        };
        casos.set(clave, acumulado);
      }
      acumulado.total++;
      if (!esAcierto(muestra)) {
        acumulado.fallos++;
        const etiqueta = etiquetaRespuesta(muestra.respuesta, muestra.error);
        acumulado.respuestas.set(etiqueta, (acumulado.respuestas.get(etiqueta) ?? 0) + 1);
      }
    }
  }

  const lineas = [...casos.values()]
    .filter((c) => c.fallos > 0)
    .map((c) => {
      const respuestas = [...c.respuestas].map(([texto, veces]) => `${texto} x${veces}`).join(", ");
      return `${c.modelo}  ${c.prompt}  ${c.conjunto}  ${c.casoId}  esperada: ${c.esperada}  falló ${c.fallos}/${c.total}  respondió: ${respuestas}`;
    });

  return lineas.length === 0 ? "Ningún caso falló." : lineas.join("\n");
}
