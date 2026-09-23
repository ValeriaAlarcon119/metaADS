/**
 * ============================================================================
 *  src/nomenclatura.js � Manual de nomenclatura de campanas Celred v1.2
 * ============================================================================
 *  Implementacion literal del documento
 *  "Manual_Nomenclatura_Campanas_Celred_v1_2.pdf" (21/09/2026), vigente para
 *  toda campana creada desde el 1 de octubre de 2026.
 *
 *  Estructura en los tres niveles (punto 3):
 *
 *    Campana   C# | SEDE | DDMMAA              C42 | VICTORIA | 170926
 *    Conjunto  C# | DIST | CJTO# | SEGMENTO    C42 | VIC | CJTO1 | IPH-CRED
 *    Anuncio   ADS# | DIST | FORMATO | REF     ADS3 | VIC | VID | IPHONE 13 128GB
 *
 *  Reglas generales de escritura (punto 2), aplicadas por `normalizarCampo()`:
 *    - MAYUSCULA SOSTENIDA
 *    - sin tildes ni n con virgulilla (TUQUERRES, SEBASTIAN, NARINO, PTOASIS)
 *    - separador exacto: espacio + barra vertical + espacio
 *    - prohibidos los caracteres  / \ # % & "  y las comillas
 *    - el numero va pegado a su prefijo: C42, CJTO1, ADS3
 *    - fecha DDMMAA de seis digitos, sin separadores
 *
 *  Este modulo es puro: no toca la red ni el sistema de archivos.
 * ============================================================================
 */

/** Separador obligatorio entre campos (punto 2). */
export const SEP = ' | ';

