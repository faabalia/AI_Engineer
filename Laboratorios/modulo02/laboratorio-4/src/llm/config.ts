import { readFileSync } from "node:fs";

export interface Target {
  destination: string;
  model: string;
}

export interface DestinationConfig {
  format: string;
  base_url_env: string;
  api_key_env: string;
}

export interface LlmConfig {
  logical_models: Record<string, Target[]>;
  destinations: Record<string, DestinationConfig>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, where: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Config inválida: ${where} debe ser un texto no vacío`);
  }
  return value;
}

function parseDestination(name: string, raw: unknown): DestinationConfig {
  if (!isRecord(raw)) {
    throw new Error(`Config inválida: destinations.${name} debe ser un objeto`);
  }
  return {
    format: requireString(raw["format"], `destinations.${name}.format`),
    base_url_env: requireString(raw["base_url_env"], `destinations.${name}.base_url_env`),
    api_key_env: requireString(raw["api_key_env"], `destinations.${name}.api_key_env`),
  };
}

function parseTargets(name: string, raw: unknown, destinations: Set<string>): Target[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Config inválida: logical_models.${name} debe ser una lista con algún destino`);
  }
  return raw.map((item, i) => {
    const where = `logical_models.${name}[${i}]`;
    if (!isRecord(item)) throw new Error(`Config inválida: ${where} debe ser un objeto`);
    const destination = requireString(item["destination"], `${where}.destination`);
    if (!destinations.has(destination)) {
      throw new Error(`Config inválida: ${where} usa el destino "${destination}", que no existe en destinations`);
    }
    return { destination, model: requireString(item["model"], `${where}.model`) };
  });
}

/** Valida la estructura y las referencias entre secciones; no conoce proveedores. */
export function parseConfig(raw: unknown): LlmConfig {
  if (!isRecord(raw) || !isRecord(raw["destinations"]) || !isRecord(raw["logical_models"])) {
    throw new Error("Config inválida: faltan las secciones destinations y logical_models");
  }

  const destinations: Record<string, DestinationConfig> = {};
  for (const [name, value] of Object.entries(raw["destinations"])) {
    destinations[name] = parseDestination(name, value);
  }

  const known = new Set(Object.keys(destinations));
  const logical_models: Record<string, Target[]> = {};
  for (const [name, value] of Object.entries(raw["logical_models"])) {
    logical_models[name] = parseTargets(name, value, known);
  }

  return { logical_models, destinations };
}

export function loadConfig(path: string): LlmConfig {
  return parseConfig(JSON.parse(readFileSync(path, "utf-8")));
}
