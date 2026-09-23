/* ==========================================================================
   CELRED Ads Manager — panel de aprobacion paso a paso
   --------------------------------------------------------------------------
   Sin frameworks, a proposito: este panel tiene que abrir dentro de cinco anos
   sin instalar nada y sin internet.

   COMO FUNCIONA LA APROBACION

   El navegador no decide nada. Guarda que etapas aprobo la persona y la firma
   del plan que estaba en pantalla, y las manda al final. El servidor crea el
   plan que corresponde a esa firma, no lo que diga este archivo.

   Cualquier edicion recalcula el plan en el servidor, cambia la firma y borra
   las aprobaciones de esa etapa en adelante: no se puede aprobar una pantalla
   y crear otra cosa.
   ========================================================================== */

const ETAPAS = ['campana', 'conjunto', 'anuncios', 'final'];

const estado = {
  campana: '',
  borrador: '',
  plan: null,
  firma: '',
  ajustes: { campana: {}, conjuntos: [] },
  aprobaciones: { campana: false, conjunto: false, anuncios: false, final: false },
  etapa: 1,
  puedePublicar: false,
  motivoBloqueo: '',
};

const EJEMPLOS = [
  'ayúdame a crear una campaña para neiva de android',
  'campaña de prueba para neiva con tecnocamon50pro e infinixhot60pro a crédito con 35 mil diarios',
  'campaña para la sede La 16 con el iphone15',
  'campaña para la victoria con android redmi 15, samsung a07 y samsung a17, y otra de iphone 15, iphone 13 y iphone 14',
];

/* -------------------------------------------------------------------------- */
/*  Utilidades                                                                */
/* -------------------------------------------------------------------------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/** Escapa todo lo que venga de datos antes de meterlo en el HTML. */
function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const mostrar = (id, visible) => $(id).classList.toggle('oculto', !visible);

function cargando(activo) {
  $('#cargando').classList.toggle('oculto', !activo);
}

/* -------------------------------------------------------------------------- */
/*  Modal                                                                     */
/* -------------------------------------------------------------------------- */
/**
 *  Reemplaza a alert() y confirm() del navegador, que son feos y además
 *  cortan el hilo: ni se pueden leer con calma ni permiten enseñar un ejemplo
 *  al lado del error. Este devuelve una promesa con el botón que se pulsó.
 */

const ICONOS = { error: '✕', aviso: '!', pregunta: '?', ok: '✓' };

let cerrarModal = null;

/**
 * @param {object} opciones
 * @param {string} opciones.titulo
 * @param {string} opciones.cuerpo        HTML ya escapado por quien llama
 * @param {'error'|'aviso'|'pregunta'|'ok'} [opciones.tipo='error']
 * @param {string} [opciones.tecnico]     detalle plegado, para depurar
 * @param {{texto:string, valor:any, clase?:string}[]} [opciones.botones]
 * @returns {Promise<any>} el valor del botón pulsado
 */
function modal({ titulo, cuerpo, tipo = 'error', tecnico = '', botones }) {
  const caja = $('#modal');
  const lista = botones || [{ texto: 'Entendido', valor: true, clase: 'btn-primario' }];

  caja.className = `modal modal-${tipo}`;
  $('#modal-icono').textContent = ICONOS[tipo] || '!';
  $('#modal-titulo').textContent = titulo;
  $('#modal-cuerpo').innerHTML = cuerpo;

  mostrar('#modal-tecnico', Boolean(tecnico));
  $('#modal-tecnico').open = false;
  $('#modal-tecnico-texto').textContent = tecnico || '';

  return new Promise((resolver) => {
    const terminar = (valor) => {
      caja.classList.add('oculto');
      document.removeEventListener('keydown', alTeclado);
      cerrarModal = null;
      resolver(valor);
    };

    function alTeclado(e) {
      // Escape siempre cancela: es lo que espera cualquiera.
      if (e.key === 'Escape') terminar(lista.find((b) => b.valor === false)?.valor ?? false);
      if (e.key === 'Enter') terminar(lista.at(-1).valor);
    }

    $('#modal-pie').innerHTML = '';
    lista.forEach((b, i) => {
      const boton = document.createElement('button');
      boton.className = `btn ${b.clase || ''}`;
      boton.textContent = b.texto;
      boton.addEventListener('click', () => terminar(b.valor));
      $('#modal-pie').append(boton);
      if (i === lista.length - 1) setTimeout(() => boton.focus(), 30);
    });

    cerrarModal = terminar;
    document.addEventListener('keydown', alTeclado);
    caja.classList.remove('oculto');
  });
}

/** Pregunta de sí o no. Sustituye a confirm(). */
function preguntar({ titulo, cuerpo, si = 'Continuar', no = 'Cancelar', tipo = 'pregunta' }) {
  return modal({
    titulo,
    cuerpo,
    tipo,
    botones: [
      { texto: no, valor: false },
      { texto: si, valor: true, clase: tipo === 'error' ? 'btn-peligro' : 'btn-primario' },
    ],
  });
}

/**
 * Enseña un error del servidor.
 *
 * Los mensajes vienen con saltos de línea y viñetas "·". Se convierten en
 * párrafos y lista, y el bloque "Formato / Ejemplo" se saca aparte para que
 * se vea de un golpe con qué hay que comparar.
 */
