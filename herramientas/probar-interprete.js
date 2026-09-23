#!/usr/bin/env node
/**
 * ============================================================================
 *  herramientas/probar-interprete.js — Que entiende el interprete
 * ============================================================================
 *  Ejecutar:
 *    npm run interpretar -- "campana para la 16 con el iphone 16"
 *    npm run interpretar            (corre los ejemplos de muestra)
 *
 *  No toca Meta ni crea nada: solo lee la frase, busca las piezas en las
 *  carpetas y enseña la campana que saldria.
 * ============================================================================
 */

import { interpretar } from '../src/interprete.js';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  rojo: '\x1b[31m',
  verde: '\x1b[32m',
  amarillo: '\x1b[33m',
  cyan: '\x1b[36m',
};

const EJEMPLOS = [
  'quiero una campana para pasto sede la 16 de un iphone 16',
  'campana para la victoria con 2 conjuntos de anuncios uno para android con 3 anuncios redmi 15 samsung a07 y samsung a17 y otra de iphone con 3 anuncios iphone 15 iphone 13 y iphone 14',
  'campana de prueba para neiva con tecno camon 50 pro e infinix hot 60 pro a credito con 35 mil diarios',
  'una campana para pasto de iphone 15',
  'campana para zafiro',
];

function mostrar(texto) {
  console.log(`\n${C.cyan}${C.bold}▸ "${texto}"${C.reset}`);

  const r = interpretar(texto);

  if (!r.ok) {
    console.log(`  ${C.rojo}No se pudo armar la campana:${C.reset}`);
    r.problemas.forEach((p) => p.split('\n').forEach((l) => console.log(`  ${C.rojo}  ${l}${C.reset}`)));
    r.avisos.forEach((a) => console.log(`  ${C.amarillo}  aviso: ${a}${C.reset}`));
    return;
  }

  const l = r.lectura;
  console.log(`  ${C.dim}sede:${C.reset} ${C.bold}${l.sede}${C.reset} ${C.dim}(${l.sedeNombre}) · reconocida por "${l.alias}"${C.reset}`);
  console.log(
    `  ${C.dim}pago:${C.reset} ${Object.entries(l.pago).filter(([, v]) => v).map(([k]) => k).join(', ') || 'no dicho'}` +
      ` ${C.dim}· presupuesto:${C.reset} $${l.presupuesto.toLocaleString('es-CO')}/dia ${C.dim}· sufijo:${C.reset} ${l.sufijo}`,
  );
  console.log(`  ${C.dim}equipos reconocidos:${C.reset} ${l.productos.join(', ')}`);

  console.log(`  ${C.bold}${r.cfg.conjuntos.length} conjunto(s):${C.reset}`);
  r.cfg.conjuntos.forEach((c, i) => {
    console.log(`    ${C.verde}CJTO${i + 1} · ${c.segmento}${c.sufijoConjunto ? ` | ${c.sufijoConjunto}` : ''}${C.reset}` +
      ` ${C.dim}· $${c.presupuestoDiarioCop.toLocaleString('es-CO')}/dia · ${c.anuncios.length} anuncio(s)${C.reset}`);
    c.anuncios.forEach((a, j) => {
      console.log(`      ${C.dim}ADS${j + 1}${C.reset} ${a.formato} · ${C.bold}${a.referencia}${C.reset} ${C.dim}← ${a.rutaCreativoLocal} (${a.megas} MB)${C.reset}`);
      console.log(`           ${C.dim}"${a.textosPrincipales[0]}"${C.reset}`);
      console.log(`           ${C.dim}${a.textosPrincipales.length} textos · ${a.titulos.length} titulos · ${a.descripciones.length} descripciones${C.reset}`);
    });
  });

  r.avisos.forEach((a) => console.log(`  ${C.amarillo}aviso: ${a}${C.reset}`));
  r.problemas.forEach((p) => p.split('\n').forEach((l2) => console.log(`  ${C.rojo}${l2}${C.reset}`)));
}

const pedido = process.argv.slice(2).filter((a) => !a.startsWith('-')).join(' ').trim();

console.log(`\n${C.cyan}${C.bold}CELRED ADS MANAGER${C.reset} ${C.dim}· que entiende el interprete${C.reset}`);

if (pedido) mostrar(pedido);
else {
  console.log(`${C.dim}Sin argumentos: se corren los ejemplos de muestra.${C.reset}`);
  EJEMPLOS.forEach(mostrar);
}

console.log('');
