/**
 * ============================================================================
 *  src/config.js — Autenticacion e inicializacion de la API de Meta
 * ============================================================================
 *  Responsabilidades:
 *   1. Cargar y validar el .env
 *   2. Inicializar FacebookAdsApi con el access token
 *   3. Exportar una instancia reutilizable de AdAccount
 *   4. Exportar constantes de negocio (PAGE_ID, WhatsApp, estado PAUSED)
 * ============================================================================
 */
 
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';
import bizSdk from 'facebook-nodejs-business-sdk';

const { FacebookAdsApi, AdAccount } = bizSdk;
 
/* -------------------------------------------------------------------------- */
/*  1. Validacion de variables de entorno                                     */
/* -------------------------------------------------------------------------- */
 
/**
 * Variables sin las cuales no se puede hablar con la API.
 *
 * La validacion NO se hace al importar el modulo: se hace cuando alguien va a
 * llamar a Meta, con `exigirCredenciales()`. Asi las herramientas que solo
 * leen archivos locales (npm test, npm run lineas) funcionan aunque todavia no
 * haya token, que es justo lo que hace falta para preparar la campana antes de
 * tener las credenciales.
 */
const VARIABLES_OBLIGATORIAS = [
  { clave: 'META_APP_ID', para: 'identificar la app de Meta' },
  { clave: 'META_APP_SECRET', para: 'firmar las llamadas de la app' },
  { clave: 'META_ACCESS_TOKEN', para: 'autenticarse contra el Graph API' },
  // META_AD_ACCOUNT_ID ya no es obligatoria: la cuenta se deduce de la sede.
];

const vacia = (clave) => !process.env[clave] || String(process.env[clave]).trim() === '';

/** Lista de variables obligatorias que siguen sin valor. */
export function credencialesFaltantes() {
  return VARIABLES_OBLIGATORIAS.filter((v) => vacia(v.clave));
}

/**
 * Lanza si falta alguna credencial. Se llama justo antes de la primera
 * llamada a Meta, nunca al importar.
 */
export function exigirCredenciales() {
  const faltantes = credencialesFaltantes();
  if (faltantes.length === 0) {
    inicializarApi();
    return;
  }

  const detalle = faltantes.map((v) => `    - ${v.clave}  (${v.para})`).join('\n');
  throw new Error(
    'Faltan variables en el archivo .env:\n' +
      `${detalle}\n\n` +
      '  Se sacan en developers.facebook.com -> tu app -> Configuracion -> Basica,\n' +
      '  y el token en Business Manager -> Usuarios del sistema -> Generar token,\n' +
      '  con los permisos ads_management, ads_read y business_management.',
  );
}

/* -------------------------------------------------------------------------- */
/*  2. Constantes derivadas                                                   */
/* -------------------------------------------------------------------------- */

export const APP_ID = (process.env.META_APP_ID || '').trim();
export const APP_SECRET = (process.env.META_APP_SECRET || '').trim();
export const ACCESS_TOKEN = (process.env.META_ACCESS_TOKEN || '').trim();

/** Normaliza el ID de cuenta: acepta "123..." o "act_123..." y siempre devuelve "act_123...". */
function normalizarCuenta(valor) {
  const limpio = String(valor || '').trim();
  if (!limpio) return '';
  return limpio.startsWith('act_') ? limpio : `act_${limpio}`;
}

/**
 * Las dos cuentas publicitarias de la red.
 *
 * Cada sede vive en una de ellas (manual, punto 7), asi que la cuenta no se
 * elige a mano: se deduce de la sede que se esta pautando. Asi no hay que
 * editar el .env cada vez que se cambia de tienda, que es justo el momento en
 * que uno se equivoca y crea la campana de Neiva en la cuenta de Ipiales.
 */
export const CUENTAS = Object.freeze({
  'CA 01': normalizarCuenta(process.env.META_AD_ACCOUNT_CA01 || '2191226887906149'),
  'CA 02': normalizarCuenta(process.env.META_AD_ACCOUNT_CA02 || '2776880309009610'),
});

/** Override manual: si tiene valor, gana sobre la cuenta de la sede. */
export const AD_ACCOUNT_ID = normalizarCuenta(process.env.META_AD_ACCOUNT_ID);

