/**
 * ============================================================================
 *  src/interprete.js — De una frase en espanol a una campana
 * ============================================================================
 *  Convierte
 *
 *    "campana para la victoria con 2 conjuntos de anuncios, uno para android
 *     con 3 anuncios redmi 15, samsung a07 y samsung a17, y otro de iphone
 *     con iphone 15, iphone 13 y iphone 14"
 *
 *  en la misma estructura que tendria un archivo de campanas/: sede, conjuntos,
 *  anuncios, creativos resueltos y copys generados.
 *
 *  COMO INTERPRETA, Y POR QUE ASI
 *
 *  No hay modelo de lenguaje detras: es un analizador de reglas. Eso significa
 *  que es predecible y que funciona sin conexion, pero tambien que solo
 *  entiende lo que esta escrito en sus diccionarios. Cuando algo no lo
 *  entiende NO lo adivina: lo deja anotado en `problemas` o en `avisos` para
 *  que la persona lo vea antes de aprobar nada.
 *
 *  El agrupado en conjuntos NO se hace partiendo frases, que en espanol libre
 *  es fragil. Se hace por FAMILIA DE PRODUCTO: se recorre el texto en orden y
 *  cada producto entra al grupo de la familia que este activa (iPhone, Android,
 *  Mac/iPad). Una familia se activa cuando aparece su palabra clave, y si no
 *  aparece ninguna, cada producto activa la suya. Asi, "3 android y 3 iphone"
 *  da dos conjuntos aunque la frase este escrita de cualquier manera.
 *
 *  EL CREATIVO MANDA SOBRE EL FORMATO
 *
 *  El formato de cada anuncio no se pide ni se adivina: sale del archivo que
 *  hay en creativos/<sede>/. Si de un producto hay foto Y video, se crean DOS
 *  anuncios, uno de cada uno. Si no hay ninguna pieza, el producto se reporta
 *  como faltante y no se inventa un anuncio sin creativo.
 * ============================================================================
 */

import { CODIGOS_SEGMENTO, MAX_ANUNCIOS_POR_CONJUNTO, SEDES, normalizarCampo } from './nomenclatura.js';
import { SEDES as SEDES_GEO } from './targeting.js';
import { statSync } from 'node:fs';
import { basename, extname } from 'node:path';

import { listarCreativosDeSede, resolverCreativo } from './creativos-sede.js';
import { OBJETIVOS } from './objetivos.js';
import { SEDES_POR_REGION, REGIONES } from './nomenclatura.js';
import { generarCopys } from './copys.js';

/* -------------------------------------------------------------------------- */
/*  Normalizacion                                                             */
/* -------------------------------------------------------------------------- */

/** Minusculas, sin tildes, sin puntuacion, espacios colapsados. */
export function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Solo letras y numeros, sin espacios: para comparar con nombres de archivo. */
const compacto = (texto) => normalizar(texto).replace(/\s/g, '');

/* -------------------------------------------------------------------------- */
/*  Diccionario de sedes                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Como nombra la gente cada sede. La clave es lo que se escribe; el valor, el
 * codigo del manual y la clave de targeting.
 *
 * Las formas mas especificas tienen que poder ganarle a las mas generales:
 * "la 16" gana sobre "pasto", que por si solo es ambiguo (tres tiendas).
 */
const ALIAS_SEDE = Object.freeze({
  // Pasto
  'la 16': 'LA16',
  la16: 'LA16',
  'sede la 16': 'LA16',
  'calle 16': 'LA16',
  sebastian: 'SEBASTIAN',
  'sebastian de belalcazar': 'SEBASTIAN',
  'cc sebastian': 'SEBASTIAN',
  belalcazar: 'SEBASTIAN',
  liceo: 'LICEO',
  'el liceo': 'LICEO',

  // Ipiales
  victoria: 'VICTORIA',
  'la victoria': 'VICTORIA',
  'victoria plaza': 'VICTORIA',
  zafiro: 'ZAFIRO',
  'cc zafiro': 'ZAFIRO',
  markus: 'MARKUS',

  // Una sede por ciudad
  tuquerres: 'TUQUERRES',
  orito: 'ORITO',
  'la hormiga': 'HORMIGA',
  hormiga: 'HORMIGA',
  'puerto asis': 'PTOASIS',
  ptoasis: 'PTOASIS',
  'pto asis': 'PTOASIS',
  mocoa: 'MOCOA',
  medellin: 'MEDELLIN',
  neiva: 'NEIVA',
});

/** Ciudades con varias tiendas: nombrarlas a secas no alcanza. */
const CIUDADES_AMBIGUAS = Object.freeze({
  pasto: ['LA16', 'SEBASTIAN', 'LICEO'],
  ipiales: ['VICTORIA', 'ZAFIRO', 'MARKUS'],
});

/** La clave de targeting de cada codigo de sede. */
const TARGETING_DE_SEDE = Object.fromEntries(
  Object.entries(SEDES_GEO).map(([clave, ficha]) => [ficha.codigo, clave]),
);

/**
 * Busca la sede en el texto. Prefiere siempre la coincidencia mas larga, para
 * que "la victoria" gane sobre "victoria" y "la 16" sobre "16".
 */
