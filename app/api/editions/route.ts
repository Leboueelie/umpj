import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const r = await pool.query(
    `SELECT "id","numero","reference","dateDebut","dateFin","libellePeriode"
     FROM "Edition" ORDER BY "dateDebut" DESC, "numero" DESC`
  );
  return NextResponse.json(r.rows);
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

function readBody(b: EditionBody) {
  return {
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
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({} as EditionBody));
  if (!b.numero || !b.dateDebut || !b.dateFin)
    return NextResponse.json({ error: "numero, dateDebut et dateFin sont requis." }, { status: 400 });
  const f = readBody(b);
  try {
    const r = await pool.query(
      `INSERT INTO "Edition"
        ("numero","reference","dateDebut","dateFin","libellePeriode",
         "delegationsPresentes","regionsSpirituelles","missionnaires1","missionnaires2",
         "anciensAbidjan","epousesAnciensAbidjan","moyenneParticipation","heuresInvesties",
         "delegationsExterieures","abidjanZones","interieurLocalites","participantsParJour","sessions")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING "id"`,
      [
        f.numero, f.reference, f.dateDebut, f.dateFin, f.libellePeriode,
        f.delegationsPresentes, f.regionsSpirituelles, f.missionnaires1, f.missionnaires2,
        f.anciensAbidjan, f.epousesAnciensAbidjan, f.moyenneParticipation, f.heuresInvesties,
        JSON.stringify(f.delegationsExterieures), JSON.stringify(f.abidjanZones),
        JSON.stringify(f.interieurLocalites), JSON.stringify(f.participantsParJour),
        JSON.stringify(f.sessions),
      ]
    );
    return NextResponse.json({ id: r.rows[0].id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
