import type { ImportedEdition } from "@/lib/excel";

const MOIS: Record<string, number> = {
  JANVIER: 1, FEVRIER: 2, MARS: 3, AVRIL: 4, MAI: 5, JUIN: 6,
  JUILLET: 7, AOUT: 8, SEPTEMBRE: 9, OCTOBRE: 10, NOVEMBRE: 11, DECEMBRE: 12,
};

const MOIS_DISPLAY_NUM: Record<number, string> = {
  1: "Janvier", 2: "Février", 3: "Mars", 4: "Avril", 5: "Mai", 6: "Juin",
  7: "Juillet", 8: "Août", 9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre",
};

function pad(n: number): string { return String(n).padStart(2, "0"); }

function between(s: string, start: RegExp, end: RegExp): string {
  const i = s.search(start);
  if (i < 0) return "";
  const after = s.slice(i);
  const j = after.search(end);
  return j < 0 ? after : after.slice(0, j);
}

function num(v: string | number | undefined | null): number {
  if (v === undefined || v === null) return 0;
  const m = String(v).replace(/[^\d]/g, "");
  return m ? parseInt(m, 10) : 0;
}

function normalize(t: string): string {
  t = t.replace(/\u00a0/g, " ");
  t = t.replace(/(\d)\s+er\b/gi, "$1er");
  t = t.replace(/(\d)\s+e\b/gi, "$1e");
  t = t.replace(/(\d)\s+[èé]\s*re\b/gi, "$1ère");
  t = t.replace(/(\d)\s+[èé]me\b/gi, "$1ème");
  return t;
}

async function extractPdfText(buf: Buffer): Promise<string> {
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = (mod as any).default || mod;
  const data = await pdfParse(buf);
  return typeof data?.text === "string" ? data.text : "";
}

function findCount(t: string, patterns: RegExp[]): number {
  for (const p of patterns) {
    const m = t.match(p);
    if (m) return num(m[1]);
  }
  return 0;
}

