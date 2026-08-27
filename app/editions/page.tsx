"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { moisLabel } from "@/lib/mois";

interface EditionResume {
  id: string;
  numero: number;
  reference: string;
  dateDebut: string;
  dateFin: string;
  libellePeriode: string;
}

export default function EditionsList() {
  const [editions, setEditions] = useState<EditionResume[]>([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await fetch("/api/editions");
    const d = await r.json();
    setEditions(Array.isArray(d) ? d : []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImporting(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/editions/import", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Échec import.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <main className="wrap">
      <Link href="/" className="back-link">← Accueil</Link>
      <header className="app-header">
        <img src="/logo.png" alt="Logo UMPJ" className="logo" />
        <div className="titles">
          <h1>EDITIONS DE L'UMPJ</h1>
          <div className="sub">Rapports par édition</div>
        </div>
      </header>

      <div className="form-actions" style={{ marginBottom: 14 }}>
        <Link href="/editions/nouvelle/edit" className="btn">+ Nouvelle édition</Link>
        <button type="button" className="btn secondary" onClick={() => fileRef.current?.click()} disabled={importing} title="Importer un fichier Excel (.xlsx/.xls/.csv) ou un rapport PDF de l'UMPJ">
          {importing ? "Import…" : "Importer (Excel / PDF)"}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf" style={{ display: "none" }} onChange={onImport} />
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
          Formats acceptés : Excel (.xlsx, .xls, .csv) ou PDF (rapport UMPJ)
        </span>
      </div>

      {error && <div className="err">{error}</div>}

      {editions.length === 0 ? (
        <div className="card">
          <p style={{ color: "var(--muted)" }}>Aucune édition enregistrée pour l'instant.</p>
        </div>
      ) : (
        <div className="cards-grid">
          {editions.map((e) => (
            <Link key={e.id} href={`/editions/${e.id}`} className="section-card">
              <div className="section-title">{e.numero}e ÉDITION</div>
              <div className="section-desc">
                {e.libellePeriode || `${e.dateDebut} → ${e.dateFin}`}
              </div>
              <div className="section-desc" style={{ fontSize: "0.8rem", marginTop: 4 }}>
                {e.reference || "—"}
              </div>
              <span className="section-go">Ouvrir &rarr;</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
