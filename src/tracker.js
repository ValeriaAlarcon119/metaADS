/**
 * ============================================================================
 *  src/tracker.js — Consecutivos leidos de Ads Manager en tiempo real
 * ============================================================================
 *  REGLA 4: consecutivos automaticos, segun el manual de nomenclatura v1.2.
 *
 *    Campana   C#     consecutivo historico POR SEDE, nunca se reinicia
 *                     (punto 4). Se calcula sobre todas las campanas de la
 *                     cuenta cuyo nombre empiece por C<n> y siga con el codigo
 *                     de la sede.
 *    Conjunto  CJTO#  consecutivo DENTRO de la campana, arranca en 1 (punto 5)
 *    Anuncio   ADS#   consecutivo DENTRO del conjunto, arranca en 1 (punto 6)
 *
 *  Este modulo es 100% de SOLO LECTURA. Nunca crea ni modifica nada.
 *
 *  Aviso sobre Medellin: el punto 7 dice que su C# es uno solo aunque la sede
 *  viva en las dos cuentas. Como este modulo solo ve la cuenta configurada en
 *  el .env, para MEDELLIN devuelve un aviso pidiendo confirmar el consecutivo
 *  contra la otra cuenta antes de crear.
 * ============================================================================
 */

import bizSdk from 'facebook-nodejs-business-sdk';

import {
  siguienteConsecutivoCampana,
  siguienteConsecutivoConjunto,
  siguienteConsecutivoAnuncio,
  obtenerSedeNomenclatura,
} from './nomenclatura.js';

const { Campaign, AdSet, Ad } = bizSdk;

/** Tipos de objeto soportados. */
export const TIPOS = Object.freeze({
  CAMPANA: 'campaign',
  ADSET: 'adset',
  AD: 'ad',
});

/**
 * Recorre un Cursor del SDK y devuelve TODOS los elementos paginados.
 * @param {Promise<any>} promesaCursor
 * @param {number} maxPaginas tope de seguridad para no iterar indefinidamente
 */
async function recolectarTodo(promesaCursor, maxPaginas = 40) {
  const cursor = await promesaCursor;
  let acumulado = Array.from(cursor);
  let paginas = 1;

  while (typeof cursor.hasNext === 'function' && cursor.hasNext() && paginas < maxPaginas) {
    const siguiente = await cursor.next();
    acumulado = acumulado.concat(Array.from(siguiente));
    paginas += 1;
  }

  return acumulado;
}

const nombreDe = (o) => (o?._data ? o._data.name : o?.name);

/* -------------------------------------------------------------------------- */
/*  Listados de solo lectura                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Nombres de todas las campanas de la cuenta.
 * Se pide `effective_status` vacio a proposito: el consecutivo tiene que
 * contar tambien las campanas apagadas y eliminadas, porque el punto 4 dice
 * que un numero no se reutiliza jamas.
 */
export async function listarNombresDeCampanas(adAccount, { maxPaginas = 40 } = {}) {
  const objetos = await recolectarTodo(
    adAccount.getCampaigns([Campaign.Fields.name, Campaign.Fields.id], { limit: 500 }),
    maxPaginas,
  );
  return objetos.map(nombreDe).filter(Boolean);
}

/** Nombres de los conjuntos que cuelgan de una campana. */
export async function listarNombresDeConjuntos(campaignId, { maxPaginas = 10 } = {}) {
  const objetos = await recolectarTodo(
    new Campaign(campaignId).getAdSets([AdSet.Fields.name, AdSet.Fields.id], { limit: 500 }),
    maxPaginas,
  );
  return objetos.map(nombreDe).filter(Boolean);
}

/** Nombres de los anuncios que cuelgan de un conjunto. */
export async function listarNombresDeAnuncios(adSetId, { maxPaginas = 10 } = {}) {
  const objetos = await recolectarTodo(
    new AdSet(adSetId).getAds([Ad.Fields.name, Ad.Fields.id], { limit: 500 }),
    maxPaginas,
  );
  return objetos.map(nombreDe).filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/*  Consecutivos                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Siguiente C# de una sede (punto 4).
 *
 * @param {object} adAccount instancia de AdAccount
 * @param {string} sede      codigo de sede del manual (NEIVA, VICTORIA, ...)
 * @returns {Promise<{siguiente:number, maximo:number, coincidencias:object[],
 *                    revisados:number, avisos:string[]}>}
 */
export async function consecutivoCampanaDeSede(adAccount, sede) {
  const ficha = obtenerSedeNomenclatura(sede);
  const nombres = await listarNombresDeCampanas(adAccount);
  const resultado = siguienteConsecutivoCampana(nombres, ficha.codigo);

  const avisos = [];
  if (ficha.codigo === 'MEDELLIN') {
    avisos.push(
      'Punto 7: Medellin es la unica sede repartida entre CA 01 y CA 02 y su C# es uno solo. ' +
        'Este calculo solo ve la cuenta del .env; confirma el consecutivo contra la otra cuenta antes de crear.',
    );
  }
  if (resultado.maximo === 0) {
    avisos.push(
      `No se encontro ninguna campana previa de ${ficha.codigo} con la nomenclatura del manual. ` +
        'Se arranca en C1; verificalo contra la hoja "Consecutivos" del Excel de control (punto 4).',
    );
  }

  return { ...resultado, revisados: nombres.length, avisos };
}

/** Siguiente CJTO# dentro de una campana (punto 5). Arranca en 1. */
export async function consecutivoConjuntoDeCampana(campaignId) {
  if (!campaignId) return { siguiente: 1, maximo: 0, coincidencias: [], revisados: 0 };
  const nombres = await listarNombresDeConjuntos(campaignId);
  return { ...siguienteConsecutivoConjunto(nombres), revisados: nombres.length };
}

/** Siguiente ADS# dentro de un conjunto (punto 6). Arranca en 1. */
export async function consecutivoAnuncioDeConjunto(adSetId) {
  if (!adSetId) return { siguiente: 1, maximo: 0, coincidencias: [], revisados: 0 };
  const nombres = await listarNombresDeAnuncios(adSetId);
  return { ...siguienteConsecutivoAnuncio(nombres), revisados: nombres.length };
}

export default {
  TIPOS,
  listarNombresDeCampanas,
  listarNombresDeConjuntos,
  listarNombresDeAnuncios,
  consecutivoCampanaDeSede,
  consecutivoConjuntoDeCampana,
  consecutivoAnuncioDeConjunto,
};