/** Caracteres prohibidos dentro de un campo (punto 2). */
const CARACTERES_PROHIBIDOS = /[/\\#%&"'`]/g;

/** Version sin bandera global: `.test()` con /g arrastra lastIndex entre llamadas. */
const TIENE_CARACTER_PROHIBIDO = /[/\\#%&"'`]/;

/* -------------------------------------------------------------------------- */
/*  Punto 7 � Codigos de sede y distintivos                                   */
/* -------------------------------------------------------------------------- */

/**
 * Las trece sedes activas.
 *   codigo     -> unico valido dentro del nombre de la CAMPANA
 *   distintivo -> tres letras, va en el CONJUNTO y en el ANUNCIO
 *   cuenta     -> cuenta publicitaria donde vive la sede
 *
 * Medellin es la unica sede repartida entre las dos cuentas: su C# es uno solo
 * aunque la campana se cree en CA 01 o en CA 02.
 */
export const SEDES = Object.freeze({
  LA16: { codigo: 'LA16', dist: 'L16', sede: 'La 16', ciudad: 'Pasto', cuenta: 'CA 02' },
  SEBASTIAN: { codigo: 'SEBASTIAN', dist: 'SEB', sede: 'CC Sebastian de Belalcazar', ciudad: 'Pasto', cuenta: 'CA 02' },
  LICEO: { codigo: 'LICEO', dist: 'LIC', sede: 'El Liceo', ciudad: 'Pasto', cuenta: 'CA 02' },
  VICTORIA: { codigo: 'VICTORIA', dist: 'VIC', sede: 'Victoria Plaza', ciudad: 'Ipiales', cuenta: 'CA 01' },
  ZAFIRO: { codigo: 'ZAFIRO', dist: 'ZAF', sede: 'CC Zafiro', ciudad: 'Ipiales', cuenta: 'CA 02' },
  MARKUS: { codigo: 'MARKUS', dist: 'MAR', sede: 'Markus', ciudad: 'Ipiales', cuenta: 'CA 02' },
  TUQUERRES: { codigo: 'TUQUERRES', dist: 'TUQ', sede: 'Tuquerres', ciudad: 'Tuquerres', cuenta: 'CA 01' },
  ORITO: { codigo: 'ORITO', dist: 'ORI', sede: 'Orito', ciudad: 'Putumayo', cuenta: 'CA 01' },
  HORMIGA: { codigo: 'HORMIGA', dist: 'HOR', sede: 'La Hormiga', ciudad: 'Putumayo', cuenta: 'CA 02' },
  PTOASIS: { codigo: 'PTOASIS', dist: 'PTA', sede: 'Puerto Asis', ciudad: 'Putumayo', cuenta: 'CA 02' },
  MOCOA: { codigo: 'MOCOA', dist: 'MOC', sede: 'Mocoa', ciudad: 'Putumayo', cuenta: 'CA 01' },
  MEDELLIN: { codigo: 'MEDELLIN', dist: 'MED', sede: 'Medellin', ciudad: 'Antioquia', cuenta: 'CA 01 y CA 02' },
  NEIVA: { codigo: 'NEIVA', dist: 'NEI', sede: 'Neiva', ciudad: 'Huila', cuenta: 'CA 02' },

  /**
   * La Union todavia no esta abierta. Aparece en las listas marcada como
   * proxima sede, pero `proxima: true` hace que no se pueda crear una campana
   * real para ella hasta que se habilite.
   *
   * El distintivo (UNI) lo confirmo Celred el 23/09/2026. La cuenta sigue sin
   * decidir: se pone aqui el dia que abra.
   */
  LAUNION: {
    codigo: 'LAUNION',
    dist: 'UNI',
    sede: 'La Union',
    ciudad: 'La Union',
    cuenta: '',
    proxima: true,
    pendiente: 'Falta decidir en que cuenta publicitaria va (CA 01 o CA 02).',
  },
});

/** Las sedes que se pueden pautar hoy. La Union queda fuera hasta que abra. */
export const CODIGOS_SEDE_ACTIVA = Object.keys(SEDES).filter((c) => !SEDES[c].proxima);

export const CODIGOS_SEDE = Object.keys(SEDES);

/** Devuelve la ficha de una sede por su codigo, o lanza con la lista valida. */
export function obtenerSedeNomenclatura(codigo) {
  const clave = normalizarCampo(codigo);
  const ficha = SEDES[clave];
  if (!ficha) {
    throw new Error(
      `nomenclatura: sede desconocida "${codigo}".\n` +
        `  Codigos validos (punto 7): ${CODIGOS_SEDE.join(', ')}`,
    );
  }
  return ficha;
}

/* -------------------------------------------------------------------------- */
/*  Punto 8 � Segmentos de producto (lista cerrada)                           */
/* -------------------------------------------------------------------------- */

export const SEGMENTOS = Object.freeze({
  'IPH-CONT': 'iPhone de contado',
  'IPH-CRED': 'iPhone a credito',
  'AND-CONT': 'Android de contado',
  'AND-CRED': 'Android a credito',
  MIXTO: 'iPhone y Android en el mismo conjunto',
  'MAC-IPAD': 'Mac, iPad y accesorios Apple',
  RETOMA: 'Plan retoma y equipos open box',
});

export const CODIGOS_SEGMENTO = Object.keys(SEGMENTOS);

/** Sufijos opcionales del conjunto (punto 5). */
export const SUFIJOS_CONJUNTO = Object.freeze({ TEST: 'en prueba', OPT: 'ganador optimizado' });

/** Formatos de anuncio (punto 6): IMG para imagen o carrusel, VID para video o reel. */
export const FORMATOS = Object.freeze({ IMG: 'imagen o carrusel', VID: 'video o reel' });

/**
 * Talentos reconocidos (punto 6). Solo se escriben cuando salen en camara, y
 * el campo es OPCIONAL: la mayoria de anuncios no lo llevan.
 *
 * Al nombre se le puede pegar un lugar cuando hace falta distinguir
 * ("SOFIA MEDELLIN", "SOFIA PUTUMAYO"). Eso lo decide la persona; el sistema
 * no lo inventa ni lo completa solo.
 */
export const TALENTOS = Object.freeze(['ALEJA', 'SARA', 'SOFIA']);

/**
 * Comprueba un valor de talento: tiene que empezar por uno de la lista, y
 * despues admite palabras sueltas (el lugar).
 * @returns {{ok:boolean, motivo:string}}
 */
export function validarTalento(valor) {
  const t = normalizarCampo(valor);
  if (!t) return { ok: true, motivo: '' };

  const primero = t.split(' ')[0];
  if (!TALENTOS.includes(primero)) {
    return {
      ok: false,
      motivo: `"${primero}" no es un talento. Los validos son: ${TALENTOS.join(', ')}.`,
    };
  }
  return { ok: true, motivo: '' };
}

/* -------------------------------------------------------------------------- */
/*  Punto 10 � Campanas regionales de reconocimiento                          */
/* -------------------------------------------------------------------------- */

/**
 * Regiones para campanas regionales (punto 10).
 *
 * TUQUERRES dejo de ser region propia: ahora entra dentro de NARINO, junto con
 * Pasto y La Union. Ojo con la diferencia: TUQUERRES sigue siendo una SEDE
 * (la tienda existe y se pauta), lo que desaparecio es la region.
 */
export const REGIONES = Object.freeze(['PASTO', 'IPIALES', 'NARINO', 'PUTUMAYO', 'MEDELLIN', 'NEIVA']);

/** Que sedes cubre cada region, para poder avisar si algo no cuadra. */
export const SEDES_POR_REGION = Object.freeze({
  PASTO: ['LA16', 'SEBASTIAN', 'LICEO'],
  IPIALES: ['VICTORIA', 'ZAFIRO', 'MARKUS'],
  NARINO: ['LA16', 'SEBASTIAN', 'LICEO', 'VICTORIA', 'ZAFIRO', 'MARKUS', 'TUQUERRES', 'LAUNION'],
  PUTUMAYO: ['ORITO', 'HORMIGA', 'PTOASIS', 'MOCOA'],
  MEDELLIN: ['MEDELLIN'],
  NEIVA: ['NEIVA'],
});
export const TIPOS_REGIONAL = Object.freeze({
  ORGANICO: 'contenido de la parrilla que se impulsa con pauta',
  COMERCIAL: 'estrategias comerciales de la compania',
  EVENTO: 'activaciones y fechas puntuales',
  GEO: 'campanas de geolocalizacion alrededor de uno o varios puntos',
});

/* -------------------------------------------------------------------------- */
/*  Punto 9 � Presupuestos (ABO, siempre a nivel de conjunto)                 */
/* -------------------------------------------------------------------------- */

export const PRESUPUESTO = Object.freeze({
  sede: { minimo: 15000, maximo: 60000, etiqueta: 'De sede (venta)' },
  regional: { minimo: 20000, maximo: 50000, etiqueta: 'Regional (reconocimiento)' },
});

/** Punto 6 y punto 11: maximo 5 anuncios activos por conjunto. */
export const MAX_ANUNCIOS_POR_CONJUNTO = 5;

/**
 * Valida un presupuesto diario en COP contra la tabla del punto 9.
 * @returns {{ok:boolean, avisos:string[]}}
 */
export function validarPresupuesto(cop, tipo = 'sede') {
  const rango = PRESUPUESTO[tipo];
  if (!rango) throw new Error(`nomenclatura: tipo de presupuesto desconocido "${tipo}".`);

  const monto = Number(cop);
  const avisos = [];

  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, avisos: ['El presupuesto diario debe ser un numero mayor a 0.'] };
  }
  if (monto < rango.minimo) {
    avisos.push(
      `Punto 9: ${rango.etiqueta} no puede arrancar por debajo de $${fmt(rango.minimo)} COP/dia ` +
        `(pediste $${fmt(monto)}). Con menos, Meta no sale de la fase de aprendizaje.`,
    );
  }
  if (monto > rango.maximo) {
    avisos.push(
      `Punto 9: ${rango.etiqueta} tiene tope de $${fmt(rango.maximo)} COP/dia ` +
        `(pediste $${fmt(monto)}). Si necesita mas, se abre un conjunto nuevo, no se sube este.`,
    );
  }

  return { ok: avisos.length === 0, avisos };
}

