// Tests unitaires de la garde anti-production pour les tests SQL.
// Aucune connexion réseau : la garde est pure (analyse d'URL uniquement).
// Exécution : `node --test tests/*.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyserUrlTest, estUrlTestLocale } from "./helpers/garde-test.mjs";

test("garde : variable absente (undefined) → refus", () => {
  assert.equal(estUrlTestLocale(undefined), false);
  assert.equal(analyserUrlTest(undefined).ok, false);
  assert.equal(analyserUrlTest(undefined).raison, "URL absente");
});

test("garde : valeur vide → refus", () => {
  assert.equal(estUrlTestLocale(""), false);
  assert.equal(estUrlTestLocale("   "), false);
  assert.equal(analyserUrlTest("").raison, "URL absente");
});

test("garde : URL mal formée → refus", () => {
  assert.equal(estUrlTestLocale("pas-une-url"), false);
  assert.equal(analyserUrlTest("pas-une-url").raison, "protocole non PostgreSQL");
  assert.equal(estUrlTestLocale("postgres://"), false);
  assert.equal(analyserUrlTest("postgres://").raison, "hôte absent");
});

test("garde : hôte Neon → refus", () => {
  assert.equal(estUrlTestLocale("postgres://u:p@ep-foo.neon.tech/db"), false);
  assert.equal(estUrlTestLocale("postgresql://u:p@ep-cool.aws.neon.tech/neondb?sslmode=require"), false);
  assert.equal(analyserUrlTest("postgres://u:p@ep-foo.neon.tech/db").raison, "cible Neon interdite");
});

test("garde : adresse IP distante → refus", () => {
  assert.equal(estUrlTestLocale("postgres://u:p@192.168.1.1/db"), false);
  assert.equal(estUrlTestLocale("postgres://u:p@10.0.0.1:5432/db"), false);
  assert.equal(estUrlTestLocale("postgres://u:p@8.8.8.8/db"), false);
});

test("garde : hôte localhost → accepté", () => {
  assert.equal(estUrlTestLocale("postgres://u:p@localhost:5435/umpj_s1_test"), true);
  assert.equal(estUrlTestLocale("postgresql://u:p@localhost/db"), true);
});

test("garde : hôte 127.0.0.1 → accepté", () => {
  assert.equal(estUrlTestLocale("postgres://u:p@127.0.0.1:5435/umpj_s1_test"), true);
  assert.equal(estUrlTestLocale("postgres://u:p@127.0.0.1/db"), true);
});

test("garde : protocole non PostgreSQL → refus", () => {
  assert.equal(estUrlTestLocale("http://u:p@localhost/db"), false);
  assert.equal(estUrlTestLocale("mysql://u:p@localhost/db"), false);
  assert.equal(estUrlTestLocale("https://localhost/db"), false);
  assert.equal(analyserUrlTest("http://u:p@localhost/db").raison, "protocole non PostgreSQL");
});

test("garde : hôte inconnu (pas localhost) → refus", () => {
  assert.equal(estUrlTestLocale("postgres://u:p@db.example.com/db"), false);
  assert.equal(estUrlTestLocale("postgres://u:p@myserver/db"), false);
});

// --- Contournement par paramètre host/port/connectionString/hostaddr ---

test("garde : postgres://localhost/db?host=evil.com → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db?host=evil.com"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?host=evil.com").raison, "paramètre de connexion interdit");
});

test("garde : postgres://localhost/db?port=5432 → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db?port=5432"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?port=5432").raison, "paramètre de connexion interdit");
});

test("garde : HOST et PORT en majuscules → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db?HOST=evil.com"), false);
  assert.equal(estUrlTestLocale("postgres://localhost/db?PORT=5432"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?HOST=evil.com").raison, "paramètre de connexion interdit");
});

test("garde : noms de paramètres encodés → refus s'ils correspondent à host/port", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db?h%6fst=evil.com"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?h%6fst=evil.com").raison, "paramètre de connexion interdit");
});

test("garde : connectionString → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db?connectionString=postgres://evil.com/db"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?connectionString=postgres://evil.com/db").raison, "paramètre de connexion interdit");
});

test("garde : CONNECTIONSTRING en majuscules → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db?CONNECTIONSTRING=postgres://evil.com/db"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?CONNECTIONSTRING=postgres://evil.com/db").raison, "paramètre de connexion interdit");
});

test("garde : hostaddr → refus (defense in depth)", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db?hostaddr=1.2.3.4"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?hostaddr=1.2.3.4").raison, "paramètre de connexion interdit");
});

test("garde : host/port/connectionString combinés → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db?host=evil.com&port=123&connectionString=x&hostaddr=1.2.3.4"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?host=evil.com&port=123&connectionString=x&hostaddr=1.2.3.4").raison, "paramètre de connexion interdit");
});

test("garde : paramètre host vide → refus (defense in depth)", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db?host="), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?host=").raison, "paramètre de connexion interdit");
});

// --- Ports invalides ---

test("garde : port vide → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost:/db"), false);
  assert.equal(analyserUrlTest("postgres://localhost:/db").raison, "hôte absent");
});

test("garde : port hors plage → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost:0/db"), false);
  assert.equal(estUrlTestLocale("postgres://localhost:99999/db"), false);
  assert.equal(estUrlTestLocale("postgres://localhost:65536/db"), false);
});

test("garde : port avec zéro initial → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost:01/db"), false);
  assert.equal(estUrlTestLocale("postgres://localhost:00/db"), false);
});

test("garde : port non numérique → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost:abc/db"), false);
  assert.equal(estUrlTestLocale("postgres://localhost:1a/db"), false);
});

// --- Caractères inattendus dans l'autorité ---

