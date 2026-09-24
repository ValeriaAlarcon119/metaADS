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
  // El objetivo se elige en la primera pantalla, antes que nada.
  objetivo: '',
  catalogo: [],
  regiones: [],
  tiposRegionales: [],
  sedesPorRegion: {},
  region: '',
  tipoRegional: '',
  // Se pone en true solo cuando alguien confirma el aviso de nomenclatura.
  nombresForzados: false,
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
/*  Tema claro y oscuro                                                       */
/* -------------------------------------------------------------------------- */
/**
 *  Arranca con el que tenga puesto el sistema y recuerda la eleccion. El
 *  atributo va en <html>, no en <body>, para que el color de fondo del
 *  navegador cambie tambien y no se vea un destello blanco al recargar.
 */

function temaGuardado() {
  try {
    return localStorage.getItem('celred-tema');
  } catch {
    return null; // modo privado o almacenamiento bloqueado
  }
}

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;

  const icono = $('#btn-tema')?.querySelector('use');
  if (icono) icono.setAttribute('href', tema === 'claro' ? '#ico-luna' : '#ico-tema');

  const boton = $('#btn-tema');
  if (boton) {
    boton.title = tema === 'claro' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  }

  try {
    localStorage.setItem('celred-tema', tema);
  } catch {
    /* si no se puede guardar, al menos funciona en esta sesion */
  }
}

function arrancarTema() {
  const prefiereClaro = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  aplicarTema(temaGuardado() || (prefiereClaro ? 'claro' : 'oscuro'));

  $('#btn-tema')?.addEventListener('click', () => {
    aplicarTema(document.documentElement.dataset.tema === 'claro' ? 'oscuro' : 'claro');
  });
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
  let datos;
  try {
    datos = await res.json();
  } catch {
    datos = {};
  }

  if (!res.ok || datos.ok === false) {
    // "Error 500" no le sirve a nadie. Si el servidor no mando un motivo, al
    // menos se dice qué salió mal en castellano.
    const error = new Error(datos.error || mensajePorCodigo(res.status));
    // Se guardan titulo y detalle tecnico para que el modal los pueda usar.
    error.datos = { titulo: datos.titulo || tituloPorCodigo(res.status), ...datos, error: datos.error || mensajePorCodigo(res.status) };
    throw error;
  }
  return datos;
}

/** Qué significa cada código HTTP, dicho para una persona. */
function mensajePorCodigo(codigo) {
  const porCodigo = {
    400: 'El servidor rechazó la petición, pero no dijo por qué. Revisa la consola donde corre npm run panel.',
    403: 'El servidor no permite esa operación.',
    404: 'Esa dirección no existe en el panel. Puede que el servidor esté desactualizado: párelo y vuelve a correr npm run panel.',
    409: 'Algo cambió mientras trabajabas. Vuelve a empezar desde la etapa 1.',
    500: 'El servidor falló por dentro. El detalle está en la consola donde corre npm run panel.',
  };
  return porCodigo[codigo] || `El servidor respondió ${codigo} y no dijo nada más.`;
}

function tituloPorCodigo(codigo) {
  if (codigo === 404) return 'El panel no reconoce esa dirección';
  if (codigo === 409) return 'Hay que volver a empezar';
  if (codigo >= 500) return 'Falló el servidor';
  return 'No se pudo continuar';
}

/** Fila de una lista de definiciones. */
const fila = (etiqueta, valor, nota = '') =>
  `<dt>${esc(etiqueta)}</dt><dd>${valor}${nota ? `<span class="nota">${esc(nota)}</span>` : ''}</dd>`;

/* -------------------------------------------------------------------------- */
/*  Pantalla 0: elegir campana                                                */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Paso 1: el objetivo                                                       */
/* -------------------------------------------------------------------------- */

async function cargarObjetivos() {
  const datos = await pedir('/api/objetivos');
  estado.catalogo = datos.catalogo;
  estado.regiones = datos.regiones;
  estado.tiposRegionales = datos.tiposRegionales;
  estado.sedesPorRegion = datos.sedesPorRegion || {};
  if (!estado.objetivo) estado.objetivo = datos.porDefecto;
  pintarObjetivos();
}

/** La ficha de un objetivo cualquiera, por código. */
function fichaDeObjetivo(codigo) {
  return estado.catalogo.flatMap((o) => o.opciones).find((x) => x.codigo === codigo) || null;
}

/** La ficha del objetivo elegido, o null. */
function objetivoElegido() {
  return fichaDeObjetivo(estado.objetivo);
}

/**
 * La región que cubre una sede, para proponerla sola al pasar a un objetivo
 * regional. Si la sede sale en varias (Pasto está en PASTO y en NARINO) se
 * queda con la más ajustada, que es la que menos tiendas tiene.
 */
function regionDeLaSede(sede) {
  const candidatas = Object.entries(estado.sedesPorRegion || {})
    .filter(([, sedes]) => sedes.includes(sede))
    .sort((a, b) => a[1].length - b[1].length);
  return candidatas[0]?.[0] || '';
}

