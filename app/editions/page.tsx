"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { fmtDate, fmtDuree } from "@/lib/calc";
import { useFeedback } from "@/components/Feedback";
import { api } from "@/lib/api";

interface EditionResume {
  id: string;
  numero: number;
  reference: string;
  dateDebut: string;
  dateFin: string;
  libellePeriode: string;
}

function ordinale(n: number): string {
  return n === 1 ? "1re" : `${n}e`;
}

export default function EditionsList() {
  const [editions, setEditions] = useState<EditionResume[]>([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const { toast } = useFeedback();
  const [apercu, setApercu] = useState<{
    fichier: File;
    data: any;
    erreurs: string[];
    avertissements: string[];
    bloquant: boolean;
    doublon: boolean;
  } | null>(null);
  const [confirmationEnCours, setConfirmationEnCours] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const d = await api<EditionResume[]>("/api/editions");
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
      const r = await fetch("/api/editions/import?preview=1", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Échec de l'analyse.");
      setApercu({
        fichier: f,
        data: d.data,
        erreurs: Array.isArray(d.erreurs) ? d.erreurs : [],
        avertissements: Array.isArray(d.avertissements) ? d.avertissements : [],
        bloquant: !!d.bloquant,
        doublon: !!d.doublon,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmerImport() {
    if (!apercu || apercu.bloquant || apercu.doublon || confirmationEnCours) return;
    setConfirmationEnCours(true);
    try {
      const fd = new FormData();
      fd.append("file", apercu.fichier);
      const r = await fetch("/api/editions/import", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) {
        const msg = d.error || "Échec import.";
        setApercu((a) =>
          a ? { ...a, erreurs: [...a.erreurs, msg], bloquant: true } : a
        );
        return;
      }
      toast("Édition importée.", "success");
      setApercu(null);
      await load();
    } catch (err) {
      setApercu((a) =>
        a ? { ...a, erreurs: [...a.erreurs, (err as Error).message], bloquant: true } : a
      );
    } finally {
      setConfirmationEnCours(false);
    }
  }

  return (
    <main className="wrap">
      <Link href="/" className="back-link">← Accueil</Link>
      <header className="accueil-identite" style={{ marginBottom: 18 }}>
        <img src="/logo.png" alt="" className="accueil-logo" />
        <div>
          <p className="accueil-kicker">Éditions</p>
          <h1 className="accueil-titre">Éditions de l&apos;UMPJ</h1>
          <span className="accueil-filet" aria-hidden="true" />
          <p className="accueil-chapo">
            Rapports officiels de l&apos;UMPJ, édition par édition.
          </p>
        </div>
      </header>

      <div className="form-actions" style={{ marginBottom: 14 }}>
        <Link href="/editions/nouvelle/edit" className="btn">+ Nouvelle édition</Link>
        <button type="button" className="btn secondary" onClick={() => fileRef.current?.click()} disabled={importing} title="Importer un fichier Excel (.xlsx/.xls/.csv) ou un rapport PDF de l'UMPJ">
          {importing ? "Import…" : "Importer (Excel / PDF)"}
        </button>
        <Link href="/editions/bilan" className="btn secondary">Bilan →</Link>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf" style={{ display: "none" }} onChange={onImport} />
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
          Formats acceptés : Excel (.xlsx, .xls, .csv) ou PDF (rapport UMPJ)
        </span>
      </div>

      {error && <div className="err">{error}</div>}

      {editions.length === 0 ? (
        <div className="empty">Aucune édition enregistrée pour l&apos;instant.</div>
      ) : (
        <div className="cards-grid">
          {editions.map((e) => (
            <Link key={e.id} href={`/editions/${e.id}`} className="section-card">
              <div className="section-title">{ordinale(e.numero)} ÉDITION</div>
              <div className="section-desc">
                {e.libellePeriode || `${fmtDate(e.dateDebut)} → ${fmtDate(e.dateFin)}`}
              </div>
              <div className="section-desc" style={{ fontSize: "0.8rem", marginTop: 4 }}>
                {e.reference || "—"}
              </div>
              <span className="section-go">Ouvrir &rarr;</span>
            </Link>
          ))}
        </div>
      )}
      {apercu && (
        <div className="modal-backdrop" onClick={() => !confirmationEnCours && setApercu(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3 style={{ marginTop: 0 }}>Prévisualisation de l'import</h3>
            <dl className="rapport-meta">
              <div><dt>Numéro</dt><dd>{apercu.data?.numero}</dd></div>
              <div><dt>Référence</dt><dd>{apercu.data?.reference || "—"}</dd></div>
              <div>
                <dt>Période</dt>
                <dd>
                  {apercu.data?.libellePeriode ||
                    `${apercu.data?.dateDebut} → ${apercu.data?.dateFin}`}
                </dd>
              </div>
              <div><dt>Délégations présentes</dt><dd>{apercu.data?.delegationsPresentes}</dd></div>
              <div><dt>Régions spirituelles</dt><dd>{apercu.data?.regionsSpirituelles}</dd></div>
              <div>
                <dt>Missionnaires n°1 / n°2</dt>
                <dd>{apercu.data?.missionnaires1} / {apercu.data?.missionnaires2}</dd>
              </div>
              <div>
                <dt>Anciens / épouses</dt>
                <dd>{apercu.data?.anciensAbidjan} / {apercu.data?.epousesAnciensAbidjan}</dd>
              </div>
              <div><dt>Moyenne de participation</dt><dd>{apercu.data?.moyenneParticipation}</dd></div>
              <div>
                <dt>Heures investies</dt>
                <dd>{fmtDuree(apercu.data?.heuresInvesties)} (somme des sessions)</dd>
              </div>
              <div><dt>Délégations extérieures</dt><dd>{apercu.data?.delegationsExterieures?.length ?? 0}</dd></div>
              <div><dt>Zones d'Abidjan</dt><dd>{apercu.data?.abidjanZones?.length ?? 0}</dd></div>
              <div><dt>Localités intérieur</dt><dd>{apercu.data?.interieurLocalites?.length ?? 0}</dd></div>
              <div><dt>Participants par jour</dt><dd>{apercu.data?.participantsParJour?.length ?? 0}</dd></div>
              <div><dt>Sessions</dt><dd>{apercu.data?.sessions?.length ?? 0}</dd></div>
            </dl>

            {apercu.doublon && (
              <div className="err" style={{ marginTop: 8 }}>
                Ce numéro d'édition existe déjà.
              </div>
            )}
            {apercu.erreurs.length > 0 && (
              <div className="err" style={{ marginTop: 8 }}>
                <strong>Erreurs bloquantes :</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {apercu.erreurs.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            {apercu.avertissements.length > 0 && (
              <div className="note" style={{ marginTop: 8 }}>
                <strong>Avertissements :</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {apercu.avertissements.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}

            <div className="form-actions" style={{ marginTop: 14 }}>
              <button
                className="btn"
                type="button"
                onClick={confirmerImport}
                disabled={apercu.bloquant || apercu.doublon || confirmationEnCours}
              >
                {confirmationEnCours ? "Import…" : "Confirmer l'import"}
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => setApercu(null)}
                disabled={confirmationEnCours}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
