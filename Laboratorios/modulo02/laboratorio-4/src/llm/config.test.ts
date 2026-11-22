import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, parseConfig } from "./config.js";

const valid = () => ({
  logical_models: {
    rapido: [{ destination: "d1", model: "fast" }],
  },
  destinations: {
    d1: { format: "openai", base_url_env: "URL", api_key_env: "KEY" },
  },
});

describe("parseConfig", () => {
  it("acepta una configuración válida", () => {
    expect(parseConfig(valid())).toEqual(valid());
  });

  it("conserva el orden de los fallbacks", () => {
    const raw = valid();
    raw.destinations = {
      ...raw.destinations,
      d2: { format: "anthropic", base_url_env: "U2", api_key_env: "K2" },
    } as typeof raw.destinations;
    raw.logical_models.rapido = [
      { destination: "d2", model: "x" },
      { destination: "d1", model: "y" },
    ];

    const targets = parseConfig(raw).logical_models["rapido"];

    expect(targets?.map((t) => t.destination)).toEqual(["d2", "d1"]);
  });

  it.each([null, "texto", [], {}, { destinations: {} }, { logical_models: {} }])(
    "rechaza una estructura sin las dos secciones: %j",
    (raw) => {
      expect(() => parseConfig(raw)).toThrow(/destinations y logical_models/);
    },
  );

  it("rechaza un modelo lógico sin destinos", () => {
    const raw = valid();
    raw.logical_models.rapido = [];
    expect(() => parseConfig(raw)).toThrow(/logical_models\.rapido/);
  });

  it("rechaza un destino que no existe", () => {
    const raw = valid();
    raw.logical_models.rapido = [{ destination: "fantasma", model: "fast" }];
    expect(() => parseConfig(raw)).toThrow(/"fantasma"/);
  });

  it("rechaza un modelo real vacío", () => {
    const raw = valid();
    raw.logical_models.rapido = [{ destination: "d1", model: "" }];
    expect(() => parseConfig(raw)).toThrow(/model/);
  });

  it("rechaza un destino que no es un objeto", () => {
    const raw = { ...valid(), destinations: { d1: "texto" } };
    expect(() => parseConfig(raw)).toThrow(/destinations\.d1/);
  });

  it.each(["format", "base_url_env", "api_key_env"] as const)(
    "rechaza un destino sin %s",
    (field) => {
      const raw = valid();
      delete (raw.destinations.d1 as Partial<typeof raw.destinations.d1>)[field];
      expect(() => parseConfig(raw)).toThrow(new RegExp(field));
    },
  );
});

describe("loadConfig", () => {
  it("el config.json del proyecto es válido", () => {
    const config = loadConfig(resolve(import.meta.dirname, "../../config.json"));

    expect(Object.keys(config.logical_models)).toEqual(["rapido", "potente"]);
    expect(config.logical_models["potente"]).toHaveLength(2);
  });

  const pruebasDir = resolve(import.meta.dirname, "../../pruebas");

  it.each(readdirSync(pruebasDir).filter((f) => f.endsWith(".json")))(
    "pruebas/%s es una configuración válida",
    (file) => {
      expect(() => loadConfig(resolve(pruebasDir, file))).not.toThrow();
    },
  );

  it("falla si el archivo no existe", () => {
    expect(() => loadConfig("/no/existe.json")).toThrow();
  });
});
