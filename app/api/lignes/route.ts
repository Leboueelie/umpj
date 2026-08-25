import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { tempsMisMin } from "@/lib/calc";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const cahierId = (b.cahierId ?? "").toString();
  const date = (b.date ?? "").toString();
  const heureDebut = (b.heureDebut ?? "").toString();
  const heureFin = (b.heureFin ?? "").toString();
  const nombrePersonnes = parseInt(b.nombrePersonnes, 10);

  if (!cahierId || !date || !heureDebut || !heureFin) {
    return NextResponse.json({ error: "Champs obligatoires manquants." }, { status: 400 });
  }
  if (!nombrePersonnes || nombrePersonnes < 1) {
    return NextResponse.json({ error: "Le nombre de participants doit être ≥ 1." }, { status: 400 });
  }
  if (tempsMisMin(heureDebut, heureFin) === null) {
    return NextResponse.json({ error: "Horaires invalides." }, { status: 400 });
  }

  const c = await pool.query(`SELECT id FROM "Cahier" WHERE id = $1`, [cahierId]);
  if (c.rowCount === 0)
    return NextResponse.json({ error: "Cahier introuvable." }, { status: 404 });

  const id = crypto.randomUUID();
  const r = await pool.query(
    `INSERT INTO "Ligne" (id, "cahierId", date, "heureDebut", "heureFin", "nombrePersonnes")
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, "cahierId", date, "heureDebut", "heureFin", "nombrePersonnes"`,
    [id, cahierId, date, heureDebut, heureFin, nombrePersonnes]
  );
  return NextResponse.json(r.rows[0], { status: 201 });
}
