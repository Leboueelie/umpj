import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import { tempsMisMin, normalizeDate, normalizeHeure } from "@/lib/calc";
import type { NuitPriere } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categorie = searchParams.get("categorie");
  const dateDebut = searchParams.get("dateDebut");
  const dateFin = searchParams.get("dateFin");

  let query = `SELECT * FROM "NuitPriere"`;
  const params: any[] = [];
  const conditions: string[] = [];

  if (categorie) {
    conditions.push(`"categorie" = $${params.length + 1}`);
    params.push(categorie);
  }

  if (dateDebut) {
    conditions.push(`"date" >= $${params.length + 1}`);
    params.push(dateDebut);
  }

  if (dateFin) {
    conditions.push(`"date" <= $${params.length + 1}`);
    params.push(dateFin);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  query += ` ORDER BY "date" DESC, "heureDebut"`;

  const res = await pool.query<NuitPriere>(query, params);
  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { categorie, nomCategorie, date, heureDebut, heureFin, participants } = body;

  // Validation de base
  if (!categorie || !date || !heureDebut || !heureFin || !participants) {
    return NextResponse.json(
      { error: "Tous les champs sont requis" },
      { status: 400 }
    );
  }

  // Validation catégorie "autre"
  if (categorie === "autre" && !nomCategorie?.trim()) {
    return NextResponse.json(
      { error: "Le nom de la catégorie est requis pour 'autre'" },
      { status: 400 }
    );
  }

  // Normalisation de la date
  const normalizedDate = normalizeDate(date);
  if (!normalizedDate) {
    return NextResponse.json(
      { error: "Format de date invalide" },
      { status: 400 }
    );
  }

  // Normalisation des heures
  const normalizedHeureDebut = normalizeHeure(heureDebut);
  const normalizedHeureFin = normalizeHeure(heureFin);

  if (!normalizedHeureDebut || !normalizedHeureFin) {
    return NextResponse.json(
      { error: "Format d'heure invalide" },
      { status: 400 }
    );
  }

  // Calcul du temps mis
  const tempsMis = tempsMisMin(normalizedHeureDebut, normalizedHeureFin);
  if (tempsMis === null) {
    return NextResponse.json(
      { error: "Impossible de calculer la durée" },
      { status: 400 }
    );
  }

  // Calcul du volume
  const volume = tempsMis * participants;

  const id = randomUUID();
  await pool.query(
    `INSERT INTO "NuitPriere"
     (id, categorie, "nomCategorie", date, "heureDebut", "heureFin", participants, "tempsMis", volume)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      categorie,
      categorie === "autre" ? nomCategorie?.trim() : null,
      normalizedDate,
      normalizedHeureDebut,
      normalizedHeureFin,
      participants,
      tempsMis,
      volume,
    ]
  );

  const res = await pool.query<NuitPriere>(
    `SELECT * FROM "NuitPriere" WHERE id = $1`,
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

  await pool.query(`DELETE FROM "NuitPriere" WHERE id = $1`, [id]);
  return NextResponse.json({ success: true });
}
