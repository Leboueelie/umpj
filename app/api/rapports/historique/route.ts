import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { construireRapportConsolide, validerModulesConsolides, MODULES_CONSOLides } from "@/lib/rapport-consolide";
import { buildConsolidatedPdfBuffer } from "@/lib/rapport-consolide-pdf";
import { buildConsolidatedXlsxBuffer } from "@/lib/rapport-consolide-xlsx";
import { createHash } from "node:crypto";
import { estDateIsoCalendaire } from "@/lib/banque";

export const runtime = "nodejs";

const FORMATS_VALIDES = ["pdf", "xlsx", "both"] as const;
type FormatArchive = (typeof FORMATS_VALIDES)[number];

export async function GET(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const url = new URL(req.url);
  const search = (url.searchParams.get("q") || "").trim();
  const moduleFiltre = (url.searchParams.get("module") || "").trim();
  const formatFiltre = (url.searchParams.get("format") || "").trim();
  const du = (url.searchParams.get("du") || "").trim();
  const au = (url.searchParams.get("au") || "").trim();

  const TAILLE_PAGE_DEFAUT = 20;
  const TAILLE_PAGE_MAX = 50;
  const limitRaw = parseInt(url.searchParams.get("limit") || String(TAILLE_PAGE_DEFAUT), 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : TAILLE_PAGE_DEFAUT, 1), TAILLE_PAGE_MAX);
  const offsetRaw = parseInt(url.searchParams.get("offset") || "0", 10);
  const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);

  if (formatFiltre && !["pdf", "xlsx", "both"].includes(formatFiltre)) {
    return NextResponse.json({ error: "Format invalide." }, { status: 400 });
  }
  if (moduleFiltre && !["maisons","zones","editions","chambres","equipes","nuits","croisades","sieges","documents"].includes(moduleFiltre)) {
    return NextResponse.json({ error: "Module inconnu." }, { status: 400 });
  }
  if (du && !/^\d{4}-\d{2}-\d{2}$/.test(du)) {
    return NextResponse.json({ error: "Format de date attendu : AAAA-MM-JJ." }, { status: 400 });
  }
  if (au && !/^\d{4}-\d{2}-\d{2}$/.test(au)) {
    return NextResponse.json({ error: "Format de date attendu : AAAA-MM-JJ." }, { status: 400 });
  }
  if (du && au && du > au) {
    return NextResponse.json({ error: "La date « Du » doit précéder la date « Au »." }, { status: 400 });
  }

  try {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (search) {
      where.push(`"titre" ILIKE $${i++}`);
      params.push(`%${search}%`);
    }
    if (moduleFiltre) {
      where.push(`$${i++} = ANY("modules")`);
      params.push(moduleFiltre);
    }
    if (formatFiltre) {
      where.push(`"format" = $${i++}`);
      params.push(formatFiltre);
    }
    if (du) {
      where.push(`"dateGeneration" >= $${i++}::timestamptz`);
      params.push(du);
    }
    if (au) {
      where.push(`"dateGeneration" <= ($${i++}::date + INTERVAL '1 day')`);
      params.push(au);
    }
    const whereSql = where.length > 0 ? "WHERE " + where.join(" AND ") : "";

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM "RapportGenere" ${whereSql}`,
      params
    );
    const total = countRes.rows[0].n;

    const listParams = [...params, limit, offset];
    const r = await pool.query(
      `SELECT "id","titre","modules","periodeDu","periodeAu","format","dateGeneration","auteurLibelle","pdfTaille","xlsxTaille","statut"
       FROM "RapportGenere" ${whereSql}
       ORDER BY "dateGeneration" DESC, "id" DESC
       LIMIT $${i}::int OFFSET $${i + 1}::int`,
      listParams
    );

    return NextResponse.json({
      total,
      limit,
      offset,
      items: r.rows.map((row: any) => ({
        id: row.id,
        titre: row.titre,
        modules: row.modules,
        periodeDu: row.periodeDu,
        periodeAu: row.periodeAu,
        format: row.format,
        dateGeneration: row.dateGeneration,
        auteur: row.auteurLibelle,
        pdfTaille: row.pdfTaille,
        xlsxTaille: row.xlsxTaille,
        statut: row.statut,
      })),
    });
  } catch (e) {
    console.error("Échec liste historique :", e);
    return NextResponse.json({ error: "Impossible de charger l'historique." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  let body: any;
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const modules = Array.isArray(body?.modules)
    ? body.modules.map((m: unknown) => String(m).trim()).filter(Boolean)
    : typeof body?.modules === "string"
      ? body.modules.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];
  const vMod = validerModulesConsolides(modules);
  if (!vMod.ok) {
    return NextResponse.json({ error: vMod.erreur }, { status: 400 });
  }

  const duRaw = typeof body?.du === "string" ? body.du.trim() : "";
  const auRaw = typeof body?.au === "string" ? body.au.trim() : "";
  const du = duRaw || null;
  const au = auRaw || null;
  if ((du && !au) || (!du && au)) {
    return NextResponse.json({ error: "Indiquez les deux bornes (Du et Au) ou aucune." }, { status: 400 });
  }
  if (du && au) {
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO.test(du) || !ISO.test(au) || !estDateIsoCalendaire(du) || !estDateIsoCalendaire(au)) {
      return NextResponse.json({ error: "Format de date attendu : AAAA-MM-JJ." }, { status: 400 });
    }
    if (du > au) {
      return NextResponse.json({ error: "La date « Du » doit précéder la date « Au »." }, { status: 400 });
    }
  }

  const format: FormatArchive = FORMATS_VALIDES.includes(body?.format) ? body.format : "both";

  try {
    // 1. Construire les données une seule fois.
    const rapport = await construireRapportConsolide(pool, modules, du, au, acces.email);

    // 2. Générer les fichiers en mémoire.
    let pdfBuf: Buffer | null = null;
    let xlsxBuf: Buffer | null = null;
    if (format === "pdf" || format === "both") {
      pdfBuf = await buildConsolidatedPdfBuffer(rapport, acces.email);
      if (!pdfBuf || pdfBuf.length === 0) {
        return NextResponse.json({ error: "Échec de la génération du PDF." }, { status: 500 });
      }
    }
    if (format === "xlsx" || format === "both") {
      xlsxBuf = buildConsolidatedXlsxBuffer(rapport, acces.email);
      if (!xlsxBuf || xlsxBuf.length === 0) {
        return NextResponse.json({ error: "Échec de la génération du fichier Excel." }, { status: 500 });
      }
    }

    // 3. Empreintes.
    const pdfSha = pdfBuf ? createHash("sha256").update(pdfBuf).digest("hex") : null;
    const xlsxSha = xlsxBuf ? createHash("sha256").update(xlsxBuf).digest("hex") : null;

    // 4. Auteur (depuis la session, jamais du client).
    const auteurId = acces.id;
    const auteurLibelle = acces.nom || acces.email;

    // 5. Titre.
    const labels = modules.map((m: string) => {
      const meta = MODULES_CONSOLides.find((x) => x.id === m);
      return meta ? meta.label : m;
    });
    const periodeTxt = du && au ? `${du} au ${au}` : "inventaire";
    const titre = `Rapport consolidé — ${labels.join(", ")} — ${periodeTxt}`;

    // 6. Insertion transactionnelle.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `INSERT INTO "RapportGenere"
          ("titre","typeRapport","modules","periodeDu","periodeAu","filtres","dateGeneration",
           "auteurId","auteurLibelle","snapshot","schemaVersion","format",
           "pdfData","pdfTaille","pdfSha256","xlsxData","xlsxTaille","xlsxSha256","statut")
         VALUES ($1,$2,$3,$4,$5,$6,now(),$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,'genere')
         RETURNING "id","dateGeneration"`,
        [
          titre, "consolide", modules, du, au, JSON.stringify({}),
          auteurId, auteurLibelle, JSON.stringify(rapport), "1.0", format,
          pdfBuf, pdfBuf ? pdfBuf.length : null, pdfSha,
          xlsxBuf, xlsxBuf ? xlsxBuf.length : null, xlsxSha,
        ]
      );
      await client.query("COMMIT");
      const row = r.rows[0];
      return NextResponse.json(
        {
          id: row.id,
          titre,
          format,
          modules,
          periodeDu: du,
          periodeAu: au,
          dateGeneration: row.dateGeneration,
          auteurLibelle,
          telechargementDisponible: false,
          message: "Rapport archivé. Le téléchargement historique sera disponible dans la prochaine phase (P4.3).",
        },
        { status: 201 }
      );
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Échec de l'archivage du rapport consolidé :", e);
      return NextResponse.json({ error: "Échec de l'archivage du rapport consolidé." }, { status: 500 });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("Échec de l'archivage du rapport consolidé :", e);
    return NextResponse.json({ error: "Échec de l'archivage du rapport consolidé." }, { status: 500 });
  }
}
