import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";
import { validerDepense, normaliserTexte, dateIso } from "@/lib/fiches-calc";
import { avecVerrouCaisse, journaliserCaisse } from "@/lib/fiches-caisse";
import type { DepenseFiche } from "@/lib/fiches";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;
  const { id } = await params;
  const r = await pool.query(`SELECT * FROM "DepenseFiche" WHERE id = $1`, [id]);
  if (!r.rowCount) return NextResponse.json({ error: "Dépense introuvable." }, { status: 404 });
  return NextResponse.json(r.rows[0] as DepenseFiche);
}

/** Modification : seule la différence peut consommer du solde disponible. */
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

  const erreurs = validerDepense({
    motif: b?.motif,
    montant: b?.montant,
    dateDepense: b?.dateDepense,
    responsable: b?.responsable,
    categorie: b?.categorie,
    observation: b?.observation,
  });
  if (erreurs.length) {
    return NextResponse.json({ error: erreurs.join(" ") }, { status: 400 });
  }

  const montant = Number(String(b.montant).trim());
  const motif = normaliserTexte(b.motif);
  const dateDepense = dateIso(b.dateDepense)!;
  const responsable = normaliserTexte(b.responsable);
  const observation = b?.observation == null ? "" : normaliserTexte(b.observation);

  let result: NextResponse;
  try {
    result = await avecVerrouCaisse(pool, async (client, totaux) => {
      const ancien = await client.query(`SELECT * FROM "DepenseFiche" WHERE id = $1`, [id]);
      if (!ancien.rowCount) {
        return NextResponse.json({ error: "Dépense introuvable." }, { status: 404 });
      }
      const delta = montant - ancien.rows[0].montant;
      if (delta > 0 && delta > totaux.soldeDisponible) {
        return NextResponse.json(
          {
            error: `Augmentation refusée : solde disponible ${totaux.soldeDisponible} FCFA, augmentation de ${delta} FCFA demandée.`,
            soldeDisponible: totaux.soldeDisponible,
          },
          { status: 409 }
        );
      }
      const r = await client.query(
        `UPDATE "DepenseFiche"
         SET motif = $2, montant = $3, "dateDepense" = $4, responsable = $5,
             categorie = $6, observation = $7, "updatedAt" = now()
         WHERE id = $1
         RETURNING *`,
        [id, motif, montant, dateDepense, responsable, b.categorie, observation]
      );
      await journaliserCaisse(client, acces.id, "fiche_depense_modification", id, {
        ancienMontant: ancien.rows[0].montant,
        nouveauMontant: montant,
        motif,
      });
      return NextResponse.json(r.rows[0] as DepenseFiche);
    });
  } catch (e) {
    console.error("Échec de la modification de la dépense :", e instanceof Error ? e.message : "");
    return NextResponse.json({ error: "Échec de la modification de la dépense." }, { status: 500 });
  }
  return result;
}

/** Suppression : le solde augmente mécaniquement, aucune vente n'est modifiée. */
export async function DELETE(_req: Request, { params }: Params) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;
  const { id } = await params;

  let result: NextResponse;
  try {
    result = await avecVerrouCaisse(pool, async (client) => {
      const ancien = await client.query(`SELECT motif, montant FROM "DepenseFiche" WHERE id = $1`, [id]);
      if (!ancien.rowCount) {
        return NextResponse.json({ error: "Dépense introuvable." }, { status: 404 });
      }
      await client.query(`DELETE FROM "DepenseFiche" WHERE id = $1`, [id]);
      await journaliserCaisse(client, acces.id, "fiche_depense_suppression", id, {
        motif: ancien.rows[0].motif,
        montant: ancien.rows[0].montant,
      });
      return NextResponse.json({ ok: true });
    });
  } catch (e) {
    console.error("Échec de la suppression de la dépense :", e instanceof Error ? e.message : "");
    return NextResponse.json({ error: "Échec de la suppression de la dépense." }, { status: 500 });
  }
  return result;
}
