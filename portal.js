// =====================================================================
// BIOMÉTRICO — Portal de Alumnos (papás)
// =====================================================================
// IMPORTANTE: cambia esta URL por la de TU Worker una vez publicado en
// Cloudflare — debe ser la MISMA URL que pusiste en academia.js y
// dueno.js. Sin "/" al final.
const API_URL = "https://biometrico-saas.movedancea.workers.dev";

// Se actualiza solo, en automático, cada vez que se sube una versión
// nueva de los archivos — ver verificarActualizacion() al final de
// este archivo. NO cambiar este valor a mano: lo actualiza el script
// actualizar-versiones.mjs cada vez que algo cambia.
const VERSION_APP = "59e75fabac0c";

const el = (id) => document.getElementById(id);

// Cada alumno agregado en ESTE dispositivo se guarda aquí (localStorage),
// igual de simple que el resto del sistema: se manda la clave en cada
// llamada y el servidor la revisa cada vez (no hay "sesión" del lado
// del servidor). Así, un mismo teléfono puede tener varios hijos
// agregadas a la vez.
let alumnasGuardadas = [];   // [{alumnaId, clave, nombre, codigo, fotoKey, clasesPorMes, academiaId, academiaNombre, colorMarca, logoKey}]
let alumnaActivaId = null;   // cuál de las de arriba se está viendo ahora
let alumnasParaElegir = [];  // resultado temporal de "buscar academia", antes de iniciar sesión

async function llamar(accion, datos) {
  const activa = alumnaActivaId ? alumnasGuardadas.find((a) => a.alumnaId === alumnaActivaId) : null;
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion, alumnaId: activa?.alumnaId, clave: activa?.clave, ...datos }),
  });
  return await resp.json();
}

function escaparHtml(t) {
  const d = document.createElement("div");
  d.textContent = t == null ? "" : String(t);
  return d.innerHTML;
}

function urlFoto(fotoKey) {
  return fotoKey ? `${API_URL}/foto?key=${encodeURIComponent(fotoKey)}` : "";
}

function formatearFechaHora(fechaSql) {
  try {
    const fecha = new Date(String(fechaSql).replace(" ", "T") + "Z");
    return fecha.toLocaleString("es-GT", {
      timeZone: "America/Guatemala",
      day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch (e) {
    return fechaSql;
  }
}

const NOMBRES_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function formatearMes(mesTexto) {
  const [anio, mes] = String(mesTexto).split("-").map(Number);
  return `${NOMBRES_MES[mes - 1] || mesTexto} ${anio}`;
}

// El "mes en curso" de los 2 historiales de abajo (asistencias y
// entradas) siempre se calcula con la hora de Guatemala (UTC-6), igual
// que el corte de mes del lado del servidor — así lo que el papá ve
// como "este mes" siempre coincide con lo que cuenta worker.js, sin
// importar en qué zona horaria esté el teléfono/computadora.
function mesGuatemalaActualCliente() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  const anio = partes.find((p) => p.type === "year").value;
  const mes = partes.find((p) => p.type === "month").value;
  return `${anio}-${mes}`;
}
function mesGuatemalaDeFecha(fechaSql) {
  const fecha = new Date(String(fechaSql).replace(" ", "T") + "Z");
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala", year: "numeric", month: "2-digit",
  }).formatToParts(fecha);
  const anio = partes.find((p) => p.type === "year").value;
  const mes = partes.find((p) => p.type === "month").value;
  return `${anio}-${mes}`;
}

// ---------------------------------------------------------------
// Colores de marca — igual que en academia.js/biometrico.js, así el
// portal se ve "vestido" con el color y el logo de CADA academia.
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
// El icono que queda en la pantalla de inicio del celular cuando
// "instalan" el portal (Agregar a pantalla de inicio) — por defecto
// el navegador pone una "P" gris genérica (de "Portal"). Esto lo
// cambia por un cuadrito del color de marca de la academia, para que
// se vea igual de personalizado que el resto del portal. El dibujo
// en sí lo genera el Worker (ver /icono-color.png en worker.js) —
// aquí solo se apunta el <link> a esa URL con el color que toque.
function aplicarIconoInstalacion(colorMarca) {
  const esValido = colorMarca && /^#[0-9a-fA-F]{6}$/.test(colorMarca);
  const color = esValido ? colorMarca.replace("#", "") : "ef4b9b"; // rosado por defecto, igual que el resto del portal
  // "&v=VERSION_APP" es lo que hace que el navegador SÍ vuelva a pedir
  // el ícono cuando de verdad cambia (por ejemplo, cuando le agregamos
  // la letra "P" encima del color): como este archivo se cachea 30
  // días para que cargue rápido, sin este número de versión en la URL
  // el navegador se hubiera quedado usando para siempre la primera
  // imagen que pidió, aunque el dibujo del ícono cambiara después.
  const urlIcono = `${API_URL}/icono-color.png?color=${color}&v=${VERSION_APP}`;

  let iconoApple = document.querySelector('link[rel="apple-touch-icon"]');
  if (!iconoApple) {
    iconoApple = document.createElement("link");
    iconoApple.rel = "apple-touch-icon";
    document.head.appendChild(iconoApple);
  }
  iconoApple.href = urlIcono;

  let iconoNormal = document.querySelector('link[rel="icon"]');
  if (!iconoNormal) {
    iconoNormal = document.createElement("link");
    iconoNormal.rel = "icon";
    document.head.appendChild(iconoNormal);
  }
  iconoNormal.href = urlIcono;

  let temaColor = document.querySelector('meta[name="theme-color"]');
  if (!temaColor) {
    temaColor = document.createElement("meta");
    temaColor.name = "theme-color";
    document.head.appendChild(temaColor);
  }
  temaColor.content = esValido ? colorMarca : "#ef4b9b";
}

