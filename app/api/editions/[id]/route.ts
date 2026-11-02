import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { id } = await ctx.params;
  const r = await pool.query(`SELECT * FROM "Edition" WHERE "id" = $1`, [id]);
  if (!r.rowCount) return NextResponse.json({ error: "Edition introuvable." }, { status: 404 });
  return NextResponse.json(r.rows[0]);
}

interface EditionBody {
  numero?: number;
  reference?: string;
  dateDebut?: string;
  dateFin?: string;
  libellePeriode?: string;
  delegationsPresentes?: number;
  regionsSpirituelles?: number;
  missionnaires1?: number;
  missionnaires2?: number;
  anciensAbidjan?: number;
  epousesAnciensAbidjan?: number;
  moyenneParticipation?: number;
  heuresInvesties?: number;
  delegationsExterieures?: string[];
  abidjanZones?: string[];
  interieurLocalites?: string[];
  participantsParJour?: { jour: string; date: string; participants: number }[];
  sessions?: { date: string; nbSessions: number; periodes: string; dureeMinutes: number; participants: number }[];
}

function num(v: any, d = 0): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}
function str(v: any, d = ""): string {
  return v == null ? d : String(v);
}
function arr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const bissextile = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const joursMois = [31, bissextile ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= joursMois[m - 1];
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { id } = await ctx.params;
  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const b = (lecture.body ?? {}) as EditionBody;

  // Validation stricte des nombres entiers.
  const champsEntiers = ["numero", "delegationsPresentes", "regionsSpirituelles", "missionnaires1",
    "missionnaires2", "anciensAbidjan", "epousesAnciensAbidjan", "moyenneParticipation", "heuresInvesties"];
  for (const champ of champsEntiers) {
    const v = b[champ as keyof EditionBody];
    if (v !== undefined && v !== null) {
      const nv = typeof v === "string" ? Number(v) : v;
      if (typeof nv !== "number" || !Number.isFinite(nv) || !Number.isInteger(nv)) {
        return NextResponse.json({ error: `Le champ ${champ} doit être un entier.` }, { status: 400 });
      }
    }
  }
  if (Array.isArray(b.participantsParJour)) {
    for (const p of b.participantsParJour) {
      if (p?.participants !== undefined && p?.participants !== null) {
        const nv = typeof p.participants === "string" ? Number(p.participants) : p.participants;
        if (typeof nv !== "number" || !Number.isFinite(nv) || !Number.isInteger(nv) || nv < 0) {
          return NextResponse.json({ error: "Participants par jour invalides." }, { status: 400 });
        }
      }
    }
  }
  if (Array.isArray(b.sessions)) {
    for (const sess of b.sessions) {
      for (const champ of ["nbSessions", "dureeMinutes", "participants"]) {
        const v = sess?.[champ as "nbSessions" | "dureeMinutes" | "participants"];
        if (v !== undefined && v !== null) {
          const nv = typeof v === "string" ? Number(v) : v;
          if (typeof nv !== "number" || !Number.isFinite(nv) || !Number.isInteger(nv) || nv < 0) {
            return NextResponse.json({ error: `Champ ${champ} de session invalide.` }, { status: 400 });
          }
        }
      }
    }
  }

  const f = {
    numero: num(b.numero),
    reference: str(b.reference),
    dateDebut: str(b.dateDebut),
    dateFin: str(b.dateFin),
    libellePeriode: str(b.libellePeriode),
    delegationsPresentes: num(b.delegationsPresentes),
    regionsSpirituelles: num(b.regionsSpirituelles),
    missionnaires1: num(b.missionnaires1),
    missionnaires2: num(b.missionnaires2),
    anciensAbidjan: num(b.anciensAbidjan),
    epousesAnciensAbidjan: num(b.epousesAnciensAbidjan),
    moyenneParticipation: num(b.moyenneParticipation),
    heuresInvesties: num(b.heuresInvesties),
    delegationsExterieures: arr(b.delegationsExterieures).map(String),
    abidjanZones: arr(b.abidjanZones).map(String),
    interieurLocalites: arr(b.interieurLocalites).map(String),
    participantsParJour: arr(b.participantsParJour).map((x: any) => ({
      jour: str(x?.jour),
      date: str(x?.date),
      participants: num(x?.participants),
    })),
    sessions: arr(b.sessions).map((x: any) => ({
      date: str(x?.date),
      nbSessions: num(x?.nbSessions),
      periodes: str(x?.periodes),
      dureeMinutes: num(x?.dureeMinutes),
      participants: num(x?.participants),
    })),
  };
  // Validation du format ISO + calendaire.
  if (f.dateDebut) {
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(f.dateDebut))
      return NextResponse.json({ error: "Format de date invalide (AAAA-MM-JJ)." }, { status: 400 });
    const [y, m, d] = f.dateDebut.split("-").map(Number);
    if (!validDate(y, m, d))
      return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }
  if (f.dateFin) {
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(f.dateFin))
      return NextResponse.json({ error: "Format de date invalide (AAAA-MM-JJ)." }, { status: 400 });
    const [y, m, d] = f.dateFin.split("-").map(Number);
    if (!validDate(y, m, d))
      return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }
  // Validation de l'ordre des dates.
  if (f.dateDebut && f.dateFin && f.dateDebut > f.dateFin)
    return NextResponse.json({ error: "La date de début doit précéder la date de fin." }, { status: 400 });
  // Validation des bornes numériques.
  if (f.numero < 1)
    return NextResponse.json({ error: "Le numéro d'édition doit être un entier ≥ 1." }, { status: 400 });
  for (const v of [f.delegationsPresentes, f.regionsSpirituelles, f.missionnaires1, f.missionnaires2,
    f.anciensAbidjan, f.epousesAnciensAbidjan, f.heuresInvesties]) {
    if (v < 0)
      return NextResponse.json({ error: "Les compteurs ne peuvent pas être négatifs." }, { status: 400 });
  }
  if (f.moyenneParticipation < 0)
    return NextResponse.json({ error: "La moyenne de participation ne peut pas être négative." }, { status: 400 });
  try {
    const r = await pool.query(
      `UPDATE "Edition" SET
         "numero"=$1,"reference"=$2,"dateDebut"=$3,"dateFin"=$4,"libellePeriode"=$5,
         "delegationsPresentes"=$6,"regionsSpirituelles"=$7,"missionnaires1"=$8,"missionnaires2"=$9,
         "anciensAbidjan"=$10,"epousesAnciensAbidjan"=$11,"moyenneParticipation"=$12,"heuresInvesties"=$13,
         "delegationsExterieures"=$14,"abidjanZones"=$15,"interieurLocalites"=$16,"participantsParJour"=$17,"sessions"=$18,
         "updatedAt"=CURRENT_TIMESTAMP
       WHERE "id"=$19`,
      [
        f.numero, f.reference, f.dateDebut, f.dateFin, f.libellePeriode,
        f.delegationsPresentes, f.regionsSpirituelles, f.missionnaires1, f.missionnaires2,
        f.anciensAbidjan, f.epousesAnciensAbidjan, f.moyenneParticipation, f.heuresInvesties,
        JSON.stringify(f.delegationsExterieures), JSON.stringify(f.abidjanZones),
        JSON.stringify(f.interieurLocalites), JSON.stringify(f.participantsParJour),
        JSON.stringify(f.sessions), id,
      ]
    );
    if (!r.rowCount) return NextResponse.json({ error: "Edition introuvable." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code = (e as any)?.code;
    const msg = e instanceof Error ? e.message : "";
    if (code === "23505" || msg.includes("Edition_numero_key") || msg.includes("duplicate key")) {
      return NextResponse.json(
        { error: "Ce numéro d'édition existe déjà." },
        { status: 409 }
      );
    }
    console.error("Échec de la mise à jour de l'édition :", e);
    return NextResponse.json({ error: "Échec de la mise à jour de l'édition." }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const { id } = await ctx.params;
  const r = await pool.query(`DELETE FROM "Edition" WHERE "id" = $1`, [id]);
  if (!r.rowCount) return NextResponse.json({ error: "Edition introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
