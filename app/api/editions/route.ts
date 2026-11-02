import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";

export async function GET() {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

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

function validEditionDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const bissextile = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const joursMois = [31, bissextile ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= joursMois[m - 1];
}

export async function POST(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const b = (lecture.body ?? {}) as EditionBody;
  if (!b.numero || !b.dateDebut || !b.dateFin)
    return NextResponse.json({ error: "numero, dateDebut et dateFin sont requis." }, { status: 400 });
  // Validation calendaire des dates.
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(b.dateDebut) || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(b.dateFin))
    return NextResponse.json({ error: "Format de date invalide (AAAA-MM-JJ)." }, { status: 400 });
  {
    const [y1, m1, d1] = b.dateDebut.split("-").map(Number);
    const [y2, m2, d2] = b.dateFin.split("-").map(Number);
    if (!validEditionDate(y1, m1, d1) || !validEditionDate(y2, m2, d2))
      return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }
  if (b.dateDebut > b.dateFin)
    return NextResponse.json({ error: "La date de début doit précéder la date de fin." }, { status: 400 });

  // Validation stricte des nombres entiers (pas de troncature silencieuse).
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
  // Validation des bornes.
  const f0 = readBody(b);
  if (f0.numero < 1)
    return NextResponse.json({ error: "Le numéro d'édition doit être un entier ≥ 1." }, { status: 400 });
  for (const v of [f0.delegationsPresentes, f0.regionsSpirituelles, f0.missionnaires1, f0.missionnaires2,
    f0.anciensAbidjan, f0.epousesAnciensAbidjan, f0.heuresInvesties]) {
    if (v < 0)
      return NextResponse.json({ error: "Les compteurs ne peuvent pas être négatifs." }, { status: 400 });
  }
  if (f0.moyenneParticipation < 0)
    return NextResponse.json({ error: "La moyenne de participation ne peut pas être négative." }, { status: 400 });
  // Validation des sous-structures JSON.
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
    const code = (e as any)?.code;
    const msg = e instanceof Error ? e.message : "";
    if (code === "23505" || msg.includes("Edition_numero_key") || msg.includes("duplicate key")) {
      return NextResponse.json(
        { error: "Ce numéro d'édition existe déjà." },
        { status: 409 }
      );
    }
    console.error("Échec de la création de l'édition :", e);
    return NextResponse.json({ error: "Échec de la création de l'édition." }, { status: 500 });
  }
}
