import { createHash, pbkdf2Sync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claveCorrecta, iguales, ingestaAutorizada } from "../src/auth.js";
import { calcularMetricas, decidirEstado, resumirMensajes } from "../src/datos.js";
import { esc } from "../src/vista.js";
import { baseDePrueba } from "./d1.js";

// La contraseña y la llave reales no viven en el repo: las pruebas usan las suyas propias.
const CLAVE_PRUEBA = "clave-de-prueba-123";
const SAL = "00112233445566778899aabbccddeeff";
const CONF = { sal: SAL, iteraciones: 1000, hash: pbkdf2Sync(CLAVE_PRUEBA, Buffer.from(SAL, "hex"), 1000, 32, "sha256").toString("hex") };
const LLAVE = "llave-de-ingesta-de-prueba";
const LLAVE_HASH = createHash("sha256").update(LLAVE).digest("hex");

vi.mock("../src/config.js", async () => {
  const { createHash: h, pbkdf2Sync: p } = await import("node:crypto");
  const sal = "00112233445566778899aabbccddeeff";
  return {
    CLAVE: { sal, iteraciones: 1000, hash: p("clave-de-prueba-123", Buffer.from(sal, "hex"), 1000, 32, "sha256").toString("hex") },
    INGESTA_HASH: h("sha256").update("llave-de-ingesta-de-prueba").digest("hex"),
  };
});

const { manejar } = await import("../src/worker.js");

const BASE = "https://soporte-windoce.sitios.dev";
let env;
beforeEach(() => {
  env = { DB: baseDePrueba() };
});

const pedir = (ruta, opciones = {}) => manejar(new Request(BASE + ruta, opciones), env);

async function entrar() {
  const r = await pedir("/entrar", {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ clave: CLAVE_PRUEBA }),
  });
  expect(r.status).toBe(303);
  return r.headers.get("set-cookie").split(";")[0];
}

const conversacion = (extra = {}) => ({
  id: "hilo-1",
  app: "divoox",
  cliente_email: "Cliente@Ejemplo.com",
  asunto: "No puedo entrar",
  tipo: "pregunta",
  mensajes: [{ id: "m1", de: "cliente", fecha: "2026-11-01T10:00:00.000Z", texto: "Hola, no puedo entrar" }],
  ...extra,
});

const ingerirPor = (conversaciones, llave = LLAVE) =>
  pedir("/datos/ingesta", {
    method: "POST",
    headers: { authorization: `Bearer ${llave}`, "content-type": "application/json" },
    body: JSON.stringify({ conversaciones }),
  });

describe("seguridad", () => {
  it("compara en tiempo constante y rechaza largos distintos", () => {
    expect(iguales("ab", "ab")).toBe(true);
    expect(iguales("ab", "ac")).toBe(false);
    expect(iguales("ab", "abc")).toBe(false);
    expect(iguales(undefined, "a")).toBe(false);
  });

  it("acepta solo la contraseña correcta", async () => {
    expect(await claveCorrecta(CLAVE_PRUEBA, CONF)).toBe(true);
    expect(await claveCorrecta("otra", CONF)).toBe(false);
    expect(await claveCorrecta("", CONF)).toBe(false);
    expect(await claveCorrecta("x".repeat(201), CONF)).toBe(false);
  });

  it("la carga solo entra con la llave", async () => {
    const con = new Request(BASE, { headers: { authorization: `Bearer ${LLAVE}` } });
    const sin = new Request(BASE, { headers: { authorization: "Bearer otra" } });
    expect(await ingestaAutorizada(con, LLAVE_HASH)).toBe(true);
    expect(await ingestaAutorizada(sin, LLAVE_HASH)).toBe(false);
    expect(await ingestaAutorizada(new Request(BASE), LLAVE_HASH)).toBe(false);
  });

  it("sin sesión, la bandeja muestra la pantalla de entrar y no los correos", async () => {
    await ingerirPor([conversacion()]);
    const r = await pedir("/");
    const html = await r.text();
    expect(html).toContain("Contraseña");
    expect(html).not.toContain("No puedo entrar");
    expect((await pedir("/c/hilo-1")).status).toBe(401);
  });

  it("la contraseña lleva el ojito para verla", async () => {
    const html = await (await pedir("/")).text();
    expect(html).toContain('type="password"');
    expect(html).toContain('aria-label="Ver la contraseña"');
  });

  it("contraseña mala da 401 y al sexto intento corta", async () => {
    const intento = () =>
      pedir("/entrar", {
        method: "POST",
        headers: { origin: BASE, "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "1.2.3.4" },
        body: new URLSearchParams({ clave: "mala" }),
      });
    for (let i = 0; i < 5; i++) expect((await intento()).status).toBe(401);
    expect((await intento()).status).toBe(429);
  });

  it("rechaza un POST desde otro sitio", async () => {
    const r = await pedir("/entrar", {
      method: "POST",
      headers: { origin: "https://malo.example", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ clave: CLAVE_PRUEBA }),
    });
    expect(r.status).toBe(403);
  });

  it("cerrar sesión borra la sesión en el servidor", async () => {
    const cookie = await entrar();
    expect((await pedir("/", { headers: { cookie } })).status).toBe(200);
    const salir = await pedir("/salir", { method: "POST", headers: { cookie, origin: BASE } });
    expect(salir.headers.get("set-cookie")).toContain("Max-Age=0");
    const despues = await (await pedir("/", { headers: { cookie } })).text();
    expect(despues).toContain("Contraseña");
  });

  it("todas las respuestas llevan cabeceras de seguridad y no se guardan en caché", async () => {
    const r = await pedir("/");
    expect(r.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("cache-control")).toBe("no-store");
    // Candado: con «no-referrer» el navegador manda Origin: null y todos los botones del panel fallan.
    expect(r.headers.get("referrer-policy")).toBe("same-origin");
  });

  it("escapa el texto de los clientes", () => {
    expect(esc('<script>alert("x")</script>')).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });
});

