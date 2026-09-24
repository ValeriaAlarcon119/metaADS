/**
 * ============================================================================
 *  src/ajustes.js — Las ediciones que se pueden hacer desde el panel
 * ============================================================================
 *  El panel de aprobacion deja corregir cosas antes de enviar nada a Meta:
 *  el nombre de la campana si quedo mal, el presupuesto, el radio, los textos.
 *
 *  Este modulo es la LISTA BLANCA de lo que se puede tocar desde el navegador.
 *  Nada que no este aqui pasa: el cuerpo de una peticion HTTP no puede fijar el
 *  estado, ni pedir salir en vivo, ni cambiar la ruta de un creativo, ni
 *  levantar la prohibicion de usar piezas de otra sede. Esas decisiones viven
 *  en el archivo de la campana y en la linea de comandos, que es donde se
 *  pueden revisar con calma, no en un formulario.
 *
 *  Ademas devuelve la lista de cambios, para que la pantalla pueda enseñar
 *  exactamente que se toco respecto del archivo original.
 * ============================================================================
 */

import { MAX_OPCIONES_TEXTO } from './creatives.js';
import { validarCampana } from './campanas.js';
import { ponerPrecio } from './precios.js';
import { INTERRUPTORES_DE_EXPANSION } from './targeting.js';

/* -------------------------------------------------------------------------- */
/*  Lista blanca                                                              */
/* -------------------------------------------------------------------------- */

/** Campos editables del conjunto, con su tipo y sus limites. */
const CAMPOS_CONJUNTO = Object.freeze({
  presupuestoDiarioCop: { tipo: 'entero', min: 1000, max: 5000000, etiqueta: 'presupuesto diario' },
  segmento: { tipo: 'texto', etiqueta: 'segmento' },
  sufijoConjunto: { tipo: 'texto', etiqueta: 'sufijo del conjunto' },
  nombreConjuntoManual: { tipo: 'texto', etiqueta: 'nombre del conjunto' },
});

/** Campos editables de la segmentacion. */
const CAMPOS_SEGMENTACION = Object.freeze({
  radioKm: { tipo: 'entero', min: 1, max: 80, etiqueta: 'radio en km' },
  modoGeo: { tipo: 'enum', valores: ['ciudad', 'punto'], etiqueta: 'modo de geolocalizacion' },
  edadMin: { tipo: 'entero', min: 13, max: 65, etiqueta: 'edad minima' },
  edadMax: { tipo: 'entero', min: 13, max: 65, etiqueta: 'edad maxima' },
  generos: { tipo: 'lista-numeros', valores: [1, 2], etiqueta: 'generos' },
  plataformas: {
    tipo: 'lista-texto',
    valores: ['facebook', 'instagram', 'whatsapp', 'messenger'],
    etiqueta: 'plataformas',
  },
  dispositivos: { tipo: 'lista-texto', valores: ['mobile', 'desktop'], etiqueta: 'dispositivos' },
});

/**
 * Los interruptores de expansion que se pueden marcar y desmarcar.
 *
 * Salen de la misma lista que usa el targeting, asi que si se agrega uno nuevo
 * aparece solo aqui y en el panel, sin tocar este archivo.
 */
const CAMPOS_EXPANSION = Object.freeze(
  Object.fromEntries(
    INTERRUPTORES_DE_EXPANSION.filter((i) => i.editable).map((i) => [
      i.clave,
      { tipo: 'booleano', etiqueta: i.nombre },
    ]),
  ),
);

/** Campos editables de cada anuncio. El archivo del creativo no se toca aqui. */
const CAMPOS_ANUNCIO = Object.freeze({
  // Identidad del anuncio
  nombreManual: { tipo: 'texto', etiqueta: 'nombre del anuncio' },
  referencia: { tipo: 'texto', etiqueta: 'referencia' },
  producto: { tipo: 'texto', etiqueta: 'producto' },
  talento: { tipo: 'texto', etiqueta: 'talento' },
  // Contenido
  textosPrincipales: { tipo: 'lista-texto-libre', etiqueta: 'textos principales' },
  titulos: { tipo: 'lista-texto-libre', etiqueta: 'titulos' },
  descripciones: { tipo: 'lista-texto-libre', etiqueta: 'descripciones' },
  mensajePrellenado: { tipo: 'texto', etiqueta: 'mensaje prellenado' },
  saludoWhatsApp: { tipo: 'texto', etiqueta: 'saludo de WhatsApp' },
  // Va el ultimo a proposito: se aplica despues de los textos, para poder
  // cambiar en ellos el precio anterior por el nuevo.
  precioContado: { tipo: 'pesos', etiqueta: 'precio de contado' },
});

/** Campos editables del nombre del conjunto. */
const CAMPOS_NOMBRE_CONJUNTO = Object.freeze({
  nombreManual: { tipo: 'texto', etiqueta: 'nombre del conjunto' },
});

