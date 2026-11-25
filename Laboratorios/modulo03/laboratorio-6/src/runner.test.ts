import { describe, expect, it, vi } from "vitest";
import { variantes } from "./prompts.js";
import { ejecutarBanco, type Clasificar, type Dataset, type Ejecucion } from "./runner.js";

const dataset: Dataset = {
  dev: [
    { id: "d1", cv: "cv dev 1", esperada: "apto" },
    { id: "d2", cv: "cv dev 2", esperada: "descartar" },
  ],
  holdout: [{ id: "h1", cv: "cv hold 1", esperada: "revisar" }],
};

const siempreApto: Clasificar = async () => "apto";

describe("ejecutarBanco", () => {
  it("cubre las 8 combinaciones de modelo y prompt x 2 conjuntos x N repeticiones", async () => {
    const ejecuciones = await ejecutarBanco(dataset, siempreApto, { repeticiones: 3 });

    expect(ejecuciones).toHaveLength(2 * 4 * 2 * 3);
    const combinaciones = new Set(ejecuciones.map((e) => `${e.modelo}/${e.prompt}/${e.conjunto}`));
    expect(combinaciones).toEqual(
      new Set([
        "fast/vago/dev",
        "fast/vago/holdout",
        "fast/concreto/dev",
        "fast/concreto/holdout",
        "fast/vago+esquema/dev",
        "fast/vago+esquema/holdout",
        "fast/concreto+esquema/dev",
        "fast/concreto+esquema/holdout",
        "smart/vago/dev",
        "smart/vago/holdout",
        "smart/concreto/dev",
        "smart/concreto/holdout",
        "smart/vago+esquema/dev",
        "smart/vago+esquema/holdout",
        "smart/concreto+esquema/dev",
        "smart/concreto+esquema/holdout",
      ]),
    );
  });

  it("con la opción variantes solo ejecuta las indicadas", async () => {
    const ejecuciones = await ejecutarBanco(dataset, siempreApto, {
      repeticiones: 1,
      modelos: ["fast"],
      variantes: ["concreto+esquema"],
    });
    expect(new Set(ejecuciones.map((e) => e.prompt))).toEqual(new Set(["concreto+esquema"]));
    expect(ejecuciones).toHaveLength(2);
  });

  it("usa 5 repeticiones por defecto, numeradas desde 1", async () => {
    const ejecuciones = await ejecutarBanco(dataset, siempreApto, { modelos: ["fast"] });
    const deUnaCombinacion = ejecuciones.filter((e) => e.prompt === "vago" && e.conjunto === "dev");
    expect(deUnaCombinacion.map((e) => e.repeticion)).toEqual([1, 2, 3, 4, 5]);
  });

  it("cada ejecución contiene una muestra por caso del conjunto, con su esperada", async () => {
    const ejecuciones = await ejecutarBanco(dataset, siempreApto, { repeticiones: 1, modelos: ["fast"] });
    const dev = ejecuciones.find((e) => e.conjunto === "dev");
    const hold = ejecuciones.find((e) => e.conjunto === "holdout");

    expect(dev?.muestras.map((m) => [m.casoId, m.esperada])).toEqual([
      ["d1", "apto"],
      ["d2", "descartar"],
    ]);
    expect(hold?.muestras.map((m) => m.casoId)).toEqual(["h1"]);
  });

  it("pasa al clasificador el modelo, el prompt, el CV y si usa esquema", async () => {
    const clasificar = vi.fn<Clasificar>(async () => "apto");
    await ejecutarBanco(dataset, clasificar, { repeticiones: 1, modelos: ["smart"] });

    expect(clasificar).toHaveBeenCalledWith("smart", variantes.vago.prompt, "cv dev 1", false);
    expect(clasificar).toHaveBeenCalledWith("smart", variantes.concreto.prompt, "cv hold 1", false);
    expect(clasificar).toHaveBeenCalledWith("smart", variantes["concreto+esquema"].prompt, "cv dev 1", true);
    expect(clasificar).toHaveBeenCalledTimes(4 * (2 + 1));
  });

  it("guarda la respuesta tal cual y el tiempo de cada llamada", async () => {
    const lenta: Clasificar = async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return "  Apto \n";
    };
    const [ejecucion] = await ejecutarBanco(dataset, lenta, { repeticiones: 1, modelos: ["fast"] });

    const muestra = ejecucion?.muestras[0];
    expect(muestra?.respuesta).toBe("  Apto \n");
    expect(muestra?.ms).toBeGreaterThanOrEqual(10);
  });

  it("si una llamada falla, registra el error, la cuenta como respuesta vacía y sigue", async () => {
    const clasificar: Clasificar = async (_modelo, _prompt, cv) => {
      if (cv === "cv dev 1") throw new Error("timeout");
      return "apto";
    };
    const [ejecucion] = await ejecutarBanco(dataset, clasificar, { repeticiones: 1, modelos: ["fast"] });

    expect(ejecucion?.muestras[0]).toMatchObject({ casoId: "d1", respuesta: "", error: "timeout" });
    expect(ejecucion?.muestras[1]).toMatchObject({ casoId: "d2", respuesta: "apto" });
    expect(ejecucion?.muestras[1]?.error).toBeUndefined();
  });

  it("registra como error un valor lanzado que no es un Error", async () => {
    const clasificar: Clasificar = async () => {
      throw "caída";
    };
    const [ejecucion] = await ejecutarBanco(dataset, clasificar, { repeticiones: 1, modelos: ["fast"] });
    expect(ejecucion?.muestras[0]?.error).toBe("caída");
  });

  it("espera pausaMs entre llamadas (no antes de la primera) y no la cuenta en el tiempo medido", async () => {
    const instantes: number[] = [];
    const clasificar: Clasificar = async () => {
      instantes.push(performance.now());
      return "apto";
    };
    const [dev] = await ejecutarBanco(dataset, clasificar, { repeticiones: 1, modelos: ["fast"], pausaMs: 30 });

    // dev tiene 2 casos: las dos llamadas quedan separadas al menos ~pausa.
    expect((instantes[1] ?? 0) - (instantes[0] ?? 0)).toBeGreaterThanOrEqual(25);
    expect(dev?.muestras.every((m) => m.ms < 25)).toBe(true);
  });

  it("sin pausaMs no espera entre llamadas", async () => {
    const inicio = performance.now();
    await ejecutarBanco(dataset, siempreApto, { repeticiones: 1 });
    expect(performance.now() - inicio).toBeLessThan(100);
  });

  it("avisa tras terminar cada ejecución", async () => {
    const vistas: Ejecucion[] = [];
    const ejecuciones = await ejecutarBanco(dataset, siempreApto, {
      repeticiones: 2,
      alTerminar: (e) => vistas.push(e),
    });
    expect(vistas).toEqual(ejecuciones);
  });
});
