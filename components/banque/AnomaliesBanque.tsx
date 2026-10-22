"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { AnomalieBanque, LigneNonEvaluable } from "@/lib/banque";
import {
  AIDE_CATEGORIES,
  LIBELLES_CATEGORIES,
  LIMITE_ANOMALIES,
  limiteSuivante,
  restants,
  texteAnomalie,
  texteNonEvaluable,
} from "./logique-banque";

/**
 * Catégories A, B et C d'une section de la Banque (mission B4 §7) :
 * portée métier exacte, détail lisible seul (UUID et références techniques
 * masqués), affichage initial de 50 éléments puis lots de 50, état vide
 * explicite par catégorie.
 */
interface AnomaliesBanqueProps {
  /** A — anomalies des données fournies au moteur (pas un inventaire exhaustif). */
  anomaliesA: AnomalieBanque[];
  /** B — anomalies des lignes retenues pour la période (sous-ensemble de A). */
  anomaliesB: AnomalieBanque[];
  /** C — lignes à période indéterminable, hors agrégats de période. */
  nonEvaluables: LigneNonEvaluable[];
}

interface BlocProps {
  cle: "a" | "b" | "c";
  total: number;
  limite: number;
  items: ReactNode;
  onSuite: (cle: "a" | "b" | "c") => void;
}

function BlocAnomalies({ cle, total, limite, items, onSuite }: BlocProps) {
  const affichees = Math.min(limite, total);
  const encore = restants(total, affichees);
  return (
    <div className={`banque-anom-cat banque-anom-${cle}`}>
      <h4>{LIBELLES_CATEGORIES[cle]}</h4>
      <p className="banque-anom-aide">{AIDE_CATEGORIES[cle]}</p>
      {total === 0 ? (
        <p className="empty">Aucune anomalie dans cette catégorie.</p>
      ) : (
        <>
          <ul className="banque-anom-liste">{items}</ul>
          <div className="banque-anom-pied">
            <span>
              {affichees} affichée{affichees > 1 ? "s" : ""} sur {total}
            </span>
            {encore > 0 && (
              <button className="btn secondary" type="button" onClick={() => onSuite(cle)}>
                Afficher les anomalies suivantes
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function AnomaliesBanque({
  anomaliesA,
  anomaliesB,
  nonEvaluables,
}: AnomaliesBanqueProps) {
  const [limites, setLimites] = useState<Record<"a" | "b" | "c", number>>({
    a: LIMITE_ANOMALIES,
    b: LIMITE_ANOMALIES,
    c: LIMITE_ANOMALIES,
  });

  function suite(cle: "a" | "b" | "c") {
    const total =
      cle === "a" ? anomaliesA.length : cle === "b" ? anomaliesB.length : nonEvaluables.length;
    setLimites((l) => ({ ...l, [cle]: limiteSuivante(l[cle], total) }));
  }

  return (
    <div className="banque-anom-cats">
      <BlocAnomalies
        cle="a"
        total={anomaliesA.length}
        limite={limites.a}
        onSuite={suite}
        items={anomaliesA.slice(0, limites.a).map((an, i) => (
          <li key={i}>{texteAnomalie(an)}</li>
        ))}
      />
      <BlocAnomalies
        cle="b"
        total={anomaliesB.length}
        limite={limites.b}
        onSuite={suite}
        items={anomaliesB.slice(0, limites.b).map((an, i) => (
          <li key={i}>{texteAnomalie(an)}</li>
        ))}
      />
      <BlocAnomalies
        cle="c"
        total={nonEvaluables.length}
        limite={limites.c}
        onSuite={suite}
        items={nonEvaluables.slice(0, limites.c).map((l, i) => (
          <li key={i}>{texteNonEvaluable(l)}</li>
        ))}
      />
    </div>
  );
}
