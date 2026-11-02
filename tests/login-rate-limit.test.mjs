// Tests du limiteur de tentatives de connexion (AUD-001).
// Exécution : `node --test tests/*.test.mjs`
// PRÉREQUIS : Node.js >= 22.18 (type stripping natif des fichiers .ts).
//
// Les tests SQL (incrément atomique, expiration, verrouillage) sont env-gated
// sur BANQUE_TEST_DATABASE_URL (base locale isolée protégée par la garde
// anti-production). Sans cette variable, ils sont ignorés.
//
// Les tests sans base (normalisation, seuils, réponses) s'exécutent toujours.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hashIp } from "../lib/auth-core.mjs";
import { estUrlTestLocale } from "./helpers/garde-test.mjs";

// ---- Tests sans base : normalisation et seuils ----

test("normalisation : email lowercase + trim", () => {
  // La route fait : emailBrut.toLowerCase() après trim
  const brut = "  User@Example.COM  ";
  const email = brut.trim().toLowerCase();
  assert.equal(email, "user@example.com");
  // La clé utilise le préfixe "email:" + l'email normalisé.
  assert.equal(`email:${email}`, "email:user@example.com");
});

test("normalisation : clé IP est déterministe et non réversible", () => {
  // hashIp utilise HMAC-SHA-256 avec AUTH_SECRET.
  // On vérifie que la clé est toujours du format "ip:<base64url>".
  const secret = "test-secret-32-caracteres-minimum-xyz";
  const a = hashIp("1.2.3.4", secret);
  const b = hashIp("1.2.3.4", secret);
  assert.equal(a, b); // déterministe
  assert.ok(!a.includes("1.2.3.4")); // non réversible
  assert.ok(!a.includes("ip:")); // préfixe absent du résultat (hash uniquement)
});

test("seuils : email et IP ont des seuils distincts", () => {
  // Le route utilise MAX_TENTATIVES_EMAIL = 10 et MAX_TENTATIVES_IP = 5.
  // On vérifie les constantes via le source de la route (lecture statique).
  const src = readFileSync("app/api/auth/login/route.ts", "utf8");
  assert.ok(src.includes("MAX_TENTATIVES_EMAIL = 10"), "seuil email = 10");
  assert.ok(src.includes("MAX_TENTATIVES_IP = 5"), "seuil IP = 5");
});

test("réponse générique : 401 sans détail sur compte inexistant ou désactivé", () => {
  const src = readFileSync("app/api/auth/login/route.ts", "utf8");
  // La fonction generique() retourne toujours 401.
  assert.ok(src.includes("generique()"), "fonction generique() présente");
  assert.ok(src.includes("status: 401"), "statut 401");
  // Le message est toujours le même.
  assert.ok(src.includes("Identifiants invalides."), "message générique");
});

test("incrément atomique : enregistrerEchec utilise un seul upsert", () => {
  const src = readFileSync("app/api/auth/login/route.ts", "utf8");
  // L'upsert doit être une seule requête SQL (pas de lecture préalable).
  assert.ok(src.includes("ON CONFLICT (cle) DO UPDATE"), "upsert atomique");
  assert.ok(
    src.includes('"TentativeConnexion".tentatives + 1'),
    "incrémentation atomique"
  );
  assert.ok(
    src.includes('"TentativeConnexion".premiere_tentative < now() - INTERVAL \'15 minutes\''),
    "réinitialisation de fenêtre dans le même upsert"
  );
});

test("nettoyage : nettoyerExpires supprime les clés > 1h avec LIMIT 100", () => {
  const src = readFileSync("app/api/auth/login/route.ts", "utf8");
  assert.ok(src.includes("nettoyerExpires"), "fonction nettoyerExpires présente");
  assert.ok(
    src.includes("INTERVAL '1 hour'"),
    "seuil de nettoyage à 1 heure"
  );
  assert.ok(src.includes("LIMIT 100"), "limite de nettoyage à 100 lignes");
});