const fmt = (n) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(n));

/* -------------------------------------------------------------------------- */
/*  Punto 2 � Reglas generales de escritura                                   */
/* -------------------------------------------------------------------------- */

/**
 * Lleva un texto a la forma exigida por el punto 2:
 * mayuscula sostenida, sin tildes ni n con virgulilla, sin caracteres
 * prohibidos y sin dobles espacios.
 *
 *   'Túquerres'  -> 'TUQUERRES'
 *   'Puerto Asís' -> 'PUERTO ASIS'
 *   'iPhone 13 128GB' -> 'IPHONE 13 128GB'
 */
export function normalizarCampo(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    // Los diacriticos que NFD separo del caracter base. Va escrito con
    // escapes a proposito: si el archivo se reguarda con otra codificacion,
    // un rango escrito con los caracteres literales se corrompe y deja de
    // quitar tildes sin que nadie se entere.
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(CARACTERES_PROHIBIDOS, ' ')
    .replace(/\|/g, ' ') // el pipe solo lo pone el constructor, nunca el contenido
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fecha en formato DDMMAA de seis digitos (punto 2).
 * Acepta un Date o nada (usa la fecha de hoy, hora local).
 *   new Date(2026, 8, 17) -> '170926'
 */
export function fechaDDMMAA(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) throw new Error('nomenclatura: fecha invalida.');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const aa = String(d.getFullYear()).slice(-2);
  return `${dd}${mm}${aa}`;
}