function aplicarMarca(colorMarca) {
  const raiz = document.documentElement.style;
  ["--color-marca", "--color-marca-oscuro", "--color-marca-suave", "--color-marca-suave2",
    "--color-marca-suave3", "--color-marca-fondo", "--color-marca-fondo2", "--color-marca-fondo3",
    "--color-marca-texto-suave", "--color-marca-texto-suave2"].forEach((v) => raiz.removeProperty(v));

  aplicarIconoInstalacion(colorMarca);

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
}
function aplicarLogoEnHeader(logoKey) {
  const img = el("logoPortalAcademia");
  if (logoKey) { img.src = urlFoto(logoKey); img.hidden = false; }
  else { img.hidden = true; }
}

// ---------------------------------------------------------------
// Guardar / cargar los alumnos de este dispositivo
// ---------------------------------------------------------------
function guardarAlumnasEnDisco() {
  localStorage.setItem("biometrico_portal_alumnas", JSON.stringify(alumnasGuardadas));
  localStorage.setItem("biometrico_portal_alumna_activa", alumnaActivaId || "");
}
function cargarAlumnasDeDisco() {
  try {
    alumnasGuardadas = JSON.parse(localStorage.getItem("biometrico_portal_alumnas") || "[]");
  } catch (e) {
    alumnasGuardadas = [];
  }
  alumnaActivaId = localStorage.getItem("biometrico_portal_alumna_activa") || null;
  if (!alumnasGuardadas.some((a) => a.alumnaId === alumnaActivaId)) {
    alumnaActivaId = alumnasGuardadas[0]?.alumnaId || null;
  }
}
function alumnasConNotificacionesActivas() {
  try {
    return new Set(JSON.parse(localStorage.getItem("biometrico_portal_push_activas") || "[]"));
  } catch (e) {
    return new Set();
  }
}
function guardarAlumnasConNotificacionesActivas(set) {
  localStorage.setItem("biometrico_portal_push_activas", JSON.stringify([...set]));
}

// ---------------------------------------------------------------
// PASO 1: buscar academia
// ---------------------------------------------------------------
// Cuando el link trae "?academia=ID" (el que cada academia comparte
// con sus papás desde su panel), se salta esta pantalla por completo
// y se va directo al paso 2 ya con los datos de ESA academia — así
// nadie tiene que escribir ni adivinar un nombre, y de paso no queda
// a la vista un buscador con el que cualquiera podría fisgonear si
// otra academia también usa este sistema.
let llegoPorLinkDirecto = false;

function mostrarPantallaBuscarAcademia() {
  el("pantallaBuscarAcademia").hidden = false;
  el("pantallaElegirAlumna").hidden = true;
  el("pantallaOlvidePortal").hidden = true;
  el("pantallaRestablecerPortal").hidden = true;
  el("pantallaPortalPanel").hidden = true;
  el("inputPortalAcademia").value = "";
  el("mensajeErrorBuscarAcademia").textContent = "";
}

function mostrarPaso2ConAlumnas(academiaId, academiaNombre, alumnas, colorMarca, logoKey) {
  alumnasParaElegir = { academiaId, academiaNombre, alumnas };

  // Se aplica de una vez el color de ESTA academia (en vez de dejar el
  // rosado por defecto hasta que entren con su clave) — así la
  // pantalla de "elige a tu hijo" ya sale vestida igual que el resto
  // del portal de esa academia.
  aplicarMarca(colorMarca || null);
  aplicarLogoEnHeader(logoKey || null);

  const select = el("selectAlumnaPortal");
  select.innerHTML = alumnas.map((a) => `<option value="${a.id}">${escaparHtml(a.nombre)}</option>`).join("");
  el("subtituloElegirAlumna").textContent = `Elige el nombre de tu hijo en ${academiaNombre} y escribe su contraseña del portal.`;
  el("inputPortalClave").value = "";
  el("mensajeErrorEntrarPortal").textContent = "";

  el("pantallaBuscarAcademia").hidden = true;
  el("pantallaOlvidePortal").hidden = true;
  el("pantallaRestablecerPortal").hidden = true;
  el("pantallaPortalPanel").hidden = true;
  el("pantallaElegirAlumna").hidden = false;

  // Si llegaron por el link directo de su academia, no tiene caso
  // ofrecerles "cambiar de academia" — ese botón solo aplica para
  // quien entró buscando el nombre a mano.
  el("btnVolverBuscarAcademia").hidden = llegoPorLinkDirecto;
}

