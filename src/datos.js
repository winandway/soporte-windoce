import { z } from "zod";

export const APPS = {
  divoox: "Divoox",
  "divoox.driver": "Divoox Driver",
  "divoox.restaurantes": "Divoox Restaurants",
  fintwin: "FinTwin",
  qrbott: "QRbott",
  escenia: "Escenia",
  mercatren: "Mercatren",
  beellon: "Beellon",
  win12: "Win12",
  general: "General",
};
export const ESTADOS = {
  nuevo: "Nuevo",
  en_curso: "En curso",
  esperando_cliente: "Esperando al cliente",
  cerrado: "Cerrado",
};
export const TIPOS = {
  pregunta: "Pregunta",
  tecnico: "Fallo técnico",
  pago: "Pago o reembolso",
  queja: "Queja",
  borrar_cuenta: "Borrar cuenta",
  idea: "Idea",
  comercial: "Comercial",
  otro: "Otro",
};
export const PRIORIDADES = { normal: "Normal", alta: "Alta", urgente: "Urgente" };

const fecha = z.string().datetime({ offset: true });
const texto = (max) => z.string().trim().min(1).max(max);

const mensaje = z.object({
  id: texto(200),
  de: z.enum(["cliente", "soporte"]),
  fecha,
  texto: z.string().trim().max(8000).transform((t) => t || "(sin texto)"),
});

const conversacion = z.object({
  id: texto(200),
  app: z.enum(Object.keys(APPS)),
  cliente_email: z.string().trim().toLowerCase().email().max(320),
  cliente_nombre: z.string().trim().max(200).optional(),
  asunto: texto(500),
  idioma: z.enum(["es", "en"]).optional(),
  tipo: z.enum(Object.keys(TIPOS)),
  prioridad: z.enum(Object.keys(PRIORIDADES)).optional(),
  plantilla: z.string().trim().max(20).optional(),
  respuesta_auto: z.boolean().optional(),
  sesion_avisada: z.string().trim().max(200).optional(),
  mensajes: z.array(mensaje).min(1).max(200),
});

export const esquemaIngesta = z.object({ conversaciones: z.array(conversacion).min(1).max(100) });

export const esquemaContacto = z.object({
  app: z.enum(Object.keys(APPS)),
  nombre: z.string().trim().max(200).optional(),
  email: z.string().trim().toLowerCase().email().max(320),
  mensaje: texto(5000),
  sitio_web: z.string().max(0).optional(), // trampa para robots: una persona la deja vacía
});

export const esquemaEstado = z.object({
  estado: z.enum(Object.keys(ESTADOS)).optional(),
  prioridad: z.enum(Object.keys(PRIORIDADES)).optional(),
  nota: z.string().max(5000).optional(),
});

/** Fechas clave y estado sugerido a partir de los mensajes (ordenados o no). */
export function resumirMensajes(mensajes) {
  const orden = [...mensajes].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const delCliente = orden.filter((m) => m.de === "cliente");
  const deSoporte = orden.filter((m) => m.de === "soporte");
  const primer = delCliente[0]?.fecha ?? orden[0]?.fecha ?? null;
  const primeraRespuesta = deSoporte.find((m) => !primer || m.fecha >= primer)?.fecha ?? null;
  const ultimo = orden[orden.length - 1];
  return {
    primer_mensaje: primer,
    primera_respuesta: primeraRespuesta,
    ultimo_cliente: delCliente[delCliente.length - 1]?.fecha ?? null,
    ultima_respuesta: deSoporte[deSoporte.length - 1]?.fecha ?? null,
    estado_sugerido: ultimo?.de === "soporte" ? "esperando_cliente" : "nuevo",
  };
}

/**
 * Estado final: si Richard lo fijó a mano, se respeta mientras el cliente no vuelva a escribir.
 * Un mensaje nuevo del cliente reabre cualquier conversación.
 */
export function decidirEstado(actual, resumen) {
  if (!actual) return { estado: resumen.estado_sugerido, manual: 0 };
  const clienteEscribioDespues =
    resumen.ultimo_cliente && (!actual.ultimo_cliente || resumen.ultimo_cliente > actual.ultimo_cliente);
  if (clienteEscribioDespues) {
    return { estado: actual.estado === "en_curso" ? "en_curso" : "nuevo", manual: 0 };
  }
  if (actual.estado_manual) return { estado: actual.estado, manual: 1 };
  return { estado: resumen.estado_sugerido, manual: 0 };
}

const ahora = () => new Date().toISOString();

