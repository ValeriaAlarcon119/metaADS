/**
 * ============================================================================
 *  src/campanas.js — Registro de campanas definidas en campanas/
 * ============================================================================
 *  Cada campana es un archivo .js dentro de campanas/ que exporta por defecto
 *  un objeto con su configuracion completa: sede, segmento, presupuesto,
 *  segmentacion y la lista de anuncios con sus textos.
 *
 *  El sistema las descubre solas: no hay que registrarlas en ningun lado.
 *  Para crear una campana nueva se copia campanas/_plantilla.js, se le cambia
 *  el nombre al archivo y se editan los valores.
 *
 *  Los archivos que empiezan por guion bajo (_plantilla.js) se ignoran.
 * ============================================================================
 */

import { existsSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CODIGOS_SEGMENTO,
  MAX_ANUNCIOS_POR_CONJUNTO,
  SUFIJOS_CONJUNTO,
  obtenerSedeNomenclatura,
  validarTalento,
} from './nomenclatura.js';
import { SEDES_DISPONIBLES, obtenerSede as obtenerSedeTargeting } from './targeting.js';
import { resolverCreativo, RAIZ } from './creativos-sede.js';
import { MAX_OPCIONES_TEXTO } from './creatives.js';
import { obtenerObjetivo, OBJETIVO_POR_DEFECTO } from './objetivos.js';

export const CARPETA_CAMPANAS = join(RAIZ, 'campanas');

/** Limites de Ads Manager. Se avisa, no se bloquea: Meta acepta textos mas largos. */
export const LIMITES_COPY = Object.freeze({
  textosPrincipales: 125,
  titulos: 40,
  descripciones: 30,
  mensajePrellenado: 120,
});

/* -------------------------------------------------------------------------- */
/*  Descubrimiento                                                            */
/* -------------------------------------------------------------------------- */

/** Nombres (sin .js) de las campanas disponibles en campanas/. */
export function listarCampanas() {
  if (!existsSync(CARPETA_CAMPANAS)) return [];
  return readdirSync(CARPETA_CAMPANAS)
    .filter((n) => n.endsWith('.js') && !n.startsWith('_'))
    .map((n) => basename(n, '.js'))
    .sort();
}

/**
 * Carga una campana por su nombre de archivo y la valida.
 * @param {string} nombre  'neiva-c4-and-cred'
 */
export async function cargarCampana(nombre) {
  const disponibles = listarCampanas();

  if (!nombre) {
    if (disponibles.length === 1) return cargarCampana(disponibles[0]);
    throw new Error(
      disponibles.length === 0
        ? `campanas: no hay ninguna campana en ${relative(RAIZ, CARPETA_CAMPANAS)}/.\n` +
          '  Copia campanas/_plantilla.js y ponle el nombre que quieras.'
        : `campanas: hay ${disponibles.length} campanas; di cual.\n` +
          `  Disponibles: ${disponibles.join(', ')}\n` +
          `  Ejemplo: node test-run.js ${disponibles[0]}`,
    );
  }

  const limpio = String(nombre).replace(/\.js$/i, '').trim();
  if (!disponibles.includes(limpio)) {
    throw new Error(
      `campanas: no existe la campana "${limpio}".\n` +
        `  Disponibles: ${disponibles.length ? disponibles.join(', ') : '(ninguna)'}`,
    );
  }

  const ruta = join(CARPETA_CAMPANAS, `${limpio}.js`);
  const modulo = await import(pathToFileURL(ruta).href);
  const cfg = modulo.default || modulo.CAMPANA;

  if (!cfg || typeof cfg !== 'object') {
    throw new Error(`campanas: "${limpio}.js" tiene que exportar por defecto el objeto de la campana.`);
  }

  return validarCampana({ ...cfg, archivo: limpio, rutaArchivo: ruta });
}

/* -------------------------------------------------------------------------- */
/*  Validacion                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Revisa la configuracion de una campana y devuelve una version normalizada,
 * con las rutas de los creativos ya resueltas.
 *
 * Todo lo que se pueda comprobar sin red se comprueba aqui, antes de gastar
 * una sola llamada a Meta.
 */
