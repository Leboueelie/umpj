import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import type { EquipePriere } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sujetId = searchParams.get("sujetId");

  if (!sujetId) {
    return NextResponse.json(
      { error: "sujetId requis" },
      { status: 400 }
    );
  }

  const res = await pool.query<EquipePriere>(
    `SELECT * FROM "EquipePriere"
     WHERE "sujetId" = $1
     ORDER BY "dateDebut" DESC, "zone"`,
    [sujetId]
  );

  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sujetId, zone, dateDebut, dateFin, tempsMis, nombrePersonnes } = body;

  if (!sujetId || !zone?.trim() || !dateDebut || !dateFin || tempsMis == null || !nombrePersonnes) {
    return NextResponse.json(
      { error: "Tous les champs sont requis" },
      { status: 400 }
    );
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO "EquipePriere"
     (id, "sujetId", zone, "dateDebut", "dateFin", "tempsMis", "nombrePersonnes")
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, sujetId, zone.trim(), dateDebut, dateFin, tempsMis, nombrePersonnes]
  );

  const res = await pool.query<EquipePriere>(
    `SELECT * FROM "EquipePriere" WHERE id = $1`,
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

  await pool.query(`DELETE FROM "EquipePriere" WHERE id = $1`, [id]);
  return NextResponse.json({ success: true });
}
