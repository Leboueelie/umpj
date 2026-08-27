import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { parseEditionFile } from "@/lib/excel";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier requis (champ 'file')." }, { status: 400 });
  }
  try {
    const ed = await parseEditionFile(file as unknown as File);
    if (!ed.numero || !ed.dateDebut || !ed.dateFin)
      return NextResponse.json({ error: "Le fichier doit contenir numero, dateDebut et dateFin." }, { status: 400 });
    const heuresInvesties = ed.sessions.reduce((a, s) => a + (s.dureeMinutes || 0), 0);
    const r = await pool.query(
      `INSERT INTO "Edition"
        ("numero","reference","dateDebut","dateFin","libellePeriode",
         "delegationsPresentes","regionsSpirituelles","missionnaires1","missionnaires2",
         "anciensAbidjan","epousesAnciensAbidjan","moyenneParticipation","heuresInvesties",
         "delegationsExterieures","abidjanZones","interieurLocalites","participantsParJour","sessions")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING "id"`,
      [
        ed.numero, ed.reference, ed.dateDebut, ed.dateFin, ed.libellePeriode,
        ed.delegationsPresentes, ed.regionsSpirituelles, ed.missionnaires1, ed.missionnaires2,
        ed.anciensAbidjan, ed.epousesAnciensAbidjan, ed.moyenneParticipation, heuresInvesties,
        JSON.stringify(ed.delegationsExterieures), JSON.stringify(ed.abidjanZones),
        JSON.stringify(ed.interieurLocalites), JSON.stringify(ed.participantsParJour),
        JSON.stringify(ed.sessions),
      ]
    );
    return NextResponse.json({ id: r.rows[0].id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
