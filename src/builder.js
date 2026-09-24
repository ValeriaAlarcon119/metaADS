/**
 * ============================================================================
 *  src/builder.js — Orquestador de creacion de la estructura Meta
 * ============================================================================
 *  Secuencia:  Campaign -> AdSet -> (AdCreative -> Ad) por cada anuncio
 *
 *  REGLAS INQUEBRANTABLES que vive este modulo:
 *
 *   1. El estado de creacion lo decide la configuracion, pero `forzarEstado()`
 *      lo aplica a TODOS los objetos justo antes del POST, asi que no hay
 *      forma de que un objeto salga con un estado distinto al aprobado.
 *   2. Este modulo NO pregunta nada. La aprobacion humana vive en test-run.js
 *      y nadie debe llamar a `crearEstructuraCampana()` sin haber confirmado.
 *   3. El presupuesto va SIEMPRE en el conjunto (ABO), nunca en la campana
 *      (manual, punto 9). `paramsCampana` no lleva daily_budget ni lifetime.
 *   4. El destino de mensajes es SOLO WhatsApp: destination_type WHATSAPP en
 *      el conjunto y CTA WHATSAPP_MESSAGE en el creativo. Messenger e
 *      Instagram Direct quedan fuera por construccion.
 *   5. La expansion de publico va apagada: `sanitizarTargeting()` se aplica al
 *      targeting y `auditarExpansion()` lo verifica antes de enviar.
 * ============================================================================
 */

import bizSdk from 'facebook-nodejs-business-sdk';

import {
  adAccountDe,
  cuentaDeSede,
  ESTADO_OBLIGATORIO,
  ESTADOS_VALIDOS,
  PAGE_ID,
  paginaDeSede,
  instagramDeSede,
  factorMoneda,
  WHATSAPP_NUMBER,
  RUTA_LINEAS_XLSX,
  obtenerInfoCuenta,
  exigirCredenciales,
  aUnidadMenor,
} from './config.js';

// El ADS# no se consulta: el conjunto siempre es nuevo, asi que arranca en 1
// (punto 6). `consecutivoAnuncioDeConjunto` queda en tracker.js para cuando
// haya que agregar anuncios a un conjunto que ya existe.
import {
  consecutivoCampanaDeSede,
  consecutivoCampanaDeRegion,
  consecutivoConjuntoDeCampana,
} from './tracker.js';

import {
  obtenerSede as obtenerSedeTargeting,
  construirTargeting,
  sanitizarTargeting,
  auditarExpansion,
  normalizarExpansion,
  INTERRUPTORES_DE_EXPANSION,
} from './targeting.js';

import { obtenerObjetivo, camposDeMeta, OBJETIVO_POR_DEFECTO } from './objetivos.js';

import {
  nombreCampana,
  nombreCampanaRegional,
  nombreConjunto,
  nombreConjuntoRegional,
  nombreAnuncio,
  auditarNombre,
  NIVELES,
  REGIONES,
  validarPresupuesto,
  obtenerSedeNomenclatura,
  fechaDDMMAA,
  MAX_ANUNCIOS_POR_CONJUNTO,
} from './nomenclatura.js';

import { lineaDeSede } from './lineas.js';
import { esSoloContado } from './copys.js';

import {
  subirCreativoLocal,
  construirAdCreative,
  inspeccionarCreativoLocal,
  normalizarNumeroWhatsApp,
  verificarCreativo,
  describirMejoras,
  ENLACE_WHATSAPP,
} from './creatives.js';

const { Campaign, AdSet, Ad } = bizSdk;

/* -------------------------------------------------------------------------- */
/*  Guardas de seguridad                                                      */
/* -------------------------------------------------------------------------- */

/** REGLA 1: el estado aprobado se aplica pase lo que pase. */
function forzarEstado(params, estado) {
  const limpio = String(estado || ESTADO_OBLIGATORIO).toUpperCase();
  if (!ESTADOS_VALIDOS.includes(limpio)) {
    throw new Error(`builder: estado "${estado}" invalido. Validos: ${ESTADOS_VALIDOS.join(', ')}`);
  }
  return { ...params, status: limpio, effective_status: undefined };
}

/** Quita claves undefined antes de enviar a Graph. */
function limpiar(objeto) {
  return Object.fromEntries(Object.entries(objeto).filter(([, v]) => v !== undefined));
}

/* -------------------------------------------------------------------------- */
/*  FASE 1 (solo lectura): planificar                                         */
/* -------------------------------------------------------------------------- */

/**
 * Calcula TODO lo que se va a crear sin tocar nada en Meta.
 * Consulta consecutivos, datos de cuenta y la linea de WhatsApp del Excel.
 * No hace ni un POST.
 *
 * @param {object} cfg
 * @param {string} cfg.sede                 codigo del manual: NEIVA, VICTORIA...
 * @param {string} cfg.sedeTargeting        clave del diccionario de targeting.js
 * @param {string} cfg.segmento             codigo de la lista cerrada (punto 8)
 * @param {string} [cfg.sufijoConjunto]     'TEST' u 'OPT'
 * @param {number} cfg.presupuestoDiarioCop presupuesto del CONJUNTO (ABO)
 * @param {object[]} cfg.anuncios           uno por anuncio a crear
 * @param {string} [cfg.campanaExistenteId] si se pasa, no se crea campana nueva
 * @param {string} [cfg.estado]             PAUSED por defecto
 * @param {object} [cfg.segmentacion]       edadMin, edadMax, generos, radioKm...
 * @param {Date}   [cfg.fecha]              fecha de creacion, para el DDMMAA
 * @returns {Promise<object>} plan completo
 */
