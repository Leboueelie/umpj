import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import type { SujetPriere } from "@/lib/types";

export async function GET() {
  const res = await pool.query<SujetPriere>(
    `SELECT * FROM "SujetPriere" ORDER BY "createdAt" DESC`
  );
  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { nom } = body;

  if (!nom?.trim()) {
    return NextResponse.json(
      { error: "Le nom du sujet est requis" },
      { status: 400 }
    );
  }

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
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID requis" }, { status: 400 });
  }

  await pool.query(`DELETE FROM "SujetPriere" WHERE id = $1`, [id]);
  return NextResponse.json({ success: true });
}
