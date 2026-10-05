// ===============================================================
// Módulos de academia (Fase 2) en el Portal de Alumnos: clases
// inscritas, "Asistencias de <mes>: X de Y", avisos del mes e
// información importante. Solo se muestran si la academia tiene el
// módulo activo (portalConsultarAlumna devuelve "modulos").
//
// Se carga ANTES de portal.js y usa sus funciones (el, llamar,
// escaparHtml, alumnaActivaId) solo cuando portal.js lo llama:
// limpiar() al cambiar de alumno y pintar() con la respuesta de
// portalConsultarAlumna.
// ===============================================================
const modulosPortal = (() => {
  function nombreMes(mes) {
    const [anio, numero] = String(mes || "").split("-").map(Number);
    if (!anio || !numero) return mes || "";
    return new Date(Date.UTC(anio, numero - 1, 1)).toLocaleString("es-GT", { month: "long", timeZone: "UTC" });
  }

  function fechaCorta(iso) {
    try {
      return new Date(iso).toLocaleString("es-GT", { timeZone: "America/Guatemala", day: "numeric", month: "long", year: "numeric" });
    } catch (e) {
      return "";
    }
  }

  // Deja el portal como si no hubiera módulos (lo de siempre).
  function limpiar() {
    el("etiquetaStatClases").textContent = "Clases este mes";
    el("bloqueClasesInscritas").hidden = true;
    el("listaClasesInscritas").innerHTML = "";
    el("panelAvisosMes").hidden = true;
    el("panelImportantes").hidden = true;
    modulosPortalCuentas.limpiar();
  }

  // r = respuesta de portalConsultarAlumna; entrada = alumno guardado.
  function pintar(r, entrada) {
    limpiar();
    const modulos = r.modulos || [];

    if (modulos.includes("clases_asistencia") && r.asistenciasMes) {
      const a = r.asistenciasMes;
      el("etiquetaStatClases").textContent = `Asistencias de ${nombreMes(a.mes)}`;
      el("statClasesEsteMes").textContent = `${a.asistencias} de ${a.esperadas}`;
      const clases = r.clasesInscritas || [];
      el("listaClasesInscritas").innerHTML = clases.length
        ? clases.map((c) => `<li>${escaparHtml(c.nombre)}${c.horario ? ` <span class="ayuda" style="margin:0;">· ${escaparHtml(c.horario)}</span>` : ""}</li>`).join("")
        : '<li class="ayuda" style="list-style:none; margin-left:-18px;">Todavía no hay clases inscritas.</li>';
      el("bloqueClasesInscritas").hidden = false;
    }

    if (modulos.includes("avisos")) cargarAvisos(entrada);
    modulosPortalCuentas.pintar(modulos, entrada);
  }

  function htmlAviso(a) {
    return `
      <div class="tarjeta-item${a.fijado ? " aviso-fijado" : ""}">
        <div class="info-principal">
          <div class="nombre-item">${a.fijado ? "📌 " : ""}${escaparHtml(a.titulo)}</div>
          <div class="detalle-item">${escaparHtml(fechaCorta(a.creadoEn))}</div>
          <div class="texto-aviso">${escaparHtml(a.texto)}</div>
        </div>
      </div>
    `;
  }

  async function cargarAvisos(entrada) {
    try {
      const r = await llamar("portalAvisos", {}, entrada);
      // Puede que mientras tanto se haya cambiado de alumno.
      if (!r.success || alumnaActivaId !== entrada.alumnaId) return;
      const mes = r.avisosMes || [];
      const importantes = r.importantes || [];
      el("listaAvisosMes").innerHTML = mes.length
        ? mes.map(htmlAviso).join("")
        : '<p class="lista-vacia">No hay avisos este mes.</p>';
      el("listaImportantes").innerHTML = importantes.length
        ? importantes.map(htmlAviso).join("")
        : '<p class="lista-vacia">No hay información importante por ahora.</p>';
      el("panelAvisosMes").hidden = false;
      el("panelImportantes").hidden = false;
    } catch (e) {
      // Sin conexión: los avisos se quedan escondidos.
    }
  }

  return { limpiar, pintar };
})();
