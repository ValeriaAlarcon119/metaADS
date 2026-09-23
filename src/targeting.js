/**
 * ============================================================================
 *  src/targeting.js — Segmentacion estricta por sede
 * ============================================================================
 *  REGLA 3: Desactivacion de expansion de publico.
 *  Este modulo construye el objeto `targeting` con geolocalizacion estricta y
 *  apaga por codigo toda forma de expansion automatica que Meta siga dejando
 *  apagar:
 *
 *    - targeting_automation.advantage_audience = 0     Advantage+ Audience OFF
 *      ("Llegar a mas personas cuando sea probable que mejore el rendimiento")
 *    - targeting_automation.individual_setting         edad, genero y geo fijos
 *    - targeting_relaxation_types.lookalike = 0        expansion lookalike OFF
 *    - targeting_relaxation_types.custom_audience = 0  expansion de publicos OFF
 *
 *  `sanitizarTargeting()` vuelve a forzar los cuatro interruptores justo antes
 *  de enviar el AdSet, asi que aunque alguien pase un override no hay forma de
 *  que la expansion quede encendida.
 *
 *  SOBRE targeting_optimization — LEER ANTES DE VOLVER A PONERLO
 *
 *  Hasta hace poco este modulo enviaba `targeting_optimization: 'none'` para
 *  apagar la expansion de segmentacion detallada. Meta ELIMINO ese campo y hoy
 *  rechaza el conjunto entero si se envia:
 *
 *    "No necesitas establecer un valor para el campo targeting_optimization
 *     porque se elimino. La orientacion detallada Advantage se aplicara a tu
 *     conjunto de anuncios."  (codigo 100, subcodigo 1870197)
 *
 *  Es decir: Meta quito el interruptor y la orientacion detallada Advantage se
 *  aplica siempre. Por eso `targeting_optimization` pasa a la lista de claves
 *  prohibidas y se borra si alguien lo cuela.
 *
 *  Lo que eso significa en la practica AQUI: la orientacion detallada Advantage
 *  amplia mas alla de los intereses y comportamientos que uno elige. Estas
 *  campanas NO eligen ninguno —`flexible_spec` nunca se envia— asi que no hay
 *  intereses desde los que ampliar: el publico es geografia + edad. La casilla
 *  que pidio el cliente, "llegar a mas personas cuando sea probable que mejore
 *  el rendimiento", es `advantage_audience` y esa SI se sigue pudiendo apagar.
 *
 *  Aun asi, conviene confirmarlo en Ads Manager la primera vez.
 *
 *  Geolocalizacion: se prefiere la CIUDAD de Meta con radio, que es lo que
 *  produce la interfaz de Ads Manager cuando se escribe "Neiva + 40 km".
 *  Cuando no hay clave de ciudad se cae a un punto lat/lng con radio.
 * ============================================================================
 */

/* -------------------------------------------------------------------------- */
/*  Diccionario de sedes CELRED                                               */
/* -------------------------------------------------------------------------- */
/**
 *  codigo     -> codigo de sede del manual de nomenclatura (punto 7)
 *  ciudadKey  -> clave de ciudad de Meta, para segmentar "ciudad + radio"
 *  lat/lng    -> punto exacto del local, para segmentar un radio sobre la tienda
 *  radioKm    -> radio por defecto (Meta admite de 1 a 80 km)
 *  modoGeo    -> que usa la sede si la campana no dice otra cosa
 *
 *  LAS CLAVES DE CIUDAD SON REALES: estan leidas de los adsets que hoy corren
 *  en CA 01 y CA 02, no inventadas. Nueve ciudades cubren las trece sedes.
 *
 *  POR QUE UNAS SEDES USAN CIUDAD Y OTRAS PUNTO
 *
 *  Seis sedes comparten ciudad con otra: tres en Ipiales (Victoria, Zafiro,
 *  Markus) y tres en Pasto (La 16, Sebastian, Liceo). Si las seis segmentaran
 *  "la ciudad + radio", las tres de cada ciudad competirian por exactamente el
 *  mismo publico en la misma subasta, encareciendose entre ellas. Por eso esas
 *  seis usan por defecto el punto de la tienda, y las otras siete —que son la
 *  unica de Celred en su ciudad— usan la ciudad completa.
 *
 *  Cualquier campana puede forzar el otro modo con segmentacion.modoGeo.
 *
 *  AJUSTA las coordenadas con el GPS real del local antes de pautar en serio:
 *  un radio pequeno mal centrado deja la tienda fuera de su propia zona.
 */