export async function ingerir(db, datos) {
  let nuevas = 0;
  let actualizadas = 0;
  for (const c of datos.conversaciones) {
    const actual = await db.prepare("SELECT * FROM conversaciones WHERE id = ?").bind(c.id).first();
    const previos = actual
      ? (await db.prepare("SELECT id, de, fecha FROM mensajes WHERE conversacion_id = ?").bind(c.id).all()).results
      : [];
    const porId = new Map(previos.map((m) => [m.id, m]));
    for (const m of c.mensajes) porId.set(m.id, m);
    const resumen = resumirMensajes([...porId.values()]);
    const { estado, manual } = decidirEstado(actual, resumen);
    const t = ahora();
    const sentencias = c.mensajes.map((m) =>
      db
        .prepare(
          "INSERT INTO mensajes (id, conversacion_id, de, fecha, texto) VALUES (?, ?, ?, ?, ?) " +
            "ON CONFLICT(id) DO UPDATE SET texto = excluded.texto",
        )
        .bind(m.id, c.id, m.de, m.fecha, m.texto),
    );
    if (actual) {
      sentencias.push(
        db
          .prepare(
            "UPDATE conversaciones SET app = ?, cliente_nombre = COALESCE(?, cliente_nombre), asunto = ?, " +
              "idioma = COALESCE(?, idioma), tipo = ?, prioridad = COALESCE(?, prioridad), estado = ?, estado_manual = ?, " +
              "plantilla = COALESCE(?, plantilla), respuesta_auto = MAX(respuesta_auto, ?), " +
              "sesion_avisada = COALESCE(?, sesion_avisada), primer_mensaje = ?, primera_respuesta = ?, " +
              "ultimo_cliente = ?, ultima_respuesta = ?, actualizado = ? WHERE id = ?",
          )
          .bind(
            c.app, c.cliente_nombre ?? null, c.asunto, c.idioma ?? null, c.tipo, c.prioridad ?? null, estado, manual,
            c.plantilla ?? null, c.respuesta_auto ? 1 : 0, c.sesion_avisada ?? null, resumen.primer_mensaje,
            resumen.primera_respuesta, resumen.ultimo_cliente, resumen.ultima_respuesta, t, c.id,
          ),
      );
      actualizadas++;
    } else {
      sentencias.push(
        db
          .prepare(
            "INSERT INTO conversaciones (id, app, cliente_email, cliente_nombre, asunto, idioma, tipo, prioridad, estado, " +
              "plantilla, respuesta_auto, sesion_avisada, primer_mensaje, primera_respuesta, ultimo_cliente, " +
              "ultima_respuesta, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            c.id, c.app, c.cliente_email, c.cliente_nombre ?? null, c.asunto, c.idioma ?? null, c.tipo,
            c.prioridad ?? "normal", estado, c.plantilla ?? null, c.respuesta_auto ? 1 : 0, c.sesion_avisada ?? null,
            resumen.primer_mensaje, resumen.primera_respuesta, resumen.ultimo_cliente, resumen.ultima_respuesta, t, t,
          ),
      );
      sentencias.push(
        db
          .prepare("INSERT INTO eventos (conversacion_id, momento, quien, que) VALUES (?, ?, ?, ?)")
          .bind(c.id, t, "gerente", "Entró a la bandeja"),
      );
      nuevas++;
    }
    await db.batch(sentencias);
  }
  await db
    .prepare("INSERT INTO ajustes (nombre, valor) VALUES ('ultima_ingesta', ?) ON CONFLICT(nombre) DO UPDATE SET valor = excluded.valor")
    .bind(ahora())
    .run();
  return { nuevas, actualizadas };
}

export async function crearDesdeFormulario(db, d, id) {
  const t = ahora();
  await db.batch([
    db
      .prepare(
        "INSERT INTO conversaciones (id, app, cliente_email, cliente_nombre, asunto, tipo, estado, origen, " +
          "primer_mensaje, ultimo_cliente, creado, actualizado) VALUES (?, ?, ?, ?, ?, 'pregunta', 'nuevo', 'formulario', ?, ?, ?, ?)",
      )
      .bind(id, d.app, d.email, d.nombre ?? null, `Formulario de contacto de ${APPS[d.app]}`, t, t, t, t),
    db
      .prepare("INSERT INTO mensajes (id, conversacion_id, de, fecha, texto) VALUES (?, ?, 'cliente', ?, ?)")
      .bind(`${id}-1`, id, t, d.mensaje),
    db
      .prepare("INSERT INTO eventos (conversacion_id, momento, quien, que) VALUES (?, ?, 'web', 'Entró por el formulario de contacto')")
      .bind(id, t),
  ]);
}

