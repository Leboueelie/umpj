"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useFeedback } from "@/components/Feedback";
import { FichesHeader } from "@/components/fiches/FichesHeader";
import { formaterFcfa, dateAffichage, validerDepense, CATEGORIES_DEPENSE } from "@/lib/fiches-calc";
import type { DepenseFiche, MouvementCaisse, TotauxCaisse } from "@/lib/fiches";

type Form = {
  motif: string;
  montant: string;
  dateDepense: string;
  responsable: string;
  categorie: string;
  observation: string;
};

const vide: TotauxCaisse = { totalVentes: 0, totalDepenses: 0, soldeDisponible: 0 };
const aujourdHui = () => new Date().toISOString().slice(0, 10);

const LIBELLES_CATEGORIE: Record<string, string> = {
  impression: "Impression",
  papier: "Papier",
  transport: "Transport",
  fournitures: "Fournitures",
  communication: "Communication",
  entretien: "Entretien",
  autres: "Autres",
};

export default function FichesCaisse() {
  const { confirm, toast, node } = useFeedback();
  const [caisse, setCaisse] = useState<TotauxCaisse>(vide);
  const [historique, setHistorique] = useState<MouvementCaisse[]>([]);
  const [chargement, setChargement] = useState(true);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [form, setForm] = useState<Form>({
    motif: "", montant: "", dateDepense: aujourdHui(), responsable: "", categorie: "impression", observation: "",
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState({ type: "", du: "", au: "", q: "" });

  const charger = (filtres = f) => {
    const params = new URLSearchParams();
    if (filtres.type) params.set("type", filtres.type);
    if (filtres.du) params.set("du", filtres.du);
    if (filtres.au) params.set("au", filtres.au);
    if (filtres.q) params.set("q", filtres.q);
    setChargement(true);
    Promise.all([
      api<TotauxCaisse>("/api/fiches/caisse"),
      api<MouvementCaisse[]>(`/api/fiches/caisse/historique?${params}`),
    ])
      .then(([c, h]) => { setCaisse(c); setHistorique(h); })
      .catch((e) => toast(e.message || "Chargement de la caisse impossible.", "error"))
      .finally(() => setChargement(false));
  };

  useEffect(() => { charger(); }, []);

  const maj = (k: keyof Form, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const ouvrir = (d?: DepenseFiche) => {
    setEditId(d?.id ?? null);
    setForm(d ? {
      motif: d.motif,
      montant: String(d.montant),
      dateDepense: dateAffichage(d.dateDepense),
      responsable: d.responsable,
      categorie: d.categorie,
      observation: d.observation,
    } : { motif: "", montant: "", dateDepense: aujourdHui(), responsable: "", categorie: "impression", observation: "" });
    setErreurs([]);
  };

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validerDepense(form);
    setErreurs(err);
    if (err.length) return;
    const ok = await confirm(
      editId
        ? `Modifier la dépense « ${form.motif} » (${formaterFcfa(Number(form.montant))}) ?`
        : `Enregistrer la dépense « ${form.motif} » (${formaterFcfa(Number(form.montant))}) ?`,
      "Confirmer"
    );
    if (!ok) return;
    setSauvegarde(true);
    try {
      if (editId) {
        await api(`/api/fiches/depenses/${editId}`, { method: "PUT", body: JSON.stringify(form) });
        toast("Dépense modifiée.", "success");
      } else {
        await api("/api/fiches/depenses", { method: "POST", body: JSON.stringify(form) });
        toast("Dépense enregistrée.", "success");
      }
      setEditId(null);
      setForm({ motif: "", montant: "", dateDepense: aujourdHui(), responsable: "", categorie: "impression", observation: "" });
      charger();
    } catch (e: any) {
      toast(e.message || "Enregistrement impossible.", "error");
    } finally { setSauvegarde(false); }
  };

  const supprimerDepense = async (id: string) => {
    try {
      const d = await api<DepenseFiche>(`/api/fiches/depenses/${id}`);
      const ok = await confirm(`Supprimer la dépense « ${d.motif} » (${formaterFcfa(d.montant)}) ?`, "Supprimer");
      if (!ok) return;
      await api(`/api/fiches/depenses/${id}`, { method: "DELETE" });
      toast("Dépense supprimée.", "success");
      charger();
    } catch (e: any) { toast(e.message || "Suppression impossible.", "error"); }
  };

  const supprimerVente = async (id: string) => {
    const ok = await confirm("Supprimer cette vente ? Le solde sera recalculé.", "Supprimer");
    if (!ok) return;
    try {
      await api(`/api/fiches/ventes/${id}`, { method: "DELETE" });
      toast("Vente supprimée.", "success");
      charger();
    } catch (e: any) { toast(e.message || "Suppression refusée.", "error"); }
  };

  return (
    <main className="wrap fiches-page">
      <FichesHeader titre="Caisse des fiches" chapo="L'argent disponible provient uniquement des ventes enregistrées. Les dépenses sont prélevées sur ce solde." />

      <section className="fiches-section">
        <div className="fiches-section-head">
          <div>
            <span className="fiches-eyebrow">Situation financière</span>
            <h2>Solde disponible</h2>
            <p>Solde = total des ventes − total des dépenses. Aucun stock ni objectif de production n'intervient.</p>
          </div>
        </div>
        <div className="fiches-hero">
          <div className="fiches-hero-top">
            <span className="fiches-hero-label">Solde disponible</span>
            <span className="fiches-hero-unit">FCFA</span>
          </div>
          <div className="fiches-hero-value">
            {new Intl.NumberFormat("fr-FR").format(caisse.soldeDisponible)}
            <span>FCFA</span>
          </div>
          <div className="fiches-hero-metrics">
            <div className="fiches-hero-metric"><b>{formaterFcfa(caisse.totalVentes)}</b><span>Total des ventes</span></div>
            <div className="fiches-hero-metric"><b>{formaterFcfa(caisse.totalDepenses)}</b><span>Total des dépenses</span></div>
          </div>
        </div>
      </section>

      <section className="fiches-section">
        <div className="fiches-section-head">
          <div>
            <span className="fiches-eyebrow">Caisse</span>
            <h2>{editId ? "Modifier la dépense" : "Nouvelle dépense"}</h2>
            <p>Une dépense n'est rattachée à aucun produit.</p>
          </div>
        </div>
        <form className="fiches-form" onSubmit={soumettre}>
          <div className="fiches-grid">
            <div className="fiches-field">
              <label htmlFor="dep-motif">Motif</label>
              <input id="dep-motif" value={form.motif} onChange={(e) => maj("motif", e.target.value)} placeholder="Ex. Impression des fiches" />
            </div>
            <div className="fiches-field">
              <label htmlFor="dep-montant">Montant (FCFA)</label>
              <input id="dep-montant" type="number" min="1" step="1" value={form.montant} onChange={(e) => maj("montant", e.target.value)} placeholder="5 000" />
              <span className="fiches-hint">Solde disponible : {formaterFcfa(caisse.soldeDisponible)}</span>
            </div>
            <div className="fiches-field">
              <label htmlFor="dep-date">Date</label>
              <input id="dep-date" type="date" value={form.dateDepense} onChange={(e) => maj("dateDepense", e.target.value)} />
            </div>
            <div className="fiches-field">
              <label htmlFor="dep-resp">Responsable</label>
              <input id="dep-resp" value={form.responsable} onChange={(e) => maj("responsable", e.target.value)} placeholder="Nom du responsable" />
            </div>
            <div className="fiches-field">
              <label htmlFor="dep-cat">Catégorie</label>
              <select id="dep-cat" value={form.categorie} onChange={(e) => maj("categorie", e.target.value)}>
                {CATEGORIES_DEPENSE.map((c) => <option key={c} value={c}>{LIBELLES_CATEGORIE[c]}</option>)}
              </select>
            </div>
            <div className="fiches-field">
              <label htmlFor="dep-obs">Observation (facultative)</label>
              <input id="dep-obs" value={form.observation} onChange={(e) => maj("observation", e.target.value)} placeholder="Précision utile" />
            </div>
          </div>
          {erreurs.length > 0 && <p className="err">{erreurs.join(" · ")}</p>}
          <div className="fiches-form-actions">
            <button className="btn" type="submit" disabled={sauvegarde}>
              {sauvegarde ? "Enregistrement…" : editId ? "Enregistrer la modification" : "Enregistrer la dépense"}
            </button>
            {editId && <button className="btn secondary" type="button" onClick={() => ouvrir()}>Annuler</button>}
            <button className="btn secondary" type="button" onClick={() => charger()}>Actualiser</button>
          </div>
        </form>
      </section>

      <section className="fiches-section">
        <div className="fiches-section-head">
          <div>
            <span className="fiches-eyebrow">Historique</span>
            <h2>Mouvements de caisse</h2>
            <p>Ventes et dépenses, avec le solde disponible après chaque opération.</p>
          </div>
        </div>
        <div className="fiches-toolbar">
          <div className="fiches-field">
            <label htmlFor="hc-type">Type</label>
            <select id="hc-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="">Tous</option>
              <option value="vente">Ventes</option>
              <option value="depense">Dépenses</option>
            </select>
          </div>
          <div className="fiches-field"><label htmlFor="hc-du">Du</label><input id="hc-du" type="date" value={f.du} onChange={(e) => setF({ ...f, du: e.target.value })} /></div>
          <div className="fiches-field"><label htmlFor="hc-au">Au</label><input id="hc-au" type="date" value={f.au} onChange={(e) => setF({ ...f, au: e.target.value })} /></div>
          <div className="fiches-field"><label htmlFor="hc-q">Recherche</label><input id="hc-q" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Motif ou responsable" /></div>
          <button className="btn" type="button" onClick={() => charger()}>Filtrer</button>
          <button className="btn secondary" type="button" onClick={() => {
            const videF = { type: "", du: "", au: "", q: "" };
            setF(videF); charger(videF);
          }}>Réinitialiser</button>
        </div>

        {chargement ? (
          <div className="fiches-loading">Chargement de l'historique…</div>
        ) : historique.length === 0 ? (
          <div className="fiches-empty">
            <span className="fiches-empty-mark">◇</span>
            <strong>Aucun mouvement</strong>
            <span>Enregistrez une vente ou une dépense pour voir l'historique.</span>
          </div>
        ) : (
          <div className="table-scroll fiches-table-wrap">
            <table className="fiches-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Motif</th>
                  <th className="num">Entrée</th>
                  <th className="num">Sortie</th>
                  <th className="num">Solde après</th>
                  <th>Responsable</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {historique.map((m) => (
                  <tr key={m.id}>
                    <td className="date">{dateAffichage(m.date)}</td>
                    <td><span className={`fiches-badge ${m.type === "vente" ? "on" : "off"}`}>{m.type === "vente" ? "Vente" : "Dépense"}</span></td>
                    <td>{m.motif}</td>
                    <td className="num">{m.entree > 0 ? formaterFcfa(m.entree) : "—"}</td>
                    <td className="num">{m.sortie > 0 ? formaterFcfa(m.sortie) : "—"}</td>
                    <td className="num money">{formaterFcfa(m.soldeApres)}</td>
                    <td>{m.responsable}</td>
                    <td>
                      <div className="row-actions">
                        {m.type === "depense" && (
                          <>
                            <button className="btn secondary" type="button" onClick={async () => {
                              const d = await api<DepenseFiche>(`/api/fiches/depenses/${m.referenceId}`);
                              ouvrir(d);
                            }}>Modifier</button>
                            <button className="btn danger" type="button" onClick={() => supprimerDepense(m.referenceId)}>Supprimer</button>
                          </>
                        )}
                        {m.type === "vente" && (
                          <button className="btn danger" type="button" onClick={() => supprimerVente(m.referenceId)}>Supprimer</button>
                        )}
                      </div>
                    </td>
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
