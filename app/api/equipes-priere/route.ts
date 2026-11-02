import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import type { EquipePriere } from "@/lib/types";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

export async function GET(req: NextRequest) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

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
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const body = (lecture.body ?? {}) as any;
  const { sujetId, zone, dateDebut, dateFin, tempsMis, nombrePersonnes } = body;

  if (!sujetId || !zone?.trim() || !dateDebut || !dateFin || tempsMis == null || !nombrePersonnes) {
    return NextResponse.json(
      { error: "Tous les champs sont requis" },
      { status: 400 }
    );
  }

  if (zone.trim().length > 150)
    return NextResponse.json(
      { error: "La zone est trop longue (150 caractères maximum)." },
      { status: 400 }
    );

  // Vérifier l'existence du sujet avant insertion.
  const sujetExiste = await pool.query(`SELECT 1 FROM "SujetPriere" WHERE id = $1`, [sujetId]);
  if (!sujetExiste.rowCount)
    return NextResponse.json({ error: "Sujet introuvable." }, { status: 404 });

  if (!Number.isInteger(tempsMis) || tempsMis <= 0) {
    return NextResponse.json(
      { error: "Le temps mis doit être un entier supérieur à 0." },
      { status: 400 }
    );
  }

  if (!Number.isInteger(nombrePersonnes) || nombrePersonnes < 1) {
    return NextResponse.json(
      { error: "Le nombre de personnes doit être un entier ≥ 1." },
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
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID requis" }, { status: 400 });
  }

  const r = await pool.query(`DELETE FROM "EquipePriere" WHERE id = $1`, [id]);
  if (r.rowCount === 0)
    return NextResponse.json({ error: "Équipe introuvable." }, { status: 404 });
  return NextResponse.json({ success: true });
}
