"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { Cahier, Ligne } from "@/lib/types";
import { tempsMisMin, cumulMin, fmtDuree, fmtDate, normalizeHeure, normalizeDate } from "@/lib/calc";
import { exportCahier, exportGlobal, parseImportFile } from "@/lib/excel";

function formatDateInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  const parts: string[] = [];
  if (d.length > 0) parts.push(d.slice(0, 2));
  if (d.length >= 3) parts.push(d.slice(2, 4));
  if (d.length >= 5) parts.push(d.slice(4, 8));
  return parts.join("/");
}
function formatTimeInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return d.slice(0, 2) + ":" + d.slice(2, 4);
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

export default function App() {
  const [cahiers, setCahiers] = useState<Cahier[]>([]);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: isoToDisplay(new Date().toISOString().slice(0, 10)),
    debut: "08:00",
    fin: "20:00",
    personnes: "1",
  });
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const data = await api<{ cahiers: Cahier[]; lignes: Ligne[] }>("/api/cahiers");
      setCahiers(data.cahiers);
      setLignes(data.lignes);
      setActiveId((prev) =>
        data.cahiers.find((c) => c.id === prev) ? prev : data.cahiers[0]?.id ?? null
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [searchLigne, setSearchLigne] = useState("");
  const [year, setYear] = useState("");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anneesDispo = useMemo(
    () =>
      Array.from(new Set(lignes.map((l) => (l.date || "").slice(0, 4))))
        .filter(Boolean)
        .sort()
        .reverse(),
    [lignes]
  );
  const lignesAnnee = useMemo(
    () => (year ? lignes.filter((l) => (l.date || "").startsWith(year)) : lignes),
    [lignes, year]
  );

  const completParCahier = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of cahiers) map[c.id] = 0;
    for (const l of lignesAnnee) {
      const tm = tempsMisMin(l.heureDebut, l.heureFin);
      const cu = cumulMin(tm, l.nombrePersonnes);
      if (cu !== null) map[l.cahierId] = (map[l.cahierId] || 0) + cu;
    }
    return map;
  }, [cahiers, lignesAnnee]);

  const activeCahier = cahiers.find((c) => c.id === activeId) || cahiers[0];
  const activeLignes = (lignesAnnee || [])
    .filter((l) => l.cahierId === (activeCahier && activeCahier.id))
    .sort((a, b) => (a.date + a.heureDebut).localeCompare(b.date + b.heureDebut));

  const cahiersFiltres = useMemo(
    () => cahiers.filter((c) => c.nom.toLowerCase().includes(search.trim().toLowerCase())),
    [cahiers, search]
  );
  const lignesFiltrees = useMemo(
    () =>
      activeLignes.filter((l) =>
        `${l.date} ${l.heureDebut} ${l.heureFin} ${l.nombrePersonnes}`
          .toLowerCase()
          .includes(searchLigne.trim().toLowerCase())
      ),
    [activeLignes, searchLigne]
  );

  const previewTm = tempsMisMin(form.debut, form.fin);
  const previewPers = parseInt(form.personnes, 10);
  const previewCum = cumulMin(previewTm, previewPers >= 1 ? previewPers : null);

  async function addCahier() {
    const nom = prompt("Nom du nouveau cahier :", "Cahier " + (cahiers.length + 1));
    if (!nom) return;
    try {
      await api("/api/cahiers", { method: "POST", body: JSON.stringify({ nom }) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteCahier(id: string) {
    if (cahiers.length <= 1) {
      alert("Impossible de supprimer le dernier cahier.");
      return;
    }
    const c = cahiers.find((x) => x.id === id);
    if (!confirm('Supprimer le cahier "' + c?.nom + '" et toutes ses lignes ?')) return;
    try {
      await api("/api/cahiers/" + id, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function renameCahier(id: string) {
    const c = cahiers.find((x) => x.id === id);
    const nom = prompt("Renommer le cahier :", c?.nom || "");
    if (!nom) return;
    try {
      await api("/api/cahiers/" + id, { method: "PUT", body: JSON.stringify({ nom }) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submitLigne(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { date, debut, fin, personnes } = form;
    const pers = parseInt(personnes, 10);
    const dateNorm = normalizeDate(date);
    const debutNorm = normalizeHeure(debut);
    const finNorm = normalizeHeure(fin);
    if (!dateNorm || !debutNorm || !finNorm) {
      setError("Date, heure de début et de fin sont obligatoires (ex : 25/08/2025, 8h30, 20:15, 830).");
      return;
    }
    if (!pers || pers < 1) {
      setError("Le nombre de participants doit être ≥ 1.");
      return;
    }
    if (tempsMisMin(debutNorm, finNorm) === null) {
      setError("Horaires invalides.");
      return;
    }
    try {
      if (editingId) {
        await api("/api/lignes/" + editingId, {
          method: "PUT",
          body: JSON.stringify({ date: dateNorm, heureDebut: debutNorm, heureFin: finNorm, nombrePersonnes: pers }),
        });
      } else {
        await api("/api/lignes", {
          method: "POST",
          body: JSON.stringify({
            cahierId: activeCahier.id,
            date: dateNorm,
            heureDebut: debutNorm,
            heureFin: finNorm,
            nombrePersonnes: pers,
          }),
        });
      }
      setEditingId(null);
      setForm({ ...form, debut: "08:00", fin: "20:00", personnes: "1" });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteLigne(id: string) {
    if (!confirm("Supprimer cette ligne ?")) return;
    try {
      await api("/api/lignes/" + id, { method: "DELETE" });
      if (editingId === id) {
        setEditingId(null);
        setForm({ ...form, debut: "08:00", fin: "20:00", personnes: "1" });
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function editLigne(l: Ligne) {
    setEditingId(l.id);
    setForm({
      date: isoToDisplay(l.date),
      debut: l.heureDebut,
      fin: l.heureFin,
      personnes: String(l.nombrePersonnes),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...form, debut: "", fin: "", personnes: "1" });
    setError("");
  }

  async function handleImport(file: File) {
    setImporting(true);
    setError("");
    setNote("");
    try {
      const imported = await parseImportFile(file);
      if (imported.length === 0) {
        setError("Aucune donnée exploitable trouvée dans le fichier.");
        return;
      }
      const r = await api<{
        cahiersCrees: number;
        cahiersFondus: number;
        cahiersIgnores: number;
        lignesCrees: number;
        lignesIgnorees: number;
      }>("/api/import", {
        method: "POST",
        body: JSON.stringify({ cahiers: imported }),
      });
      const parts = [
        `${r.cahiersCrees} cahier(s) créé(s)`,
        r.cahiersFondus ? `${r.cahiersFondus} cahier(s) fusionné(s)` : null,
        r.cahiersIgnores ? `${r.cahiersIgnores} cahier(s) déjà à jour ignoré(s)` : null,
        `${r.lignesCrees} ligne(s) ajoutée(s)`,
        r.lignesIgnorees ? `${r.lignesIgnorees} doublon(s) ignoré(s)` : null,
      ].filter(Boolean);
      if (r.cahiersCrees === 0 && r.lignesCrees === 0) {
        setError("Rien à importer (cahiers et lignes déjà présents).");
      } else {
        setNote(parts.join(" · "));
      }
      await load();
    } catch (e) {
      setError("Échec de l'import : " + (e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="wrap">
      <header className="app-header">
        <img src="/logo.png" alt="Logo" className="logo" />
        <div className="titles">
          <h1>MAISON DE PRIERE D&apos;ABIDJAN POUR TOUTES LES NATIONS</h1>
          <div className="sub">Application partagée — données enregistrées sur la base commune</div>
        </div>
      </header>

      <div className="card">
        <div className="filters">
          <input
            type="text"
            placeholder="Rechercher un cahier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Filtrer par année">
            <option value="">Toutes les années</option>
            {anneesDispo.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="cahiers">
          {cahiersFiltres.length === 0 ? (
            <div className="empty">Aucun cahier trouvé.</div>
          ) : (
            cahiersFiltres.map((c) => (
            <div
              key={c.id}
              className={"cahier-btn" + (c.id === (activeCahier && activeCahier.id) ? " active" : "")}
              onClick={() => setActiveId(c.id)}
            >
              <span className="nom">{c.nom}</span>
              <span className="complet">Complet : {fmtDuree(completParCahier[c.id] || 0)}</span>
              <div className="cahier-actions" onClick={(e) => e.stopPropagation()}>
                <button className="link-btn" onClick={() => renameCahier(c.id)}>
                  Renommer
                </button>
                <button className="link-btn danger" onClick={() => deleteCahier(c.id)}>
                  Supprimer
                </button>
              </div>
            </div>
          )))}
          <button className="cahier-add" onClick={addCahier}>
            + Nouveau cahier
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          {editingId ? "Modification d'une ligne" : "Saisie d'une ligne"}{" "}
          {activeCahier ? "— " + activeCahier.nom : ""}
        </h3>
        <form onSubmit={submitLigne}>
          <div className="row">
            <div className="field">
              <label>Date</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="25/08/2025"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: formatDateInput(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Heure de début</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="08:30"
                value={form.debut}
                onChange={(e) => setForm({ ...form, debut: formatTimeInput(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Heure de fin</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="20:30"
                value={form.fin}
                onChange={(e) => setForm({ ...form, fin: formatTimeInput(e.target.value) })}
              />
            </div>
            <div className="field">
                <label>Participant(s)</label>
              <input
                type="number"
                min="1"
                value={form.personnes}
                onChange={(e) => setForm({ ...form, personnes: e.target.value })}
              />
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" type="submit">
              {editingId ? "Enregistrer les modifications" : "Ajouter la ligne"}
            </button>
            {editingId && (
              <button className="btn secondary" type="button" onClick={cancelEdit}>
                Annuler
              </button>
            )}
            <button
              className="btn secondary"
              type="button"
              onClick={() =>
                activeCahier
                  ? exportCahier(activeCahier, lignes).catch((e) => setError((e as Error).message))
                  : undefined
              }
            >
              Export Excel (cahier)
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => exportGlobal(cahiers, lignes).catch((e) => setError((e as Error).message))}
            >
              Export global
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? "Import…" : "Importer (.xlsx/.csv)"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
          </div>
          {error && <div className="err">{error}</div>}
          {note && <div className="note">{note}</div>}
          {form.debut && form.fin && (
            <div className="preview">
              Aperçu : Temps mis = <strong>{fmtDuree(previewTm)}</strong>
              {" "}
              — Cumul = <strong>{fmtDuree(previewCum)}</strong>
            </div>
          )}
        </form>
      </div>

      <div className="card">
        <div className="table-actions">
          <strong>{activeCahier ? activeCahier.nom : ""} — lignes</strong>
          <input
            type="text"
            placeholder="Filtrer (date, heure, participants)…"
            value={searchLigne}
            onChange={(e) => setSearchLigne(e.target.value)}
          />
        </div>
        {activeLignes.length === 0 ? (
          <div className="empty">Aucune ligne pour ce cahier.</div>
        ) : lignesFiltrees.length === 0 ? (
          <div className="empty">Aucun résultat pour cette recherche.</div>
        ) : (
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Date</th>
                <th>Début</th>
                <th>Fin</th>
                <th>Participant(s)</th>
                <th>Temps mis</th>
                <th>Cumul</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lignesFiltrees.map((l, i) => {
                const tm = tempsMisMin(l.heureDebut, l.heureFin);
                const cu = cumulMin(tm, l.nombrePersonnes);
                return (
                  <tr key={l.id}>
                    <td>{i + 1}</td>
                    <td>{fmtDate(l.date)}</td>
                    <td>{l.heureDebut}</td>
                    <td>{l.heureFin}</td>
                    <td>{l.nombrePersonnes}</td>
                    <td>{fmtDuree(tm)}</td>
                    <td>{fmtDuree(cu)}</td>
                    <td>
                      <button className="link-btn" onClick={() => editLigne(l)}>
                        Modifier
                      </button>{" "}
                      <button className="del-line" onClick={() => deleteLigne(l.id)}>
                        Supprimer
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="total">
                <td colSpan={6}>Complet</td>
                <td>{fmtDuree(completParCahier[activeCahier?.id || ""] || 0)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
