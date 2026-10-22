"use client";

import { formatDateInput } from "@/lib/calc";

/**
 * Sélecteur de période « Du / Au » de la Banque (mission B4 §5).
 * Contrôlé par la page : saisie JJ/MM/AAAA assistée, double soumission
 * bloquée par `enCours`, aucune validation métier ici (logique-banque.ts).
 */
interface PeriodeBanqueProps {
  du: string;
  au: string;
  onDu: (v: string) => void;
  onAu: (v: string) => void;
  onConsulter: () => void;
  onReinitialiser: () => void;
  enCours: boolean;
}

export function PeriodeBanque({
  du,
  au,
  onDu,
  onAu,
  onConsulter,
  onReinitialiser,
  enCours,
}: PeriodeBanqueProps) {
  return (
    <div className="periode-filter" role="group" aria-label="Période de consultation">
      <label>
        Du{" "}
        <input
          type="text"
          inputMode="numeric"
          placeholder="01/01/2026"
          maxLength={10}
          value={du}
          onChange={(e) => onDu(formatDateInput(e.target.value))}
        />
      </label>
      <label>
        Au{" "}
        <input
          type="text"
          inputMode="numeric"
          placeholder="31/12/2026"
          maxLength={10}
          value={au}
          onChange={(e) => onAu(formatDateInput(e.target.value))}
        />
      </label>
      <button className="btn" type="button" onClick={onConsulter} disabled={enCours}>
        {enCours ? "Consultation…" : "Consulter"}
      </button>
      {(du || au) && (
        <button type="button" className="link-btn" onClick={onReinitialiser}>
          Réinitialiser
        </button>
      )}
    </div>
  );
}
