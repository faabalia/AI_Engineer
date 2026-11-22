import { test } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { isTransient, readResponse, ResponseError, withRetries } from "./llm.js";

const httpErr = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const noSleep = async () => {};
const ok = (over: any = {}) => ({
  id: "x", model: "m", usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
  choices: [{ finish_reason: "stop", message: { content: "hola", refusal: null } }], ...over,
});

test("503 se reintenta y acaba bien", async () => {
  let n = 0;
  const r = await withRetries(async () => { if (++n < 3) throw httpErr(503); return "ok"; }, { sleep: noSleep });
  assert.equal(r, "ok"); assert.equal(n, 3);
});
test("400 no se reintenta", async () => {
  let n = 0;
  await assert.rejects(withRetries(async () => { n++; throw httpErr(400); }, { sleep: noSleep }));
  assert.equal(n, 1);
});
test("máximo 4 intentos", async () => {
  let n = 0;
  await assert.rejects(withRetries(async () => { n++; throw httpErr(503); }, { sleep: noSleep }));
  assert.equal(n, 4);
});
test("espera con full jitter acotada", async () => {
  const waits: number[] = [];
  await assert.rejects(withRetries(async () => { throw httpErr(429); },
    { sleep: async (ms) => { waits.push(ms); }, random: () => 1 }));
  assert.deepEqual(waits, [1000, 2000, 4000]);
});
test("isTransient", () => {
  for (const s of [429, 500, 503]) assert.equal(isTransient(httpErr(s)), true, String(s));
  for (const s of [400, 401, 403, 404]) assert.equal(isTransient(httpErr(s)), false, String(s));
  assert.equal(isTransient(Object.assign(httpErr(429), { code: "budget_exceeded" })), false);
  assert.equal(isTransient(new OpenAI.APIConnectionTimeoutError({})), true);
  assert.equal(isTransient(new ResponseError("empty", "x")), false);
});
test("readResponse", () => {
  const r = readResponse(ok());
  assert.deepEqual([r.text, r.finishReason, r.tokens.total, r.model, r.id], ["hola", "stop", 3, "m", "x"]);
  assert.throws(() => readResponse(ok({ choices: [{ finish_reason: "stop", message: { content: "" } }] })), /vacía/);
  assert.throws(() => readResponse(ok({ choices: [{ finish_reason: "stop", message: { content: null, refusal: "no" } }] })), /negó/);
  assert.throws(() => readResponse(ok({ choices: [{ finish_reason: "content_filter", message: { content: "x" } }] })), /bloqueada/);
  assert.equal(readResponse(ok({ choices: [{ finish_reason: "length", message: { content: "x" } }] })).finishReason, "length");
});
