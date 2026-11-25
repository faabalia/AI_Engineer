import { describe, expect, it } from "vitest";
import { esAcierto, normalizar, porcentajeAcierto, type Resultado } from "./acierto.js";

describe("normalizar", () => {
  it("quita espacios y saltos de línea de los extremos", () => {
    expect(normalizar("  apto \n")).toBe("apto");
  });

  it("pasa a minúsculas", () => {
    expect(normalizar("DESCARTAR")).toBe("descartar");
  });

  it("no toca los espacios del interior", () => {
    expect(normalizar("Es  Apto")).toBe("es  apto");
  });
});

describe("esAcierto", () => {
  it("acepta la etiqueta esperada con espacios y mayúsculas", () => {
    expect(esAcierto({ respuesta: "  Revisar\n", esperada: "revisar" })).toBe(true);
  });

  it("falla si es otra etiqueta válida", () => {
    expect(esAcierto({ respuesta: "apto", esperada: "descartar" })).toBe(false);
  });

  it.each(["", "   ", "apto.", "Apto, porque tiene 5 años", "quizás", "aptos"])(
    "falla si la respuesta no es una etiqueta exacta: %j",
    (respuesta) => {
      expect(esAcierto({ respuesta, esperada: "apto" })).toBe(false);
    },
  );
});

describe("porcentajeAcierto", () => {
  it("devuelve 100 si todo acierta", () => {
    const resultados: Resultado[] = [
      { respuesta: "apto", esperada: "apto" },
      { respuesta: "DESCARTAR", esperada: "descartar" },
    ];
    expect(porcentajeAcierto(resultados)).toBe(100);
  });

  it("devuelve 0 si todo falla", () => {
    expect(porcentajeAcierto([{ respuesta: "apto", esperada: "revisar" }])).toBe(0);
  });

  it("calcula el porcentaje parcial", () => {
    const resultados: Resultado[] = [
      { respuesta: "apto", esperada: "apto" },
      { respuesta: "apto", esperada: "revisar" },
      { respuesta: "descartar", esperada: "descartar" },
      { respuesta: "hola", esperada: "revisar" },
    ];
    expect(porcentajeAcierto(resultados)).toBe(50);
  });

  it("cuenta como fallo una respuesta que no es ninguna etiqueta", () => {
    expect(porcentajeAcierto([{ respuesta: "No lo sé", esperada: "apto" }])).toBe(0);
  });

  it("lanza error si no hay resultados", () => {
    expect(() => porcentajeAcierto([])).toThrow("No hay resultados");
  });
});
