import {
  cerrarSesion, claveCorrecta, crearSesion, ingestaAutorizada, mismoOrigen, permitirIntento, sesionValida, turnstileOk,
} from "./auth.js";
import {
  cambiarEstado, crearDesdeFormulario, detalle, esquemaContacto, esquemaEstado, esquemaIngesta, ingerir, listar, metricas,
} from "./datos.js";
import { CSS, ICONO, JS, MANIFEST } from "./estaticos.js";
import { vistaBandeja, vistaDetalle, vistaEntrar, vistaNoEncontrado } from "./vista.js";

const SEGURIDAD = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; " +
    "style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self' mailto:; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin", // con no-referrer el navegador manda Origin: null en los formularios y se rechazan
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

// Orígenes que pueden mandar el formulario de contacto (las webs de las apps).
const ORIGENES_FORMULARIO = /^https:\/\/([a-z0-9-]+\.)*(windoce\.com|divoox\.com|tumbite\.com|qrbott\.com|beellon\.com|mercatren\.com|sitios\.dev)$/;

function responder(cuerpo, { status = 200, tipo = "text/html; charset=utf-8", cabeceras = {} } = {}) {
  return new Response(cuerpo, {
    status,
    headers: { "Content-Type": tipo, "Cache-Control": "no-store", ...SEGURIDAD, ...cabeceras },
  });
}
const json = (obj, status = 200, cabeceras = {}) =>
  responder(JSON.stringify(obj), { status, tipo: "application/json; charset=utf-8", cabeceras });
