#!/usr/bin/env node
/**
 * ============================================================================
 *  servidor.js — PANEL LOCAL DE APROBACION PASO A PASO
 * ============================================================================
 *  Ejecutar:
 *    npm run panel                 y abrir http://127.0.0.1:4317
 *    node servidor.js --puerto 5000
 *
 *  Es un asistente de cuatro etapas. En cada una se ve lo que se va a crear y
 *  se aprueba, se edita o se cancela:
 *
 *    1. Campana          nombre y objetivo
 *    2. Conjunto         presupuesto, geolocalizacion, WhatsApp de la sede y
 *                        el estado de la expansion Advantage+
 *    3. Anuncios         vista previa del archivo y los 5 textos, 5 titulos y
 *                        5 descripciones de cada anuncio
 *    4. Resumen final    y el unico boton que llama a Meta
 *
 *  DOS REGLAS DEL SERVIDOR
 *
 *  1. Solo escucha en 127.0.0.1. No se expone a la red: el proceso tiene un
 *     token con control total sobre las cuentas publicitarias y cualquiera que
 *     alcance el puerto podria crear anuncios. El token no sale nunca hacia el
 *     navegador.
 *
 *  2. Se crea EXACTAMENTE el plan que se aprobo. El plan aprobado se guarda en
 *     memoria con una firma; publicar solo acepta esa firma y usa ese mismo
 *     objeto. Si se edita cualquier cosa, la firma cambia y hay que volver a
 *     aprobar. Nada se crea en ACTIVE desde el panel: siempre borrador.
 * ============================================================================
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

import { planificarEstructura, crearEstructuraCampana, verificarEstructura } from './src/builder.js';
import { ensayarPlan, detalleDeMeta } from './src/ensayo.js';
import { describirTargeting, SEDES } from './src/targeting.js';
import { ACCESS_TOKEN, GRAPH_BASE, PAGE_ID, credencialesFaltantes, formatearMoneda } from './src/config.js';
import { SEGMENTOS, REGIONES, TIPOS_REGIONAL, SEDES_POR_REGION } from './src/nomenclatura.js';
import { listarCampanas, cargarCampana, LIMITES_COPY } from './src/campanas.js';
import { aplicarAjustes } from './src/ajustes.js';
import { interpretar } from './src/interprete.js';
import { listarParaLaInterfaz, catalogoParaLaInterfaz, OBJETIVO_POR_DEFECTO } from './src/objetivos.js';
import { RAIZ, CARPETA_CREATIVOS } from './src/creativos-sede.js';
import { MAX_OPCIONES_TEXTO } from './src/creatives.js';

/* ========================================================================== */
/*  Configuracion                                                             */
/* ========================================================================== */

const CARPETA_PANEL = join(RAIZ, 'panel');

/** Un plan aprobado caduca: los consecutivos que leyo pueden haber cambiado. */
const VIGENCIA_DEL_PLAN_MS = 30 * 60 * 1000;

/** Planes calculados en esta sesion, por firma. Solo en memoria. */
const planes = new Map();

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
  '.3gp': 'video/3gpp',
  '.avi': 'video/x-msvideo',
};

/* ========================================================================== */
/*  Utilidades HTTP                                                           */
/* ========================================================================== */

function responderJson(res, codigo, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    'Cache-Control': 'no-store',
  });
  res.end(texto);
}

function responderError(res, codigo, mensaje, extra = {}) {
  responderJson(res, codigo, { ok: false, error: mensaje, ...extra });
}

/**
 * Convierte un error en algo que la pantalla pueda enseñar bien.
 *
 * Los errores marcados con `amigable` ya vienen escritos para una persona: se
 * pasan tal cual con su titulo. Los demas se limpian de los prefijos tecnicos
 * ("builder: ", "campanas: ") que solo sirven para saber de que modulo salieron.
 */
function errorParaLaPantalla(error) {
  const crudo = String(error?.message || error);

  if (error?.amigable) {
    return { titulo: error.titulo || 'No se pudo continuar', error: crudo, amigable: true };
  }

  const sinPrefijo = crudo.replace(/^(builder|campanas|creatives|creativos-sede|targeting|config|lineas|nomenclatura):\s*/, '');

  return {
    titulo: 'No se pudo preparar la campana',
    error: sinPrefijo,
    amigable: false,
    // El original, por si hace falta para depurar. La pantalla lo esconde
    // detras de un "ver detalle tecnico".
    tecnico: crudo === sinPrefijo ? '' : crudo,
  };
}

async function leerCuerpo(req, maxBytes = 2 * 1024 * 1024) {
  const trozos = [];
  let total = 0;

  for await (const trozo of req) {
    total += trozo.length;
    if (total > maxBytes) throw new Error('El cuerpo de la peticion es demasiado grande.');
    trozos.push(trozo);
  }

  if (total === 0) return {};
  try {
    return JSON.parse(Buffer.concat(trozos).toString('utf8'));
  } catch {
    throw new Error('El cuerpo de la peticion no es JSON valido.');
  }
}

/* ========================================================================== */
/*  Preparacion del plan                                                      */
/* ========================================================================== */