describe("carga de correos", () => {
  it("rechaza datos mal formados", async () => {
    const r = await ingerirPor([{ id: "x", app: "inventada" }]);
    expect(r.status).toBe(400);
  });

  it("guarda una conversación nueva y la muestra con sesión", async () => {
    const r = await ingerirPor([conversacion()]);
    expect(await r.json()).toMatchObject({ ok: true, nuevas: 1, actualizadas: 0 });
    const cookie = await entrar();
    const html = await (await pedir("/", { headers: { cookie } })).text();
    expect(html).toContain("No puedo entrar");
    expect(html).toContain("Divoox");
    const fila = await env.DB.prepare("SELECT cliente_email, estado FROM conversaciones").first();
    expect(fila).toEqual({ cliente_email: "cliente@ejemplo.com", estado: "nuevo" });
  });

  it("la respuesta de soporte pasa la conversación a «esperando al cliente» y mide el tiempo", async () => {
    await ingerirPor([conversacion()]);
    await ingerirPor([
      conversacion({
        respuesta_auto: true,
        plantilla: "P4",
        mensajes: [{ id: "m2", de: "soporte", fecha: "2026-11-01T10:20:00.000Z", texto: "Prueba esto" }],
      }),
    ]);
    const f = await env.DB.prepare("SELECT * FROM conversaciones").first();
    expect(f.estado).toBe("esperando_cliente");
    expect(f.respuesta_auto).toBe(1);
    expect(f.primera_respuesta).toBe("2026-11-01T10:20:00.000Z");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM mensajes").first()).n).toBe(2);
  });

  it("la misma carga dos veces no duplica mensajes", async () => {
    await ingerirPor([conversacion()]);
    await ingerirPor([conversacion()]);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM mensajes").first()).n).toBe(1);
  });

  it("el canario de salud responde y dice cuándo fue la última carga", async () => {
    await ingerirPor([conversacion()]);
    const s = await (await pedir("/datos/salud")).json();
    expect(s.ok).toBe(true);
    expect(s.conversaciones).toBe(1);
    expect(s.ultima_ingesta).toBeTruthy();
  });
});

