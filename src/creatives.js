/**
 * ============================================================================
 *  src/creatives.js — Subida de creativos locales y armado del AdCreative
 * ============================================================================
 *  Tres responsabilidades:
 *
 *   1. inspeccionarCreativoLocal()  mira el archivo en disco sin tocar la red
 *   2. subirCreativoLocal()         sube imagen a /adimages o video a /advideos
 *   3. construirAdCreative()        arma el AdCreative de Click to WhatsApp
 *
 *  Sobre el destino WhatsApp (REGLA del proyecto):
 *  el CTA es siempre WHATSAPP_MESSAGE con app_destination WHATSAPP y un enlace
 *  a api.whatsapp.com con el numero de la sede y el mensaje prellenado. Ni
 *  Messenger ni Instagram Direct aparecen por ningun lado: `CTA_PROHIBIDOS`
 *  hace fallar la creacion si alguien intenta colarlos.
 *
 *  Sobre los 5 textos, 5 titulos y 5 descripciones:
 *  van en `asset_feed_spec`, que es lo que en Ads Manager se ve como
 *  "opciones de texto". Se mandan SIEMPRE completos. `construirAdCreative`
 *  reintenta cambiando el envoltorio (que mejoras declara, como codifica el
 *  mensaje de bienvenida), pero ningun reintento reduce el numero de textos:
 *  si Meta rechaza los cinco, se corta y se reporta. Bajar a un solo texto
 *  solo ocurre si la campana lo pide a proposito con modoTexto: 'simple'.
 *
 *  Sobre las mejoras automaticas de Meta:
 *  van todas en OPT_OUT, una por una. La unica excepcion es
 *  `text_optimizations` en modo multiple, que no genera contenido: es la
 *  inscripcion que hace que se entreguen las 5 variantes escritas a mano.
 * ============================================================================
 */

import { createReadStream, readFileSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

import axios from 'axios';
import FormData from 'form-data';

import { ACCESS_TOKEN, AD_ACCOUNT_ID, GRAPH_BASE, PAGE_ID, INSTAGRAM_USER_ID, DEBUG } from './config.js';

/* -------------------------------------------------------------------------- */
/*  Constantes                                                                */
/* -------------------------------------------------------------------------- */

const EXTENSIONES_IMAGEN = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']);
const EXTENSIONES_VIDEO = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.3gp']);

/** Por encima de esto se sube el video por partes en vez de en una sola peticion. */
const UMBRAL_SUBIDA_POR_PARTES = 50 * 1024 * 1024; // 50 MB

/** Tope duro de Meta para creativos de video. */
const MAX_BYTES_VIDEO = 4 * 1024 * 1024 * 1024; // 4 GB
/** Tope duro de Meta para imagenes de anuncio. */
const MAX_BYTES_IMAGEN = 30 * 1024 * 1024; // 30 MB

/** Unico CTA admitido. Cualquier otro se rechaza antes de llamar a la API. */
export const CTA_WHATSAPP = 'WHATSAPP_MESSAGE';

/** CTA que mandarian el mensaje a Messenger o a Instagram Direct. */
const CTA_PROHIBIDOS = new Set(['MESSAGE_PAGE', 'SEND_MESSAGE', 'INSTAGRAM_MESSAGE', 'MESSENGER_MESSAGE']);

/** Limites de `asset_feed_spec` (lo mismo que deja poner Ads Manager). */
export const MAX_OPCIONES_TEXTO = 5;

/* -------------------------------------------------------------------------- */
/*  Mejoras automaticas de Meta: todas apagadas menos la rotacion de texto    */
/* -------------------------------------------------------------------------- */

/**
 * `text_optimizations` es la UNICA que va en OPT_IN, y solo en modo multiple.
 *
 * No es una mejora en el sentido de las demas: es la inscripcion que hace que
 * Meta entregue las 5 variantes de texto que escribio una persona. No genera
 * texto, no lo reescribe y no lo traduce; elige entre lo que uno le dio. Sin
 * ella, `asset_feed_spec` con varios bodies no se sirve como opciones de texto.
 *
 * En modo simple va en OPT_OUT, porque ahi solo hay un texto y no hay nada
 * entre lo que elegir.
 */
export const MEJORA_DE_ROTACION_DE_TEXTO = 'text_optimizations';

/**
 * Mejoras que se apagan SIEMPRE y de las que hay confirmacion en la referencia
 * de `creative_features_spec`. Estas viajan en todos los intentos.
 *
 * `standard_enhancements` se manda igual aunque desde la version 22 de la API
 * dejo de funcionar como interruptor maestro: no apaga nada por si solo, pero
 * tampoco estorba y deja constancia de la intencion.
 */
export const MEJORAS_NUCLEO = Object.freeze([
  'standard_enhancements',
  'image_touchups',
  'image_brightness_and_contrast',
  'image_templates',
  'video_auto_crop',
  'enhance_cta',
  'inline_comment',
  'media_liquidity_animated_image',
  'adapt_to_placement',
  'profile_card',
]);

/**
 * Mejoras que tambien se apagan, pero cuyo nombre exacto puede variar entre
 * versiones de la API. Si Meta rechaza el creativo quejandose de una de ellas,
 * el escalon siguiente manda solo `MEJORAS_NUCLEO` — nunca se baja el numero
 * de textos por esto.
 */
export const MEJORAS_EXTRA = Object.freeze([
  'site_extensions',
  'product_extensions',
  'catalog_feed_tags',
  'music',
  '3d_animation',
  'text_generation',
  'image_generation',
  'background_generation',
  'description_automation',
  'cv_transformation',
]);

/** Todas las que se apagan, en el intento mas completo. */
export const MEJORAS_APAGADAS = Object.freeze([...MEJORAS_NUCLEO, ...MEJORAS_EXTRA]);

/* -------------------------------------------------------------------------- */
/*  1. Inspeccion local                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Mira el archivo en disco y decide si es imagen o video. No toca la red.
 *
 * @param {string} rutaCreativoLocal
 * @returns {{ruta:string, nombre:string, extension:string, tipo:'imagen'|'video',
 *            bytes:number, megas:string, porPartes:boolean}}
 */
export function inspeccionarCreativoLocal(rutaCreativoLocal) {
  if (!rutaCreativoLocal) throw new Error('creatives: falta la ruta del creativo local.');

  const ruta = resolve(rutaCreativoLocal);
  let stats;
  try {
    stats = statSync(ruta);
  } catch {
    throw new Error(`creatives: no existe el archivo "${ruta}".`);
  }
  if (!stats.isFile()) throw new Error(`creatives: "${ruta}" no es un archivo.`);
  if (stats.size === 0) throw new Error(`creatives: el archivo "${ruta}" esta vacio.`);

  const extension = extname(ruta).toLowerCase();
  const esImagen = EXTENSIONES_IMAGEN.has(extension);
  const esVideo = EXTENSIONES_VIDEO.has(extension);

  if (!esImagen && !esVideo) {
    throw new Error(
      `creatives: extension "${extension}" no reconocida.\n` +
        `  Imagen: ${[...EXTENSIONES_IMAGEN].join(' ')}\n` +
        `  Video:  ${[...EXTENSIONES_VIDEO].join(' ')}`,
    );
  }

  const tipo = esImagen ? 'imagen' : 'video';
  const tope = esImagen ? MAX_BYTES_IMAGEN : MAX_BYTES_VIDEO;
  if (stats.size > tope) {
    throw new Error(
      `creatives: "${basename(ruta)}" pesa ${(stats.size / 1024 / 1024).toFixed(1)} MB y Meta ` +
        `acepta hasta ${(tope / 1024 / 1024).toFixed(0)} MB para ${tipo}.`,
    );
  }

  return {
    ruta,
    nombre: basename(ruta),
    extension,
    tipo,
    bytes: stats.size,
    megas: (stats.size / 1024 / 1024).toFixed(1),
    porPartes: tipo === 'video' && stats.size > UMBRAL_SUBIDA_POR_PARTES,
  };
}

/* -------------------------------------------------------------------------- */
/*  Utilidades HTTP                                                           */
/* -------------------------------------------------------------------------- */

function urlGraph(camino) {
  return `${GRAPH_BASE}/${String(camino).replace(/^\//, '')}`;
}

/**
 * La cuenta sobre la que se sube. Cada sede vive en una cuenta distinta, asi
 * que viaja como parametro en vez de leerse de una constante global.
 */
function exigirCuenta(idCuenta) {
  const id = String(idCuenta || AD_ACCOUNT_ID || '').trim();
  if (!id) {
    throw new Error('creatives: falta la cuenta publicitaria donde subir el creativo.');
  }
  return id;
}

/** Convierte un error de axios en un Error con el mensaje que devolvio Meta. */
function errorDeMeta(error, contexto) {
  const datos = error?.response?.data?.error;
  if (!datos) {
    return new Error(`${contexto}: ${error?.message || error}`);
  }
  const partes = [datos.message];
  if (datos.error_user_title) partes.push(`(${datos.error_user_title})`);
  if (datos.error_user_msg) partes.push(datos.error_user_msg);
  if (datos.error_subcode) partes.push(`subcodigo ${datos.error_subcode}`);
  const e = new Error(`${contexto}: ${partes.filter(Boolean).join(' — ')}`);
  e.metaError = datos;
  return e;
}

async function postMultipart(camino, form, { timeout = 15 * 60 * 1000, contexto } = {}) {
  try {
    const { data } = await axios.post(urlGraph(camino), form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout,
    });
    return data;
  } catch (error) {
    throw errorDeMeta(error, contexto || `POST ${camino}`);
  }
}

