"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { ActionDeGrace, Zone } from "@/lib/types";
import { useFeedback } from "@/components/Feedback";

const COMITES = [
  "Semeur",
  "Restauration",
  "Accueil Et Installation",
  "Protocole De BM",
  "Hope Clinic",
  "PROJET & Construction",
  "Sécurité",
  "Enfant",
  "Intercession",
  "RTVC",
  "Littérature-CEDI",
  "Salubrité",
  "Protocole Et Hébergement",
  "Délivrance",
  "Secrétariat",
  "Secrétariat BM",
  "Secrétariat CM",
  "Editorialiste",
  "Évangélisation",
  "Décoration",
  "JEUNESSES",
  "JEUNESSES CBN",
  "Sonorisation",
];

function fmtTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function ActionsDeGracePage() {
  const [fichiers, setFichiers] = useState<ActionDeGrace[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [onglet, setOnglet] = useState<"comite" | "region">("comite");
  const [actif, setActif] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const { confirm, toast, node } = useFeedback();

  async function loadFichiers(type: string, nom?: string | null) {
    try {
      let url = `/api/actions-de-grace?type=${type}`;
      if (nom) url += `&comite=${encodeURIComponent(nom)}`;
      const r = await fetch(url);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setFichiers(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    fetch("/api/zones").then((r) => r.json()).then(setZones).catch(() => {});
    loadFichiers("comite");
  }, []);

  const nombreParNom = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of fichiers) m[f.comite] = (m[f.comite] || 0) + 1;
    return m;
  }, [fichiers]);

  const items = useMemo(() => {
    const list = onglet === "comite" ? COMITES : zones.filter(z => z.groupe === "interieur").map((z) => z.nom);
    if (!search) return list;
    return list.filter((c) => c.toLowerCase().includes(search.toLowerCase()));
  }, [onglet, zones, search]);

  const fichiersActifs = useMemo(() => {
    if (!actif) return [];
    return fichiers.filter((f) => f.comite === actif);
  }, [fichiers, actif]);

  function selecting(nom: string) {
    setActif(nom);
    loadFichiers(onglet, nom);
  }

  function changerOnglet(o: "comite" | "region") {
    setOnglet(o);
    setActif(null);
    setSearch("");
    loadFichiers(o);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !actif) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("comite", actif);
      fd.append("type", onglet);
      const r = await fetch("/api/actions-de-grace", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast("Fichier uploadé.", "success");
      await loadFichiers(onglet, actif);
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
      const r = await fetch(`/api/actions-de-grace/${id}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast("Fichier supprimé.", "success");
      await loadFichiers(onglet, actif);
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    }
  }

  function imprimer(id: string) {
    window.open(`/api/actions-de-grace/${id}/download`, "_blank");
  }

  const labelOnglet = onglet === "comite" ? "comité" : "région";

  return (
    <main className="wrap">
      <Link href="/" className="back-link">← Accueil</Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo UMPJ" className="logo" />
        <div className="titles">
          <h1>Actions de Grâce</h1>
          <div className="sub">
            {actif
              ? `${actif} — ${fichiersActifs.length} fichier(s)`
              : `${fichiers.length} fichiers au total`}
          </div>
        </div>
      </header>

      {error && <div className="err">{error}</div>}

      {/* Onglets */}
      <div className="card" style={{ marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div className="onglets-ag">
          <button
            className={`onglet-ag ${onglet === "comite" ? "actif" : ""}`}
            onClick={() => changerOnglet("comite")}
          >
            Par Comité ({COMITES.length})
          </button>
          <button
            className={`onglet-ag ${onglet === "region" ? "actif" : ""}`}
            onClick={() => changerOnglet("region")}
          >
            Par Région ({zones.length})
          </button>
        </div>
      </div>

      {/* Grille */}
      {!actif && (
        <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
          <div className="filters">
            <input
              type="text"
              placeholder={`Rechercher un ${labelOnglet}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="chambres-grid">
            {items.map((c) => (
              <div
                key={c}
                className="chambre-card"
                onClick={() => selecting(c)}
              >
                <div className="chambre-card-nom">{c}</div>
                <div className="chambre-card-nb">
                  {nombreParNom[c] || 0} fichier(s)
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste des fichiers */}
      {actif && (
        <div className="card">
          <div className="table-actions">
            <button className="link-btn" onClick={() => setActif(null)}>
              ← Retour à la grille
            </button>
            <label className={`btn ${uploading ? "disabled" : ""}`}>
              {uploading ? "Upload en cours…" : "Uploader un PDF"}
              <input
                type="file"
                accept=".pdf"
                onChange={handleUpload}
                disabled={uploading}
                style={{ display: "none" }}
              />
            </label>
          </div>

          {fichiersActifs.length === 0 ? (
            <div className="empty">Aucun fichier pour ce {labelOnglet}.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Nom du fichier</th>
                    <th>Taille</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {fichiersActifs.map((f) => (
                    <tr key={f.id}>
                      <td>{f.nomFichier}</td>
                      <td>{fmtTaille(f.taille)}</td>
                      <td>{new Date(f.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                      <td>
                        <button className="link-btn" onClick={() => imprimer(f.id)}>
                          Voir / Imprimer
                        </button>{" "}
                        <button className="del-line" onClick={() => supprimer(f.id, f.nomFichier)}>
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
