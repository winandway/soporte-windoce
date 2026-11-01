// Servidor local para ver la bandeja en el navegador. Base en memoria: no toca nada en la nube.
import { createServer } from "node:http";
import worker from "../_worker.js";
import { baseDePrueba } from "../test/d1.js";

const env = { DB: baseDePrueba() };
const puerto = Number(process.env.PORT ?? 8787);
createServer(async (req, res) => {
  const cuerpo = ["GET", "HEAD"].includes(req.method) ? undefined : await new Promise((ok) => {
    const partes = []; req.on("data", (p) => partes.push(p)); req.on("end", () => ok(Buffer.concat(partes)));
  });
  if (process.env.DEPURAR) console.log(req.method, req.url, "origin:", req.headers.origin);
  const r = await worker.fetch(new Request(`https://localhost:${puerto}${req.url}`, {
    method: req.method, headers: { ...req.headers, origin: req.headers.origin?.replace("http:", "https:") ?? "", cookie: (req.headers.cookie ?? "").replace(/(^|; )bandeja=/, "$1__Host-bandeja=") }, body: cuerpo,
  }), env);
  const cab = Object.fromEntries(r.headers);
  // En local no hay HTTPS: la cookie __Host- con Secure no viajaría.
  if (cab["set-cookie"]) cab["set-cookie"] = cab["set-cookie"].replace("__Host-", "").replace("; Secure", "");
  res.writeHead(r.status, cab);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(puerto, () => console.log(`Bandeja local en http://localhost:${puerto}`));
