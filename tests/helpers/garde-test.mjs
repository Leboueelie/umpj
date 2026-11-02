// Garde anti-production partagée par les tests SQL.
// N'accepte que les cibles PostgreSQL locales (localhost / 127.0.0.1).
// N'effectue aucune connexion réseau.
//
// Trois couches indépendantes, toutes fail-closed :
//   1. Autorité brute extraite et validée sans normalisation (hôte exact,
//      port valide, pas d'ambiguïté, pas de caractères interdits).
//   2. Refus des paramètres de requête host/port/connectionString/hostaddr.
//   3. Hôte effectif interprété par pg-connection-string (même module que
//      le pilote), comparé à l'hôte brut.
// L'usage interne de new URL() par pg-connection-string n'est pas considéré
// comme une vulnérabilité : la comparaison hôte brut / hôte effectif détecte
// toute différence d'interprétation (normalisation, surcharge).
// Toute ambiguïté ou divergence entraîne un refus.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse: parseConnStr } = require("pg-connection-string");

const HOTES_AUTORISES = new Set(["localhost", "127.0.0.1"]);

// Paramètres de requête qui peuvent rediriger la connexion ou créer une
// ambiguïté sur la destination effective.
const PARAMS_INTERDITS = new Set(["host", "port", "connectionstring", "hostaddr"]);

/**
 * Extrait et valide l'hôte brut de l'autorité d'une URL, sans normalisation.
 * Retourne null si la structure est ambiguë ou mal formée.
 * @param {string} url
 * @returns {string | null}
 */