export function validarCampana(cfg) {
  const errores = [];
  const avisos = [];
  const donde = cfg.archivo ? `campanas/${cfg.archivo}.js` : 'la campana';

  /* --- Objetivo: lo primero, porque de el sale casi todo ---------------- */
  let objetivo = null;
  try {
    objetivo = obtenerObjetivo(cfg.objetivo || OBJETIVO_POR_DEFECTO);
  } catch (error) {
    errores.push(error.message);
  }

  /* --- Sede ------------------------------------------------------------- */
  let ficha = null;
  try {
    ficha = obtenerSedeNomenclatura(cfg.sede);

    // Una sede que todavia no ha abierto no se puede pautar, por muy bien que
    // este todo lo demas.
    if (ficha.proxima) {
      errores.push(
        `${ficha.codigo} (${ficha.sede}) todavia no esta abierta: es una proxima sede.\n` +
          `  ${ficha.pendiente || ''}\n` +
          '  Habilitala en src/nomenclatura.js cuando abra.',
      );
    }
  } catch (error) {
    errores.push(error.message);
  }

  const sedeTargeting = cfg.sedeTargeting || cfg.sede;
  if (!SEDES_DISPONIBLES.includes(sedeTargeting)) {
    errores.push(
      `sedeTargeting "${sedeTargeting}" no existe en src/targeting.js.\n` +
        `  Disponibles: ${SEDES_DISPONIBLES.join(', ')}`,
    );
  } else if (ficha) {
    const fichaT = obtenerSedeTargeting(sedeTargeting);
    if (fichaT.codigo !== ficha.codigo) {
      errores.push(
        `la sede de nomenclatura (${ficha.codigo}) no corresponde con la de targeting (${fichaT.codigo}).`,
      );
    }
  }

  /* --- Conjuntos --------------------------------------------------------- */
  // Una campana puede venir con varios conjuntos, o con los campos sueltos de
  // toda la vida, que equivalen a un conjunto. Por dentro siempre es una lista.
  const entradas =
    Array.isArray(cfg.conjuntos) && cfg.conjuntos.length > 0
      ? cfg.conjuntos
      : [
          {
            segmento: cfg.segmento,
            sufijoConjunto: cfg.sufijoConjunto,
            presupuestoDiarioCop: cfg.presupuestoDiarioCop,
            tipoPresupuesto: cfg.tipoPresupuesto,
            segmentacion: cfg.segmentacion,
            modoTexto: cfg.modoTexto,
            anuncios: cfg.anuncios,
          },
        ];

  if (entradas.length === 0) errores.push('la campana no tiene ningun conjunto de anuncios.');

  const conjuntosOk = entradas.map((entrada, indice) => {
    const prefijo = entradas.length === 1 ? '' : `conjunto ${indice + 1}: `;

    const segmento = String(entrada.segmento || '').toUpperCase();
    if (!CODIGOS_SEGMENTO.includes(segmento)) {
      errores.push(
        `${prefijo}segmento "${entrada.segmento}" no esta en la lista cerrada del manual (punto 8).\n` +
          `  Validos: ${CODIGOS_SEGMENTO.join(', ')}`,
      );
    }

    const sufijo = String(entrada.sufijoConjunto || '').toUpperCase();
    if (sufijo && !Object.keys(SUFIJOS_CONJUNTO).includes(sufijo)) {
      errores.push(`${prefijo}sufijoConjunto "${entrada.sufijoConjunto}" invalido. Solo TEST, OPT o vacio.`);
    }

    const presupuesto = Number(entrada.presupuestoDiarioCop);
    if (!Number.isFinite(presupuesto) || presupuesto <= 0) {
      errores.push(`${prefijo}presupuestoDiarioCop tiene que ser un numero mayor a 0.`);
    }

    const anuncios = Array.isArray(entrada.anuncios) ? entrada.anuncios : [];
    if (anuncios.length === 0) errores.push(`${prefijo}no tiene ningun anuncio.`);
    if (anuncios.length > MAX_ANUNCIOS_POR_CONJUNTO) {
      errores.push(
        `${prefijo}${anuncios.length} anuncios en un conjunto. El manual permite maximo ` +
          `${MAX_ANUNCIOS_POR_CONJUNTO} (punto 6 y punto 11, regla 2).`,
      );
    }

    const anunciosOk = anuncios.map((a, i) => validarAnuncio(a, i, { ficha, cfg, errores, avisos, prefijo }));

    return {
      ...entrada,
      segmento,
      sufijoConjunto: sufijo,
      presupuestoDiarioCop: presupuesto,
      tipoPresupuesto: entrada.tipoPresupuesto || cfg.tipoPresupuesto || 'sede',
      segmentacion: entrada.segmentacion || cfg.segmentacion || {},
      modoTexto: entrada.modoTexto || cfg.modoTexto || 'multiple',
      anuncios: anunciosOk,
    };
  });

  if (errores.length > 0) {
    throw new Error(`Hay ${errores.length} problema(s) en ${donde}:\n  - ${errores.join('\n  - ')}`);
  }

  /* --- Estado: nunca se publica desde la configuracion ------------------- */
  if (cfg.estado && String(cfg.estado).toUpperCase() !== 'PAUSED') {
    throw new Error(
      `estado "${cfg.estado}" no se puede fijar desde el archivo de la campana. ` +
        'Todo se crea en PAUSED; salir en vivo se pide en la linea de comandos con --publicar-en-vivo.',
    );
  }

  const primero = conjuntosOk[0];

  return {
    ...cfg,
    objetivo: objetivo.codigo,
    sede: ficha.codigo,
    sedeTargeting,
    conjuntos: conjuntosOk,
    // Espejo del primer conjunto, para lo que todavia lee los campos sueltos.
    segmento: primero.segmento,
    sufijoConjunto: primero.sufijoConjunto,
    presupuestoDiarioCop: primero.presupuestoDiarioCop,
    tipoPresupuesto: primero.tipoPresupuesto,
    modoTexto: primero.modoTexto,
    segmentacion: primero.segmentacion,
    anuncios: primero.anuncios,
    avisosDeConfiguracion: avisos,
  };
}