export function detectarSede(texto) {
  const t = ` ${normalizar(texto)} `;

  const encontrados = Object.entries(ALIAS_SEDE)
    .filter(([alias]) => t.includes(` ${alias} `))
    .sort((a, b) => b[0].length - a[0].length);

  if (encontrados.length > 0) {
    const codigo = encontrados[0][1];
    const otros = [...new Set(encontrados.map(([, c]) => c))].filter((c) => c !== codigo);
    return {
      sede: codigo,
      sedeTargeting: TARGETING_DE_SEDE[codigo],
      alias: encontrados[0][0],
      tambienSonaron: otros,
    };
  }

  // Solo se nombro la ciudad. Si tiene una sola tienda, vale; si tiene varias,
  // hay que preguntar en vez de elegir por el usuario.
  for (const [ciudad, sedes] of Object.entries(CIUDADES_AMBIGUAS)) {
    if (t.includes(` ${ciudad} `)) {
      return {
        sede: null,
        ambiguo: sedes,
        ciudad,
        motivo:
          `En ${ciudad} hay ${sedes.length} tiendas (${sedes.join(', ')}). ` +
          'Di cual: por ejemplo "sede La 16" o "sede Zafiro".',
      };
    }
  }

  // Sin sede no hay campana posible, asi que el mensaje tiene que decir
  // exactamente que se puede escribir, no solo que falta algo.
  const comoSeEscriben = [
    'Pasto: "sede La 16", "sede Sebastian", "sede El Liceo"',
    'Ipiales: "sede La Victoria", "sede Zafiro", "sede Markus"',
    'Y las que son unicas en su ciudad: Tuquerres, Orito, La Hormiga, Puerto Asis, Mocoa, Medellin, Neiva',
  ];

  return {
    sede: null,
    motivo:
      'No reconoci ninguna sede. Dime para cual es la campana:\n' +
      comoSeEscriben.map((l) => `  ${l}`).join('\n'),
  };
}

/* -------------------------------------------------------------------------- */
/*  Diccionario de productos                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Marcas que se venden, con la familia a la que pertenecen.
 *   'IPH'  -> iPhone y demas Apple de telefonia
 *   'MAC'  -> Mac, iPad y accesorios Apple
 *   'AND'  -> todo lo Android
 *
 * `etiqueta` es como se escribe bonito en los textos; el nombre del modelo se
 * le pega detras tal como lo escribio la persona.
 */
const MARCAS = Object.freeze([
  { clave: 'iphone', etiqueta: 'iPhone', familia: 'IPH' },
  { clave: 'ipad', etiqueta: 'iPad', familia: 'MAC' },
  { clave: 'macbook', etiqueta: 'MacBook', familia: 'MAC' },
  { clave: 'mac', etiqueta: 'Mac', familia: 'MAC' },
  { clave: 'apple watch', etiqueta: 'Apple Watch', familia: 'MAC' },
  { clave: 'airpods', etiqueta: 'AirPods', familia: 'MAC' },
  { clave: 'samsung', etiqueta: 'Samsung', familia: 'AND' },
  { clave: 'galaxy', etiqueta: 'Samsung Galaxy', familia: 'AND' },
  { clave: 'xiaomi', etiqueta: 'Xiaomi', familia: 'AND' },
  { clave: 'redmi', etiqueta: 'Redmi', familia: 'AND' },
  { clave: 'poco', etiqueta: 'POCO', familia: 'AND' },
  { clave: 'motorola', etiqueta: 'Motorola', familia: 'AND' },
  { clave: 'moto', etiqueta: 'Motorola Moto', familia: 'AND' },
  { clave: 'tecno', etiqueta: 'Tecno', familia: 'AND' },
  { clave: 'infinix', etiqueta: 'Infinix', familia: 'AND' },
  { clave: 'honor', etiqueta: 'Honor', familia: 'AND' },
  { clave: 'huawei', etiqueta: 'Huawei', familia: 'AND' },
  { clave: 'oppo', etiqueta: 'OPPO', familia: 'AND' },
  { clave: 'realme', etiqueta: 'realme', familia: 'AND' },
  { clave: 'vivo', etiqueta: 'vivo', familia: 'AND' },
  { clave: 'nokia', etiqueta: 'Nokia', familia: 'AND' },
  { clave: 'zte', etiqueta: 'ZTE', familia: 'AND' },
]);

/** Palabras que activan una familia sin nombrar un modelo concreto. */
const PALABRAS_DE_FAMILIA = Object.freeze({
  iphone: 'IPH',
  iphones: 'IPH',
  apple: 'IPH',
  android: 'AND',
  androids: 'AND',
  mac: 'MAC',
  ipad: 'MAC',
  accesorios: 'MAC',
});

/** Palabras sueltas que NO son parte del modelo aunque vengan detras. */
const CORTES = new Set([
  'y', 'e', 'o', 'u', 'con', 'de', 'del', 'en', 'para', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'anuncio', 'anuncios', 'conjunto', 'conjuntos', 'campana', 'campanas', 'sede', 'tienda',
  'video', 'videos', 'foto', 'fotos', 'imagen', 'imagenes', 'reel', 'reels',
  'credito', 'contado', 'retoma', 'cuotas', 'presupuesto', 'diario', 'dia', 'pesos', 'cop',
  'otro', 'otra', 'tambien', 'ademas', 'que', 'se', 'haga', 'hagan', 'cree', 'creen', 'crea',
  'busque', 'busca', 'muestre', 'muestra', 'por', 'favor', 'todo', 'automaticamente', 'automatico',
]);

/** Marcas ordenadas de mas larga a mas corta, para que "motorola" gane a "moto". */
const MARCAS_POR_LARGO = [...MARCAS].sort((a, b) => b.clave.length - a.clave.length);

/**
 * Parte un modelo escrito pegado en sus trozos legibles.
 *
 *   'hot60pro'   -> ['hot', '60', 'pro']
 *   'a07'        -> ['a07']     (una letra sola se queda pegada a su numero)
 *   's25ultra'   -> ['s25', 'ultra']
 *   '15'         -> ['15']
 */
