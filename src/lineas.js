/**
 * ============================================================================
 *  src/lineas.js — Lector de lineas.xlsx (linea de WhatsApp por sede)
 * ============================================================================
 *  El numero de WhatsApp de cada sede NO se escribe a mano en ningun lado:
 *  se lee del archivo lineas.xlsx que mantiene el area de datos.
 *
 *  El .xlsx es un ZIP con XML adentro. Este modulo lo abre sin dependencias
 *  externas (solo node:zlib), asi que no hay que instalar ninguna libreria de
 *  Excel ni exponerse a su cadena de suministro.
 *
 *  COMO SE LOCALIZA LA TABLA
 *
 *  Nada esta atado a una columna fija. El ancla es el encabezado TIENDA, que
 *  es el unico dato sin el cual no se puede hacer nada: un telefono sin saber
 *  de que tienda es no sirve.
 *
 *  La columna de los telefonos se elige MIRANDO LOS DATOS, no el titulo: es
 *  aquella cuyas celdas parecen moviles colombianos. El encabezado "LINEA
 *  MOVIL" solo se usa como pista, y si apunta a una columna donde no hay
 *  telefonos se avisa y se usa la que si los tiene.
 *
 *  Eso no es capricho. Al borrar unas tablas del archivo el titulo "LINEA
 *  MOVIL" se quedo en la columna A mientras los numeros seguian en la G, y un
 *  lector que confiara en el titulo habria leido "1, 2, 3..." como telefonos.
 *  Los datos mandan sobre las etiquetas.
 * ============================================================================
 */

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

import { obtenerSedeNomenclatura, normalizarCampo } from './nomenclatura.js';

/* -------------------------------------------------------------------------- */
/*  1. ZIP minimo: sacar un archivo por nombre                                */
/* -------------------------------------------------------------------------- */

const FIRMA_EOCD = 0x06054b50; // fin del directorio central
const FIRMA_CEN = 0x02014b50; // entrada del directorio central
const FIRMA_LOC = 0x04034b50; // cabecera local de un archivo

/**
 * Devuelve un Map<nombreDeArchivo, Buffer> con el contenido del ZIP.
 * Soporta los dos metodos que usa Excel: 0 (sin comprimir) y 8 (deflate).
 */
function abrirZip(buffer) {
  const finEocd = buscarEocd(buffer);
  if (finEocd < 0) throw new Error('lineas: el archivo no parece un .xlsx valido (no se encontro el indice del ZIP).');

  const totalEntradas = buffer.readUInt16LE(finEocd + 10);
  let offset = buffer.readUInt32LE(finEocd + 16);

  const archivos = new Map();

  for (let i = 0; i < totalEntradas; i += 1) {
    if (buffer.readUInt32LE(offset) !== FIRMA_CEN) break;

    const metodo = buffer.readUInt16LE(offset + 10);
    const tamComprimido = buffer.readUInt32LE(offset + 20);
    const largoNombre = buffer.readUInt16LE(offset + 28);
    const largoExtra = buffer.readUInt16LE(offset + 30);
    const largoComentario = buffer.readUInt16LE(offset + 32);
    const offsetLocal = buffer.readUInt32LE(offset + 42);
    const nombre = buffer.toString('utf8', offset + 46, offset + 46 + largoNombre);

    if (buffer.readUInt32LE(offsetLocal) === FIRMA_LOC) {
      // Los tamanos del directorio central son los fiables; los de la cabecera
      // local pueden venir en 0 cuando el ZIP usa descriptor de datos.
      const largoNombreLocal = buffer.readUInt16LE(offsetLocal + 26);
      const largoExtraLocal = buffer.readUInt16LE(offsetLocal + 28);
      const inicioDatos = offsetLocal + 30 + largoNombreLocal + largoExtraLocal;
      const crudo = buffer.subarray(inicioDatos, inicioDatos + tamComprimido);
      archivos.set(nombre, metodo === 0 ? crudo : inflateRawSync(crudo));
    }

    offset += 46 + largoNombre + largoExtra + largoComentario;
  }

  return archivos;
}

/** El EOCD esta al final, pero puede traer comentario: se busca hacia atras. */
function buscarEocd(buffer) {
  const minimo = Math.max(0, buffer.length - 0xffff - 22);
  for (let i = buffer.length - 22; i >= minimo; i -= 1) {
    if (buffer.readUInt32LE(i) === FIRMA_EOCD) return i;
  }
  return -1;
}

