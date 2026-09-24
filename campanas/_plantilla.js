/**
 * ============================================================================
 *  campanas/_plantilla.js — Copia este archivo para crear una campana nueva
 * ============================================================================
 *  COMO SE USA
 *
 *   1. Copia este archivo dentro de campanas/ con un nombre que se entienda:
 *        campanas/victoria-iphone-credito.js
 *        campanas/la16-retoma-diciembre.js
 *      Los archivos que empiezan por guion bajo se ignoran, por eso este no
 *      aparece en la lista.
 *
 *   2. Mete las piezas publicitarias en la carpeta de su sede:
 *        creativos/victoria/iphone13-victoria.jpg
 *      Aqui basta con escribir el nombre del archivo.
 *
 *   3. Corre:
 *        node test-run.js victoria-iphone-credito --sin-meta   (ver el resumen)
 *        node test-run.js victoria-iphone-credito              (crear en borrador)
 *
 *  QUE NO HAY QUE ESCRIBIR AQUI
 *   - El numero de campana (C#): se lee de Ads Manager al correr.
 *   - El numero del conjunto (CJTO#) ni el de los anuncios (ADS#).
 *   - La fecha: se pone sola, en formato DDMMAA.
 *   - El numero de WhatsApp: sale de lineas.xlsx segun la sede.
 *   - El estado: todo se crea en BORRADOR (PAUSED), siempre.
 * ============================================================================
 */

