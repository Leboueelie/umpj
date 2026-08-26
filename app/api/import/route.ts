import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { tempsMisMin, normalizeHeure, normalizeDate } from "@/lib/calc";
import type { ImportedCahier } from "@/lib/excel";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const cahiers = (body.cahiers ?? []) as ImportedCahier[];
  if (!Array.isArray(cahiers) || cahiers.length === 0) {
    return NextResponse.json({ error: "Aucun cahier à importer." }, { status: 400 });
  }

  let cahiersCrees = 0;
  let cahiersFondus = 0;
  let cahiersIgnores = 0;
  let lignesCrees = 0;
  let lignesIgnorees = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const ic of cahiers) {
      const nom = (ic.nom ?? "").toString().trim();
      if (!nom) continue;
      const lignes = Array.isArray(ic.lignes) ? ic.lignes : [];

      const valides = lignes
        .map((l) => ({
          date: normalizeDate((l.date ?? "").toString()),
          heureDebut: normalizeHeure((l.heureDebut ?? "").toString()),
          heureFin: normalizeHeure((l.heureFin ?? "").toString()),
          nombrePersonnes:
            typeof l.nombrePersonnes === "number"
              ? l.nombrePersonnes
              : parseInt(l.nombrePersonnes as unknown as string, 10),
        }))
        .filter(
          (l) =>
            l.date &&
            l.heureDebut &&
            l.heureFin &&
            l.nombrePersonnes >= 1 &&
            tempsMisMin(l.heureDebut, l.heureFin) !== null
        );

      const ex = await client.query(`SELECT id FROM "Cahier" WHERE nom = $1`, [nom]);
      const existe = !!(ex.rowCount && ex.rowCount > 0);

      let cahierId: string;
      let aInserer = valides;

      if (existe) {
        cahierId = ex.rows[0].id;
        const exist = await client.query(
          `SELECT date, "heureDebut", "heureFin", "nombrePersonnes" FROM "Ligne" WHERE "cahierId" = $1`,
          [cahierId]
        );
        const existingCount = exist.rowCount ?? 0;
        // Cahier déjà à jour (feuille du fichier vide/stale) -> on n'écrase pas
        if (valides.length <= existingCount) {
          cahiersIgnores++;
          continue;
        }
        cahiersFondus++;
        const existKeys = new Set(
          exist.rows.map(
            (r) =>
              `${normalizeDate(r.date)}|${normalizeHeure(r.heureDebut)}|${normalizeHeure(
                r.heureFin
              )}|${r.nombrePersonnes}`
          )
        );
        const inserted = new Set<string>();
        aInserer = valides.filter((l) => {
          const key = `${l.date}|${l.heureDebut}|${l.heureFin}|${l.nombrePersonnes}`;
          if (existKeys.has(key) || inserted.has(key)) return false;
          inserted.add(key);
          return true;
        });
        lignesIgnorees += valides.length - aInserer.length;
      } else {
        if (valides.length === 0) continue;
        const id = crypto.randomUUID();
        const r = await client.query(
          `INSERT INTO "Cahier" (id, nom) VALUES ($1, $2) RETURNING id`,
          [id, nom]
        );
        cahierId = r.rows[0].id;
        cahiersCrees++;
        const inserted = new Set<string>();
        aInserer = valides.filter((l) => {
          const key = `${l.date}|${l.heureDebut}|${l.heureFin}|${l.nombrePersonnes}`;
          if (inserted.has(key)) return false;
          inserted.add(key);
          return true;
        });
        lignesIgnorees += valides.length - aInserer.length;
      }

      const CHUNK = 1000;
      for (let i = 0; i < aInserer.length; i += CHUNK) {
        const batch = aInserer.slice(i, i + CHUNK);
        const values: string[] = [];
        const params: unknown[] = [];
        let idx = 1;
        for (const l of batch) {
          values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
          params.push(
            crypto.randomUUID(),
            cahierId,
            l.date,
            l.heureDebut,
            l.heureFin,
            l.nombrePersonnes
          );
        }
        await client.query(
          `INSERT INTO "Ligne" (id, "cahierId", date, "heureDebut", "heureFin", "nombrePersonnes")
           VALUES ${values.join(", ")}`,
          params
        );
        lignesCrees += batch.length;
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ cahiersCrees, cahiersFondus, cahiersIgnores, lignesCrees, lignesIgnorees });
  } catch (e) {
    await client.query("ROLLBACK");
    const msg = e instanceof Error ? e.message : "Échec de l'import.";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}
