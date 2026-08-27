"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Edition } from "@/lib/types";

function fmtHMN(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)} H ${String(m % 60).padStart(2, "0")} MN`;
}

export default function EditionDetail() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || "");
  const [e, setE] = useState<Edition | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await fetch(`/api/editions/${id}`);
      if (!r.ok) throw new Error("Edition introuvable.");
      setE(await r.json());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function supprimer() {
    if (!confirm("Supprimer cette édition ?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/editions/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Échec suppression.");
      router.push("/editions");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (error) return <main className="wrap"><div className="err">{error}</div></main>;
  if (!e) return <main className="wrap"><p style={{ color: "var(--muted)" }}>Chargement…</p></main>;

  return (
    <main className="wrap">
      <Link href="/editions" className="back-link">← Toutes les éditions</Link>

      <div className="edition-doc">
        <div className="ed-center ed-org">
          UNIVERSITE MONDIALE DE PRIERE ET DE JEÛNE-CÔTE D'IVOIRE
        </div>
        <div className="ed-center ed-ref">{e.reference || `RAPPORT UMPJ-CI`}</div>
        <div className="ed-center ed-periode">
          DU {e.libellePeriode || `${e.dateDebut} AU ${e.dateFin}`}
        </div>

        <h2 className="ed-h2">I.&nbsp;&nbsp;PENDANT L'UMPJ</h2>
        <ol className="ed-num">
          <li>Nombre de délégations présentes : <b>{e.delegationsPresentes}</b></li>
          <li>Nombre de Régions spirituelles présentes : <b>{e.regionsSpirituelles}</b></li>
          <li>Nombre de Missionnaires n°1 : <b>{e.missionnaires1}</b></li>
          <li>Nombre de Missionnaires n°2 : <b>{e.missionnaires2}</b></li>
          <li>Nombre d'Anciens d'Abidjan : <b>{e.anciensAbidjan}</b></li>
          <li>Epouses d'Anciens ABIDJAN : <b>{e.epousesAnciensAbidjan}</b></li>
          <li>
            Délégations extérieures : <b>{e.delegationsExterieures.length}</b>
            <div className="ed-list">{e.delegationsExterieures.map((d, i) => <span key={i}>{d}</span>)}</div>
          </li>
          <li>
            Délégation d'ABIDJAN : <b>{e.abidjanZones.length}</b>
            <div className="ed-list">{e.abidjanZones.map((d, i) => <span key={i}>{d}</span>)}</div>
          </li>
          <li>
            Délégation de l'INTERIEUR : <b>{e.interieurLocalites.length}</b> Localités
            <div className="ed-list ed-list-3">{e.interieurLocalites.map((d, i) => <span key={i}>{d}</span>)}</div>
          </li>
        </ol>

        <h2 className="ed-h2">10.&nbsp;LES PARTICIPANTS</h2>
        <ul className="ed-particip">
          {e.participantsParJour.map((p, i) => (
            <li key={i}>- {p.jour} <b>{p.participants} Participants</b></li>
          ))}
        </ul>
        <div className="ed-moyenne">MOYENNE GENERALE DE PARTICIPATION : <b>{e.moyenneParticipation} PARTICIPANTS</b></div>

        <h2 className="ed-h2">II.&nbsp;&nbsp;INVESTISSEMENT DANS LA PRIERE</h2>
        <div className="ed-center ed-heures">NOMBRE D'HEURES INVESTIES : <b>{fmtHMN(e.heuresInvesties)}</b></div>

        <table className="ed-sessions">
          <thead>
            <tr>
              <th>SESSIONS</th>
              <th>NOMBRE DE SESSIONS</th>
              <th>PERIODES</th>
              <th>DUREE (heures)</th>
              <th>PARTICIPANTS</th>
            </tr>
          </thead>
          <tbody>
            {e.sessions.map((s, i) => (
              <tr key={i}>
                <td>{s.date}</td>
                <td>{s.nbSessions} Sessions</td>
                <td className="ed-periodes">{s.periodes}</td>
                <td>{fmtHMN(s.dureeMinutes)}</td>
                <td>{s.participants}</td>
              </tr>
            ))}
            <tr className="ed-total">
              <td colSpan={2}>TOTAL</td>
              <td></td>
              <td>{fmtHMN(e.heuresInvesties)}</td>
              <td>{e.moyenneParticipation} (EN MOYENNE)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="form-actions" style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href={`/editions/${id}/edit`} className="btn">Modifier</Link>
        <a className="btn secondary" href={`/api/editions/${id}/pdf`}>Export PDF</a>
        <button className="btn danger" type="button" onClick={supprimer} disabled={busy}>Supprimer</button>
        {error && <span className="err">{error}</span>}
      </div>
    </main>
  );
}
