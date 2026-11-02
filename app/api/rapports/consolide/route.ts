import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { construireRapportConsolide, parseConsolideParams } from "@/lib/rapport-consolide";

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
    return NextResponse.json(rapport);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: "Impossible de calculer le rapport consolidé." }, { status: 500 });
  }
}
