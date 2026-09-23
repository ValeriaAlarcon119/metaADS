/**
 * ============================================================================
 *  src/creativos-sede.js — Las piezas publicitarias, organizadas por sede
 * ============================================================================
 *  Convencion de carpetas:
 *
 *    creativos/
 *      neiva/      tecnocamon50pro-neiva.png
 *                  inifixhot60pro-neiva.mp4
 *      victoria/   iphone13-victoria.jpg
 *      la16/       ...
 *
 *  Una carpeta por sede, con el codigo de la sede en minuscula. Es la misma
 *  logica del punto 12 del manual, que pide una carpeta por sede en Drive.
 *
 *  Para que sirve este modulo:
 *   1. Resolver la ruta de un creativo sin escribir rutas largas a mano:
 *      en la campana basta poner 'tecnocamon50pro-neiva.png'.
 *   2. Evitar el error de cruzar sedes. Apuntar un anuncio de NEIVA a una
 *      pieza que esta en creativos/medellin/ es un error caro y silencioso:
 *      el anuncio sale con la direccion y los precios de otra tienda.
 *   3. Listar lo que hay en cada carpeta, para la herramienta ver-creativos.
 * ============================================================================
 */

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CODIGOS_SEDE, obtenerSedeNomenclatura } from './nomenclatura.js';
import { inspeccionarCreativoLocal } from './creatives.js';

/** Raiz del proyecto (la carpeta que contiene src/). */
export const RAIZ = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

/** Carpeta donde viven todas las piezas. */
export const CARPETA_CREATIVOS = join(RAIZ, 'creativos');

/** Carpeta de una sede: creativos/neiva, creativos/victoria... */
export function carpetaDeSede(sede) {
  const ficha = obtenerSedeNomenclatura(sede);
  return join(CARPETA_CREATIVOS, ficha.codigo.toLowerCase());
}

/** Crea la carpeta de cada una de las trece sedes si no existe. */
export function crearCarpetasDeSedes() {
  const creadas = [];
  for (const codigo of CODIGOS_SEDE) {
    const carpeta = carpetaDeSede(codigo);
    if (!existsSync(carpeta)) {
      mkdirSync(carpeta, { recursive: true });
      creadas.push(relative(RAIZ, carpeta));
    }
  }
  return creadas;
}

/**
 * Lista las piezas que hay en la carpeta de una sede.
 * Ignora lo que no sea imagen o video reconocible, sin romperse.
 *
 * @returns {{nombre:string, ruta:string, rutaRelativa:string, tipo:'imagen'|'video',
 *            bytes:number, megas:string, problema:string|null}[]}
 */
export function listarCreativosDeSede(sede) {
  const carpeta = carpetaDeSede(sede);
  if (!existsSync(carpeta)) return [];

  const entradas = readdirSync(carpeta)
    .filter((n) => !n.startsWith('.'))
    .filter((n) => statSync(join(carpeta, n)).isFile())
    .sort();

  return entradas.map((nombre) => {
    const ruta = join(carpeta, nombre);
    try {
      const info = inspeccionarCreativoLocal(ruta);
      return {
        nombre,
        ruta,
        rutaRelativa: relative(RAIZ, ruta),
        tipo: info.tipo,
        bytes: info.bytes,
        megas: info.megas,
        porPartes: info.porPartes,
        problema: null,
      };
    } catch (error) {
      return {
        nombre,
        ruta,
        rutaRelativa: relative(RAIZ, ruta),
        tipo: null,
        bytes: 0,
        megas: '0.0',
        porPartes: false,
        problema: error.message.replace(/^creatives: /, ''),
      };
    }
  });
}

/**
 * Resuelve la ruta de un creativo de una sede.
 *
 * Acepta las tres formas con las que la gente lo escribe:
 *   'tecnocamon50pro-neiva.png'              -> busca en creativos/neiva/
 *   './creativos/neiva/tecnocamon50pro.png'  -> ruta relativa al proyecto
 *   'C:\...\tecnocamon50pro.png'             -> ruta absoluta
 *
 * Si la pieza existe pero esta en la carpeta de OTRA sede, lanza: es casi
 * siempre un copiar y pegar de otra campana, y publicarlo significa anunciar
 * la tienda equivocada.
 *
 * @param {string} sede       codigo de sede del manual
 * @param {string} referencia nombre de archivo o ruta
 * @param {object} [opciones]
 * @param {boolean} [opciones.permitirFueraDeLaSede=false]
 * @returns {{ruta:string, rutaRelativa:string, enCarpetaDeLaSede:boolean}}
 */
