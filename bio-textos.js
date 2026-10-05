// ===============================================================
// Textos que cambian según el tipo de cliente ("academia" o
// "empresa"), en un solo lugar. Para academias son los de siempre;
// para empresas no puede aparecer alumno, academia, papá, familia,
// clase ni empleado (se dice "colaborador" y "empresa").
//
// Uso:
//   bioTextos.para(tipo).clave            → texto (o función con datos)
//   bioTextos.aplicar(raiz, tipo)          → llena los elementos con
//       data-texto="clave" (textContent), data-texto-html="clave"
//       (innerHTML) y data-texto-placeholder="clave" (placeholder).
// Los nombres internos (variables, acciones, tablas) NO cambian.
// ===============================================================
const bioTextos = (() => {
  const TEXTOS = {
    academia: {
      persona: "alumno",
      personas: "alumnos",
      // ---- panel ----
      panelAyudaKiosko: 'Esta página es solo para administrar alumnos (agregar, editar, borrar). Para la pantalla de la tablet donde los alumnos ingresan su código, se muestra su foto y un mensaje de bienvenida, usa <strong>biometrico.html</strong> — esa la dejas abierta en la entrada, aparte de esta.',
      panelPortalTitulo: "👨‍👩‍👧‍👦 Portal de Alumnos (para los papás)",
      panelPortalAyuda: 'Compárteles este enlace a los papás (por WhatsApp, por ejemplo) — ya abre directo en TU cuenta, sin que tengan que buscarla ni escribir su nombre. Ahí escriben el código del alumno y su PIN del portal. Cada alumno tiene su propio PIN (lo generas desde "Editar" en su tarjeta, más abajo) — ese es el que le compartes a la familia.',
      panelPortalAbrir: "Abrir el Portal de Alumnos →",
      panelPortalCopiar: "📋 Copiar enlace para los papás",
      panelAgregarTitulo: "➕ Agregar alumno",
      panelAgregarAyuda: "El código se asigna solo, al azar (4 dígitos) — no se puede escoger, no sigue un orden, y no se repite entre alumnos de tu cuenta.",
      panelNombrePlaceholder: "Nombre del alumno",
      panelAgregarBoton: "Agregar alumno",
      panelListaTitulo: "🧑‍🎓 Alumnos",
      panelListaCargando: "Cargando alumnos...",
      panelListaVacia: "Todavía no has agregado ningún alumno.",
      panelErrorNombre: "Escribe el nombre del alumno.",
      modalEditarTitulo: "Editar alumno",
      modalPinTitulo: "👨‍👩‍👧‍👦 PIN del Portal de Alumnos",
      modalBorrar: "🗑️ Borrar alumno",
      modalAsistenciasAyuda: 'Si se marcó doble por error, o se marcó al alumno equivocado, aquí puedes borrar esa marcación puntual — se quita tanto de "clases este mes" como del historial que ve el papá en su portal.',
      pinAlCrear: (pin) => ` Su PIN del Portal de Alumnos es ${pin} — compártelo con los papás (lo pueden cambiar después).`,
      pinSinAsignar: "Todavía no tiene PIN del Portal de Alumnos — genérale uno para poder compartírselo a los papás.",
      pinConfirmar: "¿Generar un PIN nuevo del Portal de Alumnos para este alumno? Si ya tenía uno, deja de funcionar.",
      pinNuevo: (pin) => `PIN nuevo: ${pin} — compártelo con los papás.`,
      confirmarBorrarAsistencia: '¿Borrar esta marcación? Se quita de "clases este mes" y del historial que ve el papá en su portal. Esto no se puede deshacer.',
      // ---- portal ----
      tituloPortal: "Portal de Alumnos",
      portalCodigoPlaceholder: "Código del alumno",
      portalSinCorreo: "Si no registraste un correo, pídele a tu academia que te genere un PIN nuevo.",
      portalSubtituloLogin: "Escribe el código del alumno y su PIN del portal.",
      portalSubtituloSinMarca: "Escribe el código del alumno y su PIN del portal.",
      portalTituloLogin: "🧒 Entrar al portal",
      portalErrorCodigo: "Escribe el código del alumno.",
      portalAgregarOtro: "+ Agregar otro alumno",
      portalQuitar: "este alumno",
      portalEntradasA: "a la academia",
      portalAvisosActivos: "Los avisos están ACTIVADOS para este alumno en este dispositivo.",
      portalConfirmarCerrarVarios: "¿Cerrar sesión en este dispositivo? Se quitan todos los alumnos guardados aquí; para volver a verlos vas a necesitar su código y su PIN.",
      portalTituloPanel: "👨‍👩‍👧",
    },
    empresa: {
      persona: "colaborador",
      personas: "colaboradores",
      // ---- panel ----
      panelAyudaKiosko: 'Esta página es solo para administrar colaboradores (agregar, editar, borrar). Para la pantalla de la tablet donde los colaboradores ingresan su código, se muestra su foto y un mensaje de bienvenida, usa <strong>biometrico.html</strong> — esa la dejas abierta en la entrada, aparte de esta.',
      panelPortalTitulo: "👥 Portal de Colaboradores",
      panelPortalAyuda: 'Comparte este enlace con tus colaboradores (por WhatsApp, por ejemplo) — ya abre directo en TU cuenta, sin que tengan que buscarla ni escribir su nombre. Ahí escriben su código y su PIN del portal. Cada colaborador tiene su propio PIN (lo generas desde "Editar" en su tarjeta, más abajo) — ese es el que le compartes.',
      panelPortalAbrir: "Abrir el Portal de Colaboradores →",
      panelPortalCopiar: "📋 Copiar enlace para los colaboradores",
      panelAgregarTitulo: "➕ Agregar colaborador",
      panelAgregarAyuda: "El código se asigna solo, al azar (4 dígitos) — no se puede escoger, no sigue un orden, y no se repite entre los colaboradores de tu cuenta.",
      panelNombrePlaceholder: "Nombre del colaborador",
      panelAgregarBoton: "Agregar colaborador",
      panelListaTitulo: "🧑‍💼 Colaboradores",
      panelListaCargando: "Cargando colaboradores...",
      panelListaVacia: "Todavía no has agregado ningún colaborador.",
      panelErrorNombre: "Escribe el nombre del colaborador.",
      modalEditarTitulo: "Editar colaborador",
      modalPinTitulo: "🔑 PIN del Portal de Colaboradores",
      modalBorrar: "🗑️ Borrar colaborador",
      modalAsistenciasAyuda: "Si se marcó doble por error, o se marcó al colaborador equivocado, aquí puedes borrar esa marcación puntual — se quita también del historial que el colaborador ve en su portal.",
      pinAlCrear: (pin) => ` Su PIN del Portal de Colaboradores es ${pin} — compártelo con el colaborador (lo puede cambiar después).`,
      pinSinAsignar: "Todavía no tiene PIN del Portal de Colaboradores — genérale uno para poder compartírselo.",
      pinConfirmar: "¿Generar un PIN nuevo del Portal de Colaboradores para este colaborador? Si ya tenía uno, deja de funcionar.",
      pinNuevo: (pin) => `PIN nuevo: ${pin} — compártelo con el colaborador.`,
      confirmarBorrarAsistencia: "¿Borrar esta marcación? Se quita también del historial que el colaborador ve en su portal. Esto no se puede deshacer.",
      // ---- portal ----
      tituloPortal: "Portal de Colaboradores",
      portalCodigoPlaceholder: "Tu código",
      portalSinCorreo: "Si no registraste un correo, pide en tu empresa que te generen un PIN nuevo.",
      portalSubtituloLogin: "Escribe tu código y tu PIN del portal.",
      portalSubtituloSinMarca: "Escribe tu código y tu PIN del portal.",
      portalTituloLogin: "Entrar al portal",
      portalErrorCodigo: "Escribe tu código.",
      portalAgregarOtro: "+ Agregar otro colaborador",
      portalQuitar: "este colaborador",
      portalEntradasA: "",
      portalAvisosActivos: "Los avisos están ACTIVADOS para este colaborador en este dispositivo.",
      portalConfirmarCerrarVarios: "¿Cerrar sesión en este dispositivo? Se quitan todos los colaboradores guardados aquí; para volver a verlos vas a necesitar su código y su PIN.",
      portalTituloPanel: "👥",
    },
  };

  const para = (tipo) => TEXTOS[tipo === "empresa" ? "empresa" : "academia"];

  function aplicar(raiz, tipo) {
    const t = para(tipo);
    (raiz || document).querySelectorAll("[data-texto]").forEach((e) => { e.textContent = t[e.dataset.texto]; });
    (raiz || document).querySelectorAll("[data-texto-html]").forEach((e) => { e.innerHTML = t[e.dataset.textoHtml]; });
    (raiz || document).querySelectorAll("[data-texto-placeholder]").forEach((e) => { e.placeholder = t[e.dataset.textoPlaceholder]; });
  }

  return { para, aplicar };
})();
