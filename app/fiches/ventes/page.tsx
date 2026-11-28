"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useFeedback } from "@/components/Feedback";
import { FichesHeader } from "@/components/fiches/FichesHeader";
import { validerVente, calculerMontant, formaterFcfa, normaliserTexte, dateAffichage } from "@/lib/fiches-calc";
import type { ProduitFiche, VenteFiche } from "@/lib/fiches";

type Form = {
  produitId: string;
  quantite: string;
  prixUnitaire: string;
  dateVente: string;
  vendeur: string;
  observation: string;
};

const aujourdHui = () => new Date().toISOString().slice(0, 10);

export default function FichesVentes() {
  const { confirm, toast, node } = useFeedback();
  const [produits, setProduits] = useState<ProduitFiche[]>([]);
  const [lignes, setLignes] = useState<VenteFiche[]>([]);
  const [vendeurs, setVendeurs] = useState<string[]>([]);
  const [chargement, setChargement] = useState(true);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [form, setForm] = useState<Form>({
    produitId: "", quantite: "", prixUnitaire: "", dateVente: aujourdHui(), vendeur: "", observation: "",
  });
  const [f, setF] = useState({ produitId: "", vendeur: "", du: "", au: "" });
  const [editId, setEditId] = useState<string | null>(null);

  const charger = (filtres = f) => {
    const params = new URLSearchParams();
    if (filtres.produitId) params.set("produitId", filtres.produitId);
    if (filtres.vendeur) params.set("vendeur", filtres.vendeur);
    if (filtres.du) params.set("du", filtres.du);
    if (filtres.au) params.set("au", filtres.au);
    setChargement(true);
    api<VenteFiche[]>(`/api/fiches/ventes?${params}`)
      .then(setLignes)
      .catch((e) => toast(e.message || "Historique indisponible.", "error"))
      .finally(() => setChargement(false));
  };

  useEffect(() => {
    Promise.all([
      api<ProduitFiche[]>("/api/fiches/produits?actif=1"),
      api<string[]>("/api/fiches/vendeurs"),
    ])
      .then(([p, v]) => {
        setProduits(p);
        setVendeurs(v);
        const first = p[0];
        setForm((s) => ({
          ...s,
          produitId: s.produitId || first?.id || "",
          prixUnitaire: s.prixUnitaire || (first ? String(first.prixUnitaire) : ""),
        }));
      })
      .catch((e) => toast(e.message || "Chargement impossible.", "error"));
    charger();
  }, []);

  const maj = (k: keyof Form, v: string) => {
    setForm((s) => {
      const next = { ...s, [k]: v };
      // Le prix est pré-rempli depuis le catalogue mais reste modifiable :
      // le prix appliqué est conservé dans l'historique de la vente.
      if (k === "produitId") {
        const p = produits.find((x) => x.id === v);
        next.prixUnitaire = p ? String(p.prixUnitaire) : "";
      }
      return next;
    });
  };

  const quantite = Number(form.quantite);
  const prix = Number(form.prixUnitaire);
  const montantCalcule = Number.isSafeInteger(quantite) && quantite > 0 && Number.isSafeInteger(prix) && prix >= 0
    ? calculerMontant(quantite, prix)
    : 0;

  const ouvrirVente = (v: VenteFiche) => {
    setEditId(v.id);
    setForm({
      produitId: v.produitId,
      quantite: String(v.quantite),
      prixUnitaire: String(v.prixUnitaire),
      dateVente: dateAffichage(v.dateVente),
      vendeur: v.vendeur,
      observation: v.observation,
    });
    setErreurs([]);
  };

  const reinitialiser = () => {
    setEditId(null);
    setForm({ produitId: produits[0]?.id || "", quantite: "", prixUnitaire: produits[0] ? String(produits[0].prixUnitaire) : "", dateVente: aujourdHui(), vendeur: "", observation: "" });
    setErreurs([]);
  };

  const supprimerVente = async (v: VenteFiche) => {
    const ok = await confirm(`Supprimer la vente de ${v.quantite} fiches (${formaterFcfa(v.montant)}) ? Le solde sera recalculé.`, "Supprimer");
    if (!ok) return;
    try {
      await api(`/api/fiches/ventes/${v.id}`, { method: "DELETE" });
      toast("Vente supprimée.", "success");
      charger();
    } catch (e: any) { toast(e.message || "Suppression refusée.", "error"); }
  };

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validerVente(form);
    setErreurs(err);
    if (err.length) return;
    setSauvegarde(true);
    try {
      if (editId) {
        const ok = await confirm("Valider la correction de cette vente ? Le solde sera recalculé.", "Confirmer");
        if (!ok) return;
        await api(`/api/fiches/ventes/${editId}`, { method: "PUT", body: JSON.stringify(form) });
        toast("Vente modifiée.", "success");
      } else {
        await api("/api/fiches/ventes", { method: "POST", body: JSON.stringify(form) });
        toast("Vente enregistrée.", "success");
      }
      reinitialiser();
      charger();
      api<string[]>("/api/fiches/vendeurs").then(setVendeurs).catch(() => {});
    } catch (e: any) {
      toast(e.message || "Enregistrement impossible.", "error");
    } finally {
      setSauvegarde(false);
    }
  };

  const total = lignes.reduce((s, x) => s + x.montant, 0);
  const quantiteTotale = lignes.reduce((s, x) => s + x.quantite, 0);

  return (
    <main className="wrap fiches-page">
      <FichesHeader
        titre="Ventes"
        chapo="Enregistrez les ventes réalisées par les membres du ministère. Le montant est calculé automatiquement."
      />

      <section className="fiches-section">
        <div className="fiches-section-head">
          <div>
            <span className="fiches-eyebrow">Saisie</span>
            <h2>{editId ? "Modifier la vente" : "Nouvelle vente"}</h2>
            <p>Le vendeur est un membre de la famille ministérielle : aucun compte n'est nécessaire.</p>
          </div>
        </div>

        <form className="fiches-form" onSubmit={soumettre}>
          <div className="fiches-grid">
            <div className="fiches-field">
              <label htmlFor="vte-produit">Produit vendu</label>
              <select id="vte-produit" value={form.produitId} onChange={(e) => maj("produitId", e.target.value)}>
                <option value="">— Choisir un produit —</option>
                {produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
            </div>
            <div className="fiches-field">
              <label htmlFor="vte-quantite">Quantité vendue</label>
              <input id="vte-quantite" type="number" min="1" step="1" value={form.quantite} onChange={(e) => maj("quantite", e.target.value)} placeholder="Ex. 4" />
            </div>
            <div className="fiches-field">
              <label htmlFor="vte-prix">Prix unitaire appliqué (FCFA)</label>
              <input id="vte-prix" type="number" min="0" step="1" value={form.prixUnitaire} onChange={(e) => maj("prixUnitaire", e.target.value)} placeholder="25" />
              <span className="fiches-hint">Prérempli selon le catalogue, modifiable pour cette vente.</span>
            </div>
            <div className="fiches-field">
              <label htmlFor="vte-date">Date de vente</label>
              <input id="vte-date" type="date" value={form.dateVente} onChange={(e) => maj("dateVente", e.target.value)} />
            </div>
            <div className="fiches-field">
              <label htmlFor="vte-vendeur">Vendeur</label>
              <input id="vte-vendeur" list="vendeurs-list" value={form.vendeur} onChange={(e) => maj("vendeur", e.target.value)} placeholder="Nom du membre" />
              <datalist id="vendeurs-list">
                {vendeurs.map((v) => <option key={v} value={v} />)}
              </datalist>
              <span className="fiches-hint">Saisie libre — les noms déjà utilisés sont proposés.</span>
            </div>
            <div className="fiches-field">
              <label htmlFor="vte-obs">Observation (facultative)</label>
              <input id="vte-obs" value={form.observation} onChange={(e) => maj("observation", e.target.value)} placeholder="Précision utile" />
            </div>
          </div>

          <div className="fiches-computed" style={{ marginTop: 18 }}>
            <span>Montant de la vente</span>
            <strong>{formaterFcfa(montantCalcule)}</strong>
          </div>

          {erreurs.length > 0 && <p className="err">{erreurs.join(" · ")}</p>}
          <div className="fiches-form-actions">
            <button className="btn" type="submit" disabled={sauvegarde}>
              {sauvegarde ? "Enregistrement…" : editId ? "Enregistrer la modification" : "Enregistrer la vente"}
            </button>
            {editId && <button className="btn secondary" type="button" onClick={reinitialiser}>Annuler</button>}
            <button className="btn secondary" type="button" onClick={() => charger()}>Actualiser</button>
          </div>
        </form>
      </section>

      <section className="fiches-section">
        <div className="fiches-section-head">
          <div>
            <span className="fiches-eyebrow">Historique</span>
            <h2>Ventes enregistrées</h2>
            <p>
              {lignes.length} vente(s) · {new Intl.NumberFormat("fr-FR").format(quantiteTotale)} fiches ·{" "}
              <strong style={{ color: "var(--f-accent-deep)" }}>{formaterFcfa(total)}</strong>
            </p>
          </div>
        </div>

        <div className="fiches-toolbar">
          <div className="fiches-field">
            <label htmlFor="vf-prod">Produit</label>
            <select id="vf-prod" value={f.produitId} onChange={(e) => setF({ ...f, produitId: e.target.value })}>
              <option value="">Tous les produits</option>
              {produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div className="fiches-field">
            <label htmlFor="vf-vendeur">Vendeur</label>
            <input id="vf-vendeur" list="vendeurs-list" value={f.vendeur} onChange={(e) => setF({ ...f, vendeur: e.target.value })} placeholder="Tous" />
          </div>
          <div className="fiches-field">
            <label htmlFor="vf-du">Du</label>
            <input id="vf-du" type="date" value={f.du} onChange={(e) => setF({ ...f, du: e.target.value })} />
          </div>
          <div className="fiches-field">
            <label htmlFor="vf-au">Au</label>
            <input id="vf-au" type="date" value={f.au} onChange={(e) => setF({ ...f, au: e.target.value })} />
          </div>
          <button className="btn" type="button" onClick={() => charger()}>Filtrer</button>
          <button className="btn secondary" type="button" onClick={() => {
            const vide = { produitId: "", vendeur: "", du: "", au: "" };
            setF(vide);
            charger(vide);
          }}>Réinitialiser</button>
        </div>

        {chargement ? (
          <div className="fiches-loading">Chargement de l'historique…</div>
        ) : lignes.length === 0 ? (
          <div className="fiches-empty">
            <span className="fiches-empty-mark">↘</span>
            <strong>Aucune vente</strong>
            <span>Aucune opération ne correspond à ces filtres.</span>
          </div>
        ) : (
          <div className="table-scroll fiches-table-wrap">
            <table className="fiches-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Produit</th>
                  <th className="num">Qté</th>
                  <th className="num">Prix unit.</th>
                  <th className="num">Montant</th>
                  <th>Vendeur</th>
                  <th>Observation</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((v) => (
                  <tr key={v.id}>
                    <td className="date">{dateAffichage(v.dateVente)}</td>
                    <td><strong>{v.produitNom}</strong></td>
                    <td className="num">{v.quantite}</td>
                    <td className="num">{formaterFcfa(v.prixUnitaire)}</td>
                    <td className="num money">{formaterFcfa(v.montant)}</td>
                    <td>{normaliserTexte(v.vendeur)}</td>
                    <td>{v.observation ? <span className="sub" style={{ marginTop: 0 }}>{v.observation}</span> : "—"}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn secondary" type="button" onClick={() => ouvrirVente(v)}>Modifier</button>
                        <button className="btn danger" type="button" onClick={() => supprimerVente(v)}>Supprimer</button>
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
