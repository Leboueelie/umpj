import { NextResponse } from "next/server";
import { requireAdmin, journaliser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";
import {
  validerVente,
  normaliserTexte,
  normaliserVendeur,
  dateIso,
  calculerMontant,
} from "@/lib/fiches-calc";

export async function GET(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const p = new URL(req.url).searchParams;
  const produitId = p.get("produitId");
  const vendeur = p.get("vendeur");
  const du = dateIso(p.get("du"));
  const au = dateIso(p.get("au"));

  const where: string[] = [];
  const params: any[] = [];
  if (produitId) { params.push(produitId); where.push(`v."produitId" = $${params.length}`); }
  if (vendeur) { params.push(`%${normaliserVendeur(vendeur).toLowerCase()}%`); where.push(`lower(v."vendeur") LIKE $${params.length}`); }
  if (du) { params.push(du); where.push(`v."dateVente" >= $${params.length}`); }
  if (au) { params.push(au); where.push(`v."dateVente" <= $${params.length}`); }

  let query = `SELECT v.*, p."nom" AS "produitNom"
               FROM "VenteFiche" v
               JOIN "ProduitFiche" p ON p."id" = v."produitId"`;
  if (where.length) query += ` WHERE ${where.join(" AND ")}`;
  query += ` ORDER BY v."dateVente" DESC, v."createdAt" DESC LIMIT 500`;
  const r = await pool.query(query, params);
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

  const erreurs = validerVente({
    produitId: b?.produitId,
    quantite: b?.quantite,
    prixUnitaire: b?.prixUnitaire,
    dateVente: b?.dateVente,
    vendeur: b?.vendeur,
    observation: b?.observation,
  });
  if (erreurs.length) {
    return NextResponse.json({ error: erreurs.join(" ") }, { status: 400 });
  }

  const produitId = b.produitId as string;
  const p = await pool.query(`SELECT nom, actif, "prixUnitaire" FROM "ProduitFiche" WHERE id = $1`, [produitId]);
  if (!p.rowCount) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  if (!p.rows[0].actif) {
    return NextResponse.json({ error: "Ce produit est désactivé." }, { status: 409 });
  }

  const quantite = Number(String(b.quantite).trim());
  // Le prix appliqué est celui envoyé au moment de la vente : il est historisé
  // et ne change pas si le prix du produit est modifié plus tard.
  const prixUnitaire = Number(String(b.prixUnitaire).trim());
  const montant = calculerMontant(quantite, prixUnitaire);
  const dateVente = dateIso(b.dateVente)!;
  const vendeur = normaliserVendeur(b.vendeur);
  const observation = b?.observation == null ? "" : normaliserTexte(b.observation);

  const r = await pool.query(
    `INSERT INTO "VenteFiche"
       (id, "produitId", quantite, "prixUnitaire", montant, "dateVente", vendeur, observation, "auteurId")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      crypto.randomUUID(),
      produitId,
      quantite,
      prixUnitaire,
      montant,
      dateVente,
      vendeur,
      observation,
      acces.id,
    ]
  );
  await journaliser(acces.id, "fiche_vente_creation", r.rows[0].id, {
    produit: p.rows[0].nom,
    quantite,
    montant,
    vendeur,
  });
  return NextResponse.json(r.rows[0], { status: 201 });
}
