import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

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
      `SELECT "id","titre","typeRapport","modules","periodeDu","periodeAu","filtres",
              "dateGeneration","auteurId","auteurLibelle","snapshot","schemaVersion",
              "format","pdfTaille","pdfSha256","xlsxTaille","xlsxSha256","statut"
       FROM "RapportGenere" WHERE "id" = $1`,
      [id]
    );
    if (!r.rowCount) {
      return NextResponse.json({ error: "Rapport introuvable." }, { status: 404 });
    }
    const row = r.rows[0];
    return NextResponse.json({
      id: row.id,
      titre: row.titre,
      typeRapport: row.typeRapport,
      modules: row.modules,
      periodeDu: row.periodeDu,
      periodeAu: row.periodeAu,
      filtres: row.filtres,
      dateGeneration: row.dateGeneration,
      auteurId: row.auteurId,
      auteur: row.auteurLibelle,
      snapshot: row.snapshot,
      schemaVersion: row.schemaVersion,
      format: row.format,
      pdfDisponible: row.pdfTaille !== null,
      pdfTaille: row.pdfTaille,
      pdfSha256: row.pdfSha256,
      xlsxDisponible: row.xlsxTaille !== null,
      xlsxTaille: row.xlsxTaille,
      xlsxSha256: row.xlsxSha256,
      statut: row.statut,
    });
  } catch (e) {
    console.error("Échec détail historique :", e);
    return NextResponse.json({ error: "Impossible de charger le rapport." }, { status: 500 });
  }
}
