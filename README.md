# Bandeja de soporte de Windoce

Página privada con todos los correos de clientes de las apps de Windoce. Solo la usa Richard.
Se publica en YaDominios Cloud como app ya compilada (`_worker.js`) con base de datos (`schema.sql`).
El contrato de la plataforma está en `CONTRATO-YADOMINIOS.md`.

## Cómo funciona

```
Gmail (go@windoce.com, alias soporte@ + etiqueta por app)
   │  la revisión horaria del gerente lee, clasifica, responde con plantillas
   ▼
POST /datos/ingesta  (llave de carga, Bearer)  ──►  base del sitio (conversaciones, mensajes, eventos)
                                                         │
Richard  ──►  /  (contraseña)  ──►  bandeja, detalle, estado, nota, historial, tiempos
Webs de las apps  ──►  POST /datos/contacto  (formulario público, límite 5 por hora por IP)
```

- No hay reloj en la plataforma: quien carga los correos es la tarea programada del gerente, cada hora.
- `/datos/salud` es el canario: base y hora de la última carga. El gerente lo revisa en cada corrida.

## Secretos (nunca en el repo)

| Qué | Dónde vive | En el repo |
|---|---|---|
| Contraseña de Richard | `~/.config/gerente-correo/bandeja-clave` | solo el hash PBKDF2 en `src/config.js` |
| Llave de carga | `~/.config/gerente-correo/bandeja-ingesta` | solo su SHA-256 en `src/config.js` |
| Turnstile (opcional) | panel de YaDominios: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | nada; sin ellas se apaga solo |

Para cambiar la contraseña: generar una nueva, recalcular el hash (PBKDF2-SHA256, 100 000 vueltas, sal nueva)
y publicar. Todas las sesiones abiertas siguen vivas hasta que venzan (30 días) o se borre la tabla `sesiones`.

## Comandos

```bash
npm run build    # empaqueta src/ en _worker.js (se commitea: la plataforma no compila)
npm test         # pruebas con cobertura (base SQLite en memoria, sin red)
npm run verify   # build + pruebas + audit + comprueba que _worker.js está al día
node scripts/dev.mjs   # vista local en http://localhost:8787 (base en memoria)
```

## Candados

Cada uno tiene su prueba en `test/bandeja.test.js`, comprobada en rojo metiendo el fallo a propósito.

1. **Sin sesión no se ve ningún correo.** Prueba: «sin sesión, la bandeja muestra la pantalla de entrar…».
   Comprobado en rojo el 2026-11-01 (quitando la comprobación de sesión fallan tres pruebas).
2. **Una carga repetida no duplica mensajes** (los ids de Gmail son la llave). Comprobado en rojo el 2026-11-01.
3. **`Referrer-Policy: same-origin`, nunca `no-referrer`.** Se rompió el 2026-11-01 en la prueba local: con
   `no-referrer` Chrome manda `Origin: null` en los formularios y la defensa contra CSRF rechazaba todos los
   botones del panel («Origen no permitido»). La prueba de cabeceras exige `same-origin`.
4. **Cerrar sesión borra la sesión en el servidor**, no solo la cookie.
5. **Contraseña con ojito** y límite de 5 intentos cada 15 minutos por IP.

Qué NO tocar: el nombre de la cookie `__Host-bandeja` (exige HTTPS y Path=/), el prefijo `/datos/` de las rutas
(nunca `/api/`), y `_worker.js` a mano (se genera con `npm run build`).

## Deuda conocida

- La app del celular es la misma página instalada como app (manifest). Avisos propios por push todavía no:
  los avisos urgentes siguen llegando por el gerente.
- El formulario de contacto acepta los dominios de `ORIGENES_FORMULARIO` en `src/worker.js`. FinTwin, Escenia
  y Win12 se agregan cuando sus webs tengan dominio confirmado.
- Sin TypeScript: JavaScript con validación zod en todo lo que entra. El panel es solo en español porque lo usa Richard.