describe("estado de las conversaciones", () => {
  it("un estado puesto a mano se respeta hasta que el cliente vuelve a escribir", () => {
    const r1 = resumirMensajes([{ de: "cliente", fecha: "2026-11-01T10:00:00Z" }]);
    expect(decidirEstado({ estado: "cerrado", estado_manual: 1, ultimo_cliente: "2026-11-01T10:00:00Z" }, r1)).toEqual({ estado: "cerrado", manual: 1 });
    const r2 = resumirMensajes([
      { de: "cliente", fecha: "2026-11-01T10:00:00Z" },
      { de: "cliente", fecha: "2026-11-02T10:00:00Z" },
    ]);
    expect(decidirEstado({ estado: "cerrado", estado_manual: 1, ultimo_cliente: "2026-11-01T10:00:00Z" }, r2)).toEqual({ estado: "nuevo", manual: 0 });
    expect(decidirEstado({ estado: "en_curso", estado_manual: 1, ultimo_cliente: "2026-11-01T10:00:00Z" }, r2).estado).toBe("en_curso");
  });

  it("Richard cambia el estado y la prioridad desde la bandeja, y queda en la actividad", async () => {
    await ingerirPor([conversacion()]);
    const cookie = await entrar();
    const r = await pedir("/c/hilo-1/estado", {
      method: "POST",
      headers: { cookie, origin: BASE, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ estado: "cerrado", prioridad: "alta" }),
    });
    expect(r.status).toBe(303);
    const html = await (await pedir("/c/hilo-1", { headers: { cookie } })).text();
    expect(html).toContain("Estado: Cerrado");
    expect(html).toContain("Prioridad: Alta");
  });

  it("la nota se guarda y responde en JSON para el autoguardado", async () => {
    await ingerirPor([conversacion()]);
    const cookie = await entrar();
    const r = await pedir("/c/hilo-1/estado", {
      method: "POST",
      headers: { cookie, origin: BASE, accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ nota: "Llamarlo el lunes" }),
    });
    expect(await r.json()).toEqual({ ok: true });
    expect((await env.DB.prepare("SELECT nota FROM conversaciones").first()).nota).toBe("Llamarlo el lunes");
  });

  it("el historial muestra las otras conversaciones del mismo cliente", async () => {
    await ingerirPor([conversacion(), conversacion({ id: "hilo-2", app: "qrbott", asunto: "Pregunta de precios" })]);
    const cookie = await entrar();
    const html = await (await pedir("/c/hilo-1", { headers: { cookie } })).text();
    expect(html).toContain("Historial del cliente");
    expect(html).toContain("Pregunta de precios");
  });
});

describe("formulario de contacto", () => {
  const enviar = (cuerpo, origen = "https://divoox.com", ipCliente = "5.6.7.8") =>
    pedir("/datos/contacto", {
      method: "POST",
      headers: { origin: origen, "content-type": "application/json", "cf-connecting-ip": ipCliente },
      body: JSON.stringify(cuerpo),
    });

  it("crea una conversación y permite el origen de la web", async () => {
    const r = await enviar({ app: "divoox", email: "persona@ejemplo.com", mensaje: "Quiero información" });
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("https://divoox.com");
    const f = await env.DB.prepare("SELECT origen, estado FROM conversaciones").first();
    expect(f).toEqual({ origen: "formulario", estado: "nuevo" });
  });

  it("rechaza a los robots que llenan la trampa", async () => {
    const r = await enviar({ app: "divoox", email: "persona@ejemplo.com", mensaje: "Hola", sitio_web: "spam" });
    expect(r.status).toBe(400);
  });

  it("no da permiso de origen a sitios ajenos", async () => {
    const r = await enviar({ app: "divoox", email: "persona@ejemplo.com", mensaje: "Hola" }, "https://malo.example");
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("corta después de cinco mensajes por hora", async () => {
    for (let i = 0; i < 5; i++) expect((await enviar({ app: "beellon", email: "a@ejemplo.com", mensaje: `m${i}` })).status).toBe(200);
    expect((await enviar({ app: "beellon", email: "a@ejemplo.com", mensaje: "otro" })).status).toBe(429);
  });
});

describe("métricas", () => {
  it("calcula sin responder, espera más larga y primera respuesta por app", () => {
    const m = calcularMetricas(
      [
        { app: "divoox", estado: "nuevo", ultimo_cliente: "2026-11-01T10:00:00Z", creado: "2026-11-01T10:00:00Z", respuesta_auto: 0 },
        { app: "divoox", estado: "cerrado", primer_mensaje: "2026-11-01T08:00:00Z", primera_respuesta: "2026-11-01T08:30:00Z", respuesta_auto: 1 },
        { app: "qrbott", estado: "esperando_cliente", primer_mensaje: "2026-11-01T08:00:00Z", primera_respuesta: "2026-11-01T09:30:00Z", respuesta_auto: 0 },
      ],
      "2026-11-01T12:00:00Z",
    );
    expect(m.sin_respuesta).toBe(1);
    expect(m.abiertas).toBe(2);
    expect(m.espera_mas_larga).toBe(120);
    expect(m.respuesta_promedio).toBe(60);
    expect(m.respuestas_automaticas).toBe(1);
    expect(m.por_app.find((a) => a.app === "divoox")).toMatchObject({ total: 2, abiertas: 1, respuesta_promedio: 30 });
  });
});
