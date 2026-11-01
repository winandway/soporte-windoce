# Contrato de plataforma — YaDominios Cloud

> **Este archivo vive en el repositorio a propósito.** Lo copió aquí una sesión
> que sí tenía red, para que cualquier sesión futura —incluidas las que corren
> en un contenedor remoto sin salida a internet— pueda trabajar sin pedirle a
> nadie que pegue documentación en el chat.
>
> Fuente: `https://yadominios.com/docs/publicar-en-yadominios-cloud`
> Si tienes red, la doc en vivo manda sobre esto:
> `curl -s -H "Accept: text/markdown" https://yadominios.com/docs/publicar-en-yadominios-cloud`

Este proyecto se publica en **YaDominios Cloud** y en ningún otro lado.

---

## 1. Dónde corre todo

Código, base de datos y archivos van **juntos**, sin servidor que administrar.
El sitio queda en `<nombre>.sitios.dev` con HTTPS, corre en el borde de la red,
y **cada push a la rama conectada republica solo**.

| Pieza | Cómo llega a tu código |
| --- | --- |
| Base de datos SQL propia del sitio (SQLite) | `env.DB` |
| Almacenamiento de archivos, sin costo de salida | `env.BUCKET` |
| Los estáticos del repositorio | `env.ASSETS` |
| Variables y secretos puestos **en el panel** | `env.LO_QUE_SEA` |
| Correo saliente (si el sitio tiene dominio propio) | `env.EMAIL` |

Basta con que el repositorio traiga un `_worker.js` para que la base y el
almacén **se creen solos** al publicar. Un `schema.sql` en la raíz crea las
tablas en cada publicación — **DDL idempotente** (`CREATE TABLE IF NOT EXISTS`).

**La base exige plan de pago.** En el plan gratis (Vista previa) `env.DB` **no
existe** y el token ni se emite. Si el proyecto necesita base de datos, dilo
ANTES de construir.

---

## 2. Lo que NO existe todavía — léelo antes de diseñar

**Cron / tareas programadas, KV, Colas y Durable Objects.**

- Los tres primeros **se ignoran en silencio**: los declaras, se publica igual,
  y no pasa nada nunca.
- Los Durable Objects **propios** sí se rechazan al publicar, con el motivo.
  (Los tres que OpenNext agrega solo —`DOQueueHandler`, `DOShardedTagCache`,
  `BucketCachePurge`— los limpia la plataforma; esos no estorban.)

**⚠️ LA TRAMPA DEL CRON.** Si tu `_worker.js` exporta un `scheduled()`, **la
publicación FUNCIONA y no avisa de nada**. Parece que quedó puesto. **Nada lo
dispara nunca.** Si tu tarea nocturna no corre, no es un bug tuyo.

**Qué hacer:** pon el reloj FUERA llamando por HTTP a una ruta de tu sitio
(un Cron Trigger de tu propia cuenta de Cloudflare, el planificador de tu
servidor, o un cron por HTTP), protegida con un secreto guardado en el panel.

**El único reloj de la plataforma** es el Vigilante: un `GET` a la portada cada
5 minutos con `user-agent: YaDominios-Vigilante/1.0`, solo para comprobar que
responde. No ejecuta nada tuyo ni toca tu base. **No sirve como reloj tuyo** —
y por eso tu portada no debe hacer trabajo pesado ni tocar la base.

---

## 3. Las cuatro trampas que cuestan días

1. **PROHIBIDO el prefijo `/api/` en tus rutas de backend.** Los estáticos se
   sirven ANTES que tu código y pueden capturar `/api/*` devolviendo 404 sin
   llegar a tu worker. Usa `/datos`, `/media`, `/upload`, `/tareas`.
2. **Del `yadominios.json` / `wrangler.jsonc` se leen DOS claves y solo dos:**
   `compatibility_date` y `compatibility_flags`. Todo lo demás —`vars`,
   `kv_namespaces`, `queues`, `triggers`, `durable_objects`— **se ignora en
   silencio**. Las variables y secretos van **en el panel**, único camino que
   funciona.
