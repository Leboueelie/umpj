import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import type { RapportConsolide, SectionConsolidee } from "./rapport-consolide";

function clean(s: string): string {
  return (s || "")
    .replace(/[\u2019\u2018]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...");
}

function generer(
  rapport: RapportConsolide,
  auteur: string,
  totalPages: number | null
): Promise<{ buffer: Buffer; pageCount: number }> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 30, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve({ buffer: Buffer.concat(chunks), pageCount: pagesCreated }));
    doc.on("error", reject);

    const margin = 30;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const usableW = pageW - 2 * margin;
    let y = margin;
    let pagesCreated = 1;

    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const drawWatermark = () => {
      if (!fs.existsSync(logoPath)) return;
      const w = pageW * 0.36;
      const h = w * (373 / 378);
      doc.opacity(0.05);
      doc.image(logoPath, (pageW - w) / 2, (pageH - h) / 2, { width: w });
      doc.opacity(1);
    };
    const drawTopHeader = () => {
      doc.font("Helvetica").fontSize(8).fillColor("#999999");
      doc.text("UMPJ - Rapport institutionnel consolidé", margin, 12, { align: "left", width: usableW / 2, lineBreak: false });
      doc.text("Confidentiel - usage institutionnel", margin + usableW / 2, 12, { align: "right", width: usableW / 2, lineBreak: false });
      doc.fillColor("#000000");
      // trait fin sous l'en-tete
      doc.moveTo(margin, 24).lineTo(pageW - margin, 24).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
      doc.strokeColor("#000000").lineWidth(1);
    };
    drawWatermark();
    doc.on("pageAdded", () => {
      pagesCreated++;
      drawWatermark();
      drawTopHeader();
      y = margin;
    });

    const finalizeFooter = (pageNum: number, total: number | null) => {
      if (pageNum < 2) return;
      if (total === null) return;
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(8).fillColor("#666666");
      doc.text("UMPJ - Rapport institutionnel consolidé", margin, pageH - 18, { align: "left", width: usableW / 2, lineBreak: false });
      const label = `Page ${pageNum} / ${total}`;
      doc.text(label, margin + usableW / 2, pageH - 18, { align: "right", width: usableW / 2, lineBreak: false });
      doc.fillColor("#000000");
      doc.page.margins.bottom = savedBottom;
    };

    const addPage = () => {
      finalizeFooter(pagesCreated, totalPages);
      doc.addPage();
    };

    const ensure = (h: number) => {
      if (y + h > pageH - margin - 22) {
        addPage();
        y = margin;
      }
    };

    const titre = (t: string, size = 12) => {
      ensure(size + 8);
      doc.font("Helvetica-Bold").fontSize(size).fillColor("#1f3864");
      doc.text(clean(t), margin, y, { width: usableW });
      y += size + 6;
      doc.fillColor("#000000");
    };

    const para = (t: string, size = 10.5) => {
      doc.font("Helvetica").fontSize(size);
      const h = doc.heightOfString(clean(t), { width: usableW });
      if (y + h > pageH - margin - 22) {
        addPage();
        y = margin;
      }
      doc.text(clean(t), margin, y, { width: usableW });
      y += h + 4;
    };

    const kv = (k: string, v: string) => {
      ensure(13);
      doc.font("Helvetica-Bold").fontSize(9.5).text(clean(k) + " : ", margin, y, { continued: true, width: usableW });
      doc.font("Helvetica").fontSize(9.5).text(clean(v), { width: usableW });
      y += 13;
    };

    const drawTable = (cols: string[], rows: (string | number)[][], colWidths: number[], aligns?: ("left" | "right" | "center")[]) => {
      const headerH = 18;
      const cellPad = 4;
      const drawHeader = () => {
        ensure(headerH);
        let x = margin;
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#ffffff");
        for (let i = 0; i < cols.length; i++) {
          doc.rect(x, y, colWidths[i], headerH).fillAndStroke("#1f3864", "#1f3864");
          doc.fillColor("#ffffff").text(clean(String(cols[i])), x + cellPad, y + 4, { width: colWidths[i] - 2 * cellPad, align: "left" });
          x += colWidths[i];
        }
        y += headerH;
        doc.fillColor("#000000");
      };
      drawHeader();
      doc.font("Helvetica").fontSize(9.5);
      for (const row of rows) {
        let maxH = 12;
        for (let i = 0; i < row.length; i++) {
          const h = doc.heightOfString(clean(String(row[i] ?? "")), { width: colWidths[i] - 2 * cellPad });
          if (h > maxH) maxH = h;
        }
        const rowH = maxH + 5;
        if (y + rowH > pageH - margin - 22) {
          addPage();
          y = margin;
          drawHeader();
        }
        let x = margin;
        for (let i = 0; i < row.length; i++) {
          doc.rect(x, y, colWidths[i], rowH).stroke("#9aa7bf");
          const align = aligns && aligns[i] ? aligns[i] : "left";
          doc.text(clean(String(row[i] ?? "")), x + cellPad, y + 3, { width: colWidths[i] - 2 * cellPad, align });
          x += colWidths[i];
        }
        y += rowH;
      }
      y += 8;
    };

    // ---- Couverture ----
    if (fs.existsSync(logoPath)) {
      const w = 80;
      const h = w * (373 / 378);
      doc.image(logoPath, (pageW - w) / 2, margin, { width: w });
      y = margin + h + 14;
    } else {
      y = margin + 10;
    }
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#888888");
    doc.text("UNIVERSITÉ MONDIALE DE PRIÈRE ET DE JEÛNE", margin, y, { align: "center", width: usableW });
    y += 16;
    doc.font("Helvetica-Bold").fontSize(26).fillColor("#1f3864");
    doc.text("RAPPORT INSTITUTIONNEL CONSOLIDÉ", margin, y, { align: "center", width: usableW });
    y += 34;
    doc.font("Helvetica").fontSize(11.5).fillColor("#000000");
    const periodeTxt = rapport.periode ? `Période couverte : ${rapport.periode.du} au ${rapport.periode.au}` : "Inventaire (toutes les données disponibles)";
    doc.text(clean(periodeTxt), margin, y, { align: "center", width: usableW });
    y += 16;
    doc.text("Modules : " + rapport.modules.join(", "), margin, y, { align: "center", width: usableW });
    y += 16;
    doc.text("Date de génération : " + rapport.dateGeneration.replace("T", " ").slice(0, 19), margin, y, { align: "center", width: usableW });
    y += 16;
    doc.text("Auteur : " + auteur, margin, y, { align: "center", width: usableW });
    y += 24;

    // ---- Sommaire ----
    addPage();
    titre("Sommaire", 18);
    const sommaire = [
      "1. Synthèse exécutive",
      "2. Périmètre et méthodologie",
      "3. Détails par module",
      "4. Anomalies et limites",
      "5. Conclusion factuelle",
      "6. Annexes",
    ];
    for (const s of sommaire) {
      para(s, 11);
    }

    // ---- 1. Synthese executive ----
    titre("1. Synthèse exécutive", 18);
    para("Indicateurs principaux par module. Les grandeurs de sources différentes ne sont jamais additionnées.", 10.5);
    if (rapport.synthese.length > 0) {
      drawTable(
        ["Module", "Volume examiné", "Indicateurs clés"],
        rapport.synthese.map((s) => [s.intitule, s.volume, s.resume || "—"]),
        [130, 60, usableW - 190],
        ["left", "right", "left"]
      );
    } else {
      para("Aucun module sélectionné.");
    }

    // ---- 2. Perimetre et methodologie ----
    titre("2. Périmètre et méthodologie", 18);
    para("Modules sélectionnés : " + rapport.modules.join(", ") + ".", 10.5);
    para("Période : " + (rapport.periode ? `${rapport.periode.du} au ${rapport.periode.au}` : "Toutes les donnees disponibles (inventaire)."), 10.5);
    para("Sources consultées : tables métier réelles (Cahier/Ligne, Zone/EntreeZone, Edition, ChambreDePriere, EquipePriere, NuitPriere, CroisadeJeunePriere, SiegePriere, Jeune, Proclamation, ActionDeGrace).", 10.5);
    para("Définitions : participants = cumuls (pas de personnes uniques) ; moyennes de participation des éditions = valeurs enregistrées (jamais recalculées) ; durées ne comptent que les sessions valides (durée > 0) ; durées manquantes signalées.", 10.5);
    para("Limites : pas de total général inter-modules ; modules sans période (chambres) = inventaire.", 10.5);

    // ---- 3. Details par module ----
    addPage();
    titre("3. Détails par module", 18);
    for (const sec of rapport.sections) {
      titre(sec.intitule, 13);
      para("Source : " + sec.source, 9.5);
      para("Volume examiné : " + sec.volumesExamines + " enregistrement(s).", 9.5);
      if (sec.indicateurs.length > 0) {
        drawTable(
          ["Indicateur", "Valeur", "Définition"],
          sec.indicateurs.map((i) => [i.libelle, i.valeur, i.definition]),
          [170, 80, usableW - 250],
          ["left", "right", "left"]
        );
      }
      if (sec.tableau) {
        para(sec.tableau.titre, 10);
        drawTable(
          sec.tableau.colonnes,
          sec.tableau.lignes,
          sec.tableau.colonnes.map(() => Math.floor(usableW / sec.tableau!.colonnes.length)),
          sec.tableau.colonnes.map((c) =>
            /total|sessions|jours|participants|fichiers|nombre|durée|volume|cumul|temps/i.test(c) ? "right" : "left"
          )
        );
      }
      if (sec.anomalies.length > 0) {
        para("Anomalies contrôlées :", 10);
        for (const a of sec.anomalies) {
          para(`- ${a.libelle} : ${a.nombre}`, 9.5);
        }
      }
      if (sec.limites.length > 0) {
        para("Limites :", 10);
        for (const l of sec.limites) {
          para(`- ${l}`, 9.5);
        }
      }
      if (sec.sansDonnees) {
        para("Aucune donnée pour cette sélection.", 9.5);
      }
      y += 6;
    }

    // ---- 4. Anomalies et limites ----
    ensure(40);
    titre("4. Anomalies et limites", 18);
    const allAnom = rapport.sections.flatMap((s) => s.anomalies.map((a) => ({ module: s.intitule, ...a })));
    if (allAnom.length > 0) {
      drawTable(
        ["Module", "Anomalie", "Nombre"],
        allAnom.map((a) => [a.module, a.libelle, a.nombre]),
        [130, usableW - 180, 50],
        ["left", "left", "right"]
      );
    } else {
      para("Aucune anomalie contrôlée sur la sélection.");
    }
    const allLim = Array.from(new Set(rapport.sections.flatMap((s) => s.limites)));
    if (allLim.length > 0) {
      para("Limites consolidées :", 10);
      for (const l of allLim) para(`- ${l}`, 9.5);
    }

    // ---- 5. Conclusion factuelle ----
    titre("5. Conclusion factuelle", 18);
    const totalVol = rapport.sections.reduce((a, s) => a + s.volumesExamines, 0);
    para(`Rapport généré le ${rapport.dateGeneration.replace("T", " ").slice(0, 19)} a partir de ${totalVol} enregistrement(s) examinés sur ${rapport.sections.length} module(s) pour la période ${rapport.periode ? rapport.periode.du + " au " + rapport.periode.au : "toutes les données disponibles"}.`);
    para("Les constats ci-dessus sont issus exclusivement des données enregistrées. Aucune tendance ni conclusion inventée n'a été ajoutée.");

    // ---- 6. Annexes ----
    titre("6. Annexes", 18);
    para("Tableaux détaillés : voir section 3 (Détails par module).");
    para("Sources : " + rapport.sections.map((s) => s.source).join(" ; "));

    // ---- Pied de page sur la derniere page ----
    finalizeFooter(pagesCreated, totalPages);

    doc.end();
  });
}

export function buildConsolidatedPdfBuffer(rapport: RapportConsolide, auteur: string): Promise<Buffer> {
  return generer(rapport, auteur, null).then(({ pageCount }) => {
    return generer(rapport, auteur, pageCount).then(({ buffer }) => buffer);
  });
}
