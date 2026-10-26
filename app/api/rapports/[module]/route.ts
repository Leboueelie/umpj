import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { construireRapport } from "@/lib/rapports";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ module: string }> }
) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { module } = await ctx.params;
  const url = new URL(req.url);
  const du = url.searchParams.get("du");
  const au = url.searchParams.get("au");

  try {
    const rapport = await construireRapport(pool, module, du, au);
    if (!rapport) {
      return NextResponse.json({ error: "Rapport inconnu." }, { status: 404 });
    }
    return NextResponse.json(rapport);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    if (message.includes("bornes") || message.includes("AAA") || message.includes("précéder")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Impossible de calculer le rapport." },
      { status: 500 }
    );
  }
}