export const SEDES = Object.freeze({
  // ------------------------- NARINO — Ipiales (3 sedes) --------------------
  // Ciudad Ipiales 468081. Las tres comparten ciudad: por defecto van por punto.
  IPIALES_VICTORIA: {
    etiqueta: 'Ipiales — Victoria Plaza',
    codigo: 'VICTORIA',
    ciudad: 'Ipiales',
    departamento: 'Narino',
    ciudadKey: 468081,
    lat: 0.8256,
    lng: -77.6449,
    radioKm: 12,
    modoGeo: 'punto',
  },
  IPIALES_ZAFIRO: {
    etiqueta: 'Ipiales — CC Zafiro',
    codigo: 'ZAFIRO',
    ciudad: 'Ipiales',
    departamento: 'Narino',
    ciudadKey: 468081,
    lat: 0.828,
    lng: -77.6421,
    radioKm: 12,
    modoGeo: 'punto',
  },
  IPIALES_MARKUS: {
    etiqueta: 'Ipiales — Markus',
    codigo: 'MARKUS',
    ciudad: 'Ipiales',
    departamento: 'Narino',
    ciudadKey: 468081,
    lat: 0.8264,
    lng: -77.6437,
    radioKm: 12,
    modoGeo: 'punto',
  },

  // -------------------------- NARINO — Pasto (3 sedes) ---------------------
  // Ciudad Pasto 475846. Las tres comparten ciudad: por defecto van por punto.
  PASTO_LA16: {
    etiqueta: 'Pasto — La 16',
    codigo: 'LA16',
    ciudad: 'Pasto',
    departamento: 'Narino',
    ciudadKey: 475846,
    lat: 1.2136,
    lng: -77.2811,
    radioKm: 15,
    modoGeo: 'punto',
  },
  PASTO_SEBASTIAN: {
    etiqueta: 'Pasto — CC Sebastian de Belalcazar',
    codigo: 'SEBASTIAN',
    ciudad: 'Pasto',
    departamento: 'Narino',
    ciudadKey: 475846,
    lat: 1.2051,
    lng: -77.2762,
    radioKm: 15,
    modoGeo: 'punto',
  },
  PASTO_LICEO: {
    etiqueta: 'Pasto — El Liceo',
    codigo: 'LICEO',
    ciudad: 'Pasto',
    departamento: 'Narino',
    ciudadKey: 475846,
    lat: 1.2117,
    lng: -77.2789,
    radioKm: 15,
    modoGeo: 'punto',
  },

  // --------------------------- NARINO — Tuquerres --------------------------
  TUQUERRES: {
    etiqueta: 'Tuquerres — Centro',
    codigo: 'TUQUERRES',
    ciudad: 'Tuquerres',
    departamento: 'Narino',
    ciudadKey: 480947,
    lat: 1.087,
    lng: -77.619,
    radioKm: 31,
    modoGeo: 'ciudad',
  },

  // ------------------------------- PUTUMAYO --------------------------------
  LA_HORMIGA: {
    etiqueta: 'La Hormiga — Centro',
    codigo: 'HORMIGA',
    ciudad: 'La Hormiga (Valle del Guamuez)',
    departamento: 'Putumayo',
    // Esta clave se leyo de exclusiones de otros adsets, no de una campana de
    // la propia sede: hoy La Hormiga se pauta por el departamento entero.
    // La clave es real, pero conviene revisar el alcance en la vista previa.
    ciudadKey: 469985,
    lat: 0.5197,
    lng: -76.8875,
    radioKm: 40,
    modoGeo: 'ciudad',
  },
  PUERTO_ASIS: {
    etiqueta: 'Puerto Asis — Centro',
    codigo: 'PTOASIS',
    ciudad: 'Puerto Asis',
    departamento: 'Putumayo',
    ciudadKey: 477002,
    lat: 0.5057,
    lng: -76.4966,
    radioKm: 40,
    modoGeo: 'ciudad',
  },
  MOCOA: {
    etiqueta: 'Mocoa — Centro',
    codigo: 'MOCOA',
    ciudad: 'Mocoa',
    departamento: 'Putumayo',
    ciudadKey: 474343,
    lat: 1.1492,
    lng: -76.6483,
    radioKm: 40,
    modoGeo: 'ciudad',
  },
  ORITO: {
    etiqueta: 'Orito — Centro',
    codigo: 'ORITO',
    ciudad: 'Orito',
    departamento: 'Putumayo',
    ciudadKey: 475220,
    lat: 0.6647,
    lng: -76.8728,
    radioKm: 40,
    modoGeo: 'ciudad',
  },

  // ------------------------------- ANTIOQUIA -------------------------------
  MEDELLIN: {
    etiqueta: 'Medellin — Centro',
    codigo: 'MEDELLIN',
    ciudad: 'Medellin',
    departamento: 'Antioquia',
    ciudadKey: 474037,
    lat: 6.2518,
    lng: -75.5636,
    radioKm: 35,
    modoGeo: 'ciudad',
  },

  // --------------------------------- HUILA ---------------------------------
  NEIVA: {
    etiqueta: 'Neiva — Centro',
    codigo: 'NEIVA',
    ciudad: 'Neiva',
    departamento: 'Huila',
    ciudadKey: 474923,
    lat: 2.9273,
    lng: -75.2819,
    radioKm: 40,
    modoGeo: 'ciudad',
  },
});