/**
 * Devuelve la cuenta publicitaria donde hay que crear la campana de una sede.
 *
 * @param {{codigo:string, cuenta:string}} fichaSede  ficha de nomenclatura.js
 * @param {string} [cuentaPedida]  'CA 01' o 'CA 02', para las sedes que estan
 *                                 en las dos (hoy solo Medellin)
 * @returns {{id:string, etiqueta:string, origen:string, avisos:string[]}}
 */
export function cuentaDeSede(fichaSede, cuentaPedida = '') {
  const avisos = [];

  if (AD_ACCOUNT_ID) {
    const etiqueta = Object.entries(CUENTAS).find(([, id]) => id === AD_ACCOUNT_ID)?.[0] || '(no reconocida)';
    if (!fichaSede.cuenta.includes(etiqueta)) {
      avisos.push(
        `META_AD_ACCOUNT_ID apunta a ${etiqueta} (${AD_ACCOUNT_ID}), pero segun el manual ` +
          `${fichaSede.codigo} va en ${fichaSede.cuenta}. Se respeta el .env, pero revisa que sea lo que quieres.`,
      );
    }
    return { id: AD_ACCOUNT_ID, etiqueta, origen: 'META_AD_ACCOUNT_ID del .env', avisos };
  }

  // 'CA 01 y CA 02' -> la sede esta repartida y hay que elegir.
  const posibles = Object.keys(CUENTAS).filter((c) => fichaSede.cuenta.includes(c));

  if (posibles.length === 0) {
    throw new Error(
      `config: no se sabe en que cuenta va la sede ${fichaSede.codigo} ("${fichaSede.cuenta}"). ` +
        'Pon META_AD_ACCOUNT_ID en el .env.',
    );
  }

  let elegida = posibles[0];

  if (posibles.length > 1) {
    const pedida = String(cuentaPedida || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const normalizada = pedida.replace(/^CA(\d)/, 'CA 0$1');

    if (normalizada && posibles.includes(normalizada)) {
      elegida = normalizada;
    } else {
      avisos.push(
        `${fichaSede.codigo} esta en ${fichaSede.cuenta}. Se tomo ${elegida}. ` +
          `Si va en la otra, pon cuenta: '${posibles[1]}' en el archivo de la campana. ` +
          'Recuerda que su C# es uno solo entre las dos cuentas (punto 7).',
      );
    }
  }

  if (!CUENTAS[elegida]) {
    throw new Error(`config: falta el id de la cuenta ${elegida}. Ponlo en META_AD_ACCOUNT_${elegida.replace(' ', '')}.`);
  }

  return { id: CUENTAS[elegida], etiqueta: elegida, origen: `sede ${fichaSede.codigo} (manual, punto 7)`, avisos };
}

/** Page ID de Facebook. Obligatorio para crear anuncios de WhatsApp. */
export const PAGE_ID = (process.env.META_PAGE_ID || '').trim();

/**
 * Pagina de Facebook de una sede. El WhatsApp de la sede tiene que estar
 * vinculado a ESA pagina, o Meta rechaza el conjunto con "This WhatsApp phone
 * number is not linked to your account". Casi todas las sedes usan META_PAGE_ID;
 * la que tenga su linea en otra pagina se declara aparte en el .env:
 *   META_PAGE_ID_NEIVA=<id de la pagina donde esta el WhatsApp de Neiva>
 * El token tiene que tener acceso a esa pagina.
 */
export function paginaDeSede(sede) {
  const clave = `META_PAGE_ID_${String(sede || '').toUpperCase()}`;
  return (process.env[clave] || '').trim() || PAGE_ID;
}

/**
 * Numero de WhatsApp Business, formato internacional sin "+".
 *
 * OJO: normalmente esto va VACIO. El numero de cada sede se lee de
 * lineas.xlsx (ver src/lineas.js), que es la fuente unica de verdad.
 * Rellenar esta variable es un override manual que gana sobre el Excel; solo
 * tiene sentido para probar con una linea que todavia no esta en el archivo.
 */
export const WHATSAPP_NUMBER = (process.env.META_WHATSAPP_NUMBER || '')
  .trim()
  .replace(/[^\d]/g, '');

/** Ruta del Excel con la linea de WhatsApp de cada sede. */
export const RUTA_LINEAS_XLSX = resolve(
  (process.env.CELRED_LINEAS_XLSX || '').trim() || join(dirname(fileURLToPath(import.meta.url)), '..', 'lineas.xlsx'),
);

/**
 * Cuenta de Instagram vinculada (opcional).
 *
 * En el creativo se envia como `instagram_user_id`. El nombre viejo,
 * `instagram_actor_id`, quedo deprecado en todas las versiones de la API el
 * 9 de septiembre de 2025. La variable de entorno conserva el nombre antiguo
 * por compatibilidad con .env existentes, pero se acepta cualquiera de las dos.
 */
export const INSTAGRAM_USER_ID = (
  process.env.META_INSTAGRAM_USER_ID ||
  process.env.META_INSTAGRAM_ACTOR_ID ||
  ''
).trim();

/**
 * Cuenta de Instagram de una sede, para que el anuncio salga en Instagram a
 * nombre de esa cuenta y no de la pagina. Va con la pagina de la sede:
 *   META_INSTAGRAM_USER_ID_NEIVA=<id de la cuenta de Instagram de Celredco>
 * Sin declarar, se usa META_INSTAGRAM_USER_ID, y si tampoco hay, ninguna: Meta
 * acepta el anuncio y en Instagram lo muestra con el nombre de la pagina. El
 * token tiene que tener acceso a la cuenta de Instagram, o Meta lo rechaza.
 */
export function instagramDeSede(sede) {
  const clave = `META_INSTAGRAM_USER_ID_${String(sede || '').toUpperCase()}`;
  return (process.env[clave] || '').trim() || INSTAGRAM_USER_ID;
}

export const DEBUG = process.env.META_DEBUG === '1';
 
/* -------------------------------------------------------------------------- */
/*  3. Inicializacion del SDK                                                 */
/* -------------------------------------------------------------------------- */
 
/**
 * El SDK lanza "Access token required" si se inicializa con el token vacio,
 * asi que la inicializacion es perezosa: ocurre en `exigirCredenciales()`, no
 * al importar. De ese modo `npm test` y `npm run lineas` corren sin token.
 */
let _api = null;

function inicializarApi() {
  if (_api) return _api;
  _api = FacebookAdsApi.init(ACCESS_TOKEN);
  if (DEBUG) _api.setDebug(true);
  return _api;
}

/** Instancia del SDK ya autenticada. Lanza si falta alguna credencial. */
export function obtenerApi() {
  exigirCredenciales();
  return inicializarApi();
}

/** Version del Graph API que usa el SDK instalado (ej. "v24.0"). */
export const GRAPH_VERSION = FacebookAdsApi.VERSION;
export const GRAPH_HOST = FacebookAdsApi.GRAPH; // https://graph.facebook.com
export const GRAPH_BASE = `${GRAPH_HOST}/${GRAPH_VERSION}`;

/**
 * Instancia de AdAccount por cuenta, cacheada.
 * Construirla no llama a la red; la primera peticion pasa por
 * `exigirCredenciales()`, que es quien inicializa el SDK.
 */
const _cuentas = new Map();

export function adAccountDe(idCuenta) {
  const id = String(idCuenta || '').trim();
  if (!id) throw new Error('config: falta el id de la cuenta publicitaria.');

  // El SDK ata la conexion al objeto EN EL MOMENTO de construirlo. Si se
  // construia antes de iniciar el SDK (un plan sin conexion en el panel), la
  // copia quedaba en cache sin conexion y la siguiente creacion real fallaba
  // con "AdAccount does not yet have an associated api object". Por eso se
  // inicia el SDK antes, cuando hay token, y solo se cachea con conexion.
  const api = ACCESS_TOKEN ? inicializarApi() : null;
  if (!api) return new AdAccount(id);

  if (!_cuentas.has(id)) _cuentas.set(id, new AdAccount(id, undefined, undefined, api));
  return _cuentas.get(id);
}
 
/* -------------------------------------------------------------------------- */
/*  4. Constantes de negocio — REGLAS INQUEBRANTABLES                         */
/* -------------------------------------------------------------------------- */
 
/**
 * REGLA 1: Modo borrador por defecto.
 * Es el estado con el que se crea todo salvo que la configuracion de la
 * corrida pida explicitamente otra cosa y el humano lo apruebe en pantalla.
 */
export const ESTADO_OBLIGATORIO = 'PAUSED';

/** Unicos estados con los que builder.js acepta crear objetos. */
export const ESTADOS_VALIDOS = ['PAUSED', 'ACTIVE'];

/**
 * El objetivo ya NO vive aqui.
 *
 * Antes esto era una constante suelta con el valor de Meta
 * ('OUTCOME_ENGAGEMENT'), lo que mezclaba tres cosas distintas: el objetivo de
 * la campana, la meta de optimizacion del conjunto y el destino del mensaje.
 * Ahora cada objetivo declara los tres por separado en `src/objetivos.js`.
 */
 
/**
 * Monedas que Meta maneja SIN subunidades: el monto se envia tal cual.
 *
 * El COP va aqui. Meta lo trata con offset 1: un conjunto de $25.000 al dia
 * se guarda como daily_budget=25000 (comprobado el 24/09/2026 releyendo los
 * conjuntos hechos a mano en CA 01 y CA 02; min_daily_budget de la cuenta
 * tambien viene en pesos enteros, 3165). Antes el COP se multiplicaba por 100
 * y un conjunto de $25.000 llegaba a Meta como $2.500.000 al dia.
 */
const MONEDAS_SIN_DECIMALES = new Set([
  'COP', 'CRC', 'HUF', 'IDR', 'ISK', 'TWD',
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW',
  'MGA', 'PYG', 'RWF', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);
 
/** Factor de conversion de moneda mayor -> unidad menor que exige la API. */
export function factorMoneda(codigoMoneda) {
  return MONEDAS_SIN_DECIMALES.has(String(codigoMoneda).toUpperCase()) ? 1 : 100;
}
 
/* -------------------------------------------------------------------------- */
/*  5. Lectura de metadatos de la cuenta (con cache en memoria)               */
/* -------------------------------------------------------------------------- */
 
const _cacheInfo = new Map();

/**
 * Lee nombre, moneda, zona horaria, estado y presupuesto minimo de una cuenta.
 * Solo lectura: no modifica nada.
 *
 * @param {string} idCuenta  'act_2776880309009610'
 * @returns {Promise<{id,name,currency,timezone_name,account_status,min_daily_budget,factor}>}
 */
export async function obtenerInfoCuenta(idCuenta, { forzar = false } = {}) {
  const id = String(idCuenta || AD_ACCOUNT_ID || '').trim();
  if (!id) throw new Error('config: no se sabe de que cuenta publicitaria leer los datos.');

  if (_cacheInfo.has(id) && !forzar) return _cacheInfo.get(id);

  exigirCredenciales();

  const campos = [
    'id',
    'name',
    'currency',
    'timezone_name',
    'account_status',
    'min_daily_budget',
  ];

  const resultado = await adAccountDe(id).read(campos);
  const datos = resultado._data ? { ...resultado._data } : { ...resultado };

  datos.factor = factorMoneda(datos.currency);
  _cacheInfo.set(id, datos);
  return datos;
}
 
/** Convierte un monto en moneda mayor (ej. 20000 COP) a la unidad menor que exige Meta. */
export function aUnidadMenor(monto, factor) {
  return String(Math.round(Number(monto) * factor));
}
 
/** Formatea un entero de unidad menor de vuelta a moneda legible. */
export function formatearMoneda(montoUnidadMenor, moneda = 'COP', factor = factorMoneda(moneda)) {
  const mayor = Number(montoUnidadMenor) / factor;
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(mayor)} ${moneda}`;
}
 
export default {
  obtenerApi,
  adAccountDe,
  cuentaDeSede,
  CUENTAS,
  AD_ACCOUNT_ID,
  PAGE_ID,
  WHATSAPP_NUMBER,
  RUTA_LINEAS_XLSX,
  INSTAGRAM_USER_ID,
  ESTADO_OBLIGATORIO,
  ESTADOS_VALIDOS,
  GRAPH_BASE,
  GRAPH_VERSION,
  obtenerInfoCuenta,
  exigirCredenciales,
  credencialesFaltantes,
};
 