async function cargarAlumnasPorAcademiaId(academiaId) {
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "portalListarAlumnas", academiaId }),
    }).then((resp) => resp.json());

    if (!r.success || !r.alumnas.length) {
      // El link ya no sirve (academia borrada/desactivada, o todavía
      // sin alumnos) — se cae de vuelta a la pantalla de buscar, con
      // el aviso correspondiente, en vez de dejar al papá atorado.
      llegoPorLinkDirecto = false;
      mostrarPantallaBuscarAcademia();
      el("mensajeErrorBuscarAcademia").textContent = !r.success
        ? (r.error || "No se pudo abrir el portal de esa academia.")
        : "Esa academia todavía no tiene alumnos registrados.";
      return;
    }

    mostrarPaso2ConAlumnas(r.academiaId, r.academiaNombre, r.alumnas, r.colorMarca, r.logoKey);
  } catch (e) {
    llegoPorLinkDirecto = false;
    mostrarPantallaBuscarAcademia();
    el("mensajeErrorBuscarAcademia").textContent = "No se pudo conectar. Revisa tu conexión.";
  }
}

el("btnBuscarAcademia").addEventListener("click", async () => {
  const nombreAcademia = el("inputPortalAcademia").value.trim();
  el("mensajeErrorBuscarAcademia").textContent = "";
  if (!nombreAcademia) { el("mensajeErrorBuscarAcademia").textContent = "Escribe el nombre de la academia."; return; }

  el("btnBuscarAcademia").disabled = true;
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "portalListarAlumnas", academiaNombre: nombreAcademia }),
    }).then((resp) => resp.json());

    if (!r.success) { el("mensajeErrorBuscarAcademia").textContent = r.error || "No se pudo continuar."; return; }
    if (!r.alumnas.length) { el("mensajeErrorBuscarAcademia").textContent = "Esa academia todavía no tiene alumnos registrados."; return; }

    llegoPorLinkDirecto = false;
    mostrarPaso2ConAlumnas(r.academiaId, r.academiaNombre || nombreAcademia, r.alumnas, r.colorMarca, r.logoKey);
  } catch (e) {
    el("mensajeErrorBuscarAcademia").textContent = "No se pudo conectar. Revisa tu conexión.";
  } finally {
    el("btnBuscarAcademia").disabled = false;
  }
});

el("btnVolverBuscarAcademia").addEventListener("click", () => {
  llegoPorLinkDirecto = false;
  mostrarPantallaBuscarAcademia();
});

// ---------------------------------------------------------------
// PASO 2: elegir alumno + contraseña → entrar
// ---------------------------------------------------------------
el("btnEntrarPortal").addEventListener("click", async () => {
  const alumnaId = Number(el("selectAlumnaPortal").value);
  const clave = el("inputPortalClave").value.trim();
  el("mensajeErrorEntrarPortal").textContent = "";
  if (!clave) { el("mensajeErrorEntrarPortal").textContent = "Escribe la contraseña."; return; }

  el("btnEntrarPortal").disabled = true;
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "portalLogin", alumnaId, clave }),
    }).then((resp) => resp.json());

    if (!r.success) {
      el("mensajeErrorEntrarPortal").textContent = r.error || "No se pudo entrar.";
      return;
    }

    const entrada = {
      alumnaId: r.alumnaId, clave, nombre: r.nombre, codigo: r.codigo, fotoKey: r.fotoKey,
      clasesPorMes: r.clasesPorMes, academiaId: r.academiaId, academiaNombre: r.academiaNombre,
      colorMarca: r.colorMarca, logoKey: r.logoKey,
      tipoCliente: r.tipoCliente || "academia",
    };
    alumnasGuardadas = alumnasGuardadas.filter((a) => a.alumnaId !== entrada.alumnaId);
    alumnasGuardadas.push(entrada);
    alumnaActivaId = entrada.alumnaId;
    guardarAlumnasEnDisco();
    ajustarInterfazPortalSegunTipo();

    mostrarPanel();
  } catch (e) {
    el("mensajeErrorEntrarPortal").textContent = "No se pudo conectar. Revisa tu conexión.";
  } finally {
    el("btnEntrarPortal").disabled = false;
  }
});

el("btnAgregarOtraAlumna").addEventListener("click", () => {
  // Casi siempre es para agregar a un hermano de la MISMA academia
  // que ya está usando este dispositivo — así que, en vez de mandar
  // al papá a escribir el nombre de la academia otra vez (como si no
  // supiéramos ya cuál es), se va directo a la lista de alumnos de
  // esa academia para que elija y ponga la contraseña. Si de verdad
  // es de otra academia, en esa misma pantalla sigue disponible
  // "← Cambiar de academia" para buscarla a mano.
  llegoPorLinkDirecto = false;
  const activa = alumnaActivaId ? alumnasGuardadas.find((a) => a.alumnaId === alumnaActivaId) : null;
  const referencia = activa || alumnasGuardadas[0];
  if (referencia && referencia.academiaId) {
    el("pantallaBuscarAcademia").hidden = true;
    el("pantallaPortalPanel").hidden = true;
    cargarAlumnasPorAcademiaId(referencia.academiaId);
  } else {
    // Caso raro: no hay ninguna academiaId guardada todavía (por
    // ejemplo, alumnos agregados antes de que existiera este dato) —
    // se cae de vuelta al buscador, como antes.
    mostrarPantallaBuscarAcademia();
  }
});