function partirModeloPegado(resto) {
  const trozos = resto.match(/[a-z]+|\d+/g) || [];
  const salida = [];

  for (let i = 0; i < trozos.length; i += 1) {
    const esLetraSuelta = /^[a-z]$/.test(trozos[i]);
    const siguienteEsNumero = /^\d+$/.test(trozos[i + 1] || '');

    if (esLetraSuelta && siguienteEsNumero) {
      salida.push(trozos[i] + trozos[i + 1]);
      i += 1;
    } else {
      salida.push(trozos[i]);
    }
  }

  return salida;
}

/**
 * Si la palabra es una marca con el modelo pegado, la separa.
 * "infinixhot60pro" -> marca Infinix, modelo ['hot','60','pro']
 *
 * Hace falta porque asi es como se escribe de verdad: nadie teclea
 * "infinix hot 60 pro" cuando el archivo se llama "infinixhot60pro".
 */
function marcaPegada(palabra) {
  for (const marca of MARCAS_POR_LARGO) {
    const clave = marca.clave.replace(/\s/g, '');
    if (palabra.length <= clave.length || !palabra.startsWith(clave)) continue;

    const modelo = partirModeloPegado(palabra.slice(clave.length));
    if (modelo.length > 0 && modelo.some((p) => /\d/.test(p))) {
      return { marca, modelo };
    }
  }
  return null;
}

/**
 * Saca los productos del texto, en orden de aparicion.
 *
 * Un producto es una marca conocida —suelta o pegada al modelo— seguida del
 * modelo, que tiene que llevar al menos un numero.
 *
 * @returns {{referencia:string, producto:string, familia:string, posicion:number}[]}
 */
export function detectarProductos(texto) {
  const palabras = normalizar(texto).split(' ');
  const productos = [];

  for (let i = 0; i < palabras.length; i += 1) {
    // Primero, la marca escrita pegada al modelo: "infinixhot60pro".
    const pegada = marcaPegada(palabras[i]);
    if (pegada) {
      productos.push(armarProducto(pegada.marca, pegada.modelo, i));
      continue;
    }

    // Las marcas de dos palabras ("apple watch") se prueban antes que las de una.
    const dos = `${palabras[i]} ${palabras[i + 1] || ''}`.trim();
    const marca = MARCAS.find((m) => m.clave === dos) || MARCAS.find((m) => m.clave === palabras[i]);
    if (!marca) continue;

    const saltadas = marca.clave.split(' ').length;
    let j = i + saltadas;
    const modelo = [];

    while (j < palabras.length && modelo.length < 3) {
      const p = palabras[j];

      if (CORTES.has(p)) break;
      // Otra marca corta el modelo: "samsung a07 y samsung a17".
      if (MARCAS.some((m) => m.clave === p)) break;
      // Una palabra de familia tampoco es modelo: "... y otro de iphone".
      if (PALABRAS_DE_FAMILIA[p]) break;

      // Es parte del modelo si lleva digito ("15", "a07") o si es una palabra
      // corta de nombre de linea ("camon", "hot", "note", "pro"). El tope de
      // 10 letras y de 3 palabras evita que se trague media frase.
      const esModelo = /\d/.test(p) || /^[a-z]{2,10}$/.test(p);
      if (!esModelo) break;

      modelo.push(p);
      j += 1;
    }

    // Un modelo hecho solo de palabras sin ningun numero es sospechoso
    // ("samsung galaxy" a secas). Se exige al menos un token con digito.
    if (modelo.length === 0 || !modelo.some((p) => /\d/.test(p))) continue;

    productos.push(armarProducto(marca, modelo, i));
    i = j - 1;
  }

  // Sin repetidos, conservando el orden de aparicion.
  const vistos = new Set();
  return productos.filter((p) => {
    if (vistos.has(p.referencia)) return false;
    vistos.add(p.referencia);
    return true;
  });
}

/** Arma la ficha de un producto a partir de su marca y su modelo. */
function armarProducto(marca, modelo, posicion) {
  return {
    referencia: normalizarCampo(`${marca.etiqueta} ${modelo.join(' ')}`),
    producto: `${marca.etiqueta} ${modelo.map(capitalizarModelo).join(' ')}`,
    familia: marca.familia,
    posicion,
  };
}

/** "a07" -> "A07", "pro" -> "Pro", "16" -> "16". */
function capitalizarModelo(palabra) {
  if (/^\d+$/.test(palabra)) return palabra;
  if (/^[a-z]\d+$/.test(palabra)) return palabra.toUpperCase();
  return palabra.charAt(0).toUpperCase() + palabra.slice(1);
}

/* -------------------------------------------------------------------------- */
/*  Segmento, presupuesto y sufijo                                            */
/* -------------------------------------------------------------------------- */

/** Traduce familia + forma de pago al codigo cerrado del punto 8. */
export function segmentoDe(familia, { credito, contado, retoma }) {
  if (retoma) return 'RETOMA';
  if (familia === 'MAC') return 'MAC-IPAD';
  if (familia === 'MIXTO') return 'MIXTO';

  const base = familia === 'IPH' ? 'IPH' : 'AND';
  // Si no se dijo nada, se asume credito: es como se pauta casi siempre y es
  // el que permite hablar de las dos formas de pago sin prometer de menos.
  if (contado && !credito) return `${base}-CONT`;
  return `${base}-CRED`;
}

/** Formas de pago nombradas en el texto. */
function detectarPago(texto) {
  const t = normalizar(texto);
  return {
    credito: /\b(credito|creditos|cuotas|financiacion|financiado)\b/.test(t),
    contado: /\b(contado|efectivo)\b/.test(t),
    retoma: /\b(retoma|retomas|usado|open box|openbox)\b/.test(t),
  };
}

