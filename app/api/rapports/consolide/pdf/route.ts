import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { construireRapportConsolide, parseConsolideParams } from "@/lib/rapport-consolide";
import { buildConsolidatedPdfBuffer } from "@/lib/rapport-consolide-pdf";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const url = new URL(req.url);
  const parsed = parseConsolideParams(url.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.erreur }, { status: parsed.status });
  }

  try {
    const rapport = await construireRapportConsolide(
      pool,
      parsed.modules,
      parsed.du,
      parsed.au,
      acces.email
    );
    const buf = await buildConsolidatedPdfBuffer(rapport, acces.email);
    const nomFichier = `UMPJ-rapport-consolide-${parsed.modules.join("-")}-${parsed.du || "toutes"}-${parsed.au || "toutes"}.pdf`;
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomFichier}"`,
      },
    });
  } catch (e) {
    console.error("Échec génération PDF consolidé :", e);
    return NextResponse.json({ error: "Impossible de générer le rapport consolidé." }, { status: 500 });
  }
}
