// ===============================================================
// Utilidades compartidas por los módulos de academia (Fase 3) en el
// panel y en el portal: dinero (siempre en centavos), meses, fechas en
// hora de Guatemala, CSV, el "responsable" que se guarda en la
// bitácora y un modal genérico. No depende de academia.js ni de
// portal.js.
// ===============================================================
const bioComun = (() => {
  const FORMAS_PAGO = {
    efectivo: "Efectivo",
    transferencia: "Transferencia",
    deposito: "Depósito",
    tarjeta: "Tarjeta",
    otro: "Otro",
  };

  const ESTADOS_MES = {
    pagado: { texto: "Pagado", clase: "activa" },
    parcial: { texto: "Parcial", clase: "parcial" },
    pendiente: { texto: "Pendiente", clase: "inactiva" },
    exento: { texto: "Exento", clase: "exento" },
    inactivo: { texto: "Inactivo", clase: "exento" },
    sin_cobro: { texto: "Sin cobro", clase: "exento" },
  };

  function escapar(texto) {
    const d = document.createElement("div");
    d.textContent = texto == null ? "" : String(texto);
    return d.innerHTML;
  }

  // 125050 → "Q1,250.50" (moneda = { simbolo }).
  function dinero(centavos, moneda) {
    const n = Number(centavos) || 0;
    const signo = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    const enteros = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${signo}${(moneda && moneda.simbolo) || "Q"}${enteros}.${String(abs % 100).padStart(2, "0")}`;
  }

  // "1250", "1,250.5", "Q 1,250.50" → 125050. null si no es un monto válido.
  function leerMonto(texto) {
    const limpio = String(texto ?? "").replace(/[^\d.,]/g, "").replace(/,/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
    const [enteros, decimales = ""] = limpio.split(".");
    const centavos = Number(enteros) * 100 + Number(decimales.padEnd(2, "0"));
    return Number.isSafeInteger(centavos) ? centavos : null;
  }

  // Para rellenar un input: 125050 → "1250.50".
  function montoParaInput(centavos) {
    const n = Number(centavos) || 0;
    return `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`;
  }

  const ahoraGuatemala = () => new Date(Date.now() - 6 * 60 * 60 * 1000);
  const hoy = () => ahoraGuatemala().toISOString().slice(0, 10);
  const mesActual = () => ahoraGuatemala().toISOString().slice(0, 7);

  // 'YYYY-MM' → "octubre 2026".
  function nombreMes(mes) {
    const [anio, numero] = String(mes || "").split("-").map(Number);
    if (!anio || !numero) return mes || "";
    return new Date(Date.UTC(anio, numero - 1, 1)).toLocaleString("es-GT", { month: "long", year: "numeric", timeZone: "UTC" });
  }

  // 'YYYY-MM-DD' → "5 oct 2026".
  function fecha(texto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(texto || ""))) return texto || "";
    return new Date(texto + "T12:00:00Z").toLocaleString("es-GT", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }

  // ISO con hora → "5 oct 2026, 14:30" en hora de Guatemala.
  function fechaHora(iso) {
    try {
      return new Date(iso).toLocaleString("es-GT", { timeZone: "America/Guatemala", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  function etiquetaEstadoMes(estado) {
    const e = ESTADOS_MES[estado] || { texto: estado, clase: "" };
    return `<span class="etiqueta-estado ${e.clase}">${escapar(e.texto)}</span>`;
  }

  function opcionesFormaPago(seleccionada = "efectivo") {
    return Object.entries(FORMAS_PAGO)
      .map(([valor, texto]) => `<option value="${valor}"${valor === seleccionada ? " selected" : ""}>${texto}</option>`)
      .join("");
  }

  // CSV para Excel: con BOM (para los acentos), separado por comas y con
  // cada celda entre comillas. Las celdas que empiezan con = + - @ se
  // escapan con "'" para que Excel no las tome como fórmulas.
  function celdaCsv(valor) {
    let texto = valor == null ? "" : String(valor);
    if (/^[=+\-@\t\r]/.test(texto)) texto = "'" + texto;
    return `"${texto.replace(/"/g, '""')}"`;
  }

  function descargarCsv(nombreArchivo, filas) {
    const contenido = "﻿" + filas.map((fila) => fila.map(celdaCsv).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // "Responsable": nombre opcional de quien usa el panel, recordado en
  // este navegador y mandado al Worker para la bitácora.
  const CLAVE_RESPONSABLE = "bio_responsable_panel";
  function responsable() {
    try { return localStorage.getItem(CLAVE_RESPONSABLE) || ""; } catch (e) { return ""; }
  }
  function guardarResponsable(nombre) {
    try {
      const limpio = String(nombre || "").trim().slice(0, 60);
      if (limpio) localStorage.setItem(CLAVE_RESPONSABLE, limpio);
      else localStorage.removeItem(CLAVE_RESPONSABLE);
    } catch (e) { /* sin almacenamiento: solo no se recuerda */ }
  }
  // Para agregar a los datos de cada llamada que cambia algo.
  const conResponsable = (datos) => ({ ...datos, responsable: responsable() || undefined });

  // Modal genérico (uno solo, se reutiliza): abrirModal(html) devuelve
  // la caja para buscar sus elementos; cerrarModal() lo esconde.
  function cajaModal() {
    let fondo = document.getElementById("modalBioModulos");
    if (!fondo) {
      fondo = document.createElement("div");
      fondo.className = "fondo-modal";
      fondo.id = "modalBioModulos";
      fondo.hidden = true;
      fondo.innerHTML = '<div class="caja-modal" id="cajaModalBioModulos"></div>';
      document.body.appendChild(fondo);
    }
    return fondo;
  }
  function abrirModal(html) {
    const fondo = cajaModal();
    fondo.querySelector("#cajaModalBioModulos").innerHTML = html;
    fondo.hidden = false;
    return fondo.querySelector("#cajaModalBioModulos");
  }
  function cerrarModal() {
    const fondo = document.getElementById("modalBioModulos");
    if (fondo) fondo.hidden = true;
  }
  const modalAbierto = () => {
    const fondo = document.getElementById("modalBioModulos");
    return !!fondo && !fondo.hidden;
  };

  // Texto corto de una entrada de la bitácora.
  function textoBitacora(b) {
    const acciones = { crear: "Registró", editar: "Editó", anular: "Anuló", quitar: "Quitó" };
    const quien = [b.responsable, b.tipoSesion ? `sesión ${b.tipoSesion} #${b.sesionId}` : null].filter(Boolean).join(" · ");
    return `${fechaHora(b.creadoEn)} — ${acciones[b.accion] || b.accion}${quien ? ` (${quien})` : ""}`;
  }

  return {
    FORMAS_PAGO, escapar, dinero, leerMonto, montoParaInput, hoy, mesActual, nombreMes, fecha, fechaHora,
    etiquetaEstadoMes, opcionesFormaPago, descargarCsv, responsable, guardarResponsable, conResponsable,
    abrirModal, cerrarModal, modalAbierto, textoBitacora,
  };
})();