async function getGraph(camino, params, { contexto } = {}) {
  try {
    const { data } = await axios.get(urlGraph(camino), {
      params: { access_token: ACCESS_TOKEN, ...params },
      timeout: 60 * 1000,
    });
    return data;
  } catch (error) {
    throw errorDeMeta(error, contexto || `GET ${camino}`);
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/*  2a. Subida de IMAGEN                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Sube una imagen a /act_<id>/adimages y devuelve su hash.
 * La respuesta viene indexada por el nombre del archivo, no por una clave fija.
 */
export async function subirImagen(ruta, { idCuenta } = {}) {
  const archivo = inspeccionarCreativoLocal(ruta);
  if (archivo.tipo !== 'imagen') throw new Error(`creatives: "${archivo.nombre}" no es una imagen.`);

  const cuenta = exigirCuenta(idCuenta);
  const form = new FormData();
  form.append('access_token', ACCESS_TOKEN);
  form.append(archivo.nombre, createReadStream(archivo.ruta), { filename: archivo.nombre });

  const data = await postMultipart(`${cuenta}/adimages`, form, {
    contexto: `Subiendo la imagen "${archivo.nombre}"`,
  });

  const imagenes = data?.images || {};
  const clave = Object.keys(imagenes)[0];
  const hash = clave ? imagenes[clave]?.hash : undefined;

  if (!hash) {
    throw new Error(`creatives: Meta acepto la imagen pero no devolvio hash. Respuesta: ${JSON.stringify(data)}`);
  }

  return {
    tipo: 'imagen',
    hash,
    url: imagenes[clave]?.url || '',
    nombre: archivo.nombre,
    bytes: archivo.bytes,
  };
}

/* -------------------------------------------------------------------------- */
/*  2b. Subida de VIDEO                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Sube un video a /act_<id>/advideos.
 *
 * Los archivos grandes van por el protocolo de tres fases de Meta
 * (start -> transfer -> finish), que es el unico que aguanta 85 MB sin que se
 * caiga la peticion: el archivo se manda en trozos del tamano que pide Meta en
 * cada paso, y si un trozo falla se reintenta ese trozo, no la subida entera.
 */
export async function subirVideo(ruta, { idCuenta, onIntento = () => {}, reintentosPorTrozo = 3 } = {}) {
  const archivo = inspeccionarCreativoLocal(ruta);
  if (archivo.tipo !== 'video') throw new Error(`creatives: "${archivo.nombre}" no es un video.`);

  const cuenta = exigirCuenta(idCuenta);
  const videoId = archivo.porPartes
    ? await subirVideoPorPartes(archivo, { cuenta, onIntento, reintentosPorTrozo })
    : await subirVideoDeUnaVez(archivo, cuenta);

  return { tipo: 'video', videoId, nombre: archivo.nombre, bytes: archivo.bytes };
}

async function subirVideoDeUnaVez(archivo, cuenta) {
  const form = new FormData();
  form.append('access_token', ACCESS_TOKEN);
  form.append('name', archivo.nombre);
  form.append('source', createReadStream(archivo.ruta), { filename: archivo.nombre });

  const data = await postMultipart(`${cuenta}/advideos`, form, {
    contexto: `Subiendo el video "${archivo.nombre}"`,
  });

  if (!data?.id) {
    throw new Error(`creatives: Meta no devolvio id de video. Respuesta: ${JSON.stringify(data)}`);
  }
  return data.id;
}

async function subirVideoPorPartes(archivo, { cuenta, onIntento, reintentosPorTrozo }) {
  /* --- Fase 1: start ----------------------------------------------------- */
  const formInicio = new FormData();
  formInicio.append('access_token', ACCESS_TOKEN);
  formInicio.append('upload_phase', 'start');
  formInicio.append('file_size', String(archivo.bytes));

  const inicio = await postMultipart(`${cuenta}/advideos`, formInicio, {
    contexto: `Abriendo la sesion de subida de "${archivo.nombre}"`,
  });

  const sesion = inicio.upload_session_id;
  const videoId = inicio.video_id;
  if (!sesion || !videoId) {
    throw new Error(`creatives: Meta no abrio la sesion de subida. Respuesta: ${JSON.stringify(inicio)}`);
  }

  let inicioTrozo = Number(inicio.start_offset);
  let finTrozo = Number(inicio.end_offset);

  // El archivo se lee entero en memoria una sola vez: son 85 MB y evita
  // reabrir el descriptor en cada uno de los trozos y en cada reintento.
  const contenido = readFileSync(archivo.ruta);

  /* --- Fase 2: transfer, trozo a trozo ----------------------------------- */
  let numeroTrozo = 0;
  while (inicioTrozo < finTrozo) {
    numeroTrozo += 1;
    const trozo = contenido.subarray(inicioTrozo, finTrozo);
    let ultimoError;
    let entregado = null;

    for (let intento = 1; intento <= reintentosPorTrozo; intento += 1) {
      onIntento({
        fase: 'transfer',
        trozo: numeroTrozo,
        intento,
        subidoBytes: inicioTrozo,
        totalBytes: archivo.bytes,
        porcentaje: Math.round((inicioTrozo / archivo.bytes) * 100),
      });

      try {
        const form = new FormData();
        form.append('access_token', ACCESS_TOKEN);
        form.append('upload_phase', 'transfer');
        form.append('upload_session_id', sesion);
        form.append('start_offset', String(inicioTrozo));
        form.append('video_file_chunk', trozo, { filename: archivo.nombre });

        entregado = await postMultipart(`${cuenta}/advideos`, form, {
          contexto: `Subiendo el trozo ${numeroTrozo} de "${archivo.nombre}"`,
        });
        ultimoError = undefined;
        break;
      } catch (error) {
        ultimoError = error;
        if (intento < reintentosPorTrozo) await dormir(2000 * intento);
      }
    }

    if (ultimoError) throw ultimoError;

    const siguienteInicio = Number(entregado.start_offset);
    const siguienteFin = Number(entregado.end_offset);

    // Guarda contra un bucle infinito si Meta devolviera el mismo offset.
    if (!Number.isFinite(siguienteInicio) || siguienteInicio <= inicioTrozo) {
      if (siguienteInicio >= archivo.bytes) break;
      throw new Error(
        `creatives: la subida por partes no avanzo (offset ${inicioTrozo} -> ${siguienteInicio}). ` +
          'Reintenta la subida.',
      );
    }

    inicioTrozo = siguienteInicio;
    finTrozo = siguienteFin;
  }

  /* --- Fase 3: finish ---------------------------------------------------- */
  const formFin = new FormData();
  formFin.append('access_token', ACCESS_TOKEN);
  formFin.append('upload_phase', 'finish');
  formFin.append('upload_session_id', sesion);
  formFin.append('title', archivo.nombre);
  formFin.append('name', archivo.nombre);

  const fin = await postMultipart(`${cuenta}/advideos`, formFin, {
    contexto: `Cerrando la subida de "${archivo.nombre}"`,
  });

  if (fin?.success === false) {
    throw new Error(`creatives: Meta rechazo el cierre de la subida. Respuesta: ${JSON.stringify(fin)}`);
  }

  onIntento({
    fase: 'transfer',
    trozo: numeroTrozo,
    intento: 1,
    subidoBytes: archivo.bytes,
    totalBytes: archivo.bytes,
    porcentaje: 100,
  });

  return videoId;
}

/**
 * Espera a que Meta termine de procesar el video.
 * Un video recien subido no se puede usar en un anuncio hasta que su
 * `video_status` sea "ready".
 */
export async function esperarProcesadoDeVideo(videoId, { maxIntentos = 60, esperaMs = 5000, onIntento = () => {} } = {}) {
  for (let intento = 1; intento <= maxIntentos; intento += 1) {
    const data = await getGraph(videoId, { fields: 'status' }, { contexto: `Consultando el estado del video ${videoId}` });
    const estado = data?.status?.video_status || 'desconocido';
    const progreso = data?.status?.processing_progress;

    onIntento({ intento, estado, progreso, maxIntentos });

    if (estado === 'ready') return { estado, intentos: intento };
    if (estado === 'error') {
      throw new Error(
        `creatives: Meta no pudo procesar el video ${videoId}. ` +
          `Detalle: ${JSON.stringify(data?.status || {})}`,
      );
    }

    if (intento < maxIntentos) await dormir(esperaMs);
  }

  throw new Error(
    `creatives: el video ${videoId} sigue procesandose despues de ` +
      `${Math.round((maxIntentos * esperaMs) / 1000)} s. Reintenta mas tarde: el video ya esta subido.`,
  );
}

/**
 * Devuelve la miniatura preferida del video. Meta exige una miniatura para
 * poder armar el creativo de video.
 */
export async function obtenerMiniatura(videoId) {
  const data = await getGraph(
    `${videoId}/thumbnails`,
    { fields: 'id,uri,is_preferred,width,height' },
    { contexto: `Leyendo las miniaturas del video ${videoId}` },
  );

  const miniaturas = data?.data || [];
  if (miniaturas.length === 0) {
    throw new Error(
      `creatives: el video ${videoId} no tiene miniaturas todavia. ` +
        'Suele pasar si el procesamiento acaba de terminar; reintenta en unos segundos.',
    );
  }

  const preferida = miniaturas.find((m) => m.is_preferred) || miniaturas[0];
  return { id: preferida.id, uri: preferida.uri, ancho: preferida.width, alto: preferida.height };
}

/* -------------------------------------------------------------------------- */
/*  2c. Punto de entrada unico                                                */
/* -------------------------------------------------------------------------- */

/**
 * Sube el creativo local, sea imagen o video, y devuelve lo que necesita el
 * AdCreative. Para video espera el procesado y trae la miniatura.
 *
 * @param {string} ruta
 * @param {object} [opciones]
 * @param {(paso:string, detalle:any)=>void} [opciones.onPaso]
 * @returns {Promise<{tipo:'imagen'|'video', hash?:string, videoId?:string,
 *                    miniaturaUrl?:string, nombre:string, bytes:number}>}
 */
export async function subirCreativoLocal(ruta, opciones = {}) {
  const onPaso = opciones.onPaso || (() => {});
  const idCuenta = exigirCuenta(opciones.idCuenta);
  const archivo = inspeccionarCreativoLocal(ruta);

  if (archivo.tipo === 'imagen') {
    onPaso('imagen:subiendo', archivo);
    const imagen = await subirImagen(ruta, { idCuenta });
    onPaso('imagen:ok', imagen);
    return imagen;
  }

  onPaso('video:subiendo', archivo);
  const video = await subirVideo(ruta, {
    idCuenta,
    onIntento: (detalle) => onPaso('video:progreso', detalle),
  });

  onPaso('video:procesando', { videoId: video.videoId });
  await esperarProcesadoDeVideo(video.videoId, {
    onIntento: (detalle) => onPaso('video:estado', detalle),
  });

  const miniatura = await obtenerMiniatura(video.videoId);
  onPaso('video:ok', { ...video, miniatura });

  return { ...video, miniaturaUrl: miniatura.uri, miniaturaId: miniatura.id };
}

/* -------------------------------------------------------------------------- */
/*  3. Armado del AdCreative de Click to WhatsApp                             */
/* -------------------------------------------------------------------------- */

/**
 * Enlace de los anuncios de Click to WhatsApp.
 *
 * Va PELADO, sin ?phone= ni ?text=. Es el unico valor que aparece en la
 * documentacion oficial de Meta, y la razon importa:
 *
 *   El numero al que entran los mensajes NO se toma de esta URL. Se toma del
 *   numero de WhatsApp Business vinculado a la Pagina, apuntado desde el
 *   conjunto con promoted_object.whatsapp_phone_number.
 *
 * Meter el numero en la URL parece funcionar pero Meta lo ignora: el anuncio
 * se publica igual y los mensajes caen en la linea que tenga vinculada la
 * Pagina. Es un fallo silencioso — en una red de 13 sedes significa mandar los
 * leads de Neiva a la linea de otra tienda.
 */
export const ENLACE_WHATSAPP = 'https://api.whatsapp.com/send';

/** Deja el numero como lo quiere Meta: solo digitos, con indicativo, sin "+". */
export function normalizarNumeroWhatsApp(numero) {
  const limpio = String(numero || '').replace(/\D/g, '');
  if (!limpio) throw new Error('creatives: falta el numero de WhatsApp de la sede.');
  if (limpio.length < 10) throw new Error(`creatives: el numero de WhatsApp "${numero}" parece incompleto.`);
  return limpio;
}

/**
 * Arma el `page_welcome_message`, que es donde vive de verdad el mensaje
 * prellenado de WhatsApp.
 *
 *   autofill_message.content -> el texto que queda YA ESCRITO en el chat del
 *                               usuario. Es lo que se personaliza por producto.
 *   message.text             -> el saludo que muestra la pantalla previa.
 *
 * Sin esto, WhatsApp prellena su texto por defecto ("Hello! Can I get more
 * info on this?") y se pierde saber de que anuncio vino el lead.
 */
export function construirPageWelcomeMessage({ mensajePrellenado, saludo = '' }) {
  const contenido = String(mensajePrellenado || '').trim();
  if (!contenido) throw new Error('creatives: falta el mensaje prellenado de WhatsApp.');

  const mensaje = { autofill_message: { content: contenido } };
  if (saludo) mensaje.text = String(saludo).trim();

  return {
    type: 'VISUAL_EDITOR',
    version: 2,
    landing_screen_type: 'welcome_message',
    media_type: 'text',
    text_format: {
      customer_action_type: 'autofill_message',
      message: mensaje,
    },
  };
}

/** Normaliza una lista de textos: recorta, quita vacios y repetidos, limita a 5. */
function prepararOpciones(valor, etiqueta) {
  const lista = (Array.isArray(valor) ? valor : [valor])
    .map((t) => String(t ?? '').trim())
    .filter(Boolean);

  const unicos = [...new Set(lista)];
  if (unicos.length === 0) throw new Error(`creatives: falta al menos un valor para "${etiqueta}".`);

  if (unicos.length > MAX_OPCIONES_TEXTO) {
    throw new Error(
      `creatives: "${etiqueta}" trae ${unicos.length} opciones y Meta acepta maximo ` +
        `${MAX_OPCIONES_TEXTO} por anuncio.`,
    );
  }

  return unicos;
}

/**
 * Arma el cuerpo del AdCreative.
 *
 * @param {object} p
 * @param {string} p.nombre                nombre interno del creativo
 * @param {string[]} p.textosPrincipales   hasta 5
 * @param {string[]} p.titulos             hasta 5
 * @param {string[]} p.descripciones       hasta 5
 * @param {string} p.numeroWhatsApp
 * @param {string} [p.mensajePrellenado]
 * @param {object} p.asset                 resultado de subirCreativoLocal()
 * @param {'multiple'|'simple'} [p.modoTexto='multiple']
 * @param {string} [p.cta=CTA_WHATSAPP]
 * @returns {object} params listos para POST /act_<id>/adcreatives
 */
export function armarParamsAdCreative({
  nombre,
  textosPrincipales,
  titulos,
  descripciones,
  mensajePrellenado = '',
  saludoWhatsApp = '',
  asset,
  modoTexto = 'multiple',
  mejoras = 'completo',
  bienvenidaComoObjeto = false,
  cta = CTA_WHATSAPP,
}) {
  if (!PAGE_ID) throw new Error('creatives: falta META_PAGE_ID en el .env (obligatorio para WhatsApp).');
  if (!asset) throw new Error('creatives: falta el asset subido.');

  if (CTA_PROHIBIDOS.has(cta)) {
    throw new Error(
      `creatives: el CTA "${cta}" manda el mensaje a Messenger o a Instagram Direct. ` +
        `Esta campana es solo WhatsApp: usa ${CTA_WHATSAPP}.`,
    );
  }
  if (cta !== CTA_WHATSAPP) {
    throw new Error(`creatives: CTA "${cta}" no admitido. El unico valido para esta campana es ${CTA_WHATSAPP}.`);
  }

  const cuerpos = prepararOpciones(textosPrincipales, 'textos principales');
  const encabezados = prepararOpciones(titulos, 'titulos');
  const descripcionesOk = prepararOpciones(descripciones, 'descripciones');

  // Forma canonica y minima del CTA: value lleva SOLO app_destination.
  const accion = { type: CTA_WHATSAPP, value: { app_destination: 'WHATSAPP' } };

  // El campo esta declarado como string en la referencia de AdCreativeLinkData,
  // aunque los ejemplos de personalizacion lo muestran como objeto anidado.
  // Se manda como string; si Meta lo rechaza, `construirAdCreative` reintenta
  // con el objeto sin serializar.
  const bienvenidaObjeto = construirPageWelcomeMessage({ mensajePrellenado, saludo: saludoWhatsApp });
  const bienvenida = bienvenidaComoObjeto ? bienvenidaObjeto : JSON.stringify(bienvenidaObjeto);

  const base = { name: nombre };
  const dof = mejorasAutomaticas({ modoTexto, nivel: mejoras });
  if (dof) base.degrees_of_freedom_spec = dof;

  const object_story_spec = { page_id: PAGE_ID };
  // instagram_actor_id quedo deprecado el 9 de septiembre de 2025.
  if (INSTAGRAM_USER_ID) object_story_spec.instagram_user_id = INSTAGRAM_USER_ID;

  /* --- Modo simple: un solo texto, un solo titulo, una descripcion -------- */
  if (modoTexto === 'simple') {
    if (asset.tipo === 'imagen') {
      object_story_spec.link_data = {
        image_hash: asset.hash,
        link: ENLACE_WHATSAPP,
        message: cuerpos[0],
        name: encabezados[0],
        description: descripcionesOk[0],
        page_welcome_message: bienvenida,
        call_to_action: accion,
      };
    } else {
      object_story_spec.video_data = {
        video_id: asset.videoId,
        image_url: asset.miniaturaUrl,
        message: cuerpos[0],
        title: encabezados[0],
        link_description: descripcionesOk[0],
        page_welcome_message: bienvenida,
        call_to_action: accion,
      };
    }

    return { ...base, object_story_spec };
  }

  /* --- Modo multiple: las 5 opciones de cada campo ----------------------- */
  // Limites oficiales: 5 bodies, 5 titles, 5 descriptions, 1 ad_format,
  // 5 link_urls, 5 CTA y 30 assets en total. Aqui van 15.
  const asset_feed_spec = {
    bodies: cuerpos.map((text) => ({ text })),
    titles: encabezados.map((text) => ({ text })),
    descriptions: descripcionesOk.map((text) => ({ text })),
    link_urls: [{ website_url: ENLACE_WHATSAPP }],
    call_to_action_types: [CTA_WHATSAPP],
    ad_formats: [asset.tipo === 'imagen' ? 'SINGLE_IMAGE' : 'SINGLE_VIDEO'],
  };

  if (asset.tipo === 'imagen') {
    asset_feed_spec.images = [{ hash: asset.hash }];
  } else {
    asset_feed_spec.videos = [{ video_id: asset.videoId, thumbnail_url: asset.miniaturaUrl }];
  }

  // El mensaje prellenado no tiene sitio dentro de asset_feed_spec, asi que
  // viaja igual por link_data, que es donde Meta lo lee.
  object_story_spec.link_data = {
    link: ENLACE_WHATSAPP,
    page_welcome_message: bienvenida,
    call_to_action: accion,
  };
  if (asset.tipo === 'imagen') object_story_spec.link_data.image_hash = asset.hash;

  return { ...base, object_story_spec, asset_feed_spec };
}

/**
 * `degrees_of_freedom_spec` — las mejoras automaticas de Meta, apagadas.
 *
 * Ojo con el paquete `standard_enhancements`: desde la version 22 de la
 * Marketing API dejo de honrarse como interruptor maestro, asi que declararlo
 * no apaga nada por si solo. Hay que optar funcion por funcion, y eso es lo
 * que hace esta funcion: recorre la lista y pone cada una en OPT_OUT.
 *
 * La unica que queda en OPT_IN es `text_optimizations`, y solo en modo
 * multiple. Ver `MEJORA_DE_ROTACION_DE_TEXTO` arriba: no genera ni reescribe
 * nada, es lo que permite servir las 5 variantes escritas a mano.
 *
 * @param {'completo'|'nucleo'|'minimo'|'ninguno'} nivel  que tanto se declara
 */
function mejorasAutomaticas({ modoTexto, nivel = 'completo' }) {
  if (nivel === 'ninguno') return null;

  const spec = {};

  if (nivel !== 'minimo') {
    const lista = nivel === 'completo' ? MEJORAS_APAGADAS : MEJORAS_NUCLEO;
    for (const funcion of lista) {
      spec[funcion] = { enroll_status: 'OPT_OUT' };
    }
  }

  spec[MEJORA_DE_ROTACION_DE_TEXTO] = {
    enroll_status: modoTexto === 'multiple' ? 'OPT_IN' : 'OPT_OUT',
  };

  return { creative_features_spec: spec };
}

/**
 * Que hace cada mejora, dicho en castellano.
 *
 * Una lista de veinte nombres tecnicos en ingles no le dice nada a nadie:
 * "cv_transformation" o "media_liquidity_animated_image" no se entienden ni
 * leyendolos despacio. Aqui cada una tiene su nombre y su grupo, para poder
 * enseñarlas agrupadas y plegadas en vez de como un muro.
 */
export const QUE_HACE_CADA_MEJORA = Object.freeze({
  standard_enhancements: { grupo: 'imagen', que: 'Paquete de mejoras automaticas (ya no funciona como interruptor)' },
  image_touchups: { grupo: 'imagen', que: 'Retoca la foto: recorta, endereza y cambia la proporcion' },
  image_brightness_and_contrast: { grupo: 'imagen', que: 'Sube el brillo y el contraste de la foto' },
  image_templates: { grupo: 'imagen', que: 'Le pega texto y adornos encima a la foto' },
  image_generation: { grupo: 'imagen', que: 'Genera imagenes nuevas con inteligencia artificial' },
  background_generation: { grupo: 'imagen', que: 'Inventa un fondo nuevo detras del producto' },
  cv_transformation: { grupo: 'imagen', que: 'Reencuadra la imagen analizando lo que hay dentro' },
  video_auto_crop: { grupo: 'video', que: 'Recorta el video solo para cada ubicacion' },
  media_liquidity_animated_image: { grupo: 'video', que: 'Convierte la foto en una animacion' },
  music: { grupo: 'video', que: 'Le pone musica de fondo al anuncio' },
  '3d_animation': { grupo: 'video', que: 'Le da efecto de movimiento 3D a la imagen' },
  text_generation: { grupo: 'texto', que: 'Escribe textos nuevos que nadie ha revisado' },
  description_automation: { grupo: 'texto', que: 'Genera la descripcion sola' },
  enhance_cta: { grupo: 'texto', que: 'Cambia el texto del boton por otro que Meta crea mejor' },
  adapt_to_placement: { grupo: 'formato', que: 'Reordena el anuncio segun donde se muestre' },
  profile_card: { grupo: 'formato', que: 'Añade una tarjeta con el perfil de la Pagina' },
  site_extensions: { grupo: 'formato', que: 'Añade enlaces extra a otras partes del sitio' },
  product_extensions: { grupo: 'formato', que: 'Añade productos del catalogo al anuncio' },
  catalog_feed_tags: { grupo: 'formato', que: 'Pone etiquetas del catalogo encima (precio, envio)' },
  inline_comment: { grupo: 'formato', que: 'Escribe comentarios automaticos debajo del anuncio' },
});

/** Como se llama cada grupo delante de una persona. */
export const GRUPOS_DE_MEJORAS = Object.freeze({
  imagen: 'Tocar la imagen',
  video: 'Tocar el video',
  texto: 'Escribir o cambiar textos',
  formato: 'Añadir cosas al anuncio',
});

/**
 * Resumen legible de lo que se va a declarar, para enseñarlo antes de crear.
 * @returns {{rotacionDeTexto:string, apagadas:string[], total:number, grupos:object[]}}
 */
export function describirMejoras({ modoTexto = 'multiple', nivel = 'completo' } = {}) {
  const dof = mejorasAutomaticas({ modoTexto, nivel });
  const spec = dof?.creative_features_spec || {};
  const apagadas = Object.entries(spec)
    .filter(([, v]) => v.enroll_status === 'OPT_OUT')
    .map(([k]) => k)
    .sort();

  // Agrupadas y traducidas, para que la interfaz pueda enseñarlas plegadas.
  const grupos = Object.entries(GRUPOS_DE_MEJORAS)
    .map(([clave, etiqueta]) => ({
      clave,
      etiqueta,
      funciones: apagadas
        .filter((f) => QUE_HACE_CADA_MEJORA[f]?.grupo === clave)
        .map((f) => ({ campo: f, que: QUE_HACE_CADA_MEJORA[f].que })),
    }))
    .filter((g) => g.funciones.length > 0);

  return {
    rotacionDeTexto: spec[MEJORA_DE_ROTACION_DE_TEXTO]?.enroll_status || 'no declarada',
    apagadas,
    total: apagadas.length,
    grupos,
  };
}

/**
 * Escalera de intentos para crear el AdCreative.
 *
 * REGLA: todos los escalones de un mismo modo llevan EXACTAMENTE los mismos
 * textos. Lo unico que cambia entre escalones es el envoltorio —cuantas
 * mejoras se declaran y como se codifica el mensaje de bienvenida—, nunca el
 * contenido. Un reintento no puede quitarle variantes de texto al anuncio.
 *
 * Hace falta una escalera porque Meta no documenta la ruta de "5 opciones de
 * texto" en un anuncio normal: las dos rutas publicadas de `asset_feed_spec`
 * son Dynamic Creative (un solo anuncio por conjunto) y personalizacion por
 * ubicacion (minimo dos reglas). Lo que hace Ads Manager al poner varios
 * textos no tiene equivalente publicado, y ademas los nombres de algunas
 * mejoras cambian entre versiones de la API.
 */
export function escaleraDeIntentos(modoTexto = 'multiple') {
  if (modoTexto === 'simple') {
    return [
      { modoTexto: 'simple', mejoras: 'completo', etiqueta: 'un texto, con todas las mejoras apagadas' },
      { modoTexto: 'simple', mejoras: 'nucleo', etiqueta: 'un texto, apagando solo las mejoras confirmadas' },
      {
        modoTexto: 'simple',
        mejoras: 'nucleo',
        bienvenidaComoObjeto: true,
        etiqueta: 'un texto, con el mensaje de bienvenida sin serializar',
      },
    ];
  }

  return [
    {
      modoTexto: 'multiple',
      mejoras: 'completo',
      etiqueta: 'los 5 textos, 5 titulos y 5 descripciones, con todas las mejoras apagadas',
    },
    {
      modoTexto: 'multiple',
      mejoras: 'nucleo',
      etiqueta: 'los 5 textos, apagando solo las mejoras de nombre confirmado',
    },
    {
      modoTexto: 'multiple',
      mejoras: 'nucleo',
      bienvenidaComoObjeto: true,
      etiqueta: 'los 5 textos, con el mensaje de bienvenida sin serializar',
    },
    {
      modoTexto: 'multiple',
      mejoras: 'minimo',
      etiqueta: 'los 5 textos, declarando solo la rotacion de texto',
    },
    {
      modoTexto: 'multiple',
      mejoras: 'ninguno',
      etiqueta: 'los 5 textos, sin declarar mejoras',
    },
  ];
}

/**
 * Crea el AdCreative en Meta.
 *
 * Nunca reduce el numero de textos. Si ningun escalon pasa, lanza con el
 * detalle de todos los rechazos: es preferible no crear el anuncio a crearlo
 * distinto de lo que se aprobo en pantalla.
 *
 * El ultimo escalon crea el anuncio sin declarar las mejoras. Eso no las
 * enciende, pero tampoco deja constancia de que estan apagadas, asi que se
 * devuelve en `mejorasSinDeclarar` para que la interfaz lo muestre y la
 * verificacion posterior lo relea de Meta.
 *
 * @returns {Promise<{id:string, nombre:string, modoTexto:string, escalon:string,
 *                    mejorasSinDeclarar:boolean, rechazos:string[], params:object}>}
 */
export async function construirAdCreative(datos, opciones = {}) {
  const log = opciones.onPaso || (() => {});
  const modoPedido = datos.modoTexto || 'multiple';
  const intentos = escaleraDeIntentos(modoPedido);
  const rechazos = [];

  for (const [indice, intento] of intentos.entries()) {
    const params = armarParamsAdCreative({ ...datos, ...intento });

    try {
      const id = await crearAdCreative(params, datos.idCuenta);

      return {
        id,
        nombre: datos.nombre,
        modoTexto: intento.modoTexto,
        escalon: intento.etiqueta,
        mejorasSinDeclarar: intento.mejoras === 'ninguno',
        rechazos,
        params,
      };
    } catch (error) {
      // Un token invalido o un permiso que falta no se arregla cambiando el
      // envoltorio: eso se reporta tal cual y se corta.
      if (!esRechazoDeFormato(error)) throw error;

      rechazos.push(`${intento.etiqueta} → ${error.message}`);
      log('creative:reintento', { intento: intento.etiqueta, motivo: error.message });

      if (indice === intentos.length - 1) {
        const e = new Error(
          `creatives: Meta rechazo el creativo "${datos.nombre}" en los ${intentos.length} formatos probados, ` +
            'y ninguno reduce el numero de textos a proposito.\n' +
            `  Intentos:\n    - ${rechazos.join('\n    - ')}\n` +
            '  El anuncio NO se creo. Si quieres crearlo con un solo texto, titulo y descripcion, ' +
            "ponlo explicito con modoTexto: 'simple' en el archivo de la campana.",
        );
        e.metaError = error.metaError;
        e.rechazos = rechazos;
        throw e;
      }
    }
  }

  // Inalcanzable: el bucle o devuelve o lanza.
  throw new Error('creatives: no se pudo crear el AdCreative.');
}

/* -------------------------------------------------------------------------- */
/*  4. Verificacion: releer de Meta como quedo el creativo                    */
/* -------------------------------------------------------------------------- */

/**
 * Relee un AdCreative ya creado y comprueba las dos cosas que no se pueden dar
 * por hechas: que los textos llegaron completos y que las mejoras quedaron
 * apagadas.
 *
 * Es lo unico que prueba de verdad lo que hay en Meta. Lo que se envio es una
 * intencion; esto es el resultado.
 *
 * @param {string} creativeId
 * @param {object} [esperado]
 * @param {number} [esperado.textos]        cuantos textos principales se mandaron
 * @param {number} [esperado.titulos]
 * @param {number} [esperado.descripciones]
 * @returns {Promise<{textos:object, mejoras:object, encendidas:string[], problemas:string[]}>}
 */
export async function verificarCreativo(creativeId, esperado = {}) {
  const data = await getGraph(
    creativeId,
    { fields: 'id,name,asset_feed_spec,degrees_of_freedom_spec' },
    { contexto: `Releyendo el creativo ${creativeId}` },
  );

  const feed = data?.asset_feed_spec || {};
  const spec = data?.degrees_of_freedom_spec?.creative_features_spec || {};
  const problemas = [];

  const textos = {
    textosPrincipales: (feed.bodies || []).length,
    titulos: (feed.titles || []).length,
    descripciones: (feed.descriptions || []).length,
  };

  // Un creativo en modo simple no lleva asset_feed_spec: ahi no hay nada que
  // contar y el conteo esperado tampoco se pasa.
  const pares = [
    ['textosPrincipales', 'textos principales'],
    ['titulos', 'titulos'],
    ['descripciones', 'descripciones'],
  ];

  for (const [campo, etiqueta] of pares) {
    const seEsperaban = Number(esperado[campo] || 0);
    if (seEsperaban > 1 && textos[campo] !== seEsperaban) {
      problemas.push(
        `se mandaron ${seEsperaban} ${etiqueta} y en Meta quedaron ${textos[campo]}.`,
      );
    }
  }

  // Cualquier mejora en OPT_IN que no sea la rotacion de texto es una
  // optimizacion automatica activa, que es justo lo que no debe haber.
  const encendidas = Object.entries(spec)
    .filter(([clave, valor]) => clave !== MEJORA_DE_ROTACION_DE_TEXTO && valor?.enroll_status === 'OPT_IN')
    .map(([clave]) => clave);

  for (const clave of encendidas) {
    problemas.push(`la mejora automatica "${clave}" quedo en OPT_IN.`);
  }

  if (Object.keys(spec).length === 0) {
    problemas.push(
      'el creativo no devolvio creative_features_spec, asi que no se puede confirmar desde aqui que ' +
        'las mejoras esten apagadas. Revisalo en Ads Manager → el anuncio → "Mejoras automaticas".',
    );
  }

  return { id: creativeId, textos, mejoras: spec, encendidas, problemas };
}

async function crearAdCreative(params, idCuenta) {
  const cuenta = exigirCuenta(idCuenta);
  const form = new FormData();
  form.append('access_token', ACCESS_TOKEN);

  for (const [clave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null) continue;
    form.append(clave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor));
  }

  if (DEBUG) console.log('[creatives] adcreative params:', JSON.stringify(params, null, 2));

  const data = await postMultipart(`${cuenta}/adcreatives`, form, {
    timeout: 120000,
    contexto: `Creando el AdCreative "${params.name}"`,
  });

  if (!data?.id) {
    throw new Error(`creatives: Meta no devolvio id de AdCreative. Respuesta: ${JSON.stringify(data)}`);
  }
  return data.id;
}

/**
 * Distingue "este formato no me lo aceptas" de un error que no se arregla
 * reintentando. Solo los primeros hacen bajar un escalon.
 *
 *   code 100  parametro invalido -> es el que devuelve Meta cuando la cuenta
 *             no admite el formato del creativo
 *   code 190  token invalido o caducado      -> se reporta, no se reintenta
 *   code 10 / 200  permisos insuficientes    -> se reporta, no se reintenta
 *   code 17 / 4    limite de peticiones      -> se reporta, no se reintenta
 */
function esRechazoDeFormato(error) {
  const meta = error?.metaError;
  if (!meta) return false;
  if ([190, 102, 10, 200, 17, 4, 80004].includes(Number(meta.code))) return false;

  const texto = `${meta.message || ''} ${meta.error_user_msg || ''} ${meta.error_user_title || ''}`.toLowerCase();

  const sobreElCreativo = [
    'asset_feed_spec',
    'asset feed',
    'dynamic creative',
    'degrees_of_freedom',
    'creative_features_spec',
    'enroll_status',
    'page_welcome_message',
    'text_optimizations',
    'image_touchups',
    'inline_comment',
    'call_to_action',
    'object_story_spec',
  ].some((t) => texto.includes(t));

  return sobreElCreativo || Number(meta.code) === 100;
}

export default {
  inspeccionarCreativoLocal,
  subirCreativoLocal,
  subirImagen,
  subirVideo,
  esperarProcesadoDeVideo,
  obtenerMiniatura,
  construirAdCreative,
  armarParamsAdCreative,
  construirPageWelcomeMessage,
  normalizarNumeroWhatsApp,
  verificarCreativo,
  describirMejoras,
  escaleraDeIntentos,
  ENLACE_WHATSAPP,
  CTA_WHATSAPP,
  MAX_OPCIONES_TEXTO,
  MEJORAS_APAGADAS,
  MEJORAS_NUCLEO,
  MEJORAS_EXTRA,
  MEJORA_DE_ROTACION_DE_TEXTO,
};