/**
 * Claves que jamas se aceptan desde el panel, aunque alguien las mande.
 * Estan aqui para que el rechazo sea explicito y se vea en pantalla, en vez de
 * ignorarse en silencio.
 */
export const CAMPOS_PROHIBIDOS = Object.freeze([
  'estado',
  'permitirEnVivo',
  'sinConexion',
  'simulado',
  'permitirCreativoFueraDeLaSede',
  'rutaCreativoLocal',
  'creativo',
  'sede',
  'sedeTargeting',
  'cuenta',
  'telefonoForzado',
  'campanaExistenteId',
]);

/* -------------------------------------------------------------------------- */
/*  Conversion y validacion de un valor suelto                                */
/* -------------------------------------------------------------------------- */

function convertir(valor, regla, donde, errores) {
  const nombre = `${donde}${regla.etiqueta}`;

  switch (regla.tipo) {
    case 'entero': {
      const n = Number(valor);
      if (!Number.isFinite(n)) {
        errores.push(`${nombre}: "${valor}" no es un numero.`);
        return undefined;
      }
      const entero = Math.round(n);
      if (regla.min !== undefined && entero < regla.min) {
        errores.push(`${nombre}: ${entero} es menor que el minimo (${regla.min}).`);
        return undefined;
      }
      if (regla.max !== undefined && entero > regla.max) {
        errores.push(`${nombre}: ${entero} pasa del maximo (${regla.max}).`);
        return undefined;
      }
      return entero;
    }

    case 'texto':
      return String(valor ?? '').trim();

    case 'pesos': {
      // '1.999.000', '$1999000' o 1999000. Vacio = sin cambio.
      if (String(valor ?? '').trim() === '') return undefined;
      const n = Number(String(valor).replace(/\D/g, ''));
      if (!Number.isFinite(n) || n < 1000) {
        errores.push(`${nombre}: "${valor}" no es un precio valido en pesos.`);
        return undefined;
      }
      return n;
    }

    case 'booleano':
      // Se acepta lo que manda un formulario HTML ademas de un booleano real.
      if (typeof valor === 'boolean') return valor;
      if (valor === 'true' || valor === 'on' || valor === 1 || valor === '1') return true;
      if (valor === 'false' || valor === 'off' || valor === 0 || valor === '0' || valor === '') return false;
      errores.push(`${nombre}: "${valor}" no es si o no.`);
      return undefined;

    case 'enum': {
      const t = String(valor ?? '').trim().toLowerCase();
      if (!regla.valores.includes(t)) {
        errores.push(`${nombre}: "${valor}" no vale. Opciones: ${regla.valores.join(', ')}.`);
        return undefined;
      }
      return t;
    }

    case 'lista-numeros': {
      if (!Array.isArray(valor)) {
        errores.push(`${nombre}: se esperaba una lista.`);
        return undefined;
      }
      const lista = valor.map(Number).filter((n) => regla.valores.includes(n));
      return lista.length > 0 ? lista : undefined;
    }

    case 'lista-texto': {
      if (!Array.isArray(valor)) {
        errores.push(`${nombre}: se esperaba una lista.`);
        return undefined;
      }
      const lista = [...new Set(valor.map((v) => String(v).trim().toLowerCase()))].filter((v) =>
        regla.valores.includes(v),
      );
      if (lista.length === 0) {
        errores.push(`${nombre}: la lista quedo vacia. Opciones: ${regla.valores.join(', ')}.`);
        return undefined;
      }
      return lista;
    }

    case 'lista-texto-libre': {
      if (!Array.isArray(valor)) {
        errores.push(`${nombre}: se esperaba una lista de textos.`);
        return undefined;
      }
      const lista = valor.map((v) => String(v ?? '').trim()).filter(Boolean);
      if (lista.length === 0) {
        errores.push(`${nombre}: no puede quedar vacio.`);
        return undefined;
      }
      if (lista.length > MAX_OPCIONES_TEXTO) {
        errores.push(`${nombre}: ${lista.length} opciones y Meta acepta maximo ${MAX_OPCIONES_TEXTO}.`);
        return undefined;
      }
      if (new Set(lista).size !== lista.length) {
        errores.push(`${nombre}: hay textos repetidos.`);
        return undefined;
      }
      return lista;
    }

    default:
      errores.push(`${nombre}: tipo "${regla.tipo}" desconocido.`);
      return undefined;
  }
}

/** Compara dos valores para decidir si hubo cambio real. */
const mismo = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Version corta y legible de un valor, para la lista de cambios.
 *
 * "(sin fijar)" confundia: parecia que faltara algo. Lo que significa es que
 * el archivo de la campana no decia nada de ese campo, asi que estaba usando
 * el valor por defecto del sistema. Se dice con esas palabras. Y los booleanos
 * salen como "Si"/"No", no como true/false.
 */
