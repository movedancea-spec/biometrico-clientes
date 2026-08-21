// =====================================================================
// BIOMÉTRICO — Panel de la Academia cliente
// =====================================================================
// IMPORTANTE: cambia esta URL por la de TU Worker una vez publicado en
// Cloudflare — debe ser la MISMA URL que pusiste en dueno.js. Sin "/"
// al final.
const API_URL = "https://biometrico-saas.movedancea.workers.dev";

const el = (id) => document.getElementById(id);

let sesion = null; // { academiaId, clave, nombre, limiteAlumnas }
let alumnaEditandoId = null;
let fotoNuevaBase64 = null; // usada tanto para crear como para editar (se limpia entre usos)

function urlFoto(fotoKey) {
  return fotoKey ? `${API_URL}/foto?key=${encodeURIComponent(fotoKey)}` : "";
}

async function llamar(accion, datos) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion, academiaId: sesion?.academiaId, clave: sesion?.clave, ...datos }),
  });
  return await resp.json();
}

function escaparHtml(t) {
  const d = document.createElement("div");
  d.textContent = t == null ? "" : String(t);
  return d.innerHTML;
}

// Las fotos que salen directo de un celular pueden pesar varios MB —
// eso es lo que hacía que subir el logo (o una foto de alumna) se
// sintiera lentísimo, o hasta se quedara pegado. Antes de mandarla al
// servidor, se reduce aquí mismo en el navegador a un tamaño de sobra
// para cómo se usa en el sistema (nunca se muestra más grande que un
// círculo o un logo chiquito), así que baja de varios MB a unos pocos
// cientos de KB sin notarse la diferencia visualmente.
function redimensionarImagen(archivo, ladoMaximo = 480, calidadJpeg = 0.82) {
  return new Promise((resolve, reject) => {
    if (!archivo) return resolve(null);
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo abrir esa imagen. Prueba con un JPG o PNG."));
      img.onload = () => {
        let { width, height } = img;
        if (width > ladoMaximo || height > ladoMaximo) {
          if (width >= height) {
            height = Math.round(height * (ladoMaximo / width));
            width = ladoMaximo;
          } else {
            width = Math.round(width * (ladoMaximo / height));
            height = ladoMaximo;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Los logos suelen tener fondo transparente (PNG) — eso se
        // conserva. Las fotos normales (JPEG) se comprimen más, porque
        // no necesitan transparencia y así pesan bastante menos.
        const conservaTransparencia = /image\/(png|webp|gif)/.test(archivo.type);
        const dataUrl = conservaTransparencia
          ? canvas.toDataURL("image/png")
          : canvas.toDataURL("image/jpeg", calidadJpeg);
        resolve(dataUrl);
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

// ---------------------------------------------------------------
// PERSONALIZACIÓN (color + logo) — se aplica con variables CSS, así
// que un solo color elegido por la academia recolorea todo el panel
// (y, con el mismo mecanismo, biometrico.js recolorea la pantalla de
// la tablet). Ver biometrico-style.css para las variables --color-*.
// ---------------------------------------------------------------
function hexARgb(hex) {
  const limpio = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(limpio.substr(i, 2), 16));
}

function rgbAHex(rgb) {
  return "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
}

function mezclarConBlanco(hex, porcentaje) {
  return rgbAHex(hexARgb(hex).map((c) => c + (255 - c) * porcentaje));
}

function oscurecer(hex, porcentaje) {
  return rgbAHex(hexARgb(hex).map((c) => c * (1 - porcentaje)));
}

function aplicarMarca(colorMarca) {
  const raiz = document.documentElement.style;

  // Siempre se limpia primero: si este navegador ya había aplicado el
  // color de OTRA academia (por ejemplo, alguien salió e inició sesión
  // con una cuenta distinta), no debe quedarse pegado.
  ["--color-marca", "--color-marca-oscuro", "--color-marca-suave", "--color-marca-suave2",
    "--color-marca-suave3", "--color-marca-fondo", "--color-marca-fondo2", "--color-marca-fondo3",
    "--color-marca-texto-suave", "--color-marca-texto-suave2"].forEach((v) => raiz.removeProperty(v));

  if (!colorMarca || !/^#[0-9a-fA-F]{6}$/.test(colorMarca)) return;

  raiz.setProperty("--color-marca", colorMarca);
  raiz.setProperty("--color-marca-oscuro", oscurecer(colorMarca, 0.15));
  raiz.setProperty("--color-marca-suave", mezclarConBlanco(colorMarca, 0.88));
  raiz.setProperty("--color-marca-suave2", mezclarConBlanco(colorMarca, 0.82));
  raiz.setProperty("--color-marca-suave3", mezclarConBlanco(colorMarca, 0.75));
  raiz.setProperty("--color-marca-fondo", mezclarConBlanco(colorMarca, 0.96));
  raiz.setProperty("--color-marca-fondo2", mezclarConBlanco(colorMarca, 0.94));
  raiz.setProperty("--color-marca-fondo3", mezclarConBlanco(colorMarca, 0.92));
  raiz.setProperty("--color-marca-texto-suave", oscurecer(colorMarca, 0.25));
  raiz.setProperty("--color-marca-texto-suave2", oscurecer(colorMarca, 0.1));
}

function aplicarLogoEnHeader(logoKey) {
  const img = el("logoAcademia");
  if (logoKey) {
    img.src = urlFoto(logoKey);
    img.hidden = false;
  } else {
    img.hidden = true;
  }
}

// ---------------------------------------------------------------
// LOGIN / SESIÓN
// ---------------------------------------------------------------
function guardarSesion(s) {
  sesion = s;
  localStorage.setItem("biometrico_sesion_academia", JSON.stringify(s));
}

function cargarSesionGuardada() {
  try {
    const cruda = localStorage.getItem("biometrico_sesion_academia");
    if (!cruda) return null;
    return JSON.parse(cruda);
  } catch (e) {
    return null;
  }
}

function mostrarPanel() {
  el("pantallaLogin").hidden = true;
  el("pantallaPanel").hidden = false;
  el("tituloAcademia").textContent = `📋 ${sesion.nombre}`;
  aplicarMarca(sesion.colorMarca);
  aplicarLogoEnHeader(sesion.logoKey);
  el("inputColorMarca").value = sesion.colorMarca || "#ef4b9b";
  cargarAlumnas();
}

function volverALogin(mensaje) {
  sesion = null;
  localStorage.removeItem("biometrico_sesion_academia");
  el("pantallaPanel").hidden = true;
  el("pantallaLogin").hidden = false;
  aplicarMarca(null);
  aplicarLogoEnHeader(null);
  if (mensaje) el("mensajeErrorLogin").textContent = mensaje;
}

async function intentarEntrar() {
  const nombre = el("inputNombreAcademia").value.trim();
  const clave = el("inputClaveAcademia").value.trim();
  if (!nombre || !clave) return;
  el("mensajeErrorLogin").textContent = "";
  el("btnEntrarAcademia").disabled = true;
  el("btnEntrarAcademia").textContent = "Entrando...";

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "academiaLogin", nombre, clave }),
    });
    const r = await resp.json();
    if (!r.success) {
      el("mensajeErrorLogin").textContent = r.error || "No se pudo entrar.";
      return;
    }
    guardarSesion({
      academiaId: r.academiaId,
      clave,
      nombre: r.nombre,
      limiteAlumnas: r.limiteAlumnas,
      colorMarca: r.colorMarca || null,
      logoKey: r.logoKey || null,
    });
    mostrarPanel();
  } catch (e) {
    el("mensajeErrorLogin").textContent = "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.";
  } finally {
    el("btnEntrarAcademia").disabled = false;
    el("btnEntrarAcademia").textContent = "Entrar →";
  }
}

el("btnEntrarAcademia").addEventListener("click", intentarEntrar);
el("inputClaveAcademia").addEventListener("keydown", (e) => { if (e.key === "Enter") intentarEntrar(); });

el("btnSalirAcademia").addEventListener("click", () => volverALogin());

// ---------------------------------------------------------------
// LISTAR / PINTAR ALUMNAS
// ---------------------------------------------------------------
async function cargarAlumnas() {
  try {
    const r = await llamar("academiaListarAlumnas", {});
    if (!r.success) { volverALogin(r.error || "Tu sesión ya no es válida, vuelve a entrar."); return; }
    sesion.limiteAlumnas = r.limiteAlumnas;
    pintarAlumnas(r.alumnas, r.cantidadAlumnas, r.limiteAlumnas);
  } catch (e) {
    el("listaAlumnas").innerHTML = '<p class="lista-vacia">No se pudo cargar la lista. Revisa tu conexión.</p>';
  }
}

function pintarAlumnas(alumnas, cantidad, limite) {
  el("infoLimiteAlumnas").textContent = `${cantidad} / ${limite} alumnas`;
  el("ayudaCantidadAlumnas").textContent =
    cantidad >= limite
      ? `Llegaste al límite de tu plan (${limite}). Para agregar más, hay que ampliar el plan con el administrador del sistema.`
      : `Tienes ${cantidad} de ${limite} alumnas de tu plan actual.`;

  el("btnCrearAlumna").disabled = cantidad >= limite;

  const cont = el("listaAlumnas");
  if (!alumnas.length) {
    cont.innerHTML = '<p class="lista-vacia">Todavía no has agregado ninguna alumna.</p>';
    return;
  }

  cont.innerHTML = "";
  alumnas.forEach((a) => {
    const div = document.createElement("div");
    div.className = "tarjeta-item";
    const foto = a.foto_key
      ? `<img class="foto-miniatura" src="${urlFoto(a.foto_key)}" alt="" />`
      : `<div class="foto-miniatura vacia">🧑</div>`;
    div.innerHTML = `
      ${foto}
      <div class="info-principal">
        <div class="nombre-item">#${a.codigo} — ${escaparHtml(a.nombre)}</div>
        <div class="detalle-item">
          <span class="etiqueta-estado ${a.estado === "Activa" ? "activa" : "inactiva"}">${a.estado}</span>
          &nbsp;·&nbsp; ${a.clasesEsteMes} / ${a.clases_por_mes} clases este mes
        </div>
      </div>
      <div class="acciones-item">
        <button class="btn secundario chico" data-accion="editar">Editar</button>
      </div>
    `;
    div.querySelector('[data-accion="editar"]').addEventListener("click", () => abrirModalEditar(a));
    cont.appendChild(div);
  });
}

// ---------------------------------------------------------------
// CREAR ALUMNA
// ---------------------------------------------------------------
el("btnCrearAlumna").addEventListener("click", async () => {
  const nombre = el("inputNuevaAlumnaNombre").value.trim();
  const clasesPorMes = Number(el("inputNuevaAlumnaClases").value) || 8;
  const archivo = el("inputNuevaAlumnaFoto").files[0] || null;

  el("mensajeErrorCrear").textContent = "";
  el("mensajeExitoCrear").textContent = "";

  if (!nombre) { el("mensajeErrorCrear").textContent = "Escribe el nombre de la alumna."; return; }

  el("btnCrearAlumna").disabled = true;
  try {
    const fotoBase64 = await redimensionarImagen(archivo);
    const r = await llamar("academiaCrearAlumna", { nombre, clasesPorMes, fotoBase64 });
    if (!r.success) {
      el("mensajeErrorCrear").textContent = r.error || "No se pudo agregar.";
      return;
    }
    el("mensajeExitoCrear").textContent = `"${nombre}" agregada con el código #${r.codigo}.`;
    el("inputNuevaAlumnaNombre").value = "";
    el("inputNuevaAlumnaClases").value = "8";
    el("inputNuevaAlumnaFoto").value = "";
    cargarAlumnas();
  } catch (e) {
    el("mensajeErrorCrear").textContent = e.message || "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnCrearAlumna").disabled = false;
  }
});

