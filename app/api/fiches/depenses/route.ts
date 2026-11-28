import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";
import { validerDepense, normaliserTexte, dateIso } from "@/lib/fiches-calc";
import { avecVerrouCaisse, journaliserCaisse } from "@/lib/fiches-caisse";
import type { DepenseFiche } from "@/lib/fiches";

/** Historique des dépenses — ADMIN uniquement, lecture seule. */
export async function GET(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const p = new URL(req.url).searchParams;
  const categorie = p.get("categorie");
  const responsable = p.get("responsable");
  const recherche = p.get("q");
  const du = dateIso(p.get("du"));
  const au = dateIso(p.get("au"));

  const where: string[] = [];
  const params: any[] = [];
  if (categorie) { params.push(categorie); where.push(`"categorie" = $${params.length}`); }
  if (responsable) { params.push(`%${normaliserTexte(responsable).toLowerCase()}%`); where.push(`lower("responsable") LIKE $${params.length}`); }
  if (recherche) { params.push(`%${normaliserTexte(recherche).toLowerCase()}%`); where.push(`lower("motif") LIKE $${params.length}`); }
  if (du) { params.push(du); where.push(`"dateDepense" >= $${params.length}`); }
  if (au) { params.push(au); where.push(`"dateDepense" <= $${params.length}`); }

  let query = `SELECT * FROM "DepenseFiche"`;
  if (where.length) query += ` WHERE ${where.join(" AND ")}`;
  query += ` ORDER BY "dateDepense" DESC, "createdAt" DESC LIMIT 500`;
  const r = await pool.query(query, params);
  return NextResponse.json(r.rows);
}

/** Création d'une dépense : contrôle du solde et insertion dans la même transaction. */
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
      if (montant > totaux.soldeDisponible) {
        return NextResponse.json(
          {
            error: `Solde insuffisant : ${totaux.soldeDisponible} FCFA disponibles, ${montant} FCFA demandés.`,
            soldeDisponible: totaux.soldeDisponible,
          },
          { status: 409 }
        );
      }
      const r = await client.query(
        `INSERT INTO "DepenseFiche"
           (id, motif, montant, "dateDepense", responsable, categorie, observation, "auteurId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [crypto.randomUUID(), motif, montant, dateDepense, responsable, b.categorie, observation, acces.id]
      );
      await journaliserCaisse(client, acces.id, "fiche_depense_creation", r.rows[0].id, {
        motif,
        montant,
        categorie: b.categorie,
      });
      return NextResponse.json(r.rows[0] as DepenseFiche, { status: 201 });
    });
  } catch (e) {
    console.error("Échec de l'enregistrement de la dépense :", e instanceof Error ? e.message : "");
    return NextResponse.json({ error: "Échec de l'enregistrement de la dépense." }, { status: 500 });
  }
  return result;
}