function modalDeError(datos) {
  const texto = String(datos.error || datos.message || 'Algo salió mal.');

  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const viñetas = [];
  const parrafos = [];
  let formato = '';
  let ejemplo = '';
  let ayuda = '';

  for (const linea of lineas) {
    if (linea.startsWith('·')) viñetas.push(linea.slice(1).trim());
    else if (/^Formato:/i.test(linea)) formato = linea.replace(/^Formato:\s*/i, '');
    else if (/^Ejemplo:/i.test(linea)) ejemplo = linea.replace(/^Ejemplo:\s*/i, '');
    else if (formato && !ayuda && !linea.includes('|')) ayuda = linea;
    else parrafos.push(linea);
  }

  const cuerpo =
    parrafos.map((p) => `<p>${esc(p)}</p>`).join('') +
    (viñetas.length ? `<ul>${viñetas.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : '') +
    (formato || ejemplo
      ? `<div class="modal-formato">
           ${formato ? `<div><b>Formato</b><code>${esc(formato)}</code></div>` : ''}
           ${ejemplo ? `<div class="ejemplo"><b>Ejemplo</b><code>${esc(ejemplo)}</code></div>` : ''}
         </div>`
      : '') +
    (ayuda ? `<p class="sutil">${esc(ayuda)}</p>` : '');

  return modal({
    titulo: datos.titulo || 'No se pudo continuar',
    cuerpo: cuerpo || `<p>${esc(texto)}</p>`,
    tipo: 'error',
    tecnico: datos.tecnico || '',
  });
}

async function pedir(ruta, opciones = {}) {
  const res = await fetch(ruta, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });
  const datos = await res.json();
  if (!res.ok || datos.ok === false) {
    const error = new Error(datos.error || `Error ${res.status}`);
    // Se guardan titulo y detalle tecnico para que el modal los pueda usar.
    error.datos = datos;
    throw error;
  }
  return datos;
}

/** Fila de una lista de definiciones. */
const fila = (etiqueta, valor, nota = '') =>
  `<dt>${esc(etiqueta)}</dt><dd>${valor}${nota ? `<span class="nota">${esc(nota)}</span>` : ''}</dd>`;

/* -------------------------------------------------------------------------- */
/*  Pantalla 0: elegir campana                                                */
/* -------------------------------------------------------------------------- */

async function cargarInicio() {
  cargando(true);
  try {
    const datos = await pedir('/api/estado');
    estado.puedePublicar = datos.puedePublicar;

    if (!datos.credenciales.completas) {
      estado.motivoBloqueo =
        'Faltan credenciales en el .env, así que no se puede crear nada en Meta todavía: ' +
        datos.credenciales.faltan.map((v) => v.clave).join(', ') + '.';

      $('#aviso-credenciales').innerHTML =
        '<strong>Modo revisión.</strong> Faltan credenciales en el <code>.env</code>, así que el panel ' +
        'planifica sin consultar Meta y el botón de enviar queda bloqueado. Falta:<ul>' +
        datos.credenciales.faltan.map((v) => `<li><code>${esc(v.clave)}</code> — ${esc(v.para)}</li>`).join('') +
        '</ul>';
      mostrar('#aviso-credenciales', true);
      $('#sello-borrador').className = 'sello sello-gris';
      $('#sello-borrador').textContent = 'MODO REVISIÓN · SIN CREDENCIALES';
    } else if (!datos.token?.valido) {
      // Las variables están puestas pero el token no sirve. Es el caso que más
      // confunde: todo parece bien hasta que se pulsa enviar.
      estado.motivoBloqueo = datos.token.caducado
        ? 'El token de Meta caducó. Saca uno nuevo y ponlo en META_ACCESS_TOKEN del .env.'
        : `Meta rechazó el token: ${datos.token.motivo}`;

      $('#aviso-credenciales').innerHTML =
        `<strong>${datos.token.caducado ? 'El token caducó.' : 'El token no sirve.'}</strong> ` +
        'Las tres variables están puestas en el <code>.env</code>, pero Meta no las acepta:' +
        `<p class="mono">${esc(datos.token.motivo)}</p>` +
        (datos.token.caducado
          ? '<p>Saca uno nuevo en <strong>Business Manager → Usuarios del sistema → Generar token</strong>. ' +
            'Los de usuario de sistema no caducan; los de usuario duran horas.</p>'
          : '') +
        '<p>El panel sigue abierto para revisar campañas, pero no puede crear nada.</p>';
      mostrar('#aviso-credenciales', true);
      $('#sello-borrador').className = 'sello sello-rojo';
      $('#sello-borrador').textContent = datos.token.caducado ? 'TOKEN CADUCADO' : 'TOKEN INVÁLIDO';
    } else if (!datos.paginaId) {
      estado.motivoBloqueo = 'Falta META_PAGE_ID en el .env: sin la Página no se pueden crear anuncios de WhatsApp.';
      $('#aviso-credenciales').innerHTML = `<strong>Falta la Página.</strong> ${esc(estado.motivoBloqueo)}`;
      mostrar('#aviso-credenciales', true);
    }

    const lista = $('#lista-campanas');
    mostrar('#sin-campanas', datos.campanas.length === 0);

    lista.innerHTML = datos.campanas
      .map((c) => {
        if (c.problema) {
          return `<button class="tarjeta" disabled>
              <span><strong>${esc(c.nombre)}</strong><br />
                <span class="sutil">${esc(c.problema.split('\n')[0])}</span></span>
              <span class="sello sello-rojo">NO CARGA</span>
            </button>`;
        }
        return `<button class="tarjeta" data-campana="${esc(c.nombre)}">
            <span>
              <strong>${esc(c.nombre)}</strong><br />
              <span class="sutil">${esc(c.descripcion || 'Sin descripción')}</span>
            </span>
            <span class="sutil">${esc(c.sede)} · ${esc(c.segmento)} · ${c.anuncios} anuncio(s)</span>
          </button>`;
      })
      .join('');

    $$('[data-campana]').forEach((b) =>
      b.addEventListener('click', () => abrirCampana(b.dataset.campana)),
    );
  } catch (error) {
    $('#lista-campanas').innerHTML =
      `<div class="alerta alerta-roja">No se pudo leer el estado del proyecto: ${esc(error.message)}</div>`;
  } finally {
    cargando(false);
  }
}

async function abrirCampana(nombre, borrador = '') {
  estado.campana = nombre;
  estado.borrador = borrador;
  estado.ajustes = { campana: {}, conjuntos: [] };
  estado.aprobaciones = { campana: false, conjunto: false, anuncios: false, final: false };
  estado.etapa = 1;

  const ok = await planificar();
  if (!ok) return;

  mostrar('#pantalla-inicio', false);
  mostrar('#pantalla-asistente', true);
}

/* -------------------------------------------------------------------------- */
/*  Dictado en lenguaje natural                                               */
/* -------------------------------------------------------------------------- */

async function interpretar(evento) {
  evento.preventDefault();
  const texto = $('#dictado').value.trim();
  if (!texto) return;

  cargando(true);
  try {
    const r = await pedir('/api/interpretar', { method: 'POST', body: JSON.stringify({ texto }) });
    pintarLectura(r);

    if (r.entendido) {
      // Se abre el asistente directamente: la lectura queda arriba, visible,
      // por si hay que volver y corregir la frase.
      await abrirCampana(`dictada: ${texto.slice(0, 40)}${texto.length > 40 ? '…' : ''}`, r.borrador);
    }
  } catch (error) {
    pintarLectura({ entendido: false, problemas: [error.message], avisos: [], lectura: {} });
  } finally {
    cargando(false);
  }
}

/** El reparto en conjuntos, se pueda crear o no. Responde «¿y este a dónde va?». */
function repartoPrevisto(lectura) {
  if (!lectura?.agrupacionPrevista?.length) return '';
  return (
    '<p><strong>Reparto en conjuntos:</strong></p><ul>' +
    lectura.agrupacionPrevista
      .map(
        (g, i) =>
          `<li><code>CJTO${i + 1} · ${esc(g.segmento)}</code> — ${g.equipos.map(esc).join(', ')}</li>`,
      )
      .join('') +
    '</ul>'
  );
}

function pintarLectura(r) {
  const caja = $('#lectura');
  mostrar('#lectura', true);

  if (!r.entendido) {
    caja.className = 'alerta alerta-roja';
    caja.innerHTML =
      '<strong>No pude armar la campaña</strong>' +
      ((r.lectura?.productos || []).length
        ? `<p>Equipos que sí reconocí: ${r.lectura.productos.map((p) => `<code>${esc(p)}</code>`).join(' · ')}</p>`
        : '') +
      repartoPrevisto(r.lectura) +
      '<ul>' +
      (r.problemas || []).map((p) => `<li>${esc(p).replace(/\n/g, '<br />')}</li>`).join('') +
      '</ul>' +
      ((r.lectura?.ambiguo || []).length
        ? `<p>Sedes posibles: ${r.lectura.ambiguo.map((s) => `<code>${esc(s)}</code>`).join(' · ')}</p>`
        : '') +
      ((r.avisos || []).length ? `<p class="sutil">${r.avisos.map(esc).join('<br />')}</p>` : '');
    return;
  }

  const l = r.lectura;
  caja.className = 'alerta alerta-verde';
  caja.innerHTML =
    '<strong>Esto entendí</strong>' +
    `<p>Sede <code>${esc(l.sede)}</code> — ${esc(l.sedeNombre)} (la reconocí por «${esc(l.alias)}»)<br />` +
    `Equipos: ${l.productos.map((p) => `<code>${esc(p)}</code>`).join(' · ')}<br />` +
    `$${Number(l.presupuesto).toLocaleString('es-CO')} COP/día por conjunto</p>` +
    repartoPrevisto(l) +
    ((r.avisos || []).length ? `<ul>${r.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '') +
    ((r.problemas || []).length
      ? `<ul class="mal">${r.problemas.map((p) => `<li>${esc(p).replace(/\n/g, '<br />')}</li>`).join('')}</ul>`
      : '');
}

/* -------------------------------------------------------------------------- */
/*  Planificacion                                                             */
/* -------------------------------------------------------------------------- */

async function planificar() {
  cargando(true);
  try {
    const datos = await pedir('/api/plan', {
      method: 'POST',
      body: JSON.stringify({
        campana: estado.borrador ? undefined : estado.campana,
        borrador: estado.borrador || undefined,
        ajustes: estado.ajustes,
      }),
    });

    estado.plan = datos.plan;
    estado.firma = datos.plan.firma;
    pintarTodo();
    return true;
  } catch (error) {
    cargando(false);
    await modalDeError(error.datos || { error: error.message });
    return false;
  } finally {
    cargando(false);
  }
}

/* -------------------------------------------------------------------------- */
/*  Pintado                                                                   */
/* -------------------------------------------------------------------------- */

function pintarTodo() {
  const p = estado.plan;

  $('#cinta-campana').innerHTML =
    `<strong>${esc(estado.campana)}</strong> · ${esc(p.sede.nombre)} (${esc(p.sede.ciudad)}) · ` +
    `cuenta ${esc(p.cuenta.etiqueta)} — ${esc(p.cuenta.nombre || p.cuenta.id)}` +
    (p.sinConexion
      ? ' <span class="sello sello-gris">SIN CONSULTAR META</span>'
      : '');

  pintarAvisos();
  pintarCambios();
  pintarEtapa1();
  pintarEtapa2();
  pintarEtapa3();
  pintarEtapa4();
  pintarPasos();
}

function pintarAvisos() {
  const avisos = estado.plan.avisos || [];
  const caja = $('#avisos');
  mostrar('#avisos', avisos.length > 0);
  if (avisos.length === 0) return;

  caja.className = 'alerta alerta-amarilla';
  caja.innerHTML =
    `<strong>Avisos (${avisos.length})</strong><ul>` +
    avisos.map((a) => `<li>${esc(a)}</li>`).join('') +
    '</ul>';
}

function pintarCambios() {
  const cambios = estado.plan.cambios || [];
  const caja = $('#cambios');
  mostrar('#cambios', cambios.length > 0);
  if (cambios.length === 0) return;

  caja.className = 'alerta alerta-verde';
  caja.innerHTML =
    `<strong>Editado en el panel (${cambios.length})</strong><ul>` +
    cambios
      .map((c) => `<li>${esc(c.etapa)} · ${esc(c.campo)}: <code>${esc(c.antes)}</code> → <code>${esc(c.despues)}</code></li>`)
      .join('') +
    '</ul>';
}

/* ------------------------------- etapa 1 ---------------------------------- */

function pintarEtapa1() {
  const p = estado.plan;
  const c = p.campana;

  const consecutivo = c.consecutivo
    ? `Última de ${p.sede.codigo}: C${c.consecutivo.maximo} → se crea C${c.consecutivo.siguiente} ` +
      `(${c.consecutivo.previas} previas entre ${c.consecutivo.revisadas} campañas revisadas)`
    : 'Se cuelga de una campaña que ya existe.';

  $('#c1-vista').innerHTML = `
    <div class="bloque">
      <dl class="datos">
        ${fila(
          c.crear ? 'Campaña nueva' : 'Campaña existente',
          `<span class="grande mono ok">${esc(c.nombre)}</span>`,
          `Patrón del manual: ${c.patron}`,
        )}
        ${fila('Objetivo', esc(c.objetivo), 'Conversaciones — mensajería a WhatsApp')}
        ${fila('Consecutivo', esc(consecutivo))}
        ${fila('Sede', `${esc(p.sede.codigo)} · ${esc(p.sede.nombre)} (${esc(p.sede.ciudad)})`, `Distintivo ${p.sede.dist}, va en el conjunto y en los anuncios`)}
        ${fila('Cuenta publicitaria', `${esc(p.cuenta.etiqueta)} · <span class="mono">${esc(p.cuenta.id)}</span>`, `${p.cuenta.nombre} — elegida por ${p.cuenta.origen}`)}
        ${fila('Página de Facebook', `<span class="mono">${esc(p.cuenta.paginaId || '—')}</span>`)}
        ${fila('Presupuesto en la campaña', '<span class="ok">NINGUNO (ABO)</span>', 'El presupuesto vive en el conjunto, punto 9 del manual')}
      </dl>
    </div>`;

  $('#c1-form').elements.nombre.value = c.nombre;
  $('#c1-form').elements.compartirPresupuesto.checked = Boolean(p.expansion.repartoDePresupuesto.encendido);
}

/* ------------------------------- etapa 2 ---------------------------------- */

function pintarEtapa2() {
  const p = estado.plan;
  const e = p.expansion;

  $('#c2-titulo').textContent =
    p.conjuntos.length === 1
      ? 'Etapa 2 · El conjunto de anuncios'
      : `Etapa 2 · Los ${p.conjuntos.length} conjuntos de anuncios`;

  // Cada interruptor con su nombre, cómo se llama en Ads Manager y qué pasa
  // de verdad si se enciende. Los técnicos van al final, atenuados.
  const listaInterruptores = (interruptores) =>
    interruptores
      .map(
        (i) => `
      <li class="interruptor ${i.encendido ? 'encendido' : ''}">
        <div class="interruptor-cabeza">
          <span class="pastilla ${i.encendido ? 'pastilla-mal' : 'pastilla-ok'}">
            ${i.encendido ? 'ACTIVADO' : 'DESACTIVADO'}
          </span>
          <strong>${esc(i.nombre)}</strong>
        </div>
        <div class="interruptor-detalle">
          <div><span class="sutil">En Ads Manager:</span> ${esc(i.enAdsManager)}</div>
          <div><span class="sutil">Si se enciende:</span> ${esc(i.siSeEnciende)}</div>
          <div><span class="sutil">Por qué está apagado:</span> ${esc(i.porQueApagado)}</div>
          ${
            i.editable
              ? '<div class="sutil">Se puede cambiar con el botón <strong>Editar</strong>.</div>'
              : `<div class="sutil">No se marca desde aquí: ${esc(i.razonNoEditable)}</div>`
          }
          <div class="tecnico"><code>${esc(i.campo)} = ${i.encendido ? '1' : '0'}</code></div>
        </div>
      </li>`,
      )
      .join('');

  const r = e.repartoDePresupuesto;

  const casilla = `
    <div class="casilla-estado ${e.apagada ? '' : 'casilla-aviso'}">
      <span class="marca-check">${e.apagada ? '✓' : '!'}</span>
      <div style="width:100%">
        <div class="titulo">
          Expansión de público: ${e.apagada ? 'TODO DESACTIVADO' : 'HAY EXPANSIÓN ACTIVADA'}
        </div>
        <div class="sutil">
          ${
            e.apagada
              ? 'La casilla «Llegar a más personas cuando sea probable que mejore el rendimiento» queda sin marcar, y las demás también.'
              : 'Alguien activó expansión a propósito desde este panel. Revisa abajo cuál y qué implica.'
          }
        </div>
        <ul class="interruptores lista-interruptores">
          ${listaInterruptores(p.conjuntos[0].interruptores)}
          <li class="interruptor ${r.encendido ? 'encendido' : ''}">
            <div class="interruptor-cabeza">
              <span class="pastilla ${r.encendido ? 'pastilla-mal' : 'pastilla-ok'}">
                ${r.encendido ? 'ACTIVADO' : 'DESACTIVADO'}
              </span>
              <strong>${esc(r.nombre)}</strong>
            </div>
            <div class="interruptor-detalle">
              <div><span class="sutil">En Ads Manager:</span> ${esc(r.enAdsManager)}</div>
              <div><span class="sutil">Si se enciende:</span> ${esc(r.siSeEnciende)}</div>
              <div><span class="sutil">Por qué está apagado:</span> ${esc(r.porQueApagado)}</div>
              <div class="sutil">Es de la campaña, no del conjunto: se cambia en la <strong>etapa 1</strong>.</div>
              <div class="tecnico"><code>is_adset_budget_sharing_enabled = ${r.encendido}</code></div>
            </div>
          </li>
        </ul>
        ${
          p.conjuntos.length > 1
            ? `<p class="sutil">Los interruptores se muestran del primer conjunto. Cada conjunto tiene los suyos y se editan por separado.</p>`
            : ''
        }
        ${e.problemas.length ? `<div class="mal">${e.problemas.map(esc).join('<br />')}</div>` : ''}
      </div>
    </div>
    ${(e.fueraDeNuestroControl || [])
      .map(
        (f) => `
        <div class="casilla-estado casilla-aviso" style="margin-top:12px">
          <span class="marca-check">!</span>
          <div>
            <div class="titulo">${esc(f.que)}: Meta ya no deja apagarla</div>
            <div class="sutil">${esc(f.porque)}</div>
            <div style="margin-top:8px">${esc(f.efectoAqui)}</div>
          </div>
        </div>`,
      )
      .join('')}`;

  const mejoras = `
    <div class="casilla-estado">
      <span class="marca-check">✓</span>
      <div>
        <div class="titulo">Mejoras automáticas de Meta: ${p.mejoras.total} en OPT_OUT</div>
        <div class="sutil">
          ${
            p.mejoras.rotacionDeTexto === 'OPT_IN'
              ? 'La única inscripción activa es <code>text_optimizations</code>, que no genera ni reescribe ' +
                'nada: es lo que permite que se entreguen las 5 variantes de texto escritas a mano. ' +
                'Sin ella Meta serviría un solo texto.'
              : 'Ninguna inscripción activa: modo de texto simple.'
          }
        </div>
        <ul class="interruptores">
          ${p.mejoras.apagadas.map((m) => `<li><code>${esc(m)}</code> — OPT_OUT</li>`).join('')}
        </ul>
      </div>
    </div>`;

  const bloquesDeConjunto = p.conjuntos
    .map((c) => {
      const s = c.segmentacion;
      return `
      <article class="anuncio">
        <header>
          <span class="grande mono ok">${esc(c.nombre)}</span>
          <span class="sello sello-gris">${esc(c.segmento)}${c.sufijo ? ` | ${esc(c.sufijo)}` : ''} · ${
            c.anuncios.length
          } anuncio(s)</span>
        </header>
        <div style="padding:18px">
          <dl class="datos">
            ${fila('Segmento', esc(c.segmento), c.segmentoTexto)}
            ${fila(
              'Presupuesto diario',
              `<span class="grande ${c.presupuesto.dentroDelManual ? 'ok' : ''}">${esc(
                c.presupuesto.formateado,
              )}</span>`,
              `A la API: ${c.presupuesto.unidadMenor} (unidad menor) · ${c.presupuesto.nivel}` +
                (c.presupuesto.dentroDelManual ? '' : ' · FUERA del rango del manual'),
            )}
            ${fila('Geolocalización', `<span class="ok">${esc(s.ubicacion)}</span>`, `Modo: ${s.modoGeo} · ${s.ciudad}`)}
            ${fila('Tipo de ubicación', esc(s.tipoUbicacion), 'home + recent: vive o estuvo hace poco. No incluye turistas')}
            ${fila('Edades / géneros', `${esc(s.edades)} · ${esc(s.generos)}`)}
            ${fila('Plataformas', esc(s.plataformas), s.dispositivos)}
            ${fila('Ubicaciones', s.posiciones.map(esc).join('<br />'), 'Manuales: no se usa Advantage+ Placements')}
            ${fila(
              'Expansión Advantage+',
              c.expansionApagada ? '<span class="ok">DESACTIVADA</span>' : '<span class="mal">REVISAR</span>',
            )}
          </dl>
        </div>
      </article>`;
    })
    .join('');

  $('#c2-vista').innerHTML = `
    <div class="bloque">
      <p class="pista">
        Patrón del manual: <code>${esc(p.patronConjunto)}</code>. El presupuesto va en el conjunto
        (ABO): la campaña se crea sin presupuesto propio.
        ${
          p.conjuntos.length > 1
            ? `Los ${p.conjuntos.length} conjuntos suman <strong>${esc(
                p.totales.presupuestoFormateado,
              )}</strong> al día.`
            : ''
        }
      </p>
      ${bloquesDeConjunto}
    </div>

    <div class="bloque">
      <h3>Destino de los mensajes</h3>
      <dl class="datos">
        ${fila('Número de WhatsApp', `<span class="grande ok mono">+${esc(p.whatsapp.telefono)}</span>`, `Origen: ${p.whatsapp.origen}`)}
        ${fila('Tienda / líder', `${esc(p.whatsapp.tienda || '—')} · ${esc(p.whatsapp.lider || '—')}`, 'Tal como está en lineas.xlsx')}
        ${fila('Destino', '<span class="ok">SOLO WHATSAPP</span>', 'destination_type=WHATSAPP · CTA=WHATSAPP_MESSAGE')}
        ${fila('Messenger', '<span class="ok">DESACTIVADO</span>')}
        ${fila('Instagram Direct', '<span class="ok">DESACTIVADO</span>')}
        ${fila('Dónde se fija', `<code>${esc(p.whatsapp.donde)}</code>`, 'No en la URL del anuncio: Meta ignora el ?phone= del enlace')}
        ${p.whatsapp.alternativas.length ? fila('Otras líneas de la sede', p.whatsapp.alternativas.map(esc).join(', '), 'No se usan') : ''}
      </dl>
    </div>

    <div class="bloque">${casilla}</div>
    <div class="bloque">${mejoras}</div>`;

  rellenarFormularioEtapa2();
}

function rellenarFormularioEtapa2() {
  const p = estado.plan;
  const o = p.opciones;

  const opciones = (lista, actual) =>
    lista
      .map((v) => {
        const codigo = typeof v === 'string' ? v : v.codigo;
        const texto = typeof v === 'string' ? v || '(sin sufijo)' : `${v.codigo} — ${v.texto}`;
        return `<option value="${esc(codigo)}"${codigo === actual ? ' selected' : ''}>${esc(texto)}</option>`;
      })
      .join('');

  const casillas = (grupo, activas, i) =>
    o[grupo]
      .map(
        (v) =>
          `<label><input type="checkbox" data-grupo="${grupo}" data-conjunto="${i}" value="${esc(v)}"${
            activas.includes(v) ? ' checked' : ''
          } /> ${esc(v)}</label>`,
      )
      .join('');

  $('#c2-campos').innerHTML = p.conjuntos
    .map((c, i) => {
      const s = c.segmentacion;
      const plataformas = s.plataformas.split(', ').filter(Boolean);
      const dispositivos = s.dispositivos.split(', ').filter(Boolean);

      return `
      <div class="editor-anuncio">
        <h3>${esc(c.nombre)}</h3>
        <div class="rejilla">
          <label>Presupuesto diario (COP)
            <input type="number" data-campo="presupuestoDiarioCop" data-conjunto="${i}"
                   min="1000" step="1000" value="${c.presupuesto.cop}" /></label>
          <label>Radio (km)
            <input type="number" data-campo="radioKm" data-conjunto="${i}"
                   min="1" max="80" value="${s.radioKm ?? ''}" /></label>
          <label>Modo de ubicación
            <select data-campo="modoGeo" data-conjunto="${i}">${opciones(o.modosGeo, s.modoGeo)}</select></label>
          <label>Segmento
            <select data-campo="segmento" data-conjunto="${i}">${opciones(o.segmentos, c.segmento)}</select></label>
          <label>Sufijo
            <select data-campo="sufijoConjunto" data-conjunto="${i}">${opciones(o.sufijos, c.sufijo)}</select></label>
          <label>Edad mínima
            <input type="number" data-campo="edadMin" data-conjunto="${i}"
                   min="13" max="65" value="${s.edadMin ?? ''}" /></label>
          <label>Edad máxima
            <input type="number" data-campo="edadMax" data-conjunto="${i}"
                   min="13" max="65" value="${s.edadMax ?? ''}" /></label>
        </div>
        <fieldset><legend>Plataformas</legend>
          <div class="casillas">${casillas('plataformas', plataformas, i)}</div></fieldset>
        <fieldset><legend>Dispositivos</legend>
          <div class="casillas">${casillas('dispositivos', dispositivos, i)}</div></fieldset>

        <fieldset>
          <legend>Expansión de público — marcar es activarla</legend>
          ${c.interruptores
            .map((sw) =>
              sw.editable
                ? `<label class="casilla-larga">
                     <input type="checkbox" data-expansion="${esc(sw.clave)}" data-conjunto="${i}"${
                       sw.encendido ? ' checked' : ''
                     } />
                     <span>
                       <strong>${esc(sw.nombre)}</strong>
                       <span class="sutil">${esc(sw.siSeEnciende)}</span>
                       <span class="tecnico"><code>${esc(sw.campo)}</code></span>
                     </span>
                   </label>`
                : `<label class="casilla-larga apagada-fija">
                     <input type="checkbox" disabled />
                     <span>
                       <strong>${esc(sw.nombre)}</strong>
                       <span class="sutil">${esc(sw.razonNoEditable)}</span>
                       <span class="tecnico"><code>${esc(sw.campo)}</code></span>
                     </span>
                   </label>`,
            )
            .join('')}
        </fieldset>
      </div>`;
    })
    .join('');
}

/* ------------------------------- etapa 3 ---------------------------------- */

function bloqueDeTextos(rotulo, lista, limite) {
  return `
    <p class="rotulo-textos">${esc(rotulo)} (${lista.length}/${estado.plan.limites.maxOpciones} · límite cómodo ${limite})</p>
    <ul class="lista-textos">
      ${lista
        .map((t) => {
          const n = t.length;
          const pasado = n > limite;
          return `<li>${esc(t)}<span class="cuenta-caracteres${pasado ? ' pasado' : ''}">${n}${
            pasado ? ` · se pasa por ${n - limite}` : ''
          }</span></li>`;
        })
        .join('')}
    </ul>`;
}

function pintarEtapa3() {
  const p = estado.plan;
  const lim = p.limites;
  const varios = p.conjuntos.length > 1;

  $('#c3-titulo').textContent = `Etapa 3 · Los ${p.totales.anuncios} anuncios y sus creativos`;

  const hayGenerados = p.conjuntos.some((c) => c.anuncios.some((a) => a.copyGenerado));

  const aviso = hayGenerados
    ? `<div class="alerta alerta-amarilla">
         <strong>Estos textos los escribió el sistema.</strong>
         No conoce las características de ningún equipo, así que habla solo de lo que puede
         comprobar: el producto, la tienda, las formas de pago y el WhatsApp. Nunca inventa
         megapíxeles, batería ni precios. Léelos y métele lo que tú sabes del equipo — para eso
         está el botón <strong>Editar</strong>.
       </div>`
    : '';

  $('#c3-vista').innerHTML =
    aviso +
    p.conjuntos
      .map((c) => {
        const cabecera = varios
          ? `<h3 style="margin-top:22px">${esc(c.nombre)} — ${esc(c.segmento)}</h3>`
          : '';

        return (
          cabecera +
          c.anuncios
            .map((a) => {
              const vista =
                a.archivo.tipo === 'video'
                  ? `<video src="${esc(a.archivo.url)}" controls preload="metadata"></video>`
                  : `<img src="${esc(a.archivo.url)}" alt="${esc(a.referencia)}" />`;

              return `
        <article class="anuncio">
          <header>
            <span class="grande mono ok">${esc(a.nombre)}</span>
            <span class="sello sello-gris">${esc(a.formato)} · ${
              a.modoTexto === 'multiple' ? 'LAS 5 OPCIONES' : 'TEXTO SIMPLE'
            }</span>
          </header>

          <div class="anuncio-cuerpo">
            <div class="vista-creativo">
              ${vista}
              <span class="pie-creativo">${esc(a.archivo.nombre)} · ${esc(a.archivo.megas)} MB${
                a.archivo.porPartes ? ' · sube por partes' : ''
              }</span>
            </div>

            <div>
              <dl class="datos" style="margin-bottom:18px">
                ${fila('Producto', esc(a.producto))}
                ${fila('Referencia', esc(a.referencia), 'Va en el nombre del anuncio')}
                ${
                  a.comoSeEncontroElCreativo === 'solo el modelo'
                    ? fila(
                        'Ojo con la pieza',
                        '<span class="mal">emparejada solo por el modelo</span>',
                        'El nombre del archivo no lleva la marca. Confirma que es la correcta.',
                      )
                    : ''
                }
              </dl>

              ${bloqueDeTextos('Textos principales', a.copy.textosPrincipales, lim.textosPrincipales)}
              ${bloqueDeTextos('Títulos', a.copy.titulos, lim.titulos)}
              ${bloqueDeTextos('Descripciones', a.copy.descripciones, lim.descripciones)}

              <p class="rotulo-textos">Mensaje prellenado de WhatsApp</p>
              <p class="cita">${esc(a.copy.mensajePrellenado)}</p>
              ${
                a.copy.saludoWhatsApp
                  ? `<p class="rotulo-textos" style="margin-top:12px">Saludo de la pantalla previa</p>
                     <p class="cita" style="border-left-color:var(--sutil)">${esc(a.copy.saludoWhatsApp)}</p>`
                  : ''
              }
              <p class="pista" style="margin-top:12px">
                Va en <code>page_welcome_message.autofill_message</code>, no en el <code>?text=</code> de la
                URL. Entra a <strong>+${esc(p.whatsapp.telefono)}</strong>.
              </p>
            </div>
          </div>
        </article>`;
            })
            .join('')
        );
      })
      .join('');

  $('#c3-campos').innerHTML = p.conjuntos
    .map((c) =>
      c.anuncios
        .map(
          (a, i) => `
      <div class="editor-anuncio">
        <h3>${esc(a.nombre)}${varios ? ` <span class="sutil">· ${esc(c.nombre)}</span>` : ''}</h3>
        <label>
          Textos principales — una opción por línea, máximo ${lim.maxOpciones}
          <textarea data-campo="textosPrincipales" data-conjunto="${c.indice}" data-anuncio="${i}"
                    rows="5">${esc(a.copy.textosPrincipales.join('\n'))}</textarea>
        </label>
        <label>
          Títulos — una opción por línea
          <textarea data-campo="titulos" data-conjunto="${c.indice}" data-anuncio="${i}"
                    rows="5">${esc(a.copy.titulos.join('\n'))}</textarea>
        </label>
        <label>
          Descripciones — una opción por línea
          <textarea data-campo="descripciones" data-conjunto="${c.indice}" data-anuncio="${i}"
                    rows="5">${esc(a.copy.descripciones.join('\n'))}</textarea>
        </label>
        <label>
          Mensaje prellenado de WhatsApp
          <input type="text" data-campo="mensajePrellenado" data-conjunto="${c.indice}" data-anuncio="${i}"
                 value="${esc(a.copy.mensajePrellenado)}" />
        </label>
        <label>
          Saludo de la pantalla previa
          <input type="text" data-campo="saludoWhatsApp" data-conjunto="${c.indice}" data-anuncio="${i}"
                 value="${esc(a.copy.saludoWhatsApp)}" />
        </label>
      </div>`,
        )
        .join(''),
    )
    .join('');
}

/* ------------------------------- etapa 4 ---------------------------------- */

function pintarEtapa4() {
  const p = estado.plan;

  const listaObjetos = [
    p.campana.crear
      ? `<li><strong>Campaña</strong> · <span class="mono">${esc(p.campana.nombre)}</span></li>`
      : `<li><strong>Campaña</strong> · se reutiliza <span class="mono">${esc(p.campana.nombre)}</span></li>`,
    ...p.conjuntos.flatMap((c) => [
      `<li><strong>Conjunto</strong> · <span class="mono">${esc(c.nombre)}</span> — ${esc(
        c.presupuesto.formateado,
      )}/día</li>`,
      ...c.anuncios.map(
        (a) =>
          `<li style="padding-left:18px"><strong>Anuncio ${a.numero}</strong> · <span class="mono">${esc(
            a.nombre,
          )}</span> — ${esc(a.archivo.nombre)}</li>`,
      ),
    ]),
  ].join('');

  $('#c4-vista').innerHTML = `
    <div class="bloque">
      <div class="casilla-estado">
        <span class="marca-check">✓</span>
        <div>
          <div class="titulo">
            Se crearán ${p.totales.objetos} objetos (${p.totales.conjuntos} conjunto(s),
            ${p.totales.anuncios} anuncio(s)), todos en BORRADOR (PAUSED)
          </div>
          <div class="sutil">
            Quedan visibles en Ads Manager pero no entregan impresiones ni gastan presupuesto.
            Les das play tú mismo cuando los hayas revisado allí.
          </div>
          <ul class="interruptores" style="color:var(--texto)">${listaObjetos}</ul>
        </div>
      </div>
    </div>

    <div class="bloque">
      <dl class="datos">
        ${fila('Cuenta', `${esc(p.cuenta.etiqueta)} · <span class="mono">${esc(p.cuenta.id)}</span>`, p.cuenta.nombre)}
        ${fila(
          'Presupuesto diario',
          `<span class="grande">${esc(p.totales.presupuestoFormateado)}</span>`,
          p.totales.conjuntos > 1
            ? `Suma de ${p.totales.conjuntos} conjuntos: ${p.conjuntos
                .map((c) => c.presupuesto.formateado)
                .join(' + ')}`
            : 'En el conjunto (ABO)',
        )}
        ${fila('Ubicación', p.conjuntos.map((c) => esc(c.segmentacion.ubicacion)).join('<br />'))}
        ${fila(
          'Edades / géneros',
          p.conjuntos.map((c) => `${esc(c.segmentacion.edades)} · ${esc(c.segmentacion.generos)}`).join('<br />'),
        )}
        ${fila('WhatsApp', `<span class="mono">+${esc(p.whatsapp.telefono)}</span>`, `Origen: ${p.whatsapp.origen}`)}
        ${fila('Expansión Advantage+', p.expansion.apagada ? '<span class="ok">DESACTIVADA</span>' : '<span class="mal">REVISAR</span>')}
        ${fila('Mejoras automáticas', `<span class="ok">${p.mejoras.total} en OPT_OUT</span>`, p.mejoras.rotacionDeTexto === 'OPT_IN' ? 'Solo text_optimizations en OPT_IN, para servir las 5 variantes escritas a mano' : '')}
        ${fila(
          'Opciones de texto',
          p.mejoras.modoTexto === 'multiple'
            ? `<span class="ok">5 textos + 5 títulos + 5 descripciones por anuncio</span>`
            : 'Un texto por anuncio',
          p.mejoras.modoTexto === 'multiple'
            ? 'Si Meta rechaza el formato se prueban otros envoltorios, pero ninguno baja el número de textos'
            : '',
        )}
        ${fila('Estado al crear', '<span class="ok grande">PAUSED</span>', 'El panel no puede crear en ACTIVE')}
      </dl>
    </div>`;

  const bloqueo =
    estado.plan.sinConexion || !estado.puedePublicar
      ? estado.motivoBloqueo ||
        'Este plan se calculó sin consultar Meta: los consecutivos son supuestos y crear con ellos pisaría ' +
          'números que ya existen. Pon las credenciales en el .env y recarga.'
      : '';

  $('#c4-bloqueo').innerHTML = bloqueo ? `<strong>No se puede enviar.</strong> ${esc(bloqueo)}` : '';
  mostrar('#c4-bloqueo', Boolean(bloqueo));
  $('#btn-enviar').disabled = Boolean(bloqueo);
}

/* ------------------------------- pasos ------------------------------------ */

function pintarPasos() {
  $$('.paso').forEach((b) => {
    const n = Number(b.dataset.ir);
    const aprobada = estado.aprobaciones[ETAPAS[n - 1]];
    b.classList.toggle('activo', n === estado.etapa);
    b.classList.toggle('hecho', aprobada && n !== estado.etapa);
    b.disabled = !aprobada && n !== estado.etapa && n > estado.etapa;
  });

  for (let n = 1; n <= 4; n += 1) mostrar(`#etapa-${n}`, n === estado.etapa);
  mostrar('#etapa-creando', false);
}

/* -------------------------------------------------------------------------- */
/*  Navegacion y aprobacion                                                   */
/* -------------------------------------------------------------------------- */

function irA(n) {
  estado.etapa = n;
  $$('.editor').forEach((f) => f.classList.add('oculto'));
  pintarPasos();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function aprobar(n) {
  estado.aprobaciones[ETAPAS[n - 1]] = true;
  irA(Math.min(4, n + 1));
}

/** Una edicion invalida esa etapa y todas las siguientes. */
function invalidarDesde(n) {
  for (let i = n; i <= 4; i += 1) estado.aprobaciones[ETAPAS[i - 1]] = false;
}

/* -------------------------------------------------------------------------- */
/*  Guardado de ediciones                                                     */
/* -------------------------------------------------------------------------- */

async function guardarEtapa1(evento) {
  evento.preventDefault();
  const f = $('#c1-form');
  const nombre = f.elements.nombre.value.trim();
  const compartir = f.elements.compartirPresupuesto.checked;

  if (compartir) {
    const sigue = await preguntar({
      titulo: 'Los conjuntos se prestarán presupuesto',
      tipo: 'aviso',
      cuerpo:
        '<p>Meta podrá mover hasta un <strong>20 %</strong> del presupuesto de un conjunto a otro que ' +
        'crea que rinde mejor.</p>' +
        '<p>Con un conjunto por producto, eso significa que el iPhone se puede comer la plata del ' +
        'Android. El reparto que apruebes dejará de ser exacto.</p>',
      si: 'Sí, permitirlo',
      no: 'No, dejarlo fijo',
    });
    if (!sigue) return;
  }

  estado.ajustes.campana = { compartirPresupuesto: compartir };
  if (nombre) estado.ajustes.campana.nombre = nombre;

  invalidarDesde(1);
  if (await planificar()) irA(1);
}

/** Esqueleto de ajustes con un hueco por conjunto y por anuncio. */
function esqueletoDeAjustes() {
  return estado.plan.conjuntos.map((c) => ({
    segmentacion: {},
    anuncios: c.anuncios.map(() => ({})),
  }));
}

/** Mezcla lo ya editado con lo nuevo, para no perder la otra etapa. */
function fusionarConjuntos(nuevos) {
  const previos = estado.ajustes.conjuntos || [];
  return nuevos.map((c, i) => ({
    ...(previos[i] || {}),
    ...c,
    segmentacion: { ...(previos[i]?.segmentacion || {}), ...(c.segmentacion || {}) },
    anuncios: (c.anuncios || []).map((a, j) => ({ ...(previos[i]?.anuncios?.[j] || {}), ...a })),
  }));
}

async function guardarEtapa2(evento) {
  evento.preventDefault();

  const conjuntos = esqueletoDeAjustes();

  $$('#c2-campos [data-campo]').forEach((campo) => {
    const i = Number(campo.dataset.conjunto);
    const clave = campo.dataset.campo;
    const valor = campo.value;

    if (['presupuestoDiarioCop', 'radioKm', 'edadMin', 'edadMax'].includes(clave)) {
      if (valor !== '') {
        if (clave === 'presupuestoDiarioCop') conjuntos[i][clave] = Number(valor);
        else conjuntos[i].segmentacion[clave] = Number(valor);
      }
    } else if (clave === 'modoGeo') {
      conjuntos[i].segmentacion.modoGeo = valor;
    } else {
      conjuntos[i][clave] = valor;
    }
  });

  $$('#c2-campos [data-grupo]').forEach((casilla) => {
    const i = Number(casilla.dataset.conjunto);
    const grupo = casilla.dataset.grupo;
    conjuntos[i].segmentacion[grupo] ??= [];
    if (casilla.checked) conjuntos[i].segmentacion[grupo].push(casilla.value);
  });

  // Los interruptores de expansión: marcada = activada.
  $$('#c2-campos [data-expansion]').forEach((casilla) => {
    const i = Number(casilla.dataset.conjunto);
    conjuntos[i].expansion ??= {};
    conjuntos[i].expansion[casilla.dataset.expansion] = casilla.checked;
  });

  const encendidos = conjuntos.flatMap((c, i) =>
    Object.entries(c.expansion || {})
      .filter(([, v]) => v)
      .map(([k]) => `${estado.plan.conjuntos[i].nombre}: ${k}`),
  );

  if (encendidos.length > 0) {
    const sigue = await preguntar({
      titulo: 'Vas a activar expansión de público',
      tipo: 'aviso',
      cuerpo:
        '<p>Meta dejará de respetar parte de la segmentación que apruebes:</p>' +
        `<ul>${encendidos.map((e) => `<li><code>${esc(e)}</code></li>`).join('')}</ul>` +
        '<p class="sutil">Es una decisión válida y a veces baja el costo por conversación, pero ' +
        'conviene que sea a propósito.</p>',
      si: 'Sí, activarla',
      no: 'No, dejarla apagada',
    });
    if (!sigue) return;
  }

  estado.ajustes.conjuntos = fusionarConjuntos(conjuntos);
  invalidarDesde(2);
  if (await planificar()) irA(2);
}

async function guardarEtapa3(evento) {
  evento.preventDefault();

  const conjuntos = esqueletoDeAjustes();

  $$('#c3-campos [data-campo]').forEach((campo) => {
    const i = Number(campo.dataset.conjunto);
    const j = Number(campo.dataset.anuncio);
    const clave = campo.dataset.campo;

    if (campo.tagName === 'TEXTAREA') {
      conjuntos[i].anuncios[j][clave] = campo.value
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    } else {
      conjuntos[i].anuncios[j][clave] = campo.value.trim();
    }
  });

  estado.ajustes.conjuntos = fusionarConjuntos(conjuntos);
  invalidarDesde(3);
  if (await planificar()) irA(3);
}

/* -------------------------------------------------------------------------- */
/*  Envio a Meta                                                              */
/* -------------------------------------------------------------------------- */

function apuntar(texto, clase = '') {
  const linea = document.createElement('div');
  if (clase) linea.className = clase;
  linea.textContent = texto;
  $('#bitacora').append(linea);
  $('#bitacora').scrollTop = $('#bitacora').scrollHeight;
}

const ETIQUETAS_PASO = {
  'campana:inicio': 'Creando la campaña…',
  'campana:ok': 'Campaña creada',
  'campana:reutilizada': 'Usando la campaña que ya existía',
  'adset:inicio': 'Creando el conjunto de anuncios…',
  'adset:ok': 'Conjunto creado',
  'asset:inicio': 'Subiendo el creativo…',
  'asset:ok': 'Creativo subido',
  'asset:video:procesando': 'Meta está procesando el video…',
  'creative:inicio': 'Creando el AdCreative…',
  'creative:ok': 'AdCreative creado',
  'ad:inicio': 'Creando el anuncio…',
  'ad:ok': 'Anuncio creado',
};

function manejarPaso(paso, detalle) {
  if (paso === 'asset:video:progreso') {
    const barra = '█'.repeat(Math.round(detalle.porcentaje / 4)).padEnd(25, '░');
    const ultima = $('#bitacora').lastElementChild;
    const texto = `  [${barra}] ${String(detalle.porcentaje).padStart(3)}%`;
    if (ultima && ultima.dataset.barra) ultima.textContent = texto;
    else {
      const l = document.createElement('div');
      l.className = 'l-sutil';
      l.dataset.barra = '1';
      l.textContent = texto;
      $('#bitacora').append(l);
    }
    return;
  }

  if (paso === 'asset:video:estado') {
    apuntar(`  estado del video: ${detalle.estado}${detalle.progreso !== undefined ? ` (${detalle.progreso}%)` : ''}`, 'l-sutil');
    return;
  }

  if (paso === 'creative:reintento') {
    apuntar(`  Meta rechazó «${detalle.intento}». Probando otro envoltorio, con los mismos textos.`, 'l-aviso');
    apuntar(`    ${detalle.motivo}`, 'l-sutil');
    return;
  }

  if (paso === 'creative:sin-declarar') {
    apuntar(`  AVISO: ${detalle.motivo}`, 'l-aviso');
    return;
  }

  const etiqueta = ETIQUETAS_PASO[paso];
  if (!etiqueta) return;

  const id = detalle && typeof detalle === 'object' ? detalle.id : detalle;
  apuntar(paso.endsWith(':ok') ? `✓ ${etiqueta}${id ? ` → ${id}` : ''}` : etiqueta, paso.endsWith(':ok') ? 'l-ok' : '');
}

async function enviarAMeta() {
  const p = estado.plan;

  const sigue = await preguntar({
    titulo: 'Enviar a Meta en borrador',
    tipo: 'pregunta',
    cuerpo:
      `<p>Se van a crear <strong>${p.totales.objetos} objetos</strong> en la cuenta ` +
      `<code>${esc(p.cuenta.etiqueta)}</code>, todos en estado <strong>PAUSED</strong>.</p>` +
      `<ul>
         <li>${p.campana.crear ? '1 campaña' : 'Se reutiliza la campaña'}</li>
         <li>${p.totales.conjuntos} conjunto(s) · ${esc(p.totales.presupuestoFormateado)} al día</li>
         <li>${p.totales.anuncios} anuncio(s)</li>
       </ul>` +
      '<p class="sutil">En borrador no entregan impresiones ni gastan presupuesto. Les das play tú ' +
      'desde Ads Manager cuando los hayas revisado allí.</p>',
    si: 'Enviar en borrador',
    no: 'Todavía no',
  });

  if (!sigue) return;

  estado.aprobaciones.final = true;

  $('#bitacora').innerHTML = '';
  $('#resultado').innerHTML = '';
  mostrar('#acciones-final', false);
  for (let n = 1; n <= 4; n += 1) mostrar(`#etapa-${n}`, false);
  mostrar('#etapa-creando', true);
  $('#creando-titulo').textContent = 'Creando en Meta…';
  window.scrollTo({ top: 0 });

  apuntar('Enviando el plan aprobado…', 'l-sutil');

  let respuesta;
  try {
    respuesta = await fetch('/api/publicar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firma: estado.firma, aprobaciones: estado.aprobaciones }),
    });
  } catch (error) {
    apuntar(`No se pudo contactar al servidor: ${error.message}`, 'l-mal');
    mostrar('#acciones-final', true);
    return;
  }

  if (!respuesta.ok || !respuesta.body) {
    let datos = { error: `Error ${respuesta.status}`, titulo: 'No se envió nada a Meta' };
    try {
      datos = { titulo: 'No se envió nada a Meta', ...(await respuesta.json()) };
    } catch {
      /* la respuesta no era JSON */
    }

    apuntar(datos.error, 'l-mal');
    $('#creando-titulo').textContent = 'No se envió nada';
    mostrar('#acciones-final', true);

    await modalDeError(datos);

    // Si el plan caducó hay que volver a planificar: quedarse aquí no sirve.
    if (datos.recalcular) {
      estado.aprobaciones = { campana: false, conjunto: false, anuncios: false, final: false };
      if (await planificar()) irA(1);
    }
    return;
  }

  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  let resto = '';

  while (true) {
    const { value, done } = await lector.read();
    if (done) break;

    resto += decodificador.decode(value, { stream: true });
    const trozos = resto.split('\n\n');
    resto = trozos.pop();

    for (const trozo of trozos) {
      const linea = trozo.split('\n').find((l) => l.startsWith('data: '));
      if (!linea) continue;
      procesarEvento(JSON.parse(linea.slice(6)));
    }
  }
}

function procesarEvento(evento) {
  switch (evento.tipo) {
    case 'inicio':
      apuntar(`Creando ${evento.objetos} objetos en estado PAUSED.`, 'l-sutil');
      break;

    case 'paso':
      manejarPaso(evento.paso, evento.detalle);
      break;

    case 'aviso':
      apuntar(evento.mensaje, 'l-aviso');
      break;

    case 'creado':
      apuntar('', '');
      apuntar('Todo creado. Releyendo en Meta para confirmar…', 'l-ok');
      estado.creado = evento;
      // Se pintan ya los identificadores: si la relectura falla, la pantalla
      // tiene que decir igualmente que quedo creado y con que id.
      pintarResultado(evento, []);
      break;

    case 'verificado':
      pintarResultado(estado.creado, evento.verificacion);
      break;

    case 'error':
      $('#creando-titulo').textContent = 'Falló la creación';
      apuntar(evento.mensaje, 'l-mal');
      if (evento.colgando?.length) {
        apuntar('Quedaron objetos a medias; revísalos o elimínalos en Ads Manager:', 'l-aviso');
        evento.colgando.forEach((c) => apuntar(`  · ${c}`, 'l-aviso'));
      }
      mostrar('#acciones-final', true);

      modal({
        titulo: 'Meta rechazó la creación',
        tipo: 'error',
        cuerpo:
          `<p>${esc(evento.mensaje.split('\n')[0])}</p>` +
          (evento.colgando?.length
            ? '<p><strong>Quedaron objetos a medias en Ads Manager.</strong> Revísalos o elimínalos:</p>' +
              `<ul>${evento.colgando.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}</ul>`
            : '<p class="sutil">No quedó nada a medias.</p>'),
        tecnico: evento.mensaje,
      });
      break;

    case 'fin':
      $('#creando-titulo').textContent = 'Listo — todo quedó en borrador';
      $('#resultado').insertAdjacentHTML(
        'beforeend',
        `<div class="alerta alerta-amarilla" style="margin-top:18px">
           <strong>El trabajo no está cerrado todavía</strong>
           <ul>${evento.recordatorio.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
         </div>`,
      );
      mostrar('#acciones-final', true);
      break;

    default:
      break;
  }
}

function pintarResultado(creado, verificacion = []) {
  if (!creado) return;

  const identificadores = [
    fila('Campaña', `<span class="mono">${esc(creado.campaignId || '—')}</span>`),
    ...(creado.conjuntos || []).map((c) =>
      fila(`Conjunto ${c.numero}`, `<span class="mono">${esc(c.adSetId || '—')}</span>`, `${c.nombre} · ${c.segmento}`),
    ),
    ...(creado.anuncios || []).map((a) =>
      fila(
        `Anuncio ${a.numero}${(creado.conjuntos || []).length > 1 ? ` (CJTO${a.conjunto + 1})` : ''}`,
        `<span class="mono">${esc(a.adId || '—')}</span>`,
        `creativo ${a.creativeId || '—'} · ${a.modoTexto === 'multiple' ? 'con las 5 opciones de texto' : 'texto simple'}`,
      ),
    ),
  ].join('');

  const filas = verificacion
    .map((v) => {
      const ok = v.problemas.length === 0;
      const textos = v.textos
        ? `${v.textos.textosPrincipales} textos · ${v.textos.titulos} títulos · ${v.textos.descripciones} descripciones`
        : '';
      const mejoras = v.mejoras
        ? `${v.mejoras.apagadas} mejoras declaradas${v.mejoras.encendidas.length ? ` · ENCENDIDAS: ${v.mejoras.encendidas.join(', ')}` : ''}`
        : '';

      return fila(
        v.tipo,
        `<span class="${ok ? 'ok' : 'mal'}">${ok ? '✓' : '✗'} ${esc(v.estado)}</span> ` +
          `<span class="mono sutil">${esc(v.id)}</span>` +
          (v.destino ? `<span class="nota">destino: ${esc(v.destino)}</span>` : '') +
          (v.radio ? `<span class="nota">ubicación: ${esc(v.radio)}</span>` : '') +
          (textos ? `<span class="nota">${esc(textos)}</span>` : '') +
          (mejoras ? `<span class="nota">${esc(mejoras)}</span>` : '') +
          v.problemas.map((p) => `<span class="nota mal">${esc(p)}</span>`).join(''),
        v.nombre,
      );
    })
    .join('');

  const degradados = (creado.anuncios || []).filter((a) => a.rechazos && a.rechazos.length > 0);

  $('#resultado').innerHTML = `
    <div class="bloque" style="margin-top:20px">
      <h3>Creado en Ads Manager</h3>
      <dl class="datos">${identificadores}</dl>
    </div>
    ${
      filas
        ? `<div class="bloque">
             <h3>Confirmado leyendo de vuelta en Meta</h3>
             <dl class="datos">${filas}</dl>
           </div>`
        : ''
    }
    ${
      degradados.length
        ? `<div class="alerta alerta-amarilla">
             <strong>Hubo reintentos</strong>
             <ul>${degradados
               .map(
                 (a) =>
                   `<li>${esc(a.nombre)} se creó con: ${esc(a.escalon)}.<br />` +
                   `<span class="sutil">${a.rechazos.map(esc).join('<br />')}</span></li>`,
               )
               .join('')}</ul>
           </div>`
        : ''
    }`;
}

/* -------------------------------------------------------------------------- */
/*  Arranque                                                                  */
/* -------------------------------------------------------------------------- */

function conectar() {
  $$('[data-aprobar]').forEach((b) => b.addEventListener('click', () => aprobar(Number(b.dataset.aprobar))));
  $$('[data-ir]').forEach((b) => b.addEventListener('click', () => irA(Number(b.dataset.ir))));

  $$('[data-editar]').forEach((b) =>
    b.addEventListener('click', () => {
      const n = b.dataset.editar;
      $(`#c${n}-form`).classList.toggle('oculto');
    }),
  );

  $$('[data-cancelar-edicion]').forEach((b) =>
    b.addEventListener('click', () => {
      $(`#c${b.dataset.cancelarEdicion}-form`).classList.add('oculto');
      pintarTodo();
    }),
  );

  $$('[data-cancelar]').forEach((b) =>
    b.addEventListener('click', async () => {
      const sigue = await preguntar({
        titulo: '¿Descartar y volver al inicio?',
        tipo: 'pregunta',
        cuerpo:
          '<p>No se ha enviado <strong>nada</strong> a Meta, así que no queda ningún objeto creado.</p>' +
          '<p class="sutil">Se pierden los cambios que hayas hecho en las etapas.</p>',
        si: 'Sí, descartar',
        no: 'Seguir aquí',
      });
      if (sigue) reiniciar();
    }),
  );

  $$('[data-reiniciar]').forEach((b) => b.addEventListener('click', reiniciar));

  $('#c1-form').addEventListener('submit', guardarEtapa1);
  $('#c2-form').addEventListener('submit', guardarEtapa2);
  $('#c3-form').addEventListener('submit', guardarEtapa3);
  $('#btn-enviar').addEventListener('click', enviarAMeta);

  $('#dictado-form').addEventListener('submit', interpretar);

  // Los ejemplos rotan: cada clic pone el siguiente en el campo.
  let siguienteEjemplo = 0;
  $('#btn-ejemplos').addEventListener('click', () => {
    $('#dictado').value = EJEMPLOS[siguienteEjemplo % EJEMPLOS.length];
    siguienteEjemplo += 1;
    $('#dictado').focus();
  });
}

function reiniciar() {
  estado.plan = null;
  estado.firma = '';
  estado.creado = null;
  estado.borrador = '';
  mostrar('#lectura', false);
  mostrar('#pantalla-asistente', false);
  mostrar('#pantalla-inicio', true);
  window.scrollTo({ top: 0 });
  cargarInicio();
}

conectar();
cargarInicio();