function listItems(block: string): string[] {
  const out: string[] = [];
  const re = /[•·\-–—◦▪]\s*([^\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const item = m[1].replace(/\s{2,}/g, " ").trim();
    if (!item) continue;
    if (/^(?:UNIVERSITE|COMPTE|TRANSFORMATION|UMPJ|ABIDJAN)\b/i.test(item)) continue;
    if (/UNIVERSITE|COMPTE RENDU|TRANSFORMATION|CÔTE\s*D|CI ATTIEKOI/i.test(item)) continue;
    out.push(item);
  }
  return out;
}

export async function parseEditionPdfBuffer(buf: Buffer): Promise<ImportedEdition> {
  const raw = await extractPdfText(buf);
  const t = normalize(raw);

  // Numero + reference
  const numM = t.match(/COMPTE RENDU\s+(\d+)[eè]?\s*EDITION/i) || t.match(/(\d+)[eè]?\s*EDITION/i);
  const numero = numM ? parseInt(numM[1], 10) : 0;
  const refM = t.match(/RAPPORT\s+UMPJ-?CI\s+(\S+)/i);
  const reference = refM ? `RAPPORT UMPJ-CI ${refM[1]}` : "";

  // Periode
  const mAU = t.match(/DU\s+(\d{1,2})\s+AU\s+(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{2,4})/i);
  const mSimple = t.match(/DU\s+(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{2,4})/i);
  let day1 = 0, day2 = 0, mo = 0, year = 0;
  if (mAU) {
    day1 = parseInt(mAU[1], 10); day2 = parseInt(mAU[2], 10);
    mo = MOIS[(mAU[3] || "").toUpperCase()] || 0; year = num(mAU[4]);
  } else if (mSimple) {
    day1 = day2 = parseInt(mSimple[1], 10);
    mo = MOIS[(mSimple[2] || "").toUpperCase()] || 0; year = num(mSimple[3]);
  }
  const y = year < 100 ? 2000 + year : year;
  const disp = mo ? MOIS_DISPLAY_NUM[mo] : "";
  const libellePeriode = mo ? (day1 === day2 ? `${day1} ${disp} ${y}` : `${day1} au ${disp} ${y}`) : "";
  const dateDebut = mo ? `${y}-${pad(mo)}-${pad(day1)}` : "";
  const dateFin = mo ? `${y}-${pad(mo)}-${pad(day2)}` : "";

  // Section I : compteurs (format "Nombre de X : N" ou "X : N", tolerant a la mise en page)
  const delegationsPresentes = findCount(t, [/D[ée]l[ée]gations?\s*pr[ée]sentes?\D{0,25}?(\d+)/i]);
  const regionsSpirituelles = findCount(t, [/R[ée]gions?\s*spirituelles?\D{0,25}?(\d+)/i]);
  const missionnaires1 = findCount(t, [/Missionnaires?\s*n[°o]?\s*1\D{0,25}?(\d+)/i]);
  const missionnaires2 = findCount(t, [/Missionnaires?\s*n[°o]?\s*2\D{0,25}?(\d+)/i]);
  const anciensAbidjan = findCount(t, [/Anciens?\s*d['’]?Abidjan\D{0,25}?(\d+)/i]);
  const epousesAnciensAbidjan = findCount(t, [/Epouses\D*(\d+)/i]);
  const moyenneParticipation = findCount(t, [/MOYENNE\s*G[ÉE]N[ÉE]RALE\s*DE\s*PARTICIPATION\D{0,25}?(\d+)/i]);

  // Listes locale (par marqueurs de section, uniquement les lignes a puce)
  const exB = between(t, /D[ée]l[ée]gations?\s*ext[ée]rieures?/i, /Abidjan/i);
  const abB = between(t, /D[ée]l[ée]gation\s*d['’]?\s*ABIDJAN/i, /INTERIEUR/i);
  const inB = between(t, /INTERIEUR/i, /LES\s*PARTICIPANTS/i);
  const delegationsExterieures = listItems(exB);
  const abidjanZones = listItems(abB);
  const interieurLocalites = listItems(inB);

  // Participants par jour
  const participantsParJour: ImportedEdition["participantsParJour"] = [];
  const partRe = /-?\s*(\d+(?:er|e|ère|è)?\s*jour)\s+(\d+)\s*Participants?/gi;
  const partRe2 = /(\d+)\s*Participants?\D{0,25}?(\d+(?:er|e|ère|è)?\s*jour)/gi;
  const seenJ = new Set<string>();
  let pm: RegExpExecArray | null;
  const addPart = (jour: string, participants: number) => {
    const key = jour.toLowerCase().replace(/\s+/g, " ").trim();
    if (seenJ.has(key)) return;
    seenJ.add(key);
    const dn = parseInt((jour.match(/(\d+)/) || [])[1] || "0", 10);
    participantsParJour.push({
      jour: jour.replace(/\s+/g, " ").trim(),
      date: mo ? `${y}-${pad(mo)}-${pad(dn)}` : "",
      participants,
    });
  };
  while ((pm = partRe.exec(t))) addPart(pm[1], parseInt(pm[2], 10));
  while ((pm = partRe2.exec(t))) addPart(pm[2], parseInt(pm[1], 10));
  participantsParJour.sort((a, b) => parseInt((a.jour.match(/\d+/) || ["0"])[0], 10) - parseInt((b.jour.match(/\d+/) || ["0"])[0], 10));

  // Sessions (section II)
  const sec2 = between(t, /II\.\s*INVESTISSEMENT/i, /TOTAL/i) || t;
  const sessions: ImportedEdition["sessions"] = [];
  const sessRe = /(\d+(?:er|e|ère|è)?\s*jour)\s+(\d{1,2})[ /-](\d{1,2})[ /-](\d{2,4})\s+(\d+)\s*(?:[Ss]essions?|[Ss][ée]ances?)\s+([\s\S]*?)\s+(\d+)\s*H\s*(\d+)\s+(\d+)/g;
  let sm: RegExpExecArray | null;
  while ((sm = sessRe.exec(sec2))) {
    const dh = parseInt(sm[7], 10);
    const dm = parseInt(sm[8], 10);
    let sy = parseInt(sm[4], 10);
    if (sy < 100) sy = 2000 + sy;
    sessions.push({
      date: `${sm[2]} ${sm[3]} ${sy}`,
      nbSessions: parseInt(sm[5], 10),
      periodes: sm[6].replace(/\s{2,}/g, " ").trim(),
      dureeMinutes: dh * 60 + dm,
      participants: parseInt(sm[9], 10),
    });
  }

  // Heures investies : valeur explicite sinon somme des sessions
  const hm = t.match(/NOMBRE\s*D['’]?HEURES\s*INVESTIES\s*[:\-]?\s*(\d+)\s*H\s*(\d+)/i);
  const heuresInvesties = hm ? parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10)
    : sessions.reduce((a, s) => a + (s.dureeMinutes || 0), 0);

  return {
    numero,
    reference,
    libellePeriode,
    dateDebut,
    dateFin,
    delegationsPresentes,
    regionsSpirituelles,
    missionnaires1,
    missionnaires2,
    anciensAbidjan,
    epousesAnciensAbidjan,
    moyenneParticipation,
    heuresInvesties,
    delegationsExterieures,
    abidjanZones,
    interieurLocalites,
    participantsParJour,
    sessions,
  };
}

export { extractPdfText };
