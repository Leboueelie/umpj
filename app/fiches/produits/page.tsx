"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useFeedback } from "@/components/Feedback";
import { FichesHeader } from "@/components/fiches/FichesHeader";
import { formaterFcfa, validerProduit } from "@/lib/fiches-calc";
import type { ProduitFiche } from "@/lib/fiches";

type Form = { nom: string; prixUnitaire: string; quantiteCible: string; description: string };

export default function FichesProduits() {
  const { confirm, toast, node } = useFeedback();
  const [produits, setProduits] = useState<ProduitFiche[]>([]);
  const [chargement, setChargement] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [sauvegarde, setSauvegarde] = useState(false);

  const charger = () => {
    setChargement(true);
    api<ProduitFiche[]>("/api/fiches/produits")
      .then(setProduits)
      .catch((e) => toast(e.message || "Chargement impossible.", "error"))
      .finally(() => setChargement(false));
  };

  useEffect(charger, []);

  const ouvrir = (p?: ProduitFiche) => {
    setEditId(p?.id ?? null);
    setForm(p
      ? { nom: p.nom, prixUnitaire: String(p.prixUnitaire), quantiteCible: String(p.quantiteCible ?? 0), description: p.description }
      : { nom: "", prixUnitaire: "", quantiteCible: "", description: "" });
    setErreurs([]);
  };

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const err = validerProduit(form);
    setErreurs(err);
    if (err.length) return;

    setSauvegarde(true);
    try {
      if (editId) {
        await api(`/api/fiches/produits/${editId}`, { method: "PUT", body: JSON.stringify(form) });
        toast("Produit mis à jour.", "success");
      } else {
        await api("/api/fiches/produits", { method: "POST", body: JSON.stringify(form) });
        toast("Produit créé.", "success");
      }
      setForm(null);
      charger();
    } catch (e: any) {
      toast(e.message || "Enregistrement impossible.", "error");
    } finally {
      setSauvegarde(false);
    }
  };

  const basculer = async (p: ProduitFiche) => {
    const action = p.actif ? "désactiver" : "activer";
    const ok = await confirm(`Voulez-vous ${action} le produit « ${p.nom} » ?`, action === "désactiver" ? "Désactiver" : "Activer");
    if (!ok) return;
    try {
      await api(`/api/fiches/produits/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ actif: !p.actif }),
      });
      toast(p.actif ? "Produit désactivé." : "Produit activé.", "success");
      charger();
    } catch (e: any) {
      toast(e.message || "Modification impossible.", "error");
    }
  };

  const maj = (k: keyof Form, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <main className="wrap fiches-page">
      <FichesHeader
        titre="Catalogue des produits"
        chapo="Les fiches produites par le ministère, leur prix unitaire et leur statut."
      />

      <section className="fiches-section">
        <div className="fiches-section-head">
          <div>
            <span className="fiches-eyebrow">Catalogue dynamique</span>
            <h2>Produits enregistrés</h2>
            <p>Le prix est modifiable à tout moment ; les ventes passées conservent leur prix.</p>
          </div>
          <button className="btn" type="button" onClick={() => ouvrir()}>
            + Nouveau produit
          </button>
        </div>

        {form && (
          <form className="fiches-form" onSubmit={soumettre}>
            <h3 className="fiches-form-title">
              {editId ? "Modifier le produit" : "Nouveau produit"}
            </h3>
            <div className="fiches-grid">
              <div className="fiches-field">
                <label htmlFor="fp-nom">Nom du produit</label>
                <input id="fp-nom" value={form.nom} onChange={(e) => maj("nom", e.target.value)} placeholder="Ex. Hymne du But quinquennal" />
              </div>
              <div className="fiches-field">
                <label htmlFor="fp-prix">Prix unitaire (FCFA)</label>
                <input id="fp-prix" type="number" min="0" step="1" value={form.prixUnitaire} onChange={(e) => maj("prixUnitaire", e.target.value)} placeholder="25" />
              </div>
              <div className="fiches-field">
                <label htmlFor="fp-cible">Quantité cible</label>
                <input id="fp-cible" type="number" min="0" step="1" value={form.quantiteCible} onChange={(e) => maj("quantiteCible", e.target.value)} placeholder="0" />
                <span className="fiches-hint">0 = objectif non défini. Modifiable à tout moment.</span>
              </div>
              <div className="fiches-field">
                <label htmlFor="fp-desc">Description (facultative)</label>
                <input id="fp-desc" value={form.description} onChange={(e) => maj("description", e.target.value)} placeholder="Précision utile" />
              </div>
            </div>
            {erreurs.length > 0 && <p className="err">{erreurs.join(" · ")}</p>}
            <div className="fiches-form-actions">
              <button className="btn" type="submit" disabled={sauvegarde}>
                {sauvegarde ? "Enregistrement…" : editId ? "Enregistrer" : "Créer le produit"}
              </button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)}>Annuler</button>
            </div>
          </form>
        )}

        {chargement ? (
          <div className="fiches-loading">Chargement du catalogue…</div>
        ) : produits.length === 0 ? (
          <div className="fiches-empty">
            <span className="fiches-empty-mark">◇</span>
            <strong>Aucun produit</strong>
            <span>Créez le premier produit pour commencer à enregistrer des opérations.</span>
          </div>
        ) : (
          <div className="table-scroll fiches-table-wrap">
            <table className="fiches-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th className="num">Prix unitaire</th>
                  <th className="num">Cible</th>
                  <th>Statut</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {produits.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.nom}</strong>
                      {p.description && <span className="sub">{p.description}</span>}
                    </td>
                    <td className="num">{formaterFcfa(p.prixUnitaire)}</td>
                    <td className="num">
                      {p.quantiteCible > 0
                        ? new Intl.NumberFormat("fr-FR").format(p.quantiteCible)
                        : <span className="fiches-hint">Non définie</span>}
                    </td>
                    <td>
                      <span className={`fiches-badge ${p.actif ? "on" : "off"}`}>
                        {p.actif ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn secondary" type="button" onClick={() => ouvrir(p)}>Modifier</button>
                        <button className="btn secondary" type="button" onClick={() => basculer(p)}>
                          {p.actif ? "Désactiver" : "Activer"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="fiches-note">
        Un produit désactivé reste dans l'historique mais n'accepte plus de nouvelles productions ni ventes.
        Aucun produit n'est supprimé.
      </p>
      {node}
    </main>
  );
}
