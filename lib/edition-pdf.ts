import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import type { Edition } from "@/lib/types";

function clean(s: string): string {
  return (s || "")
    .replace(/[\u2019\u2018]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...");
}

function fmtHMN(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)} H ${String(m % 60).padStart(2, "0")} MN`;
}

function drawColumns(doc: PDFKit.PDFDocument, items: string[], cols: number, startY: number, margin: number, pageW: number): number {
  const colW = (pageW - 2 * margin) / cols;
  const rowH = 14;
  let col = 0;
  let row = 0;
  for (const it of items) {
    const x = margin + col * colW;
    const y = startY + row * rowH;
    doc.text("• " + it, x, y, { width: colW - 6 });
    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  }
  const rows = row + (col > 0 ? 1 : 0);
  return startY + rows * rowH;
}

export function buildEditionPdfBuffer(e: Edition): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const margin = 40;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    let y = margin;

    // Filigrane : logo UMPJ en fond (faible opacite), centré sur chaque page
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const drawWatermark = () => {
      if (!fs.existsSync(logoPath)) return;
      const w = pageW * 0.5;
      const h = w * (373 / 378);
      doc.opacity(0.1);
      doc.image(logoPath, (pageW - w) / 2, (pageH - h) / 2, { width: w });
      doc.opacity(1);
    };
    drawWatermark();
    doc.on("pageAdded", drawWatermark);

    const ensure = (h: number) => {
      if (y + h > pageH - margin) {
        doc.addPage();
        y = margin;
      }
    };

    // En-tête
    doc.font("Helvetica-Bold").fontSize(12);
    doc.text(clean("UNIVERSITE MONDIALE DE PRIERE ET DE JEUNE-COTE D'IVOIRE"), margin, y, { align: "center", width: pageW - 2 * margin });
    y += 24;
    doc.font("Helvetica").fontSize(11);
    doc.text(clean(e.reference || "RAPPORT UMPJ-CI"), margin, y, { align: "center", width: pageW - 2 * margin });
    y += 18;
    doc.text(clean("DU " + (e.libellePeriode || `${e.dateDebut} AU ${e.dateFin}`).toUpperCase()), margin, y, { align: "center", width: pageW - 2 * margin });
    y += 26;

    // I. Pendant l'UMPJ
    doc.font("Helvetica-Bold").fontSize(12);
    doc.text("I.  PENDANT L'UMPJ", margin, y);
    y += 20;
    doc.font("Helvetica").fontSize(10);
    const items: { line: string; subs?: string[] }[] = [
      { line: `1. Nombre de delegations presentes : ${e.delegationsPresentes}` },
      { line: `2. Nombre de Regions spirituelles presentes : ${e.regionsSpirituelles}` },
      { line: `3. Nombre de Missionnaires n°1 : ${e.missionnaires1}` },
      { line: `4. Nombre de Missionnaires n°2 : ${e.missionnaires2}` },
      { line: `5. Nombre d'Anciens d'Abidjan : ${e.anciensAbidjan}` },
      { line: `6. Epouses d'Anciens ABIDJAN : ${e.epousesAnciensAbidjan}` },
      { line: `7. Delegations exterieures : ${e.delegationsExterieures.length}`, subs: e.delegationsExterieures },
      { line: `8. Delegation d'ABIDJAN : ${e.abidjanZones.length}`, subs: e.abidjanZones },
      { line: `9. Delegation de l'INTERIEUR : ${e.interieurLocalites.length} Localites`, subs: e.interieurLocalites },
    ];
    for (const { line, subs } of items) {
      doc.text(clean(line), margin, y, { width: pageW - 2 * margin });
      y += 16;
      if (subs && subs.length) {
        const cols = subs === e.interieurLocalites ? 3 : 2;
        ensure(14 * Math.ceil(subs.length / cols) + 8);
        y = drawColumns(doc, subs.map(clean), cols, y, margin, pageW);
        y += 8;
      }
    }

    // 10. Participants
    ensure(60);
    doc.font("Helvetica-Bold").fontSize(12);
    doc.text("10.  LES PARTICIPANTS", margin, y);
    y += 18;
    doc.font("Helvetica").fontSize(10);
    for (const p of e.participantsParJour) {
      doc.text(clean(`- ${p.jour} ${p.participants} Participants`), margin, y, { width: pageW - 2 * margin });
      y += 14;
    }
    y += 4;
    doc.font("Helvetica-Bold");
    doc.text(clean(`MOYENNE GENERALE DE PARTICIPATION : ${e.moyenneParticipation} PARTICIPANTS`), margin, y, { width: pageW - 2 * margin });
    y += 28;

    // II. Investissement
    ensure(90);
    doc.font("Helvetica-Bold").fontSize(12);
    doc.text("II.  INVESTISSEMENT DANS LA PRIERE", margin, y);
    y += 18;
    doc.font("Helvetica").fontSize(10);
    doc.text(clean(`NOMBRE D'HEURES INVESTIES : ${fmtHMN(e.heuresInvesties)}`), margin, y, { width: pageW - 2 * margin });
    y += 20;

    const colXs = [margin, margin + 70, margin + 150, margin + 310, margin + 410, pageW - margin];
    const headers = ["SESSIONS", "NOMBRE DE SESSIONS", "PERIODES", "DUREE (heures)", "PARTICIPANTS"];
    doc.font("Helvetica-Bold");
    headers.forEach((h, i) => doc.text(clean(h), colXs[i], y, { width: colXs[i + 1] - colXs[i] - 4 }));
    doc.font("Helvetica");
    y += 16;
    for (const s of e.sessions) {
      ensure(16);
      const row = [s.date, `${s.nbSessions} Sessions`, s.periodes, fmtHMN(s.dureeMinutes), String(s.participants)];
      row.forEach((c, i) => doc.text(clean(String(c)), colXs[i], y, { width: colXs[i + 1] - colXs[i] - 4 }));
      y += 16;
    }
    ensure(16);
    doc.font("Helvetica-Bold");
    doc.text("TOTAL", colXs[0], y, { width: colXs[1] - colXs[0] - 4 });
    doc.text(fmtHMN(e.heuresInvesties), colXs[3], y, { width: colXs[4] - colXs[3] - 4 });
    doc.text(`${e.moyenneParticipation} (EN MOYENNE)`, colXs[4], y, { width: colXs[5] - colXs[4] - 4 });
    doc.font("Helvetica");

    doc.end();
  });
}