/** Claves de sede disponibles, ordenadas. */
export const SEDES_DISPONIBLES = Object.keys(SEDES).sort();

/** Devuelve la sede o lanza un error claro con las opciones validas. */
export function obtenerSede(sedeKey) {
  const sede = SEDES[sedeKey];
  if (!sede) {
    throw new Error(
      `targeting: sede desconocida "${sedeKey}".\n` + `  Sedes validas: ${SEDES_DISPONIBLES.join(', ')}`,
    );
  }
  return { key: sedeKey, ...sede };
}

/* -------------------------------------------------------------------------- */
/*  Claves prohibidas: cualquier forma de expansion automatica de Meta        */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Los interruptores de expansion, explicados                                */
/* -------------------------------------------------------------------------- */

/**
 * Cada forma de expansion automatica que Meta todavia deja controlar.
 *
 * Esta lista es la fuente unica: de aqui salen los valores que se envian, la
 * auditoria posterior y lo que se enseña en el panel. Si se agrega uno nuevo,
 * aparece solo en la interfaz.
 *
 *   clave         como se llama aqui y en los ajustes del panel
 *   campo         donde vive en el objeto targeting de Meta
 *   nombre        como llamarlo delante de una persona
 *   enAdsManager  como aparece literalmente en la interfaz de Meta
 *   siSeEnciende  que pasa de verdad si se activa
 *   porQueApagado por que viene apagado por defecto en Celred
 *   editable      si se puede cambiar desde el panel
 */
