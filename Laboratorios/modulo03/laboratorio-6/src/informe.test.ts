import { describe, expect, it } from "vitest";
import { calcularInforme, UMBRAL_ACIERTO } from "./informe.js";
import type { Ejecucion, Muestra } from "./runner.js";

/** Crea una muestra de un caso cuya esperada es "apto". */
function muestra(respuesta: string, ms = 100): Muestra {
  return { casoId: "c", esperada: "apto", respuesta, ms };
}

function ejecucion(parcial: Partial<Ejecucion> & { muestras: Muestra[] }): Ejecucion {
  return { modelo: "fast", prompt: "vago", conjunto: "dev", repeticion: 1, ...parcial };
}

describe("calcularInforme", () => {
  it("calcula mínimo, medio y máximo entre repeticiones", () => {
    const ejecuciones = [
      ejecucion({ repeticion: 1, muestras: [muestra("apto"), muestra("x"), muestra("x"), muestra("x")] }), // 25
      ejecucion({ repeticion: 2, muestras: [muestra("apto"), muestra("apto"), muestra("x"), muestra("x")] }), // 50
      ejecucion({ repeticion: 3, muestras: [muestra("apto"), muestra("apto"), muestra("apto"), muestra("x")] }), // 75
    ];
    const [fila] = calcularInforme(ejecuciones);

    expect(fila).toMatchObject({ aciertoMinimo: 25, aciertoMedio: 50, aciertoMaximo: 75, repeticiones: 3 });
  });

  it("calcula el tiempo medio sobre todas las llamadas del grupo", () => {
    const ejecuciones = [
      ejecucion({ muestras: [muestra("apto", 100), muestra("apto", 300)] }),
      ejecucion({ repeticion: 2, muestras: [muestra("apto", 200)] }),
    ];
    const [fila] = calcularInforme(ejecuciones);
    expect(fila?.tiempoMedioMs).toBe(200);
  });

  it("agrupa por modelo, prompt y conjunto y mantiene el orden de aparición", () => {
    const ejecuciones = [
      ejecucion({ modelo: "fast", prompt: "vago", conjunto: "dev", muestras: [muestra("apto")] }),
      ejecucion({ modelo: "fast", prompt: "vago", conjunto: "holdout", muestras: [muestra("x")] }),
      ejecucion({ modelo: "smart", prompt: "concreto", conjunto: "dev", muestras: [muestra("apto")] }),
      ejecucion({ modelo: "fast", prompt: "vago", conjunto: "dev", repeticion: 2, muestras: [muestra("x")] }),
    ];
    const filas = calcularInforme(ejecuciones);

    expect(filas.map((f) => `${f.modelo}/${f.prompt}/${f.conjunto}/${f.repeticiones}`)).toEqual([
      "fast/vago/dev/2",
      "fast/vago/holdout/1",
      "smart/concreto/dev/1",
    ]);
    expect(filas[0]?.aciertoMedio).toBe(50);
  });

  it("supera el umbral cuando el acierto medio lo alcanza (>=), no con el máximo", () => {
    const justo = ejecucion({ muestras: [muestra("apto"), muestra("apto"), muestra("apto"), muestra("x")] }); // 75
    const bajo = ejecucion({ muestras: [muestra("apto"), muestra("apto"), muestra("x"), muestra("x")] }); // 50

    expect(calcularInforme([justo])[0]?.superaUmbral).toBe(true);
    expect(calcularInforme([bajo])[0]?.superaUmbral).toBe(false);
    // Una repetición a 100 no basta si la media queda por debajo: 100 y 50 -> media 75 (justo); 100 y 0 -> 50.
    const mezcla = [
      ejecucion({ muestras: [muestra("apto")] }),
      ejecucion({ repeticion: 2, muestras: [muestra("x")] }),
    ];
    expect(calcularInforme(mezcla)[0]).toMatchObject({ aciertoMaximo: 100, aciertoMedio: 50, superaUmbral: false });
  });

  it("acepta un umbral distinto", () => {
    const e = ejecucion({ muestras: [muestra("apto"), muestra("x")] }); // 50
    expect(calcularInforme([e], 50)[0]?.superaUmbral).toBe(true);
    expect(calcularInforme([e], 51)[0]?.superaUmbral).toBe(false);
  });

  it("el umbral por defecto es 75", () => {
    expect(UMBRAL_ACIERTO).toBe(75);
  });

  it("una llamada fallida (respuesta vacía) cuenta como fallo", () => {
    const e = ejecucion({ muestras: [muestra("apto"), { ...muestra(""), error: "timeout" }] });
    expect(calcularInforme([e])[0]?.aciertoMedio).toBe(50);
  });

  it("cuenta las llamadas y las que terminaron con error", () => {
    const conError = { ...muestra(""), error: "429" };
    const e1 = ejecucion({ muestras: [muestra("apto"), conError, conError] });
    const e2 = ejecucion({ repeticion: 2, muestras: [muestra("apto"), muestra("x")] });
    expect(calcularInforme([e1, e2])[0]).toMatchObject({ llamadas: 5, llamadasConError: 2 });
  });

  it("devuelve una lista vacía si no hay ejecuciones", () => {
    expect(calcularInforme([])).toEqual([]);
  });
});