/* -------------------------------------------------------------------------- */
/*  2. XML minimo: cadenas compartidas y celdas                               */
/* -------------------------------------------------------------------------- */

function decodificarEntidades(texto) {
  return String(texto)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&'); // siempre de ultimo, para no re-decodificar
}

/** Concatena el texto de todos los <t> de un fragmento XML. */
function textoDeNodos(fragmento) {
  const trozos = fragmento.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
  return trozos
    .map((t) => decodificarEntidades(t.replace(/^<t(?:\s[^>]*)?>/, '').replace(/<\/t>$/, '')))
    .join('');
}

/** xl/sharedStrings.xml -> array de textos indexado por posicion. */
function leerCadenasCompartidas(xml) {
  if (!xml) return [];
  return (xml.match(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g) || []).map(textoDeNodos);
}

/** 'BC12' -> { columna: 'BC', fila: 12 } */
function partirReferencia(ref) {
  const hit = /^([A-Z]+)(\d+)$/.exec(String(ref || '').toUpperCase());
  return hit ? { columna: hit[1], fila: Number(hit[2]) } : null;
}

/** 'A' -> 1, 'Z' -> 26, 'AA' -> 27. Sirve para medir distancia entre columnas. */
function indiceColumna(letras) {
  let n = 0;
  for (const ch of String(letras).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/**
 * Convierte la hoja en un array de filas: [{ columna: valor }] indexado por
 * numero de fila del Excel (1-based), con los huecos como undefined.
 */
function leerHoja(xml, cadenas) {
  const filas = new Map();

  for (const filaXml of xml.match(/<row(?:\s[^>]*)?>[\s\S]*?<\/row>/g) || []) {
    const numeroFila = Number(/\sr="(\d+)"/.exec(filaXml)?.[1] || 0);
    if (!numeroFila) continue;

    const celdas = {};
    for (const celdaXml of filaXml.match(/<c(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = /\sr="([A-Z]+\d+)"/.exec(celdaXml)?.[1];
      const pos = partirReferencia(ref);
      if (!pos) continue;

      const tipo = /\st="([^"]+)"/.exec(celdaXml)?.[1] || 'n';
      let valor;

      if (tipo === 'inlineStr') {
        valor = textoDeNodos(celdaXml);
      } else {
        const bruto = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(celdaXml)?.[1];
        if (bruto === undefined) continue;
        valor = tipo === 's' ? (cadenas[Number(bruto)] ?? '') : decodificarEntidades(bruto);
      }

      if (String(valor).trim() !== '') celdas[pos.columna] = String(valor).trim();
    }

    if (Object.keys(celdas).length > 0) filas.set(numeroFila, celdas);
  }

  return filas;
}

/* -------------------------------------------------------------------------- */
/*  3. Normalizacion de telefonos y de nombres de tienda                      */
/* -------------------------------------------------------------------------- */

/** Indicativo de Colombia. Meta exige el numero en formato internacional sin '+'. */
export const INDICATIVO_COLOMBIA = '57';

/**
 * '315 0913478' -> '573150913478'
 * '3115279768'  -> '573115279768'
 * '573115279768'-> '573115279768'
 * Devuelve null si el numero no parece un movil colombiano.
 */
export function normalizarTelefono(bruto) {
  const digitos = String(bruto ?? '').replace(/\D/g, '');
  if (!digitos) return null;

  if (digitos.length === 10 && digitos.startsWith('3')) return `${INDICATIVO_COLOMBIA}${digitos}`;
  if (digitos.length === 12 && digitos.startsWith(`${INDICATIVO_COLOMBIA}3`)) return digitos;
  return null;
}

/**
 * El Excel escribe la tienda como la usa el equipo ('EL LICEO', 'PTO ASIS',
 * 'MARKUS LUCID'); el manual usa codigos ('LICEO', 'PTOASIS', 'MARKUS').
 * Esta tabla traduce de lo uno a lo otro.
 */
const ALIAS_TIENDA = Object.freeze({
  'EL LICEO': 'LICEO',
  LICEO: 'LICEO',
  'LA 16': 'LA16',
  LA16: 'LA16',
  SEBASTIAN: 'SEBASTIAN',
  'CC SEBASTIAN': 'SEBASTIAN',
  'VICTORIA PLAZA': 'VICTORIA',
  VICTORIA: 'VICTORIA',
  ZAFIRO: 'ZAFIRO',
  'CC ZAFIRO': 'ZAFIRO',
  MARKUS: 'MARKUS',
  'MARKUS LUCID': 'MARKUS',
  TUQUERRES: 'TUQUERRES',
  ORITO: 'ORITO',
  HORMIGA: 'HORMIGA',
  'LA HORMIGA': 'HORMIGA',
  'PTO ASIS': 'PTOASIS',
  'PUERTO ASIS': 'PTOASIS',
  PTOASIS: 'PTOASIS',
  MOCOA: 'MOCOA',
  MEDELLIN: 'MEDELLIN',
  NEIVA: 'NEIVA',
});

/** Lleva el nombre de tienda del Excel al codigo de sede del manual, o null. */
export function codigoDeTienda(tienda) {
  const limpio = normalizarCampo(tienda);
  if (!limpio) return null;
  if (ALIAS_TIENDA[limpio]) return ALIAS_TIENDA[limpio];
  // Ultimo intento: quitarle la palabra LUCID y volver a mirar.
  const sinLucid = limpio.replace(/\bLUCID\b/g, '').replace(/\s+/g, ' ').trim();
  return ALIAS_TIENDA[sinLucid] || null;
}

/* -------------------------------------------------------------------------- */
/*  4. Lectura del archivo                                                    */
/* -------------------------------------------------------------------------- */

const ENCABEZADO_LINEA = 'LINEA MOVIL';
const ENCABEZADO_TIENDA = 'TIENDA';
const ENCABEZADO_LIDER = 'LIDER';

/**
 * Localiza las tablas de la hoja usando TIENDA como ancla.
 *
 * Se devuelve la columna de TIENDA, la de LIDER si la hay, la que el archivo
 * DICE que es la de los telefonos (que puede estar equivocada) y las columnas
 * de notas que la acompanan.
 */
function localizarTablas(filas) {
  const tablas = [];

  for (const [numeroFila, celdas] of filas) {
    const columnas = Object.entries(celdas);
    const buscar = (etiqueta) =>
      columnas.find(([, valor]) => normalizarCampo(valor) === etiqueta)?.[0] || null;

    const colTienda = buscar(ENCABEZADO_TIENDA);
    if (!colTienda) continue;

    const colLider = buscar(ENCABEZADO_LIDER);
    const colLineaDeclarada = buscar(ENCABEZADO_LINEA);

    // Las notas (LUCID y similares) van pegadas a la derecha de la tienda.
    const colNotas = columnas
      .map(([columna]) => columna)
      .filter((c) => c !== colTienda && c !== colLider && c !== colLineaDeclarada)
      .filter((c) => {
        const distancia = indiceColumna(c) - indiceColumna(colTienda);
        return distancia > 0 && distancia <= 4;
      });

    tablas.push({ filaEncabezado: numeroFila, colTienda, colLider, colLineaDeclarada, colNotas });
  }

  return tablas;
}

/**
 * Cuenta, por columna, cuantas celdas de la tabla parecen un movil colombiano.
 * Es lo que decide donde estan de verdad los telefonos.
 */
function columnasQueParecenTelefonos(filas, tabla, numerosDeFila) {
  const puntaje = new Map();

  for (const numeroFila of numerosDeFila) {
    if (numeroFila <= tabla.filaEncabezado) continue;
    const celdas = filas.get(numeroFila);
    // Solo cuentan las filas que de verdad son de la tabla: las que tienen
    // tienda. Asi una columna suelta de otro sitio no gana por acumulacion.
    if (!celdas[tabla.colTienda]) continue;

    for (const [columna, valor] of Object.entries(celdas)) {
      if (normalizarTelefono(valor)) puntaje.set(columna, (puntaje.get(columna) || 0) + 1);
    }
  }

  return puntaje;
}

/**
 * Lee lineas.xlsx y devuelve las lineas junto con lo que hubo que deducir.
 *
 * @param {string} rutaArchivo
 * @returns {{registros:object[], avisos:string[]}}
 */
export function leerLineasConDiagnostico(rutaArchivo) {
  let buffer;
  try {
    buffer = readFileSync(rutaArchivo);
  } catch (error) {
    throw new Error(`lineas: no se pudo abrir "${rutaArchivo}". ${error.message}`);
  }

  const archivos = abrirZip(buffer);

  const cadenas = leerCadenasCompartidas(archivos.get('xl/sharedStrings.xml')?.toString('utf8'));

  // La primera hoja del libro. Excel siempre la llama sheet1.xml.
  const claveHoja = [...archivos.keys()].find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if (!claveHoja) throw new Error('lineas: el archivo no tiene ninguna hoja de calculo.');

  const filas = leerHoja(archivos.get(claveHoja).toString('utf8'), cadenas);

  /* --- Localizar las tablas ---------------------------------------------- */
  const tablas = localizarTablas(filas);

  if (tablas.length === 0) {
    throw new Error(
      `lineas: en "${rutaArchivo}" no se encontro ninguna tabla con el encabezado ` +
        `"${ENCABEZADO_TIENDA}".\n` +
        '  Esa columna es la que dice de que tienda es cada numero, y sin ella el archivo\n' +
        '  no se puede usar. Comprueba que la fila de titulos siga ahi.',
    );
  }

  /* --- Leer las filas de cada tabla -------------------------------------- */
  const registros = [];
  const avisos = [];
  const numerosDeFila = [...filas.keys()].sort((a, b) => a - b);

  for (const tabla of tablas) {
    /* --- Donde estan de verdad los telefonos ----------------------------- */
    const puntaje = columnasQueParecenTelefonos(filas, tabla, numerosDeFila);
    const declarada = tabla.colLineaDeclarada;

    let colLinea;
    if (declarada && puntaje.get(declarada) > 0) {
      colLinea = declarada;
    } else {
      // La mejor por numero de telefonos validos; a igualdad, la de mas a la
      // izquierda, para que el resultado no dependa del orden del XML.
      const mejor = [...puntaje.entries()].sort(
        (a, b) => b[1] - a[1] || indiceColumna(a[0]) - indiceColumna(b[0]),
      )[0];
      colLinea = mejor?.[0] || null;

      if (colLinea && declarada) {
        avisos.push(
          `El titulo "${ENCABEZADO_LINEA}" esta en la columna ${declarada}, pero ahi no hay ningun ` +
            `movil colombiano. Los numeros se leyeron de la columna ${colLinea}, que tiene ` +
            `${puntaje.get(colLinea)}. Mueve el titulo a ${colLinea}1 para dejarlo derecho.`,
        );
      } else if (colLinea) {
        avisos.push(
          `No hay ningun titulo "${ENCABEZADO_LINEA}" en la fila ${tabla.filaEncabezado}. ` +
            `Los numeros se leyeron de la columna ${colLinea}, que es la unica con moviles colombianos.`,
        );
      }
    }

    if (!colLinea) {
      avisos.push(
        `La tabla que empieza en la fila ${tabla.filaEncabezado} (tienda en la columna ` +
          `${tabla.colTienda}) no tiene ninguna columna con moviles colombianos. Se ignora.`,
      );
      continue;
    }

    const etiquetaTabla = `${colLinea}:${tabla.colTienda}`;

    for (const numeroFila of numerosDeFila) {
      if (numeroFila <= tabla.filaEncabezado) continue;
      const celdas = filas.get(numeroFila);

      const bruto = celdas[colLinea];
      const tienda = celdas[tabla.colTienda];
      if (!bruto || !tienda) continue;

      const telefono = normalizarTelefono(bruto);
      if (!telefono) continue;

      const notas = tabla.colNotas.map((c) => celdas[c]).filter(Boolean);

      registros.push({
        linea: String(bruto).trim(),
        telefono,
        tienda: String(tienda).trim(),
        sede: codigoDeTienda(tienda),
        lider: tabla.colLider ? celdas[tabla.colLider] || '' : '',
        notas,
        esLucid: notas.some((n) => normalizarCampo(n) === 'LUCID'),
        fila: numeroFila,
        tabla: etiquetaTabla,
      });
    }
  }

  // Una tienda que no se reconoce no es un detalle: esa sede se queda sin
  // numero y la campana no se puede armar.
  const sinSede = [...new Set(registros.filter((r) => !r.sede).map((r) => r.tienda))];
  if (sinSede.length > 0) {
    avisos.push(
      `Estas tiendas del Excel no corresponden a ninguna sede del manual: ${sinSede.join(', ')}. ` +
        'Sus lineas no se van a usar.',
    );
  }

  return { registros, avisos };
}

/**
 * Las lineas del archivo, sin el diagnostico.
 *
 * @param {string} rutaArchivo
 * @returns {{linea:string, telefono:string, tienda:string, sede:string|null,
 *            lider:string, notas:string[], esLucid:boolean, fila:number,
 *            tabla:string}[]}
 */
export function leerLineas(rutaArchivo) {
  return leerLineasConDiagnostico(rutaArchivo).registros;
}

/* -------------------------------------------------------------------------- */
/*  5. Resolucion de la linea de una sede                                     */
/* -------------------------------------------------------------------------- */

/**
 * Devuelve la linea de WhatsApp de una sede, lista para META_WHATSAPP_NUMBER.
 *
 * Cuando una sede tiene varias lineas se prefiere la marcada LUCID, que es la
 * que atiende el bot del CRM y por donde deben entrar los mensajes de pauta.
 * Si hay mas de una candidata se devuelven todas en `alternativas` para que la
 * vista previa lo muestre y el humano decida.
 *
 * @param {string} rutaArchivo  ruta a lineas.xlsx
 * @param {string} sede         codigo de sede del manual (NEIVA, VICTORIA, ...)
 * @param {object} [opciones]
 * @param {string} [opciones.telefonoForzado]  numero explicito que gana sobre el Excel
 * @returns {{telefono:string, registro:object|null, alternativas:object[],
 *            origen:string, avisos:string[], todasDeLaSede:object[]}}
 */
export function lineaDeSede(rutaArchivo, sede, opciones = {}) {
  const ficha = obtenerSedeNomenclatura(sede);
  const avisos = [];

  if (opciones.telefonoForzado) {
    const forzado = normalizarTelefono(opciones.telefonoForzado);
    if (!forzado) {
      throw new Error(
        `lineas: el telefono forzado "${opciones.telefonoForzado}" no es un movil colombiano valido.`,
      );
    }
    avisos.push(`Se esta usando un numero forzado por configuracion, no el de lineas.xlsx.`);
    return { telefono: forzado, registro: null, alternativas: [], origen: 'forzado', avisos, todasDeLaSede: [] };
  }

  // Los avisos del lector (columna deducida, tiendas sin reconocer) suben
  // hasta el panel: si el archivo esta torcido hay que verlo antes de crear,
  // no despues.
  const { registros: todas, avisos: avisosDelArchivo } = leerLineasConDiagnostico(rutaArchivo);
  avisos.push(...avisosDelArchivo);

  const deLaSede = todas.filter((r) => r.sede === ficha.codigo);

  if (deLaSede.length === 0) {
    const tiendasVistas = [...new Set(todas.map((r) => r.tienda))].sort();
    throw new Error(
      `lineas: la sede ${ficha.codigo} (${ficha.sede}) no aparece en "${rutaArchivo}".\n` +
        `  Tiendas encontradas en el archivo: ${tiendasVistas.join(', ')}`,
    );
  }

  // Una misma linea puede venir repetida en las dos tablas del archivo.
  const porTelefono = new Map();
  for (const r of deLaSede) {
    const previo = porTelefono.get(r.telefono);
    if (!previo) porTelefono.set(r.telefono, r);
    else if (r.esLucid && !previo.esLucid) porTelefono.set(r.telefono, r);
  }
  const unicas = [...porTelefono.values()];

  const lucid = unicas.filter((r) => r.esLucid);
  const elegida = lucid.length > 0 ? lucid[0] : unicas[0];
  const alternativas = unicas.filter((r) => r.telefono !== elegida.telefono);

  if (lucid.length > 1) {
    avisos.push(
      `${ficha.codigo} tiene ${lucid.length} lineas marcadas LUCID en el Excel. ` +
        `Se tomo ${elegida.telefono}; confirma cual debe recibir los mensajes de esta campana.`,
    );
  } else if (lucid.length === 0) {
    avisos.push(
      `${ficha.codigo} no tiene ninguna linea marcada LUCID en el Excel. ` +
        `Se tomo la primera encontrada (${elegida.telefono}).`,
    );
  }
  if (alternativas.length > 0) {
    avisos.push(
      `${ficha.codigo} maneja ${unicas.length} lineas. Si el anuncio debe entrar por otra, ` +
        `el manual (punto 6) pide marcarlo en el nombre con L1 o L2.`,
    );
  }

  return {
    telefono: elegida.telefono,
    registro: elegida,
    alternativas,
    origen: `lineas.xlsx fila ${elegida.fila} (tabla ${elegida.tabla})`,
    avisos,
    todasDeLaSede: unicas,
  };
}

export default {
  leerLineas,
  leerLineasConDiagnostico,
  lineaDeSede,
  normalizarTelefono,
  codigoDeTienda,
  INDICATIVO_COLOMBIA,
};
