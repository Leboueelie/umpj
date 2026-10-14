"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { CroisadeJeunePriere } from "@/lib/types";
import {
  fmtDuree,
  fmtDate,
  formatDateInput,
  formatHeureInput,
  normalizeDate,
  normalizeHeure,
  todayDisplay,
} from "@/lib/calc";
import { useFeedback } from "@/components/Feedback";

function isoDay(raw: string): string {
  return raw.split("T")[0];
}

const ROLE_KEYS = [
  "frereSoeur",
  "accueil",
  "semeurs",
  "secretariat1",
  "secretariat2",
  "sono",
  "ames",
  "rtvc",
] as const;

type RoleKey = (typeof ROLE_KEYS)[number];

const ROLE_FIELDS: { key: RoleKey; label: string; short: string }[] = [
  { key: "frereSoeur", label: "Frère/Sœur", short: "F/S" },
  { key: "accueil", label: "Accueil", short: "Accueil" },
  { key: "semeurs", label: "Semeurs", short: "Semeurs" },
  { key: "secretariat1", label: "Secrétariat 1", short: "Secrét. 1" },
  { key: "secretariat2", label: "Secrétariat 2", short: "Secrét. 2" },
  { key: "sono", label: "Sono", short: "Sono" },
  { key: "ames", label: "Âmes", short: "Âmes" },
  { key: "rtvc", label: "RTVC", short: "RTVC" },
];

type FormState = {
  date: string;
  heureDebut: string;
  heureFin: string;
  orateur: string;
  coordinateur: string;
} & Record<RoleKey, string>;

const emptyForm = (): FormState => ({
  date: todayDisplay(),
  heureDebut: "",
  heureFin: "",
  orateur: "",
  coordinateur: "",
  frereSoeur: "0",
  accueil: "0",
  semeurs: "0",
  secretariat1: "0",
  secretariat2: "0",
  sono: "0",
  ames: "0",
  rtvc: "0",
});

export default function CroisadePage() {
  const [liste, setListe] = useState<CroisadeJeunePriere[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const { confirm, toast, node } = useFeedback();

  async function loadListe() {
    try {
      const r = await fetch("/api/croisade");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setListe(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    loadListe();
  }, []);

  const roleValue = (k: RoleKey): number => {
    const v = parseInt(form[k], 10);
    return Number.isNaN(v) || v < 0 ? 0 : v;
  };
  const effectifApercu = ROLE_KEYS.reduce((m, k) => m + roleValue(k), 0);

  async function submitCroisade(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const { date, heureDebut, heureFin, orateur, coordinateur } = form;
    if (!orateur.trim() || !coordinateur.trim() || !date || !heureDebut || !heureFin) {
      setError("Date, heures, orateur et coordinateur sont obligatoires.");
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

    for (const { key, label } of ROLE_FIELDS) {
      if (form[key].trim() === "") {
        setError(`« ${label} » est obligatoire (0 accepté).`);
        return;
      }
      if (!/^\d+$/.test(form[key].trim())) {
        setError(`« ${label} » doit être un entier ≥ 0.`);
        return;
      }
    }

    try {
      const r = await fetch("/api/croisade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateNorm,
          heureDebut: heureDebutNorm,
          heureFin: heureFinNorm,
          orateur: orateur.trim(),
          coordinateur: coordinateur.trim(),
          ...Object.fromEntries(ROLE_KEYS.map((k) => [k, roleValue(k)])),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);

      setForm(emptyForm());
      toast("Session de croisade ajoutée.", "success");
      await loadListe();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast(msg, "error");
    }
  }

  async function deleteLigne(id: string) {
    if (!(await confirm("Supprimer cette session de croisade ?"))) return;
    try {
      const r = await fetch(`/api/croisade/${id}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast("Session supprimée.", "success");
      await loadListe();
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

  const totals = liste.reduce(
    (acc, s) => {
      for (const k of ROLE_KEYS) acc[k] += s[k] || 0;
      acc.effectif += s.effectif || 0;
      acc.tempsMis += s.tempsMis || 0;
      return acc;
    },
    { ...Object.fromEntries(ROLE_KEYS.map((k) => [k, 0])), effectif: 0, tempsMis: 0 } as Record<
      RoleKey | "effectif" | "tempsMis",
      number
    >
  );

  return (
    <main className="wrap">
      <Link href="/nuits-priere" className="back-link">
        ← Nuits de Prière
      </Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo" className="logo" />
        <div className="titles">
          <h1>Croisade de Jeûne et Prière pour le Ministère</h1>
          <div className="sub">{liste.length} enregistrement(s)</div>
        </div>
      </header>

      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ajouter une session de croisade</h3>
        <form onSubmit={submitCroisade}>
          <div className="row">
            <div className="field">
              <label>Date</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="08/10/2026"
                value={form.date}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm({ ...form, date: formatDateInput(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Début</label>
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
              <label>Fin</label>
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
              <label>Coordinateur</label>
              <input
                type="text"
                placeholder="Nom du coordinateur"
                value={form.coordinateur}
                onChange={(e) => setForm({ ...form, coordinateur: e.target.value })}
              />
            </div>
          </div>

          <div className="row">
            {ROLE_FIELDS.slice(0, 4).map(({ key, label }) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <input
                  type="number"
                  min="0"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <div className="row">
            {ROLE_FIELDS.slice(4).map(({ key, label }) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <input
                  type="number"
                  min="0"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
            <div className="field">
              <label>Effectif (auto)</label>
              <input type="number" value={effectifApercu} readOnly />
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn" type="submit">
              Ajouter la session
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
          <strong>Liste des sessions de croisade</strong>
        </div>
        {liste.length === 0 ? (
          <div className="empty">Aucune session de croisade enregistrée.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Date</th>
                  <th>Période</th>
                  <th>Orateur</th>
                  <th>Coordinateur</th>
                  {ROLE_FIELDS.map((r) => (
                    <th key={r.key}>{r.short}</th>
                  ))}
                  <th>Effectif</th>
                  <th>Temps mis</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {liste.map((s, i) => (
                  <tr key={s.id}>
                    <td>{i + 1}</td>
                    <td>{fmtDate(isoDay(s.date))}</td>
                    <td>{`${s.heureDebut} - ${s.heureFin}`}</td>
                    <td>{s.orateur}</td>
                    <td>{s.coordinateur}</td>
                    {ROLE_KEYS.map((k) => (
                      <td key={k}>{s[k]}</td>
                    ))}
                    <td>{s.effectif}</td>
                    <td>{fmtDuree(s.tempsMis)}</td>
                    <td>
                      <button className="del-line" onClick={() => deleteLigne(s.id)}>
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="total">
                  <td colSpan={5}>Total : {liste.length} enregistrement(s)</td>
                  {ROLE_KEYS.map((k) => (
                    <td key={k}>{totals[k]}</td>
                  ))}
                  <td>{totals.effectif}</td>
                  <td>{fmtDuree(totals.tempsMis)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
      {node}
    </main>
  );
}