function extraireHoteBrut(url) {
  // Refuser les espaces extérieurs (début/fin de l'URL).
  if (url !== url.trim()) return null;

  const protoEnd = url.indexOf("://");
  if (protoEnd === -1) return null;
  let rest = url.slice(protoEnd + 3);

  // Refuser les fragments (non autorisés).
  if (rest.includes("#")) return null;

  // Retirer la query (gérée séparément dans analyserUrlTest).
  const queryIndex = rest.indexOf("?");
  if (queryIndex !== -1) rest = rest.slice(0, queryIndex);

  // Retirer le chemin.
  const slashIndex = rest.indexOf("/");
  if (slashIndex === -1 || slashIndex === rest.length - 1) return null;
  const authority = rest.slice(0, slashIndex);
  const path = rest.slice(slashIndex);

  // Le chemin doit être non vide.
  if (path.length < 2) return null;

  // L'autorité ne doit pas être vide.
  if (authority === "") return null;

  // Refuser les caractères interdits dans l'autorité.
  if (/[ \t\r\n\0]/.test(authority)) return null;

  // Refuser les autorités ambiguës : plus d'un @.
  const atCount = (authority.match(/@/g) || []).length;
  if (atCount > 1) return null;

  // Retirer l'userinfo (tout jusqu'au dernier @).
  const atIndex = authority.lastIndexOf("@");
  let hostPart = authority;
  if (atIndex !== -1) {
    const userinfo = authority.slice(0, atIndex);
    hostPart = authority.slice(atIndex + 1);
    // L'userinfo ne doit pas contenir de caractères interdits.
    if (/[ \t\r\n\0@\/?#]/.test(userinfo)) return null;
  }

  // L'hôte ne doit pas être vide après retrait de l'userinfo.
  if (hostPart === "") return null;

  // IPv6 entre crochets : rejeté (pas dans les formes autorisées).
  if (hostPart.startsWith("[")) return null;

  // Séparer hôte et port.
  const colonIndex = hostPart.lastIndexOf(":");
  let host, portStr;
  if (colonIndex !== -1) {
    host = hostPart.slice(0, colonIndex);
    portStr = hostPart.slice(colonIndex + 1);
    // Port vide → invalide.
    if (portStr === "") return null;
    // Port invalide.
    if (!isValidPort(portStr)) return null;
  } else {
    host = hostPart;
    portStr = null;
  }

  // L'hôte ne doit pas être vide.
  if (host === "") return null;

  // Refuser les caractères interdits dans l'hôte.
  if (/[\/\\?#@:]/.test(host)) return null;

  return host;
}

/**
 * Valide qu'un port est un entier entre 1 et 65535, sans zéro initial.
 * @param {string} port
 * @returns {boolean}
 */
function isValidPort(port) {
  if (!/^\d+$/.test(port)) return false;
  if (port.length > 1 && port.startsWith("0")) return false;
  const num = parseInt(port, 10);
  if (num < 1 || num > 65535) return false;
  return true;
}

/**
 * Analyse une URL de connexion PostgreSQL et indique si elle vise une base
 * de test locale acceptable. N'effectue aucune connexion.
 * @param {unknown} url
 * @returns {{ ok: boolean; raison: string; hote: string | null }}
 */
export function analyserUrlTest(url) {
  if (typeof url !== "string" || url.trim() === "") {
    return { ok: false, raison: "URL absente", hote: null };
  }

  // 1. Protocole : uniquement postgres: / postgresql: (insensible à la casse).
  const protoEnd = url.indexOf("://");
  if (protoEnd === -1) {
    return { ok: false, raison: "protocole non PostgreSQL", hote: null };
  }
  const proto = url.slice(0, protoEnd).toLowerCase();
  if (proto !== "postgres" && proto !== "postgresql") {
    return { ok: false, raison: "protocole non PostgreSQL", hote: null };
  }

  // 2. Refuser les fragments.
  if (url.includes("#")) {
    return { ok: false, raison: "fragment non autorisé", hote: null };
  }

  // 3. Vérifier les paramètres de requête.
  const qIndex = url.indexOf("?");
  if (qIndex !== -1) {
    const queryPart = url.slice(qIndex + 1);
    const params = new URLSearchParams(queryPart);
    for (const key of params.keys()) {
      if (PARAMS_INTERDITS.has(key.toLowerCase())) {
        return { ok: false, raison: "paramètre de connexion interdit", hote: null };
      }
    }
    // Refuser tout paramètre (aucun n'est nécessaire pour les tests).
    if ([...params.keys()].length > 0) {
      return { ok: false, raison: "paramètres de requête non autorisés", hote: null };
    }
    // ? présent mais vide
    return { ok: false, raison: "paramètres de requête non autorisés", hote: null };
  }

  // 4. Validation indépendante de l'autorité brute (sans normalisation).
  const hoteBrut = extraireHoteBrut(url);
  if (hoteBrut === null || hoteBrut === "") {
    return { ok: false, raison: "hôte absent", hote: null };
  }

  // 5. Refuser toute cible Neon (sur l'URL et l'hôte brut).
  if (/neon/i.test(url) || /neon/i.test(hoteBrut)) {
    return { ok: false, raison: "cible Neon interdite", hote: hoteBrut };
  }

  // 6. Hôte brut exact (sensible à la casse) : uniquement localhost ou 127.0.0.1.
  if (!HOTES_AUTORISES.has(hoteBrut)) {
    return { ok: false, raison: "hôte distant ou non autorisé", hote: hoteBrut };
  }

  // 7. Parser avec pg-connection-string pour obtenir l'hôte effectif.
  let parsed;
  try {
    parsed = parseConnStr(url);
  } catch {
    return { ok: false, raison: "URL mal formée", hote: null };
  }

  const hoteEffectif = parsed.host;
  if (typeof hoteEffectif !== "string" || hoteEffectif === "") {
    return { ok: false, raison: "hôte absent", hote: null };
  }

  // 8. Refuser toute cible Neon (sur l'hôte effectif).
  if (/neon/i.test(hoteEffectif)) {
    return { ok: false, raison: "cible Neon interdite", hote: hoteEffectif };
  }

  // 9. L'hôte effectif doit également être autorisé.
  if (!HOTES_AUTORISES.has(hoteEffectif)) {
    return { ok: false, raison: "hôte distant ou non autorisé", hote: hoteEffectif };
  }

  // 10. L'hôte brut et l'hôte effectif doivent correspondre (pas de divergence).
  if (hoteBrut !== hoteEffectif) {
    return { ok: false, raison: "hôte ambigu", hote: hoteEffectif };
  }

  return { ok: true, raison: "cible locale acceptée", hote: hoteEffectif };
}

export function estUrlTestLocale(url) {
  return analyserUrlTest(url).ok;
}
