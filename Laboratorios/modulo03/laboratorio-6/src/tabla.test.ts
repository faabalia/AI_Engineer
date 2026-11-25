import { describe, expect, it } from "vitest";
import type { FilaInforme } from "./informe.js";
import { filasEjemplo } from "./ejemplo.js";
import { avisoErrores, formatearTabla } from "./tabla.js";

function fila(parcial: Partial<FilaInforme> = {}): FilaInforme {
  return {
    modelo: "fast",
    prompt: "vago",
    conjunto: "dev",
    repeticiones: 5,
    aciertoMinimo: 40,
    aciertoMedio: 47,
    aciertoMaximo: 53,
    tiempoMedioMs: 1100,
    superaUmbral: false,
    llamadas: 90,
    llamadasConError: 0,
    ...parcial,
  };
}

describe("formatearTabla", () => {
  it("empieza por la cabecera con las seis columnas", () => {
    const [cabecera] = formatearTabla([fila()]).split("\n");
    expect(cabecera?.split(/\s{2,}/)).toEqual([
      "modelo",
      "prompt",
      "conjunto",
      "acierto (mín/medio/máx)",
      "tiempo medio",
      "umbral",
    ]);
  });

  it("pinta una fila con porcentajes, segundos y ✗ si no supera el umbral", () => {
    const [, linea] = formatearTabla([fila()]).split("\n");
    expect(linea?.split(/\s{2,}/)).toEqual(["fast", "v1 texto", "dev", "40% / 47% / 53%", "1.1 s", "✗"]);
  });

  it("pinta ✓ si supera el umbral", () => {
    const [, linea] = formatearTabla([fila({ superaUmbral: true })]).split("\n");
    expect(linea).toContain("✓");
  });

  it("redondea los porcentajes al entero más cercano", () => {
    const [, linea] = formatearTabla([fila({ aciertoMinimo: 38.9, aciertoMedio: 46.5, aciertoMaximo: 100 })]).split("\n");
    expect(linea).toContain("39% / 47% / 100%");
  });

  it("muestra el tiempo en segundos con un decimal", () => {
    const [, linea] = formatearTabla([fila({ tiempoMedioMs: 2349 })]).split("\n");
    expect(linea).toContain("2.3 s");
  });

  it("alinea las columnas: cada columna empieza en la misma posición en todas las líneas", () => {
    const tabla = formatearTabla([
      fila(),
      fila({ modelo: "smart", prompt: "concreto+esquema", conjunto: "holdout", aciertoMaximo: 100, superaUmbral: true }),
    ]);
    const lineas = tabla.split("\n");
    const inicioPrompt = lineas.map((l) => l.search(/v1|v2|prompt/));
    expect(new Set(inicioPrompt).size).toBe(1);
    const inicioUmbral = lineas.map((l) => l.search(/umbral|✓|✗/));
    expect(new Set(inicioUmbral).size).toBe(1);
  });

  it("muestra la etiqueta corta de la variante (v1, v2) en vez de su nombre", () => {
    const tabla = formatearTabla([fila({ prompt: "vago+esquema" }), fila({ prompt: "concreto+esquema" })]);
    const [, v1, v2] = tabla.split("\n");
    expect(v1?.split(/\s{2,}/)[1]).toBe("v1");
    expect(v2?.split(/\s{2,}/)[1]).toBe("v2");
  });

  it("no incluye columna de errores", () => {
    expect(formatearTabla([fila({ llamadasConError: 3 })])).not.toContain("errores");
  });

  it("no deja espacios sobrantes al final de las líneas", () => {
    const lineas = formatearTabla([fila(), fila({ modelo: "smart" })]).split("\n");
    for (const linea of lineas) {
      expect(linea).toBe(linea.trimEnd());
    }
  });

  it("con una lista vacía devuelve solo la cabecera", () => {
    expect(formatearTabla([]).split("\n")).toHaveLength(1);
  });
});

describe("formato completo del informe", () => {
  // Datos fijos de ejemplo (src/ejemplo.ts): si cambia el formato, este test lo detecta.
  const filas = filasEjemplo;

  it("la tabla tiene este aspecto", () => {
    expect(formatearTabla(filas)).toBe(
      [
        "modelo  prompt  conjunto  acierto (mín/medio/máx)  tiempo medio  umbral",
        "fast    v1      dev       72% / 72% / 72%          1.8 s         ✗",
        "fast    v1      holdout   67% / 67% / 67%          2.0 s         ✗",
        "fast    v2      dev       83% / 87% / 89%          2.0 s         ✓",
        "fast    v2      holdout   100% / 100% / 100%       2.0 s         ✓",
        "smart   v1      dev       44% / 44% / 44%          1.4 s         ✗",
        "smart   v1      holdout   50% / 50% / 50%          2.0 s         ✗",
        "smart   v2      dev       100% / 100% / 100%       2.0 s         ✓",
        "smart   v2      holdout   100% / 100% / 100%       2.0 s         ✓",
      ].join("\n"),
    );
  });

  it("el aviso de errores sale debajo de la tabla con este aspecto", () => {
    expect(avisoErrores(filas)).toBe(
      [
        "Aviso: estas llamadas fallaron y cuentan como fallo en el acierto:",
        "- fast v1 holdout: 1 de 30 llamadas con error",
        "- fast v2 dev: 2 de 90 llamadas con error",
      ].join("\n"),
    );
  });
});

describe("avisoErrores", () => {
  it("devuelve cadena vacía si no hubo errores", () => {
    expect(avisoErrores([fila(), fila({ modelo: "smart" })])).toBe("");
  });

  it("lista solo las combinaciones con llamadas con error", () => {
    const aviso = avisoErrores([
      fila(),
      fila({ prompt: "concreto+esquema", conjunto: "holdout", llamadas: 30, llamadasConError: 1 }),
    ]);
    expect(aviso).toContain("fast v2 holdout: 1 de 30 llamadas con error");
    expect(aviso).not.toContain("v1 texto");
  });
});
