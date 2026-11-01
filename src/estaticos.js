export const CSS = `
:root{--fondo:#f5f6f8;--sup:#fff;--texto:#14213d;--suave:#5b6478;--borde:#e3e6ec;--marca:#0b2545;--acento:#f2b705;
--ok:#1e7d4f;--ok-bg:#e3f4ea;--mal:#b42318;--mal-bg:#fdecea;--aviso:#8a5a00;--aviso-bg:#fff4d6;--info:#1f4f99;--info-bg:#e6eefb;--radio:10px}
@media (prefers-color-scheme:dark){:root{--fondo:#0f141c;--sup:#171e29;--texto:#e8ecf3;--suave:#9aa4b6;--borde:#283243;
--ok:#6fd39c;--ok-bg:#163526;--mal:#ff8a80;--mal-bg:#3a1714;--aviso:#ffd36b;--aviso-bg:#3a2c08;--info:#8db4ff;--info-bg:#17284a}}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--fondo);color:var(--texto)}
a{color:var(--info)}main{max-width:1100px;margin:0 auto;padding:16px}
.cab{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--marca);color:#fff}
.marca{display:flex;gap:10px;align-items:center;color:#fff;text-decoration:none;font-weight:600}
.cab .enlace{color:#fff}
.enlace{background:none;border:0;color:var(--info);cursor:pointer;font:inherit;text-decoration:underline;padding:0}
footer{text-align:center;color:var(--suave);font-size:13px;padding:24px 16px}
footer a{color:inherit}
h1{font-size:22px;margin:8px 0 12px}h2{font-size:15px;margin:0 0 8px}
.sub{color:var(--suave);font-size:14px}
button,select,input,textarea{font:inherit;color:inherit}
button,.primario,.acciones a{border:1px solid var(--borde);background:var(--sup);border-radius:8px;padding:8px 14px;cursor:pointer;text-decoration:none;display:inline-block}
.primario,.acciones a.primario{background:var(--marca);color:#fff;border-color:var(--marca)}
select,input,textarea{background:var(--sup);border:1px solid var(--borde);border-radius:8px;padding:8px 10px;width:100%}
.entrar{max-width:380px;margin:48px auto;background:var(--sup);padding:24px;border-radius:14px;border:1px solid var(--borde)}
.entrar form{display:grid;gap:12px}.entrar .primario{width:100%;padding:10px}
.campo-clave{position:relative}.campo-clave input{padding-right:44px}
.ojo{position:absolute;right:4px;top:50%;transform:translateY(-50%);border:0;background:none;padding:6px 8px}
.error{background:var(--mal-bg);color:var(--mal);padding:10px 12px;border-radius:8px}
.metricas{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.metrica{background:var(--sup);border:1px solid var(--borde);border-radius:var(--radio);padding:12px 14px;display:grid}
.metrica span{color:var(--suave);font-size:13px}.metrica strong{font-size:24px;font-weight:600}
.metrica.ok strong{color:var(--ok)}.metrica.alerta strong{color:var(--mal)}
.nota-ingesta{color:var(--suave);font-size:13px;margin:10px 0}
.filtros{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 12px}.filtros label{display:grid;gap:4px;font-size:13px;color:var(--suave);min-width:160px;flex:1}
.lista{display:grid;gap:8px}
.fila{display:block;background:var(--sup);border:1px solid var(--borde);border-radius:var(--radio);padding:12px 14px;color:inherit;text-decoration:none}
.fila:hover{border-color:var(--suave)}.fila.estado-nuevo{border-left:4px solid var(--mal)}
.fila-top{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
.fila-asunto{font-weight:600;overflow-wrap:anywhere}
.fila-pie{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;color:var(--suave);font-size:13px;margin-top:4px}
.chip{font-size:12px;padding:2px 8px;border-radius:999px;background:var(--fondo);border:1px solid var(--borde)}
.chip.app{background:var(--info-bg);color:var(--info);border-color:transparent}
.chip.est-nuevo,.chip.pri-urgente{background:var(--mal-bg);color:var(--mal);border-color:transparent}
.chip.est-en_curso,.chip.pri-alta{background:var(--aviso-bg);color:var(--aviso);border-color:transparent}
.chip.est-cerrado,.chip.auto,.chip.est-esperando_cliente{background:var(--ok-bg);color:var(--ok);border-color:transparent}
.vacio{text-align:center;padding:40px 16px;color:var(--suave)}
.por-app{margin-top:16px;background:var(--sup);border:1px solid var(--borde);border-radius:var(--radio);padding:12px 14px}
.tabla{width:100%;border-collapse:collapse;margin-top:8px;font-size:14px}.tabla th,.tabla td{text-align:left;padding:6px 4px;border-bottom:1px solid var(--borde)}
.volver{display:inline-block;margin:4px 0}
.detalle{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;margin-top:12px}
@media (max-width:820px){.detalle{grid-template-columns:minmax(0,1fr)}}
.hilo{display:grid;gap:10px;align-content:start}
.msj{background:var(--sup);border:1px solid var(--borde);border-radius:var(--radio);padding:12px 14px}
.msj-soporte{background:var(--ok-bg);border-color:transparent}
.msj header{display:flex;justify-content:space-between;gap:8px;font-size:14px;margin-bottom:6px}.msj time{color:var(--suave)}
.msj p{margin:0;overflow-wrap:anywhere}
aside{display:grid;gap:12px;align-content:start}
.caja{background:var(--sup);border:1px solid var(--borde);border-radius:var(--radio);padding:12px 14px;display:grid;gap:8px}
.caja p{margin:0}.acciones{display:flex;gap:8px;flex-wrap:wrap}
.estados{display:grid;grid-template-columns:1fr 1fr;gap:6px}.estado-btn{font-size:14px;padding:6px 8px}
.estado-btn.activo{background:var(--marca);color:#fff;border-color:var(--marca)}
.historial{list-style:none;margin:0;padding:0;display:grid;gap:8px}.historial li{display:grid;font-size:14px}
.adjuntos{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:4px;font-size:14px}
.aviso-borrador{font-size:13px;color:var(--aviso)}
`;

