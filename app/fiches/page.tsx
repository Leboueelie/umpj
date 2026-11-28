"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useFeedback } from "@/components/Feedback";
import { FichesHeader } from "@/components/fiches/FichesHeader";
import { formaterFcfa, dateAffichage } from "@/lib/fiches-calc";
import type { FichesIndicateurs, ProductionFiche, VenteFiche } from "@/lib/fiches";

const ETATS: Record<string, string> = {
  objectif_non_defini: "Objectif non défini",
  objectif_atteint: "Objectif atteint",
  production_a_completer: "Production à compléter",
  depassement_ventes: "Dépassement des ventes",
};

function jour(iso: string) {
  const d = new Date(dateAffichage(iso) + "T12:00:00");
  return {
    j: String(d.getDate()).padStart(2, "0"),
    m: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d).replace(".", ""),
  };
}

export default function FichesDashboard() {
  const { toast, node } = useFeedback();
  const [data, setData] = useState<FichesIndicateurs | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    api<FichesIndicateurs>("/api/fiches/stats")
      .then(setData)
      .catch((e) => toast(e.message || "Impossible de charger les indicateurs.", "error"))
      .finally(() => setChargement(false));
  }, []);

  return (
    <main className="wrap fiches-page">
      <FichesHeader
        titre="Suivi des fiches"
        chapo="Productions et ventes du ministère — une lecture claire, sans comptabilité complexe."
      />

      {chargement ? (
        <div className="fiches-loading">Chargement des indicateurs…</div>
      ) : data ? (
        <>
          <section className="fiches-hero">
            <div className="fiches-hero-top">
              <span className="fiches-hero-label">Montant total des ventes</span>
              <span className="fiches-hero-unit">FCFA</span>
            </div>
            <div className="fiches-hero-value">
              {new Intl.NumberFormat("fr-FR").format(data.montantVentes)}
              <span>FCFA</span>
            </div>
            <div className="fiches-hero-metrics">
              <div className="fiches-hero-metric">
                <b>{data.produitsActifs}</b>
                <span>Produits actifs</span>
              </div>
              <div className="fiches-hero-metric">
                <b>{new Intl.NumberFormat("fr-FR").format(data.quantiteProduite)}</b>
                <span>Fiches produites</span>
              </div>
              <div className="fiches-hero-metric">
                <b>{new Intl.NumberFormat("fr-FR").format(data.quantiteVendue)}</b>
                <span>Fiches vendues</span>
              </div>
              <div className="fiches-hero-metric">
                <b className={data.restant < 0 ? "fiches-negatif" : ""}>
                  {new Intl.NumberFormat("fr-FR").format(data.restant)}
                </b>
                <span>Fiches restantes</span>
              </div>
            </div>
          </section>

          {data.produitsACompler.length > 0 && (
            <section className="fiches-section" style={{ marginTop: 28 }}>
              <div className="fiches-section-head">
                <div>
                  <span className="fiches-eyebrow">Aide à la décision</span>
                  <h2>Production à compléter</h2>
                  <p>
                    {data.produitsACompler.length} produit(s) avec un objectif défini et un manque
                    calculé sur les cumuls globaux. Indicateur informatif : aucune production n'est imposée.
                  </p>
                </div>
                <Link href="/fiches/statistiques" className="btn secondary">Voir les statistiques</Link>
              </div>
              <div className="table-scroll fiches-table-wrap">
                <table className="fiches-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th className="num">Cible</th>
                      <th className="num">Produites</th>
                      <th className="num">Vendues</th>
                      <th className="num">Reste</th>
                      <th className="num">Manque</th>
                      <th>État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.produitsACompler.map((p) => (
                      <tr key={p.produitId}>
                        <td><strong>{p.nom}</strong></td>
                        <td className="num">{new Intl.NumberFormat("fr-FR").format(p.quantiteCible)}</td>
                        <td className="num">{new Intl.NumberFormat("fr-FR").format(p.quantiteProduite)}</td>
                        <td className="num">{new Intl.NumberFormat("fr-FR").format(p.quantiteVendue)}</td>
                        <td className={`num${p.reste < 0 ? " fiches-negatif" : ""}`}>
                          {new Intl.NumberFormat("fr-FR").format(p.reste)}
                        </td>
                        <td className="num money">{p.manque === null ? "—" : new Intl.NumberFormat("fr-FR").format(p.manque)}</td>
                        <td><span className={`fiches-etat ${p.etat}`}>{ETATS[p.etat] ?? p.etat}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="fiches-section" style={{ marginTop: 28 }}>
            <div className="fiches-section-head">
              <div>
                <span className="fiches-eyebrow">Activité récente</span>
                <h2>Dernières opérations</h2>
                <p>Les cinq mouvements les plus récents de chaque registre.</p>
              </div>
            </div>

            <div className="fiches-cols">
              <div className="fiches-panel">
                <div className="fiches-panel-head">
                  <h3>Productions</h3>
                  <Link href="/fiches/productions">Voir tout →</Link>
                </div>
                {data.dernieresProductions.length === 0 ? (
                  <div className="fiches-empty" style={{ marginTop: 10 }}>
                    <span className="fiches-empty-mark">↥</span>
                    <strong>Aucune production enregistrée</strong>
                    <span>Les dernières productions apparaîtront ici.</span>
                  </div>
                ) : (
                  <ul className="fiches-activity">
                    {data.dernieresProductions.map((p: ProductionFiche) => {
                      const d = jour(p.dateProduction);
                      return (
                        <li key={p.id}>
                          <span className="fiches-act-date"><b>{d.j}</b><span>{d.m}</span></span>
                          <span className="fiches-act-main">
                            <strong>{p.produitNom}</strong>
                            <small>{p.responsable}{p.observation ? ` · ${p.observation}` : ""}</small>
                          </span>
                          <span className="fiches-act-val">+{p.quantite}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="fiches-panel">
                <div className="fiches-panel-head">
                  <h3>Ventes</h3>
                  <Link href="/fiches/ventes">Voir tout →</Link>
                </div>
                {data.dernieresVentes.length === 0 ? (
                  <div className="fiches-empty" style={{ marginTop: 10 }}>
                    <span className="fiches-empty-mark">↘</span>
                    <strong>Aucune vente enregistrée</strong>
                    <span>Les dernières ventes apparaîtront ici.</span>
                  </div>
                ) : (
                  <ul className="fiches-activity">
                    {data.dernieresVentes.map((v: VenteFiche) => {
                      const d = jour(v.dateVente);
                      return (
                        <li key={v.id}>
                          <span className="fiches-act-date"><b>{d.j}</b><span>{d.m}</span></span>
                          <span className="fiches-act-main">
                            <strong>{v.produitNom}</strong>
                            <small>{v.vendeur} · {v.quantite} ex.</small>
                          </span>
                          <span className="fiches-act-val vendu">{formaterFcfa(v.montant)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <section className="fiches-section">
            <div className="fiches-section-head">
              <div>
                <span className="fiches-eyebrow">Accès rapide</span>
                <h2>Continuer</h2>
              </div>
            </div>
            <div className="fiches-actions">
              <Link href="/fiches/productions" className="fiches-action">
                Enregistrer une production <span className="fiches-action-arrow">→</span>
              </Link>
              <Link href="/fiches/ventes" className="fiches-action">
                Enregistrer une vente <span className="fiches-action-arrow">→</span>
              </Link>
              <Link href="/fiches/produits" className="fiches-action">
                Gérer les produits <span className="fiches-action-arrow">→</span>
              </Link>
              <Link href="/fiches/statistiques" className="fiches-action">
                Consulter les statistiques <span className="fiches-action-arrow">→</span>
              </Link>
            </div>
            <p className="fiches-note">
              Les montants sont exprimés en <b>FCFA</b>. Le module enregistre les quantités produites et vendues ;
              il ne suit ni stocks physiques, ni dépôts, ni dettes.
            </p>
          </section>
        </>
      ) : (
        <div className="fiches-empty">
          <strong>Indicateurs indisponibles</strong>
          <span>Rechargez la page pour réessayer.</span>
        </div>
      )}
      {node}
    </main>
  );
}
