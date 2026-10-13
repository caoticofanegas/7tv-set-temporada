// ==UserScript==
// @name         7TV · Set de temporada
// @namespace    https://7tv.app/
// @version      0.4.0
// @description  Crea un set de temporada (Halloween, Navidad...) copiando el set normal y sustituyendo por nombre los emotes que tienen versión de temporada.
// @match        https://7tv.app/*
// @match        https://*.7tv.app/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      7tv.io
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const API = "https://7tv.io/v3";
  const GQL = API + "/gql";
  const PAUSA_MS = 400;

  const MUTATION = `
mutation ChangeEmoteInSet($id: ObjectID!, $action: ListItemAction!, $emote_id: ObjectID!, $name: String) {
  emoteSet(id: $id) {
    id
    emotes(id: $emote_id, action: $action, name: $name) { id name }
  }
}`;

  // ---------- utilidades ----------

  function peticion(opts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        ...opts,
        timeout: 20000,
        onload: (r) => {
          if (r.status < 200 || r.status >= 300) {
            const amable = {
              400: "7TV no reconoce ese ID de set.",
              401: "No tienes la sesión iniciada en 7TV (o el token ha caducado).",
              403: "No tienes permiso para modificar ese set.",
              404: "Ese set no existe (¿lo has borrado o el ID está mal?).",
              429: "Demasiadas peticiones seguidas; espera un minuto y vuelve a probar.",
            }[r.status];
            const detalle = "HTTP " + r.status + ": " + (r.responseText || "").slice(0, 160);
            reject(new Error(amable ? amable + " (" + detalle + ")" : detalle));
            return;
          }
          try { resolve(JSON.parse(r.responseText)); }
          catch (e) { reject(new Error("Respuesta no válida de 7TV")); }
        },
        onerror: () => reject(new Error("Error de red")),
        ontimeout: () => reject(new Error("La API tardó demasiado")),
      });
    });
  }

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  // Los IDs de 7TV son de 24 (antiguos) o 26 caracteres (nuevos).
  const ID_VALIDO = /^[A-Za-z0-9]{24,26}$/;

  // Devuelve el ID del set, "" si el campo está vacío, o lanza un error explicando qué pasa.
  function extraerId(texto, campo) {
    const t = (texto || "").trim();
    if (!t) return "";
    const m = t.match(/\/emote-sets\/([A-Za-z0-9]+)/);
    if (m && ID_VALIDO.test(m[1])) return m[1];
    if (/\/users\//.test(t)) {
      throw new Error(`${campo}: esa URL es de un perfil de usuario, no de un set. ` +
        "Abre el set (Emote Sets → clic en el set) y copia la URL, que empieza por 7tv.app/emote-sets/…");
    }
    if (/^https?:\/\//i.test(t) || t.includes("/")) {
      throw new Error(`${campo}: esa URL no es de un set. Tiene que ser del tipo 7tv.app/emote-sets/…`);
    }
    if (!ID_VALIDO.test(t)) {
      throw new Error(`${campo}: "${t.slice(0, 40)}" no parece un ID de set válido.`);
    }
    return t;
  }

  function leerToken() {
    const manual = document.getElementById("st7-token").value.trim();
    if (manual) return manual.replace(/^"|"$/g, "");
    try {
      const t = localStorage.getItem("7tv-token");
      if (t) return t.replace(/^"|"$/g, "");
    } catch (e) { /* nada */ }
    return null;
  }

  async function leerSet(id) {
    const data = await peticion({ method: "GET", url: API + "/emote-sets/" + encodeURIComponent(id) });
    const emotes = (data.emotes || []).map((e) => [e.name, e.id]);
    return { nombre: data.name || id, emotes };
  }

  async function cambiar(token, setId, accion, emoteId, nombre) {
    const variables = { id: setId, action: accion, emote_id: emoteId };
    if (nombre) variables.name = nombre;
    const r = await peticion({
      method: "POST",
      url: GQL,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      data: JSON.stringify({ query: MUTATION, variables }),
    });
    if (r.errors && r.errors.length) throw new Error(r.errors[0].message || JSON.stringify(r.errors));
    await dormir(PAUSA_MS);
  }

  // ---------- lógica (igual que set_temporada.py) ----------

  function planificar(base, reemplazos, destino) {
    const { unicos, repetidos } = sinNombresRepetidos(base.emotes);
    const deseado = new Map(unicos);
    const sinPareja = [];

    for (const [nombre, eid] of sinNombresRepetidos(reemplazos.emotes).unicos) {
      if (!deseado.has(nombre)) sinPareja.push(nombre);
      deseado.set(nombre, eid);
    }

    // El mismo emote no puede estar dos veces en un set.
    const vistos = new Set();
    const duplicados = [];
    for (const [n, eid] of [...deseado]) {
      if (vistos.has(eid)) { duplicados.push(n); deseado.delete(n); }
      else vistos.add(eid);
    }

    const actual = new Map(destino.emotes);
    const quitar = [];
    for (const [n, eid] of actual) {
      if (deseado.has(n) && deseado.get(n) !== eid) quitar.push([n, eid]);
    }
    const claveQuitar = new Set(quitar.map(([n, e]) => n + "\u0000" + e));
    const idsQuedan = new Set();
    for (const [n, eid] of actual) if (!claveQuitar.has(n + "\u0000" + eid)) idsQuedan.add(eid);

    const anadir = [];
    for (const [n, eid] of deseado) if (actual.get(n) !== eid) anadir.push([n, eid]);

    const sobrantes = [...actual.keys()].filter((n) => !deseado.has(n));

    // Si el emote ya está en destino con otro nombre, hay que quitarlo antes de añadirlo.
    for (const [, eid] of anadir) {
      if (idsQuedan.has(eid)) {
        const viejo = [...actual].find(([, v]) => v === eid)[0];
        const k = viejo + "\u0000" + eid;
        if (!claveQuitar.has(k)) { quitar.push([viejo, eid]); claveQuitar.add(k); }
      }
    }

    return { deseado, sinPareja, duplicados, quitar, anadir, sobrantes, respetados: [], repetidos };
  }

  // Sin set de reemplazos: copia del normal al destino SIN quitar nada.
  // Si en el destino ya hay un emote con ese nombre (p. ej. una versión de Halloween
  // que has puesto a mano), se respeta y no se pisa.
  function planificarCopia(baseOriginal, destino) {
    const { unicos, repetidos } = sinNombresRepetidos(baseOriginal.emotes);
    const nombresDest = new Set(destino.emotes.map(([n]) => n));
    const idsDest = new Set(destino.emotes.map(([, e]) => e));
    const anadir = [];
    const respetados = [];
    const duplicados = [];
    for (const [n, eid] of unicos) {
      if (nombresDest.has(n)) {
        if (!idsDest.has(eid)) respetados.push(n);
        continue;
      }
      if (idsDest.has(eid)) { duplicados.push(n); continue; }
      anadir.push([n, eid]);
    }
    const nombresBase = new Set(unicos.map(([n]) => n));
    const sobrantes = destino.emotes.map(([n]) => n).filter((n) => !nombresBase.has(n));
    return {
      deseado: { size: destino.emotes.length + anadir.length },
      sinPareja: [], duplicados, quitar: [], anadir, sobrantes, respetados, repetidos,
    };
  }

  // En un set no puede haber dos emotes con el mismo nombre (7TV distingue mayúsculas:
  // peepoFinger y PeepoFinger sí pueden convivir). Si el set de origen trae nombres
  // repetidos, se queda el primero y se avisa del resto.
  function sinNombresRepetidos(emotes) {
    const vistosNombre = new Set();
    const vistosId = new Set();
    const unicos = [];
    const repetidos = [];
    for (const [n, eid] of emotes) {
      if (vistosNombre.has(n)) { repetidos.push(n); continue; }
      if (vistosId.has(eid)) continue;
      vistosNombre.add(n);
      vistosId.add(eid);
      unicos.push([n, eid]);
    }
    return { unicos, repetidos };
  }

  // ---------- interfaz ----------

  const css = `
#st7-boton{position:fixed;right:18px;bottom:18px;z-index:99999;background:#7c3aed;color:#fff;border:0;border-radius:999px;padding:10px 16px;font:600 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)}
#st7-boton:hover{background:#6d28d9}
#st7-panel{position:fixed;right:18px;bottom:70px;z-index:99999;width:min(440px,calc(100vw - 36px));max-height:calc(100vh - 100px);overflow:auto;background:#17151c;color:#eee;border:1px solid #333;border-radius:12px;padding:16px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);display:none}
#st7-panel h3{margin:0 0 4px;font-size:16px}
#st7-panel p.st7-ayuda{margin:0 0 12px;color:#aaa;font-size:12.5px}
#st7-panel label{display:block;margin:10px 0 4px;font-weight:600;font-size:13px}
#st7-panel input{width:100%;box-sizing:border-box;background:#0f0e13;color:#eee;border:1px solid #3a3744;border-radius:8px;padding:8px}
#st7-panel details{margin-top:10px;color:#aaa;font-size:12.5px}
#st7-panel .st7-fila{display:flex;gap:8px;margin-top:14px}
#st7-panel button.st7-b{flex:1;border:0;border-radius:8px;padding:9px;font-weight:600;cursor:pointer;background:#2e2b38;color:#eee}
#st7-panel button.st7-b.prim{background:#7c3aed;color:#fff}
#st7-panel button.st7-b:disabled{opacity:.45;cursor:default}
#st7-salida{margin-top:14px;background:#0f0e13;border-radius:8px;padding:10px;font:12.5px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow:auto;display:none}
.st7-ok{color:#4ade80}.st7-err{color:#f87171}.st7-av{color:#fbbf24}.st7-gris{color:#999}
`;

  function montar() {
    if (document.getElementById("st7-boton")) return;
    const estilo = document.createElement("style");
    estilo.textContent = css;
    document.head.appendChild(estilo);

    const boton = document.createElement("button");
    boton.id = "st7-boton";
    boton.textContent = "🎃 Set de temporada";
    document.body.appendChild(boton);

    const panel = document.createElement("div");
    panel.id = "st7-panel";
    panel.innerHTML = `
      <h3>Set de temporada</h3>
      <p class="st7-ayuda">Copia el set normal en el de temporada y sustituye por nombre los emotes que tienen versión especial. Pega el ID o la URL de cada set.</p>
      <label for="st7-base">Set normal</label>
      <input id="st7-base" placeholder="ID o URL del set normal">
      <label for="st7-repl">Set de reemplazos (opcional)</label>
      <input id="st7-repl" placeholder="Vacío = copiar todo el normal al destino">
      <label for="st7-dest">Set de temporada (destino)</label>
      <input id="st7-dest" placeholder="Puede estar vacío">
      <details>
        <summary>Token (solo si no lo encuentra solo)</summary>
        <label for="st7-token">Token de 7TV</label>
        <input id="st7-token" type="password" placeholder="Normalmente no hace falta" autocomplete="off">
        <div style="margin-top:6px">No se guarda: solo se usa en esta pestaña para hablar con la API de 7TV.</div>
      </details>
      <div class="st7-fila">
        <button class="st7-b" id="st7-prev">Previsualizar</button>
        <button class="st7-b prim" id="st7-apl" disabled>Aplicar cambios</button>
      </div>
      <div id="st7-salida"></div>`;
    document.body.appendChild(panel);

    const $ = (id) => document.getElementById(id);
    $("st7-base").value = GM_getValue("base", "");
    $("st7-repl").value = GM_getValue("repl", "");
    $("st7-dest").value = GM_getValue("dest", "");

    boton.addEventListener("click", () => {
      panel.style.display = panel.style.display === "block" ? "none" : "block";
    });

    const salida = $("st7-salida");
    function limpiar() { salida.textContent = ""; salida.style.display = "block"; }
    function linea(texto, clase) {
      const div = document.createElement("div");
      div.textContent = texto;
      if (clase) div.className = clase;
      salida.appendChild(div);
      salida.scrollTop = salida.scrollHeight;
    }

    let plan = null;
    let destinoId = null;

    $("st7-prev").addEventListener("click", async () => {
      plan = null;
      $("st7-apl").disabled = true;
      limpiar();
      let ids;
      try {
        ids = {
          base: extraerId($("st7-base").value, "Set normal"),
          repl: extraerId($("st7-repl").value, "Set de reemplazos"),
          dest: extraerId($("st7-dest").value, "Set de temporada"),
        };
      } catch (e) {
        linea(e.message, "st7-err");
        return;
      }
      if (!ids.base || !ids.dest) { linea("Rellena al menos el set normal y el de destino.", "st7-err"); return; }
      const usados = Object.values(ids).filter(Boolean);
      if (new Set(usados).size < usados.length) { linea("Los sets tienen que ser distintos.", "st7-err"); return; }
      GM_setValue("base", ids.base); GM_setValue("repl", ids.repl); GM_setValue("dest", ids.dest);

      $("st7-prev").disabled = true;
      linea("Leyendo sets…", "st7-gris");
      try {
        const [base, repl, dest] = await Promise.all([
          leerSet(ids.base),
          ids.repl ? leerSet(ids.repl) : Promise.resolve(null),
          leerSet(ids.dest),
        ]);
        const p = repl ? planificar(base, repl, dest) : planificarCopia(base, dest);
        limpiar();
        linea(`Normal:     ${base.nombre} (${base.emotes.length})`);
        linea(repl ? `Reemplazos: ${repl.nombre} (${repl.emotes.length})` : "Reemplazos: ninguno (solo copiar lo que falta)");
        linea(`Destino:    ${dest.nombre} (${dest.emotes.length} ahora → ${p.deseado.size} al terminar)`);
        if (p.sinPareja.length) {
          linea("\nSin emote normal con ese nombre (se añaden como nuevos):", "st7-av");
          p.sinPareja.forEach((n) => linea("  + " + n, "st7-av"));
        }
        if (p.repetidos.length) {
          linea("\nNombre repetido dentro del set normal (solo cabe uno; se copia el primero):", "st7-av");
          p.repetidos.forEach((n) => linea("  ! " + n, "st7-av"));
        }
        if (p.respetados.length) {
          linea("\nYa están en el destino con otra versión (se respetan, no se pisan):", "st7-gris");
          p.respetados.forEach((n) => linea("  = " + n, "st7-gris"));
        }
        if (p.duplicados.length) {
          linea("\nOmitidos (el mismo emote ya estaba con otro nombre):", "st7-av");
          p.duplicados.forEach((n) => linea("  ! " + n, "st7-av"));
        }
        if (p.sobrantes.length) {
          linea("\nEn el destino pero no en los otros sets (no se tocan):", "st7-gris");
          p.sobrantes.forEach((n) => linea("  ? " + n, "st7-gris"));
        }
        if (p.quitar.length) {
          linea("\nSe quitarán:");
          p.quitar.forEach(([n]) => linea("  - " + n, "st7-err"));
        }
        if (p.anadir.length) {
          linea("\nSe añadirán:");
          p.anadir.forEach(([n]) => linea("  + " + n, "st7-ok"));
        }
        linea(`\nCambios: quitar ${p.quitar.length}, añadir ${p.anadir.length}`);
        if (!p.quitar.length && !p.anadir.length) {
          linea("El set de temporada ya está al día.", "st7-ok");
        } else {
          plan = p;
          destinoId = ids.dest;
          $("st7-apl").disabled = false;
        }
      } catch (e) {
        linea("Error leyendo los sets: " + e.message, "st7-err");
      } finally {
        $("st7-prev").disabled = false;
      }
    });

    $("st7-apl").addEventListener("click", async () => {
      if (!plan) return;
      const token = leerToken();
      if (!token) {
        linea("\nNo encuentro tu sesión de 7TV. Inicia sesión en 7tv.app o pega el token en el apartado Token.", "st7-err");
        return;
      }
      if (!confirm(`Se van a quitar ${plan.quitar.length} y añadir ${plan.anadir.length} emotes en el set de temporada. ¿Seguir?`)) return;

      $("st7-apl").disabled = true;
      $("st7-prev").disabled = true;
      linea("\nAplicando…", "st7-gris");
      let fallos = 0;
      for (const [n, eid] of plan.quitar) {
        try { await cambiar(token, destinoId, "REMOVE", eid); linea("  - " + n, "st7-err"); }
        catch (e) { fallos++; linea(`  ERROR quitando ${n}: ${e.message}`, "st7-av"); }
      }
      for (const [n, eid] of plan.anadir) {
        try { await cambiar(token, destinoId, "ADD", eid, n); linea("  + " + n, "st7-ok"); }
        catch (e) { fallos++; linea(`  ERROR añadiendo ${n}: ${e.message}`, "st7-av"); }
      }
      linea(fallos ? `\nHecho, con ${fallos} errores.` : "\nHecho, sin errores. Recarga la página para verlo.", fallos ? "st7-av" : "st7-ok");
      plan = null;
      $("st7-prev").disabled = false;
    });
  }

  if (document.body) montar();
  else window.addEventListener("DOMContentLoaded", montar);
})();
