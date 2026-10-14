import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import { normalizeDate, normalizeHeure, tempsMisMin } from "@/lib/calc";
import type { CroisadeJeunePriere } from "@/lib/types";

export async function GET() {
  const res = await pool.query<CroisadeJeunePriere>(
    `SELECT * FROM "CroisadeJeunePriere" ORDER BY "date" DESC, "heureDebut"`,
    []
  );
  return NextResponse.json(res.rows);
}

const ROLES = [
  "frereSoeur",
  "accueil",
  "semeurs",
  "secretariat1",
  "secretariat2",
  "sono",
  "ames",
  "rtvc",
] as const;

const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  frereSoeur: "Frère/Sœur",
  accueil: "Accueil",
  semeurs: "Semeurs",
  secretariat1: "Secrétariat 1",
  secretariat2: "Secrétariat 2",
  sono: "Sono",
  ames: "Âmes",
  rtvc: "RTVC",
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, heureDebut, heureFin, orateur, coordinateur } = body;

  if (!orateur?.trim() || !coordinateur?.trim() || !date || !heureDebut || !heureFin) {
    return NextResponse.json(
      { error: "Date, heures, orateur et coordinateur sont requis." },
      { status: 400 }
    );
  }

  const dateNorm = normalizeDate(date);
  if (!dateNorm) {
    return NextResponse.json({ error: "Format de date invalide." }, { status: 400 });
  }

  const heureDebutNorm = normalizeHeure(heureDebut);
  const heureFinNorm = normalizeHeure(heureFin);
  if (!heureDebutNorm || !heureFinNorm) {
    return NextResponse.json({ error: "Format d'heure invalide." }, { status: 400 });
  }

  const tempsMis = tempsMisMin(heureDebutNorm, heureFinNorm);
  if (tempsMis === null || tempsMis <= 0) {
    return NextResponse.json({ error: "Durée invalide." }, { status: 400 });
  }

  const counts = {} as Record<(typeof ROLES)[number], number>;
  for (const k of ROLES) {
    const raw = body[k];
    const v = raw === undefined || raw === null || raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(v) || v < 0) {
      return NextResponse.json(
        { error: `« ${ROLE_LABELS[k]} » doit être un entier ≥ 0.` },
        { status: 400 }
      );
    }
    counts[k] = v;
  }
  const effectif = ROLES.reduce((m, k) => m + counts[k], 0);

  const id = randomUUID();
  await pool.query(
    `INSERT INTO "CroisadeJeunePriere"
     (id, date, "heureDebut", "heureFin", orateur, coordinateur,
      "frereSoeur", accueil, semeurs, "secretariat1", "secretariat2", sono, ames, rtvc, effectif, "tempsMis")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      dateNorm,
      heureDebutNorm,
      heureFinNorm,
      orateur.trim(),
      coordinateur.trim(),
      counts.frereSoeur,
      counts.accueil,
      counts.semeurs,
      counts.secretariat1,
      counts.secretariat2,
      counts.sono,
      counts.ames,
      counts.rtvc,
      effectif,
      tempsMis,
    ]
  );

  const res = await pool.query<CroisadeJeunePriere>(
    `SELECT * FROM "CroisadeJeunePriere" WHERE id = $1`,
    [id]
  );

  return NextResponse.json(res.rows[0], { status: 201 });
}