3. **Next.js: el par de versiones.** Ver §5. Es la que más caro sale.
4. **El token de la base devuelve 400, no 401, cuando fue reemplazado.** Ver §6.

---

## 4. Los tres tipos de proyecto

1. **Estático** — un `index.html` en la raíz o en `dist/ build/ out/ public/
   site/ _site/ docs/`.
2. **App ya compilada** — un `_worker.js` en la raíz: bundle único, módulo ES,
   `export default { fetch }`, dependencias dentro.
3. **Requiere compilación (Next.js, Astro, Vite…)** — **la plataforma NO corre
   builds.** Un GitHub Action compila y empuja el resultado a la rama
   `yapanel-build`, y en el panel se conecta **esa rama, no `main`**. Es el
   error más común de todos.

El repositorio de GitHub debe ser **público**.

**Caché de página completa (opt-in), úsalo en toda página pública:**
`Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`. La
plataforma la guarda en el borde (techo 1 h, se descarta al publicar) y los
robots —que piden la misma página miles de veces al día— dejan de pegarle a la
base. Nunca se guarda una visita con cookie ni una respuesta con `Set-Cookie`,
así que **no pongas cookies en páginas públicas** (ojo con la de idioma de
next-intl) y **nunca marques públicos el carrito, la cuenta ni el pago**.
Diagnóstico: cabecera `x-yad-cache` (HIT/STALE/MISS/BYPASS:motivo).

**Cuánto tarda un push en verse: hasta unos 5 minutos.** No es caché (se sirve
con `no-store`): la plataforma le pregunta a GitHub cada 5 minutos si la rama
conectada avanzó, y publica en ~20 s. En proyectos que se compilan, el reloj
empieza cuando el Action termina de empujar a `yapanel-build`. Si tras 10
minutos el registro del sitio no dice «Republicado solo», ahí sí algo falla —
antes de eso, **espera; no concluyas que está roto**.


```js
// _worker.js mínimo
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/datos") {
      const { results } = await env.DB.prepare("SELECT * FROM tabla").all();
      return Response.json(results);
    }
    return env.ASSETS.fetch(req); // sirve tu sitio
  }
};
```

**Topes del paquete:** 10 MB comprimido en gzip (el que aplica de verdad, y se
mide comprimiendo, no estimando) y 64 MB en crudo.

---

## 5. Next.js — EL PAR DE VERSIONES

**`@opennextjs/cloudflare` no acepta cualquier Next, y su rango DEJA UN HUECO
dentro de la línea 16.** No sube solo por abajo: hay versiones de Next **más
nuevas** que quedan fuera y **más viejas** que entran.

```
@opennextjs/cloudflare 1.20.6  →  next ">=15.5.24 <16 || >=16.3.3"

  Next 15.5.24 … 15.x      ✅ entra
  Next 16.0.0 … 16.3.2      ❌ NO ENTRA   ← el hueco
  Next 16.3.3 en adelante   ✅ entra
```

**El hueco SE MUEVE con cada versión del adaptador.** No memorices números:
léelos del proyecto.

```bash
node -p "require('./node_modules/@opennextjs/cloudflare/package.json').peerDependencies.next"
node -p "require('./node_modules/next/package.json').version"
```

Si cae en el hueco, el empaquetado falla con un error del compilador que **no
menciona versiones** y se pierde la tarde buscando en el código. El Action de
abajo trae la comprobación puesta.

**Ojo con `wrangler`:** el adaptador lo declara como par (hoy `^4.125.0`).

