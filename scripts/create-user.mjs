#!/usr/bin/env node
// Création d'un compte utilisateur (bootstrap / récupération d'accès).
// Usage : node scripts/create-user.mjs
// - Lit DATABASE_URL depuis .env (ou l'environnement).
// - Aucun identifiant par défaut ; le mot de passe est demandé sans écho (TTY).
// - Refuse les doublons ; le premier compte est forcé en ADMIN.
// - N'écrit qu'après confirmation explicite de l'opérateur (hôte affiché).
//
// Authentification V2 : le nom complet normalisé est l'identifiant de connexion.
// La normalisation ci-dessous DOIT rester identique à lib/normalisation.ts
// (trim + collapse des espaces + minuscules, accents conservés).

import fs from "fs";
import readline from "readline";
import { hashPassword } from "../lib/auth-core.mjs";

const envFile = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
for (const l of envFile.split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
}
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL manquant (.env ou environnement).");
  process.exit(1);
}

let host = "(inconnu)";
try {
  host = new URL(DATABASE_URL.replace(/^postgresql:/, "http:")).hostname;
} catch {
  /* affichage best effort */
}

// En mode pipé (tests/automatisation), toutes les lignes sont lues d'avance.
// En TTY, les questions utilisent readline et le mot de passe est masqué.
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

const rl = modePipe
  ? null
  : readline.createInterface({ input: process.stdin, output: process.stdout });

function question(q) {
  if (modePipe) {
    process.stdout.write(q);
    return Promise.resolve(lignesPipe[idxPipe++] ?? "");
  }
  return new Promise((resolve) => rl.question(q, resolve));
}

// Saisie masquée sur TTY (interface readline dédiée, rl principal en pause) ;
// en mode pipé, lecture d'une ligne classique.
async function questionMasquee(q) {
  if (modePipe) return question(q);
  return new Promise((resolve) => {
    rl.pause();
    const rlin = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    process.stdout.write(q);
    const stdout = process.stdout;
    const orig = stdout.write.bind(stdout);
    stdout.write = () => true; // coupe l'écho du mot de passe
    rlin.question("", (reponse) => {
      stdout.write = orig;
      rlin.close();
      rl.resume();
      process.stdout.write("\n");
      resolve(reponse);
    });
  });
}

// Normalisation V2 (identique à lib/normalisation.ts#normaliserNom).
function normaliserNom(nom) {
  if (typeof nom !== "string") return "";
  return nom.trim().replace(/\s+/g, " ").toLowerCase();
}

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: DATABASE_URL, family: 4 });

async function main() {
  console.log("=== Création d'un compte UMPJ ===");
  console.log(`Base cible (hôte) : ${host}`);
  console.log("Aucun compte ne sera créé sans votre confirmation finale.\n");

  const existants = await pool.query(
    `SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE role='ADMIN' AND actif)::int AS admins
     FROM "Utilisateur"`
  );
  const nbComptes = existants.rows[0].n;
  const nbAdmins = existants.rows[0].admins;
  if (nbComptes === 0) {
    console.log("Mode : bootstrap (premier administrateur).");
  } else {
    console.log(`${nbComptes} compte(s) existant(s), dont ${nbAdmins} administrateur(s) actif(s).`);
  }

  // Nom complet (identifiant de connexion V2).
  const nomBrut = await question("Nom complet : ");
  const nomAffiche = nomBrut.trim().replace(/\s+/g, " ");
  const nomNormalise = nomAffiche.toLowerCase();
  if (!nomAffiche) {
    console.error("Le nom complet est obligatoire.");
    process.exit(1);
  }
  if (nomAffiche.length > 200) {
    console.error("Nom complet trop long (200 caractères maximum).");
    process.exit(1);
  }

  const doublonNom = await pool.query(
    `SELECT 1 FROM "Utilisateur"
     WHERE lower(regexp_replace(trim("nom"), '\\s+', ' ', 'g')) = $1`,
    [nomNormalise]
  );
  if (doublonNom.rowCount) {
    console.error(
      "Un compte existe déjà avec ce nom (ou une variante d'espacement/casse)."
    );
    process.exit(1);
  }

  const email = (await question("Email : ")).trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    console.error("Email invalide.");
    process.exit(1);
  }

  const doublonEmail = await pool.query(`SELECT 1 FROM "Utilisateur" WHERE email = $1`, [email]);
  if (doublonEmail.rowCount) {
    console.error(
      "Un compte existe déjà avec cet email. Utilisez /admin/utilisateurs (ADMIN) pour le réinitialiser."
    );
    process.exit(1);
  }

  let role = "ADMIN";
  if (nbComptes > 0) {
    const r = (await question("Rôle (ADMIN/LECTEUR) [LECTEUR] : ")).trim().toUpperCase();
    role = r === "ADMIN" ? "ADMIN" : "LECTEUR";
  }

  const mdp1 = await questionMasquee("Mot de passe (8 caractères min, sans écho) : ");
  const mdp2 = await questionMasquee("Confirmez le mot de passe : ");
  if (mdp1 !== mdp2) {
    console.error("Les mots de passe ne correspondent pas.");
    process.exit(1);
  }
  if (mdp1.length < 8) {
    console.error("Mot de passe trop court (8 caractères minimum).");
    process.exit(1);
  }

  const confirme = (
    await question(`Confirmer la création de ${nomAffiche} (${email}, ${role}) sur ${host} ? (oui/non) : `)
  )
    .trim()
    .toLowerCase();
  if (confirme !== "oui") {
    console.log("Annulé. Aucune écriture effectuée.");
    process.exit(0);
  }

  const hash = hashPassword(mdp1);
  await pool.query(
    `INSERT INTO "Utilisateur" (email, nom, hash, role) VALUES ($1, $2, $3, $4)`,
    [email, nomAffiche, hash, role]
  );
  await pool.query(
    `INSERT INTO "JournalAdmin" (acteur, action, cible, detail)
     VALUES ($1, 'creation_script', $2, $3)`,
    ["script-create-user", email, JSON.stringify({ nom: nomAffiche, role, hote: host })]
  );
  console.log(`Compte créé : ${nomAffiche} (${email}, ${role}).`);
  console.log("Le mot de passe n'a ni été affiché ni été journalisé.");
}

try {
  await main();
} finally {
  rl?.close();
  await pool.end();
}