// ---------------------------------------------------------------
// "Olvidé mi contraseña" del portal
// ---------------------------------------------------------------
let alumnaIdParaOlvide = null;

el("btnMostrarOlvidePortal").addEventListener("click", () => {
  alumnaIdParaOlvide = Number(el("selectAlumnaPortal").value);
  el("pantallaElegirAlumna").hidden = true;
  el("pantallaOlvidePortal").hidden = false;
  el("inputOlvidePortalEmail").value = "";
  el("mensajeErrorOlvidePortal").textContent = "";
  el("mensajeExitoOlvidePortal").textContent = "";
});

el("btnCancelarOlvidePortal").addEventListener("click", () => {
  el("pantallaOlvidePortal").hidden = true;
  el("pantallaElegirAlumna").hidden = false;
});

el("btnEnviarOlvidePortal").addEventListener("click", async () => {
  const email = el("inputOlvidePortalEmail").value.trim();
  el("mensajeErrorOlvidePortal").textContent = "";
  el("mensajeExitoOlvidePortal").textContent = "";
  if (!email) { el("mensajeErrorOlvidePortal").textContent = "Escribe tu correo."; return; }

  el("btnEnviarOlvidePortal").disabled = true;
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "portalSolicitarRecuperacion",
        alumnaId: alumnaIdParaOlvide,
        email,
        origenPortal: location.origin + location.pathname,
      }),
    }).then((resp) => resp.json());

    if (!r.success) { el("mensajeErrorOlvidePortal").textContent = r.error || "No se pudo enviar."; return; }
    el("mensajeExitoOlvidePortal").textContent = r.mensaje;
  } catch (e) {
    el("mensajeErrorOlvidePortal").textContent = "No se pudo conectar. Revisa tu conexión.";
  } finally {
    el("btnEnviarOlvidePortal").disabled = false;
  }
});

el("btnRestablecerPortalClave").addEventListener("click", async () => {
  const params = new URLSearchParams(location.search);
  const token = params.get("recuperar");
  const claveNueva = el("inputRestablecerPortalClave").value.trim();
  const claveConfirmar = el("inputRestablecerPortalClaveConfirmar").value.trim();

  el("mensajeErrorRestablecerPortal").textContent = "";
  el("mensajeExitoRestablecerPortal").textContent = "";

  if (claveNueva.length < 4) { el("mensajeErrorRestablecerPortal").textContent = "La contraseña debe tener al menos 4 caracteres."; return; }
  if (claveNueva !== claveConfirmar) { el("mensajeErrorRestablecerPortal").textContent = "Las contraseñas no coinciden."; return; }

  el("btnRestablecerPortalClave").disabled = true;
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "portalRestablecerClave", token, claveNueva }),
    }).then((resp) => resp.json());

    if (!r.success) { el("mensajeErrorRestablecerPortal").textContent = r.error || "No se pudo actualizar."; return; }
    el("mensajeExitoRestablecerPortal").textContent = "¡Listo! Ya puedes iniciar sesión con tu contraseña nueva.";
    history.replaceState(null, "", location.pathname);
    setTimeout(() => {
      el("pantallaRestablecerPortal").hidden = true;
      mostrarPantallaBuscarAcademia();
    }, 1800);
  } catch (e) {
    el("mensajeErrorRestablecerPortal").textContent = "No se pudo conectar. Revisa tu conexión.";
  } finally {
    el("btnRestablecerPortalClave").disabled = false;
  }
});

// ---------------------------------------------------------------
// PANEL PRINCIPAL
// ---------------------------------------------------------------
function pintarSelectorAlumnas() {
  const cont = el("selectorAlumnasPortal");
  if (alumnasGuardadas.length <= 1) { cont.innerHTML = ""; return; }
  cont.innerHTML = alumnasGuardadas.map((a) => `
    <button type="button" class="chip-alumna ${a.alumnaId === alumnaActivaId ? "activo" : ""}" data-id="${a.alumnaId}">${escaparHtml(a.nombre)}</button>
  `).join("");
  cont.querySelectorAll(".chip-alumna").forEach((btn) => {
    btn.addEventListener("click", () => seleccionarAlumna(Number(btn.dataset.id)));
  });
}

async function mostrarPanel() {
  el("pantallaBuscarAcademia").hidden = true;
  el("pantallaElegirAlumna").hidden = true;
  el("pantallaOlvidePortal").hidden = true;
  el("pantallaRestablecerPortal").hidden = true;
  el("pantallaPortalPanel").hidden = false;
  await seleccionarAlumna(alumnaActivaId);
}