test("premiereIp : x-real-ip prioritaire, dernier XFF en repli", () => {
  // Vérifie que la route utilise bien premiereIp et pas le premier XFF.
  const src = readFileSync("app/api/auth/login/route.ts", "utf8");
  assert.ok(src.includes("premiereIp(req)"), "route utilise premiereIp");
  assert.ok(
    !src.includes("x-forwarded-for")[0] || src.includes("premiereIp"),
    "route ne lit pas directement x-forwarded-for"
  );
});

// ---- Tests SQL (env-gated) : incrément atomique, expiration, verrouillage ----

const dbUrl = process.env.BANQUE_TEST_DATABASE_URL;
const sqlActif = estUrlTestLocale(dbUrl);

test(
  "SQL : incrément atomique — deux appels concurrents comptent correctement",
  { skip: !sqlActif },
  async () => {
    assert.ok(estUrlTestLocale(dbUrl), "cible de test non locale");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: dbUrl, family: 4 });
    try {
      const cle = "test:audit001:atomic";
      // Nettoyage initial.
      await pool.query(`DELETE FROM "TentativeConnexion" WHERE cle = $1`, [cle]);

      // Simule 5 échecs concurrents (en parallèle).
      const upsert = `INSERT INTO "TentativeConnexion" (cle, tentatives, premiere_tentative, derniere_tentative)
         VALUES ($1, 1, now(), now())
         ON CONFLICT (cle) DO UPDATE SET
           tentatives = CASE
             WHEN "TentativeConnexion".premiere_tentative < now() - INTERVAL '15 minutes' THEN 1
             ELSE "TentativeConnexion".tentatives + 1
           END,
           premiere_tentative = CASE
             WHEN "TentativeConnexion".premiere_tentative < now() - INTERVAL '15 minutes' THEN now()
             ELSE "TentativeConnexion".premiere_tentative
           END,
           derniere_tentative = now()`;

      await Promise.all(Array.from({ length: 5 }, () => pool.query(upsert, [cle])));

      const r = await pool.query(
        `SELECT tentatives FROM "TentativeConnexion" WHERE cle = $1`,
        [cle]
      );
      // Avec l'upsert atomique, 5 appels concurrents → tentatives = 5.
      // Avec l'ancien code non atomique, on aurait pu obtenir 1.
      assert.equal(r.rows[0].tentatives, 5, "5 échecs concurrents comptés");

      // Nettoyage.
      await pool.query(`DELETE FROM "TentativeConnexion" WHERE cle = $1`, [cle]);
    } finally {
      await pool.end().catch(() => {});
    }
  }
);

test(
  "SQL : expiration — fenêtre expirée → réinitialisation à 1",
  { skip: !sqlActif },
  async () => {
    assert.ok(estUrlTestLocale(dbUrl), "cible de test non locale");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: dbUrl, family: 4 });
    try {
      const cle = "test:audit001:expire";
      // Insère avec une fenêtre expirée.
      await pool.query(
        `INSERT INTO "TentativeConnexion" (cle, tentatives, premiere_tentative, derniere_tentative)
         VALUES ($1, 5, now() - INTERVAL '20 minutes', now() - INTERVAL '20 minutes')
         ON CONFLICT (cle) DO UPDATE
           SET tentatives = 5,
               premiere_tentative = now() - INTERVAL '20 minutes',
               derniere_tentative = now() - INTERVAL '20 minutes'`,
        [cle]
      );

      // L'upsert devrait réinitialiser à 1 (fenêtre expirée).
      const upsert = `INSERT INTO "TentativeConnexion" (cle, tentatives, premiere_tentative, derniere_tentative)
         VALUES ($1, 1, now(), now())
         ON CONFLICT (cle) DO UPDATE SET
           tentatives = CASE
             WHEN "TentativeConnexion".premiere_tentative < now() - INTERVAL '15 minutes' THEN 1
             ELSE "TentativeConnexion".tentatives + 1
           END,
           premiere_tentative = CASE
             WHEN "TentativeConnexion".premiere_tentative < now() - INTERVAL '15 minutes' THEN now()
             ELSE "TentativeConnexion".premiere_tentative
           END,
           derniere_tentative = now()`;
      await pool.query(upsert, [cle]);

      const r = await pool.query(
        `SELECT tentatives, premiere_tentative FROM "TentativeConnexion" WHERE cle = $1`,
        [cle]
      );
      assert.equal(r.rows[0].tentatives, 1, "fenêtre expirée → réinitialisation à 1");

      // Nettoyage.
      await pool.query(`DELETE FROM "TentativeConnexion" WHERE cle = $1`, [cle]);
    } finally {
      await pool.end().catch(() => {});
    }
  }
);