export const JS = `
document.querySelectorAll("[data-ojo]").forEach(function(b){b.addEventListener("click",function(){
var i=document.getElementById(b.dataset.ojo);var ver=i.type==="password";i.type=ver?"text":"password";
b.setAttribute("aria-label",ver?"Ocultar la contraseña":"Ver la contraseña");});});
document.querySelectorAll("select[data-auto]").forEach(function(s){s.addEventListener("change",function(){s.form.submit();});});
document.querySelectorAll("form[data-borrador]").forEach(function(f){
var llave="borrador:"+f.dataset.borrador;var t=f.querySelector("textarea");var aviso=f.querySelector(".aviso-borrador");var timer;
function leer(){try{return localStorage.getItem(llave);}catch(e){return null;}}
function borrar(){try{localStorage.removeItem(llave);}catch(e){}}
var guardado=leer();if(guardado!==null&&guardado!==t.value){t.value=guardado;if(aviso)aviso.hidden=false;}
t.addEventListener("input",function(){clearTimeout(timer);timer=setTimeout(function(){try{localStorage.setItem(llave,t.value);}catch(e){}},500);});
var d=f.querySelector("[data-descartar]");if(d)d.addEventListener("click",function(){borrar();t.value=t.defaultValue;aviso.hidden=true;});
f.addEventListener("submit",function(ev){ev.preventDefault();var datos=new FormData(f);
fetch(f.action,{method:"POST",body:datos,headers:{"accept":"application/json"}}).then(function(r){
if(!r.ok)throw new Error(r.status);borrar();t.defaultValue=t.value;if(aviso)aviso.hidden=true;
var b=f.querySelector("button[type=submit]");b.textContent="Guardada";setTimeout(function(){b.textContent="Guardar nota";},1500);
}).catch(function(){alert("No se pudo guardar la nota. Lo que escribiste sigue aquí; inténtalo otra vez.");});});});
`;

export const ICONO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b2545"/><path d="M14 20h36v24H14z" fill="none" stroke="#f2b705" stroke-width="4" stroke-linejoin="round"/><path d="M14 22l18 13 18-13" fill="none" stroke="#f2b705" stroke-width="4" stroke-linejoin="round"/></svg>`;

export const MANIFEST = JSON.stringify({
  name: "Soporte Windoce",
  short_name: "Soporte",
  start_url: "/",
  display: "standalone",
  background_color: "#0b2545",
  theme_color: "#0b2545",
  icons: [{ src: "/icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
});