/* -------------------------------------------------------------------------- */
/*  Validacion de un anuncio suelto                                           */
/* -------------------------------------------------------------------------- */

function validarAnuncio(a, i, { ficha, cfg, errores, avisos, prefijo = '' }) {
  {
    const etiqueta = `${prefijo}${a.referencia || `anuncio ${i + 1}`}`;

    /* Creativo: se resuelve contra la carpeta de la sede. */
    let creativo = null;
    if (ficha) {
      try {
        creativo = resolverCreativo(ficha.codigo, a.rutaCreativoLocal ?? a.creativo, {
          permitirFueraDeLaSede: Boolean(cfg.permitirCreativoFueraDeLaSede),
        });
        if (!creativo.enCarpetaDeLaSede) {
          avisos.push(`${etiqueta}: el creativo esta fuera de la carpeta de ${ficha.codigo}.`);
        }
      } catch (error) {
        errores.push(`${etiqueta}: ${error.message}`);
      }
    }

    /* Textos: cantidad y longitud. */
    for (const [campo, limite] of Object.entries(LIMITES_COPY)) {
      if (campo === 'mensajePrellenado') continue;
      const lista = a[campo];

      if (!Array.isArray(lista) || lista.length === 0) {
        errores.push(`${etiqueta}: falta "${campo}" o esta vacio.`);
        continue;
      }
      if (lista.length > MAX_OPCIONES_TEXTO) {
        errores.push(`${etiqueta}: "${campo}" trae ${lista.length} y Meta acepta maximo ${MAX_OPCIONES_TEXTO}.`);
      }
      if (new Set(lista).size !== lista.length) {
        errores.push(`${etiqueta}: "${campo}" tiene textos repetidos.`);
      }
      for (const texto of lista) {
        if (String(texto).length > limite) {
          avisos.push(
            `${etiqueta}: un ${singular(campo)} tiene ${String(texto).length} caracteres y el limite ` +
              `comodo es ${limite}. Meta lo acepta, pero se vera cortado: "${recorte(texto)}"`,
          );
        }
      }
    }

    /* El talento es opcional, pero si se pone tiene que ser uno de la lista. */
    if (a.talento) {
      const r = validarTalento(a.talento);
      if (!r.ok) errores.push(`${etiqueta}: ${r.motivo}`);
    }

    if (!a.referencia || !String(a.referencia).trim()) {
      errores.push(`${etiqueta}: falta la referencia (marca y modelo como esta en inventario).`);
    }

    if (!a.mensajePrellenado) errores.push(`${etiqueta}: falta el mensajePrellenado de WhatsApp.`);
    else if (a.mensajePrellenado.length > LIMITES_COPY.mensajePrellenado) {
      avisos.push(
        `${etiqueta}: el mensaje prellenado tiene ${a.mensajePrellenado.length} caracteres; ` +
          `conviene bajarlo de ${LIMITES_COPY.mensajePrellenado}.`,
      );
    }

    return {
      ...a,
      formato: String(a.formato || '').toUpperCase(),
      referencia: a.referencia,
      producto: a.producto || a.referencia,
      rutaCreativoLocal: creativo ? creativo.ruta : a.rutaCreativoLocal,
      creativoRelativo: creativo ? creativo.rutaRelativa : '',
    };
  }
}

const singular = (campo) =>
  ({ textosPrincipales: 'texto principal', titulos: 'titulo', descripciones: 'descripcion' })[campo] || campo;

const recorte = (t) => (String(t).length > 60 ? `${String(t).slice(0, 59)}…` : String(t));

export default { listarCampanas, cargarCampana, validarCampana, CARPETA_CAMPANAS, LIMITES_COPY };