export async function planificarEstructura(cfg) {
  const {
    sede,
    sedeTargeting,
    // Forma nueva: varios conjuntos en una campana. Si no viene, se arma uno
    // solo con los campos sueltos de abajo, que es como estaban escritas las
    // campanas antes y como siguen funcionando.
    conjuntos: conjuntosPedidos = null,
    segmento,
    sufijoConjunto = '',
    presupuestoDiarioCop,
    anuncios = [],
    campanaExistenteId = null,
    estado = ESTADO_OBLIGATORIO,

    // El objetivo se elige al principio y de el sale el prefijo del nombre
    // (C o R), los tres campos de Meta y si hace falta numero de WhatsApp.
    // No se deduce del nombre: es un dato.
    objetivo = OBJETIVO_POR_DEFECTO,
    // Solo para campanas regionales (R#).
    region = '',
    tipoRegional = '',
    // Cuando un nombre escrito a mano no cumple el manual, por defecto se
    // corta. Con esto en true se avisa y se continua: la decision es de quien
    // esta delante de la pantalla, no del sistema.
    nombresForzados = false,
    segmentacion = {},
    fecha = new Date(),
    tipoPresupuesto = 'sede',
    modoTexto = 'multiple',
    // Nombres fijados a mano en el panel de aprobacion. Se auditan igual que
    // los generados: el manual manda aunque el nombre lo escriba una persona.
    nombreCampanaManual = '',
    nombreConjuntoManual = '',
    // Si los conjuntos se prestan presupuesto entre si. Meta obliga a
    // declararlo; aqui va en false salvo que alguien lo cambie a proposito.
    compartirPresupuesto = false,
    telefonoForzado = WHATSAPP_NUMBER || '',
    // Vista previa sin token: no consulta nada en Meta y usa los valores de
    // `simulado`. El plan que sale NO sirve para crear, solo para revisar.
    sinConexion = false,
    simulado = {},
    // Salir en vivo no se puede pedir desde el archivo de la campana: tiene
    // que venir de la linea de comandos, con --publicar-en-vivo.
    permitirEnVivo = false,
  } = cfg;

  const avisos = [];

  const estadoPedido = String(estado || ESTADO_OBLIGATORIO).toUpperCase();
  if (estadoPedido !== ESTADO_OBLIGATORIO && !permitirEnVivo) {
    throw new Error(
      `builder: se pidio crear en ${estadoPedido} sin autorizacion explicita. ` +
        'Todo se crea en PAUSED salvo que se corra con --publicar-en-vivo.',
    );
  }

  /* --- Validaciones locales antes de gastar llamadas a la API ------------ */
  if (!sinConexion) exigirCredenciales();
  if (!PAGE_ID) throw new Error('builder: falta META_PAGE_ID en el .env (obligatorio para WhatsApp).');

  // Una sola forma interna: siempre una lista de conjuntos. Una campana con
  // los campos sueltos es simplemente una lista de uno.
  const entradas = Array.isArray(conjuntosPedidos) && conjuntosPedidos.length > 0
    ? conjuntosPedidos
    : [{ segmento, sufijoConjunto, presupuestoDiarioCop, tipoPresupuesto, segmentacion, anuncios, modoTexto }];

  if (entradas.length === 0) throw new Error('builder: hay que configurar al menos un conjunto de anuncios.');

  entradas.forEach((c, i) => {
    const lista = c.anuncios || [];
    const donde = entradas.length === 1 ? 'el conjunto' : `el conjunto ${i + 1} (${c.segmento})`;

    if (!lista.length) throw new Error(`builder: ${donde} no tiene ningun anuncio.`);
    if (lista.length > MAX_ANUNCIOS_POR_CONJUNTO) {
      throw new Error(
        `builder: ${donde} trae ${lista.length} anuncios. El manual (punto 6 y punto 11, regla 2) ` +
          `permite maximo ${MAX_ANUNCIOS_POR_CONJUNTO} activos por conjunto.`,
      );
    }
  });

  const ficha = obtenerSedeNomenclatura(sede);
  const fichaTargeting = obtenerSedeTargeting(sedeTargeting);

  if (fichaTargeting.codigo !== ficha.codigo) {
    throw new Error(
      `builder: la sede de nomenclatura (${ficha.codigo}) no corresponde con la de targeting ` +
        `(${fichaTargeting.codigo}). Revisa cfg.sede y cfg.sedeTargeting.`,
    );
  }

  /* --- El objetivo manda ------------------------------------------------ */
  const fichaObjetivo = obtenerObjetivo(objetivo);
  const esRegional = fichaObjetivo.ambito === 'regional';

  if (!fichaObjetivo.ensayado) {
    avisos.push(
      `El objetivo "${fichaObjetivo.etiqueta}" todavia no se ha ensayado contra la cuenta real. ` +
        `${fichaObjetivo.notaDeEnsayo} Corre "npm run validar" antes de crear, que no crea nada.`,
    );
  }

  if (esRegional && !region) {
    const e = new Error(
      `"${fichaObjetivo.etiqueta}" es una campana regional, asi que hace falta decir la region.\n` +
        `  Regiones: ${REGIONES.join(', ')}`,
    );
    e.amigable = true;
    e.titulo = 'Falta la region';
    throw e;
  }

  /* --- Linea de WhatsApp: sale del Excel, no de una constante ------------ */
  // Solo los objetivos de mensajeria la necesitan. Una campana de
  // reconocimiento no lleva numero ni promoted_object.
  const whatsapp = fichaObjetivo.usaWhatsApp
    ? lineaDeSede(RUTA_LINEAS_XLSX, ficha.codigo, { telefonoForzado })
    : { telefono: '', origen: 'no aplica a este objetivo', avisos: [], alternativas: [], registro: null };

  avisos.push(...whatsapp.avisos);

  if (modoTexto === 'multiple') {
    avisos.push(
      'Las 5 opciones de texto por anuncio usan asset_feed_spec. Meta documenta ese campo para Dynamic ' +
        'Creative (que admite un solo anuncio por conjunto) y para personalizacion por ubicacion, pero no ' +
        'para dos anuncios normales en un mismo conjunto. Si la cuenta lo rechaza se prueban cinco ' +
        'envoltorios distintos, TODOS con los 5 textos; ninguno baja a un solo texto. Si los cinco fallan, ' +
        'el anuncio no se crea y se reporta el motivo.',
    );
  }

  /* --- Presupuesto y archivos locales, conjunto por conjunto ------------- */
  // Todo esto se comprueba antes de gastar una sola llamada a la API.
  const chequeos = entradas.map((entrada, indice) => {
    const etiqueta = entradas.length === 1 ? '' : ` (conjunto ${indice + 1}, ${entrada.segmento})`;

    const presupuesto = validarPresupuesto(
      entrada.presupuestoDiarioCop,
      entrada.tipoPresupuesto || tipoPresupuesto,
    );
    avisos.push(...presupuesto.avisos.map((a) => `${a}${etiqueta}`));

    const archivos = (entrada.anuncios || []).map((a) => inspeccionarCreativoLocal(a.rutaCreativoLocal));
    archivos.forEach((archivo, i) => {
      const formatoEsperado = archivo.tipo === 'imagen' ? 'IMG' : 'VID';
      const formatoPedido = String(entrada.anuncios[i].formato || '').toUpperCase();
      if (formatoPedido && formatoPedido !== formatoEsperado) {
        throw new Error(
          `builder: el anuncio ${i + 1}${etiqueta} dice formato ${formatoPedido} pero ` +
            `"${archivo.nombre}" es ${archivo.tipo} (deberia ser ${formatoEsperado}).`,
        );
      }
    });

    return { presupuesto, archivos };
  });

  /* --- La cuenta sale de la sede, no de una constante -------------------- */
  const cuentaSede = cuentaDeSede(ficha, cfg.cuenta);
  avisos.push(...cuentaSede.avisos);
  const cuentaAds = adAccountDe(cuentaSede.id);

  /* --- Cuenta y consecutivos (lectura en Meta) --------------------------- */
  if (sinConexion) {
    avisos.push(
      'VISTA PREVIA SIN CONEXION: no se consulto nada en Meta. La moneda y los datos de la cuenta ' +
        `son de relleno, y el numero de campana que se muestra (C${simulado.numeroCampana ?? 1}) es ` +
        'una suposicion. Al correr con credenciales, el C# real se lee de Ads Manager.',
    );
  }

  const cuenta = sinConexion
    ? {
        name: simulado.nombreCuenta || '(sin conexion)',
        currency: simulado.moneda || 'COP',
        timezone_name: simulado.husoHorario || 'America/Bogota',
        account_status: 1,
        min_daily_budget: simulado.minimoDiario ?? 0,
        factor: factorMoneda(simulado.moneda || 'COP'),
      }
    : await obtenerInfoCuenta(cuentaSede.id);

  // C# y R# son DOS series distintas. Una campana de sede continua el C# de
  // esa sede; una regional continua el R# de esa region. Antes las dos leian
  // el contador de la sede, asi que la primera regional de Neiva salia con el
  // numero siguiente al de sus campanas de WhatsApp.
  const consecutivoCampana = campanaExistenteId
    ? null
    : sinConexion
      ? {
          siguiente: simulado.numeroCampana ?? 1,
          maximo: (simulado.numeroCampana ?? 1) - 1,
          coincidencias: [],
          revisados: 0,
          avisos: [],
        }
      : esRegional
        ? await consecutivoCampanaDeRegion(cuentaAds, region)
        : await consecutivoCampanaDeSede(cuentaAds, ficha.codigo);
  if (consecutivoCampana) avisos.push(...consecutivoCampana.avisos);

  const consecutivoConjunto = sinConexion
    ? { siguiente: simulado.numeroConjunto ?? 1, maximo: 0, coincidencias: [], revisados: 0 }
    : await consecutivoConjuntoDeCampana(campanaExistenteId);

  let numeroCampana;
  let nombreDeCampana;

  if (campanaExistenteId) {
    if (sinConexion) {
      throw new Error(
        'builder: la vista previa sin conexion no puede leer el nombre de una campana existente. ' +
          'Quita campanaExistenteId o corre con credenciales.',
      );
    }
    const existente = await new Campaign(campanaExistenteId).read([Campaign.Fields.name, Campaign.Fields.id]);
    nombreDeCampana = existente._data?.name || existente.name;
    // El prefijo sale del objetivo, no se da por hecho que sea C: una campana
    // regional existente se llama R<numero>.
    const prefijo = fichaObjetivo.prefijo;
    numeroCampana = Number(
      new RegExp(`^${prefijo}(\\d{1,5})`, 'i').exec(String(nombreDeCampana).trim())?.[1],
    );
    if (!Number.isInteger(numeroCampana)) {
      throw new Error(
        `builder: la campana existente se llama "${nombreDeCampana}" y no empieza por ${prefijo}<numero>, ` +
          `asi que no se puede derivar el ${prefijo}# para el nombre del conjunto (punto 5).`,
      );
    }
  } else {
    numeroCampana = consecutivoCampana.siguiente;

    // El objetivo decide la forma del nombre: las de sede llevan C y el codigo
    // de la sede; las regionales llevan R, la region y el tipo (punto 10).
    nombreDeCampana = esRegional
      ? nombreCampanaRegional({ numero: numeroCampana, region, tipo: tipoRegional || 'GEO', fecha })
      : nombreCampana({ numero: numeroCampana, sede: ficha.codigo, fecha });

    // Nombre escrito a mano en el panel. Reemplaza al generado, pero pasa por
    // la misma auditoria mas abajo: si no cumple el manual, no se crea nada.
    if (nombreCampanaManual) {
      const aMano = String(nombreCampanaManual).trim();
      if (aMano !== nombreDeCampana) {
        const prefijo = fichaObjetivo.prefijo;
        const numeroAMano = Number(new RegExp(`^${prefijo}(\\d{1,5})`, 'i').exec(aMano)?.[1]);

        if (Number.isInteger(numeroAMano)) {
          avisos.push(
            `El nombre de la campana se fijo a mano: "${aMano}" en vez de "${nombreDeCampana}". ` +
              `El consecutivo que se leyo de Ads Manager era ${prefijo}${numeroCampana}; ` +
              `se usara ${prefijo}${numeroAMano} tambien en el nombre del conjunto.`,
          );
          numeroCampana = numeroAMano;
        } else if (nombresForzados) {
          // Un nombre libre ("CAMPANA IPHONE VICTORIA SEPTIEMBRE") se respeta,
          // pero el consecutivo de los conjuntos sigue siendo el real: es lo
          // unico que mantiene la continuidad con lo que ya existe.
          avisos.push(
            `El nombre de la campana no sigue el manual: "${aMano}". Se crea asi porque se confirmo ` +
              `expresamente. Los conjuntos seguiran usando ${prefijo}${numeroCampana}, que es el ` +
              'consecutivo real leido de Ads Manager.',
          );
        } else {
          const e = new Error(
            `El nombre "${aMano}" no empieza por ${prefijo} seguido de un numero.\n` +
              '  Ese numero es el consecutivo de la campana, y hace falta porque tambien va en el\n' +
              '  nombre del conjunto (punto 5 del manual).\n' +
              `  Formato: ${NIVELES.campana.formato}\n  Ejemplo: ${NIVELES.campana.ejemplo}`,
          );
          e.amigable = true;
          e.titulo = 'Falta el consecutivo de la campana';
          e.tipo = 'nomenclatura';
          throw e;
        }

        nombreDeCampana = aMano;
      }
    }
  }

  /* --- Un plan por cada conjunto ---------------------------------------- */
  // Los CJTO# van correlativos desde el siguiente libre de la campana. Los
  // ADS# arrancan en 1 DENTRO de cada conjunto, que es lo que dice el punto 6.
  const baseConjunto = consecutivoConjunto.siguiente;

  const planesDeConjunto = entradas.map((entrada, indice) => {
    const numero = baseConjunto + indice;
    const segmentoConjunto = String(entrada.segmento || '').toUpperCase();
    const sufijo = String(entrada.sufijoConjunto ?? sufijoConjunto ?? '').toUpperCase();

    let nombre = esRegional
      ? nombreConjuntoRegional({
          numeroCampana,
          numeroConjunto: numero,
          segmentacion: entrada.segmentacionRegional || segmentoConjunto,
        })
      : nombreConjunto({
          numeroCampana,
          sede: ficha.codigo,
          numeroConjunto: numero,
          segmento: segmentoConjunto,
          sufijo,
        });

    // Cada conjunto puede traer su propio nombre escrito a mano.
    const aMano = String(entrada.nombreManual || (entradas.length === 1 ? nombreConjuntoManual : '') || '').trim();
    if (aMano && aMano !== nombre) {
      avisos.push(`El nombre del conjunto ${numero} se fijo a mano: "${aMano}" en vez de "${nombre}".`);
      nombre = aMano;
    }

    const modo = entrada.modoTexto || modoTexto;
    const archivos = chequeos[indice].archivos;

    const anunciosPlan = (entrada.anuncios || []).map((a, i) => {
      const n = i + 1;
      let nombreDelAnuncio = nombreAnuncio({
        numero: n,
        sede: ficha.codigo,
        formato: a.formato,
        referencia: a.referencia,
        // El talento es opcional y lo escribe la persona: puede ser "SOFIA" o
        // "SOFIA MEDELLIN". El sistema no lo completa solo.
        talento: a.talento || '',
        linea: a.linea || '',
      });

      const anuncioAMano = String(a.nombreManual || '').trim();
      if (anuncioAMano && anuncioAMano !== nombreDelAnuncio) {
        avisos.push(`El nombre del anuncio ${n} se fijo a mano: "${anuncioAMano}" en vez de "${nombreDelAnuncio}".`);
        nombreDelAnuncio = anuncioAMano;
      }

      return {
        numero: n,
        conjunto: indice,
        nombre: nombreDelAnuncio,
        nombreCreativo: `${nombreDelAnuncio} | CREATIVO`,
        formato: String(a.formato).toUpperCase(),
        referencia: a.referencia,
        producto: a.producto || a.referencia,
        archivo: archivos[i],
        copy: {
          textosPrincipales: a.textosPrincipales || [],
          titulos: a.titulos || [],
          descripciones: a.descripciones || [],
          mensajePrellenado: a.mensajePrellenado || '',
          saludoWhatsApp: a.saludoWhatsApp || '',
        },
        // Los copys que escribio el interprete se marcan, para que la interfaz
        // pueda pedir que se revisen en vez de presentarlos como definitivos.
        copyGenerado: Boolean(a.generado),
        // Contado: el precio que escribio una persona, o pendiente.
        precioContado: a.precioContado || null,
        faltaPrecio: esSoloContado(entrada.segmento) && !(Number(a.precioContado) > 0),
        comoSeEncontroElCreativo: a.comoSeEncontro || '',
        // El enlace va pelado: el numero de la sede se fija en el conjunto, en
        // promoted_object.whatsapp_phone_number, no en la URL.
        enlaceWhatsApp: ENLACE_WHATSAPP,
        modoTexto: modo,
      };
    });

    /* --- Targeting propio: cada conjunto puede segmentar distinto -------- */
    // La expansion se decide por conjunto. Por defecto todo apagado; si
    // alguien la enciende desde el panel, se respeta y se AVISA, pero nunca se
    // enciende sola.
    const expansionPedida = normalizarExpansion(entrada.expansion || {});
    const targeting = construirTargeting(sedeTargeting, {
      ...(entrada.segmentacion || segmentacion || {}),
      expansion: expansionPedida,
    });

    const expansion = auditarExpansion(targeting, expansionPedida);
    if (!expansion.ok) {
      throw new Error(
        `builder: el targeting del conjunto ${numero} no coincide con lo que se pidio:\n  - ` +
          expansion.problemas.join('\n  - '),
      );
    }

    for (const encendido of expansion.encendidos) {
      avisos.push(
        `CJTO${numero}: "${encendido.nombre}" quedo ENCENDIDO a proposito. ${encendido.siSeEnciende}`,
      );
    }

    /* --- Presupuesto en la unidad menor que exige la API ----------------- */
    const cop = Number(entrada.presupuestoDiarioCop);
    const unidadMenor = aUnidadMenor(cop, cuenta.factor);
    const minimoCuenta = Number(cuenta.min_daily_budget || 0);

    if (minimoCuenta > 0 && Number(unidadMenor) < minimoCuenta) {
      avisos.push(
        `El presupuesto del conjunto ${numero} esta por debajo del minimo de la cuenta ` +
          `(${minimoCuenta / cuenta.factor} ${cuenta.currency}). Meta lo rechazara.`,
      );
    }

    return {
      indice,
      numero,
      nombre,
      segmento: segmentoConjunto,
      sufijo,
      modoTexto: modo,
      anuncios: anunciosPlan,
      targeting,
      expansion,
      expansionPedida,
      presupuesto: {
        cop,
        unidadMenor,
        moneda: cuenta.currency,
        factor: cuenta.factor,
        minimoCuenta,
        tipo: entrada.tipoPresupuesto || tipoPresupuesto,
        dentroDelManual: chequeos[indice].presupuesto.ok,
      },
    };
  });

  if (cuenta.account_status !== 1) {
    avisos.push(`La cuenta publicitaria no esta activa (account_status=${cuenta.account_status}).`);
  }

  /* --- Auditoria de nombres: si uno no cumple, no se crea nada ----------- */
  const nivelCampana = esRegional ? 'campanaRegional' : 'campana';

  const auditorias = [
    { nivel: nivelCampana, nombre: nombreDeCampana, aplica: !campanaExistenteId },
    ...planesDeConjunto.flatMap((c) => [
      { nivel: esRegional ? 'conjuntoRegional' : 'conjunto', nombre: c.nombre, aplica: true },
      ...c.anuncios.map((a) => ({ nivel: 'anuncio', nombre: a.nombre, aplica: true })),
    ]),
  ];

  const problemasDeNombre = [];
  /** Lo mismo, pero en trozos, para que la pantalla pueda pintarlo bien. */
  const nombresFueraDeManual = [];

  for (const item of auditorias) {
    if (!item.aplica) continue;
    const r = auditarNombre(item.nombre, item.nivel);
    if (r.ok) continue;

    nombresFueraDeManual.push({
      nivel: item.nivel,
      que: NIVELES[item.nivel]?.que || item.nivel,
      nombre: item.nombre,
      problemas: r.problemas,
      formato: r.formato,
      ejemplo: r.ejemplo,
      ayuda: r.ayuda,
    });

    // El mensaje tiene que servirle a quien lo lee en pantalla: que esta mal,
    // con que compararlo y un ejemplo que funcione. Nunca la expresion regular.
    problemasDeNombre.push(
      `El nombre "${item.nombre}" no sirve como nombre de ${NIVELES[item.nivel]?.que || item.nivel}.\n` +
        r.problemas.map((p) => `  · ${p}`).join('\n') +
        `\n  Formato: ${r.formato}\n  Ejemplo: ${r.ejemplo}\n  ${r.ayuda}`,
    );
  }

  if (problemasDeNombre.length > 0) {
    // Si alguien confirmo expresamente que quiere esos nombres, se crean. El
    // manual es de Celred, no de Meta: incumplirlo es una decision de negocio
    // que puede tomar quien esta delante, no un error tecnico que deba
    // bloquear. Lo que no puede pasar es que ocurra en silencio.
    if (!nombresForzados) {
      const e = new Error(problemasDeNombre.join('\n\n'));
      e.amigable = true;
      e.titulo = 'Ese nombre no cumple el manual';
      e.tipo = 'nomenclatura';
      e.nombres = nombresFueraDeManual;
      throw e;
    }

    for (const n of nombresFueraDeManual) {
      avisos.push(
        `NOMENCLATURA: "${n.nombre}" no cumple el manual como ${n.que} (${n.problemas.join(' ')}) ` +
          'y se creo asi porque se confirmo expresamente.',
      );
    }
  }

  if (campanaExistenteId) {
    const r = auditarNombre(nombreDeCampana, 'campana');
    if (!r.ok) {
      avisos.push(
        `La campana existente "${nombreDeCampana}" no cumple el manual, pero no se renombra ` +
          '(punto 15: no se renombra nada de lo historico).',
      );
    }
  }

  const totalAnuncios = planesDeConjunto.reduce((n, c) => n + c.anuncios.length, 0);
  const totalDiario = planesDeConjunto.reduce((n, c) => n + c.presupuesto.cop, 0);

  return {
    sinConexion,
    sede: ficha,
    sedeTargeting: fichaTargeting,
    // `cuenta` son los datos que devolvio Meta; `cuentaSede` es de cual se trata
    // y por que, que es lo que hay que enseñar antes de crear nada.
    cuenta: { ...cuenta, ...cuentaSede },
    whatsapp,
    /** Pagina de Facebook donde esta vinculado el WhatsApp de la sede. */
    paginaId: paginaDeSede(ficha.codigo),
    /** Cuenta de Instagram con la que sale el anuncio ('' = la de la pagina). */
    instagramId: instagramDeSede(ficha.codigo),

    /** El objetivo elegido, con su explicacion. */
    objetivo: {
      codigo: fichaObjetivo.codigo,
      etiqueta: fichaObjetivo.etiqueta,
      queConsigue: fichaObjetivo.queConsigue,
      enAdsManager: fichaObjetivo.enAdsManager,
      prefijo: fichaObjetivo.prefijo,
      ambito: fichaObjetivo.ambito,
      usaWhatsApp: fichaObjetivo.usaWhatsApp,
      ensayado: fichaObjetivo.ensayado,
      notaDeEnsayo: fichaObjetivo.notaDeEnsayo,
      region: esRegional ? region : '',
      tipoRegional: esRegional ? tipoRegional || 'GEO' : '',
    },

    /** Los campos que se le mandan a Meta, separados por nivel. */
    meta: camposDeMeta(fichaObjetivo.codigo),

    /** Nombres que no cumplen el manual y se crearon igual, tras confirmar. */
    nombresFueraDeManual,

    estado: estadoPedido,
    fecha: fechaDDMMAA(fecha),
    campana: {
      crear: !campanaExistenteId,
      id: campanaExistenteId,
      numero: numeroCampana,
      nombre: nombreDeCampana,
      consecutivo: consecutivoCampana,
    },

    /** Siempre una lista, aunque haya un solo conjunto. */
    conjuntos: planesDeConjunto,
    consecutivoConjunto,

    /** Lo que se crea en total, para el resumen final. */
    totales: {
      conjuntos: planesDeConjunto.length,
      anuncios: totalAnuncios,
      objetos: (campanaExistenteId ? 0 : 1) + planesDeConjunto.length + totalAnuncios,
      presupuestoDiarioCop: totalDiario,
    },

    // Que mejoras automaticas se van a declarar apagadas. Va en el plan para
    // que la interfaz lo enseñe ANTES de aprobar, no despues de crear.
    mejoras: describirMejoras({ modoTexto, nivel: 'completo' }),
    modoTexto,

    /** Reparto de presupuesto entre conjuntos: campo de la CAMPANA. */
    compartirPresupuesto: Boolean(compartirPresupuesto),

    /** La ficha de cada interruptor, para que el panel la enseñe explicada. */
    interruptores: INTERRUPTORES_DE_EXPANSION,

    avisos,
  };
}

