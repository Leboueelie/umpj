"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useFeedback } from "@/components/Feedback";
import { FichesHeader } from "@/components/fiches/FichesHeader";
import { formaterFcfa } from "@/lib/fiches-calc";
import type { FichesStatistiques, ProduitFiche } from "@/lib/fiches";

const vide: FichesStatistiques = {
  periode: { du: null, au: null },
  produitsActifs: 0,
  totaux: { quantiteProduite: 0, quantiteVendue: 0, restant: 0, montantVentes: 0 },
  parProduit: [],
  parVendeur: [],
};

const ETATS: Record<string, string> = {
  objectif_non_defini: "Objectif non défini",
  objectif_atteint: "Objectif atteint",
  production_a_completer: "Production à compléter",
  depassement_ventes: "Dépassement des ventes",
};

export default function FichesStatistiques() {
  const { toast, node } = useFeedback();
  const [produits, setProduits] = useState<ProduitFiche[]>([]);
  const [vendeurs, setVendeurs] = useState<string[]>([]);
  const [data, setData] = useState<FichesStatistiques>(vide);
  const [f, setF] = useState({ produitId: "", vendeur: "", du: "", au: "" });
  const [chargement, setChargement] = useState(true);

  const charger = (filtres = f) => {
    const params = new URLSearchParams();
    if (filtres.produitId) params.set("produitId", filtres.produitId);
    if (filtres.vendeur) params.set("vendeur", filtres.vendeur);
    if (filtres.du) params.set("du", filtres.du);
    if (filtres.au) params.set("au", filtres.au);
    setChargement(true);
    api<FichesStatistiques>(`/api/fiches/statistiques?${params}`)
      .then(setData)
      .catch((e) => toast(e.message || "Statistiques indisponibles.", "error"))
      .finally(() => setChargement(false));
  };

  useEffect(() => {
    Promise.all([
      api<ProduitFiche[]>("/api/fiches/produits"),
      api<string[]>("/api/fiches/vendeurs"),
    ])
      .then(([p, v]) => { setProduits(p); setVendeurs(v); })
      .catch((e) => toast(e.message || "Chargement impossible.", "error"));
    charger();
  }, []);

  const maxMontant = Math.max(1, ...data.parProduit.map((p) => p.montantVentes));

  return (
    <main className="wrap fiches-page">
      <FichesHeader
        titre="Statistiques"
        chapo="Analyse des productions et des ventes par produit, période et vendeur."
      />

      <section className="fiches-section">
        <div className="fiches-section-head">
          <div>
            <span className="fiches-eyebrow">Filtres</span>
            <h2>Périmètre de l'analyse</h2>
            <p>Les cumuls et les répartitions sont recalculés à chaque filtrage.</p>
          </div>
        </div>
        <div className="fiches-toolbar">
          <div className="fiches-field">
            <label htmlFor="st-prod">Produit</label>
            <select id="st-prod" value={f.produitId} onChange={(e) => setF({ ...f, produitId: e.target.value })}>
              <option value="">Tous les produits</option>
              {produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div className="fiches-field">
            <label htmlFor="st-vendeur">Vendeur</label>
            <input id="st-vendeur" list="st-vendeurs" value={f.vendeur} onChange={(e) => setF({ ...f, vendeur: e.target.value })} placeholder="Tous" />
            <datalist id="st-vendeurs">{vendeurs.map((v) => <option key={v} value={v} />)}</datalist>
          </div>
          <div className="fiches-field">
            <label htmlFor="st-du">Du</label>
            <input id="st-du" type="date" value={f.du} onChange={(e) => setF({ ...f, du: e.target.value })} />
          </div>
          <div className="fiches-field">
            <label htmlFor="st-au">Au</label>
            <input id="st-au" type="date" value={f.au} onChange={(e) => setF({ ...f, au: e.target.value })} />
          </div>
          <button className="btn" type="button" onClick={() => charger()}>Analyser</button>
          <button className="btn secondary" type="button" onClick={() => {
            const videF = { produitId: "", vendeur: "", du: "", au: "" };
            setF(videF);
            charger(videF);
          }}>Réinitialiser</button>
        </div>
      </section>

      {chargement ? (
        <div className="fiches-loading">Calcul des statistiques…</div>
      ) : (
        <>
          <section className="fiches-section">
            <div className="fiches-section-head">
              <div>
                <span className="fiches-eyebrow">Synthèse</span>
                <h2>Cumuls du périmètre</h2>
                <p>
                  {data.periode.du || data.periode.au
                    ? `Période : ${data.periode.du || "…"} → ${data.periode.au || "…"}`
                    : "Toutes les périodes"}
                </p>
              </div>
            </div>
            <div className="fiches-hero">
              <div className="fiches-hero-top">
                <span className="fiches-hero-label">Montant total des ventes</span>
                <span className="fiches-hero-unit">FCFA</span>
              </div>
              <div className="fiches-hero-value">
                {new Intl.NumberFormat("fr-FR").format(data.totaux.montantVentes)}
                <span>FCFA</span>
              </div>
              <div className="fiches-hero-metrics">
                <div className="fiches-hero-metric"><b>{data.produitsActifs}</b><span>Produits actifs</span></div>
                <div className="fiches-hero-metric"><b>{new Intl.NumberFormat("fr-FR").format(data.totaux.quantiteProduite)}</b><span>Fiches produites</span></div>
                <div className="fiches-hero-metric"><b>{new Intl.NumberFormat("fr-FR").format(data.totaux.quantiteVendue)}</b><span>Fiches vendues</span></div>
                <div className="fiches-hero-metric">
                  <b className={data.totaux.restant < 0 ? "fiches-negatif" : ""}>
                    {new Intl.NumberFormat("fr-FR").format(data.totaux.restant)}
                  </b>
                  <span>Fiches restantes</span>
                </div>
              </div>
            </div>
          </section>

          <section className="fiches-section">
            <div className="fiches-section-head">
              <div>
                <span className="fiches-eyebrow">Répartition</span>
                <h2>Par produit</h2>
                <p>
                  Indicateurs calculés <strong>sur la sélection</strong> (produit, période, vendeur).
                  Cible et reste : productions − ventes. Manque : aide à la décision, jamais une obligation.
                </p>
              </div>
            </div>
            {data.parProduit.length === 0 ? (
              <div className="fiches-empty">
                <span className="fiches-empty-mark">◇</span>
                <strong>Aucun produit</strong>
                <span>Ajoutez un produit pour voir sa répartition.</span>
              </div>
            ) : (
              <div className="table-scroll fiches-table-wrap">
                <table className="fiches-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th className="num">Prix unit.</th>
                      <th className="num">Cible</th>
                      <th className="num">Produites</th>
                      <th className="num">Vendues</th>
                      <th className="num">Reste</th>
                      <th className="num">Manque</th>
                      <th>État</th>
                      <th className="num">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.parProduit.map((p) => (
                      <tr key={p.produitId}>
                        <td>
                          <strong>{p.nom}</strong>
                          <div className="fiches-bar" title="Part relative du montant des ventes">
                            <i style={{ width: `${Math.round((p.montantVentes / maxMontant) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="num">{formaterFcfa(p.prixUnitaire)}</td>
                        <td className="num">
                          {p.quantiteCible > 0
                            ? new Intl.NumberFormat("fr-FR").format(p.quantiteCible)
                            : <span className="fiches-hint">—</span>}
                        </td>
                        <td className="num">{new Intl.NumberFormat("fr-FR").format(p.quantiteProduite)}</td>
                        <td className="num">{new Intl.NumberFormat("fr-FR").format(p.quantiteVendue)}</td>
                        <td className={`num${p.reste < 0 ? " fiches-negatif" : ""}`} title={p.reste < 0 ? "Ventes supérieures aux productions" : undefined}>
                          {new Intl.NumberFormat("fr-FR").format(p.reste)}
                        </td>
                        <td className="num">
                          {p.manque === null
                            ? <span className="fiches-hint">Non défini</span>
                            : new Intl.NumberFormat("fr-FR").format(p.manque)}
                        </td>
                        <td><span className={`fiches-etat ${p.etat}`}>{ETATS[p.etat] ?? p.etat}</span></td>
                        <td className="num money">{formaterFcfa(p.montantVentes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="fiches-section">
            <div className="fiches-section-head">
              <div>
                <span className="fiches-eyebrow">Contribution</span>
                <h2>Performances des vendeurs</h2>
                <p>Chaque ligne correspond à un membre ayant enregistré au moins une vente.</p>
              </div>
            </div>
            {data.parVendeur.length === 0 ? (
              <div className="fiches-empty">
                <span className="fiches-empty-mark">↘</span>
                <strong>Aucune vente sur ce périmètre</strong>
                <span>Les performances apparaîtront après les premières ventes.</span>
              </div>
            ) : (
              <div className="table-scroll fiches-table-wrap">
                <table className="fiches-table">
                  <thead>
                    <tr>
                      <th>Vendeur</th>
                      <th className="num">Ventes</th>
                      <th className="num">Fiches vendues</th>
                      <th className="num">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.parVendeur.map((v) => (
                      <tr key={v.vendeur}>
                        <td><strong>{v.vendeur}</strong></td>
                        <td className="num">{v.nbVentes}</td>
                        <td className="num">{new Intl.NumberFormat("fr-FR").format(v.quantiteVendue)}</td>
                        <td className="num money">{formaterFcfa(v.montantVentes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {node}
    </main>
  );
}
