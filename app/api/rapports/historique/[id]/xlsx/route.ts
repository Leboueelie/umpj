import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { enteteContentDisposition } from "@/lib/fichiers";
import { createHash } from "node:crypto";

export const runtime = "nodejs";

function estUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { id } = await ctx.params;
  if (!estUuid(id)) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  try {
    const r = await pool.query(
      `SELECT "format", "xlsxData", "xlsxTaille", "xlsxSha256" FROM "RapportGenere" WHERE "id" = $1`,
      [id]
    );
    if (!r.rowCount) {
      return NextResponse.json({ error: "Rapport introuvable." }, { status: 404 });
    }
    const row = r.rows[0];
    if (row.format !== "xlsx" && row.format !== "both") {
      return NextResponse.json({ error: "Ce rapport ne contient pas de fichier Excel." }, { status: 404 });
    }
    if (!row.xlsxData) {
      return NextResponse.json({ error: "Fichier Excel introuvable." }, { status: 404 });
    }
    const buf: Buffer = row.xlsxData;
    if (row.xlsxTaille !== null && buf.length !== row.xlsxTaille) {
      return NextResponse.json({ error: "Taille du fichier incohérente." }, { status: 500 });
    }
    if (row.xlsxSha256) {
      const computed = createHash("sha256").update(buf).digest("hex");
      if (computed !== row.xlsxSha256) {
        return NextResponse.json({ error: "Empreinte du fichier incohérente." }, { status: 500 });
      }
    }
    const nomFichier = `UMPJ-rapport-${id}.xlsx`;
    return new Response(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": enteteContentDisposition(nomFichier),
      },
    });
  } catch (e) {
    console.error("Échec téléchargement XLSX historique :", e);
    return NextResponse.json({ error: "Impossible de télécharger le fichier." }, { status: 500 });
  }
}
