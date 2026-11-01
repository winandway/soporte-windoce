import { APPS, ESTADOS, ORIGENES, PRIORIDADES, TIPOS } from "./datos.js";

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function duracion(min) {
  if (min === null || min === undefined) return "—";
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} días`;
}

const fechaCorta = (iso) =>
  iso
    ? new Date(iso).toLocaleString("es-US", { timeZone: "America/New_York", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "—";

function pagina(titulo, cuerpo, { conSesion = true, siteKey } = {}) {
  const año = new Date().getFullYear();
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(titulo)} · Soporte Windoce</title>
<link rel="icon" href="/icono.svg" type="image/svg+xml"><link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0b2545">
<link rel="stylesheet" href="/app.css">
${siteKey ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ""}
</head><body>
<header class="cab"><a class="marca" href="/"><img src="/icono.svg" alt="" width="28" height="28"> Soporte Windoce</a>
${conSesion ? '<form method="post" action="/salir"><button class="enlace" type="submit">Cerrar sesión</button></form>' : ""}
</header>
<main>${cuerpo}</main>
<footer>© ${año} windoce.com | All rights reserved. Developed by <a href="https://windoce.com" target="_blank" rel="noopener noreferrer">Windoce LLC</a></footer>
<script src="/app.js" defer></script>
</body></html>`;
}

export function vistaEntrar({ error, siteKey } = {}) {
  return pagina(
    "Entrar",
    `<section class="entrar">
<h1>Bandeja de soporte</h1>
<p class="sub">Todos los correos de clientes de tus apps, en un solo lugar.</p>
${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
<form method="post" action="/entrar">
<label for="clave">Contraseña</label>
<div class="campo-clave"><input id="clave" name="clave" type="password" autocomplete="current-password" required autofocus>
<button type="button" class="ojo" data-ojo="clave" aria-label="Ver la contraseña">👁</button></div>
${siteKey ? `<div class="cf-turnstile" data-sitekey="${esc(siteKey)}"></div>` : ""}
<button class="primario" type="submit">Entrar</button>
</form></section>`,
    { conSesion: false, siteKey },
  );
}

const chip = (clase, texto) => `<span class="chip ${clase}">${esc(texto)}</span>`;

function tarjetaMetrica(etiqueta, valor, clase = "") {
  return `<div class="metrica ${clase}"><span>${esc(etiqueta)}</span><strong>${esc(valor)}</strong></div>`;
}

export function vistaBandeja({ filas, m, filtro, ahoraIso, ultimaIngesta }) {
  const opcionesApp = Object.entries(APPS)
    .map(([k, v]) => `<option value="${k}"${filtro.app === k ? " selected" : ""}>${esc(v)}</option>`)
    .join("");
  const opcionesEstado = [["abiertos", "Abiertas"], ...Object.entries(ESTADOS), ["todos", "Todas"]]
    .map(([k, v]) => `<option value="${k}"${(filtro.estado ?? "abiertos") === k ? " selected" : ""}>${esc(v)}</option>`)
    .join("");
  const lista = filas.length
    ? filas
        .map((f) => {
          const espera = f.estado === "nuevo" ? (Date.parse(ahoraIso) - Date.parse(f.ultimo_cliente ?? f.creado)) / 60000 : null;
          return `<a class="fila estado-${esc(f.estado)}" href="/c/${encodeURIComponent(f.id)}">
<div class="fila-top">${chip("app", APPS[f.app] ?? f.app)}${chip(`est-${f.estado}`, ESTADOS[f.estado] ?? f.estado)}${f.prioridad !== "normal" ? chip(`pri-${f.prioridad}`, PRIORIDADES[f.prioridad]) : ""}${f.respuesta_auto ? chip("auto", "Respondida sola") : ""}</div>
<div class="fila-asunto">${esc(f.asunto)}</div>
<div class="fila-pie"><span>${f.origen === "app" ? "📱 " : ""}${esc(f.cliente_nombre || f.cliente_email || "Sin nombre")} · ${esc(TIPOS[f.tipo] ?? f.tipo)}</span><span>${espera !== null ? `Sin respuesta hace ${duracion(espera)}` : fechaCorta([f.ultima_respuesta, f.ultimo_cliente].filter(Boolean).sort().pop() ?? f.creado)}</span></div>
</a>`;
        })
        .join("")
    : `<div class="vacio"><h2>No hay conversaciones aquí</h2><p>Cuando un cliente escriba a soporte, aparece en esta lista en menos de una hora.</p></div>`;
  const porApp = m.por_app.length
    ? `<table class="tabla"><thead><tr><th>App</th><th>Conversaciones</th><th>Abiertas</th><th>Primera respuesta</th></tr></thead><tbody>${m.por_app
        .map((a) => `<tr><td>${esc(APPS[a.app] ?? a.app)}</td><td>${a.total}</td><td>${a.abiertas}</td><td>${duracion(a.respuesta_promedio)}</td></tr>`)
        .join("")}</tbody></table>`
    : "";
  return pagina(
    "Bandeja",
    `<section class="metricas">
${tarjetaMetrica("Sin responder", m.sin_respuesta, m.sin_respuesta ? "alerta" : "ok")}
${tarjetaMetrica("Abiertas", m.abiertas)}
${tarjetaMetrica("Espera más larga", duracion(m.espera_mas_larga), m.espera_mas_larga > 1440 ? "alerta" : "")}
${tarjetaMetrica("Primera respuesta, promedio", duracion(m.respuesta_promedio), "ok")}
</section>
<p class="nota-ingesta">Última revisión del correo: ${esc(fechaCorta(ultimaIngesta))} · ${m.respuestas_automaticas} respondidas solas en 30 días</p>
<form class="filtros" method="get" action="/">
<label>App <select name="app" data-auto><option value="">Todas</option>${opcionesApp}</select></label>
<label>Estado <select name="estado" data-auto>${opcionesEstado}</select></label>
<noscript><button type="submit">Filtrar</button></noscript>
</form>
<section class="lista">${lista}</section>
${porApp ? `<details class="por-app"><summary>Tiempos por app, últimos 30 días</summary>${porApp}</details>` : ""}`,
  );
}