/** Une campos con el separador obligatorio, descartando los vacios. */
function unir(campos) {
  return campos
    .filter((c) => c !== undefined && c !== null && String(c).trim() !== '')
    .map((c) => normalizarCampo(c))
    .join(SEP);
}

/* -------------------------------------------------------------------------- */
/*  Punto 4 � Nivel 1: Campana                                                */
/* -------------------------------------------------------------------------- */

/**
 * C<numero> | <SEDE> | <DDMMAA>
 *
 * @param {object} p
 * @param {number} p.numero   consecutivo historico por sede, nunca se reinicia
 * @param {string} p.sede     codigo completo del punto 7 (NEIVA, VICTORIA, LA16...)
 * @param {Date}   [p.fecha]  fecha de CREACION de la campana, no de la promocion
 */
export function nombreCampana({ numero, sede, fecha = new Date() }) {
  const n = exigirEntero(numero, 'numero de campana (C#)');
  const ficha = obtenerSedeNomenclatura(sede);
  return unir([`C${n}`, ficha.codigo, fechaDDMMAA(fecha)]);
}

/* -------------------------------------------------------------------------- */
/*  Punto 5 � Nivel 2: Conjunto de anuncios                                   */
/* -------------------------------------------------------------------------- */

/**
 * C<numero> | <DIST> | CJTO<numero> | <SEGMENTO> [ | TEST | OPT ]
 *
 * @param {object} p
 * @param {number} p.numeroCampana  el mismo C# de la campana madre
 * @param {string} p.sede           codigo de sede; de aqui sale el distintivo
 * @param {number} p.numeroConjunto consecutivo dentro de la campana, arranca en 1
 * @param {string} p.segmento       codigo de la lista cerrada del punto 8
 * @param {string} [p.sufijo]       'TEST' o 'OPT'
 */
export function nombreConjunto({ numeroCampana, sede, numeroConjunto, segmento, sufijo = '' }) {
  const c = exigirEntero(numeroCampana, 'numero de campana (C#)');
  const j = exigirEntero(numeroConjunto, 'numero de conjunto (CJTO#)');
  const ficha = obtenerSedeNomenclatura(sede);
  const seg = normalizarCampo(segmento);

  if (!CODIGOS_SEGMENTO.includes(seg)) {
    throw new Error(
      `nomenclatura: segmento "${segmento}" no esta en la lista cerrada del punto 8.\n` +
        `  Validos: ${CODIGOS_SEGMENTO.join(', ')}\n` +
        '  Si un conjunto no encaja en ninguno, se consulta con el area de datos. No se inventa un codigo nuevo.',
    );
  }

  const suf = normalizarCampo(sufijo);
  if (suf && !Object.keys(SUFIJOS_CONJUNTO).includes(suf)) {
    throw new Error(`nomenclatura: sufijo de conjunto "${sufijo}" invalido. Solo TEST u OPT.`);
  }

  return unir([`C${c}`, ficha.dist, `CJTO${j}`, seg, suf]);
}

/* -------------------------------------------------------------------------- */
/*  Punto 6 � Nivel 3: Anuncio                                                */
/* -------------------------------------------------------------------------- */

/**
 * ADS<numero> | <DIST> | <IMG|VID> | <REFERENCIA> [ | <TALENTO> ] [ | L1|L2 ]
 *
 * @param {object} p
 * @param {number} p.numero       consecutivo dentro del conjunto, arranca en 1
 * @param {string} p.sede         codigo de sede; de aqui sale el distintivo
 * @param {string} p.formato      'IMG' o 'VID'
 * @param {string} p.referencia   marca, modelo y capacidad como esta en inventario
 * @param {string} [p.talento]    solo si aparece una persona en camara
 * @param {string} [p.linea]      'L1' o 'L2', solo en sedes con mas de una linea
 */