/**
 * Firma estable de un plan. Cubre todo lo que se enseña en pantalla y todo lo
 * que se manda a Meta; deja fuera los avisos, que son texto explicativo.
 */
function firmarPlan(plan) {
  const resumen = {
    cuenta: plan.cuenta.id,
    sede: plan.sede.codigo,
    estado: plan.estado,
    objetivo: plan.objetivo.codigo,
    meta: plan.meta,
    campana: { crear: plan.campana.crear, id: plan.campana.id, nombre: plan.campana.nombre },
    whatsapp: plan.whatsapp.telefono,
    modoTexto: plan.modoTexto,
    conjuntos: plan.conjuntos.map((c) => ({
      nombre: c.nombre,
      presupuesto: c.presupuesto.unidadMenor,
      targeting: c.targeting,
      anuncios: c.anuncios.map((a) => ({
        nombre: a.nombre,
        archivo: a.archivo.ruta,
        bytes: a.archivo.bytes,
        copy: a.copy,
      })),
    })),
  };

  return createHash('sha256').update(JSON.stringify(resumen)).digest('hex').slice(0, 16);
}

/**
 * Campanas dictadas en lenguaje natural, por clave. Solo en memoria: no se
 * escribe ningun archivo hasta que la persona lo pida.
 */
const borradores = new Map();

/**
 * Carga la campana —de campanas/ o de un borrador dictado—, aplica los ajustes
 * del panel y planifica. No crea nada: `planificarEstructura` es solo lectura.
 */
/** Datos de la Pagina para la vista. Se rellena al planificar. */
let _paginaVista = { id: PAGE_ID, nombre: '', error: '' };

/**
 * Errores de Meta que significan "no tienes acceso", no "esta mal escrito".
 * Con estos no tiene sentido cortar: se planifica sin conexion y se explica.
 */
