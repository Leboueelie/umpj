import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
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
import { avecVerrouCaisse, journaliserCaisse } from "@/lib/fiches-caisse";
import type { VenteFiche } from "@/lib/fiches";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;
  const { id } = await params;
  const r = await pool.query(
    `SELECT v.*, p."nom" AS "produitNom" FROM "VenteFiche" v
     JOIN "ProduitFiche" p ON p."id" = v."produitId" WHERE v."id" = $1`,
    [id]
  );
  if (!r.rowCount) return NextResponse.json({ error: "Vente introuvable." }, { status: 404 });
  return NextResponse.json(r.rows[0] as VenteFiche);
}

/**
 * Correction d'une vente. La création reste toujours autorisée ; une
 * modification est refusée uniquement si elle rendrait le solde négatif
 * (argent déjà consommé par une dépense).
 */
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
  const quantite = Number(String(b.quantite).trim());
  const prixUnitaire = Number(String(b.prixUnitaire).trim());
  const montant = calculerMontant(quantite, prixUnitaire); // calcul serveur, jamais le client
  const dateVente = dateIso(b.dateVente)!;
  const vendeur = normaliserVendeur(b.vendeur);
  const observation = b?.observation == null ? "" : normaliserTexte(b.observation);

  let result: NextResponse;
  try {
    result = await avecVerrouCaisse(pool, async (client, totaux) => {
      const ancien = await client.query(`SELECT * FROM "VenteFiche" WHERE id = $1`, [id]);
      if (!ancien.rowCount) {
        return NextResponse.json({ error: "Vente introuvable." }, { status: 404 });
      }
      const p = await client.query(`SELECT actif FROM "ProduitFiche" WHERE id = $1`, [produitId]);
      if (!p.rowCount) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
      if (!p.rows[0].actif) {
        return NextResponse.json({ error: "Ce produit est désactivé." }, { status: 409 });
      }

      const delta = montant - ancien.rows[0].montant;
      const soldeApres = totaux.soldeDisponible + delta;
      if (soldeApres < 0) {
        return NextResponse.json(
          {
            error: "Correction refusée : le solde disponible deviendrait négatif (recettes déjà dépensées).",
            soldeDisponible: totaux.soldeDisponible,
          },
          { status: 409 }
        );
      }

      const r = await client.query(
        `UPDATE "VenteFiche"
         SET "produitId" = $2, quantite = $3, "prixUnitaire" = $4, montant = $5,
             "dateVente" = $6, vendeur = $7, observation = $8
         WHERE id = $1
         RETURNING *`,
        [id, produitId, quantite, prixUnitaire, montant, dateVente, vendeur, observation]
      );
      await journaliserCaisse(client, acces.id, "fiche_vente_modification", id, {
        ancienMontant: ancien.rows[0].montant,
        nouveauMontant: montant,
        vendeur,
      });
      return NextResponse.json(r.rows[0] as VenteFiche);
    });
  } catch (e) {
    console.error("Échec de la modification de la vente :", e instanceof Error ? e.message : "");
    return NextResponse.json({ error: "Échec de la modification de la vente." }, { status: 500 });
  }
  return result;
}

/** Suppression : refusée si l'argent de cette vente a déjà été dépensé. */
export async function DELETE(_req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;
  const { id } = await params;

  let result: NextResponse;
  try {
    result = await avecVerrouCaisse(pool, async (client, totaux) => {
      const ancien = await client.query(`SELECT montant FROM "VenteFiche" WHERE id = $1`, [id]);
      if (!ancien.rowCount) {
        return NextResponse.json({ error: "Vente introuvable." }, { status: 404 });
      }
      if (totaux.soldeDisponible - ancien.rows[0].montant < 0) {
        return NextResponse.json(
          {
            error: "Suppression refusée : le solde disponible deviendrait négatif (recettes déjà dépensées).",
            soldeDisponible: totaux.soldeDisponible,
          },
          { status: 409 }
        );
      }
      await client.query(`DELETE FROM "VenteFiche" WHERE id = $1`, [id]);
      await journaliserCaisse(client, acces.id, "fiche_vente_suppression", id, {
        montant: ancien.rows[0].montant,
      });
      return NextResponse.json({ ok: true });
    });
  } catch (e) {
    console.error("Échec de la suppression de la vente :", e instanceof Error ? e.message : "");
    return NextResponse.json({ error: "Échec de la suppression de la vente." }, { status: 500 });
  }
  return result;
}