// ---------------------------------------------------------------
// EDITAR / BORRAR ALUMNA (modal)
// ---------------------------------------------------------------
function abrirModalEditar(alumna) {
  alumnaEditandoId = alumna.id;
  el("inputEditarNombre").value = alumna.nombre;
  el("inputEditarClases").value = alumna.clases_por_mes;
  el("selectEditarEstado").value = alumna.estado;
  el("inputEditarFoto").value = "";
  el("mensajeErrorEditar").textContent = "";

  const preview = el("fotoPreviewModal");
  if (alumna.foto_key) {
    preview.src = urlFoto(alumna.foto_key);
    preview.hidden = false;
  } else {
    preview.hidden = true;
  }

  el("modalAlumna").hidden = false;
}

el("btnCancelarEditar").addEventListener("click", () => { el("modalAlumna").hidden = true; });

el("btnGuardarEditar").addEventListener("click", async () => {
  const nombre = el("inputEditarNombre").value.trim();
  const clasesPorMes = Number(el("inputEditarClases").value) || 8;
  const estado = el("selectEditarEstado").value;
  const archivo = el("inputEditarFoto").files[0] || null;

  if (!nombre) { el("mensajeErrorEditar").textContent = "El nombre no puede quedar vacío."; return; }

  el("btnGuardarEditar").disabled = true;
  try {
    const fotoBase64 = await redimensionarImagen(archivo);
    const r = await llamar("academiaEditarAlumna", {
      alumnaId: alumnaEditandoId,
      nombre,
      clasesPorMes,
      estado,
      ...(fotoBase64 ? { fotoBase64 } : {}),
    });
    if (!r.success) { el("mensajeErrorEditar").textContent = r.error || "No se pudo guardar."; return; }
    el("modalAlumna").hidden = true;
    cargarAlumnas();
  } catch (e) {
    el("mensajeErrorEditar").textContent = e.message || "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnGuardarEditar").disabled = false;
  }
});