export function nombreAnuncio({ numero, sede, formato, referencia, talento = '', linea = '' }) {
  const n = exigirEntero(numero, 'numero de anuncio (ADS#)');
  const ficha = obtenerSedeNomenclatura(sede);
  const fmtCode = normalizarCampo(formato);

  if (!Object.keys(FORMATOS).includes(fmtCode)) {
    throw new Error(`nomenclatura: formato "${formato}" invalido. Solo IMG (imagen o carrusel) o VID (video o reel).`);
  }

  const ref = normalizarCampo(referencia);
  if (!ref) throw new Error('nomenclatura: la REFERENCIA del anuncio es obligatoria (punto 6).');

  const tal = normalizarCampo(talento);
  const lin = normalizarCampo(linea);
  if (lin && !['L1', 'L2'].includes(lin)) {
    throw new Error(`nomenclatura: linea "${linea}" invalida. Solo L1 o L2 (punto 6).`);
  }

  return unir([`ADS${n}`, ficha.dist, fmtCode, ref, tal, lin]);
}

/* -------------------------------------------------------------------------- */
/*  Punto 10 � Campanas regionales                                            */
/* -------------------------------------------------------------------------- */

/** R<numero> | <REGION> | <TIPO> | <DDMMAA> */
export function nombreCampanaRegional({ numero, region, tipo, fecha = new Date() }) {
  const n = exigirEntero(numero, 'numero de campana regional (R#)');
  const reg = normalizarCampo(region);
  const tip = normalizarCampo(tipo);

  if (!REGIONES.includes(reg)) {
    throw new Error(`nomenclatura: region "${region}" invalida. Validas: ${REGIONES.join(', ')}`);
  }
  if (!Object.keys(TIPOS_REGIONAL).includes(tip)) {
    throw new Error(`nomenclatura: tipo regional "${tipo}" invalido. Validos: ${Object.keys(TIPOS_REGIONAL).join(', ')}`);
  }

  return unir([`R${n}`, reg, tip, fechaDDMMAA(fecha)]);
}

/**
 * R<numero> | CJTO<numero> | <SEGMENTACION>
 * La campana regional no pertenece a una sede, asi que NO lleva distintivo.
 */
export function nombreConjuntoRegional({ numeroCampana, numeroConjunto, segmentacion }) {
  const r = exigirEntero(numeroCampana, 'numero de campana regional (R#)');
  const j = exigirEntero(numeroConjunto, 'numero de conjunto (CJTO#)');
  const seg = normalizarCampo(segmentacion);
  if (!seg) throw new Error('nomenclatura: la segmentacion del conjunto regional es obligatoria (punto 10).');
  return unir([`R${r}`, `CJTO${j}`, seg]);
}

/* -------------------------------------------------------------------------- */
/*  Consecutivos leidos de los nombres que ya existen en Ads Manager          */
/* -------------------------------------------------------------------------- */

/**
 * Busca el C# mas alto de una sede entre los nombres de campana existentes y
 * devuelve el siguiente. Punto 15: "el consecutivo C# de cada sede arranca en
 * el numero siguiente al ultimo usado en Ads Manager".
 *
 * Tolera los nombres viejos que no llevan el separador exacto:
 *   'C3 | NEIVA | 150826'                      -> 3
 *   'C1 NEIVA | 3115279768 | GENERAL | TESTEO' -> 1
 *
 * @param {string[]} nombres  nombres de campana de la cuenta
 * @param {string} sede       codigo de sede del punto 7
 * @returns {{siguiente:number, maximo:number, coincidencias:{nombre:string, numero:number}[]}}
 */
export function siguienteConsecutivoCampana(nombres, sede) {
  const ficha = obtenerSedeNomenclatura(sede);
  // C<numero> seguido de cualquier separador y luego el codigo de sede.
  const patron = new RegExp(`^C(\\d{1,5})\\s*(?:\\|\\s*)?${ficha.codigo}(?![A-Z0-9])`, 'i');

  const coincidencias = [];
  let maximo = 0;

  for (const bruto of nombres || []) {
    // No se usa normalizarCampo porque esa funcion borra el pipe, que aqui
    // hace falta para distinguir 'C3 | NEIVA | ...' de 'C3 NEIVANDO ...'.
    const limpio = String(bruto ?? '')
      .normalize('NFD')
      .replace(/[̬-ͯ]/g, '')
      .toUpperCase()
      .trim();
    const hit = patron.exec(limpio);
    if (!hit) continue;
    const numero = parseInt(hit[1], 10);
    coincidencias.push({ nombre: bruto, numero });
    if (numero > maximo) maximo = numero;
  }

  return { siguiente: maximo + 1, maximo, coincidencias };
}