/**
 * Presupuesto diario si se nombra: "$35.000", "35,000", "35000", "35 mil".
 *
 * Los separadores de miles se quitan ANTES de normalizar. Si no, "$35.000" se
 * convierte en "35 000" y el numero se pierde: el punto desaparece y quedan dos
 * numeros cortos que no parecen un presupuesto.
 */
export function detectarPresupuesto(texto) {
  const sinSeparadores = String(texto || '').replace(/(\d)[.,](?=\d{3}\b)/g, '$1');
  const t = normalizar(sinSeparadores);

  const conMil = /(\d{1,3})\s*mil\b/.exec(t);
  if (conMil) return Number(conMil[1]) * 1000;

  const crudo = /\b(\d{4,7})\b/.exec(t);
  if (crudo) return Number(crudo[1]);

  return null;
}

/** Sufijo del conjunto: TEST si la frase habla de prueba. */
function detectarSufijo(texto) {
  const t = normalizar(texto);
  if (/\b(prueba|pruebas|test|testeo|probar)\b/.test(t)) return 'TEST';
  if (/\b(ganador|optimizad[oa]|opt)\b/.test(t)) return 'OPT';
  return 'TEST';
}

/* -------------------------------------------------------------------------- */
/*  Agrupado en conjuntos                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Reparte los productos en conjuntos por familia, respetando el orden en que
 * aparecen las palabras de familia en el texto.
 */
function agruparPorFamilia(texto, productos) {
  const palabras = normalizar(texto).split(' ');

  // Donde se activa cada familia por palabra clave ("android", "iphone"...).
  const activaciones = [];
  palabras.forEach((p, i) => {
    const familia = PALABRAS_DE_FAMILIA[p];
    if (familia) activaciones.push({ familia, posicion: i });
  });

  const grupos = new Map();

  for (const producto of productos) {
    // La ultima familia activada ANTES de este producto manda; si no hay
    // ninguna, manda la familia del propio producto.
    const previa = activaciones.filter((a) => a.posicion <= producto.posicion).at(-1);
    const familia = previa?.familia || producto.familia;

    // Una palabra de familia no puede meter un iPhone en el grupo Android.
    const definitiva = familia === producto.familia ? familia : producto.familia;

    if (!grupos.has(definitiva)) grupos.set(definitiva, []);
    grupos.get(definitiva).push(producto);
  }

  return [...grupos.entries()].map(([familia, lista]) => ({ familia, productos: lista }));
}

/* -------------------------------------------------------------------------- */
/*  Barrido de la carpeta: "todos los android que haya"                       */
/* -------------------------------------------------------------------------- */

/**
 * Deduce que equipos hay en la carpeta de una sede leyendo los nombres de los
 * archivos. Es lo que permite pedir "una campana para Neiva de Android" sin
 * escribir ningun modelo.
 *
 * Solo reconoce lo que puede leer. Un archivo mal nombrado —o con la marca mal
 * escrita, como "inifixhot60pro"— no se adivina: se devuelve aparte en
 * `noIdentificados` para que la persona lo vea y lo renombre o lo pida a mano.
 *
 * @param {string} sede      codigo del manual
 * @param {string} [familia] 'IPH', 'AND', 'MAC'. Sin ella, todo lo que haya.
 * @returns {{productos:object[], noIdentificados:string[], piezas:number}}
 */
export function productosDeLaCarpeta(sede, familia = '') {
  const piezas = listarCreativosDeSede(sede).filter((p) => p.tipo && !p.problema);

  const encontrados = new Map();
  const noIdentificados = [];

  for (const pieza of piezas) {
    // Se quita la extension y el sufijo de sede para no confundir al lector.
    const base = pieza.nombre.replace(/\.[a-z0-9]+$/i, '');
    const leidos = detectarProductos(base);

    if (leidos.length === 0) {
      noIdentificados.push(pieza.nombre);
      continue;
    }

    // Un archivo describe UN equipo: el primero que se reconozca.
    const producto = leidos[0];
    if (familia && producto.familia !== familia) continue;
    if (!encontrados.has(producto.referencia)) encontrados.set(producto.referencia, producto);
  }

  return {
    productos: [...encontrados.values()],
    noIdentificados,
    piezas: piezas.length,
  };
}

/* -------------------------------------------------------------------------- */
/*  Emparejado con los creativos de la carpeta                                */
/* -------------------------------------------------------------------------- */

/**
 * Busca las piezas de un producto en creativos/<sede>/.
 *
 * Empareja por nombre de archivo normalizado. Primero intenta con marca +
 * modelo junto ("samsunga07"); si no encuentra, con el modelo solo ("a07"),
 * que es como suele venir nombrado el archivo.
 *
 * @returns {{imagen:object|null, video:object|null, comoSeEncontro:string}}
 */
export function buscarPiezas(sede, producto) {
  const piezas = listarCreativosDeSede(sede).filter((p) => p.tipo && !p.problema);

  const completo = compacto(producto.producto);
  const modelo = compacto(producto.producto.split(' ').slice(1).join(' '));

  const coincide = (pieza, aguja) => aguja.length >= 3 && compacto(pieza.nombre).includes(aguja);

  let encontradas = piezas.filter((p) => coincide(p, completo));
  let como = 'marca y modelo';

  if (encontradas.length === 0 && modelo) {
    encontradas = piezas.filter((p) => coincide(p, modelo));
    como = 'solo el modelo';
  }

  return {
    imagen: encontradas.find((p) => p.tipo === 'imagen') || null,
    video: encontradas.find((p) => p.tipo === 'video') || null,
    todas: encontradas,
    comoSeEncontro: encontradas.length > 0 ? como : 'no se encontro',
  };
}

/* -------------------------------------------------------------------------- */
/*  Rutas de archivo escritas en la orden                                     */
/* -------------------------------------------------------------------------- */

