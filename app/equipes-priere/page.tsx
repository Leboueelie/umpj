"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { SujetPriere, EquipePriere } from "@/lib/types";
import { fmtDuree, fmtDate, normalizeDate } from "@/lib/calc";
import { useFeedback } from "@/components/Feedback";

function formatDateInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  const parts: string[] = [];
  if (d.length > 0) parts.push(d.slice(0, 2));
  if (d.length >= 3) parts.push(d.slice(2, 4));
  if (d.length >= 5) parts.push(d.slice(4, 8));
  return parts.join("/");
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

export default function EquipesPrierePage() {
  const [sujets, setSujets] = useState<SujetPriere[]>([]);
  const [equipes, setEquipes] = useState<EquipePriere[]>([]);
  const [activeSujetId, setActiveSujetId] = useState<string | null>(null);
  const [form, setForm] = useState({
    zone: "",
    dateDebut: isoToDisplay(new Date().toISOString().slice(0, 10)),
    dateFin: isoToDisplay(new Date().toISOString().slice(0, 10)),
    heures: "0",
    minutes: "0",
    personnes: "1",
  });
  const [error, setError] = useState("");
  const { confirm, prompt, toast, node } = useFeedback();

  async function loadSujets() {
    try {
      const data = await api<SujetPriere[]>("/api/sujets-priere");
      setSujets(data);
      setActiveSujetId((prev) =>
        data.find((s) => s.id === prev) ? prev : data[0]?.id ?? null
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadEquipes(sujetId: string) {
    try {
      const data = await api<EquipePriere[]>(`/api/equipes-priere?sujetId=${sujetId}`);
      setEquipes(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    loadSujets();
  }, []);

  useEffect(() => {
    if (activeSujetId) {
      loadEquipes(activeSujetId);
    } else {
      setEquipes([]);
    }
  }, [activeSujetId]);

  const activeSujet = sujets.find((s) => s.id === activeSujetId);

  async function addSujet() {
    const nom = await prompt("Nom du sujet de prière :", "Ex: Compte rendu de la prière pour la RAM");
    if (!nom) return;
    try {
      await api("/api/sujets-priere", {
        method: "POST",
        body: JSON.stringify({ nom }),
      });
      await loadSujets();
      toast("Sujet créé.", "success");
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    }
  }

  async function deleteSujet(id: string) {
    const s = sujets.find((x) => x.id === id);
    if (!(await confirm(`Supprimer le sujet "${s?.nom}" et toutes ses équipes ?`)))
      return;
    try {
      await api(`/api/sujets-priere?id=${id}`, { method: "DELETE" });
      toast("Sujet supprimé.", "success");
      await loadSujets();
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    }
  }

  async function submitEquipe(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const { zone, dateDebut, dateFin, heures, minutes, personnes } = form;
    const pers = parseInt(personnes, 10);
    const h = parseInt(heures, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    const tempsMis = h * 60 + m;

    const dateDebutNorm = normalizeDate(dateDebut);
    const dateFinNorm = normalizeDate(dateFin);

    if (!zone.trim()) {
      setError("La zone est obligatoire.");
      return;
    }
    if (!dateDebutNorm || !dateFinNorm) {
      setError("Les dates sont obligatoires (ex : 29/08/2026).");
      return;
    }
    if (dateFinNorm < dateDebutNorm) {
      setError("La date de fin ne peut pas être avant la date de début.");
      return;
    }
    if (tempsMis <= 0) {
      setError("Le temps mis doit être supérieur à 0.");
      return;
    }
    if (!pers || pers < 1) {
      setError("Le nombre de personnes doit être ≥ 1.");
      return;
    }

    try {
      await api("/api/equipes-priere", {
        method: "POST",
        body: JSON.stringify({
          sujetId: activeSujetId,
          zone: zone.trim(),
          dateDebut: dateDebutNorm,
          dateFin: dateFinNorm,
          tempsMis,
          nombrePersonnes: pers,
        }),
      });
      setForm({
        zone: "",
        dateDebut: isoToDisplay(new Date().toISOString().slice(0, 10)),
        dateFin: isoToDisplay(new Date().toISOString().slice(0, 10)),
        heures: "0",
        minutes: "0",
        personnes: "1",
      });
      toast("Équipe ajoutée.", "success");
      if (activeSujetId) await loadEquipes(activeSujetId);
    } catch (err) {
      setError((err as Error).message);
      toast((err as Error).message, "error");
    }
  }

  async function deleteEquipe(id: string) {
    if (!(await confirm("Supprimer cette équipe ?"))) return;
    try {
      await api(`/api/equipes-priere?id=${id}`, { method: "DELETE" });
      toast("Équipe supprimée.", "success");
      if (activeSujetId) await loadEquipes(activeSujetId);
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    }
  }

  const previewH = parseInt(form.heures, 10) || 0;
  const previewM = parseInt(form.minutes, 10) || 0;
  const previewTempsMis = previewH * 60 + previewM;
  const previewPers = parseInt(form.personnes, 10) || 1;
  const previewVolume = previewTempsMis * previewPers;

  const totalStats = useMemo(() => {
    let totalTempsMis = 0;
    let totalPersonnes = 0;
    let totalVolume = 0;
    for (const eq of equipes) {
      totalTempsMis += eq.tempsMis;
      totalPersonnes += eq.nombrePersonnes;
      totalVolume += eq.tempsMis * eq.nombrePersonnes;
    }
    return { totalTempsMis, totalPersonnes, totalVolume };
  }, [equipes]);

  return (
    <div className="wrap">
      <Link href="/" className="back-link">
        ← Accueil
      </Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo" className="logo" />
        <div className="titles">
          <h1>ÉQUIPES DE PRIÈRE</h1>
          <div className="sub">Gestion des sujets de prière et équipes par zone</div>
        </div>
      </header>

      <div className="card">
        <h3>Sujets de prière</h3>
        <div className="cahiers">
          {sujets.length === 0 ? (
            <div className="empty">Aucun sujet de prière.</div>
          ) : (
            sujets.map((s) => (
              <div
                key={s.id}
                className={"cahier-btn" + (s.id === activeSujetId ? " active" : "")}
                onClick={() => setActiveSujetId(s.id)}
              >
                <span className="nom">{s.nom}</span>
                <div className="cahier-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="link-btn danger" onClick={() => deleteSujet(s.id)}>
                    Supprimer
                  </button>
                </div>
              </div>
            ))
          )}
          <button className="cahier-add" onClick={addSujet}>
            + Nouveau sujet
          </button>
        </div>
      </div>

      {activeSujet && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>
              Ajouter une équipe — {activeSujet.nom}
            </h3>
            <form onSubmit={submitEquipe}>
              <div className="row">
                <div className="field">
                  <label>Zone</label>
                  <input
                    type="text"
                    placeholder="Ex: Palmeraie Faya"
                    value={form.zone}
                    onChange={(e) => setForm({ ...form, zone: e.target.value })}
                  />
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Date de début</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="29/08/2026"
                    value={form.dateDebut}
                    onChange={(e) =>
                      setForm({ ...form, dateDebut: formatDateInput(e.target.value) })
                    }
                  />
                </div>
                <div className="field">
                  <label>Date de fin</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="02/09/2026"
                    value={form.dateFin}
                    onChange={(e) =>
                      setForm({ ...form, dateFin: formatDateInput(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Temps mis (heures)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.heures}
                    onChange={(e) => setForm({ ...form, heures: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Temps mis (minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={form.minutes}
                    onChange={(e) => setForm({ ...form, minutes: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>👥 Nombre de personnes</label>
                  <input
                    type="number"
                    min="1"
                    value={form.personnes}
                    onChange={(e) => setForm({ ...form, personnes: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-actions" style={{ marginTop: 12 }}>
                <button className="btn" type="submit">
                  Ajouter l&apos;équipe
                </button>
              </div>
              {error && <div className="err">{error}</div>}
              {previewTempsMis > 0 && (
                <div className="preview">
                  Aperçu : Temps mis = <strong>{fmtDuree(previewTempsMis)}</strong> —
                  👥 Nombre de personnes = <strong>{previewPers}</strong> — Volume ={" "}
                  <strong>{fmtDuree(previewVolume)}</strong>
                </div>
              )}
            </form>
          </div>

          <div className="card">
            <div className="table-actions">
              <strong>{activeSujet.nom} — Équipes</strong>
            </div>
            {equipes.length === 0 ? (
              <div className="empty">Aucune équipe pour ce sujet.</div>
            ) : (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Zone</th>
                        <th>Période</th>
                        <th>Temps mis</th>
                        <th>👥 Nbre de pers</th>
                        <th>Volume</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {equipes.map((eq, i) => {
                        const volume = eq.tempsMis * eq.nombrePersonnes;
                        const periode =
                          eq.dateDebut === eq.dateFin
                            ? fmtDate(eq.dateDebut)
                            : `${fmtDate(eq.dateDebut)} au ${fmtDate(eq.dateFin)}`;
                        return (
                          <tr key={eq.id}>
                            <td>{i + 1}</td>
                            <td>{eq.zone}</td>
                            <td>{periode}</td>
                            <td>{fmtDuree(eq.tempsMis)}</td>
                            <td>{eq.nombrePersonnes}</td>
                            <td>{fmtDuree(volume)}</td>
                            <td>
                              <button
                                className="del-line"
                                onClick={() => deleteEquipe(eq.id)}
                              >
                                Supprimer
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="total">
                        <td colSpan={3}>Total ({equipes.length} équipes)</td>
                        <td>{fmtDuree(totalStats.totalTempsMis)}</td>
                        <td>{totalStats.totalPersonnes}</td>
                        <td>{fmtDuree(totalStats.totalVolume)}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
      {node}
    </div>
  );
}