/**
 * Busca el CJTO# mas alto dentro de una campana concreta.
 * El CJTO# es consecutivo dentro de la campana y arranca en 1 (punto 5).
 */
export function siguienteConsecutivoConjunto(nombres) {
  return siguientePorPrefijo(nombres, 'CJTO');
}

/**
 * Busca el ADS# mas alto dentro de un conjunto concreto.
 * El ADS# es consecutivo dentro del conjunto y arranca en 1 (punto 6).
 */
export function siguienteConsecutivoAnuncio(nombres) {
  return siguientePorPrefijo(nombres, 'ADS');
}

function siguientePorPrefijo(nombres, prefijo) {
  // Tolera 'ADS3', 'ADS 3' y 'CJTO 2' de los nombres viejos.
  const patron = new RegExp(`\\b${prefijo}\\s*(\\d{1,4})(?![0-9])`, 'i');
  const coincidencias = [];
  let maximo = 0;

  for (const bruto of nombres || []) {
    const hit = patron.exec(String(bruto ?? '').toUpperCase());
    if (!hit) continue;
    const numero = parseInt(hit[1], 10);
    coincidencias.push({ nombre: bruto, numero });
    if (numero > maximo) maximo = numero;
  }

  return { siguiente: maximo + 1, maximo, coincidencias };
}

/* -------------------------------------------------------------------------- */
/*  Auditoria: un nombre cumple el manual?                                    */
/* -------------------------------------------------------------------------- */

// El distintivo es de 3 caracteres pero no siempre son letras: L16 lleva digitos.
const DIST = '[A-Z0-9]{3}';
// Solo las sedes activas: un nombre con LAUNION no debe pasar la auditoria
// mientras la tienda no este abierta.
const SEDE_CODIGO = CODIGOS_SEDE_ACTIVA.join('|');
const SEGMENTO = CODIGOS_SEGMENTO.map((s) => s.replace('-', '\\-')).join('|');
const REGION = REGIONES.join('|');
const TIPO_REGIONAL = Object.keys(TIPOS_REGIONAL).join('|');

const PATRONES = {
  campana: new RegExp(`^C\\d{1,5} \\| (?:${SEDE_CODIGO}) \\| \\d{6}$`),
  conjunto: new RegExp(`^C\\d{1,5} \\| ${DIST} \\| CJTO\\d{1,4} \\| (?:${SEGMENTO})(?: \\| (?:TEST|OPT))?$`),
  // El talento lleva un lookahead negativo para no tragarse el L1/L2 final, y
  // admite varias palabras: "SOFIA" pero tambien "SOFIA MEDELLIN", que es como
  // se distingue a la misma persona en dos regiones.
  anuncio: new RegExp(
    `^ADS\\d{1,4} \\| ${DIST} \\| (?:IMG|VID) \\| [A-Z0-9 ]+(?: \\| (?!L[12]$)[A-Z]+(?: [A-Z]+)*)?(?: \\| L[12])?$`,
  ),
  campanaRegional: new RegExp(`^R\\d{1,5} \\| (?:${REGION}) \\| (?:${TIPO_REGIONAL}) \\| \\d{6}$`),
  conjuntoRegional: /^R\d{1,5} \| CJTO\d{1,4} \| [A-Z0-9-]+$/,
};

/**
 * Verifica que un nombre cumpla el formato del nivel indicado.
 * Se usa como ultima guarda antes de enviar nada a Meta: si un nombre no pasa,
 * no se crea el objeto (punto 2: "el nombre se escribe al crear el objeto").
 *
 * @param {string} nombre
 * @param {'campana'|'conjunto'|'anuncio'|'campanaRegional'|'conjuntoRegional'} nivel
 * @returns {{ok:boolean, problemas:string[]}}
 */
