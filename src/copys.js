/**
 * ============================================================================
 *  src/copys.js — Copys de arranque generados a partir del producto
 * ============================================================================
 *  Cuando una campana se escribe a mano, los textos los escribe una persona.
 *  Cuando se pide en lenguaje natural ("una campana para La 16 con el iPhone
 *  16"), alguien tiene que escribir los 5 textos, 5 titulos y 5 descripciones
 *  de cada anuncio. Eso hace este modulo.
 *
 *  LO QUE ESTE MODULO NO SABE, Y POR ESO NO DICE
 *
 *  No conoce las caracteristicas de ningun telefono. No sabe cuanta bateria
 *  tiene un Samsung A17 ni que camara lleva un Redmi 15. Por eso los textos
 *  que genera hablan solo de lo que SI es verificable desde aqui:
 *
 *    - el nombre del producto
 *    - la tienda y la ciudad
 *    - las formas de pago que dice el segmento del conjunto
 *    - la invitacion a escribir por WhatsApp
 *
 *  Nunca inventa megapixeles, milliamperios, pulgadas ni precios. Un texto
 *  publicitario con una cifra falsa es un problema de verdad, no un detalle.
 *
 *  Ademas, por decision del cliente, no nombra financieras (Addi,
 *  Sistecredito, Banco de Bogota), no pone capacidad en GB y no menciona a
 *  personas en camara.
 *
 *  SON UN PUNTO DE PARTIDA. La etapa 3 del panel existe justo para esto: se
 *  leen, se corrigen y se les mete lo que el asesor sabe del equipo.
 * ============================================================================
 */

import { LIMITES_COPY } from './campanas.js';

/* -------------------------------------------------------------------------- */
/*  Que permite decir cada segmento                                           */
/* -------------------------------------------------------------------------- */

/**
 * El segmento del conjunto decide de que formas de pago se puede hablar.
 * Prometer credito en un conjunto de contado es prometer algo que el asesor
 * despues tiene que desmentir.
 */
const PAGO_POR_SEGMENTO = Object.freeze({
  'IPH-CONT': { credito: false, contado: true, retoma: false },
  'IPH-CRED': { credito: true, contado: true, retoma: false },
  'AND-CONT': { credito: false, contado: true, retoma: false },
  'AND-CRED': { credito: true, contado: true, retoma: false },
  MIXTO: { credito: true, contado: true, retoma: false },
  'MAC-IPAD': { credito: true, contado: true, retoma: false },
  RETOMA: { credito: true, contado: true, retoma: true },
});

/** Cabe dentro del limite comodo de Ads Manager. */
const cabe = (texto, limite) => texto.length <= limite;

/**
 * Elige los primeros `cuantos` textos distintos que quepan en el limite.
 * Si no hay suficientes que quepan, devuelve los que haya: es preferible un
 * anuncio con tres textos buenos que con cinco cortados.
 *
 * `vistos` se comparte entre las tres listas a proposito. Un titulo y una
 * descripcion identicos ("Escribenos por WhatsApp") se verian como la misma
 * frase repetida dos veces en el mismo anuncio, que queda mal.
 */
function elegir(candidatos, limite, vistos, cuantos = 5) {
  const elegidos = [];

  for (const texto of candidatos) {
    const limpio = String(texto).replace(/\s+/g, ' ').trim();
    if (!limpio || vistos.has(limpio) || !cabe(limpio, limite)) continue;
    vistos.add(limpio);
    elegidos.push(limpio);
    if (elegidos.length === cuantos) break;
  }

  return elegidos;
}

/* -------------------------------------------------------------------------- */
/*  Generacion                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Arma los copys de un anuncio.
 *
 * @param {object} p
 * @param {string} p.producto   'iPhone 16', 'Samsung A17'
 * @param {string} p.ciudad     'Pasto'
 * @param {string} [p.sede]     'La 16' — el nombre bonito, no el codigo
 * @param {string} p.segmento   codigo del punto 8
 * @param {'IMG'|'VID'} [p.formato]
 * @returns {{textosPrincipales:string[], titulos:string[], descripciones:string[],
 *            mensajePrellenado:string, saludoWhatsApp:string, generado:boolean}}
 */
