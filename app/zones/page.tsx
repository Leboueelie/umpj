"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { Zone } from "@/lib/types";
import { tempsMisMin, cumulMin, fmtDuree } from "@/lib/calc";

function formatTimeInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return d.slice(0, 2) + ":" + d.slice(2, 4);
}
function shiftMois(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function moisCourant(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface Val { d: string; f: string; p: string; }

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

  useEffect(() => { loadZones(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadEntrees(); /* eslint-disable-next-line */ }, [mois]);

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
    for (const z of list) init[z.id] = { d: "", f: "", p: "" };
    try {
      const rows = await api<any[]>(`/api/zones/entrees?mois=${mois}`);
      for (const r of rows)
        init[r.zoneId] = { d: r.heureDebut, f: r.heureFin, p: String(r.participants) };
    } catch {}
    setVals(init);
  }

  function setVal(zoneId: string, patch: Partial<Val>) {
    setVals((v) => ({ ...v, [zoneId]: { ...(v[zoneId] || { d: "", f: "", p: "" }), ...patch } }));
    setSaved(false);
  }

  const totaux = useMemo(() => {
    let totP = 0, totC = 0;
    for (const z of zones) {
      const v = vals[z.id]; if (!v) continue;
      const tm = tempsMisMin(v.d, v.f);
      const p = parseInt(v.p || "0", 10);
      if (tm !== null && p >= 1) { totP += p; totC += cumulMin(tm, p) || 0; }
    }
    return { totP, totC };
  }, [zones, vals]);

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const entrees = zones.map((z) => ({
        zoneId: z.id,
        heureDebut: vals[z.id]?.d || "",
        heureFin: vals[z.id]?.f || "",
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
          <input
            type="month"
            className="month-input"
            value={mois}
            onChange={(e) => e.target.value && setMois(e.target.value)}
          />
          <button className="step-btn" onClick={() => setMois(shiftMois(mois, 1))} aria-label="Mois suivant">›</button>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Zone</th>
                <th>Début</th>
                <th>Fin</th>
                <th>Participant(s)</th>
                <th>Temps mis</th>
                <th>Cumul</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => {
                const v = vals[z.id] || { d: "", f: "", p: "" };
                const tm = tempsMisMin(v.d, v.f);
                const p = parseInt(v.p || "0", 10);
                const cu = tm !== null && p >= 1 ? cumulMin(tm, p) : null;
                return (
                  <tr key={z.id}>
                    <td>{z.nom}</td>
                    <td>
                      <input type="text" inputMode="numeric" placeholder="08:00" value={v.d}
                        onChange={(e) => setVal(z.id, { d: formatTimeInput(e.target.value) })} />
                    </td>
                    <td>
                      <input type="text" inputMode="numeric" placeholder="20:00" value={v.f}
                        onChange={(e) => setVal(z.id, { f: formatTimeInput(e.target.value) })} />
                    </td>
                    <td>
                      <input type="number" min="1" value={v.p}
                        onChange={(e) => setVal(z.id, { p: e.target.value })} />
                    </td>
                    <td>{tm !== null ? fmtDuree(tm) : "—"}</td>
                    <td>{cu !== null ? fmtDuree(cu) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total">
                <td>Total national</td>
                <td></td>
                <td></td>
                <td>{totaux.totP} participants</td>
                <td></td>
                <td>{fmtDuree(totaux.totC)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="form-actions" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer le mois"}
          </button>
          {saved && <span className="note">Fiche enregistrée.</span>}
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