export async function cambiarEstado(db, id, d) {
  const actual = await db.prepare("SELECT estado, prioridad FROM conversaciones WHERE id = ?").bind(id).first();
  if (!actual) return false;
  const t = ahora();
  const sentencias = [];
  if (d.estado && d.estado !== actual.estado) {
    sentencias.push(
      db.prepare("UPDATE conversaciones SET estado = ?, estado_manual = 1, actualizado = ? WHERE id = ?").bind(d.estado, t, id),
      db
        .prepare("INSERT INTO eventos (conversacion_id, momento, quien, que) VALUES (?, ?, 'Richard', ?)")
        .bind(id, t, `Estado: ${ESTADOS[d.estado]}`),
    );
  }
  if (d.prioridad && d.prioridad !== actual.prioridad) {
    sentencias.push(
      db.prepare("UPDATE conversaciones SET prioridad = ?, actualizado = ? WHERE id = ?").bind(d.prioridad, t, id),
      db
        .prepare("INSERT INTO eventos (conversacion_id, momento, quien, que) VALUES (?, ?, 'Richard', ?)")
        .bind(id, t, `Prioridad: ${PRIORIDADES[d.prioridad]}`),
    );
  }
  if (d.nota !== undefined) {
    sentencias.push(db.prepare("UPDATE conversaciones SET nota = ?, actualizado = ? WHERE id = ?").bind(d.nota, t, id));
  }
  if (sentencias.length) await db.batch(sentencias);
  return true;
}

export async function listar(db, { app, estado }) {
  const donde = [];
  const params = [];
  if (app && APPS[app]) {
    donde.push("app = ?");
    params.push(app);
  }
  if (estado === "abiertos") donde.push("estado != 'cerrado'");
  else if (estado && ESTADOS[estado]) {
    donde.push("estado = ?");
    params.push(estado);
  }
  const sql =
    "SELECT * FROM conversaciones" +
    (donde.length ? ` WHERE ${donde.join(" AND ")}` : "") +
    " ORDER BY CASE estado WHEN 'nuevo' THEN 0 WHEN 'en_curso' THEN 1 WHEN 'esperando_cliente' THEN 2 ELSE 3 END, " +
    "CASE prioridad WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 ELSE 2 END, COALESCE(ultimo_cliente, creado) ASC LIMIT 300";
  return (await db.prepare(sql).bind(...params).all()).results;
}

export async function detalle(db, id) {
  const conv = await db.prepare("SELECT * FROM conversaciones WHERE id = ?").bind(id).first();
  if (!conv) return null;
  const [mensajes, eventos, historial] = await Promise.all([
    db.prepare("SELECT * FROM mensajes WHERE conversacion_id = ? ORDER BY fecha ASC").bind(id).all(),
    db.prepare("SELECT * FROM eventos WHERE conversacion_id = ? ORDER BY momento DESC LIMIT 50").bind(id).all(),
    db
      .prepare("SELECT id, app, asunto, estado, COALESCE(primer_mensaje, creado) AS creado FROM conversaciones WHERE cliente_email = ? AND id != ? ORDER BY 5 DESC LIMIT 50")
      .bind(conv.cliente_email, id)
      .all(),
  ]);
  return { conv, mensajes: mensajes.results, eventos: eventos.results, historial: historial.results };
}

/** Minutos entre dos fechas ISO, o null. */
export function minutos(desde, hasta) {
  if (!desde || !hasta) return null;
  const m = (Date.parse(hasta) - Date.parse(desde)) / 60000;
  return Number.isFinite(m) && m >= 0 ? m : null;
}

export function calcularMetricas(filas, ahoraIso) {
  const abiertas = filas.filter((f) => f.estado !== "cerrado");
  const sinRespuesta = abiertas.filter((f) => f.estado === "nuevo");
  const espera = sinRespuesta.map((f) => minutos(f.ultimo_cliente ?? f.creado, ahoraIso)).filter((m) => m !== null);
  const tiempos = filas.map((f) => minutos(f.primer_mensaje, f.primera_respuesta)).filter((m) => m !== null);
  const porApp = {};
  for (const f of filas) {
    const a = (porApp[f.app] ??= { total: 0, abiertas: 0, tiempos: [] });
    a.total++;
    if (f.estado !== "cerrado") a.abiertas++;
    const m = minutos(f.primer_mensaje, f.primera_respuesta);
    if (m !== null) a.tiempos.push(m);
  }
  const prom = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  return {
    abiertas: abiertas.length,
    sin_respuesta: sinRespuesta.length,
    espera_mas_larga: espera.length ? Math.max(...espera) : null,
    respuesta_promedio: prom(tiempos),
    respuestas_automaticas: filas.filter((f) => f.respuesta_auto).length,
    por_app: Object.entries(porApp)
      .map(([app, a]) => ({ app, total: a.total, abiertas: a.abiertas, respuesta_promedio: prom(a.tiempos) }))
      .sort((x, y) => y.total - x.total),
  };
}

export async function metricas(db, dias = 30) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const filas = (
    await db
      .prepare(
        "SELECT app, estado, respuesta_auto, primer_mensaje, primera_respuesta, ultimo_cliente, creado " +
          "FROM conversaciones WHERE creado >= ? OR estado != 'cerrado'",
      )
      .bind(desde)
      .all()
  ).results;
  return calcularMetricas(filas, ahora());
}