async function seleccionarAlumna(alumnaId) {
  const entrada = alumnasGuardadas.find((a) => a.alumnaId === alumnaId);
  if (!entrada) { mostrarPantallaBuscarAcademia(); return; }

  alumnaActivaId = alumnaId;
  guardarAlumnasEnDisco();
  pintarSelectorAlumnas();

  aplicarMarca(entrada.colorMarca);
  aplicarLogoEnHeader(entrada.logoKey);
  el("tituloPortalAcademia").textContent = `👨‍👩‍👧 ${entrada.academiaNombre}`;
  el("nombreAlumnaPortal").textContent = entrada.nombre;
  el("codigoAlumnaPortal").textContent = `#${entrada.codigo}`;
  pintarFotoAlumna(entrada.fotoKey);
  el("statClasesEsteMes").textContent = "—";
  el("inputEmailFamiliaPortal").value = "";
  el("mensajeErrorPush").textContent = "";

  actualizarBotonPush();

  try {
    const r = await llamar("portalConsultarAlumna", {});
    if (!r.success) {
      // La sesión guardada para este alumno ya no sirve (le cambiaron
      // la clave desde otro lado, etc.) — se quita sola de este
      // dispositivo para no dejarla "pegada" sin funcionar.
      quitarAlumnaDelDispositivo(alumnaId, false);
      return;
    }
    entrada.nombre = r.nombre; entrada.codigo = r.codigo; entrada.fotoKey = r.fotoKey;
    entrada.clasesPorMes = r.clasesPorMes; entrada.colorMarca = r.academia.colorMarca; entrada.logoKey = r.academia.logoKey;
    entrada.academiaNombre = r.academia.nombre;
    entrada.tipoCliente = r.academia.tipoCliente || "academia";
    guardarAlumnasEnDisco();
    ajustarInterfazPortalSegunTipo();

    aplicarMarca(entrada.colorMarca);
    aplicarLogoEnHeader(entrada.logoKey);
    el("tituloPortalAcademia").textContent = `👨‍👩‍👧 ${entrada.academiaNombre}`;
    el("nombreAlumnaPortal").textContent = entrada.nombre;
    el("codigoAlumnaPortal").textContent = `#${entrada.codigo}`;
    pintarFotoAlumna(entrada.fotoKey);
    el("statClasesEsteMes").textContent = `${r.clasesEsteMes} / ${r.clasesPorMes}`;
    el("inputEmailFamiliaPortal").value = r.emailFamilia || "";
  } catch (e) {
    // Sin conexión — se deja lo que ya había en caché en vez de tronar.
  }

  cargarHistorialMeses();
  cargarHistorialEntradas();
}

function ajustarInterfazPortalSegunTipo() {
  const alumna = alumnasGuardadas.find((a) => a.alumnaId === alumnaActivaId);
  const esEmpresa = alumna?.tipoCliente === "empresa";
  const bloqueClases = el("bloqueClasesEsteMes");
  if (bloqueClases) bloqueClases.hidden = esEmpresa;
  const panelHistorial = el("panelHistorialMeses");
  if (panelHistorial) panelHistorial.hidden = esEmpresa;
  const etiquetaHistorialEntradas = el("etiquetaHistorialEntradas");
  if (etiquetaHistorialEntradas) etiquetaHistorialEntradas.textContent = esEmpresa ? "" : "a la academia";
  const etiquetaQuitar = el("etiquetaQuitarAlumno");
  if (etiquetaQuitar) etiquetaQuitar.textContent = esEmpresa ? "este empleado" : "este alumno";
  const btnAgregar = el("btnAgregarOtraAlumna");
  if (btnAgregar) btnAgregar.textContent = esEmpresa ? "+ Agregar otro empleado" : "+ Agregar otro alumno";
}

function pintarFotoAlumna(fotoKey) {
  const img = el("fotoAlumnaPortal");
  const vacia = el("fotoAlumnaPortalVacia");
  if (fotoKey) { img.src = urlFoto(fotoKey); img.hidden = false; vacia.hidden = true; }
  else { img.hidden = true; vacia.hidden = false; }
}

function tarjetaMes(mesTexto, cantidad, clasesPorMes, destacada) {
  return `
    <div class="tarjeta-item${destacada ? " tarjeta-mes-actual" : ""}">
      <div class="info-principal">
        <div class="nombre-item">${escaparHtml(formatearMes(mesTexto))}${destacada ? " · mes en curso" : ""}</div>
        <div class="detalle-item">${cantidad} / ${clasesPorMes} clases</div>
      </div>
    </div>
  `;
}

