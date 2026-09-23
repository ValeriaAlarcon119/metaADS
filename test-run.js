#!/usr/bin/env node
/**
 * ============================================================================
 *  test-run.js — CREACION INTERACTIVA CON APROBACION HUMANA
 * ============================================================================
 *  Ejecutar:
 *    node test-run.js                         la campana, si solo hay una
 *    node test-run.js neiva-c4-and-cred       una campana concreta
 *    node test-run.js <campana> --sin-meta    resumen sin tocar Meta ni token
 *    node test-run.js <campana> --vista-previa  consulta Meta pero no crea
 *    node test-run.js --lista                 que campanas hay definidas
 *
 *  Que hace, en este orden:
 *   1. Carga la campana desde campanas/ y la valida entera sin red.
 *   2. Lee la linea de WhatsApp de la sede desde lineas.xlsx.
 *   3. Lee los consecutivos reales desde Meta (solo lectura) y arma los
 *      nombres segun el Manual de nomenclatura Celred v1.2.
 *   4. Imprime el resumen completo: nombres, presupuesto, ubicacion, destino
 *      de WhatsApp, expansion de publico y los copys de cada anuncio.
 *   5. SE DETIENE y pide confirmacion escribiendo S o N.
 *   6. Solo si escribes S, crea la campana, el conjunto y los anuncios,
 *      TODO EN BORRADOR (PAUSED). No se publica nada.
 *   7. Relee todo en Meta y confirma estado, presupuesto, destino y expansion.
 *
 *  Si escribes N, o cualquier otra tecla, se aborta SIN tocar la API.
 * ============================================================================
 */

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { planificarEstructura, crearEstructuraCampana, verificarEstructura } from './src/builder.js';
import { describirTargeting } from './src/targeting.js';
import { formatearMoneda, PAGE_ID, credencialesFaltantes } from './src/config.js';
import { SEGMENTOS } from './src/nomenclatura.js';
import { listarCampanas, cargarCampana, LIMITES_COPY } from './src/campanas.js';

/* ========================================================================== */
/*  Argumentos de la linea de comandos                                        */
/* ========================================================================== */

function leerArgumentos(argv) {
  const banderas = new Set(argv.filter((a) => a.startsWith('--')));
  const sueltos = argv.filter((a) => !a.startsWith('-'));

  return {
    campana: sueltos[0] || '',
    lista: banderas.has('--lista') || banderas.has('--list'),
    sinMeta: banderas.has('--sin-meta'),
    vistaPrevia: banderas.has('--vista-previa'),
    enVivo: banderas.has('--publicar-en-vivo'),
    ayuda: banderas.has('--ayuda') || banderas.has('--help'),
    desconocidas: [...banderas].filter(
      (b) =>
        ![
          '--lista',
          '--list',
          '--sin-meta',
          '--vista-previa',
          '--publicar-en-vivo',
          '--ayuda',
          '--help',
        ].includes(b),
    ),
  };
}

/* ========================================================================== */
/*  Utilidades de consola                                                     */
/* ========================================================================== */

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  rojo: '\x1b[31m',
  verde: '\x1b[32m',
  amarillo: '\x1b[33m',
  cyan: '\x1b[36m',
  invRojo: '\x1b[41m\x1b[97m\x1b[1m',
  invVerde: '\x1b[42m\x1b[30m\x1b[1m',
};

const ANCHO = 88;
const COL = 24; // ancho de la columna de etiquetas

/** Pregunta en consola. Funciona en TTY y con stdin redirigido. */
async function preguntar(texto) {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(texto);
  } finally {
    rl.close();
  }
}

