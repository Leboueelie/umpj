import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
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

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({} as EditionBody));
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
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await pool.query(`DELETE FROM "Edition" WHERE "id" = $1`, [id]);
  if (!r.rowCount) return NextResponse.json({ error: "Edition introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
