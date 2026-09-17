import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const comite = searchParams.get("comite");
  let query = `SELECT id, comite, "nomFichier", taille, "createdAt" FROM "ActionDeGrace"`;
  const params: any[] = [];
  if (comite) {
    query += ` WHERE comite = $1`;
    params.push(comite);
  }
  query += ` ORDER BY "createdAt" DESC`;
  const r = await pool.query(query, params);
  return NextResponse.json(r.rows);
}

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const comite = (formData.get("comite") ?? "").toString().trim();

  if (!file || !comite)
    return NextResponse.json({ error: "Fichier et comité requis." }, { status: 400 });

  if (file.type !== "application/pdf")
    return NextResponse.json({ error: "Seuls les fichiers PDF sont acceptés." }, { status: 400 });

  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "Le fichier dépasse 10 Mo." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO "ActionDeGrace" (id, comite, "nomFichier", data, taille)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, comite, file.name, buffer, file.size]
  );

  return NextResponse.json({ id, comite, nomFichier: file.name, taille: file.size }, { status: 201 });
}
