import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { verifySession } from "@/lib/auth-core.mjs";
import { SESSION_COOKIE } from "@/lib/auth";

// Garde globale Next.js 16 (convention proxy.ts — middleware est déprécié).
// Le proxy assure : authentification (jeton + état du compte en base),
// politique de rôles par chemin, protection CSRF des mutations API et
// en-têtes de sécurité. Les Route Handlers appliquent en plus leur propre
// contrôle (requireAdmin) — le proxy n'est jamais la seule barrière.

const METHODES_MUTATION = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function gardeActive(): boolean {
  return process.env.AUTH_GARDE !== "off";
}

function secret(): string | null {
  const s = process.env.AUTH_SECRET;
  return s && s.length >= 16 ? s : null;
}

function refusApi(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

// Réponse générique quand la base est indisponible : ni données privées,
// ni détails SQL, ni redirection vers /login (cela laisserait croire à une
// simple déconnexion et pourrait créer une boucle).
function serviceIndisponible(request: NextRequest): NextResponse {
  const message = "Service momentanément indisponible.";
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return refusApi(message, 503);
  }
  return enTetesSecurite(
    new NextResponse(message, {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  );
}

function redirectionLogin(request: NextRequest): NextResponse {
  const url = new URL(request.url);
  const next = url.pathname + url.search;
  const target = new URL("/login", request.url);
  // Destination interne uniquement (chemin relatif), jamais d'URL externe.
  if (next.startsWith("/") && !next.startsWith("//")) {
    target.searchParams.set("next", next);
  }
  return NextResponse.redirect(target);
}

function redirectionBanque(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/banque", request.url));
}

function enTetesSecurite(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

// Vérification CSRF : pour toute méthode mutante sur /api/*, si l'en-tête
// Origin est présent, son hôte doit correspondre à celui de la requête.
// Origin absent : accepté (clients non navigateur ; SameSite=Lax empêche déjà
// l'envoi du cookie sur les requêtes cross-site).
function csrfRefuse(request: NextRequest): boolean {
  if (!METHODES_MUTATION.has(request.method)) return false;
  if (!request.nextUrl.pathname.startsWith("/api/")) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.nextUrl.host;
  } catch {
    return true;
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!gardeActive()) {
    return enTetesSecurite(NextResponse.next());
  }

  if (csrfRefuse(request)) {
    return refusApi("Origine non autorisée.", 403);
  }

  const s = secret();
  if (!s) {
    // Configuration cassée : on ne laisse rien passer en silence.
    return refusApi("Configuration d'authentification manquante.", 500);
  }

  // Routes d'authentification : pas de session requise (le login rate-limité
  // et le logout gèrent leur propre logique).
  if (pathname.startsWith("/api/auth/")) {
    return enTetesSecurite(NextResponse.next());
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? verifySession(token, s) : null;
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return refusApi("Non authentifié.", 401);
    }
    return enTetesSecurite(redirectionLogin(request));
  }

  // État réel du compte : existence, actif, révocation de session, rôle (base).
  let compte: { role: string } | null = null;
  try {
    const r = await pool.query(
      `SELECT role FROM "Utilisateur"
       WHERE id = $1 AND actif
         AND $2::bigint >= (EXTRACT(EPOCH FROM sessions_invalides_apres) * 1000)::bigint`,
      [session.sub, session.iat]
    );
    if (r.rowCount === 1) compte = { role: r.rows[0].role };
  } catch {
    // Base indisponible : échec fermé. Pas de redirection vers /login (ni
    // boucle, ni fausse idée de déconnexion), pas de détails techniques.
    return serviceIndisponible(request);
  }
  if (!compte) {
    if (pathname.startsWith("/api/")) {
      return refusApi("Non authentifié.", 401);
    }
    return enTetesSecurite(redirectionLogin(request));
  }

  const isAdmin = compte.role === "ADMIN";

  // Gestion des utilisateurs : ADMIN uniquement.
  if (pathname.startsWith("/api/admin") || pathname.startsWith("/admin")) {
    if (!isAdmin) {
      return pathname.startsWith("/api/")
        ? refusApi("Réservé à l'administrateur.", 403)
        : enTetesSecurite(redirectionBanque(request));
    }
    return enTetesSecurite(NextResponse.next());
  }

  // Authentifié : la Banque (provisoire ou future) est ouverte aux deux rôles.
  if (pathname === "/banque" || pathname.startsWith("/banque/")) {
    return enTetesSecurite(NextResponse.next());
  }

  // API des modules existants : le proxy exige une session ; le rôle ADMIN
  // est appliqué par requireAdmin dans chaque Route Handler (contrôle serveur
  // de second niveau). Un LECTEUR reçoit donc 403 au niveau du handler.
  if (pathname.startsWith("/api/")) {
    return enTetesSecurite(NextResponse.next());
  }

  // Pages des modules existants : réservées à l'ADMIN ; un LECTEUR est
  // redirigé vers la Banque (défense en profondeur côté navigation).
  if (!isAdmin) {
    return enTetesSecurite(redirectionBanque(request));
  }

  return enTetesSecurite(NextResponse.next());
}

export const config = {
  // Exceptions précises au matcher :
  // - "login$" placé juste après le "/" initial n'exclut QUE la page /login
  //   exacte (testé : /autre/login et /admin/login restent protégés) ;
  // - les assets statiques (extensions d'images/polices ; /logo.png et
  //   /icon.png sont couverts par la règle d'extensions).
  // /api/auth/* reste dans le matcher (contrôle CSRF) mais n'exige pas de
  // session dans le corps du proxy.
  matcher: [
    "/((?!login$|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico|woff2?)$).*)",
  ],
};
