/**
 * ============================================================================
 *  src/precios.js — El precio de CONTADO, siempre escrito a mano
 * ============================================================================
 *  Un anuncio de contado (segmentos IPH-CONT y AND-CONT) tiene que llevar el
 *  precio, si o si (decision del cliente, 24/09/2026). El sistema NO tiene una
 *  tabla de precios y nunca los inventa: quien pide la campana escribe el
 *  precio de cada producto de contado, en el campo "Precio de contado" de la
 *  etapa 3 del panel o en `precioContado` del archivo de la campana.
 *
 *  Mientras no se escriba, los textos generados llevan la marca {PRECIO} en el
 *  sitio donde ira, el panel avisa, y la campana NO se deja crear.
 * ============================================================================
 */

/** Donde ira el precio en un texto que todavia no lo tiene. */
export const MARCA_PRECIO = '{PRECIO}';

/** 1999000 -> '$1.999.000' */
export function formatearPrecio(pesos) {
  return `$${Math.round(Number(pesos)).toLocaleString('es-CO').replace(/,/g, '.')}`;
}

/** Precio valido en pesos, o null. Acepta '1.999.000', '$1999000' o 1999000. */
export function leerPrecio(valor) {
  const n = Number(String(valor ?? '').replace(/\D/g, ''));
  return Number.isFinite(n) && n >= 1000 ? n : null;
}

/**
 * Pone el precio en un texto: cambia la marca {PRECIO} y, si antes tenia otro
 * precio, cambia ese tambien. Asi, corregir el precio en el panel corrige los
 * textos sin tener que reescribirlos.
 */
export function ponerPrecio(texto, precio, precioAnterior = null) {
  let t = String(texto).split(MARCA_PRECIO).join(formatearPrecio(precio));
  if (precioAnterior && precioAnterior !== precio) {
    t = t.split(formatearPrecio(precioAnterior)).join(formatearPrecio(precio));
  }
  return t;
}

export default { MARCA_PRECIO, formatearPrecio, leerPrecio, ponerPrecio };
