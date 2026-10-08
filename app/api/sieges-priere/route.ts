import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import { normalizeDate, normalizeHeure, tempsMisMin } from "@/lib/calc";
import type { SiegePriere } from "@/lib/types";

export async function GET(req: NextRequest) {
  const editionParam = req.nextUrl.searchParams.get("edition");

  if (editionParam !== null) {
    const edition = Number(editionParam);
    if (!Number.isInteger(edition) || edition < 1) {
      return NextResponse.json(
        { error: "Numéro d'édition invalide." },
        { status: 400 }
      );
    }
    const res = await pool.query<SiegePriere>(
      `SELECT * FROM "SiegePriere" WHERE "numeroEdition" = $1
       ORDER BY jour, "date", "heureDebut"`,
      [edition]
    );
    return NextResponse.json(res.rows);
  }

  const res = await pool.query<SiegePriere>(
    `SELECT * FROM "SiegePriere" ORDER BY "date" DESC, "heureDebut"`,
    []
  );
  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { nom, numeroEdition, jour, orateur, date, heureDebut, heureFin, participants } = body;

  if (!nom?.trim() || !numeroEdition || jour == null || jour === "" || !orateur?.trim() || !date || !heureDebut || !heureFin || !participants) {
    return NextResponse.json(
      { error: "Tous les champs sont requis." },
      { status: 400 }
    );
  }

  const dateNorm = normalizeDate(date);
  const heureDebutNorm = normalizeHeure(heureDebut);
  const heureFinNorm = normalizeHeure(heureFin);

  if (!dateNorm) {
    return NextResponse.json(
      { error: "Format de date invalide." },
      { status: 400 }
    );
  }

  if (!heureDebutNorm || !heureFinNorm) {
    return NextResponse.json(
      { error: "Format d'heure invalide." },
      { status: 400 }
    );
  }

  if (numeroEdition <= 0) {
    return NextResponse.json(
      { error: "Le numéro d'édition doit être supérieur à 0." },
      { status: 400 }
    );
  }

  if (!Number.isInteger(jour) || jour < 1) {
    return NextResponse.json(
      { error: "Le numéro de jour doit être un entier ≥ 1." },
      { status: 400 }
    );
  }

  if (participants < 1) {
    return NextResponse.json(
      { error: "Le nombre de participants doit être ≥ 1." },
      { status: 400 }
    );
  }

  const tempsMis = tempsMisMin(heureDebutNorm, heureFinNorm);
  if (tempsMis === null || tempsMis <= 0) {
    return NextResponse.json(
      { error: "Durée invalide." },
      { status: 400 }
    );
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO "SiegePriere"
     (id, nom, "numeroEdition", jour, orateur, date, "heureDebut", "heureFin", participants, "tempsMis")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, nom.trim(), numeroEdition, jour, orateur.trim(), dateNorm, heureDebutNorm, heureFinNorm, participants, tempsMis]
  );

  const res = await pool.query<SiegePriere>(
    `SELECT * FROM "SiegePriere" WHERE id = $1`,
    [id]
  );

  return NextResponse.json(res.rows[0], { status: 201 });
}