function pintarObjetivos() {
  $('#objetivos').innerHTML = estado.catalogo
    .map((o) => {
      // Un objetivo que Celred no puede usar sale igual, apagado y con el
      // motivo. Esconderlo dejaria la duda de por que no esta.
      if (!o.disponible) {
        return `
        <div class="objetivo" disabled>
          <div class="objetivo-cabeza">
            <span class="objetivo-nombre">${esc(o.etiqueta)}</span>
            <span class="sello sello-gris">NO DISPONIBLE</span>
          </div>
          <div class="objetivo-para">${esc(o.para)}</div>
          <div class="objetivo-para"><strong>${esc(o.porQueNo)}</strong></div>
        </div>`;
      }

      const alguna = o.opciones.some((x) => x.codigo === estado.objetivo);

      return `
        <div class="objetivo ${alguna ? 'elegido' : ''}">
          <div class="objetivo-cabeza">
            <span class="objetivo-nombre">${esc(o.etiqueta)}</span>
            <span class="tecnico"><code>${esc(o.codigo)}</code></span>
          </div>
          <div class="objetivo-para">${esc(o.para)}</div>
          <div class="objetivo-opciones">
            ${o.opciones
              .map((x) => {
                const elegida = x.codigo === estado.objetivo;
                return `
                <button type="button" class="objetivo-opcion ${elegida ? 'elegida' : ''}"
                        data-objetivo="${esc(x.codigo)}">
                  <span class="marca-elegido">${elegida ? '●' : '○'}</span>
                  <span>
                    <b>${esc(x.etiqueta)}</b>
                    <span class="sutil">${esc(x.queConsigue)}</span>
                    <span class="sutil">
                      Prefijo <code>${esc(x.prefijo)}#</code> ·
                      ${x.usaWhatsApp ? 'usa WhatsApp' : 'sin WhatsApp'} ·
                      ${x.ensayado ? '✓ ensayado en la cuenta' : '⚠ sin ensayar'}
                    </span>
                  </span>
                </button>`;
              })
              .join('')}
          </div>
        </div>`;
    })
    .join('');

  // Una campana regional (R#) necesita region y tipo: sin ellos el nombre no
  // se puede armar. Solo aparece cuando hace falta.
  const ficha = objetivoElegido();
  if (ficha?.ambito === 'regional') {
    const opciones = (lista, actual, texto = (v) => v) =>
      lista
        .map((v) => {
          const codigo = typeof v === 'string' ? v : v.codigo;
          return `<option value="${esc(codigo)}"${codigo === actual ? ' selected' : ''}>${esc(texto(v))}</option>`;
        })
        .join('');

    $('#objetivos').insertAdjacentHTML(
      'beforeend',
      `<div class="editor" style="grid-column:1/-1;margin:4px 0 0">
         <h3>Esta campaña es regional</h3>
         <p class="pista">
           Las regionales se nombran <code>R# | REGION | TIPO | DDMMAA</code>, así que hay que decir
           la región y el tipo.
         </p>
         <div class="rejilla">
           <label>Región
             <select id="region">${opciones(estado.regiones, estado.region)}</select></label>
           <label>Tipo
             <select id="tipo-regional">${opciones(
               estado.tiposRegionales,
               estado.tipoRegional,
               (v) => `${v.codigo} — ${v.que}`,
             )}</select></label>
         </div>
       </div>`,
    );

    $('#region').addEventListener('change', (e) => {
      estado.region = e.target.value;
    });
    $('#tipo-regional').addEventListener('change', (e) => {
      estado.tipoRegional = e.target.value;
    });

    estado.region ||= estado.regiones[0];
    estado.tipoRegional ||= estado.tiposRegionales[0].codigo;
  }

  $$('[data-objetivo]').forEach((b) =>
    b.addEventListener('click', () => elegirObjetivo(b.dataset.objetivo)),
  );
}

async function elegirObjetivo(codigo) {
  const ficha = estado.catalogo.flatMap((o) => o.opciones).find((x) => x.codigo === codigo);

  // Un objetivo sin ensayar se puede elegir, pero avisando: lo que no puede
  // es que alguien lo use creyendo que esta comprobado.
  if (ficha && !ficha.ensayado) {
    const sigue = await preguntar({
      titulo: `"${ficha.etiqueta}" no se ha ensayado todavía`,
      tipo: 'aviso',
      cuerpo:
        `<p>${esc(ficha.notaDeEnsayo)}</p>` +
        '<p>Puedes usarlo, pero <strong>ensáyalo antes de crear</strong>: manda los parámetros a Meta ' +
        'y te dice si los acepta, <strong>sin crear nada</strong>.</p>' +
        `<div class="modal-formato"><div><b>Comando</b><code>npm run validar &lt;campaña&gt;</code></div></div>` +
        `<p class="sutil">El único ensayado contra esta cuenta es «Mensajes a WhatsApp».</p>`,
      si: 'Usarlo igual',
      no: 'Elegir otro',
    });
    if (!sigue) return;
  }

  estado.objetivo = codigo;
  pintarObjetivos();
}

/* -------------------------------------------------------------------------- */
/*  Pantalla 0: elegir campana                                                */
/* -------------------------------------------------------------------------- */