const EXT_PIEZA = '(?:jpe?g|png|gif|bmp|webp|mp4|mov|avi|mkv|webm|m4v|3gp)';
const EXT_VIDEO = /\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/i;

/** Quita vinetas y conectores del principio: "- ", "• ", "y ", "e ". */
const limpiarRuta = (r) => String(r).trim().replace(/^(?:[-*•·]\s*|y\s+|e\s+)+/i, '').trim();

/**
 * Saca de la orden las rutas de las piezas que se quieren usar. Acepta:
 *
 *   "C:\...\creativos\victoria\iphone15-victoria.jpg"   entre comillas (con espacios)
 *   archivos: ruta1, ruta2                                 en un renglon
 *   archivos:                                              o un renglon por ruta
 *     C:\...\infinixhot60pro neiva.mp4
 *     creativos/victoria/iphone15-victoria.jpg
 *   iphone15-victoria.jpg                                  nombre suelto (carpeta de la sede)
 *
 * Devuelve las rutas y el texto SIN ellas: el nombre de un archivo suele
 * llevar la sede y el modelo, y no debe confundir la lectura del resto.
 */
export function extraerArchivos(texto) {
  const rutas = [];
  let t = String(texto || '').replace(/\r/g, '');

  // 1. Entre comillas: pueden llevar espacios.
  t = t.replace(new RegExp(`["“”']([^"“”'\\n]+?\\.${EXT_PIEZA})["“”']`, 'gi'), (m, r) => {
    rutas.push(limpiarRuta(r));
    return ' ';
  });

  // 2. Bloque "archivos:" — en el mismo renglon o un renglon por ruta.
  const rutaEnRenglon = new RegExp(`[^;|,\\n]*?\\.${EXT_PIEZA}\\b`, 'gi');
  const cabecera = /(^|\s)(?:archivos?|creativos?|piezas?|rutas?)\s*:\s*(.*)$/i;
  const otraClave = /^\s*[a-záéíóúñ ]{2,}:\s*/i; // "sede:", "pago:"... pero no "C:\"
  const renglones = t.split('\n');
  let enBloque = false;
  for (let i = 0; i < renglones.length; i++) {
    let r = renglones[i];
    let antes = '';
    const cab = r.match(cabecera);
    if (cab) {
      enBloque = true;
      // Lo que va antes de "archivo:" en el mismo renglon es parte de la orden.
      antes = r.slice(0, cab.index);
      r = cab[2];
    } else if (enBloque && (/^\s*$/.test(r) || (otraClave.test(r) && !/^\s*[-*•]?\s*[a-z]:[\\/]/i.test(r)))) {
      enBloque = false;
      continue;
    }
    if (!enBloque) continue;
    for (const m of r.matchAll(rutaEnRenglon)) {
      const ruta = limpiarRuta(m[0]);
      if (ruta) rutas.push(ruta);
    }
    renglones[i] = antes;
  }
  t = renglones.join('\n');

  // 3. Sueltas, sin espacios: C:\x\y.png, creativos/sede/x.mp4 o x.jpg.
  t = t.replace(new RegExp(`(?<![\\w.])(?:[a-z]:)?[\\w\\-./\\\\]*\\.${EXT_PIEZA}\\b`, 'gi'), (m) => {
    rutas.push(limpiarRuta(m));
    return ' ';
  });

  return { rutas: [...new Set(rutas.filter(Boolean))], texto: t };
}

/* -------------------------------------------------------------------------- */
/*  El objetivo escrito en la orden                                           */
/* -------------------------------------------------------------------------- */

/** Palabras que nombran cada objetivo (ya normalizadas: sin tildes). */
const PALABRAS_OBJETIVO = [
  ['MENSAJES_WHATSAPP', ['mensajes a whatsapp', 'mensajes', 'mensaje', 'conversaciones', 'interaccion', 'whatsapp']],
  ['LEADS_WHATSAPP', ['clientes potenciales', 'cliente potencial', 'leads', 'lead', 'prospectos']],
  ['VENTAS_WHATSAPP', ['ventas', 'venta', 'conversiones', 'compras']],
  ['RECONOCIMIENTO', ['reconocimiento de marca', 'reconocimiento', 'alcance', 'awareness']],
  ['TRAFICO', ['trafico', 'clics', 'visitas']],
];

/**
 * El objetivo dicho en la orden, o null si no se dijo.
 *
 *   "objetivo: ventas", "objetivo de reconocimiento", "objetivo leads"
 *   "campana de reconocimiento para ...", "campana de trafico ..."
 *
 * @returns {{codigo:string|null, dicho:string}|null}  codigo null = se dijo
 *          "objetivo X" pero X no es ninguno conocido.
 */
export function detectarObjetivo(texto) {
  const n = normalizar(texto);
  const buscar = (trozo) => {
    for (const [codigo, palabras] of PALABRAS_OBJETIVO) {
      if (palabras.some((p) => trozo === p || trozo.startsWith(`${p} `))) return codigo;
    }
    return null;
  };

  const explicito = n.match(/\bobjetivo (?:de |es |sera )?(.+)$/);
  if (explicito) {
    const dicho = explicito[1].split(' ').slice(0, 4).join(' ');
    return { codigo: buscar(dicho), dicho };
  }

  const deCampana = n.match(/\bcampana (?:de |para )?(reconocimiento|alcance|trafico|leads|clientes potenciales|ventas|conversiones|mensajes)\b/);
  if (deCampana) return { codigo: buscar(deCampana[1]), dicho: deCampana[1] };

  return null;
}

/**
 * La orden sin la frase del objetivo, para que "iphone 13 objetivo ventas" no
 * se lea como el modelo "iPhone 13 Objetivo Ventas".
 */
