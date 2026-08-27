"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import type { Zone } from "@/lib/types";
import { cumulMin, fmtDuree, parseDureeMinutes, fmtMinToHeure, formatDureeInput } from "@/lib/calc";
import { parseImportZonesFile } from "@/lib/excel";

function shiftMois(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function moisCourant(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
function anneesDispo(): string[] {
  const y = new Date().getFullYear();
  const out: string[] = [];
  for (let a = y - 10; a <= y + 10; a++) out.push(String(a));
  return out;
}

interface Val { p: string; t: string; }

async function api<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data as T;
}

export default function Zones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [mois, setMois] = useState<string>(moisCourant());
  const [vals, setVals] = useState<Record<string, Val>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [newZone, setNewZone] = useState("");
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadZones(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadEntrees(); /* eslint-disable-next-line */ }, [mois]);
  useEffect(() => {
    try {
      const m = new URLSearchParams(window.location.search).get("mois");
      if (m && /^\d{4}-\d{2}$/.test(m)) setMois(m);
    } catch {}
  }, []);

  async function loadZones() {
    try {
      const z = await api<Zone[]>("/api/zones");
      setZones(z);
      await loadEntrees(z);
    } catch (e) { setError((e as Error).message); }
  }
  async function loadEntrees(zl?: Zone[]) {
    const list = zl && zl.length ? zl : zones;
    const init: Record<string, Val> = {};
    for (const z of list) init[z.id] = { p: "", t: "" };
    try {
      const rows = await api<any[]>(`/api/zones/entrees?mois=${mois}`);
      for (const r of rows)
        init[r.zoneId] = {
          p: String(r.participants),
          t: fmtMinToHeure(r.tempsMis),
        };
    } catch {}
    setVals(init);
  }

  function setVal(zoneId: string, patch: Partial<Val>) {
    setVals((v) => ({ ...v, [zoneId]: { ...(v[zoneId] || { p: "", t: "" }), ...patch } }));
    setSaved(false);
  }

  const totaux = useMemo(() => {
    let totP = 0, totC = 0, totT = 0;
    for (const z of zones) {
      const v = vals[z.id]; if (!v) continue;
      const duree = parseDureeMinutes(v.t);
      const p = parseInt(v.p || "0", 10);
      if (duree !== null) totT += duree;
      if (duree !== null && p >= 1) { totP += p; totC += cumulMin(duree, p) || 0; }
    }
    return { totP, totC, totT };
  }, [zones, vals]);

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const entrees = zones.map((z) => ({
        zoneId: z.id,
        tempsMis: vals[z.id]?.t || "",
        participants: parseInt(vals[z.id]?.p || "0", 10),
      }));
      await api("/api/zones/entrees", {
        method: "POST",
        body: JSON.stringify({ mois, entrees }),
      });
      setSaved(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function handleImport(file: File) {
    setImporting(true); setError(""); setMsg("");
    try {
      const lignes = await parseImportZonesFile(file);
      if (lignes.length === 0) { setError("Aucune donnée exploitable trouvée dans le fichier."); return; }
      const r = await api("/api/zones/import", {
        method: "POST",
        body: JSON.stringify({ mois, lignes }),
      });
      const parts = [
        `${r.creees} entrée(s) ajoutée(s)`,
        r.maj ? `${r.maj} mise(s) à jour` : null,
        r.zonesCrees ? `${r.zonesCrees} zone(s) créée(s)` : null,
        r.supprimees ? `${r.supprimees} supprimée(s)` : null,
        r.ignorees ? `${r.ignorees} ignorée(s)` : null,
      ].filter(Boolean);
      setMsg(parts.join(" · "));
      await loadEntrees();
    } catch (e) { setError("Échec import : " + (e as Error).message); }
    finally { setImporting(false); }
  }

  async function addZone() {
    const nom = newZone.trim(); if (!nom) return;
    try {
      const z = await api<Zone>("/api/zones", { method: "POST", body: JSON.stringify({ nom }) });
      setZones((zs) => [...zs, z]);
      setNewZone("");
    } catch (e) { setError((e as Error).message); }
  }
  async function renameZone(z: Zone) {
    const nom = z.nom.trim();
    if (!nom) return;
    try {
      const u = await api<Zone>(`/api/zones/${z.id}`, { method: "PATCH", body: JSON.stringify({ nom }) });
      setZones((zs) => zs.map((x) => (x.id === u.id ? u : x)));
    } catch (e) { setError((e as Error).message); }
  }
  async function deleteZone(z: Zone) {
    if (!confirm(`Supprimer la zone « ${z.nom} » et ses entrées ?`)) return;
    try {
      await api(`/api/zones/${z.id}`, { method: "DELETE" });
      setZones((zs) => zs.filter((x) => x.id !== z.id));
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <main className="wrap">
      <Link href="/" className="back-link">← Accueil</Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo UMPJ" className="logo" />
        <div className="titles">
          <h1>Fiche mensuelle des heures de prière</h1>
          <div className="sub">Par zone / région spirituelle</div>
        </div>
      </header>

      <div className="card">
        <div className="month-nav">
          <button className="step-btn" onClick={() => setMois(shiftMois(mois, -1))} aria-label="Mois précédent">‹</button>
          <select
            value={Number(mois.slice(5, 7))}
            onChange={(e) =>
              setMois(`${mois.slice(0, 4)}-${String(e.target.value).padStart(2, "0")}`)
            }
            aria-label="Mois"
          >
            {MOIS_FR.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={mois.slice(0, 4)}
            onChange={(e) =>
              setMois(`${e.target.value}-${mois.slice(5, 7)}`)
            }
            aria-label="Année"
          >
            {anneesDispo().map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button className="step-btn" onClick={() => setMois(shiftMois(mois, 1))} aria-label="Mois suivant">›</button>
        </div>

        <Link href="/zones/fiches" className="link-btn">Voir toutes les fiches →</Link>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="ncol">N°</th>
                <th>Zone</th>
                <th>Temps mis</th>
                <th>Participant(s)</th>
                <th>Cumul</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z, i) => {
                const v = vals[z.id] || { p: "", t: "" };
                const duree = parseDureeMinutes(v.t);
                const p = parseInt(v.p || "0", 10);
                const aDesParticipants = p >= 1;
                const tempsManquant = aDesParticipants && duree === null;
                const cu = duree !== null && aDesParticipants ? cumulMin(duree, p) : null;
                return (
                  <tr key={z.id} className={tempsManquant ? "manquant" : undefined}>
                    <td className="ncol">{i + 1}</td>
                    <td>{z.nom}</td>
                    <td className={tempsManquant ? "warn" : undefined}>
                      <input type="text" inputMode="numeric" placeholder="02:00" value={v.t}
                        onChange={(e) => setVal(z.id, { t: formatDureeInput(e.target.value) })} />
                    </td>
                    <td>
                      <input type="number" min="1" value={v.p}
                        onChange={(e) => setVal(z.id, { p: e.target.value })} />
                    </td>
                    <td className={tempsManquant ? "warn" : undefined}>
                      {cu !== null ? fmtDuree(cu) : (tempsManquant ? "à saisir" : "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total">
                <td></td>
                <td>Total national</td>
                <td>{fmtDuree(totaux.totT)}</td>
                <td>{totaux.totP} participants</td>
                <td style={{ color: "var(--muted)" }}>{fmtDuree(totaux.totC)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="form-actions" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer le mois"}
          </button>
          <button className="btn secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? "Import…" : "Importer (.xlsx/.csv)"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
          {saved && <span className="note">Fiche enregistrée.</span>}
          {msg && <span className="note">{msg}</span>}
        </div>
        {error && <div className="err">{error}</div>}
      </div>

      <div className="card">
        <button className="link-btn" onClick={() => setManageOpen((o) => !o)}>
          {manageOpen ? "Masquer la gestion des zones" : "Gérer les zones"}
        </button>
        {manageOpen && (
          <div style={{ marginTop: 10 }}>
            <div className="filters">
              <input type="text" placeholder="Nouvelle zone…" value={newZone}
                onChange={(e) => setNewZone(e.target.value)} />
              <button className="btn" onClick={addZone}>Ajouter</button>
            </div>
            <ul className="zone-list">
              {zones.map((z) => (
                <li key={z.id}>
                  <input type="text" value={z.nom}
                    onChange={(e) => setZones((zs) => zs.map((x) => (x.id === z.id ? { ...x, nom: e.target.value } : x)))}
                    onBlur={() => renameZone(z)} />
                  <button className="link-btn danger" onClick={() => deleteZone(z)}>Supprimer</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
