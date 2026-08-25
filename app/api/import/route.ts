import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { tempsMisMin } from "@/lib/calc";
import type { ImportedCahier } from "@/lib/excel";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const cahiers = (body.cahiers ?? []) as ImportedCahier[];
  if (!Array.isArray(cahiers) || cahiers.length === 0) {
    return NextResponse.json({ error: "Aucun cahier à importer." }, { status: 400 });
  }

  let cahiersCrees = 0;
  let cahiersFondus = 0;
  let lignesCrees = 0;
  let lignesIgnorees = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const ic of cahiers) {
      const nom = (ic.nom ?? "").toString().trim();
      if (!nom) continue;
      const lignes = Array.isArray(ic.lignes) ? ic.lignes : [];

      const ex = await client.query(`SELECT id FROM "Cahier" WHERE nom = $1`, [nom]);
      let cahierId: string;
      if (ex.rowCount && ex.rowCount > 0) {
        cahierId = ex.rows[0].id;
        cahiersFondus++;
      } else {
        const id = crypto.randomUUID();
        const r = await client.query(
          `INSERT INTO "Cahier" (id, nom) VALUES ($1, $2) RETURNING id`,
          [id, nom]
        );
        cahierId = r.rows[0].id;
        cahiersCrees++;
      }

      const valides = lignes
        .map((l) => ({
          date: (l.date ?? "").toString(),
          heureDebut: (l.heureDebut ?? "").toString(),
          heureFin: (l.heureFin ?? "").toString(),
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

      if (valides.length === 0) continue;

      const exist = await client.query(
        `SELECT date, "heureDebut", "heureFin", "nombrePersonnes" FROM "Ligne" WHERE "cahierId" = $1`,
        [cahierId]
      );
      const existKeys = new Set(
        exist.rows.map(
          (r) => `${r.date}|${r.heureDebut}|${r.heureFin}|${r.nombrePersonnes}`
        )
      );

      const aInserer = valides.filter(
        (l) =>
          !existKeys.has(`${l.date}|${l.heureDebut}|${l.heureFin}|${l.nombrePersonnes}`)
      );
      lignesIgnorees += valides.length - aInserer.length;

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
    return NextResponse.json({ cahiersCrees, cahiersFondus, lignesCrees, lignesIgnorees });
  } catch (e) {
    await client.query("ROLLBACK");
    const msg = e instanceof Error ? e.message : "Échec de l'import.";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}