export function quitarObjetivo(texto) {
  const claves = PALABRAS_OBJETIVO.flatMap(([, p]) => p).sort((a, b) => b.length - a.length);
  const conocida = new RegExp(`\\bobjetivo\\s*(?:de|es|ser[aá])?\\s*:?\\s*(?:${claves.join('|')})\\b`, 'gi');
  return String(texto)
    .normalize('NFC')
    .replace(conocida, ' ')
    .replace(/\bobjetivo\s*(?:de|es|ser[aá])?\s*:?\s*\S+/gi, ' ');
}

/** La region que cubre una sede (la mas concreta: PASTO antes que NARINO). */
function regionDeSede(sede) {
  return REGIONES.find((r) => (SEDES_POR_REGION[r] || []).includes(sede)) || '';
}

/* -------------------------------------------------------------------------- */
/*  Interpretacion completa                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Lee la frase y devuelve una campana lista para planificar.
 *
 * @param {string} texto
 * @param {object} [opciones]
 * @param {number} [opciones.presupuestoPorDefecto=25000]
 * @returns {{ok:boolean, cfg:object|null, lectura:object, avisos:string[], problemas:string[]}}
 */
export function interpretar(texto, opciones = {}) {
  const { presupuestoPorDefecto = 25000 } = opciones;
  const avisos = [];
  const problemas = [];

  const original = String(texto || '').trim();
  // Las rutas se sacan primero: el nombre de un archivo lleva la sede y el
  // modelo, y el resto de la lectura se hace sobre la orden sin ellas.
  const { rutas, texto: sinRutas } = extraerArchivos(original);
  const crudo = sinRutas.replace(/\s+/g, ' ').trim();
  if (!original) {
    return {
      ok: false,
      cfg: null,
      lectura: {},
      avisos: [],
      problemas: ['Escribe que campana quieres. Por ejemplo: "campana para la sede La 16 con el iPhone 16".'],
    };
  }

  /* --- 1. La sede -------------------------------------------------------- */

  const deteccion = detectarSede(crudo);
  if (!deteccion.sede) {
    return {
      ok: false,
      cfg: null,
      lectura: { sede: null, ambiguo: deteccion.ambiguo || [] },
      avisos,
      problemas: [deteccion.motivo],
    };
  }

  const ficha = SEDES[deteccion.sede];

  // OJO: `ficha.ciudad` del manual es el departamento en varias sedes (NEIVA
  // dice "Huila", ORITO dice "Putumayo"). Para los textos hace falta la ciudad
  // de verdad, que es la que tiene targeting.js.
  const claveGeo = TARGETING_DE_SEDE[ficha.codigo];
  const ciudadReal = SEDES_GEO[claveGeo]?.ciudad || ficha.ciudad;

  if (deteccion.tambienSonaron?.length) {
    avisos.push(
      `En el texto tambien sonaron ${deteccion.tambienSonaron.join(', ')}. Se tomo ${ficha.codigo} ` +
        `por "${deteccion.alias}". Si querias otra, escribela mas claro.`,
    );
  }

  /* --- 2. Los productos -------------------------------------------------- */

  const productos = detectarProductos(quitarObjetivo(crudo));

  // Piezas pedidas con su ruta: el equipo (y si es iPhone o Android) se lee
  // del NOMBRE del archivo. Sin marca y modelo en el nombre no se usa: es la
  // misma regla que evita pautar con el creativo de otro equipo.
  const explicitas = new Map();
  let piezaFueraDeLaSede = false;
  for (const ruta of rutas) {
    let r;
    try {
      r = resolverCreativo(ficha.codigo, ruta, { permitirFueraDeLaSede: true });
    } catch (error) {
      problemas.push(`No encontre el archivo "${ruta}". ${String(error.message).split('\n').slice(1).join(' ').trim()}`);
      continue;
    }

    const nombre = basename(r.ruta);
    const esVideo = EXT_VIDEO.test(nombre);
    const leidos = detectarProductos(nombre.replace(/\.[^.]+$/, ''));
    if (leidos.length === 0) {
      problemas.push(
        `No pude leer marca y modelo en el nombre "${nombre}". Renombralo con marca y modelo ` +
          `(por ejemplo "iphone15-${ficha.codigo.toLowerCase()}${extname(nombre)}"): asi se sabe si es iPhone o ` +
          'Android y no se pauta con un creativo equivocado.',
      );
      continue;
    }

    const leido = leidos[0];
    if (!r.enCarpetaDeLaSede) {
      piezaFueraDeLaSede = true;
      avisos.push(
        `⚠️ "${nombre}" no esta en creativos/${ficha.codigo.toLowerCase()}/. Se usa porque la pediste con su ` +
          'ruta: confirma en la etapa 3 que es una pieza de esta sede.',
      );
    }

    const entrada = explicitas.get(leido.referencia) || {
      producto: { ...leido, posicion: Number.MAX_SAFE_INTEGER, deRuta: true },
      imagen: null,
      video: null,
    };
    const hueco = esVideo ? 'video' : 'imagen';
    if (entrada[hueco]) {
      avisos.push(`Hay dos ${hueco === 'video' ? 'videos' : 'imagenes'} de ${leido.producto}; se usa "${entrada[hueco].nombre}" y "${nombre}" queda fuera.`);
    } else {
      entrada[hueco] = {
        ruta: r.ruta,
        rutaRelativa: r.rutaRelativa,
        nombre,
        tipo: hueco,
        megas: (statSync(r.ruta).size / 1048576).toFixed(1),
      };
    }
    explicitas.set(leido.referencia, entrada);
    avisos.push(
      `📎 "${nombre}" → ${leido.producto} (${leido.familia === 'IPH' ? 'iPhone' : leido.familia === 'MAC' ? 'Mac/iPad' : 'Android'}, ` +
        `${esVideo ? 'video' : 'imagen'}), leido del nombre del archivo.`,
    );
  }
  for (const { producto } of explicitas.values()) {
    if (!productos.some((p) => p.referencia === producto.referencia)) productos.push(producto);
  }

  // "una campana para Neiva de Android": se nombro una familia pero ningun
  // modelo de esa familia. Se barre la carpeta de la sede y se toma todo lo
  // que haya de ella.
  const familiasPedidas = new Set(
    normalizar(crudo)
      .split(' ')
      .map((p) => PALABRAS_DE_FAMILIA[p])
      .filter(Boolean),
  );

  // El MODELO es obligatorio en la orden (decision del cliente, 24/09/2026).
  // Antes "de android" tomaba todo lo que hubiera en la carpeta de la sede, y
  // eso es justo como se cuela un creativo equivocado. Ahora se pide el
  // modelo, y se ensena lo que hay en la carpeta para que sea facil decirlo.
  for (const familia of familiasPedidas) {
    if (productos.some((p) => p.familia === familia)) continue;

    const barrido = productosDeLaCarpeta(ficha.codigo, familia);
    const nombreFamilia = familia === 'IPH' ? 'iPhone' : familia === 'MAC' ? 'Mac o iPad' : 'Android';
    const hay = barrido.productos.map((p) => p.producto);

    problemas.push(
      `Pediste ${nombreFamilia} sin decir el modelo. Especifica marca y modelo en la orden ` +
        '(por ejemplo "Tecno Camon 50 Pro" o "iPhone 13"): sin modelo no se elige pieza, para no pautar ' +
        'con un creativo equivocado.' +
        (hay.length
          ? ` En creativos/${ficha.codigo.toLowerCase()}/ hay de esa familia: ${hay.join(', ')}.`
          : ` En creativos/${ficha.codigo.toLowerCase()}/ no hay ninguna pieza de esa familia` +
            `${barrido.piezas === 0 ? ' (la carpeta esta vacia)' : ''}.`),
    );
  }

  if (productos.length === 0) {
    // Si se pidio una familia y el barrido no encontro nada, ese motivo ya
    // esta en `problemas` y es mucho mas util que el mensaje generico.
    if (problemas.length === 0) {
      problemas.push(
        'No reconoci ningun equipo. Escribe marca y modelo: "iPhone 16", "Samsung A17", "Redmi 15".\n' +
          'Tambien vale pegado ("infinixhot60pro"). El modelo siempre es obligatorio: "de android" solo no basta.\n' +
          `Marcas que conozco: ${MARCAS.map((m) => m.etiqueta).join(', ')}.`,
      );
    }

    return { ok: false, cfg: null, lectura: { sede: ficha.codigo }, avisos, problemas };
  }

  /* --- 3. Pago, presupuesto y sufijo ------------------------------------- */

  const pago = detectarPago(crudo);
  const presupuesto = detectarPresupuesto(crudo) ?? presupuestoPorDefecto;
  const sufijo = detectarSufijo(crudo);

  if (detectarPresupuesto(crudo) === null) {
    avisos.push(
      `No dijiste presupuesto, asi que cada conjunto sale con $${presupuestoPorDefecto.toLocaleString('es-CO')} ` +
        'COP al dia. Cambialo en la etapa 2 si no es eso.',
    );
  }
  if (!pago.credito && !pago.contado && !pago.retoma) {
    avisos.push('No dijiste si es de contado o a credito. Se asume a credito, que permite hablar de las dos.');
  }

  /* --- 4. Conjuntos ------------------------------------------------------ */

  const grupos = agruparPorFamilia(crudo, productos);
  const conjuntos = [];
  const sinPieza = [];

  // El reparto que TOCARIA, con todos los equipos reconocidos y antes de mirar
  // si hay pieza de cada uno. Se enseña siempre: responde "¿y este a que
  // conjunto va?" aunque despues falte un creativo y el conjunto no se cree.
  const agrupacionPrevista = grupos.map((g) => ({
    familia: g.familia,
    segmento: segmentoDe(g.familia, pago),
    equipos: g.productos.map((p) => p.producto),
  }));

  for (const grupo of grupos) {
    const segmento = segmentoDe(grupo.familia, pago);
    const anuncios = [];

    for (const producto of grupo.productos) {
      const pedida = explicitas.get(producto.referencia);
      const piezas = pedida
        ? { imagen: pedida.imagen, video: pedida.video, comoSeEncontro: 'ruta escrita en la orden' }
        : buscarPiezas(ficha.codigo, producto);

      if (!piezas.imagen && !piezas.video) {
        sinPieza.push(producto.producto);
        continue;
      }

      if (piezas.comoSeEncontro === 'solo el modelo') {
        avisos.push(
          `Para ${producto.producto} empareje por el modelo, no por la marca: el archivo ` +
            `"${(piezas.imagen || piezas.video).nombre}" no lleva "${producto.producto.split(' ')[0]}" en el nombre. ` +
            'Confirma en la etapa 3 que la pieza es la correcta.',
        );
      }

      // Si hay foto Y video, se crean los dos anuncios. Es lo que pidio el
      // cliente y ademas es lo correcto: son formatos que rinden distinto.
      for (const [tipo, pieza] of [
        ['IMG', piezas.imagen],
        ['VID', piezas.video],
      ]) {
        if (!pieza) continue;

        // Contado: los copys salen con {PRECIO} y el aviso lo pone la
        // validacion de la campana, que es la que bloquea hasta tener precio.
        const copys = generarCopys({
            producto: producto.producto,
            ciudad: ciudadReal,
            sede: ficha.sede,
            // El codigo es lo que da la direccion oficial. Sin el, los copys
            // salen sin direccion en vez de con una equivocada.
            codigoSede: ficha.codigo,
            segmento,
            formato: tipo,
          });

        anuncios.push({
          formato: tipo,
          referencia: producto.referencia,
          producto: producto.producto,
          // La ruta ABSOLUTA, no el nombre suelto. El builder resuelve esto
          // contra el directorio de trabajo, asi que "foto.png" lo buscaba en
          // la raiz del proyecto y no en creativos/<sede>/. Las campanas de
          // archivo no se enteraban porque validarCampana ya las resolvia;
          // las dictadas desde el panel se rompian aqui.
          rutaCreativoLocal: pieza.ruta,
          creativoRelativo: pieza.rutaRelativa,
          megas: pieza.megas,
          // Como se encontro la pieza. Importa: si emparejo "solo el modelo",
          // el archivo no lleva la marca en el nombre y podria ser de otro
          // equipo. La interfaz lo enseña para que se revise.
          comoSeEncontro: piezas.comoSeEncontro,
          ...copys,
        });
      }
    }

    if (anuncios.length === 0) continue;

    if (anuncios.length > MAX_ANUNCIOS_POR_CONJUNTO) {
      avisos.push(
        `El conjunto ${segmento} salio con ${anuncios.length} anuncios y el manual permite ` +
          `${MAX_ANUNCIOS_POR_CONJUNTO} (punto 6). Se dejaron los primeros ${MAX_ANUNCIOS_POR_CONJUNTO}; ` +
          'los demas van en otro conjunto.',
      );
    }

    conjuntos.push({
      segmento,
      sufijoConjunto: sufijo,
      presupuestoDiarioCop: presupuesto,
      tipoPresupuesto: 'sede',
      anuncios: anuncios.slice(0, MAX_ANUNCIOS_POR_CONJUNTO),
    });
  }

  if (sinPieza.length > 0) {
    problemas.push(
      `No hay creativo en creativos/${ficha.codigo.toLowerCase()}/ para: ${sinPieza.join(', ')}.\n` +
        '  Pon la pieza en esa carpeta con el modelo en el nombre del archivo ' +
        `(por ejemplo "${compacto(sinPieza[0])}-${ficha.codigo.toLowerCase()}.jpg") y vuelve a pedirlo.`,
    );
  }

  if (conjuntos.length === 0) {
    return {
      ok: false,
      cfg: null,
      lectura: {
        sede: ficha.codigo,
        productos: productos.map((p) => p.producto),
        agrupacionPrevista,
        sinPieza,
      },
      avisos,
      problemas,
    };
  }

  /* --- 5. La configuracion, igual que un archivo de campanas/ ------------ */

  /* --- 6. El objetivo, si se dijo --------------------------------------- */

  const objetivoDicho = detectarObjetivo(crudo);
  let objetivo = '';
  let region = '';
  if (objetivoDicho && !objetivoDicho.codigo) {
    problemas.push(
      `No reconozco el objetivo "${objetivoDicho.dicho}". Escribe uno de estos: ` +
        'mensajes, clientes potenciales (leads), ventas, reconocimiento o trafico.',
    );
  } else if (objetivoDicho) {
    const ficha0 = OBJETIVOS[objetivoDicho.codigo];
    objetivo = ficha0.codigo;
    avisos.push(`🎯 Objetivo: ${ficha0.etiqueta} (${ficha0.enAdsManager}), tomado de la orden.`);
    if (!ficha0.ensayado) {
      avisos.push(`"${ficha0.etiqueta}" todavia no se ha ensayado contra la cuenta: ensayalo antes de crear.`);
    }
    if (ficha0.ambito === 'regional') {
      region = regionDeSede(ficha.codigo);
      avisos.push(
        `"${ficha0.etiqueta}" es una campana REGIONAL (R#): se toma la region ${region}, la de ${ficha.codigo}. ` +
          'Cambiala en la primera pantalla si es otra.',
      );
    }
  }

  if (problemas.some((p) => p.startsWith('No reconozco el objetivo'))) {
    return { ok: false, cfg: null, lectura: { sede: ficha.codigo }, avisos, problemas };
  }

  const cfg = {
    descripcion: `Generada desde: "${original.slice(0, 120)}${original.length > 120 ? '…' : ''}"`,
    sede: ficha.codigo,
    sedeTargeting: TARGETING_DE_SEDE[ficha.codigo],
    modoTexto: 'multiple',
    conjuntos,
    origen: { tipo: 'interprete', texto: original },
    ...(objetivo ? { objetivo } : {}),
    ...(region ? { region } : {}),
    // Una ruta escrita a proposito fuera de la carpeta de la sede.
    ...(piezaFueraDeLaSede ? { permitirCreativoFueraDeLaSede: true } : {}),
  };

  return {
    ok: true,
    cfg,
    lectura: {
      sede: ficha.codigo,
      sedeNombre: `${ficha.sede} (${ficha.ciudad})`,
      alias: deteccion.alias,
      productos: productos.map((p) => p.producto),
      agrupacionPrevista,
      pago,
      presupuesto,
      sufijo,
      conjuntos: conjuntos.map((c) => ({
        segmento: c.segmento,
        anuncios: c.anuncios.map((a) => `${a.formato} · ${a.producto} · ${a.rutaCreativoLocal}`),
      })),
      sinPieza,
      copysGenerados: true,
      objetivo,
      region,
      archivos: rutas,
    },
    avisos,
    problemas,
  };
}

export default {
  interpretar,
  extraerArchivos,
  detectarObjetivo,
  detectarSede,
  detectarProductos,
  detectarPresupuesto,
  segmentoDe,
  buscarPiezas,
  normalizar,
  ALIAS_SEDE,
  MARCAS,
};
