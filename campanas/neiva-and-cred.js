/**
 * ============================================================================
 *  campanas/neiva-and-cred.js — Prueba de Android a credito en NEIVA
 * ============================================================================
 *  Correr:  node test-run.js neiva-and-cred
 *  Ensayar: npm run validar neiva-and-cred        (no crea nada)
 *
 *  Crea, todo en BORRADOR (PAUSED):
 *
 *    CAMPANA   C<n> | NEIVA | DDMMAA
 *      CONJUNTO  C<n> | NEI | CJTO1 | AND-CRED | TEST      $30.000/dia
 *        ADS1 | NEI | IMG | TECNO CAMON 50 PRO
 *        ADS2 | NEI | VID | INFINIX HOT 60 PRO
 *
 *  Gemela de campanas/mocoa-and-cred.js. Las dos piezas viven en
 *  creativos/neiva/. Neiva esta en CA 02: si el token no tiene permiso de
 *  escritura ahi, la vista previa funciona pero crear falla.
 *
 *  El numero de campana no se escribe aqui: se lee de Ads Manager al correr.
 * ============================================================================
 */

export default {
  descripcion: 'Prueba de Android a credito en Neiva: una foto y un video, cinco copys cada uno',

  /* ======================================================================== */
  /*  1. SEDE                                                                */
  /* ======================================================================== */

  // Codigo del manual (punto 7). De aqui salen el nombre de la campana, el
  // distintivo de 3 letras (NEI) y la carpeta creativos/neiva/.
  sede: 'NEIVA',

  // Clave del diccionario de src/targeting.js (donde vive la geolocalizacion).
  sedeTargeting: 'NEIVA',

  /* ======================================================================== */
  /*  2. NOMENCLATURA                                                        */
  /* ======================================================================== */

  // Segmento de la lista cerrada del punto 8. Los dos equipos son Android y
  // se pautan a credito.
  //   IPH-CONT  IPH-CRED  AND-CONT  AND-CRED  MIXTO  MAC-IPAD  RETOMA
  segmento: 'AND-CRED',

  // '' | 'TEST' (en prueba) | 'OPT' (ganador ya optimizado). Punto 5.
  sufijoConjunto: 'TEST',

  // null  -> crea campana nueva con el siguiente C# de la sede
  // '123' -> cuelga el conjunto de una campana que ya existe
  campanaExistenteId: null,

  // Solo lo usa `--sin-meta`, para poder enseñar el resumen sin token.
  // Con credenciales se ignora: el C# real se lee de Ads Manager.
  simulado: { nombreCuenta: 'CA 02 - CELRED', numeroCampana: 4 },

  /* ======================================================================== */
  /*  3. PRESUPUESTO                                                         */
  /* ======================================================================== */

  // Va SIEMPRE en el conjunto (ABO), nunca en la campana (punto 9).
  // De sede: entre $15.000 y $60.000 COP al dia.
  presupuestoDiarioCop: 30000,
  tipoPresupuesto: 'sede', // 'sede' | 'regional'

  /* ======================================================================== */
  /*  4. SEGMENTACION                                                        */
  /* ======================================================================== */

  segmentacion: {
    edadMin: 18,
    edadMax: 55,
    // generos: [1] hombres, [2] mujeres. Omitir = todos.
    radioKm: 40, // Neiva + 40 km a la redonda
    modoGeo: 'ciudad', // 'ciudad' (como Ads Manager) | 'punto' (lat/lng del local)
    plataformas: ['facebook', 'instagram'],
    // Los dos: Meta reparte solo segun donde rinda mejor.
    dispositivos: ['mobile', 'desktop'],
  },

  /* ======================================================================== */
  /*  5. ANUNCIOS                                                            */
  /* ======================================================================== */

  // 'multiple' = las 5 opciones de texto en un solo anuncio
  // 'simple'   = solo el primer texto, titulo y descripcion de cada lista
  modoTexto: 'multiple',

  anuncios: [
    /* ---------------------------------------------------------------------- */
    /*  ADS1 — FOTO — Tecno Camon 50 Pro                                     */
    /*                                                                        */
    /*  Especificaciones comunes a la variante 4G y a la 5G:                  */
    /*    pantalla AMOLED 6,78" a 144 Hz                                      */
    /*    camara principal 50 MP + teleobjetivo con zoom optico 3x            */
    /*    bateria 6.150 mAh (4G) / 6.500 mAh (5G) -> "mas de 6.000 mAh"       */
    /*    carga rapida de 45 W                                                */
    /* ---------------------------------------------------------------------- */
    {
      formato: 'IMG',
      referencia: 'TECNO CAMON 50 PRO',
      producto: 'Tecno Camon 50 Pro',

      // Basta el nombre del archivo: se busca en creativos/neiva/
      rutaCreativoLocal: 'tecnocamon50pro-neiva.png',

      // Angulos: 1 camara · 2 formas de pago · 3 tienda local · 4 bateria · 5 pantalla
      textosPrincipales: [
        '📸 Cámara de 50 MP y zoom óptico 3x en el Tecno Camon 50 Pro.\n💳 𝗖𝗥𝗘́𝗗𝗜𝗧𝗢 𝗣𝗔𝗥𝗔 𝗥𝗘𝗣𝗢𝗥𝗧𝗔𝗗𝗢𝗦\n✨ ¡En Celred es posible!\n👉 ¡Escríbenos hoy!\n\n📍 Cra 2 # 6-26 local 5, Centro, Neiva.',
        '💥 ¿Quieres el Tecno Camon 50 Pro? Tenlo de contado o a crédito.\n💳 𝗖𝗥𝗘́𝗗𝗜𝗧𝗢 𝗣𝗔𝗥𝗔 𝗥𝗘𝗣𝗢𝗥𝗧𝗔𝗗𝗢𝗦\n🙌 ¿Estás reportado? Inténtalo aquí en Celred.\n📞 ¡Llámanos ya!\n\n📍 Cra 2 # 6-26 local 5, Centro, Neiva.',
        '🔋 Más de 6.000 mAh y carga rápida de 45 W en el Tecno Camon 50 Pro.\n💳 𝗖𝗥𝗘́𝗗𝗜𝗧𝗢 𝗣𝗔𝗥𝗔 𝗥𝗘𝗣𝗢𝗥𝗧𝗔𝗗𝗢𝗦\n🤩 Tu próximo celular está más cerca en Celred.\n🛒 ¡Aparta el tuyo hoy!\n\n📍 Cra 2 # 6-26 local 5, Centro, Neiva.',
        '🌈 Pantalla AMOLED de 6,78" a 144 Hz en el Tecno Camon 50 Pro.\n💳 𝗖𝗥𝗘́𝗗𝗜𝗧𝗢 𝗣𝗔𝗥𝗔 𝗥𝗘𝗣𝗢𝗥𝗧𝗔𝗗𝗢𝗦\n⚡ ¡Inténtalo aquí en Celred!\n⚡ ¡Cotiza ahora mismo!\n\n📍 Cra 2 # 6-26 local 5, Centro, Neiva.',
        '✅ Tecno Camon 50 Pro con garantía y asesoría en Celred Neiva.\n💳 𝗖𝗥𝗘́𝗗𝗜𝗧𝗢 𝗣𝗔𝗥𝗔 𝗥𝗘𝗣𝗢𝗥𝗧𝗔𝗗𝗢𝗦\n🏆 Estrenar sí es posible en Celred.\n🤝 ¡Habla hoy con un asesor!\n\n📍 Cra 2 # 6-26 local 5, Centro, Neiva.',
      ],

      titulos: [
        'Tecno Camon 50 Pro',
        'CRÉDITO PARA REPORTADOS',
        'Cámara de 50 MP',
        '¡En Celred es posible!',
        'Celred Neiva',
      ],

      descripciones: [
        '👉 ¡Escríbenos hoy!',
        '📞 ¡Llámanos ya!',
        '🛒 ¡Aparta el tuyo hoy!',
        '⚡ ¡Cotiza ahora mismo!',
        '🤝 ¡Habla hoy con un asesor!',
      ],

      // Lo escribe el CLIENTE al abrir el chat, no la tienda: va en primera
      // persona y directo, como en los anuncios que ya corren. Nombra el
      // equipo para que el asesor sepa de que anuncio viene el lead.
      mensajePrellenado: 'Hola, quiero más información para adquirir el Tecno Camon 50 Pro',

      // Esto SI lo dice la tienda: es el saludo de la pantalla previa al chat.
      saludoWhatsApp: '¡Hola! Bienvenido a Celred Neiva, es un gusto saludarte 😊',
    },

    /* ---------------------------------------------------------------------- */
    /*  ADS2 — VIDEO — Infinix Hot 60 Pro                                    */
    /*                                                                        */
    /*  Especificaciones del modelo X6885 (no el Pro+):                       */
    /*    pantalla AMOLED 6,78" a 144 Hz                                      */
    /*    MediaTek Helio G200                                                 */
    /*    camara principal 50 MP                                              */
    /*    bateria 5.160 mAh con carga de 45 W                                 */
    /* ---------------------------------------------------------------------- */
    {
      formato: 'VID',
      referencia: 'INFINIX HOT 60 PRO',
      producto: 'Infinix Hot 60 Pro',

      rutaCreativoLocal: 'infinixhot60pro neiva.mp4',

      // Angulos: 1 rendimiento · 2 bateria · 3 formas de pago · 4 tienda · 5 retoma
      textosPrincipales: [
        '🎬 Mira el Infinix Hot 60 Pro: Helio G200 y pantalla AMOLED de 144 Hz.\n💳 𝗖𝗥𝗘́𝗗𝗜𝗧𝗢 𝗣𝗔𝗥𝗔 𝗥𝗘𝗣𝗢𝗥𝗧𝗔𝗗𝗢𝗦\n✨ ¡En Celred es posible!\n💬 ¡Pregunta hoy por WhatsApp!\n\n📍 Cra 2 # 6-26 local 5, Centro, Neiva.',
        '🔋 Batería de 5.160 mAh y carga de 45 W en el Infinix Hot 60 Pro.\n💳 𝗖𝗥𝗘́𝗗𝗜𝗧𝗢 𝗣𝗔𝗥𝗔 𝗥𝗘𝗣𝗢𝗥𝗧𝗔𝗗𝗢𝗦\n💯 En Celred te asesoramos para que lo estrenes.\n📲 ¡Escríbenos ya por WhatsApp!\n\n📍 Cra 2 # 6-26 local 5, Centro, Neiva.',
        '💥 ¿Quieres el Infinix Hot 60 Pro? Tenlo de contado o a crédito.\n💳 𝗖𝗥𝗘́𝗗𝗜𝗧𝗢 𝗣𝗔𝗥𝗔 𝗥𝗘𝗣𝗢𝗥𝗧𝗔𝗗𝗢𝗦\n🙌 ¿Estás reportado? Inténtalo aquí en Celred.\n🙋 ¡Pide tu asesoría ya!\n\n📍 Cra 2 # 6-26 local 5, Centro, Neiva.',
        '📱 Ven a probar el Infinix Hot 60 Pro en Celred Neiva.\n💳 𝗖𝗥𝗘́𝗗𝗜𝗧𝗢 𝗣𝗔𝗥𝗔 𝗥𝗘𝗣𝗢𝗥𝗧𝗔𝗗𝗢𝗦\n🎯 Pregunta sin compromiso: ¡en Celred es posible!\n🏬 ¡Visítanos hoy en tienda!\n\n📍 Cra 2 # 6-26 local 5, Centro, Neiva.',
        '🔄 Recibimos tu usado como parte de pago del Infinix Hot 60 Pro.\n💳 𝗖𝗥𝗘́𝗗𝗜𝗧𝗢 𝗣𝗔𝗥𝗔 𝗥𝗘𝗣𝗢𝗥𝗧𝗔𝗗𝗢𝗦\n⚡ ¡Inténtalo aquí en Celred!\n⏰ ¡No te quedes sin el tuyo, escríbenos!\n\n📍 Cra 2 # 6-26 local 5, Centro, Neiva.',
      ],

      titulos: [
        'Infinix Hot 60 Pro',
        'CRÉDITO PARA REPORTADOS',
        'AMOLED de 144 Hz',
        '¡En Celred es posible!',
        'Celred Neiva',
      ],

      descripciones: [
        '💬 ¡Pregunta hoy por WhatsApp!',
        '🛒 ¡Aparta el tuyo hoy!',
        '🙋 ¡Pide tu asesoría ya!',
        '🏬 ¡Visítanos hoy en tienda!',
        '📞 ¡Llámanos ya!',
      ],

      mensajePrellenado: 'Hola, quiero más información para adquirir el Infinix Hot 60 Pro',
      saludoWhatsApp: '¡Hola! Bienvenido a Celred Neiva, es un gusto saludarte 😊',
    },
  ],
};
