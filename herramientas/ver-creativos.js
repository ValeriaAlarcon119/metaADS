#!/usr/bin/env node
/**
 * ============================================================================
 *  herramientas/ver-creativos.js — Que piezas hay en la carpeta de cada sede
 * ============================================================================
 *  Ejecutar:  node herramientas/ver-creativos.js
 *             node herramientas/ver-creativos.js NEIVA
 *             node herramientas/ver-creativos.js --crear-carpetas
 *
 *  No necesita credenciales de Meta ni conexion: solo mira el disco.
 *
 *  La convencion es una carpeta por sede, igual que el archivo de sedes en
 *  Drive que pide el punto 12 del manual:
 *
 *    creativos/neiva/tecnocamon50pro-neiva.png
 *    creativos/victoria/iphone13-victoria.jpg
 * ============================================================================
 */

import { CODIGOS_SEDE } from '../src/nomenclatura.js';
import { inventarioPorSede, listarCreativosDeSede, carpetaDeSede, crearCarpetasDeSedes, RAIZ } from '../src/creativos-sede.js';
import { relative } from 'node:path';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  rojo: '\x1b[31m',
  verde: '\x1b[32m',
  amarillo: '\x1b[33m',
  cyan: '\x1b[36m',
};

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--crear-carpetas')) {
    const creadas = crearCarpetasDeSedes();
    if (creadas.length === 0) {
      console.log(`\n${C.verde}  Las trece carpetas ya existian.${C.reset}\n`);
    } else {
      console.log(`\n${C.verde}  Creadas ${creadas.length} carpetas:${C.reset}`);
      creadas.forEach((c) => console.log(`    ${c}`));
      console.log('');
    }
    return;
  }

  const pedida = (args.find((a) => !a.startsWith('-')) || '').toUpperCase();

  if (pedida && !CODIGOS_SEDE.includes(pedida)) {
    console.error(`\n${C.rojo}  Sede "${pedida}" no existe. Validas: ${CODIGOS_SEDE.join(', ')}${C.reset}\n`);
    process.exit(1);
  }

  /* --- Detalle de una sola sede ----------------------------------------- */
  if (pedida) {
    const piezas = listarCreativosDeSede(pedida);
    console.log(`\n${C.cyan}${C.bold}CREATIVOS DE ${pedida}${C.reset}`);
    console.log(`${C.dim}${relative(RAIZ, carpetaDeSede(pedida))}${C.reset}\n`);

    if (piezas.length === 0) {
      console.log(`${C.amarillo}  La carpeta esta vacia o no existe.${C.reset}`);
      console.log(`${C.dim}  Creala con: node herramientas/ver-creativos.js --crear-carpetas${C.reset}\n`);
      return;
    }

    for (const p of piezas) {
      if (p.problema) {
        console.log(`  ${C.rojo}✗ ${p.nombre}${C.reset}`);
        console.log(`      ${C.rojo}${p.problema}${C.reset}`);
        continue;
      }
      const icono = p.tipo === 'imagen' ? 'IMG' : 'VID';
      const extra = p.porPartes ? `${C.dim} · subida por partes${C.reset}` : '';
      console.log(`  ${C.verde}${icono}${C.reset}  ${C.bold}${p.nombre}${C.reset}  ${C.dim}${p.megas} MB${C.reset}${extra}`);
      console.log(`       ${C.dim}en la campana: rutaCreativoLocal: '${p.nombre}'${C.reset}`);
    }
    console.log('');
    return;
  }

  /* --- Resumen de las trece sedes ---------------------------------------- */
  const inventario = inventarioPorSede();

  console.log(`\n${C.cyan}${C.bold}CREATIVOS POR SEDE${C.reset}`);
  console.log(`${C.dim}${relative(RAIZ, carpetaDeSede('NEIVA')).replace(/neiva$/, '')}${C.reset}\n`);
  console.log(`${C.dim}${'SEDE'.padEnd(12)}${'DIST'.padEnd(6)}${'IMG'.padEnd(6)}${'VID'.padEnd(6)}CARPETA${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(62)}${C.reset}`);

  let totalImg = 0;
  let totalVid = 0;
  const conProblemas = [];

  for (const s of inventario) {
    totalImg += s.imagenes;
    totalVid += s.videos;
    if (s.problemas.length > 0) conProblemas.push(s);

    const vacia = s.imagenes + s.videos === 0;
    const color = vacia ? C.dim : C.bold;
    const marcaCarpeta = s.existe ? `${C.dim}${s.carpeta}${C.reset}` : `${C.amarillo}(no existe)${C.reset}`;

    console.log(
      `${color}${s.sede.padEnd(12)}${C.reset}` +
        `${C.dim}${s.dist.padEnd(6)}${C.reset}` +
        `${String(s.imagenes || '·').padEnd(6)}` +
        `${String(s.videos || '·').padEnd(6)}` +
        marcaCarpeta,
    );
  }

  console.log(`${C.dim}${'─'.repeat(62)}${C.reset}`);
  console.log(`${C.bold}${'TOTAL'.padEnd(18)}${C.reset}${String(totalImg).padEnd(6)}${String(totalVid).padEnd(6)}`);

  if (conProblemas.length > 0) {
    console.log(`\n${C.rojo}${C.bold}  ARCHIVOS QUE META NO VA A ACEPTAR:${C.reset}`);
    for (const s of conProblemas) {
      for (const p of s.problemas) {
        console.log(`${C.rojo}   • ${s.sede}/${p.nombre}: ${p.problema}${C.reset}`);
      }
    }
  }

  const sinCarpeta = inventario.filter((s) => !s.existe);
  if (sinCarpeta.length > 0) {
    console.log(
      `\n${C.dim}  ${sinCarpeta.length} sedes no tienen carpeta todavia. ` +
        `Crealas con:\n    node herramientas/ver-creativos.js --crear-carpetas${C.reset}`,
    );
  }

  console.log(`\n${C.dim}  Detalle de una sede:  node herramientas/ver-creativos.js NEIVA${C.reset}\n`);
}

main();
