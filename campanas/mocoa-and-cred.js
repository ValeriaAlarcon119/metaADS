/**
 * ============================================================================
 *  campanas/mocoa-and-cred.js — Prueba de Android a credito en MOCOA
 * ============================================================================
 *  Correr:  node test-run.js mocoa-and-cred
 *  Ensayar: npm run validar mocoa-and-cred        (no crea nada)
 *
 *  Crea, todo en BORRADOR (PAUSED):
 *
 *    CAMPANA   C<n> | MOCOA | DDMMAA
 *      CONJUNTO  C<n> | MOC | CJTO1 | AND-CRED | TEST      $30.000/dia
 *        ADS1 | MOC | IMG | TECNO CAMON 50 PRO
 *        ADS2 | MOC | VID | INFINIX HOT 60 PRO
 *
 *  Es la misma prueba que antes apuntaba a Neiva. Las dos piezas viven ahora
 *  en creativos/mocoa/, y Mocoa esta en CA 01 — la cuenta donde el token si
 *  tiene permiso de escritura.
 *
 *  El numero de campana no se escribe aqui: se lee de Ads Manager al correr.
 * ============================================================================
 */

export default {
  descripcion: 'Prueba de Android a credito en Mocoa: una foto y un video, cinco copys cada uno',

  /* ======================================================================== */
  /*  1. SEDE                                                                */
  /* ======================================================================== */

  // Codigo del manual (punto 7). De aqui salen el nombre de la campana, el
  // distintivo de 3 letras (MOC) y la carpeta creativos/mocoa/.
  sede: 'MOCOA',

  // Clave del diccionario de src/targeting.js (donde vive la geolocalizacion).
  sedeTargeting: 'MOCOA',

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
  simulado: { nombreCuenta: 'CA 01 - CELRED.CO', numeroCampana: 8 },

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
    radioKm: 40, // Mocoa + 40 km a la redonda
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

      // Basta el nombre del archivo: se busca en creativos/mocoa/
      rutaCreativoLocal: 'tecnocamon50pro-mocoa.png',

      // Angulos: 1 camara · 2 formas de pago · 3 tienda local · 4 bateria · 5 pantalla
      textosPrincipales: [
        'Cámara principal de 50 MP y teleobjetivo con zoom óptico 3x. Tecno Camon 50 Pro en Celred Mocoa. Escríbenos por WhatsApp.',
        'Tecno Camon 50 Pro de contado o con crédito en Celred Mocoa. Escríbenos por WhatsApp y te contamos las opciones.',
        'Tecno Camon 50 Pro en la tienda Celred de Mocoa, Cra 9 # 10-30 Av. Colombia. Escríbenos por WhatsApp.',
        'Batería de más de 6.000 mAh y carga rápida de 45 W en el Tecno Camon 50 Pro. En Celred Mocoa. Escríbenos por WhatsApp.',
        'Pantalla AMOLED de 6,78 pulgadas a 144 Hz en el Tecno Camon 50 Pro. En Celred Mocoa. Escríbenos por WhatsApp.',
      ],

      titulos: [
        'Tecno Camon 50 Pro en Celred Mocoa',
        'Cámara principal de 50 MP',
        'Batería de más de 6.000 mAh',
        'Contado, crédito o plan retoma',
        'Pantalla AMOLED de 144 Hz',
      ],

      descripciones: [
        'Tienda Celred en Mocoa',
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
      saludoWhatsApp: '¡Hola! Bienvenido a Celred Mocoa, es un gusto saludarte 😊',
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

      rutaCreativoLocal: 'infinixhot60pro-mocoa.mp4',

      // Angulos: 1 rendimiento · 2 bateria · 3 formas de pago · 4 tienda · 5 retoma
      textosPrincipales: [
        'Mira en video el Infinix Hot 60 Pro: Helio G200 y pantalla AMOLED de 144 Hz. Escríbenos por WhatsApp.',
        'Batería de 5.160 mAh y carga de 45 W: 50% en 22 minutos según el fabricante. Está en Celred Mocoa, escríbenos por WhatsApp.',
        'El Infinix Hot 60 Pro de contado o con crédito en Celred Mocoa. Cotiza por WhatsApp sin compromiso.',
        'En Celred Mocoa el Infinix Hot 60 Pro se prueba en tienda, con garantía y asesoría. Agenda por WhatsApp.',
        'Recibimos el celular usado como parte de pago del Infinix Hot 60 Pro. Consulta el avalúo por WhatsApp.',
      ],

      titulos: [
        'Infinix Hot 60 Pro en video',
        'AMOLED 144 Hz y Helio G200',
        'Batería de 5.160 mAh',
        'De contado o a crédito en Mocoa',
        'Retoma de equipo usado',
      ],

      descripciones: [
        'Tienda Celred en Mocoa',
        'Carga rápida de 45 W',
        'Crédito, contado o retoma',
        'Cámara principal de 50 MP',
        'Asesoría en tienda',
      ],

      mensajePrellenado: 'Hola, quiero más información para adquirir el Infinix Hot 60 Pro',
      saludoWhatsApp: '¡Hola! Bienvenido a Celred Mocoa, es un gusto saludarte 😊',
    },
  ],
};
