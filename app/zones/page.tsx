"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import type { Zone } from "@/lib/types";
import { tempsMisMin, cumulMin, fmtDuree, parseDureeMinutes, fmtMinToHeure } from "@/lib/calc";
import { exportFicheZones, parseImportZonesFile } from "@/lib/excel";

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

interface Val { d: string; f: string; p: string; t: string; }

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
  const [recap, setRecap] = useState<{ mois: string; totP: number; totC: number }[]>([]);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadZones(); loadRecap(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadEntrees(); /* eslint-disable-next-line */ }, [mois]);

  async function loadRecap() {
    try { setRecap(await api<{ mois: string; totP: number; totC: number }[]>("/api/zones/recap")); }
    catch {}
  }

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
    for (const z of list) init[z.id] = { d: "", f: "", p: "", t: "" };
    try {
      const rows = await api<any[]>(`/api/zones/entrees?mois=${mois}`);
      for (const r of rows)
        init[r.zoneId] = {
          d: r.heureDebut,
          f: r.heureFin,
          p: String(r.participants),
          t: fmtMinToHeure(r.tempsMis),
        };
    } catch {}
    setVals(init);
  }

  function setVal(zoneId: string, patch: Partial<Val>) {
    setVals((v) => ({ ...v, [zoneId]: { ...(v[zoneId] || { d: "", f: "", p: "", t: "" }), ...patch } }));
    setSaved(false);
  }

  const totaux = useMemo(() => {
    let totP = 0, totC = 0;
    for (const z of zones) {
      const v = vals[z.id]; if (!v) continue;
      const tm = tempsMisMin(v.d, v.f);
      const duree = tm ?? parseDureeMinutes(v.t);
      const p = parseInt(v.p || "0", 10);
      if (duree !== null && p >= 1) { totP += p; totC += cumulMin(duree, p) || 0; }
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
        tempsMis: vals[z.id]?.t || "",
        participants: parseInt(vals[z.id]?.p || "0", 10),
      }));
      await api("/api/zones/entrees", {
        method: "POST",
        body: JSON.stringify({ mois, entrees }),
      });
      setSaved(true);
      await loadRecap();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function exportFiche() {
    try { await exportFicheZones(mois, zones, vals, recap); }
    catch (e) { setError("Échec export : " + (e as Error).message); }
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
      await loadRecap();
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
          <input
            type="month"
            className="month-input"
            value={mois}
            onChange={(e) => e.target.value && setMois(e.target.value)}
          />
          <button className="step-btn" onClick={() => setMois(shiftMois(mois, 1))} aria-label="Mois suivant">›</button>
        </div>

        <p className="note">
          Les participants sont déclarés par la zone. Pour le temps de prière, renseignez
          soit <strong>Début</strong> et <strong>Fin</strong>, soit le <strong>Temps mis</strong> directement
          (les deux sont facultatifs ; lignes en orange = temps mis à saisir).
        </p>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="ncol">N°</th>
                <th>Zone</th>
                <th>Début</th>
                <th>Fin</th>
                <th>Participant(s)</th>
                <th>Temps mis</th>
                <th>Cumul</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z, i) => {
                const v = vals[z.id] || { d: "", f: "", p: "", t: "" };
                const tmCalcule = tempsMisMin(v.d, v.f);
                const direct = parseDureeMinutes(v.t);
                const duree = tmCalcule ?? direct;
                const p = parseInt(v.p || "0", 10);
                const aDesParticipants = p >= 1;
                const tempsManquant = aDesParticipants && duree === null;
                const cu = duree !== null && aDesParticipants ? cumulMin(duree, p) : null;
                return (
                  <tr key={z.id} className={tempsManquant ? "manquant" : undefined}>
                    <td className="ncol">{i + 1}</td>
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
                    <td className={tempsManquant ? "warn" : undefined}>
                      {tmCalcule !== null ? (
                        <span className="readonly">{fmtDuree(tmCalcule)}</span>
                      ) : (
                        <input type="text" inputMode="numeric" placeholder="02:00" value={v.t}
                          onChange={(e) => setVal(z.id, { t: formatTimeInput(e.target.value) })} />
                      )}
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
          <button className="btn secondary" type="button" onClick={exportFiche}>
            Export Excel
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
        <h3 style={{ margin: "0 0 8px", color: "var(--navy)" }}>Cumul national multi-mois</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mois</th>
                <th>Total participants</th>
                <th>Total cumul</th>
              </tr>
            </thead>
            <tbody>
              {recap.map((r) => (
                <tr key={r.mois}>
                  <td>{r.mois}</td>
                  <td>{r.totP}</td>
                  <td>{fmtDuree(r.totC)}</td>
                </tr>
              ))}
              {recap.length === 0 && (
                <tr><td colSpan={3} className="empty">Aucune donnée enregistrée.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="total">
                <td>Total général</td>
                <td>{recap.reduce((a, r) => a + r.totP, 0)}</td>
                <td>{fmtDuree(recap.reduce((a, r) => a + r.totC, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="note">Export Excel ci-dessus inclut cette feuille « Récapitulatif ».</p>
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
