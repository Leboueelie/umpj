import type { ImportedEdition } from "./excel";

const MOIS: Record<string, number> = {
  JANVIER: 1, FEVRIER: 2, MARS: 3, AVRIL: 4, MAI: 5, JUIN: 6,
  JUILLET: 7, AOUT: 8, SEPTEMBRE: 9, OCTOBRE: 10, NOVEMBRE: 11, DECEMBRE: 12,
};

const MOIS_DISPLAY: Record<string, string> = {
  JANVIER: "Janvier", FEVRIER: "Février", MARS: "Mars", AVRIL: "Avril", MAI: "Mai",
  JUIN: "Juin", JUILLET: "Juillet", AOUT: "Août", SEPTEMBRE: "Septembre",
  OCTOBRE: "Octobre", NOVEMBRE: "Novembre", DECEMBRE: "Décembre",
};

function pad(n: number): string { return String(n).padStart(2, "0"); }
function cap(s: string): string { return s.charAt(0) + s.slice(1).toLowerCase(); }

function num(m: RegExpMatchArray | null, d = 0): number {
  if (!m) return d;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : d;
}

function between(t: string, startRe: RegExp, endRe: RegExp): string {
  const s = t.match(startRe);
  if (!s) return "";
  const rest = t.slice(s.index! + s[0].length);
  const e = rest.match(endRe);
  return rest.slice(0, e ? e.index : rest.length);
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCDate()} ${pad(dt.getUTCMonth() + 1)} ${dt.getUTCFullYear()}`;
}

function extractPdfText(buf: Buffer): Promise<string> {
  // import direct du parseur (evite le bug debugMode de l'index pdf-parse)
  return import("pdf-parse/lib/pdf-parse.js").then((mod: any) => {
    const pdfParse = mod.default || mod;
    return pdfParse(buf).then((d: any) => d.text as string);
  });
}

export async function parseEditionPdfBuffer(buf: Buffer): Promise<ImportedEdition> {
  const raw = await extractPdfText(buf);

  const numeroM = raw.match(/COMPTE RENDU\s+(\d+)\s*e\s*EDITION/i);
  const numero = numeroM ? parseInt(numeroM[1], 10) : 0;

  let t = raw
    .replace(/UNIVERSITE MONDIALE[\s\S]*?IVOIRE/g, " ")
    .replace(/COMPTE RENDU[\s\S]*?ATTIEKOI\s*\d*/g, " ")
    .replace(/COLETTE MENYE/g, " ")
    .replace(/COTE D['’]IVOIRE/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/(\d+)\s+(er|e|ère|è)\s+jour/g, "$1$2 jour")
    .replace(/\s{2,}/g, " ");

  // Reference + periode
  const refM = t.match(/RAPPORT\s+UMPJ-CI\s+(\S+)/);
  const reference = refM ? `RAPPORT UMPJ-CI ${refM[1]}` : "";

  let day1 = 0, day2 = 0, year = 0, mo = 0;
  let libellePeriode = "";
  let dateDebut = "";
  let dateFin = "";
  const mAU = t.match(/DU\s+(\d{1,2})\s+AU\s+(\d{1,2})\s+([A-ZÉÈ]+)\s+(\d{4})/);
  const mSimple = t.match(/DU\s+(\d{1,2})\s+([A-ZÉÈ]+)\s+(\d{4})/);
  if (mAU) {
    day1 = parseInt(mAU[1], 10); day2 = parseInt(mAU[2], 10);
    mo = MOIS[mAU[3].toUpperCase()] || 0; year = parseInt(mAU[4], 10);
    libellePeriode = `${day1} au ${MOIS_DISPLAY[mAU[3].toUpperCase()] || cap(mAU[3])} ${year}`;
  } else if (mSimple) {
    day1 = day2 = parseInt(mSimple[1], 10);
    mo = MOIS[mSimple[2].toUpperCase()] || 0; year = parseInt(mSimple[3], 10);
    libellePeriode = `${day1} ${MOIS_DISPLAY[mSimple[2].toUpperCase()] || cap(mSimple[2])} ${year}`;
  }
  if (mo) {
    dateDebut = `${year}-${pad(mo)}-${pad(day1)}`;
    dateFin = `${year}-${pad(mo)}-${pad(day2)}`;
  }

  // Section I compteurs
  const delegationsPresentes = num(t.match(/Nombre de délégations présentes\s*:\s*(\d+)/i));
  const regionsSpirituelles = num(t.match(/Régions spirituelles présentes\s*:\s*(\d+)/i));
  const missionnaires1 = num(t.match(/Missionnaires n°\s*1\s*:\s*(\d+)/i));
  const missionnaires2 = num(t.match(/Missionnaires n°\s*2\s*:\s*(\d+)/i));
  const anciensAbidjan = num(t.match(/Anciens d['’]Abidjan\s*:\s*(\d+)/i));
  const epousesAnciensAbidjan = num(t.match(/Epouses d['’]Anciens ABIDJAN\s*:\s*(\d+)/i));

  // Listes
  const ext = between(t, /Délégations extérieures\s*:\s*\d+\s*/, /8\./);
  const delegationsExterieures = ext ? ext.split("-").map((s) => s.trim()).filter(Boolean) : [];

  const ab = between(t, /Délégation d['’]ABIDJAN\s*:\s*\d+\s*/, /9\./);
  const abidjanZones = ab ? ab.split("•").map((s) => s.trim()).filter(Boolean) : [];

  const inT = between(t, /Délégation de l['’]INTERIEUR\s*:\s*\d+\s*Localités\s*/, /10\./);
  const interieurLocalites = inT ? inT.split("•").map((s) => s.trim()).filter(Boolean) : [];

  // Participants par jour
  const partBlock = between(t, /10\.\s*LES PARTICIPANTS/, /MOYENNE GENERALE/);
  const partRe = /-\s+(\d+(?:er|e|ère|è)?\s*jour)\s+(\d+)\s*Participants/g;
  const participantsParJour: ImportedEdition["participantsParJour"] = [];
  let pm: RegExpExecArray | null;
  while ((pm = partRe.exec(partBlock))) {
    participantsParJour.push({ jour: pm[1].trim(), date: "", participants: parseInt(pm[2], 10) });
  }
  if (dateDebut) participantsParJour.forEach((p, i) => { p.date = addDays(dateDebut, i); });

  const moyM = t.match(/MOYENNE GENERALE DE PARTICIPATION\s*:\s*(\d+)/i);
  const moyenneParticipation = moyM ? parseInt(moyM[1], 10) : 0;

  // Section II
  const invM = t.match(/NOMBRE D['’]HEURES INVESTIES\s*:\s*(\d+)\s*H\s*(\d+)\s*MN/i);
  const dureeH = invM ? parseInt(invM[1], 10) : 0;
  const dureeM = invM ? parseInt(invM[2], 10) : 0;
  const heuresInvesties = dureeH * 60 + dureeM;

  const sec2 = between(t, /II\.\s*INVESTISSEMENT/, /TOTAL/);
  const sessRe = /(\d+(?:er|e|ère|è)?\s*jour)\s+(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})\s+(\d+)\s*Sessions\s+([\s\S]*?)\s+(\d+)\s*H\s*(\d+)\s+(\d+)/g;
  const sessions: ImportedEdition["sessions"] = [];
  let sm: RegExpExecArray | null;
  while ((sm = sessRe.exec(sec2))) {
    const dh = parseInt(sm[7], 10);
    const dm = parseInt(sm[8], 10);
    const yRaw = parseInt(sm[4], 10);
    const y = yRaw < 100 ? 2000 + yRaw : yRaw;
    sessions.push({
      date: `${sm[2]} ${sm[3]} ${y}`,
      nbSessions: parseInt(sm[5], 10),
      periodes: sm[6].replace(/\s{2,}/g, " ").trim(),
      dureeMinutes: dh * 60 + dm,
      participants: parseInt(sm[9], 10),
    });
  }

  return {
    numero,
    reference,
    dateDebut,
    dateFin,
    libellePeriode,
    delegationsPresentes,
    regionsSpirituelles,
    missionnaires1,
    missionnaires2,
    anciensAbidjan,
    epousesAnciensAbidjan,
    moyenneParticipation,
    delegationsExterieures,
    abidjanZones,
    interieurLocalites,
    participantsParJour,
    sessions,
  };
}

export { extractPdfText };
