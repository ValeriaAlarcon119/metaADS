/**
 * ============================================================================
 *  campanas/neiva-c4-and-cred.js — Prueba de Android a credito en NEIVA
 * ============================================================================
 *  Correr:  node test-run.js neiva-c4-and-cred
 *
 *  Crea, todo en BORRADOR (PAUSED):
 *
 *    CAMPANA   C<n> | NEIVA | DDMMAA
 *      CONJUNTO  C<n> | NEI | CJTO1 | AND-CRED | TEST      $35.000/dia
 *        ADS1 | NEI | IMG | TECNO CAMON 50 PRO
 *        ADS2 | NEI | VID | INFINIX HOT 60 PRO
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
  // distintivo de 3 letras y la carpeta creativos/neiva/.
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
  // Hoy la ultima campana de Neiva es "C3 | NEIVA | 150826", asi que toca C4.
  simulado: { nombreCuenta: 'CA 02 - CELRED', numeroCampana: 4 },

  /* ======================================================================== */
  /*  3. PRESUPUESTO                                                         */
  /* ======================================================================== */

  // Va SIEMPRE en el conjunto (ABO), nunca en la campana (punto 9).
  // De sede: entre $15.000 y $60.000 COP al dia.
  presupuestoDiarioCop: 35000,
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
        'Cámara principal de 50 MP y teleobjetivo con zoom óptico 3x. Tecno Camon 50 Pro en Celred Neiva. Escríbenos por WhatsApp.',
        'Tecno Camon 50 Pro de contado o con crédito en Celred Neiva. Escríbenos por WhatsApp y te contamos las opciones.',
        'Tecno Camon 50 Pro en la tienda Celred de Neiva. Escríbenos por WhatsApp y confirmamos disponibilidad y precio.',
        'Batería de más de 6.000 mAh y carga rápida de 45 W en el Tecno Camon 50 Pro. En Celred Neiva. Escríbenos por WhatsApp.',
        'Pantalla AMOLED de 6,78 pulgadas a 144 Hz en el Tecno Camon 50 Pro. En Celred Neiva. Escríbenos por WhatsApp.',
      ],

      titulos: [
        'Tecno Camon 50 Pro en Celred Neiva',
        'Cámara principal de 50 MP',
        'Batería de más de 6.000 mAh',
        'Contado, crédito o plan retoma',
        'Pantalla AMOLED de 144 Hz',
      ],

      descripciones: [
        'Tienda Celred en Neiva',
        'Escríbenos por WhatsApp',
        'Consulta opciones de crédito',
        'Carga rápida de 45 W',
        'Consulta disponibilidad',
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

      rutaCreativoLocal: 'inifixhot60pro-neiva.mp4',

      // Angulos: 1 rendimiento · 2 bateria · 3 formas de pago · 4 tienda · 5 retoma
      textosPrincipales: [
        'Mira en video el Infinix Hot 60 Pro: Helio G200 y pantalla AMOLED de 144 Hz. Escríbenos por WhatsApp.',
        'Batería de 5.160 mAh y carga de 45 W: 50% en 22 minutos según el fabricante. Está en Celred Neiva, escríbenos por WhatsApp.',
        'El Infinix Hot 60 Pro de contado o con crédito en Celred Neiva. Cotiza por WhatsApp sin compromiso.',
        'En Celred Neiva el Infinix Hot 60 Pro se prueba en tienda, con garantía y asesoría. Agenda por WhatsApp.',
        'Recibimos el celular usado como parte de pago del Infinix Hot 60 Pro. Consulta el avalúo por WhatsApp.',
      ],

      titulos: [
        'Infinix Hot 60 Pro en video',
        'AMOLED 144 Hz y Helio G200',
        'Batería de 5.160 mAh',
        'De contado o a crédito en Neiva',
        'Retoma de equipo usado',
      ],

      descripciones: [
        'Tienda Celred en Neiva',
        'Carga rápida de 45 W',
        'Crédito, contado o retoma',
        'Cámara principal de 50 MP',
        'Asesoría en tienda',
      ],

      mensajePrellenado: 'Hola, quiero más información para adquirir el Infinix Hot 60 Pro',
      saludoWhatsApp: '¡Hola! Bienvenido a Celred Neiva, es un gusto saludarte 😊',
    },
  ],
};
