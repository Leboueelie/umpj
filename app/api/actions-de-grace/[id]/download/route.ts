import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const r = await pool.query(
    `SELECT "nomFichier", data FROM "ActionDeGrace" WHERE id = $1`,
    [id]
  );
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });

  const row = r.rows[0];
  return new Response(row.data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${row.nomFichier}"`,
    },
  });
}