export const INTERRUPTORES_DE_EXPANSION = Object.freeze([
  {
    clave: 'advantageAudience',
    campo: 'targeting_automation.advantage_audience',
    nombre: 'Publico Advantage+',
    enAdsManager: '«Llegar a mas personas cuando sea probable que mejore el rendimiento»',
    siSeEnciende:
      'Meta deja de respetar la edad y el publico que pusiste y muestra el anuncio a quien su modelo ' +
      'crea que puede escribir. La ubicacion si la respeta. Suele bajar el costo por conversacion, ' +
      'pero deja de ser TU segmentacion.',
    porQueApagado:
      'Es la casilla que el cliente pidio expresamente desmarcada. Con 13 sedes, ampliar el publico ' +
      'de una tienda se come el de la de al lado.',
    editable: true,
    porDefecto: false,
  },
  {
    clave: 'edadYGenero',
    campo: 'targeting_automation.individual_setting.age / gender / geo',
    nombre: 'Ampliar edad, genero y ubicacion',
    enAdsManager: 'No tiene casilla propia: va dentro de Advantage+',
    siSeEnciende:
      'Meta puede salirse del rango de edad y del genero que elegiste. Es lo que hace que un conjunto ' +
      'pedido para 18-55 termine entregando hasta los 65.',
    porQueApagado:
      'Sin esto en 0, el rango de edad que se aprueba en pantalla no es el que se entrega. Es un ' +
      'problema de confianza en el propio resumen.',
    editable: true,
    porDefecto: false,
  },
  {
    clave: 'lookalike',
    campo: 'targeting_relaxation_types.lookalike',
    nombre: 'Relajacion de publicos similares',
    enAdsManager: '«Expansion de publico similar»',
    siSeEnciende:
      'Si el conjunto usa un publico similar (lookalike), Meta puede salirse de el y buscar parecidos ' +
      'mas lejanos.',
    porQueApagado:
      'Estas campanas no usan publicos similares, asi que hoy no cambia nada. Se manda en 0 para que ' +
      'siga sin cambiar nada el dia que se usen.',
    editable: true,
    porDefecto: false,
  },
  {
    clave: 'publicosPersonalizados',
    campo: 'targeting_relaxation_types.custom_audience',
    nombre: 'Relajacion de publicos personalizados',
    enAdsManager: '«Expansion de publico personalizado»',
    siSeEnciende:
      'Si el conjunto usa un publico personalizado (una lista de clientes, por ejemplo), Meta puede ' +
      'salirse de esa lista.',
    porQueApagado: 'Mismo caso que el anterior: hoy no se usan listas, y cuando se usen no debe ampliarlas.',
    editable: true,
    porDefecto: false,
  },
  {
    clave: 'intereses',
    campo: 'flexible_spec',
    nombre: 'Intereses y comportamientos',
    enAdsManager: '«Segmentacion detallada»',
    siSeEnciende:
      'El conjunto segmentaria por intereses (por ejemplo «tecnologia» o «telefonia movil») en vez de ' +
      'ir a publico abierto.',
    porQueApagado:
      'Hoy estas campanas van a publico abierto: solo geografia y edad. Ademas, sin intereses no hay ' +
      'nada que la orientacion detallada Advantage pueda ampliar, que es la que Meta ya no deja apagar.',
    // No se puede elegir un interes desde una casilla: hay que decir cual.
    editable: false,
    razonNoEditable:
      'Para segmentar por intereses hay que decir cuales, y eso se escribe en el archivo de la campana ' +
      '(flexible_spec), no se marca en una casilla.',
    porDefecto: false,
  },
]);

/** Valores por defecto de los interruptores: todos apagados. */
export function expansionPorDefecto() {
  return Object.fromEntries(INTERRUPTORES_DE_EXPANSION.map((i) => [i.clave, i.porDefecto]));
}

/** Normaliza lo que llega del panel o del archivo de la campana. */
export function normalizarExpansion(pedida = {}) {
  const base = expansionPorDefecto();
  for (const interruptor of INTERRUPTORES_DE_EXPANSION) {
    if (!interruptor.editable) continue;
    const valor = pedida[interruptor.clave];
    if (valor !== undefined) base[interruptor.clave] = Boolean(valor);
  }
  return base;
}

/** Los que quedaron encendidos, con su explicacion. Para avisar en pantalla. */
export function expansionEncendida(expansion = {}) {
  return INTERRUPTORES_DE_EXPANSION.filter((i) => expansion[i.clave] === true);
}

/**
 * Se borran del targeting antes de enviarlo.
 *
 * `flexible_spec` entra aqui porque estas campanas corren sobre publico
 * abierto: si mas adelante se quieren intereses, se agregan a proposito y se
 * saca esta clave de la lista. Ojo: sin intereses no hay nada que la
 * orientacion detallada Advantage pueda ampliar, asi que quitarla de aqui
 * cambia mas cosas de las que parece.
 *
 * `targeting_optimization` entra porque Meta lo elimino y hoy hace fallar el
 * conjunto entero (ver la nota larga arriba).
 */
export const CLAVES_DE_EXPANSION_PROHIBIDAS = ['audience_network_positions_expansion', 'targeting_optimization'];

/**
 * Elimina de un objeto targeting toda clave de expansion y fuerza en 0 los
 * interruptores de Advantage+ / relajacion. Idempotente y defensiva: se llama
 * siempre justo antes de enviar el AdSet a Meta.
 */
