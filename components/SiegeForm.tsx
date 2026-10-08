"use client";

import { useEffect, useState } from "react";
import { fmtDuree, normalizeDate, normalizeHeure } from "@/lib/calc";
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

function todayDisplay(): string {
  return isoToDisplay(new Date().toISOString().slice(0, 10));
}

type Notify = (message: string, type?: "success" | "error") => void;

type Props = {
  numeroEditionFixe?: number;
  nextEdition?: number;
  nextJour?: number;
  onSaved: () => void | Promise<void>;
  notify?: Notify;
  titre?: string;
};

const emptyForm = () => ({
  nom: "",
  numeroEdition: "",
  jour: "",
  orateur: "",
  date: todayDisplay(),
  heureDebut: "",
  heureFin: "",
  participants: "1",
});

export function SiegeForm({
  numeroEditionFixe,
  nextEdition,
  nextJour,
  onSaved,
  notify,
  titre = "Ajouter un siège de prière",
}: Props) {
  const fb = useFeedback();
  const send: Notify = notify ?? fb.toast;
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm((f) => ({
      ...f,
      numeroEdition:
        numeroEditionFixe === undefined && f.numeroEdition === "" && nextEdition
          ? String(nextEdition)
          : f.numeroEdition,
      jour: f.jour === "" && nextJour ? String(nextJour) : f.jour,
    }));
  }, [numeroEditionFixe, nextEdition, nextJour]);

  async function submitSiege(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const { nom, numeroEdition, jour, orateur, date, heureDebut, heureFin, participants } = form;
    const numEd = numeroEditionFixe ?? parseInt(numeroEdition, 10);
    const numJour = parseInt(jour, 10);
    const numPart = parseInt(participants, 10);

    if (!nom.trim() || !orateur.trim() || !date || !heureDebut || !heureFin) {
      setError("Tous les champs sont obligatoires.");
      return;
    }

    if (!Number.isInteger(numEd) || numEd < 1) {
      setError("Le numéro d'édition doit être un entier ≥ 1.");
      return;
    }

    const dateNorm = normalizeDate(date);
    if (!dateNorm) {
      setError("Format de date invalide (ex : 08/10/2026).");
      return;
    }

    const heureDebutNorm = normalizeHeure(heureDebut);
    const heureFinNorm = normalizeHeure(heureFin);
    if (!heureDebutNorm || !heureFinNorm) {
      setError("Format d'heure invalide (ex : 20:00).");
      return;
    }

    if (!jour.trim() || Number.isNaN(numJour) || numJour < 1) {
      setError("Le numéro de jour doit être un entier ≥ 1.");
      return;
    }

    if (!numPart || numPart < 1) {
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
          jour: numJour,
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
        ...emptyForm(),
        numeroEdition:
          numeroEditionFixe === undefined
            ? String(Math.max(numEd, nextEdition ?? numEd))
            : "",
        jour: String(Math.max(numJour + 1, nextJour ?? numJour)),
      });
      send("Siège de prière ajouté.", "success");
      await onSaved();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      send(msg, "error");
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
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{titre}</h3>
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
          {numeroEditionFixe === undefined && (
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
          )}
          <div className="field">
            <label>Jour n°</label>
            <input
              type="number"
              min="1"
              placeholder={nextJour ? `Ex: ${nextJour}` : "Ex: 1"}
              value={form.jour}
              onChange={(e) => setForm({ ...form, jour: e.target.value })}
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
      {!notify && fb.node}
    </div>
  );
}