```yaml
# .github/workflows/build.yml
name: build-para-yadominios-cloud
on: { push: { branches: [main] } }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: |
          RANGO=$(node -p "require('./node_modules/@opennextjs/cloudflare/package.json').peerDependencies.next")
          MIA=$(node -p "require('./node_modules/next/package.json').version")
          # Si no se pudo leer el rango, SE PARA. Un guardián que no sabe qué
          # comparar deja pasar todo, y eso es peor que no tenerlo.
          [ -n "$RANGO" ] && [ -n "$MIA" ] || {
            echo "::error::No se pudo leer la version de Next o el rango del adaptador."
            exit 1
          }
          npx --yes semver -r "$RANGO" "$MIA" >/dev/null || {
            echo "::error::Tu Next ($MIA) no lo acepta el adaptador, que exige: $RANGO"
            exit 1
          }
      - run: npx opennextjs-cloudflare build
      # .open-next/worker.js NO es autónomo (importa ./cloudflare/, ./middleware/…).
      # Lo empaqueta WRANGLER, no esbuild: wrangler aplica las reglas del runtime
      # de Workers. --dry-run NO toca ninguna cuenta, solo escribe el archivo.
      - run: |
          npx wrangler deploy --dry-run --outdir=.dist-worker --minify
          mkdir out-deploy
          cp .dist-worker/worker.js out-deploy/_worker.js
          cp -r .open-next/assets/* out-deploy/ 2>/dev/null || true
          cp yadominios.json out-deploy/ 2>/dev/null || true
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_branch: yapanel-build
          publish_dir: ./out-deploy
```

Necesita `wrangler` como `devDependency` y un `wrangler.jsonc` en la raíz (el
`name` da igual: con `--dry-run` nunca se despliega a Cloudflare):

```jsonc
{
  "name": "mi-sitio",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-07-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": ".open-next/assets" }
}
```

**Nunca subas el `.open-next` crudo** (1000+ archivos, decenas de MB).

---

## 6. La base de datos desde fuera

```bash
curl -s -X POST https://yapanel.yadominios.com/api/hosting/db/query \
  -H 'content-type: application/json' \
  -d '{"sitio":"mi-sitio","token":"<token>","sql":"select * from pedidos where id = ?","params":[1]}'
```

El token sale del panel → tarjeta del sitio → **«Ver token»**. Se muestra **una
sola vez**, abre **solo** la base de ese sitio, y **NUNCA se commitea**.
**SQL siempre parametrizado.** Para otra de tus bases: `"base": "DB_CL"`.

**⚠️ LEE SIEMPRE EL CAMPO `error`, NO SOLO EL CÓDIGO HTTP.**

| Código | Qué significa |
| --- | --- |
| `401` | Token mal, o el sitio no tiene la consola activada. |
| `400` | Falta un campo, el sitio no existe, la base no existe, **o el token fue REEMPLAZADO**. |
| `500` | El SQL se ejecutó y falló. El motivo va en `error`. |

Un token regenerado desde el panel devuelve **400, no 401** —porque no es un
token inválido, es uno que fue válido— con el texto *«Este token fue REEMPLAZADO
el … UTC desde el panel»*. Si tu código solo trata el 401 como problema de
credenciales, ese caso se mezcla con los errores de consulta y buscarás el fallo
en tu SQL, donde no está.

**Topes:** 10 GB por base · 100 KB por sentencia · 100 parámetros ligados ·
1.000 consultas por invocación · 30 s por consulta · 2 MB por fila.
`PRAGMA foreign_keys` = 1. `CREATE INDEX` y `RETURNING` funcionan. **Varias
sentencias en una llamada son UNA transacción** — úsalo para cargas masivas:
lotes de 50 a 200 filas por llamada, cuidando los dos topes a la vez.

---

## 7. Cuando algo falle

**Panel → YaDominios Cloud → tu sitio → «Registro de errores»**, con tres
bitácoras: las publicaciones y su resultado, las llamadas a la base por la API
(cuántas bien, cuántas mal, y el último error con su SQL) y los últimos 20
errores del sitio.

Los errores de publicación vienen **etiquetados**: «Esto se arregla en tu
repositorio» (corriges y haces push a la misma rama; **no hay que reconectar
nada**) o «Esto es nuestro, no tuyo» (no toques el código, reintenta).