/* -------------------------------------------------------------------------- */
/*  Parametros que se envian a Meta                                           */
/* -------------------------------------------------------------------------- */
/**
 *  Viven aqui, exportados, por una razon concreta: el ensayo con
 *  `validate_only` (herramientas/validar-en-meta.js) tiene que mandar
 *  EXACTAMENTE los mismos parametros que la creacion real. Cuando cada uno
 *  armaba los suyos, el ensayo daba verde con un objeto que no era el que se
 *  iba a crear, que es peor que no ensayar.
 */

/** Parametros de la campana. Sin presupuesto: es ABO (manual, punto 9). */
export function paramsDeCampana(plan, estado = ESTADO_OBLIGATORIO) {
  return limpiar(
    forzarEstado(
      {
        [Campaign.Fields.name]: plan.campana.nombre,
        // El objetivo real de Meta sale de la ficha, no del codigo interno.
        [Campaign.Fields.objective]: plan.meta.objective,
        [Campaign.Fields.special_ad_categories]: [],
        [Campaign.Fields.buying_type]: 'AUCTION',

        // Meta OBLIGA a declararlo cuando el presupuesto no va en la campana
        // (codigo 100, subcodigo 4834011): sin este campo rechaza la campana.
        //
        // En `true`, los conjuntos se prestan hasta un 20% de su presupuesto
        // entre ellos "para optimizar el rendimiento general". Por defecto va
        // en `false`: el presupuesto de cada conjunto es el que se aprobo en
        // pantalla. Se puede cambiar desde el panel, a proposito.
        is_adset_budget_sharing_enabled: Boolean(plan.compartirPresupuesto),
      },
      estado,
    ),
  );
}

