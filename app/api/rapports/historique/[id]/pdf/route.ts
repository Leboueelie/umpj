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
      `SELECT "format", "pdfData", "pdfTaille", "pdfSha256" FROM "RapportGenere" WHERE "id" = $1`,
      [id]
    );
    if (!r.rowCount) {
      return NextResponse.json({ error: "Rapport introuvable." }, { status: 404 });
    }
    const row = r.rows[0];
    if (row.format !== "pdf" && row.format !== "both") {
      return NextResponse.json({ error: "Ce rapport ne contient pas de PDF." }, { status: 404 });
    }
    if (!row.pdfData) {
      return NextResponse.json({ error: "Fichier PDF introuvable." }, { status: 404 });
    }
    const buf: Buffer = row.pdfData;
    if (row.pdfTaille !== null && buf.length !== row.pdfTaille) {
      return NextResponse.json({ error: "Taille du fichier incohérente." }, { status: 500 });
    }
    if (row.pdfSha256) {
      const computed = createHash("sha256").update(buf).digest("hex");
      if (computed !== row.pdfSha256) {
        return NextResponse.json({ error: "Empreinte du fichier incohérente." }, { status: 500 });
      }
    }
    const nomFichier = `UMPJ-rapport-${id}.pdf`;
    return new Response(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": enteteContentDisposition(nomFichier),
      },
    });
  } catch (e) {
    console.error("Échec téléchargement PDF historique :", e);
    return NextResponse.json({ error: "Impossible de télécharger le fichier." }, { status: 500 });
  }
}
