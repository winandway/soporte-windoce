import { CLAVE, INGESTA_HASH } from "./config.js";

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const deHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

/** Comparación en tiempo constante de dos textos hex del mismo largo. */
export function iguales(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function sha256(texto) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(texto)));
}

export async function pbkdf2(clave, salHex, iteraciones) {
  const llave = await crypto.subtle.importKey("raw", enc.encode(clave), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: deHex(salHex), iterations: iteraciones },
    llave,
    256,
  );
  return hex(bits);
}

export async function claveCorrecta(clave, conf = CLAVE) {
  if (typeof clave !== "string" || !clave || clave.length > 200) return false;
  return iguales(await pbkdf2(clave, conf.sal, conf.iteraciones), conf.hash);
}

export async function ingestaAutorizada(req, hashEsperado = INGESTA_HASH) {
  const cab = req.headers.get("authorization") ?? "";
  const token = cab.startsWith("Bearer ") ? cab.slice(7).trim() : "";
  if (!token) return false;
  return iguales(await sha256(token), hashEsperado);
}

export const COOKIE = "__Host-bandeja";
const DIAS_SESION = 30;

export async function crearSesion(db) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const ahora = new Date();
  const vence = new Date(ahora.getTime() + DIAS_SESION * 86400000);
  await db
    .prepare("INSERT INTO sesiones (token_hash, creada, vence) VALUES (?, ?, ?)")
    .bind(await sha256(token), ahora.toISOString(), vence.toISOString())
    .run();
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DIAS_SESION * 86400}`;
}

export function leerCookie(req) {
  const c = req.headers.get("cookie") ?? "";
  for (const parte of c.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return null;
}

export async function sesionValida(req, db) {
  const token = leerCookie(req);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  const fila = await db
    .prepare("SELECT vence FROM sesiones WHERE token_hash = ?")
    .bind(await sha256(token))
    .first();
  return Boolean(fila && fila.vence > new Date().toISOString());
}

export async function cerrarSesion(req, db) {
  const token = leerCookie(req);
  if (token) await db.prepare("DELETE FROM sesiones WHERE token_hash = ?").bind(await sha256(token)).run();
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

/** Límite de intentos: devuelve true si todavía puede intentar, y anota el intento. */
export async function permitirIntento(db, clave, maximo, minutos) {
  const desde = new Date(Date.now() - minutos * 60000).toISOString();
  const fila = await db
    .prepare("SELECT COUNT(*) AS n FROM intentos WHERE clave = ? AND momento > ?")
    .bind(clave, desde)
    .first();
  if ((fila?.n ?? 0) >= maximo) return false;
  await db.batch([
    db.prepare("INSERT INTO intentos (clave, momento) VALUES (?, ?)").bind(clave, new Date().toISOString()),
    db.prepare("DELETE FROM intentos WHERE momento < ?").bind(new Date(Date.now() - 86400000).toISOString()),
  ]);
  return true;
}

/**
 * Turnstile: se apaga solo si no hay secreto en el panel, y si Cloudflare no responde se deja pasar
 * (detrás sigue la contraseña). Regla de Richard.
 */
export async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip ?? "" }),
    });
    if (!r.ok) {
      console.error("turnstile: respuesta", r.status);
      return true;
    }
    return Boolean((await r.json()).success);
  } catch (e) {
    console.error("turnstile: sin respuesta", e);
    return true;
  }
}

/** Mismo origen en los POST del panel: con la cookie SameSite=Strict, cierra la puerta a CSRF. */
export function mismoOrigen(req) {
  const origen = req.headers.get("origin");
  return !origen || origen === new URL(req.url).origin;
}