/** Longitud visible, ignorando codigos ANSI. */
const largoVisible = (t) => String(t).replace(/\x1b\[[0-9;]*m/g, '').length;

const linea = (izq, med, der) => izq + med.repeat(ANCHO - 2) + der;

function fila(texto = '') {
  const relleno = Math.max(0, ANCHO - 4 - largoVisible(texto));
  return `│ ${texto}${' '.repeat(relleno)} │`;
}

function filaEtiqueta(etiqueta, valor, color = C.bold) {
  const e = String(etiqueta).padEnd(COL, ' ');
  return fila(`${C.dim}${e}${C.reset}${color}${valor}${C.reset}`);
}

/** Linea de detalle bajo una etiqueta: sangrada, atenuada y recortada al marco. */
function filaDetalle(texto) {
  return fila(`${C.dim}${' '.repeat(COL)}${recortar(texto, ANCHO - COL - 4)}${C.reset}`);
}

function encabezado(titulo) {
  const relleno = Math.max(0, ANCHO - 4 - largoVisible(titulo));
  return `│ ${C.bold}${C.cyan}${titulo}${C.reset}${' '.repeat(relleno)} │`;
}

function recortar(texto, max) {
  const t = String(texto);
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** Texto entre comillas, partido en varias lineas, con las comillas solo en los extremos. */
function filasCitadas(texto, estilo = C.bold) {
  const trozos = partirTexto(texto, ANCHO - 10);
  return trozos.map((l, i) => {
    const abre = i === 0 ? '"' : ' ';
    const cierra = i === trozos.length - 1 ? '"' : '';
    return fila(`  ${estilo}${abre}${l}${cierra}${C.reset}`);
  });
}

/** Parte un texto en lineas de ancho maximo, sin cortar palabras. */
function partirTexto(texto, ancho) {
  const palabras = String(texto).split(/\s+/);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    if ((`${actual} ${p}`).trim().length > ancho) {
      if (actual) lineas.push(actual.trim());
      actual = p;
    } else {
      actual = `${actual} ${p}`;
    }
  }
  if (actual.trim()) lineas.push(actual.trim());
  return lineas;
}

/* ========================================================================== */
/*  Vista previa                                                              */
/* ========================================================================== */

function imprimirVistaPrevia(plan) {
  const enVivo = plan.estado === 'ACTIVE';
  const out = [];

  out.push('');
  out.push(linea('┌', '─', '┐'));
  out.push(encabezado('CELRED ADS MANAGER — VISTA PREVIA ANTES DE CREAR EN META'));
  out.push(linea('├', '─', '┤'));

  /* ---------------------------- CUENTA ---------------------------------- */
  out.push(encabezado('CUENTA Y SEDE'));
  out.push(filaEtiqueta('Cuenta publicitaria', `${plan.cuenta.etiqueta} · ${plan.cuenta.id}`));
  out.push(filaDetalle(`${plan.cuenta.name || '—'} · elegida por ${plan.cuenta.origen}`));
  out.push(filaEtiqueta('Moneda / huso', `${plan.cuenta.currency} · ${plan.cuenta.timezone_name || '—'}`));
  out.push(filaEtiqueta('Pagina de Facebook', PAGE_ID || `${C.rojo}(FALTA META_PAGE_ID)`));
  out.push(filaEtiqueta('Sede', `${plan.sede.codigo} · ${plan.sede.sede} (${plan.sede.ciudad}) · ${plan.sede.cuenta}`));
  out.push(filaEtiqueta('Distintivo', `${plan.sede.dist}  ${C.dim}(va en conjunto y anuncios)`));
  out.push(linea('├', '─', '┤'));

  /* -------------------------- WHATSAPP ---------------------------------- */
  out.push(encabezado('DESTINO DE LOS MENSAJES'));
  out.push(filaEtiqueta('Destino', 'SOLO WHATSAPP', C.bold + C.verde));
  out.push(filaDetalle('destination_type=WHATSAPP · CTA=WHATSAPP_MESSAGE'));
  out.push(filaEtiqueta('Messenger', 'DESACTIVADO', C.bold + C.verde));
  out.push(filaEtiqueta('Instagram Direct', 'DESACTIVADO', C.bold + C.verde));
  out.push(filaEtiqueta('Numero de WhatsApp', `+${plan.whatsapp.telefono}`, C.bold + C.verde));
  out.push(filaDetalle(`origen: ${plan.whatsapp.origen}`));
  out.push(filaDetalle('se fija en promoted_object.whatsapp_phone_number del conjunto'));
  if (plan.whatsapp.registro) {
    const r = plan.whatsapp.registro;
    out.push(filaDetalle(`tienda "${r.tienda}" · lider ${r.lider || '—'}`));
  }
  if (plan.whatsapp.alternativas.length > 0) {
    out.push(
      filaDetalle(`otras lineas de la sede: ${plan.whatsapp.alternativas.map((a) => a.telefono).join(', ')}`),
    );
  }
  out.push(linea('├', '─', '┤'));

  /* ------------------------- OBJETOS A CREAR ---------------------------- */
  out.push(encabezado('OBJETOS QUE SE VAN A CREAR — NOMENCLATURA v1.2'));

  const etiquetaCampana = plan.campana.crear ? '1. Campana (nueva)' : '1. Campana (existente)';
  out.push(filaEtiqueta(etiquetaCampana, plan.campana.nombre, C.bold + C.verde));
  out.push(filaDetalle(`objetivo: ${plan.objetivo.etiqueta} (${plan.meta.objective})`));
  out.push(filaDetalle(`${plan.objetivo.enAdsManager}`));
  if (plan.campana.consecutivo) {
    const c = plan.campana.consecutivo;
    out.push(
      filaDetalle(
        `consecutivo de ${plan.sede.codigo}: C${c.maximo} → C${c.siguiente} ` +
          `(${c.coincidencias.length} previas de ${c.revisados} campanas)`,
      ),
    );
  }

  let orden = 2;
  for (const c of plan.conjuntos) {
    out.push(filaEtiqueta(`${orden}. Conjunto ${c.numero}`, c.nombre, C.bold + C.verde));
    out.push(
      filaDetalle(
        `formato: C# | ${plan.sede.dist} | CJTO# | SEGMENTO${c.sufijo ? ` | ${c.sufijo}` : ''}`,
      ),
    );
    out.push(filaDetalle(`segmento ${c.segmento}: ${SEGMENTOS[c.segmento] || '—'}`));
    orden += 1;

    for (const a of c.anuncios) {
      out.push(filaEtiqueta(`${orden}. Anuncio ${a.numero}`, a.nombre, C.bold + C.verde));
      out.push(
        filaDetalle(
          `${a.formato === 'IMG' ? 'imagen' : 'video'} · ` +
            `${a.archivo.nombre} · ${a.archivo.megas} MB` +
            `${a.archivo.porPartes ? ' · por partes' : ''}`,
        ),
      );
      orden += 1;
    }
  }
  out.push(linea('├', '─', '┤'));

  /* ------------------- PRESUPUESTO Y SEGMENTACION ----------------------- */
  for (const c of plan.conjuntos) {
    const desc = describirTargeting(plan.sedeTargeting.key, c.targeting);

    out.push(
      encabezado(
        plan.conjuntos.length === 1
          ? 'PRESUPUESTO Y SEGMENTACION — ABO, EN EL CONJUNTO (punto 9)'
          : `CJTO${c.numero} · ${c.segmento} — PRESUPUESTO Y SEGMENTACION`,
      ),
    );
    out.push(
      filaEtiqueta(
        'Presupuesto diario',
        `${formatearMoneda(c.presupuesto.unidadMenor, c.presupuesto.moneda, c.presupuesto.factor)}` +
          `  ${C.dim}(a la API: ${c.presupuesto.unidadMenor})${C.reset}`,
        c.presupuesto.dentroDelManual ? C.bold + C.verde : C.bold + C.amarillo,
      ),
    );
    out.push(filaDetalle('rango del manual, campana de sede: $15.000 a $60.000 COP/dia'));
    out.push(filaEtiqueta('Geolocalizacion', desc.ubicacion, C.bold + C.verde));
    out.push(filaEtiqueta('Tipo de ubicacion', desc.tipoUbicacion));
    out.push(filaEtiqueta('Edades', desc.edades));
    out.push(filaEtiqueta('Generos', desc.generos));
    out.push(filaEtiqueta('Plataformas', desc.plataformas));
    out.push(filaEtiqueta('Dispositivos', desc.dispositivos));
    for (const p of desc.posiciones) out.push(filaDetalle(p));
    out.push(
      filaEtiqueta(
        'Expansion de publico',
        c.expansion.ok ? 'DESACTIVADA' : 'REVISAR',
        c.expansion.ok ? C.bold + C.verde : C.bold + C.rojo,
      ),
    );
    out.push(linea('├', '─', '┤'));
  }

  if (plan.conjuntos.length > 1) {
    out.push(encabezado('TOTAL'));
    out.push(
      filaEtiqueta(
        'Suma diaria',
        `${plan.totales.presupuestoDiarioCop.toLocaleString('es-CO')} COP/dia`,
        C.bold + C.amarillo,
      ),
    );
    out.push(filaDetalle(`${plan.totales.conjuntos} conjuntos · ${plan.totales.anuncios} anuncios`));
  }
  out.push(filaEtiqueta('En la campana', 'SIN presupuesto propio (ABO)', C.bold + C.verde));
  out.push(filaDetalle('advantage_audience=0 (la casilla de "llegar a mas personas")'));
  out.push(filaDetalle('relaxation lookalike=0 · custom_audience=0'));
  out.push(filaDetalle('edad, genero y geo bloqueados (individual_setting)'));
  out.push(filaDetalle('sin intereses: flexible_spec no se envia'));
  out.push(filaEtiqueta('Reparto de presupuesto', 'NO se comparte entre conjuntos', C.bold + C.verde));
  out.push(filaDetalle('is_adset_budget_sharing_enabled=false'));
  out.push(
    filaEtiqueta('Orientacion detallada', 'META YA NO DEJA APAGARLA', C.bold + C.amarillo),
  );
  out.push(filaDetalle('elimino targeting_optimization de la API. Amplia mas alla de'));
  out.push(filaDetalle('los intereses elegidos, y aqui no se elige ninguno: el publico'));
  out.push(filaDetalle('es geografia + edad, asi que no hay desde donde ampliar.'));
  out.push(linea('├', '─', '┤'));

  /* -------------------- MEJORAS AUTOMATICAS ------------------------------ */
  out.push(encabezado('MEJORAS AUTOMATICAS DE META'));
  out.push(filaEtiqueta('Apagadas (OPT_OUT)', `${plan.mejoras.total} funciones`, C.bold + C.verde));
  for (const trozo of partirTexto(plan.mejoras.apagadas.join(', '), ANCHO - COL - 4)) {
    out.push(filaDetalle(trozo));
  }
  out.push(
    filaEtiqueta(
      'Rotacion de texto',
      plan.mejoras.rotacionDeTexto,
      plan.mejoras.rotacionDeTexto === 'OPT_IN' ? C.bold + C.cyan : C.bold + C.verde,
    ),
  );
  if (plan.mejoras.rotacionDeTexto === 'OPT_IN') {
    out.push(filaDetalle('text_optimizations: unica inscripcion activa. No genera ni'));
    out.push(filaDetalle('reescribe texto; es lo que sirve las 5 variantes escritas a mano.'));
  }
  out.push(linea('└', '─', '┘'));

  console.log(out.join('\n'));

  /* --------------------------- COPYS ------------------------------------ */
  for (const c of plan.conjuntos) {
    for (const anuncio of c.anuncios) imprimirCopyDeAnuncio(anuncio, plan);
  }

  /* --------------------------- CIERRE ----------------------------------- */
  const cierre = [];
  cierre.push(linea('┌', '─', '┐'));
  if (enVivo) {
    cierre.push(fila(`${C.invRojo}  ESTADO AL CREAR: ACTIVE (EN VIVO)  ${C.reset}`));
    cierre.push(
      fila(
        `${C.rojo}  Los anuncios entran a revision de Meta y empiezan a gastar ` +
          `${plan.totales.presupuestoDiarioCop.toLocaleString('es-CO')} COP/dia.${C.reset}`,
      ),
    );
  } else {
    cierre.push(fila(`${C.invVerde}  ESTADO AL CREAR: PAUSED (BORRADOR)  ${C.reset}`));
    cierre.push(fila(`${C.dim}  Se crea todo en Ads Manager pero no entrega impresiones ni gasta presupuesto.${C.reset}`));
    cierre.push(fila(`${C.dim}  Lo revisas en Ads Manager y le das play tu mismo.${C.reset}`));
  }
  cierre.push(linea('└', '─', '┘'));
  console.log(cierre.join('\n'));

  if (plan.avisos.length > 0) {
    console.log(`\n${C.amarillo}${C.bold}  AVISOS:${C.reset}`);
    plan.avisos.forEach((a) => {
      partirTexto(a, ANCHO - 8).forEach((l, i) => {
        console.log(`${C.amarillo}   ${i === 0 ? '•' : ' '} ${l}${C.reset}`);
      });
    });
  }
}

function imprimirCopyDeAnuncio(anuncio, plan) {
  const out = [];
  out.push('');
  out.push(linea('┌', '─', '┐'));
  out.push(encabezado(`CONTENIDO — ${anuncio.nombre}`));
  out.push(linea('├', '─', '┤'));
  out.push(filaEtiqueta('Producto', anuncio.producto));
  out.push(filaEtiqueta('Creativo', `${anuncio.archivo.nombre} (${anuncio.archivo.megas} MB)`));
  out.push(filaDetalle(anuncio.archivo.ruta));
  out.push(
    filaEtiqueta(
      'Opciones de texto',
      anuncio.modoTexto === 'multiple' ? 'las 5 variantes en un solo anuncio' : 'solo la primera de cada lista',
      anuncio.modoTexto === 'multiple' ? C.bold + C.verde : C.bold + C.amarillo,
    ),
  );
  if (anuncio.modoTexto === 'multiple') {
    out.push(filaDetalle('ningun reintento baja el numero de textos: si Meta las'));
    out.push(filaDetalle('rechaza todas, el anuncio no se crea y se dice por que.'));
  }
  out.push(linea('├', '─', '┤'));

  const bloques = [
    ['TEXTOS PRINCIPALES', anuncio.copy.textosPrincipales, LIMITES_COPY.textosPrincipales],
    ['TITULOS', anuncio.copy.titulos, LIMITES_COPY.titulos],
    ['DESCRIPCIONES', anuncio.copy.descripciones, LIMITES_COPY.descripciones],
  ];

  for (const [titulo, lista, limite] of bloques) {
    out.push(encabezado(`${titulo}  (${lista.length}/5 · limite ${limite} caracteres)`));
    lista.forEach((texto, i) => {
      const n = texto.length;
      const excede = n > limite;
      const marca = excede ? `${C.rojo}${n}!${C.reset}` : `${C.dim}${n}${C.reset}`;
      const lineas = partirTexto(texto, ANCHO - 14);
      lineas.forEach((l, j) => {
        if (j === 0) out.push(fila(`  ${C.bold}${i + 1}.${C.reset} ${l}`));
        else out.push(fila(`     ${l}`));
      });
      out.push(fila(`     ${marca}${C.dim} caracteres${excede ? ` — se pasa por ${n - limite}` : ''}${C.reset}`));
    });
    out.push(linea('├', '─', '┤'));
  }

  out.push(encabezado('MENSAJE PRELLENADO DE WHATSAPP'));
  out.push(fila(`${C.dim}  Lo que el cliente vera ya escrito al abrir el chat:${C.reset}`));
  out.push(...filasCitadas(anuncio.copy.mensajePrellenado, C.bold));
  if (anuncio.copy.saludoWhatsApp) {
    out.push(fila(''));
    out.push(fila(`${C.dim}  Saludo de la pantalla previa:${C.reset}`));
    out.push(...filasCitadas(anuncio.copy.saludoWhatsApp, C.dim));
  }
  out.push(fila(''));
  out.push(fila(`${C.dim}  Va en page_welcome_message.autofill_message, no en la URL.${C.reset}`));
  out.push(fila(`${C.dim}  Enlace del anuncio: ${recortar(anuncio.enlaceWhatsApp, ANCHO - 26)}${C.reset}`));
  out.push(fila(`${C.dim}  Entra a: +${plan.whatsapp.telefono} (fijado en el conjunto)${C.reset}`));
  out.push(linea('└', '─', '┘'));

  console.log(out.join('\n'));
}

/* ========================================================================== */
/*  Progreso durante la creacion                                              */
/* ========================================================================== */

function manejarPaso(paso, detalle) {
  const etiquetas = {
    'campana:inicio': '  Creando campana...',
    'campana:reutilizada': '  Usando la campana existente',
    'adset:inicio': '  Creando conjunto de anuncios...',
    'creative:inicio': '  Creando AdCreative...',
    'ad:inicio': '  Creando anuncio...',
  };

  if (etiquetas[paso]) {
    console.log(`${C.dim}${etiquetas[paso]}${C.reset}`);
    return;
  }

  switch (paso) {
    case 'asset:inicio':
      console.log(`${C.dim}  Subiendo "${detalle.archivo}" para ${detalle.anuncio}...${C.reset}`);
      break;

    case 'asset:video:progreso': {
      const barra = '█'.repeat(Math.round(detalle.porcentaje / 4)).padEnd(25, '░');
      process.stdout.write(
        `\r${C.dim}  [${barra}] ${String(detalle.porcentaje).padStart(3)}% ` +
          `(trozo ${detalle.trozo}, intento ${detalle.intento})${C.reset}   `,
      );
      if (detalle.porcentaje === 100) process.stdout.write('\n');
      break;
    }

    case 'asset:video:procesando':
      console.log(`${C.dim}  Meta esta procesando el video ${detalle.videoId}...${C.reset}`);
      break;

    case 'asset:video:estado':
      process.stdout.write(
        `\r${C.dim}  Estado del video: ${detalle.estado}` +
          `${detalle.progreso !== undefined ? ` (${detalle.progreso}%)` : ''}` +
          ` — intento ${detalle.intento}/${detalle.maxIntentos}${C.reset}   `,
      );
      if (detalle.estado === 'ready') process.stdout.write('\n');
      break;

    case 'asset:ok':
      console.log(`  ${C.verde}✓${C.reset} creativo subido → ${C.bold}${detalle.id}${C.reset}`);
      break;

    case 'creative:reintento':
      console.log(
        `${C.amarillo}  Meta rechazo ${detalle.intento}.${C.reset}` +
          `${C.dim} Probando otro envoltorio, con los mismos textos.${C.reset}`,
      );
      console.log(`${C.dim}    ${recortar(detalle.motivo, ANCHO - 6)}${C.reset}`);
      break;

    case 'creative:sin-declarar':
      console.log(`\n${C.amarillo}  AVISO: ${detalle.motivo}${C.reset}\n`);
      break;

    default:
      if (paso.endsWith(':ok')) {
        const id = typeof detalle === 'object' ? detalle.id : detalle;
        console.log(`  ${C.verde}✓${C.reset} ${paso.replace(':ok', '')} → ${C.bold}${id}${C.reset}`);
      }
  }
}

/* ========================================================================== */
/*  Ayuda y listado                                                           */
/* ========================================================================== */

function imprimirAyuda() {
  const campanas = listarCampanas();
  console.log(`
${C.bold}USO${C.reset}
  node test-run.js [campana] [opciones]

${C.bold}OPCIONES${C.reset}
  ${C.cyan}--lista${C.reset}              Muestra las campanas definidas en campanas/
  ${C.cyan}--sin-meta${C.reset}           Resumen completo sin token y sin tocar Meta
  ${C.cyan}--vista-previa${C.reset}       Consulta Meta para los consecutivos, pero no crea nada
  ${C.cyan}--publicar-en-vivo${C.reset}   Crea en ACTIVE en vez de borrador. Gasta dinero.
  ${C.cyan}--ayuda${C.reset}              Esto

${C.bold}PANEL GRAFICO${C.reset}
  ${C.cyan}npm run panel${C.reset}  abre el asistente de aprobacion en el navegador, con las
  cuatro etapas, la vista previa del creativo y los botones de aprobar y editar.

${C.bold}EJEMPLOS${C.reset}
  ${C.dim}node test-run.js --lista${C.reset}
  ${C.dim}node test-run.js ${campanas[0] || '<campana>'} --sin-meta${C.reset}
  ${C.dim}node test-run.js ${campanas[0] || '<campana>'}${C.reset}

${C.bold}PARA CREAR UNA CAMPANA NUEVA${C.reset}
  1. Copia ${C.cyan}campanas/_plantilla.js${C.reset} con el nombre que quieras.
  2. Pon las piezas en ${C.cyan}creativos/<sede>/${C.reset}  (${C.dim}node herramientas/ver-creativos.js${C.reset})
  3. Corre ${C.dim}node test-run.js <tu-campana> --sin-meta${C.reset} para revisarla.
`);
}

function imprimirListaDeCampanas() {
  const campanas = listarCampanas();

  if (campanas.length === 0) {
    console.log(`\n${C.amarillo}  No hay ninguna campana definida en campanas/.${C.reset}`);
    console.log(`${C.dim}  Copia campanas/_plantilla.js y ponle el nombre que quieras.${C.reset}\n`);
    return;
  }

  console.log(`\n${C.bold}  CAMPANAS DEFINIDAS (${campanas.length})${C.reset}\n`);
  for (const nombre of campanas) {
    console.log(`  ${C.cyan}${nombre}${C.reset}`);
    console.log(`${C.dim}      node test-run.js ${nombre} --sin-meta${C.reset}`);
  }
  console.log('');
}

/* ========================================================================== */
/*  Flujo principal                                                           */
/* ========================================================================== */

async function main() {
  const args = leerArgumentos(process.argv.slice(2));

  console.log(
    `\n${C.cyan}${C.bold}CELRED ADS MANAGER${C.reset} ` +
      `${C.dim}· nomenclatura v1.2 · aprobacion humana obligatoria${C.reset}`,
  );

  if (args.ayuda) return imprimirAyuda();
  if (args.desconocidas.length > 0) {
    console.error(`\n${C.rojo}  Opcion desconocida: ${args.desconocidas.join(' ')}${C.reset}`);
    imprimirAyuda();
    process.exit(1);
  }
  if (args.lista) return imprimirListaDeCampanas();

  // --sin-meta no consulta Meta, asi que tampoco puede crear nada.
  const soloVistaPrevia = args.sinMeta || args.vistaPrevia;

  if (args.sinMeta) {
    console.log(`${C.amarillo}· modo --sin-meta: no se consulta ni se crea nada en Meta${C.reset}`);
  }

  /* ---------------- PASO 0: cargar y validar la campana ------------------ */
  let campana;
  try {
    campana = await cargarCampana(args.campana);
  } catch (error) {
    console.error(`\n${C.rojo}${C.bold}  No se pudo cargar la campana:${C.reset}`);
    console.error(`${C.rojo}  ${error.message}${C.reset}\n`);
    process.exit(1);
  }

  console.log(`${C.dim}Campana: ${C.reset}${C.bold}${campana.archivo}${C.reset}`);
  if (campana.descripcion) console.log(`${C.dim}  ${campana.descripcion}${C.reset}`);

  // El estado nunca sale del archivo de la campana: es PAUSED salvo que se
  // pida en vivo desde la linea de comandos, y aun asi hay doble confirmacion.
  const estado = args.enVivo ? 'ACTIVE' : 'PAUSED';

  if (args.enVivo && !soloVistaPrevia) {
    console.log(
      `${C.invRojo}  --publicar-en-vivo  ${C.reset} ` +
        `${C.rojo}esta corrida NO crea un borrador: sale a circular.${C.reset}`,
    );
  }

  /* ---------------- PASO 1: planificar (solo lectura) -------------------- */
  if (!args.sinMeta) {
    const faltan = credencialesFaltantes();
    if (faltan.length > 0) {
      console.error(`\n${C.rojo}${C.bold}  Faltan credenciales en el .env:${C.reset}`);
      faltan.forEach((v) => console.error(`${C.rojo}    - ${v.clave}  (${v.para})${C.reset}`));
      console.error(
        `\n${C.dim}  Mientras las consigues puedes ver el resumen completo con:` +
          `\n    node test-run.js ${campana.archivo} --sin-meta${C.reset}\n`,
      );
      process.exit(1);
    }
  }

  console.log(
    args.sinMeta
      ? `${C.dim}Leyendo la linea de WhatsApp en lineas.xlsx...${C.reset}`
      : `${C.dim}Leyendo la linea de WhatsApp y los consecutivos reales en Meta...${C.reset}`,
  );

  let plan;
  try {
    plan = await planificarEstructura({
      ...campana,
      estado,
      permitirEnVivo: args.enVivo,
      sinConexion: args.sinMeta,
    });
  } catch (error) {
    console.error(`\n${C.rojo}${C.bold}  No se pudo preparar la estructura:${C.reset}`);
    console.error(`${C.rojo}  ${error.message}${C.reset}\n`);
    process.exit(1);
  }

  plan.avisos.unshift(...(campana.avisosDeConfiguracion || []));

  /* ---------------- PASO 2: vista previa --------------------------------- */
  imprimirVistaPrevia(plan);

  if (soloVistaPrevia) {
    const motivo = args.sinMeta ? '--sin-meta' : '--vista-previa';
    console.log(`\n${C.dim}  ${motivo}: no se pregunta nada y no se crea nada.${C.reset}\n`);
    process.exit(0);
  }

  /* ---------------- PASO 3: APROBACION HUMANA ---------------------------- */
  const totalObjetos = plan.totales.objetos;
  console.log(
    `\n${C.dim}  Se crearan ${totalObjetos} objetos en Meta, todos en estado ` +
      `${C.bold}${plan.estado}${C.reset}${C.dim}` +
      `${plan.estado === 'PAUSED' ? ' (borrador: no entrega ni gasta)' : ''}.${C.reset}`,
  );

  const respuesta = await preguntar(`\n${C.bold}¿Deseas publicar el conjunto de anuncios? (S/N): ${C.reset}`);

  if (String(respuesta).trim().toUpperCase() !== 'S') {
    console.log(`\n${C.amarillo}  OPERACION ABORTADA. No se envio ninguna peticion de creacion a Meta.${C.reset}\n`);
    process.exit(0);
  }

  // Segunda confirmacion solo cuando la corrida va a gastar dinero de verdad.
  if (plan.estado === 'ACTIVE') {
    const monto = String(plan.totales.presupuestoDiarioCop);
    console.log(
      `\n${C.invRojo}  ATENCION  ${C.reset} ${C.rojo}Esto sale EN VIVO y empieza a gastar ` +
        `$${monto} COP al dia.${C.reset}`,
    );
    const confirma = await preguntar(
      `${C.bold}Escribe el presupuesto diario (${monto}) para confirmar: ${C.reset}`,
    );
    if (String(confirma).trim() !== monto) {
      console.log(`\n${C.amarillo}  OPERACION ABORTADA. No coincidio la confirmacion.${C.reset}\n`);
      process.exit(0);
    }
  }

  /* ---------------- PASO 4: creacion ------------------------------------- */
  console.log(`\n${C.dim}Creando en Meta (estado ${plan.estado})...${C.reset}\n`);

  const resultado = await crearEstructuraCampana(plan, { onPaso: manejarPaso });

  if (resultado.error) {
    console.error(`\n${C.rojo}${C.bold}  ERROR AL CREAR LA ESTRUCTURA${C.reset}`);
    console.error(`${C.rojo}  ${resultado.error.message}${C.reset}`);

    const colgando = [];
    if (resultado.campaignId && resultado.campaignCreada) colgando.push(`Campana: ${resultado.campaignId}`);
    for (const c of resultado.conjuntos) colgando.push(`Conjunto ${c.nombre}: ${c.adSetId}`);
    for (const a of resultado.anuncios) {
      if (a.creativeId) colgando.push(`Creativo de ${a.nombre}: ${a.creativeId}`);
      if (a.adId) colgando.push(`Anuncio ${a.nombre}: ${a.adId}`);
    }

    if (colgando.length > 0) {
      console.error(`\n${C.amarillo}  Quedaron objetos a medias (en ${resultado.estado}):${C.reset}`);
      colgando.forEach((l) => console.error(`    ${l}`));
      console.error(`${C.amarillo}  Revisalos o eliminalos manualmente en Ads Manager.${C.reset}`);
    }
    console.error('');
    process.exit(1);
  }

  /* ---------------- PASO 5: verificacion --------------------------------- */
  console.log(`\n${C.dim}Releyendo en Meta para confirmar como quedo todo...${C.reset}`);

  let verificacion = [];
  try {
    verificacion = await verificarEstructura(resultado, plan);
  } catch (error) {
    console.log(`${C.amarillo}  No se pudo releer el estado (${error.message}). Verificalo en Ads Manager.${C.reset}`);
  }

  const cierre = [];
  cierre.push('');
  cierre.push(linea('┌', '─', '┐'));
  cierre.push(encabezado(`ESTRUCTURA CREADA — ESTADO ${resultado.estado}`));
  cierre.push(linea('├', '─', '┤'));
  cierre.push(filaEtiqueta('Campaign ID', resultado.campaignId || '—', C.bold + C.verde));
  for (const c of resultado.conjuntos) {
    cierre.push(filaEtiqueta(`AdSet CJTO${c.numero}`, c.adSetId || '—', C.bold + C.verde));
    cierre.push(filaDetalle(`${c.nombre} · ${c.anuncios.length} anuncio(s)`));
    for (const a of c.anuncios) {
      cierre.push(filaEtiqueta(`  Ad ${a.numero} · ${a.nombre.split(' | ')[0]}`, a.adId || '—', C.bold + C.verde));
      cierre.push(filaDetalle(`creativo ${a.creativeId} · textos: ${a.modoTexto}`));
    }
  }

  if (verificacion.length > 0) {
    cierre.push(linea('├', '─', '┤'));
    cierre.push(encabezado('CONFIRMADO POR META'));
    for (const v of verificacion) {
      const ok = v.problemas.length === 0;
      const marca = ok ? `${C.verde}✓ ${v.estado}${C.reset}` : `${C.rojo}✗ ${v.estado}${C.reset}`;
      cierre.push(filaEtiqueta(v.tipo, `${marca}  ${C.dim}${recortar(v.nombre, 40)}${C.reset}`, ''));
      if (v.destino) cierre.push(filaDetalle(`destino: ${v.destino}`));
      if (v.radio) cierre.push(filaDetalle(`ubicacion: ${v.radio}`));
      if (v.textos) {
        cierre.push(
          filaDetalle(
            `en Meta: ${v.textos.textosPrincipales} textos · ${v.textos.titulos} titulos · ` +
              `${v.textos.descripciones} descripciones`,
          ),
        );
      }
      if (v.mejoras) {
        cierre.push(
          filaDetalle(
            v.mejoras.encendidas.length > 0
              ? `mejoras ENCENDIDAS: ${v.mejoras.encendidas.join(', ')}`
              : `${v.mejoras.apagadas} mejoras declaradas, ninguna encendida`,
          ),
        );
      }
      for (const n of v.notas || []) {
        for (const t of partirTexto(n, ANCHO - COL - 4)) cierre.push(filaDetalle(t));
      }
      for (const p of v.problemas) {
        cierre.push(fila(`${C.rojo}${' '.repeat(COL)}${recortar(p, ANCHO - COL - 4)}${C.reset}`));
      }
    }
  }

  cierre.push(linea('└', '─', '┘'));
  console.log(cierre.join('\n'));

  const conReintentos = resultado.anuncios.filter((a) => a.rechazos?.length > 0);
  if (conReintentos.length > 0) {
    console.log(`\n${C.amarillo}${C.bold}  ANUNCIOS QUE NECESITARON REINTENTOS:${C.reset}`);
    console.log(`${C.dim}  Los textos son los mismos en todos los intentos; lo que cambia es el envoltorio.${C.reset}`);
    conReintentos.forEach((a) => {
      console.log(`${C.amarillo}   • ${a.nombre} se creo con: ${a.escalon}${C.reset}`);
      a.rechazos.forEach((r) => console.log(`${C.dim}       rechazado: ${recortar(r, ANCHO - 20)}${C.reset}`));
    });
  }

  const sinDeclarar = resultado.anuncios.filter((a) => a.mejorasSinDeclarar);
  if (sinDeclarar.length > 0) {
    console.log(`\n${C.amarillo}${C.bold}  MEJORAS AUTOMATICAS SIN DECLARAR:${C.reset}`);
    console.log(
      `${C.amarillo}  Meta rechazo la declaracion de opt-out en ${sinDeclarar.length} anuncio(s), ` +
        `asi que se crearon sin ella.${C.reset}`,
    );
    console.log(`${C.dim}  Los 5 textos si quedaron. Confirma el apagado en Ads Manager antes de darles play.${C.reset}`);
  }

  /* ---------------- PASO 6: recordatorio del punto 12 -------------------- */
  console.log(`\n${C.verde}${C.bold}  Listo.${C.reset}`);
  console.log(`${C.dim}  Punto 12 del manual: el cambio no queda cerrado hasta actualizar HOY MISMO${C.reset}`);
  console.log(`${C.dim}    1. el archivo de la sede en Drive, con el pantallazo de cada creativo${C.reset}`);
  console.log(`${C.dim}    2. el archivo general de anuncios por referencia${C.reset}`);
  console.log(`${C.dim}    3. el Drive de piezas del equipo creativo${C.reset}`);
  console.log(`${C.dim}    4. el Panel de Pauta en Notion${C.reset}`);
  if (plan.campana.crear) {
    console.log(
      `${C.dim}  Punto 4: anota HOY el consecutivo C${plan.campana.numero} de ${plan.sede.codigo} ` +
        `en la hoja "Consecutivos" del Excel de control.${C.reset}`,
    );
  }
  console.log('');
}

main().catch((error) => {
  console.error(`\n${C.rojo}${C.bold}  ERROR INESPERADO${C.reset}`);
  console.error(`${C.rojo}  ${error?.stack || error?.message || error}${C.reset}\n`);
  process.exit(1);
});
