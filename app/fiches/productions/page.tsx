"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useFeedback } from "@/components/Feedback";
import { FichesHeader } from "@/components/fiches/FichesHeader";
import { validerProduction, normaliserTexte, dateAffichage } from "@/lib/fiches-calc";
import type { ProduitFiche, ProductionFiche } from "@/lib/fiches";

type Form = {
  produitId: string;
  quantite: string;
  dateProduction: string;
  responsable: string;
  observation: string;
};

const aujourdHui = () => new Date().toISOString().slice(0, 10);

export default function FichesProductions() {
  const { toast, node } = useFeedback();
  const [produits, setProduits] = useState<ProduitFiche[]>([]);
  const [lignes, setLignes] = useState<ProductionFiche[]>([]);
  const [responsables, setResponsables] = useState<string[]>([]);
  const [chargement, setChargement] = useState(true);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [form, setForm] = useState<Form>({
    produitId: "", quantite: "", dateProduction: aujourdHui(), responsable: "", observation: "",
  });
  const [f, setF] = useState({ produitId: "", du: "", au: "", responsable: "" });

  const charger = (filtres = f) => {
    const params = new URLSearchParams();
    if (filtres.produitId) params.set("produitId", filtres.produitId);
    if (filtres.du) params.set("du", filtres.du);
    if (filtres.au) params.set("au", filtres.au);
    if (filtres.responsable) params.set("responsable", filtres.responsable);
    setChargement(true);
    api<ProductionFiche[]>(`/api/fiches/productions?${params}`)
      .then((r) => {
        setLignes(r);
        setResponsables(Array.from(new Set(r.map((x) => x.responsable))).sort());
      })
      .catch((e) => toast(e.message || "Historique indisponible.", "error"))
      .finally(() => setChargement(false));
  };

  useEffect(() => {
    api<ProduitFiche[]>("/api/fiches/produits?actif=1")
      .then((p) => {
        setProduits(p);
        setForm((s) => ({ ...s, produitId: s.produitId || p[0]?.id || "" }));
      })
      .catch((e) => toast(e.message || "Catalogue indisponible.", "error"));
    charger();
  }, []);

  const maj = (k: keyof Form, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validerProduction(form);
    setErreurs(err);
    if (err.length) return;
    setSauvegarde(true);
    try {
      await api("/api/fiches/productions", { method: "POST", body: JSON.stringify(form) });
      toast("Production enregistrée.", "success");
      setForm((s) => ({ ...s, quantite: "", observation: "" }));
      charger();
    } catch (e: any) {
      toast(e.message || "Enregistrement impossible.", "error");
    } finally {
      setSauvegarde(false);
    }
  };

  const total = lignes.reduce((s, x) => s + x.quantite, 0);

  return (
    <main className="wrap fiches-page">
      <FichesHeader
        titre="Productions"
        chapo="Enregistrez chaque lot de fiches produites et retrouvez l'historique par produit, date ou responsable."
      />

      <section className="fiches-section">
        <div className="fiches-section-head">
          <div>
            <span className="fiches-eyebrow">Saisie</span>
            <h2>Nouvelle production</h2>
            <p>Un même produit peut être enregistré plusieurs fois.</p>
          </div>
        </div>

        <form className="fiches-form" onSubmit={soumettre}>
          <div className="fiches-grid">
            <div className="fiches-field">
              <label htmlFor="prod-produit">Produit</label>
              <select id="prod-produit" value={form.produitId} onChange={(e) => maj("produitId", e.target.value)}>
                <option value="">— Choisir un produit —</option>
                {produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
            </div>
            <div className="fiches-field">
              <label htmlFor="prod-quantite">Quantité produite</label>
              <input id="prod-quantite" type="number" min="1" step="1" value={form.quantite} onChange={(e) => maj("quantite", e.target.value)} placeholder="Ex. 100" />
            </div>
            <div className="fiches-field">
              <label htmlFor="prod-date">Date de production</label>
              <input id="prod-date" type="date" value={form.dateProduction} onChange={(e) => maj("dateProduction", e.target.value)} />
            </div>
            <div className="fiches-field">
              <label htmlFor="prod-resp">Responsable de la production</label>
              <input id="prod-resp" list="resp-list" value={form.responsable} onChange={(e) => maj("responsable", e.target.value)} placeholder="Nom du responsable" />
              <datalist id="resp-list">
                {responsables.map((r) => <option key={r} value={r} />)}
              </datalist>
            </div>
            <div className="fiches-field">
              <label htmlFor="prod-obs">Observation (facultative)</label>
              <input id="prod-obs" value={form.observation} onChange={(e) => maj("observation", e.target.value)} placeholder="Précision utile" />
            </div>
          </div>
          {erreurs.length > 0 && <p className="err">{erreurs.join(" · ")}</p>}
          <div className="fiches-form-actions">
            <button className="btn" type="submit" disabled={sauvegarde}>
              {sauvegarde ? "Enregistrement…" : "Enregistrer la production"}
            </button>
            <button className="btn secondary" type="button" onClick={() => charger()}>Actualiser</button>
          </div>
        </form>
      </section>

      <section className="fiches-section">
        <div className="fiches-section-head">
          <div>
            <span className="fiches-eyebrow">Historique</span>
            <h2>Productions enregistrées</h2>
            <p>{lignes.length} opération(s) · {new Intl.NumberFormat("fr-FR").format(total)} fiches produites sur la sélection.</p>
          </div>
        </div>

        <div className="fiches-toolbar">
          <div className="fiches-field">
            <label htmlFor="flt-prod">Produit</label>
            <select id="flt-prod" value={f.produitId} onChange={(e) => setF({ ...f, produitId: e.target.value })}>
              <option value="">Tous les produits</option>
              {produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
              {lignes.filter((l) => !produits.some((p) => p.id === l.produitId)).map((l) => (
                <option key={l.produitId} value={l.produitId}>{l.produitNom} (inactif)</option>
              ))}
            </select>
          </div>
          <div className="fiches-field">
            <label htmlFor="flt-du">Du</label>
            <input id="flt-du" type="date" value={f.du} onChange={(e) => setF({ ...f, du: e.target.value })} />
          </div>
          <div className="fiches-field">
            <label htmlFor="flt-au">Au</label>
            <input id="flt-au" type="date" value={f.au} onChange={(e) => setF({ ...f, au: e.target.value })} />
          </div>
          <div className="fiches-field">
            <label htmlFor="flt-resp">Responsable</label>
            <input id="flt-resp" value={f.responsable} onChange={(e) => setF({ ...f, responsable: e.target.value })} placeholder="Rechercher" />
          </div>
          <button className="btn" type="button" onClick={() => charger()}>Filtrer</button>
          <button className="btn secondary" type="button" onClick={() => {
            const vide = { produitId: "", du: "", au: "", responsable: "" };
            setF(vide);
            charger(vide);
          }}>Réinitialiser</button>
        </div>

        {chargement ? (
          <div className="fiches-loading">Chargement de l'historique…</div>
        ) : lignes.length === 0 ? (
          <div className="fiches-empty">
            <span className="fiches-empty-mark">↥</span>
            <strong>Aucune production</strong>
            <span>Aucune opération ne correspond à ces filtres.</span>
          </div>
        ) : (
          <div className="table-scroll fiches-table-wrap">
            <table className="fiches-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Produit</th>
                  <th className="num">Quantité</th>
                  <th>Responsable</th>
                  <th>Observation</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id}>
                    <td className="date">{dateAffichage(l.dateProduction)}</td>
                    <td><strong>{l.produitNom}</strong></td>
                    <td className="num">{new Intl.NumberFormat("fr-FR").format(l.quantite)}</td>
                    <td>{normaliserTexte(l.responsable)}</td>
                    <td>{l.observation ? <span className="sub" style={{ marginTop: 0 }}>{l.observation}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {node}
    </main>
  );
}
