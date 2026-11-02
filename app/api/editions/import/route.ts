import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { parseEditionFile } from "@/lib/excel";
import { parseEditionPdfBuffer } from "@/lib/edition-import-pdf";
import { verifierTailleDeclaree, LIMITE_EDITION } from "@/lib/body-limit";
import { estPdf } from "@/lib/fichiers";
import { ImportValidationError } from "@/lib/excel";
import { lireBufferBorne } from "@/lib/body-stream";
import { validerEditionImportee } from "@/lib/edition-import-validation";

export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo

export async function POST(req: Request) {
  const acces = await requireAdmin();
  if (acces instanceof NextResponse) return acces;

  const tailleErreur = verifierTailleDeclaree(req, LIMITE_EDITION);
  if (tailleErreur) return tailleErreur;

  // Lecture bornée du corps avant parsing multipart.
  const buffer = await lireBufferBorne(req, LIMITE_EDITION);
  if (buffer === null) {
    return NextResponse.json({ error: "Le corps de la requête dépasse la taille maximale autorisée." }, { status: 413 });
  }

  const form = new Request(req.url, {
    method: "POST",
    body: new Uint8Array(buffer),
    headers: { "Content-Type": req.headers.get("content-type") || "multipart/form-data" },
  });
  let formData: FormData;
  try {
    formData = await form.formData();
  } catch {
    const cl = parseInt(req.headers.get("content-length") || "0", 10);
    if (cl > MAX_SIZE) {
      return NextResponse.json({ error: "Le fichier dépasse 10 Mo." }, { status: 413 });
    }
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier requis (champ 'file')." }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Le fichier dépasse 10 Mo." }, { status: 413 });
  }

  const preview = new URL(req.url).searchParams.get("preview") === "1";

  try {
    const name = file.name.toLowerCase();
    let ed;
    if (name.endsWith(".pdf")) {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.byteLength > MAX_SIZE) {
        return NextResponse.json({ error: "Le fichier dépasse 10 Mo." }, { status: 413 });
      }
      if (!estPdf(buf)) {
        return NextResponse.json({ error: "Le contenu du fichier n'est pas un PDF valide." }, { status: 400 });
      }
      ed = await parseEditionPdfBuffer(buf);
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) {
      ed = await parseEditionFile(file as unknown as File);
    } else {
      return NextResponse.json(
        { error: "Format non reconnu. Formats acceptés : Excel (.xlsx, .xls, .csv) ou PDF (rapport UMPJ)." },
        { status: 400 }
      );
    }

    if (!ed.numero || !ed.dateDebut || !ed.dateFin) {
      return NextResponse.json(
        { error: "Le fichier doit contenir numero, dateDebut et dateFin." },
        { status: 400 }
      );
    }

    // Les heures investies sont toujours calculées à partir de la somme des
    // sessions (règle métier). On s'assure ici que la valeur stockée est celle
    // calculée, même si le parseur a gardé une valeur déclarée séparément.
    ed.heuresInvesties = ed.sessions.reduce((a, s) => a + (s.dureeMinutes || 0), 0);

    // Vérification du doublon (lecture pour la prévisualisation)
    const dupRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM "Edition" WHERE "numero" = $1`,
      [ed.numero]
    );
    const duplicate = dupRes.rows[0].n > 0;

    const validation = validerEditionImportee(ed, duplicate ? [ed.numero] : []);
    // En mode prévisualisation, on renvoie l'analyse sans insérer.
    if (preview) {
      return NextResponse.json(
        {
          preview: true,
          data: ed,
          erreurs: validation.erreurs,
          avertissements: validation.avertissements,
          bloquant: validation.bloquant,
          doublon: duplicate,
        },
        { status: 200 }
      );
    }

    // Mode confirmation : contrôle transactionnel du doublon (verrou exclusif
    // sur la table pour sérialiser les imports concurrents), puis validation,
    // puis insertion. Aucune migration ni contrainte UNIQUE n'est ajoutée :
    // la sérialisation applicative garantit l'unicité dans la pratique.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query('LOCK TABLE "Edition" IN EXCLUSIVE MODE');

      const dupLocked = await client.query(
        `SELECT COUNT(*)::int AS n FROM "Edition" WHERE "numero" = $1`,
        [ed.numero]
      );
      if (dupLocked.rows[0].n > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Ce numéro d'édition existe déjà." },
          { status: 409 }
        );
      }

      const validationConfirm = validerEditionImportee(ed, []);
      if (validationConfirm.bloquant) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: validationConfirm.erreurs.join(" ") },
          { status: 400 }
        );
      }

      const heuresInvesties = ed.heuresInvesties;
      const r = await client.query(
        `INSERT INTO "Edition"
          ("numero","reference","dateDebut","dateFin","libellePeriode",
           "delegationsPresentes","regionsSpirituelles","missionnaires1","missionnaires2",
           "anciensAbidjan","epousesAnciensAbidjan","moyenneParticipation","heuresInvesties",
           "delegationsExterieures","abidjanZones","interieurLocalites","participantsParJour","sessions")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING "id"`,
        [
          ed.numero, ed.reference, ed.dateDebut, ed.dateFin, ed.libellePeriode,
          ed.delegationsPresentes, ed.regionsSpirituelles, ed.missionnaires1, ed.missionnaires2,
          ed.anciensAbidjan, ed.epousesAnciensAbidjan, ed.moyenneParticipation, heuresInvesties,
          JSON.stringify(ed.delegationsExterieures), JSON.stringify(ed.abidjanZones),
          JSON.stringify(ed.interieurLocalites), JSON.stringify(ed.participantsParJour),
          JSON.stringify(ed.sessions),
        ]
      );
      await client.query("COMMIT");
      return NextResponse.json({ id: r.rows[0].id }, { status: 201 });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      const code = (e as any)?.code;
      const msg = e instanceof Error ? e.message : "";
      if (code === "23505" || msg.includes("Edition_numero_key") || msg.includes("duplicate key")) {
        return NextResponse.json(
          { error: "Ce numéro d'édition existe déjà." },
          { status: 409 }
        );
      }
      if (msg.includes("Utilisateur_email_key")) {
        return NextResponse.json(
          { error: "Un compte existe déjà avec cette adresse email." },
          { status: 409 }
        );
      }
      const cl = parseInt(req.headers.get("content-length") || "0", 10);
      if (cl > MAX_SIZE) {
        return NextResponse.json({ error: "Le fichier dépasse 10 Mo." }, { status: 413 });
      }
      console.error("Échec de l'import de l'édition :", e);
      return NextResponse.json({ error: "Échec de l'import de l'édition." }, { status: 500 });
    } finally {
      client.release();
    }
  } catch (e) {
    if (e instanceof ImportValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const cl = parseInt(req.headers.get("content-length") || "0", 10);
    if (cl > MAX_SIZE) {
      return NextResponse.json({ error: "Le fichier dépasse 10 Mo." }, { status: 413 });
    }
    console.error("Échec de l'import de l'édition :", e);
    return NextResponse.json({ error: "Échec de l'import de l'édition." }, { status: 500 });
  }
}
