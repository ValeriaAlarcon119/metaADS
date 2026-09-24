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
 *  CREDITO Y CONTADO (decision del cliente, 24/09/2026)
 *
 *    - Si el conjunto ofrece credito, TODOS los textos principales llevan
 *      "CRÉDITO PARA REPORTADOS" en mayusculas y negrilla (Unicode).
 *    - Si el conjunto es solo de contado (IPH-CONT, AND-CONT), TODOS los
 *      textos principales llevan el precio de contado. El precio lo escribe a
 *      mano quien pide la campana (src/precios.js): mientras no lo haga, los
 *      textos llevan {PRECIO} y la campana no se deja crear.
 *    - Cada uno de los 5 textos termina con un llamado a la accion DISTINTO,
 *      sorteado de LLAMADOS_A_LA_ACCION.
 *  `revisarReglasDePago` aplica las reglas de pago a los textos a mano.
 *
 *  CERO PROMOCIONES (decision del cliente, 23/09/2026)
 *
 *  No se nombra ningun sorteo, descuento, rifa, fecha de campana, "sin
 *  inicial" ni condicion de credito concreta (cuotas, tasas, plazos). Nada de
 *  eso esta en ninguna fuente de datos del sistema, asi que escribirlo seria
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
import { MARCA_PRECIO, formatearPrecio } from './precios.js';

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

/** Lo que dice el segmento sobre como se paga. */
export function pagoDelSegmento(segmento) {
  return PAGO_POR_SEGMENTO[String(segmento || '').toUpperCase()] || PAGO_POR_SEGMENTO.MIXTO;
}

/** Solo contado: el anuncio tiene que llevar el precio. */
export const esSoloContado = (segmento) => !pagoDelSegmento(segmento).credito;

/** Lo que tiene que aparecer en un texto de credito. */
const MENCION_REPORTADOS = /reportad/i;

/**
 * Meta no tiene negrilla: el texto del anuncio es plano. La negrilla que se ve
 * en otros anuncios son letras "negrilla" de Unicode (Mathematical Sans-Serif
 * Bold), que se ven gruesas en Facebook, Instagram y WhatsApp. Las tildes se
 * conservan como acento combinado: 'CRÉDITO' -> '𝗖𝗥𝗘́𝗗𝗜𝗧𝗢'.
 */
export function negrilla(texto) {
  return [...String(texto).normalize('NFD')]
    .map((c) => {
      const n = c.codePointAt(0);
      if (n >= 65 && n <= 90) return String.fromCodePoint(0x1d5d4 + n - 65);
      if (n >= 97 && n <= 122) return String.fromCodePoint(0x1d5ee + n - 97);
      if (n >= 48 && n <= 57) return String.fromCodePoint(0x1d7ec + n - 48);
      return c;
    })
    .join('');
}

/** Texto plano de lo que venga en negrilla Unicode, para poder revisarlo. */
export const sinNegrilla = (texto) => String(texto).normalize('NFKC');

/** La frase de credito, como la pidio el cliente: mayusculas y negrilla. */
export const CREDITO_PARA_REPORTADOS = negrilla('CRÉDITO PARA REPORTADOS');

/**
 * Las dos reglas de pago aplicadas a una lista de textos principales, sean
 * generados o escritos a mano.
 *
 *   credito  -> cada texto menciona que aplica para reportados
 *   contado  -> con precio: cada texto lo lleva y no queda ningun {PRECIO}
 *               sin precio: `faltaPrecio`. No es un error del texto sino un
 *               dato pendiente: se avisa y la creacion se bloquea.
 *
 * @returns {{errores:string[], faltaPrecio:boolean}}
 */
export function revisarReglasDePago({ segmento, producto, textosPrincipales = [], precioContado = null }) {
  const errores = [];
  const textos = (textosPrincipales || []).map(String);

  if (esSoloContado(segmento)) {
    if (!precioContado) return { errores, faltaPrecio: true };

    const conPrecio = formatearPrecio(precioContado);
    const sinPrecio = textos.filter((t) => !t.includes(conPrecio));
    if (sinPrecio.length) {
      errores.push(
        `${producto} es de contado: los ${textos.length} textos principales tienen que llevar el precio ` +
          `${conPrecio}, y ${sinPrecio.length} no lo llevan.`,
      );
    }
    return { errores, faltaPrecio: false };
  }

  const sinMencion = textos.filter((t) => !MENCION_REPORTADOS.test(sinNegrilla(t)));
  if (sinMencion.length) {
    errores.push(
      `${producto} es a credito: los ${textos.length} textos principales tienen que decir que el ` +
        `credito aplica tambien para reportados, y ${sinMencion.length} no lo dicen.`,
    );
  }
  return { errores, faltaPrecio: false };
}

