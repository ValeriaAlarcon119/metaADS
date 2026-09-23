/**
 * ============================================================================
 *  src/direcciones.js — Las direcciones oficiales de cada sede
 * ============================================================================
 *  FUENTE: "DIRECCIONES (1).docx", entregado por Celred el 23/09/2026.
 *
 *  Este archivo es la UNICA fuente de direcciones del sistema. Ninguna otra
 *  parte del codigo escribe una direccion a mano ni la completa sola.
 *
 *  POR QUE IMPORTA TANTO
 *
 *  Una direccion equivocada en un anuncio manda al cliente a otra tienda, a
 *  veces a otra ciudad. Es de los errores que mas caro salen y de los mas
 *  dificiles de ver revisando por encima: "Calle 8 # 10-47" parece correcta
 *  en cualquier sede hasta que alguien va.
 *
 *  Por eso:
 *   - las direcciones estan copiadas literales del documento
 *   - cada una lleva la ciudad al lado, para poder comprobar que cuadran
 *   - una sede sin direccion devuelve null, NUNCA una inventada ni la de otra
 *   - `direccionDeSede()` falla si le piden una sede que no existe
 *
 *  Si una direccion cambia, se cambia AQUI y en el documento, no en el copy.
 * ============================================================================
 */

import { obtenerSedeNomenclatura, CODIGOS_SEDE } from './nomenclatura.js';

/**
 *  direccion  tal cual aparece en el documento oficial
 *  ciudad     como se nombra en el anuncio (con tilde: es texto para el cliente)
 *  zona       el departamento o la region, cuando el documento lo trae
 *  corta      version para cuando el texto tiene poco espacio
 */
export const DIRECCIONES = Object.freeze({
  PTOASIS: {
    direccion: 'Calle 10 No 24-18 Barrio El Carmen',
    corta: 'Calle 10 No 24-18, B/ El Carmen',
    ciudad: 'Puerto Asís',
    zona: 'Putumayo',
  },
  MOCOA: {
    direccion: 'Cra 9 # 10-30 Avenida Colombia',
    corta: 'Cra 9 # 10-30, Av. Colombia',
    ciudad: 'Mocoa',
    zona: 'Putumayo',
  },
  HORMIGA: {
    direccion: 'Barrio Central Las Américas, Carrera 5 # 7-16, a un costado de la Alcaldía Municipal',
    corta: 'Carrera 5 # 7-16, B/ Las Américas',
    ciudad: 'La Hormiga',
    zona: 'Valle del Guamuez',
  },
  ORITO: {
    direccion: 'Calle 8 # 10-47 Barrio Marco Fidel Suárez, al lado de Distrisur',
    corta: 'Calle 8 # 10-47, B/ Marco Fidel Suárez',
    ciudad: 'Orito',
    zona: 'Putumayo',
  },
  MARKUS: {
    direccion: 'Cra 6 No 13-05 esquina, Ed. Markus',
    corta: 'Cra 6 No 13-05, Ed. Markus',
    ciudad: 'Ipiales',
    zona: 'Nariño',
  },
  ZAFIRO: {
    direccion: 'Cra 6 No 11-51, CC Zafiro local 123',
    corta: 'CC Zafiro, local 123',
    ciudad: 'Ipiales',
    zona: 'Nariño',
  },
  VICTORIA: {
    direccion: 'Cra 7 No 9-56, CC Victoria Plaza local 101A',
    corta: 'CC Victoria Plaza, local 101A',
    ciudad: 'Ipiales',
    zona: 'Nariño',
  },
  LA16: {
    direccion: 'Calle 16 No 23-82 local 1, Centro',
    corta: 'Calle 16 No 23-82, local 1',
    ciudad: 'Pasto',
    zona: 'Nariño',
  },
  LICEO: {
    direccion: 'Calle 17 # 26-60, CC Pasaje El Liceo local 103',
    corta: 'CC Pasaje El Liceo, local 103',
    ciudad: 'Pasto',
    zona: 'Nariño',
  },
  SEBASTIAN: {
    direccion: 'CC Sebastián de Belalcázar local 6A',
    corta: 'CC Sebastián de Belalcázar, local 6A',
    ciudad: 'Pasto',
    zona: 'Nariño',
  },
  TUQUERRES: {
    direccion: 'Cra 14 - Cll 20 esquina',
    corta: 'Cra 14 - Cll 20 esquina',
    ciudad: 'Túquerres',
    zona: 'Nariño',
  },
  MEDELLIN: {
    direccion: 'Centro Comercial Premium Plaza local 1301',
    corta: 'CC Premium Plaza, local 1301',
    ciudad: 'Medellín',
    zona: 'Antioquia',
  },
  NEIVA: {
    direccion: 'Cra 2 # 6-26 local 5, Centro',
    corta: 'Cra 2 # 6-26, local 5',
    ciudad: 'Neiva',
    zona: 'Huila',
  },
  LAUNION: {
    direccion: 'Cra 1 # 11-81, frente al Parque Cuevas Leiva',
    corta: 'Cra 1 # 11-81, frente al Parque',
    ciudad: 'La Unión',
    zona: 'Nariño',
  },
});

/**
 * La direccion oficial de una sede.
 *
 * @param {string} sede  codigo del manual
 * @returns {{direccion:string, corta:string, ciudad:string, zona:string}|null}
 *          null si esa sede todavia no tiene direccion configurada
 */
export function direccionDeSede(sede) {
  // Valida el codigo: pedir una sede que no existe es un error, no un null.
  const ficha = obtenerSedeNomenclatura(sede);
  return DIRECCIONES[ficha.codigo] || null;
}

/**
 * La direccion en una linea, lista para un anuncio.
 *
 *   'Calle 8 # 10-47 Barrio Marco Fidel Suárez, al lado de Distrisur, Orito'
 *
 * Devuelve cadena vacia si la sede no tiene direccion: quien llama decide que
 * hacer, pero nunca recibe una direccion de otra tienda.
 *
 * @param {string} sede
 * @param {object} [opciones]
 * @param {boolean} [opciones.corta=false]   version recortada
 * @param {boolean} [opciones.conCiudad=true]
 */
export function direccionEnUnaLinea(sede, { corta = false, conCiudad = true } = {}) {
  const d = direccionDeSede(sede);
  if (!d) return '';

  const calle = corta ? d.corta : d.direccion;
  return conCiudad ? `${calle}, ${d.ciudad}` : calle;
}

/** Que sedes tienen direccion y cuales no. Para el panel y las pruebas. */
export function inventarioDeDirecciones() {
  return CODIGOS_SEDE.map((codigo) => ({
    sede: codigo,
    tiene: Boolean(DIRECCIONES[codigo]),
    ciudad: DIRECCIONES[codigo]?.ciudad || '',
    direccion: DIRECCIONES[codigo]?.direccion || '',
  }));
}

/** Lo que se enseña cuando falta: nunca un hueco en blanco ni una inventada. */
export const SIN_DIRECCION = 'Dirección oficial no configurada';

export default {
  DIRECCIONES,
  direccionDeSede,
  direccionEnUnaLinea,
  inventarioDeDirecciones,
  SIN_DIRECCION,
};
