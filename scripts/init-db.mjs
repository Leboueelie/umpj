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

CREATE TABLE IF NOT EXISTS "ChambreDePriere" (
  "id" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "nom" TEXT NOT NULL,
  "lieu" TEXT NOT NULL,
  "fardeau" TEXT NOT NULL,
  "dirigeants" TEXT NOT NULL,
  "contacts" TEXT NOT NULL DEFAULT '',
  "ordre" INTEGER NOT NULL DEFAULT 0,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChambreDePriere_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChambreDePriere_zoneId_idx" ON "ChambreDePriere"("zoneId");

ALTER TABLE "ChambreDePriere" DROP CONSTRAINT IF EXISTS "ChambreDePriere_zoneId_fkey";
ALTER TABLE "ChambreDePriere" ADD CONSTRAINT "ChambreDePriere_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS "Edition" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "numero" INTEGER NOT NULL,
  "reference" TEXT NOT NULL DEFAULT '',
  "dateDebut" DATE NOT NULL,
  "dateFin" DATE NOT NULL,
  "libellePeriode" TEXT NOT NULL DEFAULT '',
  "delegationsPresentes" INTEGER NOT NULL DEFAULT 0,
  "regionsSpirituelles" INTEGER NOT NULL DEFAULT 0,
  "missionnaires1" INTEGER NOT NULL DEFAULT 0,
  "missionnaires2" INTEGER NOT NULL DEFAULT 0,
  "anciensAbidjan" INTEGER NOT NULL DEFAULT 0,
  "epousesAnciensAbidjan" INTEGER NOT NULL DEFAULT 0,
  "moyenneParticipation" INTEGER NOT NULL DEFAULT 0,
  "heuresInvesties" INTEGER NOT NULL DEFAULT 0,
  "delegationsExterieures" JSONB NOT NULL DEFAULT '[]',
  "abidjanZones" JSONB NOT NULL DEFAULT '[]',
  "interieurLocalites" JSONB NOT NULL DEFAULT '[]',
  "participantsParJour" JSONB NOT NULL DEFAULT '[]',
  "sessions" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Edition_pkey" PRIMARY KEY ("id")
);
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

  // Migration: renommer "but" -> "fardeau" si besoin + ajouter "contacts"
  await pool.query(`
    DO $$
    BEGIN
      BEGIN ALTER TABLE "ChambreDePriere" RENAME COLUMN "but" TO "fardeau"; EXCEPTION WHEN undefined_column THEN END;
      BEGIN ALTER TABLE "ChambreDePriere" ADD COLUMN "contacts" TEXT NOT NULL DEFAULT ''; EXCEPTION WHEN duplicate_column THEN END;
    END $$;
  `);

  // Seed des chambres de prière de YOPOUGON (21 chambres)
  const CHAMBRES_YOPOUGON = [
    { lieu: "MAISON DE PRIERE DE YOPOUGON POUR TOUTES LES NATIONS", fardeau: "L'ACADEMIE PASTORALE DANS NOTRE MINISTERE", dirigeants: "GNAGNE Pierre, GABO Myrlore", contacts: "" },
    { lieu: "MAISON DE PRIERE DE YOPOUGON POUR TOUTES LES NATIONS", fardeau: "MARGUERITE LOMBE ET LA CONQUETE DU S/C DE JERUSALEM", dirigeants: "Deborah KOUASSI", contacts: "" },
    { lieu: "CENTRE A LEM", fardeau: "LA LOUANGE ET LES ACTIONS DE GRACE A DIEU + PROCLAMATIONS", dirigeants: "EMMANUEL MONDAH", contacts: "" },
    { lieu: "CHEZ LES DIOPOH (BANCO 2)", fardeau: "CROISSANCE EN NOMBRE ET EN QUALITE DU S/C DE BANCO 2", dirigeants: "KOFFI JULIANA DIOPOH", contacts: "" },
    { lieu: "GESCO CHEZ LES DJAGOUN", fardeau: "COMMUNION DES ANCIENS D'ABIDJAN AVEC DIEU", dirigeants: "DOUE CATHERINE", contacts: "" },
    { lieu: "GESCO CHEZ LYDIE KONE", fardeau: "BONIFACE MENYE, L'ECRIVAIN", dirigeants: "AKPA MARINA", contacts: "" },
    { lieu: "CHEZ LES GOHOUN", fardeau: "KOUASSI MARTIN ET LA CONQUETE DE NIANGON-NORD", dirigeants: "STEPHANIE KOUASSI", contacts: "" },
    { lieu: "CHEZ LES SEHI", fardeau: "MARIE-LOUISE ET LA CONQUETE DE NIANGON-SUD", dirigeants: "Rolande BITI", contacts: "" },
    { lieu: "CHEZ LES BROU", fardeau: "COLETTE MENYE ET LA COMMUNION AVEC DIEU", dirigeants: "LYDIE BROU", contacts: "" },
    { lieu: "CHEZ LES BROU", fardeau: "BROU SEVERIN ET LA CONQUETE DE MILLIONNAIRE", dirigeants: "TOURE MARIAM", contacts: "" },
    { lieu: "CHEZ LES KOUABLAN", fardeau: "KOUABLAN FIACRE ET LA CONQUETE DE SELMER", dirigeants: "ODILE KOUABLAN", contacts: "" },
    { lieu: "CHEZ LES EMOLO", fardeau: "OKA EMOLO YANNICK ET LA CONQUETE D'ASSONVON", dirigeants: "MARCELLE EMOLO", contacts: "" },
    { lieu: "CIE (BUREAU DE LA CONQUETE)", fardeau: "LE DEPARTEMENT NATIONAL DE LA PRODUCTION ET LA DISTRIBUTION DES TRAITES EVANGELIQUES", dirigeants: "HAWA OKA", contacts: "" },
    { lieu: "ANDOKOI (CHAMBRE DE PRIERE)", fardeau: "INNOCENT LOMBE ET LA CONQUETE DE YOPOUGON", dirigeants: "GNAGNE DJOGBO", contacts: "" },
    { lieu: "ANDOKOI (CHAMBRE DE PRIERE)", fardeau: "HINO DANIEL ET LA CONQUETE D'ANDOKOI", dirigeants: "HINO SYLVIE", contacts: "" },
    { lieu: "CHEZ LES KONNI", fardeau: "LA CONVERSION DES ENFANTS DE YOPOUGON", dirigeants: "KONNI ROSINE", contacts: "" },
    { lieu: "CHEZ ATTIEGOUA", fardeau: "LA JEUNESSE DE YOPOUGON", dirigeants: "ATTIEGOUA", contacts: "" },
    { lieu: "CHEZ LES BANHIE", fardeau: "LES COUPLES DE YOPOUGON", dirigeants: "BANHIE & DIANE BLE", contacts: "" },
    { lieu: "CHEZ LES KOUASSI", fardeau: "LES EVANGELISTES DE YOPOUGON", dirigeants: "KOUASSI AUGUSTIN", contacts: "" },
    { lieu: "CHEZ LES OULE", fardeau: "LES SEMEURS DE YOPOUGON", dirigeants: "AMANI LAETITIA", contacts: "" },
    { lieu: "CHEZ LES OULE", fardeau: "PAUL BAH ET LA CONQUETE DU SOUS-CENTRE DE TOITS-ROUGES", dirigeants: "MARIE-CHARLES OULE", contacts: "" },
  ];

  const zoneYop = await pool.query(`SELECT id FROM "Zone" WHERE "nom" = 'YOPOUGON' LIMIT 1`);
  if (zoneYop.rowCount > 0) {
    const yopId = zoneYop.rows[0].id;
    const existant = await pool.query(`SELECT count(*)::int AS n FROM "ChambreDePriere" WHERE "zoneId" = $1`, [yopId]);
    if (existant.rows[0].n === 0) {
      for (let i = 0; i < CHAMBRES_YOPOUGON.length; i++) {
        const c = CHAMBRES_YOPOUGON[i];
        await pool.query(
          `INSERT INTO "ChambreDePriere" (id, "zoneId", nom, lieu, fardeau, dirigeants, contacts, "ordre")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [randomUUID(), yopId, `CHAMBRE DE PRIERE ${i + 1}`, c.lieu, c.fardeau, c.dirigeants, c.contacts, i + 1]
        );
      }
      console.log("Chambres Yopougon seedees :", CHAMBRES_YOPOUGON.length);
    } else {
      console.log("Chambres Yopougon deja presentes :", existant.rows[0].n);
    }
  }

  // Seed des chambres de prière de ADJAME-ATTECOUBE (14 chambres)
  const CHAMBRES_ADJAME = [
    { lieu: "220 LOGEMENTS", fardeau: "BM ET SON INTIMITÉ AVEC DIEU", dirigeants: "MBAMA FLORENCE", contacts: "07 07 46 07 97" },
    { lieu: "TEMPLE", fardeau: "SEMEURS", dirigeants: "LIDWINE NAPIASSOU", contacts: "05 04 36 95 55" },
    { lieu: "PAILLET", fardeau: "BM ET LA PUISSANCE POUR OPÉRER LES MIRACLES ÉVANGÉLIQUES", dirigeants: "AKA PULCHÉRIE", contacts: "07 09 68 67 83" },
    { lieu: "TEMPLE", fardeau: "JEUNESSES", dirigeants: "KACOU ANINI CATHERINE", contacts: "07 07 92 13 82" },
    { lieu: "AGBAN", fardeau: "ÉVANGÉLISATION ET IMPLANTATIONS DES ÉGLISES", dirigeants: "AKA JOËLLE", contacts: "07 07 20 75 32" },
    { lieu: "WILLIAMS VILLE", fardeau: "LA CROISSANCE ET IMPLANTATIONS DES ASSEMBLÉES", dirigeants: "LAGO ODILE", contacts: "07 49 32 68 74" },
    { lieu: "136 LOGEMENTS", fardeau: "LES ENFANTS", dirigeants: "YAO PÉLAGIE", contacts: "07 09 74 74 78" },
    { lieu: "PAILLET", fardeau: "BM ET LES VOYAGES MISSIONNAIRES", dirigeants: "KUITE FLORENCE", contacts: "07 59 27 00 07" },
    { lieu: "PAILLET", fardeau: "BM ET LE MINISTÈRE DE LA PAROLE (ENSEIGNEMENTS)", dirigeants: "KANA RACHELLE", contacts: "07 48 30 63 85" },
    { lieu: "WILLIAMS VILLE", fardeau: "BM ET LES RETRAITES DES MARDIS", dirigeants: "GUE MARIE LAURE", contacts: "07 89 86 39 75" },
    { lieu: "TEMPLE", fardeau: "ANCIEN MATHIAS DATE ET LA CONQUÊTE D'ADJAME", dirigeants: "KOUABENAN ESTELLE", contacts: "07 47 48 57 83" },
    { lieu: "ATECOUBE", fardeau: "LA SAINTETÉ : LA VIE DE SANCTIFICATION DE L'ÉGLISE", dirigeants: "N'GORAN MARJOLAINE", contacts: "05 56 99 90 15" },
    { lieu: "ATECOUBE", fardeau: "LA CROISSANCE ET L'IMPLANTATION DES ASSEMBLÉES", dirigeants: "N'GORAN MARJOLAINE & CHRISTINE", contacts: "05 56 99 90 15" },
    { lieu: "WILLIAMS VILLE", fardeau: "LA MARCHE ET LA SANCTIFICATION DE LA FAMILLE MENYE", dirigeants: "DEGUENOVO MARIE CLAIRE", contacts: "05 44 53 24 75" },
  ];

  const zoneAdj = await pool.query(`SELECT id FROM "Zone" WHERE "nom" = 'ADJAME-ATTECOUBE-WYLLY' LIMIT 1`);
  if (zoneAdj.rowCount > 0) {
    const adjId = zoneAdj.rows[0].id;
    const existant = await pool.query(`SELECT count(*)::int AS n FROM "ChambreDePriere" WHERE "zoneId" = $1`, [adjId]);
    if (existant.rows[0].n === 0) {
      for (let i = 0; i < CHAMBRES_ADJAME.length; i++) {
        const c = CHAMBRES_ADJAME[i];
        await pool.query(
          `INSERT INTO "ChambreDePriere" (id, "zoneId", nom, lieu, fardeau, dirigeants, contacts, "ordre")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [randomUUID(), adjId, `CHAMBRE DE PRIERE ${i + 1}`, c.lieu, c.fardeau, c.dirigeants, c.contacts, i + 1]
        );
      }
      console.log("Chambres Adjame-Attecoube seedees :", CHAMBRES_ADJAME.length);
    } else {
      console.log("Chambres Adjame-Attecoube deja presentes :", existant.rows[0].n);
    }
  }

  // Seed des chambres de prière de COCODY (7 chambres — implantation 02/05/2026)
  const CHAMBRES_COCODY = [
    { lieu: "PLATEAU — chez les OUATTARA", fardeau: "La santé physique et spirituelle de CM ; BN et la conquête du plateau", dirigeants: "Carole OUATTARA", contacts: "" },
    { lieu: "COCODY CENTRE — chez les HUE", fardeau: "Santé physique et Spirituelle de ELO ; Conquête des enfants dans la zone de cocody-plateau ; Succès de ELO auprès du Ministère des Jeunes et Etudiants ; Protection physique et Spirituelle de BM ; Protection physique de BM : Anatomie", dirigeants: "Annick HUE, Cécile N'DA, Cécile KOUAKOU, Marguerite LETCHE, Couple DE SAHI, Yvonne TAPE, Danielle ALLA", contacts: "" },
    { lieu: "ANGRÉ — chez les GUE", fardeau: "Protection de BM et de son ministère ; FGK, les dirigeants et la conquête d'Angré ; La croissance quantitative et qualitative des Églises de notre œuvre à travers le monde", dirigeants: "Francis GUE KPAN, Kareine YAO, Delphine N'DRI", contacts: "" },
    { lieu: "ANGRÉ — chez la sœur Suzanne AMICHIA", fardeau: "Protection de BM et de son ministère", dirigeants: "Suzanne AMICHIA", contacts: "" },
    { lieu: "ANGRÉ — chez les DOUA-SAHI", fardeau: "Succès global de CM ; DSD en tant que DGA de la RTVC et PCA de la CMCI", dirigeants: "Elisabeth DOUA-SAHI", contacts: "" },
    { lieu: "BESSIKOI DJOROGOBITÉ — chez la sœur SARA LEMARQUANT", fardeau: "YDH, les dirigeants, et la conquête de Djorogobité ; YDH et la délivrance des enfants", dirigeants: "Alvine YAO", contacts: "" },
    { lieu: "BESSIKOI DJOROGOBITÉ — chez la sr Liliane KONAN", fardeau: "Les parents et les enfants", dirigeants: "Alvine YAO", contacts: "" },
  ];

  const zoneCocody = await pool.query(`SELECT id FROM "Zone" WHERE "nom" = 'COCODY' LIMIT 1`);
  if (zoneCocody.rowCount > 0) {
    const cocodyId = zoneCocody.rows[0].id;
    const existant = await pool.query(`SELECT count(*)::int AS n FROM "ChambreDePriere" WHERE "zoneId" = $1`, [cocodyId]);
    if (existant.rows[0].n === 0) {
      for (let i = 0; i < CHAMBRES_COCODY.length; i++) {
        const c = CHAMBRES_COCODY[i];
        await pool.query(
          `INSERT INTO "ChambreDePriere" (id, "zoneId", nom, lieu, fardeau, dirigeants, contacts, "ordre")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [randomUUID(), cocodyId, `CHAMBRE DE PRIERE ${i + 1}`, c.lieu, c.fardeau, c.dirigeants, c.contacts, i + 1]
        );
      }
      console.log("Chambres Cocody seedees :", CHAMBRES_COCODY.length);
    } else {
      console.log("Chambres Cocody deja presentes :", existant.rows[0].n);
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error("Erreur init DB :", e.message);
  process.exit(1);
});