export function generarCopys({ producto, ciudad, sede = '', segmento = 'MIXTO', formato = 'IMG' }) {
  const nombre = String(producto || '').trim();
  if (!nombre) throw new Error('copys: falta el nombre del producto.');

  const lugar = String(ciudad || '').trim();
  const pago = PAGO_POR_SEGMENTO[segmento] || PAGO_POR_SEGMENTO.MIXTO;
  const esVideo = String(formato).toUpperCase() === 'VID';

  // La tienda se nombra "Celred Pasto". El nombre de la sede (La 16, CC
  // Zafiro) se guarda para el mensaje prellenado, que es donde de verdad
  // ayuda: le dice al asesor a que local va el cliente.
  const tienda = lugar ? `Celred ${lugar}` : 'Celred';

  /* --- Textos principales (limite comodo 125) ---------------------------- */

  const textos = [
    esVideo
      ? `Mira el ${nombre} en video. Esta en ${tienda}: escribenos por WhatsApp y te contamos precio y formas de pago.`
      : `${nombre} en ${tienda}. Escribenos por WhatsApp y te contamos precio y formas de pago.`,

    `¿Estas buscando el ${nombre}? En ${tienda} te asesoramos sin compromiso. Escribenos por WhatsApp.`,

    pago.credito
      ? `${nombre} de contado o a credito en ${tienda}. Cotiza por WhatsApp y te explicamos las opciones.`
      : `${nombre} de contado en ${tienda}. Cotiza por WhatsApp y te confirmamos precio.`,

    `Ven a ver el ${nombre} a ${tienda}. Lo pruebas en tienda antes de llevarlo. Agenda por WhatsApp.`,

    pago.retoma
      ? `Recibimos tu celular usado como parte de pago del ${nombre}. Consulta el avaluo por WhatsApp.`
      : `${nombre} con garantia y asesoria en ${tienda}. Consulta disponibilidad por WhatsApp.`,

    // Reservas, por si alguna de las de arriba se pasa de 125 con un nombre largo.
    `${nombre} en ${tienda}. Escribenos por WhatsApp.`,
    `Consulta el ${nombre} en ${tienda} por WhatsApp.`,
  ];

  /* --- Titulos (limite comodo 40) ---------------------------------------- */

  const titulos = [
    `${nombre} en Celred`,
    lugar ? `${nombre} en ${lugar}` : `${nombre} disponible`,
    pago.credito ? 'De contado o a credito' : 'Consulta el precio de contado',
    'Escribenos por WhatsApp',
    pago.retoma ? 'Recibimos tu equipo usado' : 'Consulta disponibilidad',
    // Reservas para nombres largos.
    nombre,
    'Asesoria en tienda',
  ];

  /* --- Descripciones (limite comodo 30) ---------------------------------- */

  const descripciones = [
    lugar ? `Tienda Celred en ${lugar}` : 'Tienda Celred',
    'Cotiza por WhatsApp',
    pago.credito ? 'Contado o credito' : 'Precio de contado',
    'Consulta disponibilidad',
    pago.retoma ? 'Recibimos tu usado' : 'Garantia y asesoria',
    // Reservas.
    'Pregunta por tu equipo',
    'Te asesoramos en tienda',
  ];

  /* --- Mensaje prellenado ------------------------------------------------ */

  // Nombra la sede concreta, no solo la ciudad: en Pasto hay tres tiendas y
  // asi el asesor sabe de cual vino el lead.
  const donde = sede && lugar ? `Celred ${lugar} ${sede}` : tienda;
  const vio = esVideo ? 'el video' : 'el anuncio';

  const prellenados = [
    `Hola ${donde}, vi ${vio} del ${nombre} y quiero informacion de precio y formas de pago.`,
    `Hola ${donde}, vi ${vio} del ${nombre} y quiero informacion.`,
    `Hola, vi ${vio} del ${nombre} y quiero informacion.`,
  ];

  const mensajePrellenado =
    prellenados.find((t) => cabe(t, LIMITES_COPY.mensajePrellenado)) || prellenados[prellenados.length - 1];

  // El mismo registro para las tres listas: ningun texto se repite dentro del
  // anuncio, ni siquiera entre un titulo y una descripcion.
  const vistos = new Set();

  return {
    textosPrincipales: elegir(textos, LIMITES_COPY.textosPrincipales, vistos),
    titulos: elegir(titulos, LIMITES_COPY.titulos, vistos),
    descripciones: elegir(descripciones, LIMITES_COPY.descripciones, vistos),
    mensajePrellenado,
    saludoWhatsApp: 'Hola, cuentanos que equipo te interesa y te asesoramos.',
    // Bandera para que la interfaz pueda decir "esto lo escribio el sistema,
    // revisalo" en vez de presentarlo como si lo hubiera escrito alguien.
    generado: true,
  };
}

export default { generarCopys };