export function resolverCreativo(sede, referencia, opciones = {}) {
  const { permitirFueraDeLaSede = false } = opciones;
  const ficha = obtenerSedeNomenclatura(sede);
  const carpeta = carpetaDeSede(sede);

  if (!referencia || !String(referencia).trim()) {
    throw new Error(`creativos-sede: falta la ruta del creativo del anuncio de ${ficha.codigo}.`);
  }

  const texto = String(referencia).trim();
  const esRuta = texto.includes('/') || texto.includes('\\');

  // Nombre suelto: siempre se busca en la carpeta de su sede.
  if (!esRuta) {
    const ruta = join(carpeta, texto);
    if (!existsSync(ruta)) {
      throw new Error(
        `creativos-sede: no existe "${texto}" en la carpeta de ${ficha.codigo}.\n` +
          `  Buscado en: ${relative(RAIZ, carpeta)}${sep}\n` +
          `  ${describirContenido(sede)}`,
      );
    }
    return { ruta, rutaRelativa: relative(RAIZ, ruta), enCarpetaDeLaSede: true };
  }

  const ruta = isAbsolute(texto) ? resolve(texto) : resolve(RAIZ, texto);
  if (!existsSync(ruta)) {
    throw new Error(`creativos-sede: no existe el archivo "${texto}".\n  Ruta resuelta: ${ruta}`);
  }

  const enCarpetaDeLaSede = resolve(dirname(ruta)) === resolve(carpeta);

  if (!enCarpetaDeLaSede && !permitirFueraDeLaSede) {
    const carpetaAjena = detectarSedeDeLaCarpeta(ruta);
    const detalle = carpetaAjena
      ? `Esa pieza esta en la carpeta de ${carpetaAjena}, no en la de ${ficha.codigo}.`
      : `Esa pieza esta fuera de creativos/${ficha.codigo.toLowerCase()}/.`;

    throw new Error(
      `creativos-sede: "${basename(ruta)}" no pertenece a ${ficha.codigo}.\n` +
        `  ${detalle}\n` +
        `  Muevela a ${relative(RAIZ, carpeta)}${sep} o, si de verdad quieres usar una pieza\n` +
        `  compartida, pon permitirCreativoFueraDeLaSede: true en la campana.`,
    );
  }

  return { ruta, rutaRelativa: relative(RAIZ, ruta), enCarpetaDeLaSede };
}

/** Si el archivo vive en creativos/<algo>/, devuelve el codigo de esa sede. */
function detectarSedeDeLaCarpeta(ruta) {
  const carpeta = basename(dirname(ruta)).toUpperCase();
  return CODIGOS_SEDE.includes(carpeta) ? carpeta : null;
}

/** Frase corta con lo que hay en la carpeta, para los mensajes de error. */
function describirContenido(sede) {
  const piezas = listarCreativosDeSede(sede);
  if (piezas.length === 0) return 'La carpeta esta vacia o no existe todavia.';
  const lista = piezas.slice(0, 8).map((p) => p.nombre).join(', ');
  const resto = piezas.length > 8 ? ` y ${piezas.length - 8} mas` : '';
  return `Hay: ${lista}${resto}`;
}

/** Cuantas piezas tiene cada sede. Para el resumen de ver-creativos. */
export function inventarioPorSede() {
  return CODIGOS_SEDE.map((codigo) => {
    const piezas = listarCreativosDeSede(codigo);
    return {
      sede: codigo,
      dist: obtenerSedeNomenclatura(codigo).dist,
      carpeta: relative(RAIZ, carpetaDeSede(codigo)),
      existe: existsSync(carpetaDeSede(codigo)),
      imagenes: piezas.filter((p) => p.tipo === 'imagen').length,
      videos: piezas.filter((p) => p.tipo === 'video').length,
      problemas: piezas.filter((p) => p.problema),
      piezas,
    };
  });
}

export default {
  RAIZ,
  CARPETA_CREATIVOS,
  carpetaDeSede,
  crearCarpetasDeSedes,
  listarCreativosDeSede,
  resolverCreativo,
  inventarioPorSede,
};