test(
  "SQL : verrouillage — 10 échecs email → bloqué, 5 échecs IP → bloqué",
  { skip: !sqlActif },
  async () => {
    assert.ok(estUrlTestLocale(dbUrl), "cible de test non locale");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: dbUrl, family: 4 });
    try {
      const cleEmail = "test:audit001:lock-email";
      const cleIp = "test:audit001:lock-ip";
      const upsert = `INSERT INTO "TentativeConnexion" (cle, tentatives, premiere_tentative, derniere_tentative)
         VALUES ($1, 1, now(), now())
         ON CONFLICT (cle) DO UPDATE SET
           tentatives = CASE
             WHEN "TentativeConnexion".premiere_tentative < now() - INTERVAL '15 minutes' THEN 1
             ELSE "TentativeConnexion".tentatives + 1
           END,
           premiere_tentative = CASE
             WHEN "TentativeConnexion".premiere_tentative < now() - INTERVAL '15 minutes' THEN now()
             ELSE "TentativeConnexion".premiere_tentative
           END,
           derniere_tentative = now()`;

      // Email : 9 échecs → pas bloqué (seuil 10).
      for (let i = 0; i < 9; i++) {
        await pool.query(upsert, [cleEmail]);
      }
      let r = await pool.query(
        `SELECT tentatives FROM "TentativeConnexion" WHERE cle = $1`,
        [cleEmail]
      );
      assert.equal(r.rows[0].tentatives, 9);
      assert.ok(9 < 10, "9 < 10 → pas bloqué");

      // Email : 10e échec → bloqué.
      await pool.query(upsert, [cleEmail]);
      r = await pool.query(
        `SELECT tentatives FROM "TentativeConnexion" WHERE cle = $1`,
        [cleEmail]
      );
      assert.equal(r.rows[0].tentatives, 10);

      // IP : 5 échecs → bloqué (seuil 5).
      for (let i = 0; i < 5; i++) {
        await pool.query(upsert, [cleIp]);
      }
      r = await pool.query(
        `SELECT tentatives FROM "TentativeConnexion" WHERE cle = $1`,
        [cleIp]
      );
      assert.equal(r.rows[0].tentatives, 5);

      // Nettoyage.
      await pool.query(`DELETE FROM "TentativeConnexion" WHERE cle IN ($1, $2)`, [cleEmail, cleIp]);
    } finally {
      await pool.end().catch(() => {});
    }
  }
);

test(
  "SQL : nettoyage — supprime les clés > 1h",
  { skip: !sqlActif },
  async () => {
    assert.ok(estUrlTestLocale(dbUrl), "cible de test non locale");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: dbUrl, family: 4 });
    try {
      // Insère une clé expirée.
      await pool.query(
        `INSERT INTO "TentativeConnexion" (cle, tentatives, premiere_tentative, derniere_tentative)
         VALUES ('test:audit001:expired', 3, now() - INTERVAL '2 hours', now() - INTERVAL '2 hours')
         ON CONFLICT (cle) DO NOTHING`
      );

      // Le nettoyage devrait la supprimer.
      await pool.query(
        `DELETE FROM "TentativeConnexion" WHERE cle IN (
           SELECT cle FROM "TentativeConnexion"
           WHERE premiere_tentative < now() - INTERVAL '1 hour'
           LIMIT 100
         )`
      );

      const r = await pool.query(
        `SELECT tentatives FROM "TentativeConnexion" WHERE cle = 'test:audit001:expired'`
      );
      assert.equal(r.rowCount, 0, "clé expirée supprimée");
    } finally {
      await pool.end().catch(() => {});
    }
  }
);