export default {
  descripcion: 'Una linea diciendo de que va esta campana',

  /* ======================================================================== */
  /*  1. SEDE                                                                */
  /* ======================================================================== */

  // Codigo del manual, punto 7. Uno de:
  //   LA16  SEBASTIAN  LICEO  VICTORIA  ZAFIRO  MARKUS  TUQUERRES
  //   ORITO  HORMIGA  PTOASIS  MOCOA  MEDELLIN  NEIVA
  sede: 'VICTORIA',

  // Clave de src/targeting.js, que es donde vive la geolocalizacion de cada
  // punto de venta. Cuando una ciudad tiene varias tiendas son claves
  // distintas: IPIALES_VICTORIA, IPIALES_ZAFIRO, IPIALES_MARKUS...
  sedeTargeting: 'IPIALES_VICTORIA',

  // La cuenta publicitaria se deduce sola de la sede (manual, punto 7), asi
  // que normalmente esto no va. La excepcion es MEDELLIN, que esta en las dos:
  // ahi hay que decir en cual se crea. Recuerda que su C# es uno solo entre
  // ambas cuentas, asi que consultalo antes.
  // cuenta: 'CA 01',

  /* ======================================================================== */
  /*  2. NOMENCLATURA                                                        */
  /* ======================================================================== */

  // Lista cerrada del punto 8. No se inventan codigos nuevos:
  //   IPH-CONT   iPhone de contado
  //   IPH-CRED   iPhone a credito
  //   AND-CONT   Android de contado
  //   AND-CRED   Android a credito
  //   MIXTO      iPhone y Android en el mismo conjunto
  //   MAC-IPAD   Mac, iPad y accesorios Apple
  //   RETOMA     Plan retoma y equipos open box
  segmento: 'IPH-CRED',

  // '' | 'TEST' mientras se prueba | 'OPT' cuando ya quedo el ganador
  sufijoConjunto: 'TEST',

  // null  -> campana nueva, con el siguiente C# de la sede
  // '123' -> cuelga este conjunto de una campana que ya existe
  campanaExistenteId: null,

  /* ======================================================================== */
  /*  3. PRESUPUESTO                                                         */
  /* ======================================================================== */

  // Punto 9: el presupuesto va en el CONJUNTO (ABO), nunca en la campana.
  //   de sede (venta)            $15.000 a $60.000 COP al dia
  //   regional (reconocimiento)  $20.000 a $50.000 COP al dia
  presupuestoDiarioCop: 25000,
  tipoPresupuesto: 'sede',

  /* ======================================================================== */
  /*  4. SEGMENTACION                                                        */
  /* ======================================================================== */

  segmentacion: {
    edadMin: 18,
    edadMax: 55,

    // generos: [1] hombres, [2] mujeres. Comentado = todos.
    // generos: [2],

    // Radio alrededor de la tienda. Meta admite de 1 a 80 km.
    radioKm: 12,

    // 'ciudad' usa la ciudad de Meta con radio, igual que Ads Manager.
    // 'punto'  usa la latitud y longitud exactas del local.
    // Si la sede no tiene clave de ciudad configurada, usa 'punto'.
    modoGeo: 'punto',

    // La expansion de publico va SIEMPRE apagada, no se puede encender desde
    // aqui: advantage_audience=0, targeting_optimization='none' y la
    // relajacion de publicos en 0. Eso lo impone src/targeting.js.
    plataformas: ['facebook', 'instagram'],
    dispositivos: ['mobile'],
  },

  /* ======================================================================== */
  /*  5. ANUNCIOS                                                            */
  /* ======================================================================== */

  // 'multiple' = las 5 opciones de texto dentro de un solo anuncio (lo normal)
  // 'simple'   = un texto, un titulo y una descripcion por anuncio
  //
  // En 'multiple' los 5 textos se mandan completos y NINGUN reintento los
  // reduce: si Meta los rechaza todos, el anuncio no se crea y se dice por que.
  // Poner 'simple' es la unica forma de crear un anuncio con un solo texto.
  modoTexto: 'multiple',

  // Maximo 5 anuncios por conjunto (punto 6 y punto 11, regla 2).
  anuncios: [
    {
      // 'IMG' para imagen o carrusel, 'VID' para video o reel.
      // Tiene que coincidir con el archivo: si es .mp4, va VID.
      formato: 'IMG',

      // REFERENCIA del punto 6: marca y modelo como esta en inventario.
      // Va en el nombre del anuncio, en mayuscula y sin tildes.
      referencia: 'IPHONE 13',

      // Como se nombra el producto en los textos, con tildes normales.
      producto: 'iPhone 13',

      // Solo el nombre del archivo: se busca en creativos/<sede>/
      rutaCreativoLocal: 'iphone13-victoria.jpg',

      // Hasta 5. Lo comodo son 125 caracteres: mas largo, el feed lo corta.
      textosPrincipales: [
        'Primer texto principal, con un angulo propio.',
        'Segundo texto, con otro angulo distinto.',
        'Tercer texto.',
        'Cuarto texto.',
        'Quinto texto.',
      ],

      // Hasta 5. Lo comodo son 40 caracteres.
      titulos: ['Titulo uno', 'Titulo dos', 'Titulo tres', 'Titulo cuatro', 'Titulo cinco'],

      // Hasta 5. Lo comodo son 30 caracteres.
      descripciones: ['Descripcion uno', 'Descripcion dos', 'Tres', 'Cuatro', 'Cinco'],

      // El texto que le queda YA ESCRITO al cliente al abrir el chat.
      // Nombra el producto y la sede para saber de que anuncio vino el lead.
      mensajePrellenado: 'Hola Celred Ipiales, vi el anuncio del iPhone 13 y quiero información.',

      // El saludo que se ve en la pantalla previa al chat.
      saludoWhatsApp: 'Hola, cuéntanos qué equipo te interesa y te asesoramos.',

      // SOLO en conjuntos de CONTADO (IPH-CONT, AND-CONT): el precio, escrito a
      // mano y obligatorio. Los 5 textos principales tienen que llevarlo
      // ($1.999.000). Sin precio la campana no se deja crear.
      // En CREDITO, los 5 textos tienen que decir "tambien para reportados".
      // precioContado: 1999000,
    },

    // Para el segundo anuncio, copia el bloque de arriba y cambia lo que toque.
    // Si es video, pon formato: 'VID' y apunta a un .mp4.
  ],

  /* ======================================================================== */
  /*  6. EXCEPCIONES  (casi nunca hacen falta)                               */
  /* ======================================================================== */

  // Por defecto un anuncio solo puede usar piezas de la carpeta de su sede.
  // Ponlo en true solo si de verdad quieres usar una pieza compartida: pautar
  // una sede con el creativo de otra es un error caro y silencioso.
  // permitirCreativoFueraDeLaSede: false,
};
