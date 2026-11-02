// Garde anti-production pour le développement local.
// Vérifie que DATABASE_URL (process.env ou .env/.env.local) cible une base
// PostgreSQL locale (localhost / 127.0.0.1), jamais Neon ni un hôte distant.
// Sort avec code 1 si la cible n'est pas locale — bloque le lancement.
//
// Usage : node scripts/check-db-local.mjs
//   (appelé par `npm run db:check` et `npm run dev:local`)

import fs from "node:fs";

const HOTES_AUTORISES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// Charge .env et .env.local (sans écraser process.env) comme Next.js le fait.
function chargerEnv() {
  // .env.local a priorite sur .env (comme Next.js).
  for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    for (const l of fs.readFileSync(f, "utf8").split("\n")) {
      const m = l.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
      }
    }
  }
}

chargerEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ERREUR : DATABASE_URL absent (.env / .env.local).");
  process.exit(1);
}

let host;
try {
  host = new URL(url).hostname;
} catch {
  console.error("ERREUR : DATABASE_URL illisible.");
  process.exit(1);
}

if (!HOTES_AUTORISES.has(host)) {
  console.error(`ERREUR : DATABASE_URL cible un hôte distant (${host}).`);
  console.error("Le développement local doit utiliser 127.0.0.1:5435 (conteneur umpj-s1-test).");
  console.error("Vérifiez .env.local et ne pointez jamais vers Neon.");
  process.exit(1);
}

if (/neon/i.test(url)) {
  console.error("ERREUR : DATABASE_URL contient 'neon' — cible de production interdite.");
  process.exit(1);
}

console.log(`OK : DATABASE_URL cible ${host} (base locale).`);
