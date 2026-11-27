import { NextResponse } from "next/server";
import { requireAdmin, journaliser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { verifierTailleDeclaree, LIMITE_JSON } from "@/lib/body-limit";
import { lireJsonBorne } from "@/lib/body-stream";
import { validerProduction, normaliserTexte, dateIso } from "@/lib/fiches-calc";

export async function GET(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const p = new URL(req.url).searchParams;
  const produitId = p.get("produitId");
  const responsable = p.get("responsable");
  const du = dateIso(p.get("du"));
  const au = dateIso(p.get("au"));

  const where: string[] = [];
  const params: any[] = [];
  if (produitId) { params.push(produitId); where.push(`pr."produitId" = $${params.length}`); }
  if (responsable) { params.push(`%${normaliserTexte(responsable).toLowerCase()}%`); where.push(`lower(pr."responsable") LIKE $${params.length}`); }
  if (du) { params.push(du); where.push(`pr."dateProduction" >= $${params.length}`); }
  if (au) { params.push(au); where.push(`pr."dateProduction" <= $${params.length}`); }

  let query = `SELECT pr.*, p."nom" AS "produitNom"
               FROM "ProductionFiche" pr
               JOIN "ProduitFiche" p ON p."id" = pr."produitId"`;
  if (where.length) query += ` WHERE ${where.join(" AND ")}`;
  query += ` ORDER BY pr."dateProduction" DESC, pr."createdAt" DESC LIMIT 500`;
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

  const erreurs = validerProduction({
    produitId: b?.produitId,
    quantite: b?.quantite,
    dateProduction: b?.dateProduction,
    responsable: b?.responsable,
    observation: b?.observation,
  });
  if (erreurs.length) {
    return NextResponse.json({ error: erreurs.join(" ") }, { status: 400 });
  }

  const produitId = b.produitId as string;
  const p = await pool.query(`SELECT nom, actif FROM "ProduitFiche" WHERE id = $1`, [produitId]);
  if (!p.rowCount) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  if (!p.rows[0].actif) {
    return NextResponse.json({ error: "Ce produit est désactivé." }, { status: 409 });
  }

  const quantite = Number(String(b.quantite).trim());
  const dateProduction = dateIso(b.dateProduction)!;
  const responsable = normaliserTexte(b.responsable);
  const observation = b?.observation == null ? "" : normaliserTexte(b.observation);

  const r = await pool.query(
    `INSERT INTO "ProductionFiche"
       (id, "produitId", quantite, "dateProduction", responsable, observation, "auteurId")
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [crypto.randomUUID(), produitId, quantite, dateProduction, responsable, observation, acces.id]
  );
  await journaliser(acces.id, "fiche_production_creation", r.rows[0].id, {
    produit: p.rows[0].nom,
    quantite,
  });
  return NextResponse.json(r.rows[0], { status: 201 });
}
