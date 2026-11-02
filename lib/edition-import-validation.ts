import type { ImportedEdition } from "./excel";

export type ResultatValidationEdition = {
  erreurs: string[];
  avertissements: string[];
  bloquant: boolean;
  doublon: boolean;
};

function estEntierNonNegatif(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

export function validerEditionImportee(
  ed: ImportedEdition,
  numerosExistants: number[]
): ResultatValidationEdition {
  const erreurs: string[] = [];
  const avertissements: string[] = [];

  // Numéro d'édition (obligatoire, entier ≥ 1)
  if (!ed.numero || !Number.isInteger(ed.numero) || ed.numero < 1) {
    erreurs.push("Numéro d'édition manquant ou invalide (entier ≥ 1).");
  } else if (numerosExistants.includes(ed.numero)) {
    erreurs.push("Ce numéro d'édition existe déjà.");
  }

  // Dates (obligatoires, ISO valides, ordre)
  if (!ed.dateDebut) {
    erreurs.push("Date de début manquante ou invalide (AAAA-MM-JJ).");
  }
  if (!ed.dateFin) {
    erreurs.push("Date de fin manquante ou invalide (AAAA-MM-JJ).");
  }
  if (ed.dateDebut && ed.dateFin && ed.dateDebut > ed.dateFin) {
    erreurs.push("La date de début doit précéder la date de fin.");
  }

  // Champs secondaires : bornes (négatifs interdits)
  const champsBornes: { nom: string; v: number }[] = [
    { nom: "délégations présentes", v: ed.delegationsPresentes },
    { nom: "régions spirituelles", v: ed.regionsSpirituelles },
    { nom: "missionnaires n°1", v: ed.missionnaires1 },
    { nom: "missionnaires n°2", v: ed.missionnaires2 },
    { nom: "anciens d'Abidjan", v: ed.anciensAbidjan },
    { nom: "épouses d'anciens Abidjan", v: ed.epousesAnciensAbidjan },
    { nom: "moyenne de participation", v: ed.moyenneParticipation },
  ];
  for (const c of champsBornes) {
    if (!estEntierNonNegatif(c.v)) {
      erreurs.push(`Le champ « ${c.nom} » doit être un entier ≥ 0 (reçu : ${c.v}).`);
    }
  }

  // Participants par jour
  for (const p of ed.participantsParJour) {
    if (!estEntierNonNegatif(p.participants)) {
      erreurs.push(`Participants par jour invalides (« ${p.jour || "?"} »).`);
    }
  }
  // Sessions
  for (const s of ed.sessions) {
    if (!estEntierNonNegatif(s.nbSessions)) {
      erreurs.push(`Nombre de sessions invalide (date « ${s.date || "?"} »).`);
    }
    if (!estEntierNonNegatif(s.dureeMinutes)) {
      erreurs.push(`Durée invalide (date « ${s.date || "?"} »).`);
    }
    if (!estEntierNonNegatif(s.participants)) {
      erreurs.push(`Participants de session invalides (date « ${s.date || "?"} »).`);
    }
  }

  // Avertissements (non bloquants) — champs facultatifs non renseignés
  const compteursZero: string[] = [];
  if (ed.delegationsPresentes === 0) compteursZero.push("délégations présentes");
  if (ed.regionsSpirituelles === 0) compteursZero.push("régions spirituelles");
  if (ed.missionnaires1 === 0) compteursZero.push("missionnaires n°1");
  if (ed.missionnaires2 === 0) compteursZero.push("missionnaires n°2");
  if (ed.anciensAbidjan === 0) compteursZero.push("anciens d'Abidjan");
  if (ed.epousesAnciensAbidjan === 0) compteursZero.push("épouses d'anciens Abidjan");
  if (compteursZero.length > 0) {
    avertissements.push(`Compteurs non renseignés (0) : ${compteursZero.join(", ")}.`);
  }
  if (ed.moyenneParticipation === 0) {
    avertissements.push("Moyenne de participation non renseignée (0).");
  }
  if (ed.delegationsExterieures.length === 0) {
    avertissements.push("Aucune délégation extérieure enregistrée.");
  }
  if (ed.abidjanZones.length === 0) {
    avertissements.push("Aucune zone d'Abidjan enregistrée.");
  }
  if (ed.interieurLocalites.length === 0) {
    avertissements.push("Aucune localité de l'intérieur enregistrée.");
  }
  if (ed.participantsParJour.length === 0) {
    avertissements.push("Aucun participant par jour enregistré.");
  }
  if (ed.sessions.length === 0) {
    avertissements.push("Aucune session enregistrée.");
  }
  if (
    ed.heuresInvestiesDeclarees !== undefined &&
    ed.heuresInvestiesDeclarees !== ed.heuresInvesties
  ) {
    const fmt = (m: number) =>
      `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
    avertissements.push(
      `Heures investies déclarées (${fmt(ed.heuresInvestiesDeclarees as number)}) ≠ somme des sessions (${fmt(ed.heuresInvesties as number)}) — la somme est retenue.`
    );
  }

  const doublon = erreurs.some((e) => e.includes("existe déjà"));

  return {
    erreurs,
    avertissements,
    bloquant: erreurs.length > 0,
    doublon,
  };
}