async function cargarInicio() {
  cargando(true);
  try {
    await cargarObjetivos();
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
  estado.nombresForzados = false;
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
    const r = await pedir('/api/interpretar', {
      method: 'POST',
      body: JSON.stringify({ texto, objetivo: estado.objetivo || undefined }),
    });
    pintarLectura(r);

    // Si la orden dice el objetivo ("objetivo: ventas"), manda la orden: el
    // selector se mueve solo y, si es regional, toma la region de la sede.
    if (r.entendido && r.lectura?.objetivo && r.lectura.objetivo !== estado.objetivo) {
      estado.objetivo = r.lectura.objetivo;
      if (r.lectura.region) estado.region = r.lectura.region;
      pintarObjetivos();
    }

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

/** Qué escribir, cuando la frase no se entendió y no hay nada concreto que decir. */
function ayudaDelDictado() {
  return `
    <p>Necesito dos cosas: <strong>la sede</strong> y <strong>el modelo de cada equipo</strong>
       (o la ruta del archivo, con el modelo en el nombre).</p>
    <div class="modal-formato">
      <div><b>Así</b><code>campaña para neiva con infinix hot 60 pro a crédito</code></div>
      <div><b>O así</b><code>campaña para victoria con iphone 13 de contado objetivo: mensajes</code></div>
      <div><b>Con rutas</b><code>campaña para zafiro a crédito archivo: creativos/zafiro/samsunga17-zafiro.jpg</code></div>
    </div>
    <p><strong>Orden completa</strong>, un dato por renglón:</p>
    <pre class="orden-estructurada">sede: Victoria
objetivo: mensajes
pago: contado
presupuesto: 30000
archivos:
  C:\ruta\a\iphone13-victoria.png
  creativos/victoria/infinixhot60pro-victoria.mp4</pre>
    <p class="sutil">
      El modelo es obligatorio: «de android» o «de iphone» solos no bastan. Si das la ruta, el
      equipo (y si es iPhone o Android) se lee del <strong>nombre del archivo</strong>.
      Objetivos: mensajes, clientes potenciales (leads), ventas, reconocimiento, tráfico.
      Una ruta con espacios va entre comillas o en su propio renglón bajo «archivos:».
    </p>`;
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
    const problemas = r.problemas || [];
    const ambiguo = r.lectura?.ambiguo || [];

    caja.className = 'alerta alerta-amarilla';
    caja.innerHTML =
      '<strong>Me falta algo para armar la campaña</strong>' +
      ((r.lectura?.productos || []).length
        ? `<p>Equipos que sí reconocí: ${r.lectura.productos.map((p) => `<code>${esc(p)}</code>`).join(' · ')}</p>`
        : '') +
      repartoPrevisto(r.lectura) +
      (problemas.length
        ? `<ul>${problemas.map((p) => `<li>${esc(p).replace(/\n/g, '<br />')}</li>`).join('')}</ul>`
        : '<p>No conseguí entender la frase.</p>') +
      // Cuando la sede es ambigua, los botones resuelven el problema de un
      // clic en vez de obligar a reescribir la frase entera.
      (ambiguo.length
        ? `<p>¿Cuál de estas?</p><div class="acciones">${ambiguo
            .map((s) => `<button class="btn" data-sede="${esc(s)}">${esc(s)}</button>`)
            .join('')}</div>`
        : '') +
      (problemas.length || ambiguo.length ? '' : ayudaDelDictado()) +
      ((r.avisos || []).length ? `<p class="sutil">${r.avisos.map(esc).join('<br />')}</p>` : '');

    // Elegir la sede reescribe la frase y vuelve a interpretar.
    $$('#lectura [data-sede]').forEach((b) =>
      b.addEventListener('click', () => {
        const ciudad = r.lectura.ciudad || '';
        const texto = $('#dictado').value;
        $('#dictado').value = ciudad
          ? texto.replace(new RegExp(`\\b${ciudad}\\b`, 'i'), `sede ${b.dataset.sede}`)
          : `${texto} sede ${b.dataset.sede}`;
        $('#dictado-form').requestSubmit();
      }),
    );
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

async function planificar({ nombresForzados = estado.nombresForzados } = {}) {
  cargando(true);
  try {
    const datos = await pedir('/api/plan', {
      method: 'POST',
      body: JSON.stringify({
        campana: estado.borrador ? undefined : estado.campana,
        borrador: estado.borrador || undefined,
        ajustes: estado.ajustes,
        nombresForzados,
        objetivo: estado.objetivo || undefined,
        region: estado.region || undefined,
        tipoRegional: estado.tipoRegional || undefined,
      }),
    });

    estado.plan = datos.plan;
    estado.firma = datos.plan.firma;
    pintarTodo();
    return true;
  } catch (error) {
    cargando(false);
    const datos = error.datos || { error: error.message };

    // La nomenclatura es una regla de Celred, no de Meta. Incumplirla es una
    // decision que puede tomar quien esta delante; lo que no puede es pasar
    // en silencio. Por eso se ofrece continuar en vez de solo cerrar.
    if (datos.tipo === 'nomenclatura') {
      const seguir = await modalDeNomenclatura(datos);
      if (seguir) {
        estado.nombresForzados = true;
        return planificar({ nombresForzados: true });
      }
      return false;
    }

    await modalDeError(datos);
    return false;
  } finally {
    cargando(false);
  }
}

/**
 * El aviso de nomenclatura. No bloquea: enseña que esta mal, con que compararlo
 * y deja elegir.
 */
function modalDeNomenclatura(datos) {
  const nombres = datos.nombres || [];

  const bloques = nombres.length
    ? nombres
        .map(
          (n) => `
        <p><strong>Como ${esc(n.que)}:</strong> <code>${esc(n.nombre)}</code></p>
        <ul>${n.problemas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        <div class="modal-formato">
          <div><b>Formato</b><code>${esc(n.formato)}</code></div>
          <div class="ejemplo"><b>Ejemplo</b><code>${esc(n.ejemplo)}</code></div>
        </div>`,
        )
        .join('')
    : `<p>${esc(datos.error).replace(/\n/g, '<br />')}</p>`;

  return modal({
    titulo: 'Este nombre no cumple la nomenclatura de Celred',
    tipo: 'aviso',
    cuerpo:
      bloques +
      '<p class="sutil">Puedes crearlo así de todas formas. Meta lo acepta sin problema — la ' +
      'nomenclatura es una regla interna, y quedará anotado que se creó fuera de ella.</p>',
    tecnico: datos.tecnico || datos.error,
    botones: [
      { texto: 'Volver a corregir', valor: false },
      { texto: 'Continuar con este nombre', valor: true, clase: 'btn-primario' },
    ],
  });
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

/**
 * Caja de resumen: enseña las dos primeras líneas y deja el resto detrás de
 * un botón que abre el modal.
 *
 * Antes se volcaba la lista entera aquí arriba. Con siete avisos la cabecera
 * empujaba la etapa fuera de pantalla y había que hacer scroll para llegar a
 * lo que de verdad se está revisando. Lo que importa es saber que HAY avisos
 * y cuántos; leerlos con calma es otra cosa, y para eso está el modal.
 *
 * @param {object} o
 * @param {string}   o.selector
 * @param {string}   o.clase        alerta-amarilla | alerta-verde | ...
 * @param {string}   o.titulo
 * @param {string[]} o.lineas       HTML ya escapado por quien llama
 * @param {string}   o.tituloModal
 * @param {'error'|'aviso'|'pregunta'|'ok'} o.tipoModal
 */
const LINEAS_EN_EL_RESUMEN = 2;

function pintarCajaResumen({ selector, clase, titulo, lineas, tituloModal, tipoModal }) {
  const caja = $(selector);
  mostrar(selector, lineas.length > 0);
  if (lineas.length === 0) return;

  const visibles = lineas.slice(0, LINEAS_EN_EL_RESUMEN);
  const ocultas = lineas.length - visibles.length;

  caja.className = `alerta ${clase}`;
  caja.innerHTML =
    '<div class="alerta-texto">' +
    `<strong>${esc(titulo)}</strong>` +
    `<ul class="alerta-resumen">${visibles.map((l) => `<li>${l}</li>`).join('')}</ul>` +
    (ocultas > 0
      ? '<div class="alerta-mas"><button type="button" class="btn btn-mini" data-ver-todo>' +
        `Ver ${lineas.length === 1 ? 'el detalle' : `los ${lineas.length} completos`}` +
        ` (${ocultas} más)</button></div>`
      : '') +
    '</div>';

  const boton = caja.querySelector('[data-ver-todo]');
  if (boton) {
    boton.addEventListener('click', () =>
      modal({
        titulo: tituloModal,
        tipo: tipoModal,
        cuerpo: `<ul class="lista-modal">${lineas.map((l) => `<li>${l}</li>`).join('')}</ul>`,
      }),
    );
  }
}

function pintarAvisos() {
  const avisos = estado.plan.avisos || [];
  pintarCajaResumen({
    selector: '#avisos',
    clase: 'alerta-amarilla',
    titulo: avisos.length === 1 ? '1 aviso' : `${avisos.length} avisos`,
    lineas: avisos.map((a) => esc(a)),
    tituloModal: avisos.length === 1 ? 'El aviso del plan' : `Los ${avisos.length} avisos del plan`,
    tipoModal: 'aviso',
  });
}

function pintarCambios() {
  const cambios = estado.plan.cambios || [];
  pintarCajaResumen({
    selector: '#cambios',
    clase: 'alerta-verde',
    titulo:
      cambios.length === 1 ? '1 cambio hecho en el panel' : `${cambios.length} cambios hechos en el panel`,
    lineas: cambios.map(
      (c) =>
        `${esc(c.etapa)} · ${esc(c.campo)}: <code>${esc(c.antes)}</code> → <code>${esc(c.despues)}</code>`,
    ),
    tituloModal: 'Lo que cambiaste respecto a lo que calculó el sistema',
    tipoModal: 'ok',
  });
}

/* ------------------------------- etapa 1 ---------------------------------- */

function pintarEtapa1() {
  const p = estado.plan;
  const c = p.campana;

  const o = p.objetivo;

  // El prefijo y el ámbito salen del objetivo: una regional cuenta su R# por
  // región, no el C# de la sede. Son dos series independientes.
  const pre = o.prefijo;
  const donde = o.ambito === 'regional' ? o.region : p.sede.codigo;

  const consecutivo = c.consecutivo
    ? (c.consecutivo.maximo
        ? `Última de ${donde}: ${pre}${c.consecutivo.maximo} → se crea ${pre}${c.consecutivo.siguiente}`
        : `No hay ninguna ${pre}# previa de ${donde} → se arranca en ${pre}1`) +
      ` (${c.consecutivo.previas} previas entre ${c.consecutivo.revisadas} campañas revisadas)`
    : 'Se cuelga de una campaña que ya existe.';
  const fuera = (p.nombresFueraDeManual || []).some((n) => n.nombre === c.nombre);

  const cajaObjetivo = `
    <div class="casilla-estado ${o.ensayado ? '' : 'casilla-aviso'}" style="margin-bottom:22px">
      <span class="marca-check">${o.ensayado ? '✓' : '!'}</span>
      <div style="width:100%">
        <div class="titulo">Objetivo: ${esc(o.etiqueta)}</div>
        <div class="sutil">${esc(o.queConsigue)}</div>
        <ul class="interruptores" style="margin-top:9px">
          <li>En Ads Manager: <strong>${esc(o.enAdsManager)}</strong></li>
          <li>Prefijo del nombre: <code>${esc(o.prefijo)}#</code> — ${
            o.ambito === 'regional' ? 'campaña regional' : 'campaña de sede'
          }</li>
          <li>Número de WhatsApp: ${o.usaWhatsApp ? 'sí, hace falta' : 'no aplica a este objetivo'}</li>
        </ul>
        <div class="tecnico" style="margin-top:9px">
          <code>objective = ${esc(p.meta.objective)}</code> ·
          <code>optimization_goal = ${esc(p.meta.optimization_goal)}</code> ·
          <code>billing_event = ${esc(p.meta.billing_event)}</code>
          ${p.meta.destination_type ? ` · <code>destination_type = ${esc(p.meta.destination_type)}</code>` : ''}
        </div>
        ${
          o.ensayado
            ? ''
            : `<div style="margin-top:10px"><strong>Este objetivo no se ha ensayado todavía contra la cuenta real.</strong>
                 <span class="sutil">${esc(o.notaDeEnsayo)}</span></div>`
        }
      </div>
    </div>`;

  $('#c1-vista').innerHTML = `
    ${cajaObjetivo}
    <div class="bloque">
      <dl class="datos">
        ${fila(
          c.crear ? 'Campaña nueva' : 'Campaña existente',
          `<span class="grande mono ${fuera ? 'mal' : 'ok'}">${esc(c.nombre)}</span>` +
            (fuera
              ? '<span class="nota mal">⚠ Fuera de la nomenclatura de Celred. Se creará así porque se confirmó.</span>'
              : '<span class="nota ok">✓ Cumple la nomenclatura del manual v1.2</span>'),
          `Patrón del manual: ${c.patron}`,
        )}
        ${fila('Consecutivo', esc(consecutivo))}
        ${fila('Sede', `${esc(p.sede.codigo)} · ${esc(p.sede.nombre)} (${esc(p.sede.ciudad)})`, `Distintivo ${p.sede.dist}, va en el conjunto y en los anuncios`)}
        ${fila(
          'Cuenta publicitaria',
          `<strong>${esc(p.cuenta.nombre || p.cuenta.etiqueta)}</strong>` +
            `<span class="nota mono">${esc(p.cuenta.etiqueta)} · ${esc(p.cuenta.id)}</span>`,
          `Elegida por ${p.cuenta.origen}`,
        )}
        ${fila(
          'Página de Facebook',
          p.cuenta.paginaNombre
            ? `<strong>${esc(p.cuenta.paginaNombre)}</strong>` +
              `<span class="nota mono">${esc(p.cuenta.paginaId)}</span>`
            : `<span class="mono">${esc(p.cuenta.paginaId || '—')}</span>` +
              (p.cuenta.paginaError
                ? `<span class="nota mal">No se pudo leer su nombre: ${esc(p.cuenta.paginaError)}</span>`
                : ''),
          'Es la que publica el anuncio',
        )}
        ${fila('Presupuesto en la campaña', '<span class="ok">NINGUNO (ABO)</span>', 'El presupuesto vive en el conjunto, punto 9 del manual')}
      </dl>
    </div>`;

  rellenarFormularioEtapa1();
}

/** El formulario de la etapa 1: objetivo, región, nombre y reparto. */
function rellenarFormularioEtapa1() {
  const p = estado.plan;
  const f = $('#c1-form');

  f.elements.nombre.value = p.campana.nombre;
  f.elements.compartirPresupuesto.checked = Boolean(p.expansion.repartoDePresupuesto.encendido);

  // El objetivo se cambia aquí mismo, agrupado como en Ads Manager.
  f.elements.objetivo.innerHTML = estado.catalogo
    .filter((g) => g.disponible)
    .map(
      (g) =>
        `<optgroup label="${esc(g.etiqueta)}">` +
        g.opciones
          .map(
            (o) =>
              `<option value="${esc(o.codigo)}"${o.codigo === p.objetivo.codigo ? ' selected' : ''}>` +
              `${esc(o.etiqueta)} — ${esc(o.prefijo)}#${o.ensayado ? '' : '  (sin ensayar)'}</option>`,
          )
          .join('') +
        '</optgroup>',
    )
    .join('');

  // Región y tipo solo cuando el objetivo elegido es regional.
  const regional = p.objetivo.ambito === 'regional';
  mostrar('#c1-regional', regional);

  // El patrón cambia con el objetivo: no es lo mismo una campaña de sede que
  // una regional, y enseñar el de sede cuando ya es regional despista.
  const pre = p.objetivo.prefijo;
  $('#c1-patron').innerHTML =
    `Patrón del manual: <code>${
      regional ? `${pre}# | REGION | TIPO | DDMMAA` : `${pre}# | SEDE | DDMMAA`
    }</code>. Si no cumple, el sistema lo rechaza y no se crea nada. ` +
    `El <code>${pre}#</code> que pongas aquí se usa también en el nombre del conjunto.`;

  if (regional) {
    const opciones = (lista, actual, texto = (v) => v) =>
      lista
        .map((v) => {
          const codigo = typeof v === 'string' ? v : v.codigo;
          return `<option value="${esc(codigo)}"${codigo === actual ? ' selected' : ''}>${esc(texto(v))}</option>`;
        })
        .join('');

    f.elements.region.innerHTML = opciones(estado.regiones, p.objetivo.region);
    f.elements.tipoRegional.innerHTML = opciones(
      estado.tiposRegionales,
      p.objetivo.tipoRegional,
      (v) => `${v.codigo} — ${v.que}`,
    );

    // Las tiendas que entran en la región. Lo que se pauta no es una sede sino
    // todas estas, y eso tiene que verse antes de aprobar.
    const sedes = estado.sedesPorRegion?.[p.objetivo.region] || [];
    $('#c1-region-sedes').innerHTML = sedes.length
      ? `Cubre ${sedes.length === 1 ? 'la tienda' : `las ${sedes.length} tiendas`} de ` +
        `<strong>${esc(p.objetivo.region)}</strong>: ` +
        sedes.map((s) => `<code>${esc(s)}</code>`).join(' · ') +
        (sedes.includes(p.sede.codigo)
          ? ''
          : `<br />Ojo: la sede del plan (<code>${esc(p.sede.codigo)}</code>) no está en esta región.`)
      : `No hay tiendas registradas en <strong>${esc(p.objetivo.region)}</strong>.`;
  }
}

/**
 * Al cambiar el objetivo dentro del formulario, el nombre cambia con él: el
 * prefijo pasa de C# a R# (o al revés) y el consecutivo es OTRA serie — el C7
 * de Neiva no hace que la primera regional sea R8.
 *
 * Ese número solo lo sabe el servidor, que lo lee de Ads Manager, así que se
 * vuelve a planificar en vez de adivinarlo aquí. El formulario sigue abierto:
 * `pintarTodo` lo vuelve a rellenar con el nombre nuevo.
 */
async function cambiarObjetivoEnEtapa1(codigo) {
  if (!codigo || codigo === estado.plan.objetivo.codigo) return;

  const ficha = fichaDeObjetivo(codigo);
  const anterior = estado.plan.objetivo.codigo;
  estado.objetivo = codigo;

  // Un objetivo regional necesita región y tipo antes de poder planificar. Se
  // propone la región que cubre la sede del plan, que es lo que quien está
  // delante tenía en la cabeza; se puede cambiar en el selector de al lado.
  if (ficha?.ambito === 'regional') {
    estado.region ||= regionDeLaSede(estado.plan.sede.codigo) || estado.regiones[0];
    estado.tipoRegional ||= estado.tiposRegionales[0]?.codigo || '';
  }

  // Un nombre fijado a mano deja de valer: llevaba el prefijo del objetivo
  // anterior. Si no se borra aquí, el sistema seguiría mandando "C1 | NEIVA"
  // para una campaña que ya es regional.
  delete estado.ajustes.campana.nombre;
  delete estado.ajustes.campana.nombreAnterior;

  invalidarDesde(1);

  // Si el plan nuevo no sale (falta algo, o Meta rechaza la combinación), el
  // selector no puede quedarse enseñando un objetivo que no llegó a aplicarse.
  if (!(await planificar())) {
    estado.objetivo = anterior;
    rellenarFormularioEtapa1();
  }
}

/** Cambiar región o tipo también recalcula el nombre (R# | REGION | TIPO). */
async function cambiarRegionEnEtapa1() {
  const f = $('#c1-form');
  estado.region = f.elements.region?.value || estado.region;
  estado.tipoRegional = f.elements.tipoRegional?.value || estado.tipoRegional;

  delete estado.ajustes.campana.nombre;
  delete estado.ajustes.campana.nombreAnterior;

  invalidarDesde(1);
  await planificar();
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
              <div class="tecnico">
                <code>is_adset_budget_sharing_enabled</code> — ${r.encendido ? 'sí se comparte' : 'no se comparte'}
              </div>
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

  // Las veinte funciones van plegadas y agrupadas por lo que hacen. Un muro de
  // nombres técnicos en inglés no informa: ocupa.
  const mejoras = `
    <div class="casilla-estado">
      <span class="marca-check">✓</span>
      <div style="width:100%">
        <div class="titulo">Meta no va a tocar tus anuncios</div>
        <div class="sutil">
          Le he dicho que <strong>no</strong> a las ${p.mejoras.total} funciones con las que modifica
          los anuncios por su cuenta. Tu foto, tu video y tus textos salen tal como los apruebas aquí.
        </div>

        <details class="plegable">
          <summary>Ver las ${p.mejoras.total} funciones desactivadas</summary>
          <div class="plegable-cuerpo">
            ${(p.mejoras.grupos || [])
              .map(
                (g) => `
              <div class="grupo-mejoras">
                <h4>${esc(g.etiqueta)}</h4>
                <ul>
                  ${g.funciones
                    .map(
                      (f) =>
                        `<li><span class="no">✕</span> ${esc(f.que)}
                           <span class="tecnico"><code>${esc(f.campo)}</code></span></li>`,
                    )
                    .join('')}
                </ul>
              </div>`,
              )
              .join('')}
          </div>
        </details>

        ${
          p.mejoras.rotacionDeTexto === 'OPT_IN'
            ? `<div class="excepcion">
                 <strong>Con una excepción a propósito:</strong> le dejo <em>elegir entre tus 5 textos</em>
                 cuál enseña a cada persona. No escribe ni cambia nada — solo decide cuál de los que
                 escribiste tú va mejor. Sin esto, Meta serviría siempre el mismo y los otros cuatro
                 no se usarían.
                 <span class="tecnico"><code>text_optimizations = OPT_IN</code></span>
               </div>`
            : '<div class="sutil">Modo de texto simple: tampoco rota entre textos.</div>'
        }
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
          (a, i) => {
            const d = (campo) => `data-campo="${campo}" data-conjunto="${c.indice}" data-anuncio="${i}"`;
            return `
      <div class="editor-anuncio">
        <h3>Anuncio ${a.numero}${varios ? ` · ${esc(c.nombre)}` : ''}</h3>

        <label>
          Nombre del anuncio
          <input type="text" ${d('nombreManual')} value="${esc(a.nombre)}" />
          <span class="pista-campo">
            Se arma solo con lo de abajo. Si lo escribes a mano y no cumple el manual, te aviso y decides.
          </span>
        </label>

        <div class="rejilla">
          <label>
            Referencia <span class="sutil">— va en el nombre</span>
            <input type="text" ${d('referencia')} value="${esc(a.referencia)}" />
          </label>
          <label>
            Producto <span class="sutil">— va en los textos</span>
            <input type="text" ${d('producto')} value="${esc(a.producto)}" />
          </label>
          <label>
            Talento <span class="sutil">— opcional</span>
            <input type="text" ${d('talento')} value="${esc(a.talento || '')}"
                   list="talentos" placeholder="vacío si no sale nadie" />
          </label>
        </div>

${
          /-CONT$/.test(c.segmento)
            ? `<div class="aviso-precio">
          <b>⚠️ Producto de contado: el precio se escribe a mano.</b>
          Los anuncios de contado llevan el precio sí o sí. Escríbelo aquí y se pone solo en los textos donde dice
          <b>{PRECIO}</b>. Sin precio, la campaña no se deja crear.
          <label>
            Precio de contado (COP) <span class="sutil">— obligatorio, por ejemplo 1.999.000</span>
            <input type="text" inputmode="numeric" ${d('precioContado')}
                   value="${a.precioContado ? esc(Number(a.precioContado).toLocaleString('es-CO')) : ''}"
                   placeholder="Escribe el precio" />
          </label>
        </div>`
            : ''
        }
        <label>
          Textos principales <span class="sutil">— máximo ${lim.maxOpciones} opciones</span>
          <textarea ${d('textosPrincipales')} rows="14">${esc(a.copy.textosPrincipales.join(SEPARADOR_OPCIONES))}</textarea>
          <span class="pista-campo">Cada opción puede tener varios renglones. Las opciones se separan con una línea que tenga solo <b>———</b>.</span>
        </label>
        <label>
          Títulos <span class="sutil">— una por línea, hasta ${lim.titulos} caracteres</span>
          <textarea ${d('titulos')} rows="6">${esc(a.copy.titulos.join('\n'))}</textarea>
        </label>
        <label>
          Descripciones <span class="sutil">— una por línea, hasta ${lim.descripciones} caracteres</span>
          <textarea ${d('descripciones')} rows="6">${esc(a.copy.descripciones.join('\n'))}</textarea>
        </label>
        <label>
          Mensaje prellenado <span class="sutil">— lo escribe el cliente al abrir el chat</span>
          <input type="text" ${d('mensajePrellenado')} value="${esc(a.copy.mensajePrellenado)}" />
        </label>
        <label>
          Saludo previo <span class="sutil">— lo dice la tienda antes del chat</span>
          <input type="text" ${d('saludoWhatsApp')} value="${esc(a.copy.saludoWhatsApp)}" />
        </label>
      </div>`;
          },
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

  const bloqueo = (() => {
    if (p.sinAcceso) {
      return (
        `El token no tiene acceso a la cuenta ${p.cuenta.etiqueta} (${p.cuenta.id}). ` +
        'En Business Manager → Usuarios del sistema → Agregar activos, hay que asignarle esa cuenta ' +
        'publicitaria con permiso de «Administrar campañas», y la Página con permiso para crear anuncios.'
      );
    }
    if (p.sinConexion || !estado.puedePublicar) {
      return (
        estado.motivoBloqueo ||
        'Este plan se calculó sin consultar Meta: los consecutivos son supuestos y crear con ellos ' +
          'pisaría números que ya existen. Pon las credenciales en el .env y recarga.'
      );
    }
    return '';
  })();

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
  const p = estado.plan;

  const nombre = f.elements.nombre.value.trim();
  const compartir = f.elements.compartirPresupuesto.checked;
  const objetivo = f.elements.objetivo.value;

  // Al cambiar de objetivo el nombre automático cambia con él (C# ↔ R#), así
  // que si no lo han tocado a mano se deja recalcular.
  if (objetivo !== p.objetivo.codigo) estado.objetivo = objetivo;

  if (f.elements.region) estado.region = f.elements.region.value;
  if (f.elements.tipoRegional) estado.tipoRegional = f.elements.tipoRegional.value;

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

  // Solo se manda el nombre si de verdad lo cambiaron: si no, el sistema lo
  // recalcula, que es lo que hace falta al cambiar de objetivo.
  if (nombre && nombre !== p.campana.nombre) {
    estado.ajustes.campana.nombre = nombre;
    estado.ajustes.campana.nombreAnterior = p.campana.nombre;
  }

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

  // El nombre real de cada conjunto, para que la lista de cambios lo use.
  conjuntos.forEach((c, i) => {
    c.nombreActual = estado.plan.conjuntos[i]?.nombre || '';
  });

  estado.ajustes.conjuntos = fusionarConjuntos(conjuntos);
  invalidarDesde(2);
  if (await planificar()) irA(2);
}

/**
 * Los textos principales pueden tener varios renglones (la direccion va en su
 * propio renglon), asi que las opciones se separan con una linea "———" y no
 * con un salto de linea. Sin separador, cada renglon es una opcion.
 */
const SEPARADOR_OPCIONES = '\n———\n';

function partirOpciones(valor) {
  const texto = String(valor || '').replace(/\r/g, '');
  const trozos = /^\s*———\s*$/m.test(texto) ? texto.split(/^\s*———\s*$/m) : texto.split('\n');
  return trozos.map((t) => t.replace(/^\n+|\n+$/g, '').trim()).filter(Boolean);
}

async function guardarEtapa3(evento) {
  evento.preventDefault();

  const conjuntos = esqueletoDeAjustes();

  $$('#c3-campos [data-campo]').forEach((campo) => {
    const i = Number(campo.dataset.conjunto);
    const j = Number(campo.dataset.anuncio);
    const clave = campo.dataset.campo;

    if (clave === 'textosPrincipales') {
      conjuntos[i].anuncios[j][clave] = partirOpciones(campo.value);
    } else if (campo.tagName === 'TEXTAREA') {
      conjuntos[i].anuncios[j][clave] = campo.value
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    } else if (clave === 'precioContado') {
      // Vacio = no se toca. Se mandan solo los digitos.
      const digitos = campo.value.replace(/\D/g, '');
      if (digitos) conjuntos[i].anuncios[j][clave] = digitos;
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
      $('#creando-titulo').textContent = evento.nadaCreado ? 'Meta no acepta el plan' : 'Falló la creación';
      apuntar(evento.mensaje, 'l-mal');
      if (evento.detalle) apuntar(evento.detalle, 'l-aviso');
      if (evento.nadaCreado) apuntar('No se creó nada. Ads Manager quedó como estaba.', 'l-ok');
      if (evento.colgando?.length) {
        apuntar('Quedaron objetos a medias; revísalos o elimínalos en Ads Manager:', 'l-aviso');
        evento.colgando.forEach((c) => apuntar(`  · ${c}`, 'l-aviso'));
      }
      mostrar('#acciones-final', true);

      modal({
        titulo: evento.nadaCreado ? 'Meta no acepta el plan' : 'Meta rechazó la creación',
        tipo: 'error',
        cuerpo:
          `<p><strong>${esc(evento.mensaje.split('\n')[0])}</strong></p>` +
          // El "por que" de Meta, que es lo unico accionable. Sin esto el
          // modal decia solo "Invalid parameter".
          (evento.detalle ? `<p>${esc(evento.detalle)}</p>` : '') +
          (evento.codigo
            ? `<p class="sutil">Código ${esc(evento.codigo)}${
                evento.subcodigo ? ` · subcódigo ${esc(evento.subcodigo)}` : ''
              }</p>`
            : '') +
          (evento.nadaCreado
            ? '<p class="sutil">Se comprobó <strong>antes</strong> de crear, así que no se creó nada y no ' +
              'hay nada que limpiar en Ads Manager.</p>'
            : evento.colgando?.length
              ? '<p><strong>Quedaron objetos a medias en Ads Manager.</strong> Revísalos o elimínalos:</p>' +
                `<ul>${evento.colgando.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}</ul>`
              : '<p class="sutil">No quedó nada a medias.</p>'),
        tecnico: evento.tecnico || evento.mensaje,
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

/**
 * Enlaces a Ads Manager, para ir a ver lo que se acaba de crear.
 *
 * El `act=` de la URL lleva el numero de cuenta sin el prefijo "act_", y los
 * `selected_*_ids` dejan la tabla filtrada justo en lo nuestro. Sin esto hay
 * que buscar la campaña a mano entre todas las de la cuenta.
 */
function enlacesDeAdsManager(creado, plan) {
  const cuenta = String(plan?.cuenta?.id || '').replace(/^act_/, '');
  if (!cuenta || !creado.campaignId) return '';

  const base = 'https://adsmanager.facebook.com/adsmanager/manage';
  const campana = `${base}/campaigns?act=${cuenta}&selected_campaign_ids=${creado.campaignId}`;
  const conjuntos = `${base}/adsets?act=${cuenta}&selected_campaign_ids=${creado.campaignId}`;
  const anuncios = `${base}/ads?act=${cuenta}&selected_campaign_ids=${creado.campaignId}`;

  return `
    <div class="bloque" style="margin-top:20px">
      <h3>Verlo en Meta</h3>
      <p class="sutil">
        Se abre en Ads Manager, ya filtrado a esta campaña. Todo está en
        <strong>borrador</strong>: no entrega impresiones ni gasta hasta que alguien lo active
        a mano allí.
      </p>
      <div class="acciones">
        <a class="btn btn-relleno" href="${campana}" target="_blank" rel="noopener">Ver la campaña</a>
        <a class="btn" href="${conjuntos}" target="_blank" rel="noopener">Ver los conjuntos</a>
        <a class="btn" href="${anuncios}" target="_blank" rel="noopener">Ver los anuncios</a>
      </div>
    </div>`;
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
    ${enlacesDeAdsManager(creado, estado.plan)}
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

  // Por delegación y una sola vez: el contenido del formulario se vuelve a
  // pintar en cada plan, y enganchar los listeners ahí dentro los acumularía.
  $('#c1-form').addEventListener('change', (e) => {
    if (e.target.name === 'objetivo') return cambiarObjetivoEnEtapa1(e.target.value);
    if (e.target.name === 'region' || e.target.name === 'tipoRegional') {
      return cambiarRegionEnEtapa1();
    }
  });

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

arrancarTema();
conectar();
cargarInicio();
