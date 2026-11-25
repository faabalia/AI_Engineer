import { describe, expect, it } from "vitest";
import { cargarDataset, parsearDataset } from "./dataset.js";

const caso = { id: "a", cv: "texto", esperada: "apto" };
const valido = { dev: [caso], holdout: [{ ...caso, id: "b" }] };

describe("parsearDataset", () => {
  it("acepta un dataset válido", () => {
    expect(parsearDataset(valido)).toEqual(valido);
  });

  it.each([null, [], "texto", 3])("rechaza algo que no es un objeto: %j", (json) => {
    expect(() => parsearDataset(json)).toThrow("debe ser un objeto");
  });

  it("rechaza si falta un conjunto o está vacío", () => {
    expect(() => parsearDataset({ dev: [caso] })).toThrow('"holdout"');
    expect(() => parsearDataset({ dev: [], holdout: [caso] })).toThrow('"dev"');
  });

  it("rechaza un caso que no es un objeto", () => {
    expect(() => parsearDataset({ ...valido, dev: ["x"] })).toThrow("dev[0]: debe ser un objeto");
  });

  it("rechaza un id vacío o ausente", () => {
    expect(() => parsearDataset({ ...valido, dev: [{ ...caso, id: "" }] })).toThrow('"id"');
    expect(() => parsearDataset({ ...valido, dev: [{ cv: "x", esperada: "apto" }] })).toThrow('"id"');
  });

  it("rechaza un cv vacío", () => {
    expect(() => parsearDataset({ ...valido, dev: [{ ...caso, cv: "  " }] })).toThrow('"cv"');
  });

  it("rechaza una etiqueta esperada que no es una de las tres", () => {
    expect(() => parsearDataset({ ...valido, dev: [{ ...caso, esperada: "apta" }] })).toThrow("apto, descartar, revisar");
  });

  it("rechaza ids repetidos, también entre conjuntos", () => {
    expect(() => parsearDataset({ dev: [caso], holdout: [caso] })).toThrow("Id repetido en el dataset: a");
  });
});

describe("dataset.json real", () => {
  it("cumple lo que pide el enunciado", async () => {
    const dataset = await cargarDataset(new URL("../dataset.json", import.meta.url).pathname);

    expect(dataset.dev.length).toBeGreaterThanOrEqual(15);
    expect(dataset.holdout.length).toBeGreaterThanOrEqual(5);
    expect(new Set(dataset.dev.map((c) => c.esperada))).toEqual(new Set(["apto", "descartar", "revisar"]));
  });
});
