#!/usr/bin/env node
// Obtient un cookie de session UMPJ pour les tests HTTP locaux.
// Usage : node scripts/get-session.mjs <email>
// Le mot de passe est saisi sans écho (TTY) ou lu depuis stdin (pipe).
// Seul le cookie est affiché sur stdout — aucun secret n'est journalisé.
//
// Prérequis : DATABASE_URL pointant vers la base locale (127.0.0.1:5435).

import fs from "node:fs";
import readline from "node:readline";
import { Pool } from "pg";

// .env.local a priorité sur .env (comme Next.js).
for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const l of fs.readFileSync(f, "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
    }
  }
}

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage : node scripts/get-session.mjs <email>");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL manquant.");
  process.exit(1);
}

// Vérifier que la cible est locale
let host;
try { host = new URL(DATABASE_URL.replace(/^postgresql:/, "http:")).hostname; } catch { host = "(inconnu)"; }
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`ERREUR : cible distante (${host}). Arrêt.`);
  process.exit(1);
}

const modePipe = !process.stdin.isTTY;
let lignesPipe = null;
let idxPipe = 0;
if (modePipe) {
  lignesPipe = await new Promise((resolve) => {
    let d = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", () => resolve(d.split(/\r?\n/)));
  });
}

const rl = modePipe ? null : readline.createInterface({ input: process.stdin, output: process.stdout });

function question(q) {
  if (modePipe) { process.stderr.write(q); return Promise.resolve(lignesPipe[idxPipe++] ?? ""); }
  return new Promise((resolve) => rl.question(q, resolve));
}

async function questionMasquee(q) {
  if (modePipe) return question(q);
  return new Promise((resolve) => {
    rl.pause();
    const rlin = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stderr.write(q);
    const stdout = process.stdout;
    const orig = stdout.write.bind(stdout);
    stdout.write = () => true;
    rlin.question("", (reponse) => {
      stdout.write = orig;
      rlin.close();
      rl.resume();
      process.stdout.write("\n");
      resolve(reponse);
    });
  });
}

const pg = await import("pg");
const pool = new pg.Pool({ connectionString: DATABASE_URL, family: 4 });

try {
  const mdp = await questionMasquee("Mot de passe : ");
  const r = await pool.query(`SELECT id, email, hash, role, actif FROM "Utilisateur" WHERE email = $1`, [email]);
  if (!r.rowCount) {
    console.error("Compte introuvable.");
    process.exit(1);
  }
  const u = r.rows[0];
  if (!u.actif) {
    console.error("Compte désactivé.");
    process.exit(1);
  }

  // Vérifier le mot de passe via auth-core
  const { verifyPassword, signSession } = await import("../lib/auth-core.mjs");
  if (!verifyPassword(mdp, u.hash)) {
    console.error("Mot de passe incorrect.");
    process.exit(1);
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    console.error("AUTH_SECRET manquant ou trop court.");
    process.exit(1);
  }

  const token = signSession(
    { sub: u.id, role: u.role, iat: Date.now(), exp: Math.floor(Date.now() / 1000) + 12 * 3600 },
    secret
  );

  // Afficher uniquement le cookie (pas le mot de passe, pas le token complet dans les logs)
  process.stdout.write(`umpj_session=${token}\n`);
} finally {
  rl?.close();
  await pool.end();
}