el("btnBorrarAlumna").addEventListener("click", async () => {
  const nombre = el("inputEditarNombre").value.trim();
  if (!window.confirm(`¿Borrar a "${nombre}"? Su código nunca se volverá a usar, pero se conserva su historial de asistencia.`)) return;

  try {
    const r = await llamar("academiaBorrarAlumna", { alumnaId: alumnaEditandoId });
    if (!r.success) { el("mensajeErrorEditar").textContent = r.error || "No se pudo borrar."; return; }
    el("modalAlumna").hidden = true;
    cargarAlumnas();
  } catch (e) {
    el("mensajeErrorEditar").textContent = "No se pudo conectar. Inténtalo de nuevo.";
  }
});

// NOTA: marcar asistencia (la pantalla de "meter el código") ya NO vive
// aquí — vive aparte, en biometrico.html/biometrico.js, pensada para
// quedarse abierta en una tablet en la entrada. Esta página
// (academia.html) es solo para administrar alumnas.

// ---------------------------------------------------------------
// GUARDAR PERSONALIZACIÓN (color + logo)
// ---------------------------------------------------------------

// Vista previa en vivo del color mientras lo eligen, antes de guardar.
el("inputColorMarca").addEventListener("input", () => {
  aplicarMarca(el("inputColorMarca").value);
});

