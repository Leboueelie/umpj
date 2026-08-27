import fs from "fs";
import { randomUUID } from "crypto";
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

const ZONES = [
  "ABATA-AKOUEDO",
  "ABOBO",
  "ADJAME-ATTECOUBE-WYLLY",
  "ANYAMA",
  "ATTOBAN-BONOUMIN",
  "BINGERVILLE",
  "COCODY",
  "JULES VERNES-CITE SIR",
  "KOUMASSI",
  "MARCORY-TREICHVILLE",
  "M'POUTO",
  "PORT-BOUET",
  "RIVERA 2",
  "ROSIERS",
  "PALMERAIE",
  "YOPOUGON",
  "AGNEBY TIASSA",
  "BAS SASSANDRA",
  "BELIER",
  "CAVALY",
  "GBEKE",
  "GOH",
  "GONTOUGO",
  "GRAND PONT",
  "HAUT SASSANDRA",
  "IFFOU",
  "INDENIE DJUABLIN",
  "KABADOUGOU",
  "SUD COMOE",
  "LOH DJIBOUA",
  "MARAHOUE",
  "PORO",
  "TONKPI",
  "WORODOUGOU",
];

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

CREATE TABLE IF NOT EXISTS "Zone" (
  "id" TEXT NOT NULL,
  "nom" TEXT NOT NULL,
  "ordre" INTEGER NOT NULL DEFAULT 0,
  "groupe" TEXT NOT NULL DEFAULT 'interieur',
  CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConfigFiche" (
  "cle" TEXT NOT NULL,
  "valeur" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ConfigFiche_pkey" PRIMARY KEY ("cle")
);

CREATE TABLE IF NOT EXISTS "EntreeZone" (
  "id" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "mois" TEXT NOT NULL,
  "tempsMis" INTEGER,
  "participants" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "EntreeZone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EntreeZone_zone_mois_key" UNIQUE ("zoneId","mois")
);

CREATE INDEX IF NOT EXISTS "EntreeZone_mois_idx" ON "EntreeZone"("mois");

ALTER TABLE "EntreeZone" DROP CONSTRAINT IF EXISTS "EntreeZone_zoneId_fkey";
ALTER TABLE "EntreeZone" ADD CONSTRAINT "EntreeZone_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE;
`;

async function main() {
  await pool.query(sql);

  await pool.query(`
    DO $$
    BEGIN
      BEGIN ALTER TABLE "EntreeZone" ADD COLUMN "tempsMis" INTEGER; EXCEPTION WHEN duplicate_column THEN END;
      BEGIN ALTER TABLE "EntreeZone" DROP COLUMN IF EXISTS "heureDebut"; EXCEPTION WHEN others THEN END;
      BEGIN ALTER TABLE "EntreeZone" DROP COLUMN IF EXISTS "heureFin"; EXCEPTION WHEN others THEN END;
      BEGIN ALTER TABLE "Zone" ADD COLUMN "groupe" TEXT NOT NULL DEFAULT 'interieur'; EXCEPTION WHEN duplicate_column THEN END;
    END $$;
  `);

  // Compteurs de chambres de prieres (editables depuis l'UI)
  await pool.query(
    `INSERT INTO "ConfigFiche" ("cle","valeur") VALUES ('chambresAbidjan', 276), ('chambresInterieur', 216)
     ON CONFLICT ("cle") DO NOTHING`
  );

  const c = await pool.query(`SELECT count(*)::int AS n FROM "Cahier"`);
  console.log("Tables pretes. Cahiers existants :", c.rows[0].n);

  const z = await pool.query(`SELECT count(*)::int AS n FROM "Zone"`);
  if (z.rows[0].n === 0) {
    for (let i = 0; i < ZONES.length; i++) {
      await pool.query(
        `INSERT INTO "Zone" ("id","nom","ordre") VALUES ($1,$2,$3)`,
        [randomUUID(), ZONES[i], i]
      );
    }
    console.log("Zones seedees :", ZONES.length);
  } else {
    console.log("Zones deja presentes :", z.rows[0].n);
  }

  // Les 16 zones d'Abidjan -> groupe "abidjan" (les autres restent "interieur")
  await pool.query(
    `UPDATE "Zone" SET "groupe"='abidjan' WHERE "nom" IN (
      'ABATA-AKOUEDO','ABOBO','ADJAME-ATTECOUBE-WYLLY','ANYAMA','ATTOBAN-BONOUMIN',
      'BINGERVILLE','COCODY','JULES VERNES-CITE SIR','KOUMASSI','MARCORY-TREICHVILLE',
      'M''POUTO','PORT-BOUET','RIVERA 2','ROSIERS','PALMERAIE','YOPOUGON'
    )`
  );

  await pool.end();
}

main().catch((e) => {
  console.error("Erreur init DB :", e.message);
  process.exit(1);
});
