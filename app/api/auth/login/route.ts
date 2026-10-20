import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import {
  verifyPassword,
  hashPassword,
  signSession,
  hashIp,
  premiereIp,
} from "@/lib/auth-core.mjs";
import {
  SESSION_COOKIE,
  SESSION_TTL_S,
  journaliser,
} from "@/lib/auth";

const MAX_TENTATIVES = 5;
const FENETRE_MS = 15 * 60 * 1000;

// Hash factice (réel) pour uniformiser le temps de réponse quand l'email
// n'existe pas — évite l'énumération d'utilisateurs par chronométrage.
const HASH_DUMMY = hashPassword("dummy-password-timing-only");

function generique() {
  return NextResponse.json(
    { error: "Identifiants invalides." },
    { status: 401 }
  );
}

async function lireCompteur(cle: string) {
  const r = await pool.query(
    `SELECT tentatives, premiere_tentative, derniere_tentative
     FROM "TentativeConnexion" WHERE cle = $1`,
    [cle]
  );
  return r.rowCount ? r.rows[0] : null;
}

async function enregistrerEchec(cle: string) {
  const maintenant = new Date();
  const existant = await lireCompteur(cle);
  if (
    !existant ||
    maintenant.getTime() - new Date(existant.premiere_tentative).getTime() >
      FENETRE_MS
  ) {
    await pool.query(
      `INSERT INTO "TentativeConnexion" (cle, tentatives, premiere_tentative, derniere_tentative)
       VALUES ($1, 1, $2, $2)
       ON CONFLICT (cle) DO UPDATE
         SET tentatives = 1,
             premiere_tentative = EXCLUDED.premiere_tentative,
             derniere_tentative = EXCLUDED.derniere_tentative`,
      [cle, maintenant]
    );
  } else {
    await pool.query(
      `UPDATE "TentativeConnexion"
       SET tentatives = tentatives + 1, derniere_tentative = $2
       WHERE cle = $1`,
      [cle, maintenant]
    );
  }
}

async function bloque(cle: string): Promise<boolean> {
  const c = await lireCompteur(cle);
  if (!c || c.tentatives < MAX_TENTATIVES) return false;
  const age =
    Date.now() - new Date(c.derniere_tentative).getTime();
  if (age > FENETRE_MS) {
    await pool.query(`DELETE FROM "TentativeConnexion" WHERE cle = $1`, [cle]);
    return false;
  }
  return true;
}

async function reinitialiser(cles: string[]) {
  await pool.query(`DELETE FROM "TentativeConnexion" WHERE cle = ANY($1)`, [cles]);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const emailBrut = typeof body?.email === "string" ? body.email.trim() : "";
  const motDePasse = typeof body?.motDePasse === "string" ? body.motDePasse : "";

  if (!emailBrut || emailBrut.length > 254 || !motDePasse || motDePasse.length > 200) {
    return generique();
  }

  const email = emailBrut.toLowerCase();
  const ip = premiereIp(req);
  const cleEmail = `email:${email}`;
  const cleIp = ip ? `ip:${hashIp(ip, process.env.AUTH_SECRET ?? "")}` : null;

  try {
    if (await bloque(cleEmail)) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }
    if (cleIp && (await bloque(cleIp))) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }

    const r = await pool.query(
      `SELECT id, email, hash, role, actif FROM "Utilisateur" WHERE email = $1`,
      [email]
    );
    const u = r.rowCount ? r.rows[0] : null;
    const hash = u ? u.hash : HASH_DUMMY;
    const ok = verifyPassword(motDePasse, hash);

    if (!u || !ok) {
      await enregistrerEchec(cleEmail);
      if (cleIp) await enregistrerEchec(cleIp);
      return generique();
    }

    if (!u.actif) {
      return NextResponse.json(
        { error: "Compte désactivé." },
        { status: 403 }
      );
    }

    await reinitialiser([cleEmail, ...(cleIp ? [cleIp] : [])]);

    const maintenant = Math.floor(Date.now() / 1000);
    const jeton = signSession(
      { sub: u.id, role: u.role, iat: maintenant, exp: maintenant + SESSION_TTL_S },
      process.env.AUTH_SECRET ?? ""
    );

    const store = await cookies();
    store.set(SESSION_COOKIE, jeton, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_S,
    });

    await journaliser(u.email, "connexion", u.id, {});

    return NextResponse.json({
      ok: true,
      email: u.email,
      role: u.role,
      redirect: u.role === "ADMIN" ? "/" : "/banque",
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur de service." },
      { status: 500 }
    );
  }
}
