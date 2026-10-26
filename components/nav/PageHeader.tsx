/**
 * En-tête de page standard : titre, contexte, actions principales.
 * Remplace les en-têtes dupliqués (logo + h1) des pages de module.
 */
export function PageHeader({
  titre,
  sousTitre,
  actions,
}: {
  titre: string;
  sousTitre?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header-titles">
        <h2>{titre}</h2>
        {sousTitre && <div className="page-sub">{sousTitre}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