// Solo se muestra el mes en curso de una vez — el resto de meses queda
// oculto detrás de un botón, para no llenar la pantalla principal con
// todo el historial. El corte de "mes en curso" es con hora de
// Guatemala (mesGuatemalaActualCliente), igual que en el servidor.
async function cargarHistorialMeses() {
  const cont = el("listaHistorialMeses");
  cont.innerHTML = '<p class="lista-vacia">Cargando...</p>';
  try {
    const r = await llamar("portalHistorialAsistenciasPorMes", {});
    if (!r.success) {
      cont.innerHTML = '<p class="lista-vacia">No se pudo cargar. Revisa tu conexión.</p>';
      return;
    }
    const mesActual = mesGuatemalaActualCliente();
    const actual = (r.historial || []).find((h) => h.mes === mesActual);
    const anteriores = (r.historial || []).filter((h) => h.mes !== mesActual);

    let html = tarjetaMes(mesActual, actual ? actual.cantidad : 0, r.clasesPorMes, true);

    if (anteriores.length) {
      html += `
        <button type="button" class="btn secundario chico" id="btnVerMesesAnteriores" style="margin-top:10px;">Ver meses anteriores ▾</button>
        <div id="listaMesesAnteriores" hidden style="margin-top:10px;">
          ${anteriores.map((h) => tarjetaMes(h.mes, h.cantidad, r.clasesPorMes, false)).join("")}
        </div>
      `;
    }

    cont.innerHTML = html;

    const btn = el("btnVerMesesAnteriores");
    if (btn) {
      btn.addEventListener("click", () => {
        const lista = el("listaMesesAnteriores");
        lista.hidden = !lista.hidden;
        btn.textContent = lista.hidden ? "Ver meses anteriores ▾" : "Ocultar meses anteriores ▴";
      });
    }
  } catch (e) {
    cont.innerHTML = '<p class="lista-vacia">No se pudo cargar. Revisa tu conexión.</p>';
  }
}

function tarjetaEntrada(entrada) {
  return `
    <div class="tarjeta-item">
      <div class="info-principal">
        <div class="nombre-item">${escaparHtml(formatearFechaHora(entrada.fecha))}</div>
        <div class="detalle-item">${entrada.metodo === "Huella" ? "👆 Huella" : "🔢 Código"}</div>
      </div>
    </div>
  `;
}

// Igual que arriba: solo las entradas del mes en curso se ven de
// entrada, el resto (agrupado por mes) queda detrás de un botón.
async function cargarHistorialEntradas() {
  const cont = el("listaHistorialEntradas");
  cont.innerHTML = '<p class="lista-vacia">Cargando...</p>';
  try {
    const r = await llamar("portalHistorialEntradas", {});
    if (!r.success) {
      cont.innerHTML = '<p class="lista-vacia">No se pudo cargar. Revisa tu conexión.</p>';
      return;
    }
    const entradas = r.entradas || [];
    const mesActual = mesGuatemalaActualCliente();
    const deEsteMes = entradas.filter((e) => mesGuatemalaDeFecha(e.fecha) === mesActual);
    const deOtrosMeses = entradas.filter((e) => mesGuatemalaDeFecha(e.fecha) !== mesActual);

    let html = deEsteMes.length
      ? deEsteMes.map(tarjetaEntrada).join("")
      : '<p class="lista-vacia">Todavía no hay ninguna entrada este mes.</p>';

    if (deOtrosMeses.length) {
      // Agrupadas por mes, con un encabezado por cada una, en el mismo
      // orden (más reciente primero) en que ya vienen del servidor.
      const porMes = new Map();
      for (const e of deOtrosMeses) {
        const mes = mesGuatemalaDeFecha(e.fecha);
        if (!porMes.has(mes)) porMes.set(mes, []);
        porMes.get(mes).push(e);
      }
      const gruposHtml = [...porMes.entries()].map(([mes, lista]) => `
        <div class="subtitulo-historial" style="margin:14px 0 6px 0; font-weight:700;">${escaparHtml(formatearMes(mes))}</div>
        ${lista.map(tarjetaEntrada).join("")}
      `).join("");

      html += `
        <button type="button" class="btn secundario chico" id="btnVerEntradasAnteriores" style="margin-top:10px;">Ver meses anteriores ▾</button>
        <div id="listaEntradasAnteriores" hidden style="margin-top:10px;">${gruposHtml}</div>
      `;
    }

    cont.innerHTML = html;

    const btn = el("btnVerEntradasAnteriores");
    if (btn) {
      btn.addEventListener("click", () => {
        const lista = el("listaEntradasAnteriores");
        lista.hidden = !lista.hidden;
        btn.textContent = lista.hidden ? "Ver meses anteriores ▾" : "Ocultar meses anteriores ▴";
      });
    }
  } catch (e) {
    cont.innerHTML = '<p class="lista-vacia">No se pudo cargar. Revisa tu conexión.</p>';
  }
}

