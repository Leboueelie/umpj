import type { RapportModule } from "@/lib/rapports";
import { fmtNombre } from "@/lib/banque";

/**
 * Présentation commune d'un rapport de module : source, période, indicateurs,
 * tableau, anomalies contrôlées et limites des données.
 */
export function VueRapport({ rapport }: { rapport: RapportModule }) {
  const periodeTexte = rapport.periode
    ? `Du ${rapport.periode.du} au ${rapport.periode.au}`
    : "Toutes les données disponibles";

  return (
    <>
      <div className="card">
        <dl className="rapport-meta">
          <div>
            <dt>Module</dt>
            <dd>{rapport.intitule}</dd>
          </div>
          <div>
            <dt>Source des données</dt>
            <dd>{rapport.source}</dd>
          </div>
          <div>
            <dt>Période couverte</dt>
            <dd>{periodeTexte}</dd>
          </div>
          <div>
            <dt>Volume examiné</dt>
            <dd>{fmtNombre(rapport.volumesExamines)} enregistrement(s)</dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <h3>Indicateurs</h3>
        <ul className="rapport-indicateurs">
          {rapport.indicateurs.map((i) => (
            <li key={i.libelle}>
              <span className="ri-libelle">{i.libelle}</span>
              <span className="ri-valeur">{i.valeur}</span>
              <span className="ri-def">{i.definition}</span>
            </li>
          ))}
        </ul>
      </div>

      {rapport.tableau && (
        <div className="card">
          <h3>{rapport.tableau.titre}</h3>
          {rapport.tableau.lignes.length === 0 ? (
            <div className="empty">Aucune donnée pour cette période.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {rapport.tableau.colonnes.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rapport.tableau.lignes.map((ligne, i) => (
                    <tr key={i}>
                      {ligne.map((cel, j) => (
                        <td key={j}>{cel}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3>Anomalies contrôlées</h3>
        {rapport.anomalies.length === 0 ? (
          <div className="empty">Aucun contrôle d&apos;anomalie pour ce rapport.</div>
        ) : (
          <ul className="rapport-anomalies">
            {rapport.anomalies.map((a) => (
              <li key={a.libelle}>
                {a.libelle} : <b>{a.nombre}</b>
                {a.nombre === 0 && <span className="rapport-ok"> (contrôle passé)</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Limites des données</h3>
        <ul className="rapport-limites">
          {rapport.limites.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