function esFaltaDeAcceso(error) {
  const m = String(error?.message || '');
  return (
    /\(#200\)/.test(m) ||
    /\(#10\)/.test(m) ||
    /has NOT grant/i.test(m) ||
    /permission/i.test(m) ||
    /Unsupported get request/i.test(m)
  );
}

/**
 * Planifica contra Meta y, si el token no alcanza la cuenta o la Pagina, lo
 * vuelve a intentar sin conexion.
 *
 * Es el punto 34 del encargo: cuando Meta no esta disponible, la interfaz
 * sigue sirviendo para revisar la campana entera — lo que no hace es fingir
 * que se podria crear.
 */
async function planificarConRespaldo(cfg) {
  try {
    return await planificarEstructura(cfg);
  } catch (error) {
    if (cfg.sinConexion || !esFaltaDeAcceso(error)) throw error;

    const plan = await planificarEstructura({ ...cfg, sinConexion: true });

    plan.avisos.unshift(
      'MODO REVISIÓN: el token no tiene acceso a esta cuenta publicitaria, así que no se pudo ' +
        'consultar nada en Meta. Todo lo que ves está calculado en local y el consecutivo C# es una ' +
        'suposición. No se puede crear nada hasta arreglar el acceso.',
      `Lo que dijo Meta: ${String(error.message).replace(/\s*refer to https?:\/\/\S+.*$/i, '')}`,
    );

    plan.sinAcceso = true;
    plan.motivoSinAcceso = String(error.message);
    return plan;
  }
}

async function prepararPlan({
  campana: nombreCampana,
  borrador,
  ajustes = {},
  sinMeta = false,
  nombresForzados = false,
  // El objetivo que se eligio en la primera pantalla. Si no viene, manda el
  // que traiga el archivo de la campana.
  objetivo = '',
  region = '',
  tipoRegional = '',
}) {
  const base = borrador
    ? borradores.get(borrador)
    : await cargarCampana(nombreCampana);

  if (!base) {
    throw new Error('El borrador dictado ya no esta en memoria. Vuelve a escribir lo que quieres.');
  }

  const { cfg, cambios, rechazados } = aplicarAjustes(base, ajustes);

  const plan = await planificarConRespaldo({
    ...cfg,
    objetivo: objetivo || cfg.objetivo,
    region: region || cfg.region || '',
    tipoRegional: tipoRegional || cfg.tipoRegional || '',
    // Desde el panel SIEMPRE borrador. Salir en vivo no se puede pedir por
    // HTTP: eso vive en la linea de comandos, con doble confirmacion.
    estado: 'PAUSED',
    permitirEnVivo: false,
    sinConexion: Boolean(sinMeta),
    simulado: cfg.simulado || {},
    // Solo lo manda el panel, y solo despues de que alguien haya visto el
    // aviso de nomenclatura y haya pulsado "continuar con este nombre".
    nombresForzados: Boolean(nombresForzados),
  });

  plan.avisos.unshift(...(cfg.avisosDeConfiguracion || []));

  if (rechazados.length > 0) {
    plan.avisos.push(
      `El panel ignoro campos que no se pueden cambiar desde aqui: ${rechazados.join(', ')}. ` +
        'Esos se editan en el archivo de la campana.',
    );
  }

  // El nombre de la Pagina para enseñarlo junto al numero.
  _paginaVista = sinMeta ? { id: PAGE_ID, nombre: '', error: '' } : await nombreDeLaPagina();

  const firma = firmarPlan(plan);
  planes.set(firma, { plan, cfg, cambios, creadoEn: Date.now(), sinMeta: Boolean(sinMeta) });

  return { plan, cambios, rechazados, firma };
}

/**
 * Convierte el plan en lo que necesita la pantalla. Se calculan aqui los
 * textos derivados (descripciones legibles, conteos, limites) para que el
 * navegador solo pinte.
 */
function vistaDelPlan(plan, { firma, cambios }) {
  const sedeGeo = SEDES[plan.sedeTargeting.key];

  return {
    firma,
    cambios,
    sinConexion: Boolean(plan.sinConexion),
    // El token existe y es valido, pero no alcanza esta cuenta o la Pagina.
    sinAcceso: Boolean(plan.sinAcceso),
    motivoSinAcceso: plan.motivoSinAcceso || '',
    avisos: plan.avisos,
    estado: plan.estado,

    cuenta: {
      id: plan.cuenta.id,
      etiqueta: plan.cuenta.etiqueta,
      nombre: plan.cuenta.name || '',
      origen: plan.cuenta.origen,
      moneda: plan.cuenta.currency,
      husoHorario: plan.cuenta.timezone_name || '',
      // Nombre Y numero: el numero solo no identifica nada a simple vista.
      paginaId: _paginaVista.id,
      paginaNombre: _paginaVista.nombre,
      paginaError: _paginaVista.error,
    },

    /** El objetivo elegido, con lo que hace falta para explicarlo. */
    objetivo: plan.objetivo,
    /** Los campos reales que se mandan a Meta, por nivel. */
    meta: plan.meta,
    /** Nombres que se salen del manual y se crearian igual tras confirmar. */
    nombresFueraDeManual: plan.nombresFueraDeManual || [],

    sede: {
      codigo: plan.sede.codigo,
      nombre: plan.sede.sede,
      ciudad: plan.sede.ciudad,
      dist: plan.sede.dist,
      cuentaManual: plan.sede.cuenta,
    },

    campana: {
      crear: plan.campana.crear,
      id: plan.campana.id,
      numero: plan.campana.numero,
      nombre: plan.campana.nombre,
      patron:
        plan.objetivo.ambito === 'regional' ? 'R# | REGION | TIPO | DDMMAA' : 'C# | SEDE | DDMMAA',
      consecutivo: plan.campana.consecutivo
        ? {
            maximo: plan.campana.consecutivo.maximo,
            siguiente: plan.campana.consecutivo.siguiente,
            previas: plan.campana.consecutivo.coincidencias.length,
            revisadas: plan.campana.consecutivo.revisados,
          }
        : null,
    },

    patronConjunto: `C# | ${plan.sede.dist} | CJTO# | SEGMENTO`,
    totales: {
      ...plan.totales,
      presupuestoFormateado: formatearMoneda(
        plan.totales.presupuestoDiarioCop * (plan.conjuntos[0]?.presupuesto.factor || 100),
        plan.conjuntos[0]?.presupuesto.moneda || 'COP',
        plan.conjuntos[0]?.presupuesto.factor || 100,
      ),
    },

    /** Un bloque por conjunto: nombre, presupuesto, segmentacion y anuncios. */
    conjuntos: plan.conjuntos.map((c) => {
      const d = describirTargeting(plan.sedeTargeting.key, c.targeting);
      return {
        indice: c.indice,
        numero: c.numero,
        nombre: c.nombre,
        segmento: c.segmento,
        segmentoTexto: SEGMENTOS[c.segmento] || '',
        sufijo: c.sufijo,
        modoTexto: c.modoTexto,

        presupuesto: {
          cop: c.presupuesto.cop,
          formateado: formatearMoneda(c.presupuesto.unidadMenor, c.presupuesto.moneda, c.presupuesto.factor),
          unidadMenor: c.presupuesto.unidadMenor,
          moneda: c.presupuesto.moneda,
          tipo: c.presupuesto.tipo,
          dentroDelManual: c.presupuesto.dentroDelManual,
          nivel: 'conjunto (ABO)',
        },

        segmentacion: {
          ubicacion: d.ubicacion,
          tipoUbicacion: d.tipoUbicacion,
          edades: d.edades,
          generos: d.generos,
          plataformas: d.plataformas,
          dispositivos: d.dispositivos,
          posiciones: d.posiciones,
          radioKm:
            c.targeting.geo_locations?.cities?.[0]?.radius ??
            c.targeting.geo_locations?.custom_locations?.[0]?.radius ??
            null,
          modoGeo: c.targeting.geo_locations?.cities ? 'ciudad' : 'punto',
          ciudad: sedeGeo ? `${sedeGeo.ciudad}, ${sedeGeo.departamento}` : '',
          edadMin: c.targeting.age_min,
          edadMax: c.targeting.age_max,
        },

        expansionApagada: c.expansion.todoApagado,
        expansionProblemas: c.expansion.problemas,
        expansionEncendidos: c.expansion.encendidos,

        /** Cada interruptor con su explicacion y su estado en ESTE conjunto. */
        interruptores: plan.interruptores.map((i) => ({
          clave: i.clave,
          campo: i.campo,
          nombre: i.nombre,
          enAdsManager: i.enAdsManager,
          siSeEnciende: i.siSeEnciende,
          porQueApagado: i.porQueApagado,
          editable: i.editable,
          razonNoEditable: i.razonNoEditable || '',
          encendido: Boolean(c.expansion.valores[i.clave]),
        })),

        anuncios: c.anuncios.map((a, i) => ({
          indice: i,
          numero: a.numero,
          conjunto: c.indice,
          nombre: a.nombre,
          formato: a.formato,
          referencia: a.referencia,
          producto: a.producto,
          modoTexto: a.modoTexto,
          enlace: a.enlaceWhatsApp,
          copyGenerado: a.copyGenerado,
          comoSeEncontroElCreativo: a.comoSeEncontroElCreativo,
          archivo: {
            nombre: a.archivo.nombre,
            tipo: a.archivo.tipo,
            megas: a.archivo.megas,
            porPartes: a.archivo.porPartes,
            url: `/api/creativo?archivo=${encodeURIComponent(a.archivo.ruta)}`,
          },
          copy: a.copy,
        })),
      };
    }),

    expansion: {
      apagada: plan.conjuntos.every((c) => c.expansion.todoApagado),
      problemas: plan.conjuntos.flatMap((c) => c.expansion.problemas),

      /** Campo de la CAMPANA, no del conjunto: se edita en la etapa 1. */
      repartoDePresupuesto: {
        campo: 'is_adset_budget_sharing_enabled',
        nombre: 'Los conjuntos se prestan presupuesto entre si',
        enAdsManager: '«Compartir presupuesto entre conjuntos de anuncios»',
        siSeEnciende:
          'Cada conjunto puede prestar hasta un 20% de su presupuesto a otro que Meta crea que rinde ' +
          'mejor. Con un conjunto por producto eso significa que el iPhone se puede comer la plata del ' +
          'Android, o al reves.',
        porQueApagado:
          'El presupuesto de cada conjunto es el que se aprueba en pantalla. Si Meta lo mueve, el ' +
          'resumen que aprobaste deja de ser cierto.',
        editable: true,
        encendido: Boolean(plan.compartirPresupuesto),
      },

      // Lo que Meta ya no deja apagar. Va aparte y en otro color: mentir sobre
      // esto seria peor que no decirlo.
      fueraDeNuestroControl: [
        {
          que: 'Orientacion detallada Advantage',
          porque:
            'Meta elimino el campo targeting_optimization de la API en 2025 y responde que "la orientacion ' +
            'detallada Advantage se aplicara a tu conjunto de anuncios". Ya no hay interruptor.',
          efectoAqui:
            'Esa funcion amplia mas alla de los intereses que uno elige, y este conjunto no lleva ninguno: ' +
            'el publico es geografia + edad. No hay desde donde ampliar. Conviene confirmarlo en Ads Manager ' +
            'la primera vez.',
        },
      ],
    },

    mejoras: {
      rotacionDeTexto: plan.mejoras.rotacionDeTexto,
      apagadas: plan.mejoras.apagadas,
      total: plan.mejoras.total,
      // Agrupadas y en castellano, para enseñarlas plegadas.
      grupos: plan.mejoras.grupos,
      modoTexto: plan.modoTexto,
    },

    whatsapp: {
      telefono: plan.whatsapp.telefono,
      origen: plan.whatsapp.origen,
      tienda: plan.whatsapp.registro?.tienda || '',
      lider: plan.whatsapp.registro?.lider || '',
      alternativas: (plan.whatsapp.alternativas || []).map((a) => a.telefono),
      destino: 'WHATSAPP',
      messenger: 'DESACTIVADO',
      instagramDirect: 'DESACTIVADO',
      donde: 'promoted_object.whatsapp_phone_number del conjunto',
    },

    limites: { ...LIMITES_COPY, maxOpciones: MAX_OPCIONES_TEXTO },

    // Listas cerradas del manual, para que los desplegables de edicion no
    // dejen escribir codigos inventados.
    opciones: {
      segmentos: Object.entries(SEGMENTOS).map(([codigo, texto]) => ({ codigo, texto })),
      sufijos: ['', 'TEST', 'OPT'],
      modosGeo: ['ciudad', 'punto'],
      plataformas: ['facebook', 'instagram', 'whatsapp', 'messenger'],
      dispositivos: ['mobile', 'desktop'],
    },
  };
}

/* ========================================================================== */
/*  Endpoints                                                                 */
/* ========================================================================== */

/**
 * Comprueba que el token SIRVE, no solo que este escrito.
 *
 * Tener las tres variables llenas no significa nada: un token caducado esta
 * escrito igual. Sin esta llamada, el panel deja aprobar las cuatro etapas y
 * falla justo al enviar, que es el peor momento posible.
 *
 * El resultado se cachea un minuto para no llamar a Meta en cada refresco.
 */
let _tokenRevisado = { cuando: 0, resultado: null };

async function revisarToken() {
  if (credencialesFaltantes().length > 0) {
    return { valido: false, motivo: 'faltan variables en el .env' };
  }

  if (Date.now() - _tokenRevisado.cuando < 60000 && _tokenRevisado.resultado) {
    return _tokenRevisado.resultado;
  }

  let resultado;
  try {
    const r = await fetch(`${GRAPH_BASE}/me?fields=id&access_token=${encodeURIComponent(ACCESS_TOKEN)}`, {
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();

    resultado = d?.error
      ? { valido: false, motivo: d.error.message, codigo: d.error.code, caducado: Number(d.error.code) === 190 }
      : { valido: true, motivo: '' };
  } catch (error) {
    resultado = { valido: false, motivo: `no se pudo contactar con Meta: ${error.message}`, sinRed: true };
  }

  _tokenRevisado = { cuando: Date.now(), resultado };
  return resultado;
}

/**
 * El nombre de la Pagina, no solo su numero.
 *
 * "140694115785963" no le dice nada a nadie; "Celred" si. Se cachea porque no
 * cambia y no hace falta preguntarlo en cada pantalla.
 */
let _pagina = { id: '', nombre: '', error: '' };

async function nombreDeLaPagina() {
  if (!PAGE_ID) return { id: '', nombre: '', error: 'falta META_PAGE_ID en el .env' };
  if (_pagina.id === PAGE_ID) return _pagina;

  try {
    const r = await fetch(
      `${GRAPH_BASE}/${PAGE_ID}?fields=name&access_token=${encodeURIComponent(ACCESS_TOKEN)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    const d = await r.json();
    _pagina = d?.error
      ? { id: PAGE_ID, nombre: '', error: d.error.message }
      : { id: PAGE_ID, nombre: d.name || '', error: '' };
  } catch (error) {
    _pagina = { id: PAGE_ID, nombre: '', error: error.message };
  }

  return _pagina;
}

async function apiEstado(res) {
  const campanas = [];

  for (const nombre of listarCampanas()) {
    try {
      const c = await cargarCampana(nombre);
      campanas.push({
        nombre,
        descripcion: c.descripcion || '',
        sede: c.sede,
        segmento: c.segmento,
        anuncios: c.anuncios.length,
        presupuesto: c.presupuestoDiarioCop,
        problema: null,
      });
    } catch (error) {
      campanas.push({ nombre, descripcion: '', problema: error.message });
    }
  }

  const faltan = credencialesFaltantes();
  const token = await revisarToken();

  responderJson(res, 200, {
    ok: true,
    campanas,
    credenciales: {
      completas: faltan.length === 0,
      faltan: faltan.map((v) => ({ clave: v.clave, para: v.para })),
    },
    token,
    paginaId: PAGE_ID,
    // Sin un token que funcione el panel sigue sirviendo para revisar: se
    // planifica sin tocar Meta y el boton de publicar queda bloqueado.
    puedePublicar: faltan.length === 0 && token.valido && Boolean(PAGE_ID),
  });
}

/**
 * Lee una frase en espanol y devuelve la campana que saldria, sin planificar
 * todavia. Nada de esto toca Meta ni escribe ningun archivo.
 */
async function apiInterpretar(req, res) {
  const cuerpo = await leerCuerpo(req);
  const texto = String(cuerpo.texto || '').trim();

  const r = interpretar(texto);

  if (!r.ok) {
    // `ok: true` porque la peticion SI funciono: lo que fallo es entender el
    // texto, y eso no es un error de la API. Devolverlo como error hacia que
    // el navegador perdiera los motivos y enseñara un "Error 200" pelado.
    return responderJson(res, 200, {
      ok: true,
      entendido: false,
      lectura: r.lectura,
      avisos: r.avisos,
      problemas: r.problemas,
    });
  }

  // El borrador se guarda en memoria con una clave; la etapa siguiente lo
  // planifica igual que si viniera de un archivo de campanas/.
  const clave = createHash('sha256').update(texto + Date.now()).digest('hex').slice(0, 16);
  borradores.set(clave, { ...r.cfg, archivo: `dictada-${clave.slice(0, 6)}` });

  responderJson(res, 200, {
    ok: true,
    entendido: true,
    borrador: clave,
    lectura: r.lectura,
    avisos: r.avisos,
    problemas: r.problemas,
  });
}

async function apiPlan(req, res) {
  const cuerpo = await leerCuerpo(req);

  if (!cuerpo.campana && !cuerpo.borrador) {
    return responderError(res, 400, 'Falta decir que campana planificar.');
  }

  // Si el token no sirve, se planifica sin conexion en vez de reventar: asi el
  // panel sigue enseñando la campana entera y dice por que no puede enviarla.
  const token = await revisarToken();
  const sinMeta = Boolean(cuerpo.sinMeta) || !token.valido;

  const { plan, cambios, rechazados, firma } = await prepararPlan({
    campana: cuerpo.campana,
    borrador: cuerpo.borrador,
    ajustes: cuerpo.ajustes || {},
    sinMeta,
    nombresForzados: cuerpo.nombresForzados,
    objetivo: cuerpo.objetivo,
    region: cuerpo.region,
    tipoRegional: cuerpo.tipoRegional,
  });

  responderJson(res, 200, {
    ok: true,
    rechazados,
    token,
    plan: vistaDelPlan(plan, { firma, cambios }),
  });
}

/**
 * Sirve un creativo local para la vista previa de la etapa 3.
 *
 * Solo deja salir archivos que esten dentro de creativos/. Sin esa comprobacion
 * el panel seria un lector de archivos del disco entero para cualquiera que
 * alcanzara el puerto.
 */
function apiCreativo(url, req, res) {
  const pedido = url.searchParams.get('archivo') || '';
  if (!pedido) return responderError(res, 400, 'Falta el archivo.');

  const ruta = resolve(pedido);
  const raizCreativos = resolve(CARPETA_CREATIVOS);

  if (ruta !== raizCreativos && !ruta.startsWith(raizCreativos + (process.platform === 'win32' ? '\\' : '/'))) {
    return responderError(res, 403, 'Ese archivo esta fuera de creativos/.');
  }
  if (!existsSync(ruta) || !statSync(ruta).isFile()) {
    return responderError(res, 404, 'No existe ese creativo.');
  }

  const stats = statSync(ruta);
  const tipo = TIPOS[extname(ruta).toLowerCase()] || 'application/octet-stream';

  // Rango parcial: sin esto el navegador no puede buscar dentro de un video.
  const rango = req.headers.range;
  if (rango) {
    const m = /bytes=(\d*)-(\d*)/.exec(rango);
    const inicio = m && m[1] ? Number(m[1]) : 0;
    const fin = m && m[2] ? Number(m[2]) : stats.size - 1;

    if (inicio >= stats.size || fin >= stats.size || inicio > fin) {
      res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
      return res.end();
    }

    res.writeHead(206, {
      'Content-Type': tipo,
      'Content-Length': fin - inicio + 1,
      'Content-Range': `bytes ${inicio}-${fin}/${stats.size}`,
      'Accept-Ranges': 'bytes',
    });
    return createReadStream(ruta, { start: inicio, end: fin }).pipe(res);
  }

  res.writeHead(200, {
    'Content-Type': tipo,
    'Content-Length': stats.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  });
  return createReadStream(ruta).pipe(res);
}

/**
 * El unico endpoint que escribe en Meta.
 *
 * Exige las cuatro aprobaciones y la firma del plan que se enseño en pantalla.
 * No replanifica: crea el objeto guardado, que es literalmente el que se vio.
 */
async function apiPublicar(req, res) {
  const cuerpo = await leerCuerpo(req);
  const { firma, aprobaciones = {} } = cuerpo;

  const etapas = ['campana', 'conjunto', 'anuncios', 'final'];
  const sinAprobar = etapas.filter((e) => aprobaciones[e] !== true);
  if (sinAprobar.length > 0) {
    return responderError(res, 400, `Faltan aprobaciones: ${sinAprobar.join(', ')}.`);
  }

  if (!firma || !planes.has(firma)) {
    return responderError(
      res,
      409,
      'El plan aprobado ya no esta en memoria. Vuelve a la etapa 1 y aprueba de nuevo.',
      { recalcular: true },
    );
  }

  const guardado = planes.get(firma);

  if (guardado.sinMeta || guardado.plan.sinConexion) {
    return responderError(
      res,
      400,
      'Este plan se calculo sin conexion con Meta: los consecutivos son supuestos y crear con ellos ' +
        'pisaria numeros que ya existen. Pon las credenciales en el .env y vuelve a planificar.',
    );
  }

  if (Date.now() - guardado.creadoEn > VIGENCIA_DEL_PLAN_MS) {
    planes.delete(firma);
    return responderError(
      res,
      409,
      'El plan lleva mas de 30 minutos calculado y los consecutivos pueden haber cambiado. ' +
        'Vuelve a planificar y a aprobar.',
      { recalcular: true },
    );
  }

  // Guarda ultima: aunque el plan se guardo con PAUSED, se comprueba aqui.
  if (guardado.plan.estado !== 'PAUSED') {
    return responderError(res, 400, 'El panel solo crea borradores. Este plan no esta en PAUSED.');
  }

  /* --- A partir de aqui se responde en streaming ------------------------- */
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const enviar = (tipo, datos) => {
    res.write(`data: ${JSON.stringify({ tipo, ...datos })}\n\n`);
  };

  enviar('inicio', { objetos: guardado.plan.totales.objetos, totales: guardado.plan.totales });

  /* --- Antes de crear NADA: preguntarle a Meta --------------------------- */
  // La creacion va en orden (campana -> conjunto -> anuncios). Si el conjunto
  // se rechaza, la campana ya esta creada y queda vacia en Ads Manager, ademas
  // de quemar un numero del consecutivo. Esto lo pregunta antes, sin crear.
  enviar('paso', { paso: 'ensayo', detalle: 'Preguntando a Meta si acepta el plan (no se crea nada)…' });

  const ensayo = await ensayarPlan(guardado.plan);

  if (!ensayo.ok) {
    const primero = ensayo.problemas[0];
    enviar('error', {
      mensaje: `Meta no acepta ${primero.donde}: ${primero.mensaje}`,
      detalle: primero.detalle,
      codigo: primero.codigo,
      subcodigo: primero.subcodigo,
      tecnico: ensayo.problemas
        .map((p) => `${p.donde}\n  ${p.tecnico || p.mensaje}\n  codigo ${p.codigo} · subcodigo ${p.subcodigo}`)
        .join('\n\n'),
      // Lo importante: NO se creo nada, asi que no hay que limpiar nada.
      colgando: [],
      nadaCreado: true,
    });
    return res.end();
  }

  enviar('paso', { paso: 'ensayo-ok', detalle: `Meta acepta ${ensayo.comprobado.join(', ')}.` });
  if (ensayo.sinComprobar) enviar('aviso', { mensaje: `No se pudo ensayar ${ensayo.sinComprobar}.` });

  try {
    const resultado = await crearEstructuraCampana(guardado.plan, {
      onPaso: (paso, detalle) => enviar('paso', { paso, detalle: serializable(detalle) }),
    });

    if (resultado.error) {
      const colgando = [];
      if (resultado.campaignId && resultado.campaignCreada) colgando.push(`Campana ${resultado.campaignId}`);
      for (const c of resultado.conjuntos) colgando.push(`Conjunto ${c.nombre}: ${c.adSetId}`);
      for (const a of resultado.anuncios) {
        if (a.creativeId) colgando.push(`Creativo de ${a.nombre}: ${a.creativeId}`);
        if (a.adId) colgando.push(`Anuncio ${a.nombre}: ${a.adId}`);
      }
      // "Invalid parameter" a secas no le dice nada a nadie: el motivo real
      // viene en error_user_title y error_user_msg.
      const d = detalleDeMeta(resultado.error);
      enviar('error', {
        mensaje: d.mensaje,
        detalle: d.detalle,
        codigo: d.codigo,
        subcodigo: d.subcodigo,
        tecnico: [d.tecnico, d.traza ? `fbtrace_id ${d.traza}` : ''].filter(Boolean).join('\n'),
        colgando,
      });
      return res.end();
    }

    enviar('creado', {
      campaignId: resultado.campaignId,
      estado: resultado.estado,
      conjuntos: resultado.conjuntos.map((c) => ({
        numero: c.numero,
        nombre: c.nombre,
        segmento: c.segmento,
        adSetId: c.adSetId,
        anuncios: c.anuncios.length,
      })),
      anuncios: resultado.anuncios.map((a) => ({
        numero: a.numero,
        conjunto: a.conjunto,
        conjuntoNombre: a.conjuntoNombre,
        nombre: a.nombre,
        adId: a.adId,
        creativeId: a.creativeId,
        modoTexto: a.modoTexto,
        escalon: a.escalon,
        mejorasSinDeclarar: a.mejorasSinDeclarar,
        rechazos: a.rechazos,
      })),
    });

    enviar('verificando', {});

    try {
      const verificacion = await verificarEstructura(resultado, guardado.plan);
      enviar('verificado', { verificacion });
    } catch (error) {
      enviar('aviso', { mensaje: `No se pudo releer el estado: ${error.message}` });
    }

    // Un plan ya usado no se reutiliza: evita crear dos veces lo mismo por un
    // doble clic o un refresco de la pagina.
    planes.delete(firma);

    enviar('fin', {
      recordatorio: [
        'Punto 12: actualiza HOY el archivo de la sede en Drive con el pantallazo de cada creativo.',
        'Punto 12: actualiza el archivo general de anuncios por referencia.',
        'Punto 12: sube las piezas al Drive del equipo creativo.',
        'Punto 12: actualiza el Panel de Pauta en Notion.',
        guardado.plan.campana.crear
          ? `Punto 4: anota el consecutivo C${guardado.plan.campana.numero} de ${guardado.plan.sede.codigo} en la hoja "Consecutivos".`
          : null,
      ].filter(Boolean),
    });
  } catch (error) {
    enviar('error', { mensaje: error.message, colgando: [] });
  }

  res.end();
}

/** Deja un detalle de progreso en algo que se pueda serializar a JSON. */
function serializable(detalle) {
  if (detalle === undefined || detalle === null) return null;
  if (typeof detalle !== 'object') return detalle;
  try {
    return JSON.parse(JSON.stringify(detalle));
  } catch {
    return String(detalle);
  }
}

/* ========================================================================== */
/*  Archivos estaticos                                                        */
/* ========================================================================== */

function servirEstatico(ruta, res) {
  const archivo = ruta === '/' ? 'index.html' : ruta.replace(/^\//, '');
  const destino = resolve(join(CARPETA_PANEL, archivo));

  if (!destino.startsWith(resolve(CARPETA_PANEL))) {
    return responderError(res, 403, 'Ruta no permitida.');
  }
  if (!existsSync(destino) || !statSync(destino).isFile()) {
    return responderError(res, 404, `No existe ${archivo}.`);
  }

  const contenido = readFileSync(destino);
  res.writeHead(200, {
    'Content-Type': TIPOS[extname(destino).toLowerCase()] || 'application/octet-stream',
    'Content-Length': contenido.length,
    'Cache-Control': 'no-store',
  });
  res.end(contenido);
}

/* ========================================================================== */
/*  Enrutador                                                                 */
/* ========================================================================== */

async function manejar(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const ruta = url.pathname;

  try {
    if (ruta === '/api/estado' && req.method === 'GET') return await apiEstado(res);
    if (ruta === '/api/objetivos' && req.method === 'GET') {
      return responderJson(res, 200, {
        ok: true,
        // Agrupado como Ads Manager: los seis oficiales de Meta y, dentro,
        // las configuraciones concretas de Celred.
        catalogo: catalogoParaLaInterfaz(),
        objetivos: listarParaLaInterfaz(),
        porDefecto: OBJETIVO_POR_DEFECTO,
        // Para los objetivos regionales (R#), que necesitan region y tipo.
        regiones: REGIONES,
        tiposRegionales: Object.entries(TIPOS_REGIONAL).map(([codigo, que]) => ({ codigo, que })),
        // Que tiendas entran en cada region: una campana regional no se pauta
        // "en ningun sitio", se pauta sobre estas sedes y hay que verlas antes
        // de aprobarla.
        sedesPorRegion: SEDES_POR_REGION,
      });
    }
    if (ruta === '/api/interpretar' && req.method === 'POST') return await apiInterpretar(req, res);
    if (ruta === '/api/plan' && req.method === 'POST') return await apiPlan(req, res);
    if (ruta === '/api/creativo' && req.method === 'GET') return apiCreativo(url, req, res);
    if (ruta === '/api/publicar' && req.method === 'POST') return await apiPublicar(req, res);

    if (ruta.startsWith('/api/')) return responderError(res, 404, `No existe ${ruta}.`);

    return servirEstatico(ruta, res);
  } catch (error) {
    if (!res.headersSent) {
      const { titulo, error: mensaje, amigable, tecnico } = errorParaLaPantalla(error);
      return responderError(res, 400, mensaje, {
        titulo,
        amigable,
        tecnico,
        // Un problema de nomenclatura no es un fallo tecnico: el panel ofrece
        // "corregir" o "continuar con este nombre" en vez de solo cerrar.
        tipo: error?.tipo || '',
        nombres: error?.nombres || [],
      });
    }
    res.end();
  }
}

/* ========================================================================== */
/*  Arranque                                                                  */
/* ========================================================================== */

function leerPuerto(argv) {
  const i = argv.indexOf('--puerto');
  const delArgumento = i >= 0 ? Number(argv[i + 1]) : NaN;
  const delEntorno = Number(process.env.PANEL_PUERTO);
  const puerto = Number.isInteger(delArgumento) ? delArgumento : Number.isInteger(delEntorno) ? delEntorno : 4317;
  return Math.min(65535, Math.max(1, puerto));
}

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  verde: '\x1b[32m',
  amarillo: '\x1b[33m',
  cyan: '\x1b[36m',
};

function arrancar() {
  const puerto = leerPuerto(process.argv.slice(2));

  if (!existsSync(join(CARPETA_PANEL, 'index.html'))) {
    console.error(`\n  No encuentro panel/index.html. ¿Se borro la carpeta panel/?\n`);
    process.exit(1);
  }

  const servidor = createServer((req, res) => {
    manejar(req, res).catch((error) => {
      if (!res.headersSent) responderError(res, 500, error.message);
      else res.end();
    });
  });

  servidor.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n  El puerto ${puerto} esta ocupado. Prueba:  node servidor.js --puerto ${puerto + 1}\n`);
      process.exit(1);
    }
    throw error;
  });

  // Solo 127.0.0.1: el proceso tiene un token con control total sobre las
  // cuentas publicitarias y no debe quedar accesible desde la red.
  servidor.listen(puerto, '127.0.0.1', () => {
    const faltan = credencialesFaltantes();

    console.log(`\n${C.cyan}${C.bold}CELRED ADS MANAGER${C.reset} ${C.dim}· panel de aprobacion${C.reset}`);
    console.log(`\n  ${C.bold}${C.verde}http://127.0.0.1:${puerto}${C.reset}`);
    console.log(`${C.dim}  Solo en este equipo. Ctrl+C para cerrar.${C.reset}\n`);

    if (faltan.length > 0) {
      console.log(`${C.amarillo}  Faltan credenciales en el .env:${C.reset}`);
      faltan.forEach((v) => console.log(`${C.amarillo}    - ${v.clave}  (${v.para})${C.reset}`));
      console.log(`${C.dim}  El panel abre igual y sirve para revisar campanas, pero no podra crear nada.${C.reset}\n`);
    } else {
      console.log(`${C.dim}  Todo lo que se crea desde el panel sale en BORRADOR (PAUSED).${C.reset}\n`);
    }
  });
}

arrancar();
