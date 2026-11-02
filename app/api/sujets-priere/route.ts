import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import type { SujetPriere } from "@/lib/types";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const res = await pool.query<SujetPriere>(
    `SELECT * FROM "SujetPriere" ORDER BY "createdAt" DESC`
  );
  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const body = (lecture.body ?? {}) as any;
  const { nom } = body;

  if (!nom?.trim()) {
    return NextResponse.json(
      { error: "Le nom du sujet est requis" },
      { status: 400 }
    );
  }

  if (nom.trim().length > 200)
    return NextResponse.json(
      { error: "Le nom du sujet est trop long (200 caractères maximum)." },
      { status: 400 }
    );

  const id = randomUUID();
  await pool.query(
    `INSERT INTO "SujetPriere" (id, nom) VALUES ($1, $2)`,
    [id, nom.trim()]
  );

  const res = await pool.query<SujetPriere>(
    `SELECT * FROM "SujetPriere" WHERE id = $1`,
    [id]
  );

  return NextResponse.json(res.rows[0], { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID requis" }, { status: 400 });
  }

  const r = await pool.query(`DELETE FROM "SujetPriere" WHERE id = $1`, [id]);
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Sujet introuvable." }, { status: 404 });
  return NextResponse.json({ success: true });
}