test("garde : caractères interdits dans l'autorité → refus", () => {
  assert.equal(estUrlTestLocale("postgres://local host/db"), false);
  assert.equal(estUrlTestLocale("postgres://local\thost/db"), false);
  assert.equal(estUrlTestLocale("postgres://local\nhost/db"), false);
});

test("garde : multiples @ dans l'autorité → refus", () => {
  assert.equal(estUrlTestLocale("postgres://a@b@c/db"), false);
  assert.equal(estUrlTestLocale("postgres://user@evil.com@localhost/db"), false);
});

test("garde : autorité vide ou mal formée → refus", () => {
  assert.equal(estUrlTestLocale("postgres:///db"), false);
  assert.equal(estUrlTestLocale("postgres://"), false);
  assert.equal(analyserUrlTest("postgres:///db").raison, "hôte absent");
});

// --- IPv4 non canoniques ---

test("garde : IPv4 non canonique et entier IPv4 → refus", () => {
  assert.equal(estUrlTestLocale("postgres://127.000.000.001/db"), false);
  assert.equal(estUrlTestLocale("postgres://0x7f.0.0.1/db"), false);
  assert.equal(estUrlTestLocale("postgres://2130706433/db"), false);
  assert.equal(estUrlTestLocale("postgres://127.0.0.1./db"), false);
});

test("garde : suffixe de domaine trompeur → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost.evil.com/db"), false);
  assert.equal(estUrlTestLocale("postgres://127.0.0.1.nip.io/db"), false);
  assert.equal(estUrlTestLocale("postgres://localhostx/db"), false);
});

test("garde : IPv6 loopback → refus", () => {
  assert.equal(estUrlTestLocale("postgres://[::1]/db"), false);
  assert.equal(estUrlTestLocale("postgres://::1/db"), false);
});

test("garde : hôte avec point final → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost./db"), false);
  assert.equal(estUrlTestLocale("postgres://127.0.0.1./db"), false);
});

test("garde : localhost/127.0.0.1 avec port explicite → accepté", () => {
  assert.equal(estUrlTestLocale("postgres://u:p@localhost:5435/umpj_s1_test"), true);
  assert.equal(estUrlTestLocale("postgres://u:p@127.0.0.1:5432/db"), true);
});

// --- Nouveaux cas : forme explicite ---

test("garde : URL sans chemin → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost"), false);
  assert.equal(estUrlTestLocale("postgres://127.0.0.1"), false);
  assert.equal(analyserUrlTest("postgres://localhost").raison, "hôte absent");
});

test("garde : port explicite sans chemin → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost:5432"), false);
  assert.equal(estUrlTestLocale("postgres://127.0.0.1:5432"), false);
});

test("garde : protocole en majuscules → accepté", () => {
  assert.equal(estUrlTestLocale("POSTGRES://u:p@localhost/db"), true);
  assert.equal(estUrlTestLocale("PostgreSQL://u:p@127.0.0.1/db"), true);
});

test("garde : userinfo vide ou sans identifiant → accepté", () => {
  assert.equal(estUrlTestLocale("postgres://@localhost/db"), true);
  assert.equal(estUrlTestLocale("postgres://:pass@localhost/db"), true);
});

test("garde : espace final → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db "), false);
  assert.equal(analyserUrlTest("postgres://localhost/db ").raison, "hôte absent");
});

test("garde : IPv6 avec port → refus", () => {
  assert.equal(estUrlTestLocale("postgres://[::1]:5432/db"), false);
});

test("garde : crochet IPv6 non fermé → refus", () => {
  assert.equal(estUrlTestLocale("postgres://[::1/db"), false);
  assert.equal(analyserUrlTest("postgres://[::1/db").raison, "hôte absent");
});

test("garde : fragment contenant une chaîne ressemblant à une query → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db#?host=evil.com"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db#?host=evil.com").raison, "fragment non autorisé");
});

test("garde : double-encodage du nom de paramètre → refus (paramètres non autorisés)", () => {
  // h%256fst → décodé une fois → h%6fst ≠ host → pas de surcharge → mais paramètre présent → refusé
  assert.equal(estUrlTestLocale("postgres://localhost/db?h%256fst=evil.com"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?h%256fst=evil.com").raison, "paramètres de requête non autorisés");
});

test("garde : nom de paramètre avec octet nul → refus (paramètres non autorisés)", () => {
  // host%00 → décodé → host\0 ≠ host → pas de surcharge → mais paramètre présent → refusé
  assert.equal(estUrlTestLocale("postgres://localhost/db?host%00=evil"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?host%00=evil").raison, "paramètres de requête non autorisés");
});

test("garde : paramètre interdit combiné à un paramètre autorisé → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db?sslmode=require&host=evil.com"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?sslmode=require&host=evil.com").raison, "paramètre de connexion interdit");
});

test("garde : nom encodé avec casse combinée → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db?H%4fST=evil.com"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?H%4fST=evil.com").raison, "paramètre de connexion interdit");
});

test("garde : ? supplémentaire dans une valeur → refus (paramètres non autorisés)", () => {
  // Le second ? fait partie de la valeur, mais le premier ? rend la présence de paramètres → refusé
  assert.equal(estUrlTestLocale("postgres://localhost/db?a=1?host=evil.com"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?a=1?host=evil.com").raison, "paramètres de requête non autorisés");
});

test("garde : connectionstring en minuscules → refus", () => {
  assert.equal(estUrlTestLocale("postgres://localhost/db?connectionstring=postgres://evil.com/db"), false);
  assert.equal(analyserUrlTest("postgres://localhost/db?connectionstring=postgres://evil.com/db").raison, "paramètre de connexion interdit");
});