function mostrar(valor) {
  if (valor === undefined || valor === null || valor === '') return 'el valor por defecto';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (Array.isArray(valor)) {
    if (valor.length === 0) return 'ninguno';
    return valor.length <= 3 ? valor.join(' · ') : `${valor.length} elementos`;
  }
  return String(valor);
}

/* -------------------------------------------------------------------------- */
/*  Aplicacion                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Mezcla los ajustes del panel sobre la configuracion de una campana.
 *
 * Los ajustes van por conjunto, en el mismo orden que la campana:
 *
 *   {
 *     campana:   { nombre },
 *     conjuntos: [ { presupuestoDiarioCop, segmento, sufijoConjunto,
 *                    segmentacion: {...}, anuncios: [ {...} ] } ]
 *   }
 *
 * @param {object} campana  la que devolvio cargarCampana()
 * @param {object} [ajustes]
 * @returns {{cfg:object, cambios:{etapa:string,campo:string,antes:string,despues:string}[],
 *            rechazados:string[]}}
 */
export function aplicarAjustes(campana, ajustes = {}) {
  const errores = [];
  const cambios = [];
  const rechazados = [];

  const anotar = (etapa, campo, antes, despues) => {
    if (mismo(antes, despues)) return;
    cambios.push({ etapa, campo, antes: mostrar(antes), despues: mostrar(despues) });
  };

  /* --- Lo que no se acepta, dicho en voz alta --------------------------- */
  const revisarProhibidos = (bloque) => {
    if (!bloque || typeof bloque !== 'object') return;
    for (const clave of Object.keys(bloque)) {
      if (CAMPOS_PROHIBIDOS.includes(clave)) rechazados.push(clave);
    }
  };

  revisarProhibidos(ajustes);
  for (const c of Array.isArray(ajustes.conjuntos) ? ajustes.conjuntos : []) {
    revisarProhibidos(c);
    revisarProhibidos(c?.segmentacion);
    for (const a of Array.isArray(c?.anuncios) ? c.anuncios : []) revisarProhibidos(a);
  }

  /* --- Copia editable --------------------------------------------------- */
  const cfg = {
    ...campana,
    conjuntos: (campana.conjuntos || []).map((c) => ({
      ...c,
      segmentacion: { ...(c.segmentacion || {}) },
      anuncios: (c.anuncios || []).map((a) => ({ ...a })),
    })),
  };

  /* --- Etapa 1: la campana ---------------------------------------------- */
  // El panel solo manda el nombre cuando de verdad lo cambiaron, y manda
  // tambien el que habia, para que la lista diga "esto -> esto".
  const nombrePedido = String(ajustes.campana?.nombre ?? '').trim();
  if (nombrePedido) {
    cfg.nombreCampanaManual = nombrePedido;
    anotar('campaña', 'nombre', ajustes.campana?.nombreAnterior || 'el nombre automático', nombrePedido);
  }

  /* El objetivo tambien se cambia desde la etapa 1, y con el el prefijo. */
  const objetivoPedido = String(ajustes.campana?.objetivo ?? '').trim();
  if (objetivoPedido && objetivoPedido !== cfg.objetivo) {
    anotar('campaña', 'objetivo', cfg.objetivo, objetivoPedido);
    cfg.objetivo = objetivoPedido;
  }

  for (const [clave, etiqueta] of [
    ['region', 'región'],
    ['tipoRegional', 'tipo de campaña regional'],
  ]) {
    const v = String(ajustes.campana?.[clave] ?? '').trim();
    if (v && v !== cfg[clave]) {
      anotar('campaña', etiqueta, cfg[clave], v);
      cfg[clave] = v;
    }
  }

  if (ajustes.campana?.compartirPresupuesto !== undefined) {
    const valor = convertir(
      ajustes.campana.compartirPresupuesto,
      { tipo: 'booleano', etiqueta: 'reparto de presupuesto entre conjuntos' },
      'campaña → ',
      errores,
    );
    if (valor !== undefined) {
      anotar('campaña', 'reparto de presupuesto entre conjuntos', Boolean(cfg.compartirPresupuesto), valor);
      cfg.compartirPresupuesto = valor;
    }
  }

  /* --- Etapa 2 y 3: cada conjunto y sus anuncios ------------------------ */
  const porConjunto = Array.isArray(ajustes.conjuntos) ? ajustes.conjuntos : [];

  if (porConjunto.length > cfg.conjuntos.length) {
    errores.push(
      `llegaron ajustes para ${porConjunto.length} conjuntos y la campana tiene ${cfg.conjuntos.length}. ` +
        'Desde el panel se editan los conjuntos que ya existen; para agregar o quitar conjuntos se ' +
        'vuelve a pedir la campana o se edita su archivo.',
    );
  }

  porConjunto.slice(0, cfg.conjuntos.length).forEach((edicion, indice) => {
    if (!edicion || typeof edicion !== 'object') return;

    const destino = cfg.conjuntos[indice];
    // El nombre real del conjunto dice mucho mas que "conjunto 2": lo manda el
    // panel, que ya lo tiene en pantalla.
    const etapa = edicion.nombreActual || (cfg.conjuntos.length === 1 ? 'conjunto' : `conjunto ${indice + 1}`);
    const donde = `${etapa} → `;

    for (const [clave, regla] of Object.entries({ ...CAMPOS_CONJUNTO, ...CAMPOS_NOMBRE_CONJUNTO })) {
      if (edicion[clave] === undefined) continue;
      const valor = convertir(edicion[clave], regla, donde, errores);
      if (valor === undefined) continue;
      anotar(etapa, regla.etiqueta, destino[clave], valor);
      destino[clave] = valor;
    }

    for (const [clave, regla] of Object.entries(CAMPOS_SEGMENTACION)) {
      if (edicion.segmentacion?.[clave] === undefined) continue;
      const valor = convertir(edicion.segmentacion[clave], regla, donde, errores);
      if (valor === undefined) continue;
      anotar(etapa, regla.etiqueta, destino.segmentacion[clave], valor);
      destino.segmentacion[clave] = valor;
    }

    /* --- Los interruptores de expansion --------------------------------- */
    destino.expansion ??= {};
    for (const [clave, regla] of Object.entries(CAMPOS_EXPANSION)) {
      if (edicion.expansion?.[clave] === undefined) continue;
      const valor = convertir(edicion.expansion[clave], regla, donde, errores);
      if (valor === undefined) continue;
      anotar(etapa, `expansión: ${regla.etiqueta}`, Boolean(destino.expansion[clave]), valor);
      destino.expansion[clave] = valor;
    }

    const { edadMin, edadMax } = destino.segmentacion;
    if (Number.isFinite(edadMin) && Number.isFinite(edadMax) && edadMin > edadMax) {
      errores.push(`${donde}la edad minima (${edadMin}) es mayor que la maxima (${edadMax}).`);
    }

    /* --- Los anuncios de este conjunto ---------------------------------- */
    const porAnuncio = Array.isArray(edicion.anuncios) ? edicion.anuncios : [];

    if (porAnuncio.length > destino.anuncios.length) {
      errores.push(
        `${donde}llegaron ajustes para ${porAnuncio.length} anuncios y tiene ${destino.anuncios.length}. ` +
          'Desde el panel se editan los textos de los anuncios que ya existen.',
      );
    }

    porAnuncio.slice(0, destino.anuncios.length).forEach((edicionAnuncio, i) => {
      if (!edicionAnuncio || typeof edicionAnuncio !== 'object') return;
      const etiqueta = destino.anuncios[i].referencia || `anuncio ${i + 1}`;

      for (const [clave, regla] of Object.entries(CAMPOS_ANUNCIO)) {
        if (edicionAnuncio[clave] === undefined) continue;
        const valor = convertir(edicionAnuncio[clave], regla, `${etiqueta} → `, errores);
        if (valor === undefined) continue;
        anotar(`${etapa}, anuncio ${i + 1}`, `${etiqueta}: ${regla.etiqueta}`, destino.anuncios[i][clave], valor);
        // Cambiar el precio cambia tambien el precio viejo escrito en los textos.
        if (clave === 'precioContado') {
          const anterior = Number(destino.anuncios[i].precioContado) || null;
          for (const lista of ['textosPrincipales', 'titulos', 'descripciones']) {
            const actual = destino.anuncios[i][lista];
            if (Array.isArray(actual)) destino.anuncios[i][lista] = actual.map((t) => ponerPrecio(t, valor, anterior));
          }
        }
        destino.anuncios[i][clave] = valor;
        // Un texto editado a mano deja de ser texto generado.
        if (clave !== 'saludoWhatsApp') destino.anuncios[i].generado = false;
      }
    });
  });

  if (errores.length > 0) {
    throw new Error(`Hay ${errores.length} problema(s) en los ajustes del panel:\n  - ${errores.join('\n  - ')}`);
  }

  // Se vuelve a validar entera: un ajuste no puede saltarse ninguna de las
  // comprobaciones que pasa un archivo de campana recien cargado.
  const validada = validarCampana(cfg);

  return {
    cfg: { ...validada, nombreCampanaManual: cfg.nombreCampanaManual || '' },
    cambios,
    rechazados: [...new Set(rechazados)],
  };
}

export default { aplicarAjustes, CAMPOS_PROHIBIDOS };