// ---------------------------------------------------------------
// Notificaciones push
// ---------------------------------------------------------------
function base64UrlAUint8Array(base64Url) {
  // .trim() por si a la variable VAPID_PUBLIC_KEY se le coló un
  // espacio o un salto de línea al pegarla en Cloudflare — eso solo
  // (sin este trim) ya hacía que atob() tronara con "The string
  // contains invalid characters", un error que no dice nada de dónde
  // viene el problema real.
  const limpio = String(base64Url).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(limpio)) {
    throw new Error(
      "La llave pública de las notificaciones (VAPID_PUBLIC_KEY) tiene caracteres raros — revisa que esté bien copiada en el Worker de Cloudflare, sin espacios ni saltos de línea de más."
    );
  }
  const relleno = "=".repeat((4 - (limpio.length % 4)) % 4);
  const base64 = (limpio + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function actualizarBotonPush() {
  const activas = alumnasConNotificacionesActivas();
  const boton = el("btnActivarPush");
  if (activas.has(alumnaActivaId)) {
    boton.textContent = "🔕 Desactivar avisos de llegada";
    el("textoEstadoPush").textContent = "Los avisos están ACTIVADOS para este alumno en este dispositivo.";
  } else {
    boton.textContent = "🔔 Activar avisos de llegada";
    el("textoEstadoPush").textContent = "Actívalos para que te avisemos apenas marque su entrada.";
  }
}

el("btnActivarPush").addEventListener("click", async () => {
  el("mensajeErrorPush").textContent = "";
  const activas = alumnasConNotificacionesActivas();
  const boton = el("btnActivarPush");
  boton.disabled = true;

  try {
    if (activas.has(alumnaActivaId)) {
      // Apagar solo para ESTE alumno (el dispositivo puede seguir
      // suscrito para otro hermano).
      const registro = await navigator.serviceWorker.getRegistration();
      const suscripcion = registro ? await registro.pushManager.getSubscription() : null;
      if (suscripcion) {
        await llamar("portalDesuscribirPush", { endpoint: suscripcion.endpoint });
      }
      activas.delete(alumnaActivaId);
      guardarAlumnasConNotificacionesActivas(activas);
      actualizarBotonPush();
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      el("mensajeErrorPush").textContent = "Este navegador no soporta notificaciones push. En iPhone, agrega este portal a tu pantalla de inicio primero (Compartir → Agregar a pantalla de inicio) y ábrelo desde ahí.";
      return;
    }

    const registro = await navigator.serviceWorker.register("portal-sw.js");
    await navigator.serviceWorker.ready;

    let suscripcion = await registro.pushManager.getSubscription();
    if (!suscripcion) {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        el("mensajeErrorPush").textContent = "No diste permiso para las notificaciones — actívalo desde los ajustes de este navegador para poder usar esta función.";
        return;
      }
      const config = await llamar("portalConfiguracionPush", {});
      if (!config.success || !config.vapidPublicKey) {
        el("mensajeErrorPush").textContent = "Las notificaciones todavía no están activadas del lado del sistema — avísale al administrador de tu academia.";
        return;
      }
      suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlAUint8Array(config.vapidPublicKey),
      });
    }

    const r = await llamar("portalSuscribirPush", { suscripcion: suscripcion.toJSON() });
    if (!r.success) { el("mensajeErrorPush").textContent = r.error || "No se pudo activar."; return; }

    activas.add(alumnaActivaId);
    guardarAlumnasConNotificacionesActivas(activas);
    actualizarBotonPush();
  } catch (e) {
    el("mensajeErrorPush").textContent = "No se pudo activar: " + e.message;
  } finally {
    boton.disabled = false;
  }
});

// ---------------------------------------------------------------
// Mi cuenta: correo de recuperación, cambiar contraseña, quitar alumno
// ---------------------------------------------------------------
el("btnGuardarEmailFamilia").addEventListener("click", async () => {
  const email = el("inputEmailFamiliaPortal").value.trim();
  el("mensajeErrorEmailFamilia").textContent = "";
  el("mensajeExitoEmailFamilia").textContent = "";
  el("btnGuardarEmailFamilia").disabled = true;
  try {
    const r = await llamar("portalActualizarEmailFamilia", { email });
    if (!r.success) { el("mensajeErrorEmailFamilia").textContent = r.error || "No se pudo guardar."; return; }
    el("mensajeExitoEmailFamilia").textContent = "Correo guardado.";
  } catch (e) {
    el("mensajeErrorEmailFamilia").textContent = "No se pudo conectar.";
  } finally {
    el("btnGuardarEmailFamilia").disabled = false;
  }
});

el("btnCambiarClavePortal").addEventListener("click", async () => {
  const claveNueva = el("inputClaveNuevaPortal").value.trim();
  const claveConfirmar = el("inputClaveNuevaPortalConfirmar").value.trim();
  el("mensajeErrorClavePortal").textContent = "";
  el("mensajeExitoClavePortal").textContent = "";

  if (claveNueva.length < 4) { el("mensajeErrorClavePortal").textContent = "La contraseña debe tener al menos 4 caracteres."; return; }
  if (claveNueva !== claveConfirmar) { el("mensajeErrorClavePortal").textContent = "Las contraseñas no coinciden."; return; }

  el("btnCambiarClavePortal").disabled = true;
  try {
    const r = await llamar("portalCambiarClave", { claveNueva });
    if (!r.success) { el("mensajeErrorClavePortal").textContent = r.error || "No se pudo cambiar."; return; }

    const entrada = alumnasGuardadas.find((a) => a.alumnaId === alumnaActivaId);
    if (entrada) { entrada.clave = claveNueva; guardarAlumnasEnDisco(); }

    el("mensajeExitoClavePortal").textContent = "Contraseña actualizada.";
    el("inputClaveNuevaPortal").value = "";
    el("inputClaveNuevaPortalConfirmar").value = "";
  } catch (e) {
    el("mensajeErrorClavePortal").textContent = "No se pudo conectar.";
  } finally {
    el("btnCambiarClavePortal").disabled = false;
  }
});

