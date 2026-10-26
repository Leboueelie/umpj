// Tests de la sécurisation des fichiers PDF (mission remédiation SEC-004/005).
// Exécution : `node --test tests/*.test.mjs` — aucun réseau, aucune base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { estPdf, nomFichierSur, enteteContentDisposition } from "../lib/fichiers.ts";

test("estPdf : accepte un PDF commençant par les octets magiques", () => {
  assert.equal(estPdf(Buffer.from("%PDF-1.7\n...")), true);
});

test("estPdf : refuse un contenu non PDF", () => {
  assert.equal(estPdf(Buffer.from("<html><script>")), false);
  assert.equal(estPdf(Buffer.from("")), false);
  assert.equal(estPdf(Buffer.from("GIF89a")), false);
  assert.equal(estPdf(Buffer.from(" %PDF-1.7")), false);
  assert.equal(estPdf(null), false);
  assert.equal(estPdf(undefined), false);
});

test("nomFichierSur : neutralise CR/LF et caractères de contrôle (injection d'en-tête)", () => {
  assert.equal(nomFichierSur('a\r\nX-Injected: oui\r\n'), "a  X-Injected: oui");
  assert.equal(nomFichierSur('rap"port.pdf'), "rap port.pdf");
  assert.equal(nomFichierSur("back\\slash.pdf"), "back slash.pdf");
  assert.equal(nomFichierSur("a\u0000b\u001fc"), "a b c");
});

test("nomFichierSur : borne la longueur et fournit une valeur de secours", () => {
  assert.ok(nomFichierSur("x".repeat(500)).length <= 150);
  assert.equal(nomFichierSur(""), "document.pdf");
  assert.equal(nomFichierSur('"""'), "document.pdf");
  assert.equal(nomFichierSur(null), "document.pdf");
  assert.equal(nomFichierSur(undefined), "document.pdf");
});

test("enteteContentDisposition : nom ASCII en secours + forme RFC 5987", () => {
  const h = enteteContentDisposition("Rapport annuel.pdf");
  assert.ok(h.startsWith('inline; filename="Rapport annuel.pdf"; filename*=UTF-8\'\''), h);
  assert.equal(h, "inline; filename=\"Rapport annuel.pdf\"; filename*=UTF-8''Rapport%20annuel.pdf");
});

test("enteteContentDisposition : préserve l'UTF-8 sans casser l'en-tête", () => {
  const h = enteteContentDisposition("caf\u00e9-r\u00e9union.pdf");
  assert.ok(!h.includes("caf\u00e9-r\u00e9union.pdf\";") === false || h.includes("filename*=UTF-8''"));
  assert.ok(h.includes("filename=\"caf\u00e9-r\u00e9union.pdf\"") === false); // ASCII only dans filename=
  assert.ok(h.includes("filename*=UTF-8''caf%C3%A9-r%C3%A9union.pdf"));
});

test("enteteContentDisposition : impossible d'injecter des en-têtes", () => {
  const h = enteteContentDisposition('x\r\nSet-Cookie: pwned=1\r\n"x"');
  assert.ok(!h.includes("\r") && !h.includes("\n"), h);
  assert.ok(!h.includes('"x"'), h);
});