export function vistaDetalle({ conv, mensajes, eventos, historial }) {
  const botones = Object.entries(ESTADOS)
    .map(
      ([k, v]) =>
        `<button type="submit" name="estado" value="${k}" class="estado-btn${conv.estado === k ? " activo" : ""}"${conv.estado === k ? ' aria-pressed="true"' : ""}>${esc(v)}</button>`,
    )
    .join("");
  const prioridades = Object.entries(PRIORIDADES)
    .map(([k, v]) => `<option value="${k}"${conv.prioridad === k ? " selected" : ""}>${esc(v)}</option>`)
    .join("");
  const hilo = mensajes
    .map(
      (m) => `<article class="msj ${m.de === "soporte" ? "msj-soporte" : "msj-cliente"}">
<header><strong>${m.de === "soporte" ? "Soporte" : esc(conv.cliente_nombre || conv.cliente_email)}</strong><time>${esc(fechaCorta(m.fecha))}</time></header>
<p>${esc(m.texto).replace(/\n/g, "<br>")}</p>${vistaAdjuntos(m.adjuntos, conv)}</article>`,
    )
    .join("");
  const asuntoRespuesta = encodeURIComponent(`Re: ${conv.asunto}`);
  const responder = conv.cliente_email ? `mailto:${encodeURIComponent(conv.cliente_email)}?subject=${asuntoRespuesta}` : null;
  const enlaceGmail = conv.origen === "correo" ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(conv.id)}` : null;
  const acciones = conv.origen === "app"
    ? `<p class="sub">Este caso llegó desde la ayuda de la app. Se contesta dentro de la app: el gerente lo responde cada hora, o díctale la respuesta.</p>`
    : `<p class="acciones">${responder ? `<a class="primario" href="${responder}">Responder por correo</a>` : ""}${enlaceGmail ? `<a href="${enlaceGmail}" target="_blank" rel="noopener noreferrer">Abrir en Gmail</a>` : ""}</p>`;
  return pagina(
    conv.asunto,
    `<a class="volver" href="/">← Bandeja</a>
<h1>${esc(conv.asunto)}</h1>
<div class="fila-top">${chip("app", APPS[conv.app] ?? conv.app)}${chip("", ORIGENES[conv.origen] ?? conv.origen)}${chip("", TIPOS[conv.tipo] ?? conv.tipo)}${conv.respuesta_auto ? chip("auto", `Respondida sola${conv.plantilla ? ` (${conv.plantilla})` : ""}`) : ""}${conv.sesion_avisada ? chip("", "Proyecto avisado") : ""}</div>
<div class="detalle">
<div class="hilo">${hilo}</div>
<aside>
<div class="caja"><h2>Cliente</h2><p>${esc(conv.cliente_nombre || "Sin nombre")}${conv.cliente_email ? `<br><span class="sub">${esc(conv.cliente_email)}</span>` : ""}</p>
${acciones}</div>
<form class="caja" method="post" action="/c/${encodeURIComponent(conv.id)}/estado">
<h2>Estado</h2><div class="estados">${botones}</div>
<label>Prioridad <select name="prioridad" data-auto>${prioridades}</select></label>
</form>
<form class="caja" method="post" action="/c/${encodeURIComponent(conv.id)}/estado" data-borrador="nota-${esc(conv.id)}">
<h2>Nota interna</h2><textarea name="nota" rows="4" placeholder="Lo que hay que recordar de este caso">${esc(conv.nota)}</textarea>
<p class="aviso-borrador" hidden>Recuperamos lo que estabas escribiendo. <button type="button" class="enlace" data-descartar>Empezar de nuevo</button></p>
<button type="submit">Guardar nota</button></form>
${historial.length ? `<div class="caja"><h2>Historial del cliente</h2><ul class="historial">${historial.map((h) => `<li><a href="/c/${encodeURIComponent(h.id)}">${esc(h.asunto)}</a><span class="sub">${esc(APPS[h.app] ?? h.app)} · ${esc(ESTADOS[h.estado] ?? h.estado)} · ${esc(fechaCorta(h.creado))}</span></li>`).join("")}</ul></div>` : ""}
<div class="caja"><h2>Actividad</h2><ul class="historial">${eventos.map((e) => `<li>${esc(e.que)}<span class="sub">${esc(e.quien)} · ${esc(fechaCorta(e.momento))}</span></li>`).join("")}</ul></div>
</aside></div>`,
  );
}

function vistaAdjuntos(adjuntos, conv) {
  if (!adjuntos?.length) return "";
  const items = adjuntos
    .map((a) =>
      a.url
        ? `<li><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">📎 ${esc(a.nombre)}</a></li>`
        : `<li>📎 ${esc(a.nombre)} <span class="sub">${conv.origen === "correo" ? "(ábrelo en Gmail)" : ""}</span></li>`,
    )
    .join("");
  return `<ul class="adjuntos">${items}</ul>`;
}

export function vistaNoEncontrado() {
  return pagina("No encontrada", `<div class="vacio"><h1>Esta conversación no existe</h1><p><a href="/">Volver a la bandeja</a></p></div>`);
}
