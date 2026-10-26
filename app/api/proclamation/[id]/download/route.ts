import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { enteteContentDisposition } from "@/lib/fichiers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { id } = await params;
  const r = await pool.query(
    `SELECT "nomFichier", data FROM "Proclamation" WHERE id = $1`,
    [id]
  );
  if (r.rowCount === 0) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  const row = r.rows[0];
  return new Response(row.data, {
    headers: {
      "Content-Type": "application/pdf",
      // Nom assaini : jamais de valeur brute issue de la base (anti injection d'en-tête).
      "Content-Disposition": enteteContentDisposition(row.nomFichier),
    },
  });
}
