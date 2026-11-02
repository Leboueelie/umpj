"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function safeNext(raw: string | null): string {
  if (!raw) return "";
  // Destination interne uniquement : chemin relatif simple (pas //, pas http).
  if (!raw.startsWith("/") || raw.startsWith("//")) return "";
  if (raw.startsWith("/login")) return "";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [nomComplet, setNomComplet] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (enCours) return;
    setEnCours(true);
    setErreur("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: nomComplet, motDePasse }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErreur(data.error || "Échec de la connexion.");
        return;
      }
      const cible = next || data.redirect || "/";
      router.push(cible);
      router.refresh();
    } catch {
      setErreur("Erreur de connexion au serveur.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main className="login-page">
      <style>{`
        .login-page {
          min-height: 100vh;
          background: var(--bg, #f8fafc);
        }
        .login-bande {
          background: var(--card);
          border-bottom: 3px solid var(--accent);
          padding: 24px 32px;
        }
        .login-bande-in {
          max-width: 1080px;
          margin: 0 auto;
          display: flex;
          align-items: flex-start;
          gap: clamp(18px, 2vw, 30px);
        }
        .login-bande .accueil-logo {
          width: clamp(64px, 6vw, 84px);
          height: auto;
          flex: none;
        }
        .login-bande .accueil-identite { margin: 0; min-width: 0; }
        .login-bande .accueil-kicker { margin-bottom: 8px; }
        .login-bande .accueil-titre { font-size: clamp(1.5rem, 2.6vw, 2.1rem); }
        .login-bande .accueil-filet { margin-top: 12px; }
        .login-bande .accueil-chapo { max-width: 60ch; }
        .login-contenu {
          max-width: 1080px;
          margin: 0 auto;
          padding: 40px 32px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 400px;
          gap: clamp(32px, 4vw, 64px);
          align-items: start;
        }
        .login-intro h2 {
          margin: 0 0 12px;
          font-size: 1.5rem;
          color: var(--navy);
          line-height: 1.15;
        }
        .login-intro p {
          margin: 0 0 10px;
          color: var(--muted);
          line-height: 1.6;
          font-size: 0.95rem;
        }
        .login-carte {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 32px 28px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
        }
        .login-carte h2 {
          margin: 0 0 6px;
          font-size: 1.2rem;
          color: var(--navy);
        }
        .login-carte .login-sous {
          margin: 0 0 20px;
          color: var(--muted);
          font-size: 0.88rem;
        }
        .login-carte .field { margin-bottom: 14px; }
        .login-carte .field label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--navy);
          margin-bottom: 6px;
        }
        .login-carte input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 10px;
          font-size: 0.95rem;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .login-carte input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
        .login-carte .btn {
          width: 100%;
          padding: 11px 16px;
          margin-top: 6px;
        }
        .login-carte .err { margin: 10px 0 0; }
        @media (max-width: 820px) {
          .login-contenu {
            grid-template-columns: 1fr;
            gap: 24px;
            padding: 28px 20px;
          }
          .login-bande { padding: 18px 20px; }
        }
        @media (max-width: 480px) {
          .login-bande { padding: 14px 16px; }
          .login-contenu { padding: 20px 16px; gap: 20px; }
          .login-carte { padding: 22px 18px; }
        }
      `}</style>

      <header className="login-bande">
        <div className="login-bande-in">
          <img src="/logo.png" alt="Logo UMPJ" className="accueil-logo" />
          <div className="accueil-identite">
            <p className="accueil-kicker">UMPJ</p>
            <h1 className="accueil-titre">
              Université Mondiale de la Prière et du Jeûne
            </h1>
            <span className="accueil-filet" aria-hidden="true" />
            <p className="accueil-chapo">
              Connexion réservée aux responsables.
            </p>
          </div>
        </div>
      </header>

      <div className="login-contenu">
        <section className="login-intro">
          <h2>Connexion à l'espace de gestion</h2>
          <p>
            Cet espace permet aux administrateurs et aux lecteurs autorisés
            d'accéder aux modules de gestion, aux rapports et à la Banque des
            accomplissements de l'UMPJ.
          </p>
          <p>
            Utilisez les identifiants qui vous ont été communiqués. En cas de
            difficulté, contactez l'administrateur de votre zone.
          </p>
        </section>

        <div className="login-carte">
          <h2>Se connecter</h2>
          <p className="login-sous">Saisissez votre nom complet et votre mot de passe.</p>
          <form onSubmit={envoyer}>
            <div className="field">
              <label>Nom complet</label>
              <input
                type="text"
                value={nomComplet}
                onChange={(e) => setNomComplet(e.target.value)}
                autoComplete="name"
                required
                maxLength={120}
              />
            </div>
            <div className="field">
              <label>Mot de passe</label>
              <input
                type="password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                autoComplete="current-password"
                required
                maxLength={200}
              />
            </div>
            {erreur && <p className="err">{erreur}</p>}
            <button className="btn" type="submit" disabled={enCours}>
              {enCours ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
