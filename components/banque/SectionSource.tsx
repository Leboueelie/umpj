"use client";

import type { ReactNode } from "react";
import { etatDonnees, type Indicateur } from "./logique-banque";

/**
 * Présentation d'une source de la Banque (mission B4 §6.4) : mêmes états
 * pour les trois sources, indicateurs propres à chacune (contrats
 * différents), aucun calcul d'agrégat — les valeurs viennent du moteur.
 */
export type EtatSection = "attente" | "chargement" | "donnees" | "erreur";

interface SectionSourceProps {
  titre: string;
  sousTitre: string;
  etat: EtatSection;
  /** État « aucune donnée » déduit des données fournies (indépendant par source). */
  nbTotal: number | null | undefined;
  indicateurs: Indicateur[];
  /** Libellé des comptes : retenues / fournies au moteur sur la période. */
  retenues: number | undefined;
  texteVide: string;
  messageErreur?: string | null;
  anomalies?: ReactNode;
}

export function SectionSource({
  titre,
  sousTitre,
  etat,
  nbTotal,
  indicateurs,
  retenues,
  texteVide,
  messageErreur,
  anomalies,
}: SectionSourceProps) {
  const donnees = etatDonnees(nbTotal);

  return (
    <section className="card">
      <div className="banque-section-titre">
        <div>
          <h3 style={{ margin: 0 }}>{titre}</h3>
          <div className="section-desc" style={{ marginBottom: 0 }}>
            {sousTitre}
          </div>
        </div>
        {etat === "donnees" && retenues !== undefined && (
          <span className="cnt">
            {retenues} retenue{retenues !== 1 ? "s" : ""} sur {nbTotal} donnée
            {nbTotal !== 1 ? "s" : ""} fournie{nbTotal !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {etat === "attente" && (
        <p className="empty">En attente d&apos;une consultation.</p>
      )}
      {etat === "chargement" && <p className="empty">Chargement…</p>}
      {etat === "erreur" && (
        <div className="err">{messageErreur || "Échec de la consultation."}</div>
      )}
      {etat === "donnees" && donnees === "vide" && (
        <div className="empty">{texteVide}</div>
      )}
      {etat === "donnees" && donnees === "donnees" && (
        <>
          <div className="banque-indics">
            {indicateurs.map((i) => (
              <div className="banque-indic" key={i.label}>
                <span className="v">{i.valeur}</span>
                <span className="l">{i.label}</span>
              </div>
            ))}
          </div>
          {anomalies}
        </>
      )}
    </section>
  );
}
