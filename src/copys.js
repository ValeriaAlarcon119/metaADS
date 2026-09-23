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
 *    - la tienda, la ciudad y la DIRECCION OFICIAL (src/direcciones.js)
 *    - las formas de pago que dice el segmento del conjunto
 *    - la invitacion a escribir por WhatsApp
 *
 *  Nunca inventa megapixeles, milliamperios, pulgadas ni precios. Un texto
 *  publicitario con una cifra falsa es un problema de verdad, no un detalle.
 *
 *  CERO PROMOCIONES (decision del cliente, 23/09/2026)
 *
 *  No se nombra ningun sorteo, descuento, rifa, fecha de campana, "sin
 *  inicial", "aplica reportado" ni condicion de credito concreta. Nada de eso
 *  esta en ninguna fuente de datos del sistema, asi que escribirlo seria
 *  inventarlo. Cuando exista un archivo de promociones vigentes se conecta
 *  aqui; hasta entonces, los copys venden el equipo y la tienda.
 *
 *  Tampoco nombra financieras (Addi, Sistecredito, Banco de Bogota), ni pone
 *  capacidad en GB, ni menciona a personas en camara.
 *
 *  SON UN PUNTO DE PARTIDA. La etapa 3 del panel existe justo para esto: se
 *  leen, se corrigen y se les mete lo que el asesor sabe del equipo.
 * ============================================================================
 */

import { LIMITES_COPY } from './campanas.js';
import { direccionDeSede } from './direcciones.js';

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
function elegir(candidatos, limite, vistos, { cuantos = 5, estricto = true } = {}) {
  const elegidos = [];

  for (const texto of candidatos) {
    // Los saltos de linea SI se respetan: son parte del formato del anuncio.
    // Solo se colapsan los espacios dentro de cada renglon.
    const limpio = String(texto)
      .split('\n')
      .map((l) => l.replace(/[^\S\n]+/g, ' ').trim())
      .join('\n')
      .trim();

    if (!limpio || vistos.has(limpio)) continue;

    // En titulos y descripciones el limite es duro: Meta los recorta y un
    // titulo cortado a la mitad queda mal. En el texto principal es solo una
    // guia — el feed recorta pero el texto completo se ve al desplegar, y es
    // el formato que usa Celred hoy.
    if (estricto && !cabe(limpio, limite)) continue;

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
export function generarCopys({
  producto,
  ciudad,
  sede = '',
  codigoSede = '',
  segmento = 'MIXTO',
  formato = 'IMG',
}) {
  const nombre = String(producto || '').trim();
  if (!nombre) throw new Error('copys: falta el nombre del producto.');

  const pago = PAGO_POR_SEGMENTO[segmento] || PAGO_POR_SEGMENTO.MIXTO;
  const esVideo = String(formato).toUpperCase() === 'VID';

  // La direccion sale SIEMPRE del archivo maestro, nunca del texto libre.
  // Si la sede no la tiene configurada, los copys salen sin ella: es
  // preferible un anuncio sin direccion que uno con la direccion de otra
  // tienda.
  const oficial = codigoSede ? direccionDeSede(codigoSede) : null;
  const lugar = oficial?.ciudad || String(ciudad || '').trim();

  // La tienda se nombra "Celred Pasto". El nombre de la sede (La 16, CC
  // Zafiro) se guarda para el mensaje prellenado, que es donde de verdad
  // ayuda: le dice al asesor a que local va el cliente.
  const tienda = lugar ? `Celred ${lugar}` : 'Celred';

  // La linea de direccion va en su propio renglon, como en los anuncios que
  // ya corren. Sin direccion configurada, simplemente no aparece.
  const lineaDireccion = oficial ? `📍 ${oficial.direccion}, ${oficial.ciudad}.` : '';
  const conDireccion = (texto) => (lineaDireccion ? `${texto}\n\n${lineaDireccion}` : texto);

  /* --- Textos principales ------------------------------------------------ */
  // Los dos primeros llevan la direccion y pasan de 125 caracteres a
  // proposito: es el formato que usa Celred hoy. Los de mas abajo son cortos
  // para las ubicaciones donde el feed recorta.

  const textos = [
    conDireccion(
      esVideo
        ? `🎬 Mira el ${nombre} en video y llévatelo de ${tienda}.\n📲 Escríbenos por WhatsApp y te contamos precio y formas de pago.`
        : `🔥 El ${nombre} te está esperando en ${tienda}.\n📲 Escríbenos por WhatsApp y te contamos precio y formas de pago.`,
    ),

    conDireccion(
      pago.credito
        ? `💥 ¿Quieres estrenar el ${nombre}?\n✅ De contado o a crédito en ${tienda}.\n📩 Escríbenos y te asesoramos sin compromiso.`
        : `💥 ¿Quieres estrenar el ${nombre}?\n✅ De contado en ${tienda}.\n📩 Escríbenos y te asesoramos sin compromiso.`,
    ),

    `🚀 ${nombre} en ${tienda}. Escríbenos por WhatsApp y resolvemos todas tus dudas.`,

    `📱 Ven a ver el ${nombre} en ${tienda}. Lo pruebas en tienda antes de llevarlo.`,

    pago.retoma
      ? `🔄 Recibimos tu celular usado como parte de pago del ${nombre}. Consulta el avalúo por WhatsApp.`
      : `✅ ${nombre} con garantía y asesoría en ${tienda}. Consulta disponibilidad por WhatsApp.`,

    // Reservas, por si alguna de las de arriba no cabe con un nombre largo.
    `${nombre} en ${tienda}. Escríbenos por WhatsApp.`,
    `Consulta el ${nombre} en ${tienda} por WhatsApp.`,
  ];

  /* --- Titulos (limite comodo 40) ---------------------------------------- */

  const titulos = [
    `${nombre} 🔥`,
    lugar ? `${nombre} en ${lugar}` : `${nombre} en Celred`,
    pago.credito ? '💥 De contado o a crédito' : '💥 Consulta el precio',
    '📲 ¡Escríbenos YA!',
    pago.retoma ? '🔄 Recibimos tu usado' : '🚀 ¡Estrena en Celred!',
    // Reservas para nombres largos.
    nombre,
    '📍 ¡Visítanos en tienda!',
  ];

  /* --- Descripciones (limite comodo 30) ---------------------------------- */

  const descripciones = [
    lugar ? `Celred ${lugar} 📍` : 'Tienda Celred 📍',
    '📲 Cotiza por WhatsApp',
    pago.credito ? '💳 Contado o crédito' : '💵 Precio de contado',
    '✅ Consulta disponibilidad',
    pago.retoma ? '🔄 Recibimos tu usado' : '🛡️ Garantía y asesoría',
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
    `Hola ${donde}, vi ${vio} del ${nombre} y quiero información de precio y formas de pago.`,
    `Hola ${donde}, vi ${vio} del ${nombre} y quiero información.`,
    `Hola, vi ${vio} del ${nombre} y quiero información.`,
  ];

  const mensajePrellenado =
    prellenados.find((t) => cabe(t, LIMITES_COPY.mensajePrellenado)) || prellenados[prellenados.length - 1];

  // El mismo registro para las tres listas: ningun texto se repite dentro del
  // anuncio, ni siquiera entre un titulo y una descripcion.
  const vistos = new Set();

  return {
    textosPrincipales: elegir(textos, LIMITES_COPY.textosPrincipales, vistos, { estricto: false }),
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