/**
 * Parametros de UN conjunto: presupuesto, destino WhatsApp y targeting.
 *
 * @param {object} plan
 * @param {string} campaignId
 * @param {string} [estado]
 * @param {number} [indice]  cual de los conjuntos del plan
 */
export function paramsDeConjunto(plan, campaignId, estado = ESTADO_OBLIGATORIO, indice = 0) {
  const conjunto = plan.conjuntos[indice];
  if (!conjunto) throw new Error(`builder: el plan no tiene un conjunto en la posicion ${indice}.`);

  return limpiar(
    forzarEstado(
      {
        [AdSet.Fields.name]: conjunto.nombre,
        [AdSet.Fields.campaign_id]: campaignId,
        [AdSet.Fields.daily_budget]: conjunto.presupuesto.unidadMenor,

        // Los tres salen del objetivo elegido, no estan cableados aqui.
        [AdSet.Fields.billing_event]: plan.meta.billing_event,
        [AdSet.Fields.optimization_goal]: plan.meta.optimization_goal,

        // Destino de los mensajes. Este unico campo es el que excluye a
        // Messenger y a Instagram Direct: las casillas de Ads Manager se
        // codifican en el propio valor. Marcar los tres daria
        // MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP; 'WHATSAPP' a secas
        // deja solo WhatsApp. En los objetivos que no son de mensajeria va
        // undefined y `limpiar()` lo quita.
        [AdSet.Fields.destination_type]: plan.meta.destination_type || undefined,

        [AdSet.Fields.bid_strategy]: 'LOWEST_COST_WITHOUT_CAP',

        // AQUI vive la linea de la sede. No en la URL del creativo: Meta
        // resuelve el numero desde aqui y desde el WhatsApp vinculado a la
        // Pagina, e ignora cualquier ?phone= que traiga el enlace.
        [AdSet.Fields.promoted_object]: plan.whatsapp.telefono
          ? {
              page_id: plan.paginaId || PAGE_ID,
              whatsapp_phone_number: normalizarNumeroWhatsApp(plan.whatsapp.telefono),
            }
          : undefined,

        [AdSet.Fields.targeting]: sanitizarTargeting(conjunto.targeting, conjunto.expansionPedida),

        // Arranque una hora en el futuro: evita que Meta rechace la fecha por
        // estar en el pasado si la revision se demora.
        [AdSet.Fields.start_time]: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      estado,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/*  FASE 2 (escritura): crear la estructura                                   */
/* -------------------------------------------------------------------------- */

/**
 * Crea Campaign -> AdSet -> (AdCreative -> Ad) x N.
 * Solo debe llamarse DESPUES de la confirmacion humana.
 *
 * Si algo falla a mitad, devuelve lo que alcanzo a crear en vez de lanzar,
 * para que la consola pueda decir exactamente que quedo colgando en Meta.
 *
 * @param {object} plan resultado de planificarEstructura()
 * @param {object} [opciones]
 * @param {(paso:string, detalle?:any)=>void} [opciones.onPaso]
 */
export async function crearEstructuraCampana(plan, opciones = {}) {
  const log = opciones.onPaso || (() => {});
  const estado = plan.estado || ESTADO_OBLIGATORIO;

  // Un plan hecho sin conexion lleva consecutivos inventados: crear con el
  // pisaria numeros que ya existen en Ads Manager.
  if (plan.sinConexion) {
    throw new Error(
      'builder: este plan se armo en modo vista previa sin conexion y no se puede crear. ' +
        'Pon las credenciales en el .env y vuelve a correr sin --sin-meta.',
    );
  }

  exigirCredenciales();

  // Contado sin precio: no se crea nada. Un anuncio de contado sin precio es
  // justo lo que el cliente prohibio.
  const sinPrecio = plan.conjuntos.flatMap((c) => c.anuncios.filter((a) => a.faltaPrecio).map((a) => a.nombre));
  if (sinPrecio.length) {
    const e = new Error(
      `Falta el precio de contado de: ${sinPrecio.join(', ')}. Escribelo en el campo "Precio de contado" ` +
        '(etapa 3 del panel) y vuelve a enviar. No se creo nada.',
    );
    e.amigable = true;
    e.titulo = 'Falta el precio de contado';
    throw e;
  }

  const creados = {
    campaignId: plan.campana.id || null,
    campaignCreada: false,
    /** Un registro por conjunto, en el mismo orden que el plan. */
    conjuntos: [],
    /** Todos los anuncios de todos los conjuntos, aplanados. */
    anuncios: [],
    estado,
    parcial: false,
    error: null,
  };

  try {
    /* --------------- 1. PIEZAS Y CREATIVOS, ANTES QUE NADA -------------- */
    // El creativo es lo que Meta rechaza mas a menudo (formato, mejoras, app
    // en modo de desarrollo) y el validate_only del ensayo no lo cubre. Un
    // creativo suelto no aparece en Ads Manager ni gasta, asi que se crea
    // primero: si falla, no queda ninguna campana ni conjunto a medias.
    const preparados = new Map();

    for (const conjunto of plan.conjuntos) {
      const lista = [];
      preparados.set(conjunto.indice, lista);

      for (const anuncio of conjunto.anuncios) {
        const registro = {
          numero: anuncio.numero,
          conjunto: conjunto.indice,
          conjuntoNombre: conjunto.nombre,
          nombre: anuncio.nombre,
          creativeId: null,
          adId: null,
          modoTexto: null,
          escalon: null,
          mejorasSinDeclarar: false,
          rechazos: [],
        };
        creados.anuncios.push(registro);

        log('asset:inicio', { anuncio: anuncio.nombre, archivo: anuncio.archivo.nombre });
        const asset = await subirCreativoLocal(anuncio.archivo.ruta, {
          idCuenta: plan.cuenta.id,
          onPaso: (paso, detalle) => log(`asset:${paso}`, { anuncio: anuncio.nombre, ...detalle }),
        });
        log('asset:ok', { anuncio: anuncio.nombre, id: asset.hash || asset.videoId });

        log('creative:inicio', anuncio.nombreCreativo);
        const creative = await construirAdCreative(
          {
            nombre: anuncio.nombreCreativo,
            textosPrincipales: anuncio.copy.textosPrincipales,
            titulos: anuncio.copy.titulos,
            descripciones: anuncio.copy.descripciones,
            mensajePrellenado: anuncio.copy.mensajePrellenado,
            saludoWhatsApp: anuncio.copy.saludoWhatsApp,
            asset,
            modoTexto: anuncio.modoTexto,
            idCuenta: plan.cuenta.id,
            paginaId: plan.paginaId,
            instagramId: plan.instagramId,
          },
          { onPaso: (paso, detalle) => log(paso, { anuncio: anuncio.nombre, ...detalle }) },
        );
        registro.creativeId = creative.id;
        registro.modoTexto = creative.modoTexto;
        registro.escalon = creative.escalon;
        registro.mejorasSinDeclarar = creative.mejorasSinDeclarar;
        registro.rechazos = creative.rechazos;
        log('creative:ok', {
          anuncio: anuncio.nombre,
          id: creative.id,
          modoTexto: creative.modoTexto,
          escalon: creative.escalon,
        });
        if (creative.mejorasSinDeclarar) {
          log('creative:sin-declarar', {
            anuncio: anuncio.nombre,
            motivo:
              'Meta rechazo la declaracion de mejoras apagadas, asi que el creativo se creo sin ella. ' +
              'Los 5 textos si quedaron. Confirma en Ads Manager que las mejoras automaticas estan en off.',
          });
        }

        lista.push({ anuncio, registro });
      }
    }

    /* ---------------------- 2. CAMPANA ---------------------------------- */
    if (plan.campana.crear) {
      log('campana:inicio', plan.campana.nombre);

      const campana = await adAccountDe(plan.cuenta.id).createCampaign(
        [Campaign.Fields.id, Campaign.Fields.name, Campaign.Fields.status],
        paramsDeCampana(plan, estado),
      );
      creados.campaignId = campana.id || campana._data?.id;
      creados.campaignCreada = true;
      creados.parcial = true;
      log('campana:ok', creados.campaignId);
    } else {
      log('campana:reutilizada', creados.campaignId);
    }

    /* -------------- 3 y 4. CONJUNTOS Y SUS ANUNCIOS --------------------- */
    // Conjunto a conjunto, y dentro de cada uno anuncio a anuncio, en orden.
    // Asi CJTO1 queda antes que CJTO2 y ADS1 antes que ADS2, y si algo falla
    // se puede decir exactamente en cual se quedo.
    for (const conjunto of plan.conjuntos) {
      log('adset:inicio', conjunto.nombre);

      const adSet = await adAccountDe(plan.cuenta.id).createAdSet(
        [AdSet.Fields.id, AdSet.Fields.name, AdSet.Fields.status],
        paramsDeConjunto(plan, creados.campaignId, estado, conjunto.indice),
      );

      const registroConjunto = {
        indice: conjunto.indice,
        numero: conjunto.numero,
        nombre: conjunto.nombre,
        segmento: conjunto.segmento,
        adSetId: adSet.id || adSet._data?.id,
        presupuestoCop: conjunto.presupuesto.cop,
        anuncios: [],
      };
      creados.conjuntos.push(registroConjunto);
      creados.parcial = true;
      log('adset:ok', { id: registroConjunto.adSetId, nombre: conjunto.nombre });

      for (const { anuncio, registro } of preparados.get(conjunto.indice)) {
        registroConjunto.anuncios.push(registro);

        log('ad:inicio', anuncio.nombre);
        const paramsAd = forzarEstado(
          {
            [Ad.Fields.name]: anuncio.nombre,
            [Ad.Fields.adset_id]: registroConjunto.adSetId,
            [Ad.Fields.creative]: { creative_id: registro.creativeId },
          },
          estado,
        );

        const creado = await adAccountDe(plan.cuenta.id).createAd(
          [Ad.Fields.id, Ad.Fields.name, Ad.Fields.status],
          limpiar(paramsAd),
        );
        registro.adId = creado.id || creado._data?.id;
        log('ad:ok', { anuncio: anuncio.nombre, id: registro.adId });
      }
    }

    creados.parcial = false;
    return creados;
  } catch (error) {
    creados.error = error;
    return creados;
  }
}

/* -------------------------------------------------------------------------- */
/*  FASE 3 (solo lectura): verificar lo que quedo creado                      */
/* -------------------------------------------------------------------------- */

/**
 * Relee los objetos en Meta y confirma que quedaron en el estado aprobado,
 * con el presupuesto, el destino y la expansion que se pidieron.
 */
export async function verificarEstructura(creados, plan) {
  const esperado = creados.estado || ESTADO_OBLIGATORIO;
  const checks = [];

  if (creados.campaignId) {
    const c = await new Campaign(creados.campaignId).read([
      Campaign.Fields.name,
      Campaign.Fields.status,
      Campaign.Fields.objective,
      Campaign.Fields.daily_budget,
      'is_adset_budget_sharing_enabled',
    ]);
    const d = c._data || c;
    const problemas = [];
    if (d.status !== esperado) problemas.push(`estado ${d.status}, se esperaba ${esperado}`);
    if (d.daily_budget) problemas.push('la campana quedo con presupuesto propio; el manual exige ABO (punto 9)');
    const compartirPedido = Boolean(plan?.compartirPresupuesto);
    if (Boolean(d.is_adset_budget_sharing_enabled) !== compartirPedido) {
      problemas.push(
        `el reparto de presupuesto entre conjuntos quedo en ${d.is_adset_budget_sharing_enabled} ` +
          `y se pidio ${compartirPedido}`,
      );
    }
    checks.push({ tipo: 'Campana', id: creados.campaignId, nombre: d.name, estado: d.status, problemas });
  }

  for (const registroConjunto of creados.conjuntos || []) {
    const delPlan = plan?.conjuntos?.find((c) => c.indice === registroConjunto.indice);
    const a = await new AdSet(registroConjunto.adSetId).read([
      AdSet.Fields.name,
      AdSet.Fields.status,
      AdSet.Fields.daily_budget,
      AdSet.Fields.destination_type,
      AdSet.Fields.optimization_goal,
      AdSet.Fields.promoted_object,
      AdSet.Fields.targeting,
    ]);
    const d = a._data || a;
    const problemas = [];

    if (d.status !== esperado) problemas.push(`estado ${d.status}, se esperaba ${esperado}`);
    if (d.destination_type !== 'WHATSAPP') {
      problemas.push(`destino ${d.destination_type}, se esperaba WHATSAPP`);
    }
    if (delPlan && String(d.daily_budget) !== String(delPlan.presupuesto.unidadMenor)) {
      problemas.push(`presupuesto ${d.daily_budget}, se esperaba ${delPlan.presupuesto.unidadMenor}`);
    }

    // Se relee el numero que quedo guardado en el conjunto, para mostrarlo.
    // No es una verificacion contra la Pagina: es leer lo que acabamos de
    // escribir, que es el numero que salio de lineas.xlsx.
    const numeroEnMeta = String(d.promoted_object?.whatsapp_phone_number || '').replace(/\D/g, '');
    if (plan && numeroEnMeta) {
      const numeroPedido = String(plan.whatsapp.telefono).replace(/\D/g, '');
      if (numeroEnMeta !== numeroPedido) {
        problemas.push(`el conjunto quedo con +${numeroEnMeta} y lineas.xlsx dice +${numeroPedido}`);
      }
    }

    // Meta devuelve el targeting ya resuelto: aqui se ve si encendio la
    // expansion por su cuenta pese a haberla mandado apagada.
    const t = d.targeting || {};
    const notas = [];

    if (Number(t.targeting_automation?.advantage_audience) === 1) {
      problemas.push('Meta dejo advantage_audience encendido');
    }
    if (t.targeting_relaxation_types?.lookalike === 1 || t.targeting_relaxation_types?.custom_audience === 1) {
      problemas.push('Meta dejo la relajacion de publicos encendida');
    }

    // Ya no es un problema que se pueda corregir: Meta elimino el interruptor.
    // Se informa para que quede claro en pantalla que ese campo no lo manda el
    // sistema, lo pone Meta.
    if (t.targeting_optimization) {
      notas.push(
        `Meta puso targeting_optimization="${t.targeting_optimization}" por su cuenta; elimino ese ` +
          'interruptor de la API. Como el conjunto no lleva intereses, no hay desde donde ampliar.',
      );
    }
    if (Array.isArray(t.flexible_spec) && t.flexible_spec.length > 0) {
      problemas.push('el conjunto quedo con intereses (flexible_spec); se mando sin ninguno');
    }

    const geo = t.geo_locations || {};
    const ciudad = geo.cities && (Array.isArray(geo.cities) ? geo.cities[0] : geo.cities['0']);
    checks.push({
      tipo: creados.conjuntos.length === 1 ? 'Conjunto' : `Conjunto ${registroConjunto.numero}`,
      id: registroConjunto.adSetId,
      nombre: d.name,
      estado: d.status,
      destino: numeroEnMeta ? `${d.destination_type} → +${numeroEnMeta}` : d.destination_type,
      radio: ciudad ? `${ciudad.name || ''} + ${ciudad.radius} ${ciudad.distance_unit || 'km'}` : '',
      notas,
      problemas,
    });
  }

  for (const anuncio of creados.anuncios || []) {
    if (!anuncio.adId) continue;
    const ad = await new Ad(anuncio.adId).read([Ad.Fields.name, Ad.Fields.status]);
    const d = ad._data || ad;
    const problemas = [];
    if (d.status !== esperado) problemas.push(`estado ${d.status}, se esperaba ${esperado}`);

    // Lo que de verdad prueba que los textos llegaron y que las mejoras estan
    // apagadas es releer el creativo. Lo enviado es una intencion; esto es el
    // resultado.
    let textos = null;
    let mejoras = null;

    if (anuncio.creativeId) {
      const delPlan = plan?.conjuntos
        ?.find((c) => c.indice === anuncio.conjunto)
        ?.anuncios.find((a) => a.numero === anuncio.numero);
      try {
        const r = await verificarCreativo(anuncio.creativeId, {
          textosPrincipales: delPlan?.copy.textosPrincipales.length || 0,
          titulos: delPlan?.copy.titulos.length || 0,
          descripciones: delPlan?.copy.descripciones.length || 0,
        });
        textos = r.textos;
        mejoras = { encendidas: r.encendidas, apagadas: Object.keys(r.mejoras).length };
        problemas.push(...r.problemas);
      } catch (error) {
        problemas.push(`no se pudo releer el creativo: ${error.message}`);
      }
    }

    checks.push({
      tipo:
        (creados.conjuntos || []).length > 1
          ? `CJTO${anuncio.conjunto + 1} · Anuncio ${anuncio.numero}`
          : `Anuncio ${anuncio.numero}`,
      id: anuncio.adId,
      nombre: d.name,
      estado: d.status,
      textos,
      mejoras,
      problemas,
    });
  }

  return checks;
}

/** Alias historico: antes se llamaba asi y solo miraba el PAUSED. */
export const verificarEstadoPausado = verificarEstructura;

export default {
  planificarEstructura,
  crearEstructuraCampana,
  verificarEstructura,
  verificarEstadoPausado,
  paramsDeCampana,
  paramsDeConjunto,
};