export function sanitizarTargeting(targeting, expansionPedida = {}) {
  const limpio = JSON.parse(JSON.stringify(targeting || {}));
  const e = normalizarExpansion(expansionPedida);

  // `targeting_optimization` se borra siempre: Meta lo elimino y hace fallar
  // el conjunto. Los intereses solo se borran si no se pidieron a proposito.
  delete limpio.targeting_optimization;
  delete limpio.audience_network_positions_expansion;
  if (!e.intereses) delete limpio.flexible_spec;

  // Advantage+ Audience, y edad/genero/geo uno por uno: sin
  // individual_setting, Meta se reserva el derecho de ampliar la edad (por eso
  // las campanas actuales de Neiva salen con age_max 65 aunque el conjunto
  // pida 18-55).
  const abierto = e.edadYGenero ? 1 : 0;

  limpio.targeting_automation = {
    ...(limpio.targeting_automation || {}),
    advantage_audience: e.advantageAudience ? 1 : 0,
    individual_setting: { age: abierto, gender: abierto, geo: abierto },
  };

  limpio.targeting_relaxation_types = {
    ...(limpio.targeting_relaxation_types || {}),
    lookalike: e.lookalike ? 1 : 0,
    custom_audience: e.publicosPersonalizados ? 1 : 0,
  };

  return limpio;
}

/**
 * Comprueba que un targeting no lleve ninguna expansion encendida.
 * Se usa como ultima verificacion en la vista previa y despues de crear.
 * @returns {{ok:boolean, problemas:string[]}}
 */
export function auditarExpansion(targeting, expansionPedida = {}) {
  const t = targeting || {};
  const e = normalizarExpansion(expansionPedida);
  const problemas = [];

  /** Lo que de verdad lleva el targeting, interruptor por interruptor. */
  const real = {
    advantageAudience: t.targeting_automation?.advantage_audience === 1,
    edadYGenero: t.targeting_automation?.individual_setting?.age === 1,
    lookalike: t.targeting_relaxation_types?.lookalike === 1,
    publicosPersonalizados: t.targeting_relaxation_types?.custom_audience === 1,
    intereses: Array.isArray(t.flexible_spec) && t.flexible_spec.length > 0,
  };

  // Un problema no es "hay expansion encendida": es "el targeting no coincide
  // con lo que se aprobo". Encender algo a proposito es una decision valida;
  // que se encienda solo, no.
  for (const interruptor of INTERRUPTORES_DE_EXPANSION) {
    if (real[interruptor.clave] !== Boolean(e[interruptor.clave])) {
      problemas.push(
        `${interruptor.nombre}: el targeting dice ${real[interruptor.clave] ? 'ENCENDIDO' : 'apagado'} ` +
          `y se pidio ${e[interruptor.clave] ? 'ENCENDIDO' : 'apagado'} (${interruptor.campo}).`,
      );
    }
  }

  if (t.targeting_optimization !== undefined) {
    problemas.push('El targeting todavia lleva "targeting_optimization", que Meta elimino y hace fallar el conjunto.');
  }
  if (t.audience_network_positions_expansion !== undefined) {
    problemas.push('El targeting todavia lleva "audience_network_positions_expansion".');
  }

  const encendidos = expansionEncendida(e);

  return {
    // `ok` = el targeting es el que se aprobo, encendido o apagado.
    ok: problemas.length === 0,
    problemas,
    // `todoApagado` = ademas, no hay ninguna expansion activa.
    todoApagado: encendidos.length === 0,
    encendidos: encendidos.map((i) => ({ clave: i.clave, nombre: i.nombre, siSeEnciende: i.siSeEnciende })),
    valores: e,
  };
}

/* -------------------------------------------------------------------------- */
/*  Construccion del targeting                                                */
/* -------------------------------------------------------------------------- */

/**
 * Construye el objeto `targeting` de una sede.
 *
 * @param {string} sedeKey                 clave del diccionario SEDES
 * @param {object} [opciones]
 * @param {number} [opciones.edadMin=18]
 * @param {number} [opciones.edadMax=55]
 * @param {number[]} [opciones.generos]    [1]=hombres, [2]=mujeres, omitir=todos
 * @param {number} [opciones.radioKm]      sobreescribe el radio de la sede
 * @param {'ciudad'|'punto'} [opciones.modoGeo]  fuerza el modo de geolocalizacion
 * @param {string[]} [opciones.plataformas]      ['facebook','instagram',...]
 * @param {string[]} [opciones.dispositivos]     ['mobile'] o ['mobile','desktop']
 * @returns {object} targeting listo para el AdSet
 */
