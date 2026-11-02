"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { Jeune } from "@/lib/types";
import { useFeedback } from "@/components/Feedback";
import { api } from "@/lib/api";

const CATEGORIES = [
  { id: "nation", label: "Jeûne Pour la nation" },
  { id: "debut-mois", label: "3 jours debut du mois" },
  { id: "dirigeants", label: "Dirigeants (février et juin)" },
  { id: "crppf", label: "Jeûne pour CRPPF" },
  { id: "ministere", label: "Ministère" },
];

function fmtTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function JeunePage() {
  const [fichiers, setFichiers] = useState<Jeune[]>([]);
  const [activeCategorie, setActiveCategorie] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const { confirm, toast, node } = useFeedback();

  async function loadFichiers(categorie?: string | null) {
    try {
      let url = "/api/jeune";
      if (categorie) url += `?categorie=${encodeURIComponent(categorie)}`;
      const data = await api<Jeune[]>(url);
      setFichiers(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    loadFichiers();
  }, []);

  const nombreParCategorie = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of fichiers) m[f.categorie] = (m[f.categorie] || 0) + 1;
    return m;
  }, [fichiers]);

  const fichiersActifs = useMemo(() => {
    if (!activeCategorie) return [];
    return fichiers.filter((f) => f.categorie === activeCategorie);
  }, [fichiers, activeCategorie]);

  function selectCategorie(categorie: string) {
    setActiveCategorie(categorie);
    loadFichiers(categorie);
  }

  function retourGrille() {
    setActiveCategorie(null);
    loadFichiers();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeCategorie) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("categorie", activeCategorie);
      const r = await fetch("/api/jeune", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast("Fichier uploadé.", "success");
      await loadFichiers(activeCategorie);
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function supprimer(id: string, nom: string) {
    if (!(await confirm(`Supprimer "${nom}" ?`))) return;
    try {
      await api(`/api/jeune/${id}`, { method: "DELETE" });
      toast("Fichier supprimé.", "success");
      await loadFichiers(activeCategorie);
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    }
  }

  function imprimer(id: string) {
    window.open(`/api/jeune/${id}/download`, "_blank");
  }

  const labelCategorie = CATEGORIES.find((c) => c.id === activeCategorie)?.label || "";

  return (
    <main className="wrap">
      <Link href="/" className="back-link">← Accueil</Link>
      <header className="accueil-identite" style={{ marginBottom: 18 }}>
        <img src="/logo.png" alt="" className="accueil-logo" />
        <div>
          <p className="accueil-kicker">Jeûne</p>
          <h1 className="accueil-titre">Jeûne</h1>
          <span className="accueil-filet" aria-hidden="true" />
          <p className="accueil-chapo">
            {activeCategorie
              ? `${labelCategorie} — ${fichiersActifs.length} fichier(s)`
              : `${fichiers.length} fichiers au total`}
          </p>
        </div>
      </header>

      {error && <div className="err">{error}</div>}

      {/* Grille des catégories */}
      {!activeCategorie && (
        <div className="card">
          <h3>Catégories de jeûne</h3>
          <div className="chambres-grid">
            {CATEGORIES.map((cat) => (
              <div
                key={cat.id}
                className="chambre-card"
                onClick={() => selectCategorie(cat.id)}
              >
                <div className="chambre-card-nom">{cat.label}</div>
                <div className="chambre-card-nb">
                  {nombreParCategorie[cat.id] || 0} fichier(s)
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vue détaillée d'une catégorie */}
      {activeCategorie && (
        <div className="card">
          <div className="table-actions">
            <button className="btn secondary" onClick={retourGrille}>
              ← Retour aux catégories
            </button>
            <label className="btn" style={{ position: "relative", color: "#fff" }}>
              <span style={{ position: "relative", zIndex: 1 }}>
                {uploading ? "Upload en cours..." : "Uploader un PDF"}
              </span>
              <input
                type="file"
                accept=".pdf"
                onChange={handleUpload}
                disabled={uploading}
                style={{ position: "absolute", opacity: 0, width: 0, height: 0, overflow: "hidden" }}
              />
            </label>
          </div>

          {fichiersActifs.length === 0 ? (
            <div className="empty">Aucun fichier dans cette catégorie.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Nom du fichier</th>
                    <th>Taille</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fichiersActifs.map((f) => (
                    <tr key={f.id}>
                      <td>{f.nomFichier}</td>
                      <td>{fmtTaille(f.taille)}</td>
                      <td>
                        {new Date(f.createdAt).toLocaleDateString("fr-FR", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </td>
                      <td>
                        <button
                          className="btn secondary"
                          style={{ marginRight: 8 }}
                          onClick={() => imprimer(f.id)}
                          title="Ouvre le PDF dans un nouvel onglet"
                        >
                          Voir / Imprimer
                        </button>
                        <button
                          className="del-line"
                          onClick={() => supprimer(f.id, f.nomFichier)}
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {node}
    </main>
  );
}
