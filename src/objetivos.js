/**
 * ============================================================================
 *  src/objetivos.js — Que se quiere conseguir con la campana
 * ============================================================================
 *  El objetivo es lo PRIMERO que se elige, y de el sale casi todo lo demas:
 *  el prefijo del nombre, que puede configurarse en el conjunto y que campos
 *  acepta Meta. No se deduce del nombre ni se adivina: se guarda como dato.
 *
 *  POR QUE ESTE ARCHIVO EXISTE APARTE
 *
 *  Meta cambio los nombres de sus objetivos en 2022 (ODAX). Lo que en la
 *  interfaz de Ads Manager se llama "Interacciones" es `OUTCOME_ENGAGEMENT`
 *  en la API, y dentro de ese objetivo caben cosas muy distintas segun el
 *  `optimization_goal` y el `destination_type`. Mezclar los tres en un solo
 *  campo es la forma mas rapida de mandarle a Meta una combinacion que no
 *  existe.
 *
 *  Aqui cada objetivo declara los tres por separado, mas lo que la interfaz
 *  necesita saber para no ofrecer opciones imposibles.
 *
 *  LO QUE ESTA CONFIRMADO Y LO QUE NO
 *
 *  `MENSAJES_WHATSAPP` esta comprobado contra la API real: paso el ensayo con
 *  execution_options=['validate_only'] en la cuenta CA 02 el 23/09/2026.
 *
 *  Los otros dos siguen la documentacion de Meta pero NO se han ensayado
 *  todavia contra la cuenta. Llevan `ensayado: false` y la interfaz lo dice.
 *  Se comprueban con:  npm run validar <campana>
 * ============================================================================
 */

/**
 *  codigo            como lo llamamos aqui
 *  etiqueta          como se le enseña a una persona
 *  queConsigue       una linea explicando para que sirve
 *  objetivoMeta      campaign.objective
 *  optimizationGoal  adset.optimization_goal
 *  billingEvent      adset.billing_event
 *  destinationType   adset.destination_type, o null si no aplica
 *  prefijo           'C' para campanas de sede, 'R' para regionales
 *  ambito            'sede' | 'regional'
 *  tipoPresupuesto   contra que rango del punto 9 se valida
 *  usaWhatsApp       si hace falta numero y promoted_object
 *  ensayado          si ya paso validate_only contra la cuenta real
 */
export const OBJETIVOS = Object.freeze({
  MENSAJES_WHATSAPP: {
    codigo: 'MENSAJES_WHATSAPP',
    etiqueta: 'Mensajes a WhatsApp',
    queConsigue: 'Que la gente abra un chat de WhatsApp con la tienda. Es lo que se pauta hoy en las sedes.',
    enAdsManager: 'Interacciones → Mensajes → WhatsApp',
    objetivoMeta: 'OUTCOME_ENGAGEMENT',
    optimizationGoal: 'CONVERSATIONS',
    billingEvent: 'IMPRESSIONS',
    destinationType: 'WHATSAPP',
    prefijo: 'C',
    ambito: 'sede',
    tipoPresupuesto: 'sede',
    usaWhatsApp: true,
    ensayado: true,
    notaDeEnsayo: 'Comprobado con validate_only en CA 02 el 23/09/2026.',
  },

  RECONOCIMIENTO: {
    codigo: 'RECONOCIMIENTO',
    etiqueta: 'Reconocimiento de marca',
    queConsigue: 'Llegar al mayor numero de personas de la region. No busca conversaciones ni clics.',
    enAdsManager: 'Reconocimiento → Alcance',
    objetivoMeta: 'OUTCOME_AWARENESS',
    optimizationGoal: 'REACH',
    billingEvent: 'IMPRESSIONS',
    destinationType: null,
    prefijo: 'R',
    ambito: 'regional',
    tipoPresupuesto: 'regional',
    usaWhatsApp: false,
    ensayado: false,
    notaDeEnsayo: 'Sigue la documentacion de Meta pero no se ha ensayado contra la cuenta todavia.',
  },

  TRAFICO: {
    codigo: 'TRAFICO',
    etiqueta: 'Trafico',
    queConsigue: 'Llevar gente a un destino: una pagina, un perfil o un chat. Se mide en clics, no en ventas.',
    enAdsManager: 'Trafico → Clics en el enlace',
    objetivoMeta: 'OUTCOME_TRAFFIC',
    optimizationGoal: 'LINK_CLICKS',
    billingEvent: 'IMPRESSIONS',
    destinationType: null,
    prefijo: 'R',
    ambito: 'regional',
    tipoPresupuesto: 'regional',
    usaWhatsApp: false,
    ensayado: false,
    notaDeEnsayo: 'Sigue la documentacion de Meta pero no se ha ensayado contra la cuenta todavia.',
  },
});

