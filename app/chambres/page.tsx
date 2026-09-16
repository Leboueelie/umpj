"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { Zone, ChambreDePriere } from "@/lib/types";
import { useFeedback } from "@/components/Feedback";

async function api<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data as T;
}

interface ChambreForm {
  nom: string;
  lieu: string;
  fardeau: string;
  dirigeants: string;
  contacts: string;
}

const FORM_VIDE: ChambreForm = { nom: "", lieu: "", fardeau: "", dirigeants: "", contacts: "" };

export default function ChambresPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [chambres, setChambres] = useState<ChambreDePriere[]>([]);
  const [zoneActiveId, setZoneActiveId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [groupe, setGroupe] = useState<string>("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChambreForm>(FORM_VIDE);
  const { confirm, toast, node } = useFeedback();

  async function loadZones() {
    try {
      const z = await api<Zone[]>("/api/zones");
      setZones(z);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadChambres(zoneId?: string | null) {
    try {
      const url = zoneId ? `/api/chambres?zoneId=${zoneId}` : "/api/chambres";
      const c = await api<ChambreDePriere[]>(url);
      setChambres(c);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    loadZones();
    loadChambres();
  }, []);

  const zoneActive = zones.find((z) => z.id === zoneActiveId);

  const nombreParZone = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of chambres) m[c.zoneId] = (m[c.zoneId] || 0) + 1;
    return m;
  }, [chambres]);

  const zonesFiltrees = useMemo(() => {
    return zones.filter((z) => {
      if (groupe && z.groupe !== groupe) return false;
      if (search && !z.nom.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [zones, groupe, search]);

  const chambresZone = useMemo(() => {
    if (!zoneActiveId) return [];
    return chambres
      .filter((c) => c.zoneId === zoneActiveId)
      .sort((a, b) => a.ordre - b.ordre);
  }, [chambres, zoneActiveId]);

  const chambreDetail = chambres.find((c) => c.id === detailId);

  function retourGrille() {
    setZoneActiveId(null);
    setDetailId(null);
  }

  async function selectingZone(id: string) {
    setZoneActiveId(id);
    setDetailId(null);
    await loadChambres(id);
  }

  function openAjouter() {
    setEditingId(null);
    setForm(FORM_VIDE);
    setShowForm(true);
  }

  function openModifier(c: ChambreDePriere) {
    setEditingId(c.id);
    setForm({ nom: c.nom, lieu: c.lieu, fardeau: c.fardeau, dirigeants: c.dirigeants, contacts: c.contacts });
    setShowForm(true);
  }

  function fermerForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(FORM_VIDE);
  }

  async function sauver(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await api(`/api/chambres/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        toast("Chambre modifiée.", "success");
      } else {
        await api("/api/chambres", {
          method: "POST",
          body: JSON.stringify({ ...form, zoneId: zoneActiveId }),
        });
        toast("Chambre ajoutée.", "success");
      }
      fermerForm();
      await loadChambres(zoneActiveId);
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    }
  }

  async function supprimer(id: string) {
    if (!(await confirm("Supprimer cette chambre ?"))) return;
    try {
      await api(`/api/chambres/${id}`, { method: "DELETE" });
      toast("Chambre supprimée.", "success");
      if (detailId === id) setDetailId(null);
      await loadChambres(zoneActiveId);
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    }
  }

  return (
    <main className="wrap">
      <Link href="/" className="back-link">← Accueil</Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo UMPJ" className="logo" />
        <div className="titles">
          <h1>Liste des Chambres de Prière</h1>
          <div className="sub">
            {zoneActive
              ? `${zoneActive.nom} — ${chambresZone.length} chambre(s)`
              : `${zones.length} zones · ${chambres.length} chambres au total`}
          </div>
        </div>
      </header>

      {error && <div className="err">{error}</div>}

      {/* Grille de zones */}
      {!zoneActiveId && (
        <div className="card">
          <div className="filters">
            <input
              type="text"
              placeholder="Rechercher une zone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={groupe} onChange={(e) => setGroupe(e.target.value)}>
              <option value="">Tous les groupes</option>
              <option value="abidjan">Abidjan</option>
              <option value="interieur">Intérieur</option>
            </select>
          </div>
          {zonesFiltrees.length === 0 ? (
            <div className="empty">Aucune zone trouvée.</div>
          ) : (
            <div className="chambres-grid">
              {zonesFiltrees.map((z) => (
                <div
                  key={z.id}
                  className="chambre-card"
                  onClick={() => selectingZone(z.id)}
                >
                  <div className="chambre-card-nom">{z.nom}</div>
                  <div className="chambre-card-nb">
                    {nombreParZone[z.id] || 0} chambre(s)
                  </div>
                  <div className="chambre-card-groupe">
                    {z.groupe === "abidjan" ? "Abidjan" : "Intérieur"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vue chambres d'une zone */}
      {zoneActiveId && (
        <>
          <div className="card">
            <div className="table-actions">
              <button className="link-btn" onClick={retourGrille}>
                ← Retour à la grille
              </button>
              <button className="btn" onClick={openAjouter}>
                + Ajouter une chambre
              </button>
            </div>

            {chambresZone.length === 0 ? (
              <div className="empty">Aucune chambre dans cette zone.</div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Lieu</th>
                      <th>Fardeau</th>
                      <th>Dirigeant(s)</th>
                      <th>Contacts</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {chambresZone.map((c, i) => (
                      <tr
                        key={c.id}
                        className={detailId === c.id ? "manquant" : undefined}
                        onClick={() => setDetailId(c.id === detailId ? null : c.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>{i + 1}</td>
                        <td>{c.lieu}</td>
                        <td>{c.fardeau}</td>
                        <td>{c.dirigeants}</td>
                        <td>{c.contacts}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button className="link-btn" onClick={() => openModifier(c)}>
                            Modifier
                          </button>{" "}
                          <button className="del-line" onClick={() => supprimer(c.id)}>
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

          {/* Panneau détails */}
          {chambreDetail && (
            <div className="card chambre-detail">
              <h3 style={{ marginTop: 0, color: "var(--navy)" }}>
                Détails de la chambre
              </h3>
              <div className="detail-grid">
                <div>
                  <span className="detail-label">Lieu</span>
                  <span className="detail-val">{chambreDetail.lieu}</span>
                </div>
                <div>
                  <span className="detail-label">Fardeau</span>
                  <span className="detail-val">{chambreDetail.fardeau}</span>
                </div>
                <div>
                  <span className="detail-label">Dirigeant(s)</span>
                  <span className="detail-val">{chambreDetail.dirigeants}</span>
                </div>
                <div>
                  <span className="detail-label">Contacts</span>
                  <span className="detail-val">{chambreDetail.contacts}</span>
                </div>
                <div>
                  <span className="detail-label">Zone</span>
                  <span className="detail-val">
                    {chambreDetail.zoneNom || "—"} ({chambreDetail.zoneGroupe})
                  </span>
                </div>
                <div>
                  <span className="detail-label">Date de création</span>
                  <span className="detail-val">{new Date(chambreDetail.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal formulaire */}
      {showForm && (
        <div className="modal-backdrop" onClick={fermerForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>
              {editingId ? "Modifier la chambre" : "Ajouter une chambre"}
            </h3>
            <form onSubmit={sauver}>
              <div className="field">
                <label>Nom</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Lieu</label>
                <input
                  type="text"
                  value={form.lieu}
                  onChange={(e) => setForm({ ...form, lieu: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Fardeau</label>
                <textarea
                  value={form.fardeau}
                  onChange={(e) => setForm({ ...form, fardeau: e.target.value })}
                  required
                  rows={3}
                />
              </div>
              <div className="field">
                <label>Dirigeant(s)</label>
                <input
                  type="text"
                  value={form.dirigeants}
                  onChange={(e) => setForm({ ...form, dirigeants: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Contacts</label>
                <input
                  type="text"
                  value={form.contacts}
                  onChange={(e) => setForm({ ...form, contacts: e.target.value })}
                />
              </div>
              <div className="form-actions">
                <button className="btn" type="submit">
                  {editingId ? "Enregistrer" : "Ajouter"}
                </button>
                <button className="btn secondary" type="button" onClick={fermerForm}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {node}
    </main>
  );
}
