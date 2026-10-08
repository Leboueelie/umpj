import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import type { Jeune } from "@/lib/types";

const VALID_CATEGORIES = ["nation", "debut-mois", "dirigeants", "crppf", "ministere"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const categorie = searchParams.get("categorie");

  let query = `SELECT id, categorie, "nomFichier", taille, "createdAt" FROM "Jeune"`;
  const params: any[] = [];

  if (categorie) {
    params.push(categorie);
    query += ` WHERE categorie = $${params.length}`;
  }

  query += ` ORDER BY "createdAt" DESC`;

  const r = await pool.query<Jeune>(query, params);
  return NextResponse.json(r.rows);
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const categorie = (formData.get("categorie") ?? "").toString().trim();

  if (!file || !categorie) {
    return NextResponse.json(
      { error: "Fichier et catégorie requis." },
      { status: 400 }
    );
  }

  if (!VALID_CATEGORIES.includes(categorie)) {
    return NextResponse.json(
      { error: "Catégorie invalide." },
      { status: 400 }
    );
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Seuls les fichiers PDF sont acceptés." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Le fichier dépasse 10 Mo." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO "Jeune" (id, categorie, "nomFichier", data, taille)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, categorie, file.name, buffer, file.size]
  );

  return NextResponse.json(
    { id, categorie, nomFichier: file.name, taille: file.size },
    { status: 201 }
  );
}