export function auditarNombre(nombre, nivel) {
  const patron = PATRONES[nivel];
  if (!patron) throw new Error(`nomenclatura: nivel desconocido "${nivel}".`);

  const problemas = [];
  const n = String(nombre ?? '');

  if (n !== n.trim()) problemas.push('Tiene espacios sobrantes al principio o al final.');
  if (/\s{2,}/.test(n)) problemas.push('Tiene dos espacios seguidos. El separador es " | ", con un espacio a cada lado.');
  if (TIENE_CARACTER_PROHIBIDO.test(n)) {
    problemas.push('Lleva alguno de estos caracteres, que el manual prohibe: /  \\  #  %  &  "  \'');
  }
  if (/[ì-ſ]/.test(n)) problemas.push('Lleva tildes o ñ. Escribelo sin ellas: NARINO, TUQUERRES, SEBASTIAN.');
  if (n !== n.toUpperCase()) problemas.push('Hay minusculas. El nombre va entero en MAYUSCULA.');
  if (/-\s*COPIA/i.test(n)) problemas.push('Todavia dice "- Copia". Eso lo pone Meta al duplicar; hay que quitarlo.');
  if (/NUEVO (ANUNCIO|CONJUNTO|CAMPANA)/i.test(n)) {
    problemas.push('Todavia tiene el nombre por defecto de Meta ("Nuevo anuncio", "Nuevo conjunto").');
  }

  // El formato se explica con un ejemplo y, cuando se puede, diciendo QUE
  // CAMPO esta mal. Nunca con la expresion regular: un
  // "^C\d{1,5} \| (?:LA16|SEBASTIAN|...)" no le dice nada a nadie.
  if (!patron.test(n)) {
    const porCampo = diagnosticarCampos(n, nivel);
    if (porCampo.length > 0) problemas.push(...porCampo);
    else problemas.push(`No tiene la forma de un nombre de ${NIVELES[nivel]?.que || nivel}.`);
  }

  return {
    ok: problemas.length === 0,
    problemas: [...new Set(problemas)],
    // Con que comparar, para poder enseñarlo al lado del error.
    formato: NIVELES[nivel]?.formato || '',
    ejemplo: NIVELES[nivel]?.ejemplo || '',
    ayuda: NIVELES[nivel]?.ayuda || '',
    patron: patron.source,
  };
}

/**
 * Mira campo por campo y dice cual esta mal.
 *
 * "No cumple el formato" obliga a comparar a ojo contra el ejemplo. Decir
 * "BOGOTA no es una sede" o "faltan los espacios alrededor de la barra" es la
 * diferencia entre corregirlo en dos segundos o en dos minutos.
 */
function diagnosticarCampos(nombre, nivel) {
  const problemas = [];
  const n = String(nombre).trim();

  // Barras sin espacios alrededor: el error mas comun al escribir a mano.
  if (/\S\|/.test(n) || /\|\S/.test(n)) {
    problemas.push('El separador es " | " con un espacio a cada lado de la barra.');
  }

  const campos = n.split(' | ');

  if (nivel === 'campana') {
    if (campos.length !== 3) {
      problemas.push(
        `Un nombre de campana lleva 3 campos separados por " | " y este tiene ${campos.length}.`,
      );
      return problemas;
    }

    const [consecutivo, sede, fecha] = campos;

    if (!/^C\d{1,5}$/.test(consecutivo)) {
      problemas.push(`"${consecutivo}" no es un consecutivo. Va la letra C pegada al numero: C4, C12.`);
    }
    if (!CODIGOS_SEDE.includes(sede)) {
      problemas.push(`"${sede}" no es una sede. Las validas son: ${CODIGOS_SEDE.join(', ')}.`);
    }
    if (!/^\d{6}$/.test(fecha)) {
      problemas.push(`"${fecha}" no es una fecha DDMMAA. Van seis digitos sin barras: 230926 es 23/09/26.`);
    }
    return problemas;
  }

  if (nivel === 'conjunto') {
    if (campos.length < 4 || campos.length > 5) {
      problemas.push(
        `Un nombre de conjunto lleva 4 campos (o 5 con sufijo) y este tiene ${campos.length}.`,
      );
      return problemas;
    }

    const [consecutivo, dist, cjto, segmento, sufijo] = campos;
    const distintivos = Object.values(SEDES).map((s) => s.dist).filter(Boolean);

    if (!/^C\d{1,5}$/.test(consecutivo)) problemas.push(`"${consecutivo}" no es un consecutivo de campana (C4, C12).`);
    if (!distintivos.includes(dist)) {
      problemas.push(`"${dist}" no es un distintivo de sede. Los validos son: ${distintivos.join(', ')}.`);
    }
    if (!/^CJTO\d{1,4}$/.test(cjto)) problemas.push(`"${cjto}" deberia ser CJTO con su numero pegado: CJTO1, CJTO2.`);
    if (!CODIGOS_SEGMENTO.includes(segmento)) {
      problemas.push(`"${segmento}" no es un segmento. Los validos son: ${CODIGOS_SEGMENTO.join(', ')}.`);
    }
    if (sufijo !== undefined && !['TEST', 'OPT'].includes(sufijo)) {
      problemas.push(`"${sufijo}" no es un sufijo valido. Solo TEST, OPT, o ninguno.`);
    }
    return problemas;
  }

  if (nivel === 'anuncio') {
    if (campos.length < 4) {
      problemas.push(`Un nombre de anuncio lleva al menos 4 campos y este tiene ${campos.length}.`);
      return problemas;
    }

    const [ads, dist, formato] = campos;
    const distintivos = Object.values(SEDES).map((s) => s.dist).filter(Boolean);

    if (!/^ADS\d{1,4}$/.test(ads)) problemas.push(`"${ads}" deberia ser ADS con su numero pegado: ADS1, ADS2.`);
    if (!distintivos.includes(dist)) {
      problemas.push(`"${dist}" no es un distintivo de sede. Los validos son: ${distintivos.join(', ')}.`);
    }
    if (!['IMG', 'VID'].includes(formato)) {
      problemas.push(`"${formato}" no es un formato. Solo IMG (imagen o carrusel) o VID (video o reel).`);
    }
    return problemas;
  }

  return problemas;
}

