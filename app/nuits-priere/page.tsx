"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { NuitPriere } from "@/lib/types";
import { fmtDuree, fmtDate, normalizeDate, normalizeHeure } from "@/lib/calc";
import { useFeedback } from "@/components/Feedback";

function formatDateInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  const parts: string[] = [];
  if (d.length > 0) parts.push(d.slice(0, 2));
  if (d.length >= 3) parts.push(d.slice(2, 4));
  if (d.length >= 5) parts.push(d.slice(4, 8));
  return parts.join("/");
}

function formatHeureInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return d.slice(0, 2) + ":" + d.slice(2);
}

function isoToDisplay(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

async function api<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data as T;
}

type Categorie = "vendredi" | "mardi" | "autre" | "all";

export default function NuitsPrierePage() {
  const [nuits, setNuits] = useState<NuitPriere[]>([]);
  const [activeCategorie, setActiveCategorie] = useState<Categorie>("all");
  const [form, setForm] = useState({
    categorie: "vendredi" as "vendredi" | "mardi" | "autre",
    nomCategorie: "",
    date: isoToDisplay(new Date().toISOString().slice(0, 10)),
    heureDebut: "",
    heureFin: "",
    participants: "1",
  });
  const [error, setError] = useState("");
  const { confirm, toast, node } = useFeedback();

  async function loadNuits() {
    try {
      const data = await api<NuitPriere[]>("/api/nuits-priere");
      setNuits(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    loadNuits();
  }, []);

  async function submitNuit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const { categorie, nomCategorie, date, heureDebut, heureFin, participants } = form;
    const pers = parseInt(participants, 10);

    if (!categorie) {
      setError("La catégorie est obligatoire.");
      return;
    }

    if (categorie === "autre" && !nomCategorie.trim()) {
      setError("Le nom de la catégorie est obligatoire pour 'Autre'.");
      return;
    }

    const dateNorm = normalizeDate(date);
    if (!dateNorm) {
      setError("La date est obligatoire (ex : 07/10/2026).");
      return;
    }

    const heureDebutNorm = normalizeHeure(heureDebut);
    const heureFinNorm = normalizeHeure(heureFin);

    if (!heureDebutNorm || !heureFinNorm) {
      setError("Les heures sont obligatoires (ex : 20:00 ou 20h).");
      return;
    }

    if (!pers || pers < 1) {
      setError("Le nombre de participants doit être ≥ 1.");
      return;
    }

    try {
      await api("/api/nuits-priere", {
        method: "POST",
        body: JSON.stringify({
          categorie,
          nomCategorie: categorie === "autre" ? nomCategorie.trim() : null,
          date: dateNorm,
          heureDebut: heureDebutNorm,
          heureFin: heureFinNorm,
          participants: pers,
        }),
      });
      setForm({
        categorie: "vendredi",
        nomCategorie: "",
        date: isoToDisplay(new Date().toISOString().slice(0, 10)),
        heureDebut: "",
        heureFin: "",
        participants: "1",
      });
      toast("Nuit de prière ajoutée.", "success");
      await loadNuits();
    } catch (err) {
      setError((err as Error).message);
      toast((err as Error).message, "error");
    }
  }

  async function deleteNuit(id: string) {
    if (!(await confirm("Supprimer cette nuit de prière ?"))) return;
    try {
      await api(`/api/nuits-priere?id=${id}`, { method: "DELETE" });
      toast("Nuit de prière supprimée.", "success");
      await loadNuits();
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    }
  }

  const filteredNuits = useMemo(() => {
    if (activeCategorie === "all") return nuits;
    return nuits.filter((n) => n.categorie === activeCategorie);
  }, [nuits, activeCategorie]);

  const previewHeureDebut = normalizeHeure(form.heureDebut);
  const previewHeureFin = normalizeHeure(form.heureFin);
  const previewPers = parseInt(form.participants, 10) || 1;

  let previewTempsMis = 0;
  if (previewHeureDebut && previewHeureFin) {
    const [hd, md] = previewHeureDebut.split(":").map(Number);
    const [hf, mf] = previewHeureFin.split(":").map(Number);
    let diff = (hf * 60 + mf) - (hd * 60 + md);
    if (diff < 0) diff += 1440;
    previewTempsMis = diff;
  }
  const previewVolume = previewTempsMis * previewPers;

  const totalStats = useMemo(() => {
    let count = 0;
    let totalParticipants = 0;
    let totalTempsMis = 0;
    let totalVolume = 0;
    for (const n of filteredNuits) {
      count++;
      totalParticipants += n.participants;
      totalTempsMis += n.tempsMis;
      totalVolume += n.volume;
    }
    return { count, totalParticipants, totalTempsMis, totalVolume };
  }, [filteredNuits]);

  const getCategorieLabel = (cat: string, nomCat: string | null) => {
    if (cat === "vendredi") return "Vendredi";
    if (cat === "mardi") return "Mardi";
    if (cat === "autre" && nomCat) return nomCat;
    return "Autre";
  };

  return (
    <div className="wrap">
      <Link href="/" className="back-link">
        ← Accueil
      </Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo" className="logo" />
        <div className="titles">
          <h1>NUITS DE PRIÈRE</h1>
          <div className="sub">Gestion des nuits de prière par catégorie</div>
        </div>
      </header>

      <div className="card">
        <h3>Catégories</h3>
        <div className="cahiers">
          <div
            className={"cahier-btn" + (activeCategorie === "all" ? " active" : "")}
            onClick={() => setActiveCategorie("all")}
          >
            <span className="nom">Toutes</span>
          </div>
          <div
            className={"cahier-btn" + (activeCategorie === "vendredi" ? " active" : "")}
            onClick={() => setActiveCategorie("vendredi")}
          >
            <span className="nom">Vendredi</span>
          </div>
          <div
            className={"cahier-btn" + (activeCategorie === "mardi" ? " active" : "")}
            onClick={() => setActiveCategorie("mardi")}
          >
            <span className="nom">Mardi</span>
          </div>
          <div
            className={"cahier-btn" + (activeCategorie === "autre" ? " active" : "")}
            onClick={() => setActiveCategorie("autre")}
          >
            <span className="nom">Autre</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ajouter une nuit de prière</h3>
        <form onSubmit={submitNuit}>
          <div className="row">
            <div className="field">
              <label>Catégorie</label>
              <select
                value={form.categorie}
                onChange={(e) =>
                  setForm({
                    ...form,
                    categorie: e.target.value as "vendredi" | "mardi" | "autre",
                  })
                }
              >
                <option value="vendredi">Vendredi</option>
                <option value="mardi">Mardi</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            {form.categorie === "autre" && (
              <div className="field">
                <label>Nom de la catégorie</label>
                <input
                  type="text"
                  placeholder="Ex: Samedi"
                  value={form.nomCategorie}
                  onChange={(e) => setForm({ ...form, nomCategorie: e.target.value })}
                />
              </div>
            )}
          </div>
          <div className="row">
            <div className="field">
              <label>Date</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="07/10/2026"
                value={form.date}
                onFocus={(e) => e.target.select()}
                onChange={(e) =>
                  setForm({ ...form, date: formatDateInput(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label>Heure début</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="20:00 ou 20h"
                value={form.heureDebut}
                onFocus={(e) => e.target.select()}
                onChange={(e) =>
                  setForm({ ...form, heureDebut: formatHeureInput(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label>Heure fin</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="23:30 ou 23h30"
                value={form.heureFin}
                onFocus={(e) => e.target.select()}
                onChange={(e) =>
                  setForm({ ...form, heureFin: formatHeureInput(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label>Participants</label>
              <input
                type="number"
                min="1"
                value={form.participants}
                onChange={(e) => setForm({ ...form, participants: e.target.value })}
              />
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn" type="submit">
              Ajouter la nuit de prière
            </button>
          </div>
          {error && <div className="err">{error}</div>}
          {previewTempsMis > 0 && (
            <div className="preview">
              Aperçu : Temps mis = <strong>{fmtDuree(previewTempsMis)}</strong> —
              Participants = <strong>{previewPers}</strong> — Volume ={" "}
              <strong>{fmtDuree(previewVolume)}</strong>
            </div>
          )}
        </form>
      </div>

      <div className="card">
        <div className="table-actions">
          <strong>
            {activeCategorie === "all"
              ? "Toutes les nuits de prière"
              : `Nuits de prière — ${getCategorieLabel(activeCategorie, null)}`}
          </strong>
        </div>
        {filteredNuits.length === 0 ? (
          <div className="empty">Aucune nuit de prière.</div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Date</th>
                    <th>Catégorie</th>
                    <th>Période</th>
                    <th>Participants</th>
                    <th>Temps mis</th>
                    <th>Volume</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNuits.map((n, i) => {
                    const date = n.date.split("T")[0];
                    const periode = `${n.heureDebut} - ${n.heureFin}`;
                    return (
                      <tr key={n.id}>
                        <td>{i + 1}</td>
                        <td>{fmtDate(date)}</td>
                        <td>{getCategorieLabel(n.categorie, n.nomCategorie)}</td>
                        <td>{periode}</td>
                        <td>{n.participants}</td>
                        <td>{fmtDuree(n.tempsMis)}</td>
                        <td>{fmtDuree(n.volume)}</td>
                        <td>
                          <button
                            className="del-line"
                            onClick={() => deleteNuit(n.id)}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="total">
                    <td colSpan={4}>Total ({totalStats.count} nuits)</td>
                    <td>{totalStats.totalParticipants}</td>
                    <td>{fmtDuree(totalStats.totalTempsMis)}</td>
                    <td>{fmtDuree(totalStats.totalVolume)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {node}
    </div>
  );
}
