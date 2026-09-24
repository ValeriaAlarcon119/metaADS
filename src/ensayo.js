/**
 * ============================================================================
 *  src/ensayo.js — Preguntarle a Meta antes de crear nada
 * ============================================================================
 *  Manda a Meta los MISMOS parametros con los que se crearia, pero con
 *  `execution_options=['validate_only']`. Meta los revisa como si fuera a
 *  crear, contesta si los acepta... y no crea nada. No queda ningun objeto en
 *  Ads Manager.
 *
 *  POR QUE EXISTE
 *
 *  La creacion real va en orden: primero la campana, luego el conjunto, luego
 *  los anuncios. Si el conjunto es rechazado —por ejemplo porque el token no
 *  tiene permiso sobre la Pagina— la campana YA esta creada, y queda una
 *  campana vacia en Ads Manager que alguien tiene que ir a borrar a mano.
 *  Ademas quema un numero del consecutivo, que segun el punto 4 del manual no
 *  se reutiliza jamas.
 *
 *  Esto se corre antes. Si Meta dice que no, no se crea nada en absoluto.
 *
 *  LO QUE NO PUEDE COMPROBAR
 *  El creativo: `validate_only` no existe para /adcreatives y el creativo
 *  necesita el asset ya subido. Se sabe al crear de verdad.
 * ============================================================================
 */

import axios from 'axios';

import { paramsDeCampana, paramsDeConjunto } from './builder.js';
import { ACCESS_TOKEN, GRAPH_BASE } from './config.js';

/**
 * Saca de un error de Meta lo que de verdad le sirve a una persona.
 *
 * `error.message` suele ser "Invalid parameter", que no dice nada. La razon
 * real viene en `error_user_title` y `error_user_msg`, y el par codigo +
 * subcodigo es lo unico que se puede buscar en la documentacion.
 */
export function detalleDeMeta(error) {
  const e =
    error?.response?.data?.error ||
    error?.response?.error ||
    error?._response?.error ||
    error?._error?.response?.error ||
    null;

  if (!e) return { mensaje: error?.message || 'Error desconocido' };

  return {
    mensaje: e.error_user_title || e.message || error?.message || 'Error desconocido',
    detalle: e.error_user_msg || '',
    tecnico: e.message || '',
    codigo: e.code,
    subcodigo: e.error_subcode,
    traza: e.fbtrace_id || '',
  };
}

/** POST con validate_only. Devuelve {ok} o {ok:false, ...detalleDeMeta}. */
async function ensayar(camino, params) {
  const cuerpo = new URLSearchParams();
  cuerpo.append('access_token', ACCESS_TOKEN);
  cuerpo.append('execution_options', JSON.stringify(['validate_only']));

  for (const [clave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null) continue;
    cuerpo.append(clave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor));
  }

  try {
    await axios.post(`${GRAPH_BASE}/${camino}`, cuerpo, { timeout: 60000 });
    return { ok: true };
  } catch (error) {
    return { ok: false, ...detalleDeMeta(error) };
  }
}

/**
 * Una campana cualquiera de la cuenta, para colgar de ella el conjunto del
 * ensayo. No se toca: con validate_only no se crea ni se modifica nada.
 */
async function algunaCampanaDeLaCuenta(cuentaId) {
  try {
    const { data } = await axios.get(`${GRAPH_BASE}/${cuentaId}/campaigns`, {
      params: { access_token: ACCESS_TOKEN, fields: 'id', limit: 1 },
      timeout: 30000,
    });
    return data?.data?.[0]?.id || null;
  } catch {
    return null;
  }
}

/**
 * Le pregunta a Meta si aceptaria este plan. No crea nada.
 *
 * @param {object} plan  el que devuelve planificarEstructura
 * @returns {Promise<{ok:boolean, problemas:object[], comprobado:string[]}>}
 */
export async function ensayarPlan(plan) {
  const problemas = [];
  const comprobado = [];

  /* --- La campana -------------------------------------------------------- */
  if (plan.campana.crear) {
    const r = await ensayar(`${plan.cuenta.id}/campaigns`, paramsDeCampana(plan, 'PAUSED'));
    if (r.ok) comprobado.push(`campana "${plan.campana.nombre}"`);
    else problemas.push({ donde: `la campana "${plan.campana.nombre}"`, ...r });
  }

  /* --- Los conjuntos ----------------------------------------------------- */
  // El conjunto tiene que colgar de una campana. Como no se creo ninguna, se
  // ensaya contra una que ya exista: los campos que importan —presupuesto,
  // destino, promoted_object, targeting— se validan igual.
  const campanaDeApoyo = plan.campana.id || (await algunaCampanaDeLaCuenta(plan.cuenta.id));

  if (!campanaDeApoyo) {
    // Sin ninguna campana en la cuenta no hay donde colgarlo. No se inventa un
    // veredicto: se deja constancia de que esa parte no se comprobo.
    return {
      ok: problemas.length === 0,
      problemas,
      comprobado,
      sinComprobar: 'los conjuntos, porque la cuenta no tiene ninguna campana contra la que ensayar',
    };
  }

  for (const conjunto of plan.conjuntos) {
    const r = await ensayar(
      `${plan.cuenta.id}/adsets`,
      paramsDeConjunto(plan, campanaDeApoyo, 'PAUSED', conjunto.indice),
    );
    if (r.ok) comprobado.push(`conjunto "${conjunto.nombre}"`);
    else problemas.push({ donde: `el conjunto "${conjunto.nombre}"`, ...r });
  }

  return { ok: problemas.length === 0, problemas, comprobado, sinComprobar: '' };
}

export default { ensayarPlan, detalleDeMeta };
