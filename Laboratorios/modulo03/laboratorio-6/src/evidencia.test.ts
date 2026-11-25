import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { guardarEvidencia, nombreEvidencia, textoResultado } from "./evidencia.js";
import type { Ejecucion, Muestra } from "./runner.js";

function muestra(respuesta: string, error?: string): Muestra {
  return { casoId: "c1", esperada: "apto", respuesta, ms: 1000, ...(error === undefined ? {} : { error }) };
}

function ejecucion(muestras: Muestra[]): Ejecucion {
  return { modelo: "fast", prompt: "concreto+esquema", conjunto: "dev", repeticion: 1, muestras };
}

describe("nombreEvidencia", () => {
  it("usa el formato evidencia-yyyymmdd-hhmmss.txt con ceros a la izquierda", () => {
    expect(nombreEvidencia(new Date(2026, 10, 25, 9, 5, 7))).toBe("evidencia-20261125-090507.txt");
  });

  it("usa horas de 24 h", () => {
    expect(nombreEvidencia(new Date(2026, 0, 3, 23, 59, 59))).toBe("evidencia-20260103-235959.txt");
  });
});

describe("textoResultado", () => {
  it("incluye umbral, tabla y casos fallados, sin aviso si no hubo errores", () => {
    const texto = textoResultado([ejecucion([muestra("apto")])]);

    expect(texto).toContain("Umbral de acierto medio: 75%");
    expect(texto).toContain("modelo  prompt  conjunto");
    expect(texto).toContain("fast    v2      dev");
    expect(texto).toContain("Casos fallados (dev y hold-out):\nNingún caso falló.");
    expect(texto).not.toContain("Aviso");
  });

  it("incluye el aviso de errores y el caso fallado cuando una llamada falló", () => {
    const texto = textoResultado([ejecucion([muestra("", "429 Too many requests")])]);

    expect(texto).toContain("Aviso: estas llamadas fallaron");
    expect(texto).toContain("fast v2 dev: 1 de 1 llamadas con error");
    expect(texto).toContain("c1  esperada: apto  falló 1/1");
  });
});

describe("guardarEvidencia", () => {
  let carpeta: string;

  beforeEach(async () => {
    carpeta = await mkdtemp(join(tmpdir(), "evidencia-test-"));
  });

  afterEach(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  it("crea la carpeta si no existe, escribe el texto y devuelve la ruta", async () => {
    const destino = join(carpeta, "evidencias", "anidada");
    const ruta = await guardarEvidencia("hola", destino, new Date(2026, 10, 25, 9, 5, 7));

    expect(ruta).toBe(join(destino, "evidencia-20261125-090507.txt"));
    expect(await readFile(ruta, "utf-8")).toBe("hola\n");
  });

  it("dos ejecuciones en segundos distintos dan dos archivos distintos", async () => {
    await guardarEvidencia("a", carpeta, new Date(2026, 10, 25, 9, 0, 0));
    await guardarEvidencia("b", carpeta, new Date(2026, 10, 25, 9, 0, 1));

    expect((await readdir(carpeta)).sort()).toEqual(["evidencia-20261125-090000.txt", "evidencia-20261125-090001.txt"]);
  });
});
