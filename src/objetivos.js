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

/* -------------------------------------------------------------------------- */
/*  Los SEIS objetivos oficiales de Meta                                      */
/* -------------------------------------------------------------------------- */

/**
 * El catalogo de Meta desde el cambio de 2022 (ODAX). Son estos seis y no hay
 * mas: los nombres antiguos (CONVERSIONS, POST_ENGAGEMENT, MESSAGES...) ya no
 * se aceptan al crear campanas nuevas.
 *
 * Se listan TODOS, incluidos los que Celred no usa, para que en pantalla se
 * vea el catalogo real y no una seleccion sin explicar. Los que no aplican
 * salen deshabilitados con el motivo.
 *
 *   usaCelred  false -> aparece en la lista pero no se puede elegir
 */
export const OBJETIVOS_META = Object.freeze({
  OUTCOME_AWARENESS: {
    codigo: 'OUTCOME_AWARENESS',
    etiqueta: 'Reconocimiento',
    enAdsManager: 'Reconocimiento',
    para: 'Que te conozca el mayor numero de personas posible. No busca ni clics ni mensajes.',
    usaCelred: true,
  },
  OUTCOME_TRAFFIC: {
    codigo: 'OUTCOME_TRAFFIC',
    etiqueta: 'Trafico',
    enAdsManager: 'Trafico',
    para: 'Llevar gente a un destino: una pagina, un perfil o un chat. Se mide en clics.',
    usaCelred: true,
  },
  OUTCOME_ENGAGEMENT: {
    codigo: 'OUTCOME_ENGAGEMENT',
    etiqueta: 'Interacciones',
    enAdsManager: 'Interacciones',
    para: 'Mensajes, interacciones con la publicacion, vistas de video o reproducciones.',
    usaCelred: true,
  },
  OUTCOME_LEADS: {
    codigo: 'OUTCOME_LEADS',
    etiqueta: 'Clientes potenciales',
    enAdsManager: 'Clientes potenciales',
    para: 'Recoger datos de gente interesada: formularios, llamadas o conversaciones.',
    usaCelred: true,
  },
  OUTCOME_SALES: {
    codigo: 'OUTCOME_SALES',
    etiqueta: 'Ventas',
    enAdsManager: 'Ventas',
    para: 'Encontrar a quien tiene mas probabilidad de comprar. Necesita pixel o catalogo para medir bien.',
    usaCelred: true,
  },
  OUTCOME_APP_PROMOTION: {
    codigo: 'OUTCOME_APP_PROMOTION',
    etiqueta: 'Promocion de la aplicacion',
    enAdsManager: 'Promocion de la aplicacion',
    para: 'Conseguir instalaciones o acciones dentro de una app propia.',
    usaCelred: false,
    porQueNo: 'Celred no tiene aplicacion propia registrada en Meta, asi que este objetivo no se puede usar.',
  },
});

export const CODIGOS_OBJETIVO_META = Object.keys(OBJETIVOS_META);

/* -------------------------------------------------------------------------- */
/*  Las configuraciones concretas que usa Celred                              */
/* -------------------------------------------------------------------------- */

/**
 *  codigo            como lo llamamos aqui
 *  etiqueta          como se le enseña a una persona
 *  queConsigue       una linea explicando para que sirve
 *  objetivoMeta      campaign.objective — uno de los seis de arriba
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

  /**
   * Los dos de abajo llevan a WhatsApp igual que MENSAJES_WHATSAPP, pero
   * colgando de otro objetivo de Meta. En Ads Manager son rutas distintas
   * hacia el mismo sitio, y Meta optimiza distinto en cada una.
   *
   * Estan SIN ENSAYAR. La combinacion existe en la interfaz de Meta, pero no
   * la he mandado por API contra esta cuenta, asi que no la doy por buena:
   * `npm run validar` lo dice en un minuto y sin crear nada.
   */
  LEADS_WHATSAPP: {
    codigo: 'LEADS_WHATSAPP',
    etiqueta: 'Clientes potenciales por WhatsApp',
    queConsigue:
      'Como el de mensajes, pero Meta busca a quien deja sus datos o pregunta en serio, no solo a quien escribe.',
    enAdsManager: 'Clientes potenciales → Mensajes → WhatsApp',
    objetivoMeta: 'OUTCOME_LEADS',
    optimizationGoal: 'CONVERSATIONS',
    billingEvent: 'IMPRESSIONS',
    destinationType: 'WHATSAPP',
    prefijo: 'C',
    ambito: 'sede',
    tipoPresupuesto: 'sede',
    usaWhatsApp: true,
    ensayado: false,
    notaDeEnsayo:
      'La ruta existe en Ads Manager, pero esta combinacion no se ha mandado por API contra esta cuenta.',
  },

  VENTAS_WHATSAPP: {
    codigo: 'VENTAS_WHATSAPP',
    etiqueta: 'Ventas por WhatsApp',
    queConsigue:
      'Meta busca a quien tiene mas pinta de comprar. Rinde mejor cuando hay pixel o catalogo que le enseñen que es una venta.',
    enAdsManager: 'Ventas → Mensajes → WhatsApp',
    objetivoMeta: 'OUTCOME_SALES',
    optimizationGoal: 'CONVERSATIONS',
    billingEvent: 'IMPRESSIONS',
    destinationType: 'WHATSAPP',
    prefijo: 'C',
    ambito: 'sede',
    tipoPresupuesto: 'sede',
    usaWhatsApp: true,
    ensayado: false,
    notaDeEnsayo:
      'La ruta existe en Ads Manager, pero esta combinacion no se ha mandado por API contra esta cuenta. ' +
      'Ademas, sin pixel ni catalogo configurados Meta tiene poco con que optimizar.',
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
      objetivoMeta: o.objetivoMeta,
      // Los tres campos reales, para el bloque de "detalles tecnicos".
      meta: camposDeMeta(codigo),
    };
  });
}

/**
 * El catalogo completo, agrupado como lo agrupa Ads Manager: los seis
 * objetivos oficiales de Meta y, colgando de cada uno, las configuraciones
 * concretas que puede elegir Celred.
 *
 * Los objetivos que Celred no usa salen igual, deshabilitados y con el
 * motivo: es mejor ver el catalogo entero y saber por que falta algo que ver
 * una lista recortada sin explicacion.
 */
export function catalogoParaLaInterfaz() {
  const porObjetivo = new Map(CODIGOS_OBJETIVO_META.map((c) => [c, []]));

  for (const opcion of listarParaLaInterfaz()) {
    porObjetivo.get(opcion.objetivoMeta)?.push(opcion);
  }

  return CODIGOS_OBJETIVO_META.map((codigo) => {
    const meta = OBJETIVOS_META[codigo];
    const opciones = porObjetivo.get(codigo) || [];

    return {
      ...meta,
      opciones,
      // Sin configuracion no se puede elegir, aunque Meta si lo soporte.
      disponible: meta.usaCelred && opciones.length > 0,
      porQueNo:
        meta.porQueNo ||
        (meta.usaCelred && opciones.length === 0
          ? 'Meta lo soporta, pero todavia no hay ninguna configuracion de Celred para este objetivo.'
          : ''),
    };
  });
}

export default {
  OBJETIVOS,
  OBJETIVOS_META,
  CODIGOS_OBJETIVO,
  CODIGOS_OBJETIVO_META,
  OBJETIVO_POR_DEFECTO,
  obtenerObjetivo,
  prefijoDe,
  usaWhatsApp,
  camposDeMeta,
  listarParaLaInterfaz,
  catalogoParaLaInterfaz,
};
