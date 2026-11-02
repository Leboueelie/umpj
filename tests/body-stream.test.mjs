// Tests purs de la lecture bornée du corps JSON (AUD-003.1-STREAMING).
// Aucune connexion réseau, aucune base, aucun serveur.
// Exécution : `node --test tests/body-stream.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import { lireJsonBorne, lireBufferBorne } from "../lib/body-stream.ts";

function streamFromChunks(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function makeRequest(body, contentType = "application/json") {
  return new Request("http://localhost/api/test", {
    method: "POST",
    body: body ?? undefined,
    headers: contentType ? { "Content-Type": contentType } : undefined,
    duplex: "half",
  });
}

test("stream : corps absent (pas de body) → {} accepté", async () => {
  const req = new Request("http://localhost/api/test", { method: "POST" });
  const r = await lireJsonBorne(req, 1000);
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, {});
});

test("stream : corps vide (stream fermé) → {} accepté", async () => {
  const stream = new ReadableStream({ start(c) { c.close(); } });
  const req = makeRequest(stream);
  const r = await lireJsonBorne(req, 1000);
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, {});
});

test("stream : taille exactement égale à la limite → accepté", async () => {
  const buf = Buffer.from(JSON.stringify({ x: "a".repeat(100) }));
  const req = makeRequest(streamFromChunks([buf]));
  const r = await lireJsonBorne(req, buf.byteLength);
  assert.equal(r.ok, true);
});

test("stream : taille supérieure à la limite → 413", async () => {
  const buf = Buffer.from(JSON.stringify({ x: "a".repeat(100) }));
  const req = makeRequest(streamFromChunks([buf]));
  const r = await lireJsonBorne(req, buf.byteLength - 1);
  assert.equal(r.ok, false);
  assert.equal(r.status, 413);
});

test("stream : corps transmis en plusieurs chunks → accumulation correcte", async () => {
  const part1 = Buffer.from('{"cahiers":[');
  const part2 = Buffer.from('{"nom":"C1","lignes":[]}]}');
  const req = makeRequest(streamFromChunks([part1, part2]));
  const r = await lireJsonBorne(req, 10000);
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, { cahiers: [{ nom: "C1", lignes: [] }] });
});

test("stream : comptage correct des octets UTF-8 (multi-octets)", async () => {
  const text = "é".repeat(50); // chaque é = 2 octets en UTF-8
  const buf = Buffer.from(JSON.stringify({ x: text }), "utf8");
  const req = makeRequest(streamFromChunks([buf]));
  // Limite exactement à la taille en octets → accepté
  const r = await lireJsonBorne(req, buf.byteLength);
  assert.equal(r.ok, true);
  // Limite à un octet de moins → rejeté
  const req2 = makeRequest(streamFromChunks([buf]));
  const r2 = await lireJsonBorne(req2, buf.byteLength - 1);
  assert.equal(r2.ok, false);
  assert.equal(r2.status, 413);
});

test("stream : JSON valide → parsé correctement", async () => {
  const body = { cahiers: [{ nom: "test", lignes: [] }], mois: "2025-01" };
  const buf = Buffer.from(JSON.stringify(body));
  const req = makeRequest(streamFromChunks([buf]));
  const r = await lireJsonBorne(req, 10000);
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, body);
});

test("stream : JSON malformé → 400", async () => {
  const buf = Buffer.from("{invalid json");
  const req = makeRequest(streamFromChunks([buf]));
  const r = await lireJsonBorne(req, 10000);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("stream : erreur de lecture du flux → 400", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(10));
      controller.error(new Error("stream error"));
    },
  });
  const req = makeRequest(stream);
  const r = await lireJsonBorne(req, 10000);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("stream : octets dépassant la limite ne sont pas accumulés intégralement", async () => {
  // Premier chunk de 100 octets, second de 1000 octets. Limite 150.
  // Le reader doit s'interrompre au second chunk sans accumuler les 1000 octets.
  const chunk1 = new Uint8Array(100);
  const chunk2 = new Uint8Array(1000);
  const req = makeRequest(streamFromChunks([chunk1, chunk2]));
  const r = await lireJsonBorne(req, 150);
  assert.equal(r.ok, false);
  assert.equal(r.status, 413);
});

test("stream : corps null (pas de body) → {} accepté", async () => {
  const req = new Request("http://localhost/api/test", { method: "POST" });
  const r = await lireJsonBorne(req, 1000);
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, {});
});

test("stream : corps JSON null → {} accepté", async () => {
  const buf = Buffer.from("null");
  const req = makeRequest(streamFromChunks([buf]));
  const r = await lireJsonBorne(req, 1000);
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, {});
});

test("stream : corps JSON string → {} accepté", async () => {
  const buf = Buffer.from('"hello"');
  const req = makeRequest(streamFromChunks([buf]));
  const r = await lireJsonBorne(req, 1000);
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, {});
});

test("stream : limite 0 → tout corps rejeté", async () => {
  const buf = Buffer.from("{}");
  const req = makeRequest(streamFromChunks([buf]));
  const r = await lireJsonBorne(req, 0);
  assert.equal(r.ok, false);
  assert.equal(r.status, 413);
});

test("stream : corps avec espaces uniquement → {} accepté", async () => {
  const buf = Buffer.from("   ");
  const req = makeRequest(streamFromChunks([buf]));
  const r = await lireJsonBorne(req, 1000);
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, {});
});
// ---- lireBufferBorne (streaming multipart) ----


test("buffer : corps absent → buffer vide", async () => {
  const req = new Request("http://localhost/api/test", { method: "POST" });
  const buf = await lireBufferBorne(req, 1000);
  assert.ok(buf !== null);
  assert.equal(buf.byteLength, 0);
});

test("buffer : corps sous la limite → buffer complet", async () => {
  const data = Buffer.from("hello world");
  const req = makeRequest(streamFromChunks([data]));
  const buf = await lireBufferBorne(req, 1000);
  assert.ok(buf !== null);
  assert.equal(buf.byteLength, data.byteLength);
  assert.deepEqual(buf, data);
});

test("buffer : corps dépassant la limite → null", async () => {
  const data = Buffer.from("a".repeat(200));
  const req = makeRequest(streamFromChunks([data]));
  const buf = await lireBufferBorne(req, 100);
  assert.equal(buf, null);
});

test("buffer : corps en chunks dépassant la limite → null", async () => {
  const chunk1 = Buffer.from("a".repeat(80));
  const chunk2 = Buffer.from("b".repeat(80));
  const req = makeRequest(streamFromChunks([chunk1, chunk2]));
  const buf = await lireBufferBorne(req, 100);
  assert.equal(buf, null);
});

test("buffer : erreur de lecture → null", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(10));
      controller.error(new Error("stream error"));
    },
  });
  const req = makeRequest(stream);
  const buf = await lireBufferBorne(req, 1000);
  assert.equal(buf, null);
});

test("buffer : limite 0 → tout corps rejeté", async () => {
  const data = Buffer.from("x");
  const req = makeRequest(streamFromChunks([data]));
  const buf = await lireBufferBorne(req, 0);
  assert.equal(buf, null);
});