el("btnQuitarAlumnaPortal").addEventListener("click", () => {
  const entrada = alumnasGuardadas.find((a) => a.alumnaId === alumnaActivaId);
  if (!entrada) return;
  if (!window.confirm(`¿Quitar a "${entrada.nombre}" de este dispositivo? Su historial y su cuenta NO se borran — puedes volver a agregarla cuando quieras.`)) return;
  quitarAlumnaDelDispositivo(alumnaActivaId, true);
});

async function quitarAlumnaDelDispositivo(alumnaId, avisarPush) {
  if (avisarPush) {
    const activas = alumnasConNotificacionesActivas();
    if (activas.has(alumnaId)) {
      try {
        const registro = await navigator.serviceWorker.getRegistration();
        const suscripcion = registro ? await registro.pushManager.getSubscription() : null;
        if (suscripcion) await llamar("portalDesuscribirPush", { endpoint: suscripcion.endpoint });
      } catch (e) { /* mejor esfuerzo — no bloquea quitarla igual */ }
      activas.delete(alumnaId);
      guardarAlumnasConNotificacionesActivas(activas);
    }
  }

  alumnasGuardadas = alumnasGuardadas.filter((a) => a.alumnaId !== alumnaId);
  alumnaActivaId = alumnasGuardadas[0]?.alumnaId || null;
  guardarAlumnasEnDisco();

  if (alumnasGuardadas.length) mostrarPanel();
  else mostrarPantallaBuscarAcademia();
}

// ---------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------
(function iniciar() {
  const params = new URLSearchParams(location.search);
  if (params.get("recuperar")) {
    el("pantallaBuscarAcademia").hidden = true;
    el("pantallaRestablecerPortal").hidden = false;
    return;
  }

  cargarAlumnasDeDisco();

  // "?academia=ID" es el link que cada academia comparte con sus
  // papás desde su panel — lleva directo al paso 2 (elegir alumno) de
  // ESA academia, sin buscador de por medio. Si en este dispositivo ya
  // hay un alumno guardado de esa misma academia, se ignora el link y
  // se muestra el panel normal (no tiene caso volver a pedir clave);
  // si es la primera vez (o es para agregar un segundo hijo de otra
  // academia), se va directo al paso 2.
  const academiaDelLink = Number(params.get("academia")) || null;
  const yaTieneAlumnaDeEsaAcademia = academiaDelLink
    && alumnasGuardadas.some((a) => Number(a.academiaId) === academiaDelLink);

  if (academiaDelLink && !yaTieneAlumnaDeEsaAcademia) {
    llegoPorLinkDirecto = true;
    el("pantallaBuscarAcademia").hidden = true;
    el("pantallaPortalPanel").hidden = true;
    cargarAlumnasPorAcademiaId(academiaDelLink);
  } else if (alumnasGuardadas.length) {
    mostrarPanel();
  } else {
    mostrarPantallaBuscarAcademia();
  }
})();

// ---------------------------------------------------------------
// AUTO-ACTUALIZACIÓN
// ---------------------------------------------------------------
// Antes, cuando se subía un arreglo, el papá tenía que borrar el
// portal de la pantalla de inicio de su celular y volver a agregarlo
// (o hacer varios refresh) para que le llegara — porque el teléfono
// (sobre todo iPhone, con el portal agregado a la pantalla de inicio)
// se queda con una copia guardada de la página y no siempre revisa
// si hay una nueva.
//
// Con esto ya no hace falta: cada vez que se abre el portal, cada vez
// que vuelve a primer plano (lo abren de nuevo desde el ícono), y
// cada 5 minutos mientras está abierto, se revisa un archivito
// (version.txt) que dice cuál es la versión más reciente subida. Si
// no coincide con la versión que tiene cargada este teléfono en este
// momento, se recarga sola — así el arreglo llega automático, sin que
// nadie tenga que hacer nada.
async function verificarActualizacion() {
  try {
    const resp = await fetch(`version.txt?_=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) return;
    const versionServidor = (await resp.text()).trim();
    if (!versionServidor || versionServidor === VERSION_APP) return;

    // No interrumpir si en este momento están escribiendo algo (por
    // ejemplo, poniendo su contraseña) — se vuelve a intentar en el
    // siguiente chequeo, unos minutos después.
    const activo = document.activeElement;
    const escribiendo = activo && (activo.tagName === "INPUT" || activo.tagName === "TEXTAREA") && activo.value;
    if (escribiendo) return;

    const url = new URL(location.href);
    url.searchParams.set("_actualizado", Date.now());
    location.href = url.href;
  } catch (e) {
    // Sin internet en este momento, o falló la revisión — no pasa
    // nada, se sigue usando la versión ya cargada y se reintenta solo
    // más tarde.
  }
}

verificarActualizacion();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") verificarActualizacion();
});
setInterval(verificarActualizacion, 5 * 60 * 1000);
