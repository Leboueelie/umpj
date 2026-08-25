import fs from "fs";
import { Pool } from "pg";

for (const l of fs.readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL manquant dans .env");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, family: 4 });

const sql = `
CREATE TABLE IF NOT EXISTS "Cahier" (
  "id" TEXT NOT NULL,
  "nom" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Cahier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Ligne" (
  "id" TEXT NOT NULL,
  "cahierId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "heureDebut" TEXT NOT NULL,
  "heureFin" TEXT NOT NULL,
  "nombrePersonnes" INTEGER NOT NULL,
  CONSTRAINT "Ligne_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Ligne_cahierId_idx" ON "Ligne"("cahierId");

ALTER TABLE "Ligne" DROP CONSTRAINT IF EXISTS "Ligne_cahierId_fkey";
ALTER TABLE "Ligne" ADD CONSTRAINT "Ligne_cahierId_fkey"
  FOREIGN KEY ("cahierId") REFERENCES "Cahier"("id") ON DELETE CASCADE;
`;

async function main() {
  await pool.query(sql);
  const c = await pool.query(`SELECT count(*)::int AS n FROM "Cahier"`);
  console.log("Tables pretes. Cahiers existants :", c.rows[0].n);
  await pool.end();
}

main().catch((e) => {
  console.error("Erreur init DB :", e.message);
  process.exit(1);
});
