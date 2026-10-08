"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { SiegePriere } from "@/lib/types";
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

export default function SiegeDePrierePage() {
  const [sieges, setSieges] = useState<SiegePriere[]>([]);
  const [form, setForm] = useState({
    nom: "",
    numeroEdition: "",
    orateur: "",
    date: isoToDisplay(new Date().toISOString().slice(0, 10)),
    heureDebut: "",
    heureFin: "",
    participants: "1",
  });
  const [error, setError] = useState("");
  const { confirm, toast, node } = useFeedback();

  async function loadSieges() {
    try {
      const r = await fetch("/api/sieges-priere");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setSieges(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    loadSieges();
  }, []);

  async function submitSiege(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const { nom, numeroEdition, orateur, date, heureDebut, heureFin, participants } = form;
    const numEd = parseInt(numeroEdition, 10);
    const numPart = parseInt(participants, 10);

    if (!nom.trim() || !numEd || !orateur.trim() || !date || !heureDebut || !heureFin || !numPart) {
      setError("Tous les champs sont obligatoires.");
      return;
    }

    const dateNorm = normalizeDate(date);
    const heureDebutNorm = normalizeHeure(heureDebut);
    const heureFinNorm = normalizeHeure(heureFin);

    if (!dateNorm) {
      setError("Format de date invalide (ex : 08/10/2026).");
      return;
    }

    if (!heureDebutNorm || !heureFinNorm) {
      setError("Format d'heure invalide (ex : 20:00).");
      return;
    }

    if (numEd <= 0) {
      setError("Le numéro d'édition doit être > 0.");
      return;
    }

    if (numPart < 1) {
      setError("Le nombre de participants doit être ≥ 1.");
      return;
    }

    try {
      const r = await fetch("/api/sieges-priere", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: nom.trim(),
          numeroEdition: numEd,
          orateur: orateur.trim(),
          date: dateNorm,
          heureDebut: heureDebutNorm,
          heureFin: heureFinNorm,
          participants: numPart,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);

      setForm({
        nom: "",
        numeroEdition: "",
        orateur: "",
        date: isoToDisplay(new Date().toISOString().slice(0, 10)),
        heureDebut: "",
        heureFin: "",
        participants: "1",
      });
      toast("Siège de prière ajouté.", "success");
      await loadSieges();
    } catch (err) {
      setError((err as Error).message);
      toast((err as Error).message, "error");
    }
  }

  async function deleteSiege(id: string, nom: string) {
    if (!(await confirm(`Supprimer le siège "${nom}" ?`))) return;
    try {
      const r = await fetch(`/api/sieges-priere/${id}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast("Siège supprimé.", "success");
      await loadSieges();
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    }
  }

  const previewHeureDebut = normalizeHeure(form.heureDebut);
  const previewHeureFin = normalizeHeure(form.heureFin);

  let previewTempsMis = 0;
  if (previewHeureDebut && previewHeureFin) {
    const [hd, md] = previewHeureDebut.split(":").map(Number);
    const [hf, mf] = previewHeureFin.split(":").map(Number);
    let diff = (hf * 60 + mf) - (hd * 60 + md);
    if (diff < 0) diff += 1440;
    previewTempsMis = diff;
  }

  return (
    <main className="wrap">
      <Link href="/sieges-de-priere" className="back-link">
        ← Les Sièges de Prière
      </Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo" className="logo" />
        <div className="titles">
          <h1>Siège de Prière</h1>
          <div className="sub">{sieges.length} enregistrement(s)</div>
        </div>
      </header>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ajouter un siège de prière</h3>
        <form onSubmit={submitSiege}>
          <div className="row">
            <div className="field">
              <label>Nom</label>
              <input
                type="text"
                placeholder="Ex: Siège National"
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
              />
            </div>
            <div className="field">
              <label>N° Édition</label>
              <input
                type="number"
                min="1"
                placeholder="Ex: 31"
                value={form.numeroEdition}
                onChange={(e) => setForm({ ...form, numeroEdition: e.target.value })}
              />
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label>Orateur</label>
              <input
                type="text"
                placeholder="Nom de l'orateur"
                value={form.orateur}
                onChange={(e) => setForm({ ...form, orateur: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Date</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="08/10/2026"
                value={form.date}
                onFocus={(e) => e.target.select()}
                onChange={(e) =>
                  setForm({ ...form, date: formatDateInput(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label>Heure Début</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="20:00"
                value={form.heureDebut}
                onFocus={(e) => e.target.select()}
                onChange={(e) =>
                  setForm({ ...form, heureDebut: formatHeureInput(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label>Heure Fin</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="23:30"
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
              Ajouter le siège de prière
            </button>
          </div>
          {error && <div className="err">{error}</div>}
          {previewTempsMis > 0 && (
            <div className="preview">
              Aperçu : Temps mis = <strong>{fmtDuree(previewTempsMis)}</strong>
            </div>
          )}
        </form>
      </div>

      <div className="card">
        <div className="table-actions">
          <strong>Liste des sièges de prière</strong>
        </div>
        {sieges.length === 0 ? (
          <div className="empty">Aucun siège de prière enregistré.</div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Nom</th>
                    <th>N° Édition</th>
                    <th>Orateur</th>
                    <th>Date</th>
                    <th>Période</th>
                    <th>Participants</th>
                    <th>Temps Mis</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sieges.map((s, i) => {
                    const date = s.date.split("T")[0];
                    const periode = `${s.heureDebut} - ${s.heureFin}`;
                    return (
                      <tr key={s.id}>
                        <td>{i + 1}</td>
                        <td>{s.nom}</td>
                        <td>{s.numeroEdition}</td>
                        <td>{s.orateur}</td>
                        <td>{fmtDate(date)}</td>
                        <td>{periode}</td>
                        <td>{s.participants}</td>
                        <td>{fmtDuree(s.tempsMis)}</td>
                        <td>
                          <button
                            className="del-line"
                            onClick={() => deleteSiege(s.id, s.nom)}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="total">
                    <td colSpan={8}>Total : {sieges.length} enregistrement(s)</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {node}
    </main>
  );
}
