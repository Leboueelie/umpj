import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { buildEditionPdfBuffer } from "@/lib/edition-pdf";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await pool.query(`SELECT * FROM "Edition" WHERE "id" = $1`, [id]);
  if (!r.rowCount) return NextResponse.json({ error: "Edition introuvable." }, { status: 404 });
  const buf = await buildEditionPdfBuffer(r.rows[0]);
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="edition-${(r.rows[0] as any).numero}.pdf"`,
    },
  });
}
