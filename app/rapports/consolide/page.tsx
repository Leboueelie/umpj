"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/nav/PageHeader";
import { VueRapport } from "@/components/rapports/VueRapport";
import { MODULES_CONSOLides } from "@/lib/rapport-consolide";
import type { RapportConsolide, SectionConsolidee } from "@/lib/rapport-consolide";
import type { RapportModule } from "@/lib/rapports";

export default function RapportConsolidePage() {
  const [selection, setSelection] = useState<string[]>([]);
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [rapport, setRapport] = useState<RapportConsolide | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [phase, setPhase] = useState<"attente" | "chargement" | "pret" | "erreur">("attente");
  const [formatArchive, setFormatArchive] = useState<"pdf" | "xlsx" | "both">("both");
  const [archivageEnCours, setArchivageEnCours] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);

  const groupes = Array.from(new Set(MODULES_CONSOLides.map((m) => m.groupe)));

  function toggle(id: string) {
    setSelection((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function consulter() {
    if (selection.length === 0) {
      setErreur("Sélectionnez au moins un module.");
      setPhase("erreur");
      return;
    }
    if ((du && !au) || (!du && au)) {
      setErreur("Indiquez les deux bornes (Du et Au) ou aucune.");
      setPhase("erreur");
      return;
    }
    if (du && au && du > au) {
      setErreur("La date « Du » doit précéder la date « Au ».");
      setPhase("erreur");
      return;
    }
    setPhase("chargement");
    setErreur(null);
    const params = new URLSearchParams();
    params.set("modules", selection.join(","));
    if (du) params.set("du", du);
    if (au) params.set("au", au);
    try {
      const res = await fetch(`/api/rapports/consolide?${params.toString()}`);
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent("/rapports/consolide")}`;
        return;
      }
      if (!res.ok) {
        const corps = (await res.json().catch(() => null)) as { error?: string } | null;
        setErreur(corps?.error || "Impossible de calculer le rapport.");
        setPhase("erreur");
        return;
      }
      setRapport((await res.json()) as RapportConsolide);
      setPhase("pret");
    } catch {
      setErreur("Serveur injoignable.");
      setPhase("erreur");
    }
  }

  async function archiver() {
    if (selection.length === 0 || archivageEnCours) return;
    setArchivageEnCours(true);
    setErreur(null);
    const params = new URLSearchParams();
    params.set("modules", selection.join(","));
    if (du) params.set("du", du);
    if (au) params.set("au", au);
    params.set("format", formatArchive);
    try {
      const res = await fetch(`/api/rapports/historique?${params.toString()}`, { method: "POST" });
      const corps = (await res.json().catch(() => null)) as { id?: string; error?: string; message?: string } | null;
      if (!res.ok) {
        setErreur(corps?.error || "Échec de l'archivage.");
        return;
      }
      setArchiveId(corps?.id || null);
    } catch {
      setErreur("Serveur injoignable.");
    } finally {
      setArchivageEnCours(false);
    }
  }

  function reinitialiser() {
    setDu("");
    setAu("");
    setRapport(null);
    setPhase("attente");
    setErreur(null);
  }

  const urlPdf = (() => {
    if (selection.length === 0) return "";
    const params = new URLSearchParams();
    params.set("modules", selection.join(","));
    if (du) params.set("du", du);
    if (au) params.set("au", au);
    return `/api/rapports/consolide/pdf?${params.toString()}`;
  })();

  const urlXlsx = (() => {
    if (selection.length === 0) return "";
    const params = new URLSearchParams();
    params.set("modules", selection.join(","));
    if (du) params.set("du", du);
    if (au) params.set("au", au);
    return `/api/rapports/consolide/xlsx?${params.toString()}`;
  })();

  return (
    <main className="wrap">
      <Link href="/rapports" className="back-link">← Rapports</Link>
      <header className="accueil-identite" style={{ marginBottom: 18 }}>
        <img src="/logo.png" alt="" className="accueil-logo" />
        <div>
          <p className="accueil-kicker">Rapports</p>
          <h1 className="accueil-titre">Rapport consolidé</h1>
          <span className="accueil-filet" aria-hidden="true" />
          <p className="accueil-chapo">
            Sélectionnez un ou plusieurs modules, puis consultez l'aperçu avant de générer le PDF.
          </p>
        </div>
      </header>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Modules</h3>
        {groupes.map((g) => (
          <div key={g} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>
              {g}
            </div>
            <div className="cahiers">
              {MODULES_CONSOLides.filter((m) => m.groupe === g).map((m) => (
                <label
                  key={m.id}
                  className={"cahier-btn" + (selection.includes(m.id) ? " active" : "")}
                  style={{ cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={selection.includes(m.id)}
                    onChange={() => toggle(m.id)}
                    style={{ display: "none" }}
                  />
                  <span className="nom">{m.label}</span>
                  <span className="complet">{m.type}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Période (optionnelle)</h3>
        <div className="filters">
          <label className="field">
            Du
            <input type="date" value={du} onChange={(e) => setDu(e.target.value)} />
          </label>
          <label className="field">
            Au
            <input type="date" value={au} onChange={(e) => setAu(e.target.value)} />
          </label>
          <button type="button" className="btn" onClick={() => void consulter()} disabled={phase === "chargement"}>
            {phase === "chargement" ? "Consultation…" : "Consulter l'aperçu"}
          </button>
          <button type="button" className="btn secondary" onClick={reinitialiser} disabled={phase === "chargement"}>
            Réinitialiser
          </button>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "8px 0 0" }}>
          Sans période, les modules produisent un inventaire sur toutes les données disponibles.
          Les modules sans date (chambres) ignorent la période.
        </p>
      </div>

      {phase === "chargement" && <div className="card">Chargement…</div>}
      {phase === "erreur" && erreur && <div className="err">{erreur}</div>}
      {phase === "attente" && !rapport && (
        <div className="card">Sélectionnez des modules, puis cliquez sur « Consulter l'aperçu ».</div>
      )}

      {rapport && phase === "pret" && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Synthèse exécutive</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Volume examiné</th>
                    <th>Indicateurs clés</th>
                  </tr>
                </thead>
                <tbody>
                  {rapport.synthese.map((s) => (
                    <tr key={s.module}>
                      <td>{s.intitule}</td>
                      <td>{s.volume}</td>
                      <td style={{ fontSize: "0.85rem" }}>{s.resume}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "10px 0 0" }}>
              Rapport généré le {rapport.dateGeneration.replace("T", " ").slice(0, 19)} — auteur : {rapport.auteur}.
              Aucun total général inter-modules (unités non additionnables).
            </p>
          </div>

          {rapport.sections.map((s) => (
            <VueRapport key={s.module} rapport={s as unknown as RapportModule} />
          ))}

          <div className="form-actions" style={{ marginTop: 12 }}>
            {urlPdf && (
              <a className="btn" href={urlPdf} target="_blank" rel="noopener noreferrer">
                Générer le PDF
              </a>
            )}
            {urlXlsx && (
              <a className="btn secondary" href={urlXlsx} target="_blank" rel="noopener noreferrer">
                Exporter Excel
              </a>
            )}
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              Format d'archivage
              <select value={formatArchive} onChange={(e) => setFormatArchive(e.target.value as "pdf" | "xlsx" | "both")}>
                <option value="both">PDF + Excel</option>
                <option value="pdf">PDF uniquement</option>
                <option value="xlsx">Excel uniquement</option>
              </select>
            </label>
            <button type="button" className="btn secondary" onClick={() => void archiver()} disabled={selection.length === 0 || archivageEnCours}>
              {archivageEnCours ? "Archivage…" : "Archiver ce rapport"}
            </button>
            <button type="button" className="btn secondary" onClick={reinitialiser}>
              Nouvelle sélection
            </button>
          </div>
          {archiveId && (
            <div className="note" style={{ marginTop: 8 }}>
              Rapport archivé (id : {archiveId}). Le téléchargement historique sera disponible dans la prochaine phase (P4.3).
            </div>
          )}
        </>
      )}
    </main>
  );
}