/**
 * Como se le explica cada nivel a una persona: el patron en palabras, un
 * ejemplo real y la pista de lo que suele estar mal.
 */
export const NIVELES = Object.freeze({
  campana: {
    que: 'campana',
    formato: 'C<numero> | SEDE | DDMMAA',
    ejemplo: 'C4 | NEIVA | 230926',
    ayuda:
      'Tres campos separados por " | ": el consecutivo pegado a la C, el codigo de la sede y la fecha ' +
      'de seis digitos sin barras. Sedes validas: ' + Object.keys(SEDES).join(', ') + '.',
  },
  conjunto: {
    que: 'conjunto de anuncios',
    formato: 'C<numero> | DIST | CJTO<numero> | SEGMENTO [| TEST u OPT]',
    ejemplo: 'C4 | NEI | CJTO1 | AND-CRED | TEST',
    ayuda:
      'El mismo C# de la campana, el distintivo de tres letras de la sede, CJTO con su numero y el ' +
      'segmento. El sufijo TEST u OPT es opcional.',
  },
  anuncio: {
    que: 'anuncio',
    formato: 'ADS<numero> | DIST | IMG o VID | REFERENCIA [| TALENTO] [| L1 o L2]',
    ejemplo: 'ADS1 | NEI | IMG | TECNO CAMON 50 PRO',
    ayuda:
      'ADS con su numero, el distintivo de la sede, el formato (IMG para imagen, VID para video) y la ' +
      'referencia del equipo como esta en inventario.',
  },
  campanaRegional: {
    que: 'campana regional',
    formato: 'CR<numero> | REGION | TIPO | DDMMAA',
    ejemplo: 'CR2 | PASTO | ORGANICO | 230926',
    ayuda: 'Para campanas de reconocimiento, no de venta de sede (punto 10).',
  },
  conjuntoRegional: {
    que: 'conjunto regional',
    formato: 'CR<numero> | CJTO<numero> | SEGMENTACION',
    ejemplo: 'CR2 | CJTO1 | GEO',
    ayuda: 'Para campanas de reconocimiento (punto 10).',
  },
});

/* -------------------------------------------------------------------------- */

function exigirEntero(valor, etiqueta) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`nomenclatura: el ${etiqueta} debe ser un entero mayor o igual a 1 (recibido: ${valor}).`);
  }
  return n;
}

export default {
  SEP,
  SEDES,
  CODIGOS_SEDE,
  SEGMENTOS,
  CODIGOS_SEGMENTO,
  FORMATOS,
  TALENTOS,
  REGIONES,
  TIPOS_REGIONAL,
  PRESUPUESTO,
  MAX_ANUNCIOS_POR_CONJUNTO,
  obtenerSedeNomenclatura,
  normalizarCampo,
  fechaDDMMAA,
  nombreCampana,
  nombreConjunto,
  nombreAnuncio,
  nombreCampanaRegional,
  nombreConjuntoRegional,
  siguienteConsecutivoCampana,
  siguienteConsecutivoConjunto,
  siguienteConsecutivoAnuncio,
  validarPresupuesto,
  auditarNombre,
};