export function construirTargeting(sedeKey, opciones = {}) {
  const sede = obtenerSede(sedeKey);

  const {
    edadMin = 18,
    edadMax = 55,
    generos = null,
    radioKm = sede.radioKm,
    modoGeo = sede.modoGeo || (sede.ciudadKey ? 'ciudad' : 'punto'),
    plataformas = ['facebook', 'instagram'],
    // Los dos marcados de entrada. Meta reparte solo segun donde rinda mejor;
    // dejar fuera el escritorio de salida es descartar publico sin haberlo
    // medido. Se puede quitar desde el panel cuando haga falta.
    dispositivos = ['mobile', 'desktop'],
  } = opciones;

  const radio = Math.max(1, Math.min(80, Number(radioKm)));

  if (modoGeo === 'ciudad' && !sede.ciudadKey) {
    throw new Error(
      `targeting: la sede ${sedeKey} no tiene clave de ciudad de Meta configurada; ` +
        `usa modoGeo 'punto' o agrega ciudadKey en src/targeting.js.`,
    );
  }

  const geo_locations =
    modoGeo === 'ciudad'
      ? {
          // Ciudad + radio: es lo que produce Ads Manager al escribir
          // "Neiva + 40 km" y lo que usan hoy las campanas de la sede.
          cities: [
            {
              key: String(sede.ciudadKey),
              radius: radio,
              distance_unit: 'kilometer',
            },
          ],
          location_types: ['home', 'recent'],
        }
      : {
          custom_locations: [
            {
              latitude: sede.lat,
              longitude: sede.lng,
              radius: radio,
              distance_unit: 'kilometer',
            },
          ],
          // "home" + "recent" = vive o estuvo recientemente en la zona.
          // NO se incluye "travel_in", que es el que amplia a turistas.
          location_types: ['home', 'recent'],
        };

  const targeting = {
    geo_locations,

    age_min: edadMin,
    age_max: edadMax,

    // --- Ubicaciones manuales (no Advantage+ Placements) -------------------
    publisher_platforms: plataformas,
    device_platforms: dispositivos,
  };

  if (plataformas.includes('facebook')) {
    targeting.facebook_positions = ['feed', 'story', 'facebook_reels', 'profile_feed', 'marketplace'];
  }
  if (plataformas.includes('instagram')) {
    targeting.instagram_positions = ['stream', 'story', 'reels', 'explore', 'profile_feed'];
  }
  if (plataformas.includes('whatsapp')) {
    targeting.whatsapp_positions = ['status'];
  }
  if (plataformas.includes('messenger')) {
    targeting.messenger_positions = ['messenger_home'];
  }

  if (Array.isArray(generos) && generos.length > 0) {
    targeting.genders = generos;
  }

  return sanitizarTargeting(targeting, opciones.expansion || {});
}

/** Resumen legible del targeting, para la vista previa en consola. */
export function describirTargeting(sedeKey, targeting) {
  const sede = obtenerSede(sedeKey);
  const geo = targeting.geo_locations || {};

  let ubicacion;
  if (geo.cities?.length) {
    const c = geo.cities[0];
    ubicacion = `${sede.ciudad} (${sede.departamento}) + ${c.radius} km — ciudad Meta ${c.key}`;
  } else if (geo.custom_locations?.length) {
    const p = geo.custom_locations[0];
    ubicacion = `${p.radius} km alrededor de ${p.latitude}, ${p.longitude}`;
  } else {
    ubicacion = '(sin geolocalizacion)';
  }

  const posiciones = [];
  if (targeting.facebook_positions) posiciones.push(`FB: ${targeting.facebook_positions.join(', ')}`);
  if (targeting.instagram_positions) posiciones.push(`IG: ${targeting.instagram_positions.join(', ')}`);
  if (targeting.whatsapp_positions) posiciones.push(`WA: ${targeting.whatsapp_positions.join(', ')}`);

  return {
    sede: `${sede.etiqueta} (${sede.ciudad}, ${sede.departamento})`,
    ubicacion,
    tipoUbicacion: (geo.location_types || []).join(' + '),
    edades: `${targeting.age_min}-${targeting.age_max}`,
    generos: targeting.genders ? targeting.genders.map((g) => (g === 1 ? 'hombres' : 'mujeres')).join(', ') : 'todos',
    plataformas: (targeting.publisher_platforms || []).join(', '),
    dispositivos: (targeting.device_platforms || []).join(', '),
    posiciones,
  };
}

export default {
  SEDES,
  SEDES_DISPONIBLES,
  obtenerSede,
  construirTargeting,
  sanitizarTargeting,
  auditarExpansion,
  describirTargeting,
  INTERRUPTORES_DE_EXPANSION,
  expansionPorDefecto,
  normalizarExpansion,
  expansionEncendida,
};
