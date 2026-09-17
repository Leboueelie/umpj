import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const comite = searchParams.get("comite");
  const type = searchParams.get("type");
  let query = `SELECT id, type, comite, "nomFichier", taille, "createdAt" FROM "ActionDeGrace"`;
  const conditions: string[] = [];
  const params: any[] = [];
  if (type) {
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }
  if (comite) {
    params.push(comite);
    conditions.push(`comite = $${params.length}`);
  }
  if (conditions.length > 0) query += ` WHERE ${conditions.join(" AND ")}`;
  query += ` ORDER BY "createdAt" DESC`;
  const r = await pool.query(query, params);
  return NextResponse.json(r.rows);
}

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const comite = (formData.get("comite") ?? "").toString().trim();
  const type = (formData.get("type") ?? "comite").toString().trim();

  if (!file || !comite)
    return NextResponse.json({ error: "Fichier et comité/région requis." }, { status: 400 });

  if (file.type !== "application/pdf")
    return NextResponse.json({ error: "Seuls les fichiers PDF sont acceptés." }, { status: 400 });

  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "Le fichier dépasse 10 Mo." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO "ActionDeGrace" (id, type, comite, "nomFichier", data, taille)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, type, comite, file.name, buffer, file.size]
  );

  return NextResponse.json({ id, type, comite, nomFichier: file.name, taille: file.size }, { status: 201 });
}
