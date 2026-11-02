import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { estPdf } from "@/lib/fichiers";
import { verifierTailleDeclaree, LIMITE_PDF } from "@/lib/body-limit";
import { lireBufferBorne } from "@/lib/body-stream";
import type { Jeune } from "@/lib/types";

const VALID_CATEGORIES = ["nation", "debut-mois", "dirigeants", "crppf", "ministere"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo

export async function GET(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

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
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const tailleErreur = verifierTailleDeclaree(req, LIMITE_PDF);
  if (tailleErreur) return tailleErreur;

  const bodyBuffer = await lireBufferBorne(req, LIMITE_PDF);
  if (bodyBuffer === null) {
    return NextResponse.json({ error: "Le corps de la requête dépasse la taille maximale autorisée." }, { status: 413 });
  }
  const form = new Request(req.url, {
    method: "POST",
    body: new Uint8Array(bodyBuffer),
    headers: { "Content-Type": req.headers.get("content-type") || "multipart/form-data" },
  });
  let formData: FormData;
  try {
    formData = await form.formData();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
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

  // Le MIME déclaré est fourni par le client : vérifier le contenu réel.
  if (!estPdf(buffer)) {
    return NextResponse.json(
      { error: "Le contenu du fichier n'est pas un PDF valide." },
      { status: 400 }
    );
  }

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