export const CODIGOS_OBJETIVO = Object.keys(OBJETIVOS);

/** El que se usa si no se dice nada: es el 99% de lo que se pauta. */
export const OBJETIVO_POR_DEFECTO = 'MENSAJES_WHATSAPP';

/**
 * Devuelve la ficha de un objetivo, o lanza con la lista de los validos.
 * @param {string} codigo
 */
export function obtenerObjetivo(codigo = OBJETIVO_POR_DEFECTO) {
  const clave = String(codigo || OBJETIVO_POR_DEFECTO).trim().toUpperCase().replace(/[\s-]+/g, '_');
  const ficha = OBJETIVOS[clave];

  if (!ficha) {
    const e = new Error(
      `El objetivo "${codigo}" no existe.\n` +
        `  Los disponibles son:\n` +
        CODIGOS_OBJETIVO.map((c) => `  · ${c} — ${OBJETIVOS[c].etiqueta}`).join('\n'),
    );
    e.amigable = true;
    e.titulo = 'Objetivo desconocido';
    throw e;
  }

  return ficha;
}

/**
 * El prefijo del nombre de campana sale del objetivo, no de una casilla
 * aparte. Una campana de reconocimiento es regional por definicion, y las
 * regionales llevan R (punto 10 del manual).
 */
export function prefijoDe(codigoObjetivo) {
  return obtenerObjetivo(codigoObjetivo).prefijo;
}

/** true si el objetivo necesita numero de WhatsApp y promoted_object. */
export function usaWhatsApp(codigoObjetivo) {
  return obtenerObjetivo(codigoObjetivo).usaWhatsApp;
}

/**
 * Los campos de Meta que corresponden a un objetivo, listos para el payload.
 * Se devuelven por separado a proposito: son tres niveles distintos de la API
 * y tratarlos como uno solo es de donde salen los rechazos.
 */
export function camposDeMeta(codigoObjetivo) {
  const o = obtenerObjetivo(codigoObjetivo);
  return {
    // Nivel CAMPANA
    objective: o.objetivoMeta,
    // Nivel CONJUNTO
    optimization_goal: o.optimizationGoal,
    billing_event: o.billingEvent,
    destination_type: o.destinationType,
  };
}

/** Lo que la interfaz necesita para pintar el selector del paso 1. */
export function listarParaLaInterfaz() {
  return CODIGOS_OBJETIVO.map((codigo) => {
    const o = OBJETIVOS[codigo];
    return {
      codigo,
      etiqueta: o.etiqueta,
      queConsigue: o.queConsigue,
      enAdsManager: o.enAdsManager,
      prefijo: o.prefijo,
      ambito: o.ambito,
      usaWhatsApp: o.usaWhatsApp,
      ensayado: o.ensayado,
      notaDeEnsayo: o.notaDeEnsayo,
      // Los tres campos reales, para el bloque de "detalles tecnicos".
      meta: camposDeMeta(codigo),
    };
  });
}

export default {
  OBJETIVOS,
  CODIGOS_OBJETIVO,
  OBJETIVO_POR_DEFECTO,
  obtenerObjetivo,
  prefijoDe,
  usaWhatsApp,
  camposDeMeta,
  listarParaLaInterfaz,
};
