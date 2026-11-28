import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";
import { validerProduit, normaliserTexte } from "@/lib/fiches-calc";

export async function GET(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const actif = new URL(req.url).searchParams.get("actif");
  let query = `SELECT id, nom, "prixUnitaire", "quantiteCible", description, actif, "createdAt", "updatedAt"
               FROM "ProduitFiche"`;
  if (actif === "1" || actif === "0") {
    query += ` WHERE actif = ${actif === "1" ? "true" : "false"}`;
  }
  query += ` ORDER BY actif DESC, lower(nom) ASC`;
  const r = await pool.query(query);
  return NextResponse.json(r.rows);
}

export async function POST(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const tailleErreur = verifierTailleDeclaree(req, LIMITE_JSON);
  if (tailleErreur) return tailleErreur;
  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const b = (lecture.body ?? {}) as any;

  const erreurs = validerProduit({
    nom: b?.nom,
    prixUnitaire: b?.prixUnitaire,
    quantiteCible: b?.quantiteCible ?? 0,
    description: b?.description,
  });
  if (erreurs.length) {
    return NextResponse.json({ error: erreurs.join(" ") }, { status: 400 });
  }

  const nom = normaliserTexte(b.nom);
  const prixUnitaire = Number(String(b.prixUnitaire).trim());
  const quantiteCible = b?.quantiteCible == null ? 0 : Number(String(b.quantiteCible).trim());
  const description = b?.description == null ? "" : normaliserTexte(b.description);

  try {
    const r = await pool.query(
      `INSERT INTO "ProduitFiche" (id, nom, "prixUnitaire", "quantiteCible", description, actif)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, nom, "prixUnitaire", "quantiteCible", description, actif, "createdAt", "updatedAt"`,
      [crypto.randomUUID(), nom, prixUnitaire, quantiteCible, description]
    );
    return NextResponse.json(r.rows[0], { status: 201 });
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : "";
    if (e?.code === "23505" || msg.includes("ProduitFiche_nom_normalise_key")) {
      return NextResponse.json({ error: "Un produit porte déjà ce nom." }, { status: 409 });
    }
    console.error("Échec de la création du produit :", msg);
    return NextResponse.json({ error: "Échec de la création du produit." }, { status: 500 });
  }
}