/**
 * Llamados a la accion. Cada texto principal termina con uno distinto,
 * sorteado cada vez que se generan los copys.
 */
export const LLAMADOS_A_LA_ACCION = Object.freeze([
  '👉 ¡Escríbenos hoy!',
  '📲 ¡Escríbenos ya por WhatsApp!',
  '📞 ¡Llámanos ya!',
  '💬 ¡Pregunta hoy por WhatsApp!',
  '🛒 ¡Aparta el tuyo hoy!',
  '⚡ ¡Cotiza ahora mismo!',
  '🙋 ¡Pide tu asesoría ya!',
  '🤝 ¡Habla hoy con un asesor!',
  '🏬 ¡Visítanos hoy en tienda!',
  '⏰ ¡No te quedes sin el tuyo, escríbenos!',
]);

/** Copia barajada (Fisher-Yates). `azar` se puede fijar en las pruebas. */
function barajar(lista, azar = Math.random) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

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
  precioContado = null,
  azar = Math.random,
}) {
  const nombre = String(producto || '').trim();
  if (!nombre) throw new Error('copys: falta el nombre del producto.');

  const pago = pagoDelSegmento(segmento);
  const esVideo = String(formato).toUpperCase() === 'VID';

  // Contado: el precio lo escribe una persona. Sin el, va {PRECIO} en su
  // sitio y la campana queda pendiente hasta que se escriba.
  const soloContado = !pago.credito;
  const precio = soloContado && precioContado ? precioContado : null;
  const P = precio ? formatearPrecio(precio) : MARCA_PRECIO;

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
  // Orden fijo de cada texto (pedido del cliente, 24/09/2026):
  //
  //   🔥 gancho con el producto
  //   💳 𝗖𝗥𝗘́𝗗𝗜𝗧𝗢 𝗣𝗔𝗥𝗔 𝗥𝗘𝗣𝗢𝗥𝗧𝗔𝗗𝗢𝗦      (contado: 💵 el precio)
  //   ✨ frase llamativa ("¡En Celred es posible!")
  //   👉 llamado a la accion, con emoji, distinto en cada texto
  //
  //   📍 direccion oficial de la sede, en TODOS los textos
  //
  // Pasan de 125 caracteres a proposito: es el formato de Celred, y el texto
  // completo se ve al desplegar el anuncio.

  const llamados = barajar(LLAMADOS_A_LA_ACCION, azar);

  const lineaPago = soloContado ? `💵 ${P} de contado` : `💳 ${CREDITO_PARA_REPORTADOS}`;

  const ganchos = soloContado
    ? [
        esVideo ? `🎬 Mira el ${nombre} en video y llévatelo hoy.` : `🔥 ¡Estrena el ${nombre} en ${tienda}!`,
        `💥 ¿Quieres el ${nombre}? Llévatelo de contado.`,
        `🚀 ${nombre} disponible en ${tienda}.`,
        `📱 Ven a probar el ${nombre} en ${tienda}.`,
        `✅ ${nombre} con garantía y asesoría en ${tienda}.`,
        // Reservas, por si alguna se repite.
        `📦 ${nombre} listo para entregar en ${tienda}.`,
        `⭐ El ${nombre} te espera en ${tienda}.`,
      ]
    : [
        esVideo
          ? `🎬 Mira el ${nombre} en video y llévatelo de ${tienda}.`
          : `🔥 ¡Estrena el ${nombre} en ${tienda}!`,
        `💥 ¿Quieres el ${nombre}? Tenlo de contado o a crédito.`,
        `🚀 ${nombre} disponible en ${tienda}.`,
        `📱 Ven a probar el ${nombre} en ${tienda}.`,
        pago.retoma
          ? `🔄 Recibimos tu usado como parte de pago del ${nombre}.`
          : `✅ ${nombre} con garantía y asesoría en ${tienda}.`,
        // Reservas.
        `📦 ${nombre} listo para entregar en ${tienda}.`,
        `⭐ El ${nombre} te espera en ${tienda}.`,
      ];

  // Frases llamativas, todas con Celred. Nada que prometa aprobacion: invitan
  // a intentarlo ("Intentalo aqui en Celred", "En Celred es posible").
  const frases = barajar(
    soloContado
      ? [
          '✨ ¡Llévatelo hoy mismo en Celred!',
          '🙌 Estrénalo hoy en Celred.',
          '💯 Garantía y asesoría en Celred.',
          '🎯 En Celred, precio claro y sin vueltas.',
          '🤩 ¡Tu próximo celular te espera en Celred!',
          '⚡ ¡En Celred lo tienes hoy!',
          '🏆 ¡En Celred es posible!',
        ]
      : [
          '✨ ¡En Celred es posible!',
          '🙌 ¿Estás reportado? Inténtalo aquí en Celred.',
          '🤩 Tu próximo celular está más cerca en Celred.',
          '💯 En Celred te asesoramos para que lo estrenes.',
          '🎯 Pregunta sin compromiso: ¡en Celred es posible!',
          '⚡ ¡Inténtalo aquí en Celred!',
          '🏆 Estrenar sí es posible en Celred.',
        ],
    azar,
  );

  const textos = ganchos.map((gancho, i) => {
    const cuerpo = [gancho, lineaPago, frases[i], llamados[i]].join('\n');
    return lineaDireccion ? `${cuerpo}\n\n${lineaDireccion}` : cuerpo;
  });

  /* --- Titulos: cortos y concretos (limite comodo 40) --------------------- */

  const titulos = soloContado
    ? [nombre, `${nombre} a ${P}`, `${P} de contado`, '¡Llévatelo hoy!', lugar ? `Celred ${lugar}` : 'Celred', 'Estrénalo hoy']
    : [nombre, 'CRÉDITO PARA REPORTADOS', `${nombre} a crédito`, '¡En Celred es posible!', lugar ? `Celred ${lugar}` : 'Celred', 'Estrénalo hoy'];

  /* --- Descripciones: SOLO el llamado a la accion, con emoji al inicio ---- */
  // Otro sorteo, para que no repitan en el mismo orden los de los textos.
  const descripciones = barajar(LLAMADOS_A_LA_ACCION, azar);

  /* --- Mensaje prellenado ------------------------------------------------ */

  // Lo escribe el CLIENTE, no la tienda: es el texto que le queda listo para
  // enviar al abrir el chat. Por eso va en primera persona y va directo al
  // grano, como el ejemplo real de Celred:
  //
  //   "Hola, quiero mas informacion para adquirir el Samsung Galaxy A17"
  //
  // Nombrar la sede solo tiene sentido donde hay varias tiendas en la misma
  // ciudad (Pasto e Ipiales): ahi le dice al asesor a que local va el cliente.
  // En Neiva, "Celred Neiva Neiva" no ayudaba a nadie.
  const nombreSede = String(sede || '').trim();
  const sedeAportaAlgo = nombreSede && lugar && !nombreSede.toLowerCase().includes(lugar.toLowerCase());
  const local = sedeAportaAlgo ? ` (${nombreSede})` : '';

  const prellenados = [
    `Hola, quiero más información para adquirir el ${nombre}${local}`,
    `Hola, quiero más información para adquirir el ${nombre}`,
    `Hola, me interesa el ${nombre}`,
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
    // Este SI lo escribe la tienda: es el saludo que aparece antes del chat.
    saludoWhatsApp: `¡Hola! Bienvenido a ${tienda}, es un gusto saludarte 😊`,
    // Bandera para que la interfaz pueda decir "esto lo escribio el sistema,
    // revisalo" en vez de presentarlo como si lo hubiera escrito alguien.
    generado: true,
    // Contado sin precio todavia: los textos llevan {PRECIO}.
    faltaPrecio: soloContado && !precio,
    precioContado: precio,
  };
}

export default {
  generarCopys,
  revisarReglasDePago,
  pagoDelSegmento,
  esSoloContado,
  negrilla,
  sinNegrilla,
  CREDITO_PARA_REPORTADOS,
  LLAMADOS_A_LA_ACCION,
};
