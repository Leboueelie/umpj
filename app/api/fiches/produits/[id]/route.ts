import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";
import { validerProduit, normaliserTexte } from "@/lib/fiches-calc";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;
  const { id } = await params;
  const r = await pool.query(
    `SELECT id, nom, "prixUnitaire", "quantiteCible", description, actif, "createdAt", "updatedAt"
     FROM "ProduitFiche" WHERE id = $1`,
    [id]
  );
  if (!r.rowCount) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  return NextResponse.json(r.rows[0]);
}

export async function PUT(req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;
  const { id } = await params;

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
      `UPDATE "ProduitFiche"
       SET nom = $2, "prixUnitaire" = $3, "quantiteCible" = $4, description = $5, "updatedAt" = now()
       WHERE id = $1
       RETURNING id, nom, "prixUnitaire", "quantiteCible", description, actif, "createdAt", "updatedAt"`,
      [id, nom, prixUnitaire, quantiteCible, description]
    );
    if (!r.rowCount) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
    return NextResponse.json(r.rows[0]);
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : "";
    if (e?.code === "23505" || msg.includes("ProduitFiche_nom_normalise_key")) {
      return NextResponse.json({ error: "Un produit porte déjà ce nom." }, { status: 409 });
    }
    console.error("Échec de la modification du produit :", msg);
    return NextResponse.json({ error: "Échec de la modification du produit." }, { status: 500 });
  }
}

/** Activation / désactivation (jamais de suppression : préserve l'historique). */
export async function PATCH(req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;
  const { id } = await params;

  const tailleErreur = verifierTailleDeclaree(req, LIMITE_JSON);
  if (tailleErreur) return tailleErreur;
  const lecture = await lireJsonBorne(req, LIMITE_JSON);
  if (!lecture.ok) {
    return NextResponse.json({ error: lecture.error }, { status: lecture.status });
  }
  const b = (lecture.body ?? {}) as any;
  if (typeof b?.actif !== "boolean") {
    return NextResponse.json({ error: "Le champ actif doit être un booléen." }, { status: 400 });
  }

  const r = await pool.query(
    `UPDATE "ProduitFiche" SET actif = $2, "updatedAt" = now() WHERE id = $1
     RETURNING id, nom, "prixUnitaire", "quantiteCible", description, actif, "createdAt", "updatedAt"`,
    [id, b.actif]
  );
  if (!r.rowCount) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  return NextResponse.json(r.rows[0]);
}