const redirigir = (a, cabeceras = {}) => new Response(null, { status: 303, headers: { Location: a, ...SEGURIDAD, ...cabeceras } });
const estatico = (cuerpo, tipo) =>
  new Response(cuerpo, { headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=3600", ...SEGURIDAD } });

const ip = (req) => req.headers.get("cf-connecting-ip") ?? "sin-ip";

async function leerCuerpo(req) {
  const tipo = req.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) return req.json();
  return Object.fromEntries((await req.formData()).entries());
}

function corsFormulario(req) {
  const origen = req.headers.get("origin") ?? "";
  return ORIGENES_FORMULARIO.test(origen)
    ? { "Access-Control-Allow-Origin": origen, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type", Vary: "Origin" }
    : {};
}

export async function manejar(req, env) {
  const url = new URL(req.url);
  const ruta = url.pathname;
  const db = env.DB;

  if (ruta === "/app.css") return estatico(CSS, "text/css; charset=utf-8");
  if (ruta === "/app.js") return estatico(JS, "text/javascript; charset=utf-8");
  if (ruta === "/icono.svg") return estatico(ICONO, "image/svg+xml");
  if (ruta === "/manifest.webmanifest") return estatico(MANIFEST, "application/manifest+json");
  if (ruta === "/robots.txt") return estatico("User-agent: *\nDisallow: /\n", "text/plain");

  // Canario: lo vigila la revisión horaria del gerente.
  if (ruta === "/datos/salud") {
    try {
      const n = await db.prepare("SELECT COUNT(*) AS n FROM conversaciones").first();
      const u = await db.prepare("SELECT valor FROM ajustes WHERE nombre = 'ultima_ingesta'").first();
      return json({ ok: true, base: "ok", conversaciones: n?.n ?? 0, ultima_ingesta: u?.valor ?? null });
    } catch (e) {
      console.error("salud: base", e);
      return json({ ok: false, base: "error" }, 503);
    }
  }

  if (ruta === "/datos/ingesta" && req.method === "POST") {
    if (!(await ingestaAutorizada(req))) return json({ ok: false, error: "no autorizado" }, 401);
    const r = esquemaIngesta.safeParse(await req.json().catch(() => null));
    if (!r.success) return json({ ok: false, error: "datos inválidos", detalle: r.error.issues.slice(0, 5) }, 400);
    return json({ ok: true, ...(await ingerir(db, r.data)) });
  }

  if (ruta === "/datos/contacto") {
    const cors = corsFormulario(req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ ok: false }, 405, cors);
    if (!(await permitirIntento(db, `contacto:${ip(req)}`, 5, 60))) {
      return json({ ok: false, error: "Too many messages. Please try again later." }, 429, cors);
    }
    const r = esquemaContacto.safeParse(await leerCuerpo(req).catch(() => null));
    if (!r.success) return json({ ok: false, error: "Please check your name, email and message." }, 400, cors);
    await crearDesdeFormulario(db, r.data, `form-${crypto.randomUUID()}`);
    return json({ ok: true }, 200, cors);
  }

  if (ruta === "/entrar" && req.method === "POST") {
    if (!mismoOrigen(req)) return responder("Origen no permitido", { status: 403, tipo: "text/plain" });
    if (!(await permitirIntento(db, `entrar:${ip(req)}`, 5, 15))) {
      return responder(vistaEntrar({ error: "Demasiados intentos. Espera 15 minutos y vuelve a probar.", siteKey: env.TURNSTILE_SITE_KEY }), { status: 429 });
    }
    const datos = await leerCuerpo(req).catch(() => ({}));
    if (!(await turnstileOk(env, datos["cf-turnstile-response"], ip(req)))) {
      return responder(vistaEntrar({ error: "No pudimos comprobar que eres una persona. Vuelve a intentarlo.", siteKey: env.TURNSTILE_SITE_KEY }), { status: 403 });
    }
    if (!(await claveCorrecta(datos.clave))) {
      return responder(vistaEntrar({ error: "La contraseña no es correcta.", siteKey: env.TURNSTILE_SITE_KEY }), { status: 401 });
    }
    return redirigir("/", { "Set-Cookie": await crearSesion(db) });
  }

  const conSesion = await sesionValida(req, db);
  if (!conSesion) {
    if (req.method !== "GET") return json({ ok: false, error: "sesión vencida" }, 401);
    return responder(vistaEntrar({ siteKey: env.TURNSTILE_SITE_KEY }), { status: ruta === "/" ? 200 : 401 });
  }

  if (ruta === "/salir" && req.method === "POST") {
    return redirigir("/", { "Set-Cookie": await cerrarSesion(req, db) });
  }

  if (ruta === "/" && req.method === "GET") {
    const filtro = { app: url.searchParams.get("app") ?? "", estado: url.searchParams.get("estado") ?? "abiertos" };
    const [filas, m, u] = await Promise.all([
      listar(db, { app: filtro.app, estado: filtro.estado === "todos" ? "" : filtro.estado }),
      metricas(db),
      db.prepare("SELECT valor FROM ajustes WHERE nombre = 'ultima_ingesta'").first(),
    ]);
    return responder(vistaBandeja({ filas, m, filtro, ahoraIso: new Date().toISOString(), ultimaIngesta: u?.valor }));
  }

  const enConv = ruta.match(/^\/c\/([^/]+)(\/estado)?$/);
  if (enConv) {
    const id = decodeURIComponent(enConv[1]);
    if (enConv[2] && req.method === "POST") {
      if (!mismoOrigen(req)) return responder("Origen no permitido", { status: 403, tipo: "text/plain" });
      const r = esquemaEstado.safeParse(await leerCuerpo(req).catch(() => ({})));
      if (!r.success) return json({ ok: false, error: "datos inválidos" }, 400);
      const ok = await cambiarEstado(db, id, r.data);
      if ((req.headers.get("accept") ?? "").includes("application/json")) return json({ ok }, ok ? 200 : 404);
      return redirigir(`/c/${encodeURIComponent(id)}`);
    }
    if (!enConv[2] && req.method === "GET") {
      const d = await detalle(db, id);
      return d ? responder(vistaDetalle(d)) : responder(vistaNoEncontrado(), { status: 404 });
    }
  }

  return responder(vistaNoEncontrado(), { status: 404 });
}

export default {
  async fetch(req, env) {
    try {
      return await manejar(req, env);
    } catch (e) {
      console.error("bandeja: error", e);
      return responder("Algo falló de nuestro lado. Recarga la página en un momento.", { status: 500, tipo: "text/plain; charset=utf-8" });
    }
  },
};