el("inputLogoMarca").addEventListener("change", async () => {
  const archivo = el("inputLogoMarca").files[0] || null;
  const preview = el("logoPreviewPersonalizar");
  if (!archivo) { preview.hidden = true; return; }
  el("mensajeErrorMarca").textContent = "";
  try {
    const dataUrl = await redimensionarImagen(archivo);
    preview.src = dataUrl;
    preview.hidden = false;
  } catch (e) {
    preview.hidden = true;
    el("mensajeErrorMarca").textContent = e.message || "No se pudo abrir esa imagen.";
  }
});

el("btnGuardarMarca").addEventListener("click", async () => {
  const color = el("inputColorMarca").value;
  const archivo = el("inputLogoMarca").files[0] || null;

  el("mensajeErrorMarca").textContent = "";
  el("mensajeExitoMarca").textContent = "";
  el("btnGuardarMarca").disabled = true;

  try {
    const logoBase64 = await redimensionarImagen(archivo);
    const r = await llamar("academiaActualizarMarca", {
      colorMarca: color,
      ...(logoBase64 ? { logoBase64 } : {}),
    });
    if (!r.success) { el("mensajeErrorMarca").textContent = r.error || "No se pudo guardar."; return; }

    // Vuelve a pedir los datos de sesión para tener la key real del
    // logo que asignó el servidor (así queda bien guardada y se ve
    // igual la próxima vez que entren, sin tener que adivinarla aquí).
    try {
      const resp = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "academiaLogin", nombre: sesion.nombre, clave: sesion.clave }),
      });
      const refresco = await resp.json();
      if (refresco.success) {
        sesion.colorMarca = refresco.colorMarca || null;
        sesion.logoKey = refresco.logoKey || null;
        aplicarLogoEnHeader(sesion.logoKey);
      }
    } catch (e) {
      // Si esto falla no pasa nada grave — el color ya se aplicó en
      // pantalla, y el logo se refresca solo la próxima vez que entren.
    }
    guardarSesion(sesion);
    el("mensajeExitoMarca").textContent = "¡Personalización guardada!";
    el("inputLogoMarca").value = "";
    el("logoPreviewPersonalizar").hidden = true;
  } catch (e) {
    el("mensajeErrorMarca").textContent = e.message || "No se pudo conectar. Inténtalo de nuevo.";
  } finally {
    el("btnGuardarMarca").disabled = false;
  }
});

// ---------------------------------------------------------------
// INICIO — si ya había sesión guardada, entra directo
// ---------------------------------------------------------------
const sesionGuardada = cargarSesionGuardada();
if (sesionGuardada) {
  sesion = sesionGuardada;
  mostrarPanel();
}
