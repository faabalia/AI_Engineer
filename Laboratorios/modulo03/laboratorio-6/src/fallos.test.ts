import { describe, expect, it } from "vitest";
import { detalleFallos } from "./fallos.js";
import type { Ejecucion, Muestra } from "./runner.js";

function muestra(casoId: string, esperada: Muestra["esperada"], respuesta: string, error?: string): Muestra {
  return { casoId, esperada, respuesta, ms: 100, ...(error === undefined ? {} : { error }) };
}

function ejecucion(repeticion: number, muestras: Muestra[], parcial: Partial<Ejecucion> = {}): Ejecucion {
  return { modelo: "smart", prompt: "concreto+esquema", conjunto: "holdout", repeticion, muestras, ...parcial };
}

describe("detalleFallos", () => {
  it("dice que ningún caso falló si todo acierta", () => {
    const e = ejecucion(1, [muestra("h1", "apto", "apto"), muestra("h2", "revisar", " Revisar\n")]);
    expect(detalleFallos([e])).toBe("Ningún caso falló.");
  });

  it("con una lista vacía tampoco hay fallos", () => {
    expect(detalleFallos([])).toBe("Ningún caso falló.");
  });

  it("lista el caso fallado con esperada, repeticiones fallidas y lo que respondió", () => {
    const ejecuciones = [
      ejecucion(1, [muestra("h1", "apto", "apto"), muestra("h2", "revisar", "apto")]),
      ejecucion(2, [muestra("h1", "apto", "apto"), muestra("h2", "revisar", "revisar")]),
      ejecucion(3, [muestra("h1", "apto", "apto"), muestra("h2", "revisar", "apto")]),
    ];
    expect(detalleFallos(ejecuciones)).toBe(
      "smart  concreto+esquema  holdout  h2  esperada: revisar  falló 2/3  respondió: apto x2",
    );
  });

  it("agrupa por combinación: el mismo caso en otro modelo se cuenta aparte", () => {
    const ejecuciones = [
      ejecucion(1, [muestra("h1", "apto", "descartar")]),
      ejecucion(1, [muestra("h1", "apto", "apto")], { modelo: "fast" }),
    ];
    const detalle = detalleFallos(ejecuciones);
    expect(detalle.split("\n")).toHaveLength(1);
    expect(detalle).toContain("smart  concreto+esquema  holdout  h1");
  });

  it("separa varias respuestas distintas del mismo caso", () => {
    const ejecuciones = [
      ejecucion(1, [muestra("h1", "apto", "revisar")]),
      ejecucion(2, [muestra("h1", "apto", "descartar")]),
      ejecucion(3, [muestra("h1", "apto", "revisar")]),
    ];
    expect(detalleFallos(ejecuciones)).toContain("respondió: revisar x2, descartar x1");
  });

  it("marca las llamadas con error aparte de las respuestas incorrectas", () => {
    const e = ejecucion(1, [muestra("h1", "apto", "", "429 Too many requests"), muestra("h2", "apto", "")]);
    const detalle = detalleFallos([e]);
    expect(detalle).toContain("[error: 429 Too many requests] x1");
    expect(detalle).toContain("[vacía] x1");
  });

  it("incluye también los fallos del dev set", () => {
    const e = ejecucion(1, [muestra("d1", "apto", "revisar")], { conjunto: "dev" });
    expect(detalleFallos([e])).toContain("dev  d1");
  });
});
