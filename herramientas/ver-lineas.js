#!/usr/bin/env node
/**
 * ============================================================================
 *  herramientas/ver-lineas.js — Que numero de WhatsApp le toca a cada sede
 * ============================================================================
 *  Ejecutar:  npm run lineas
 *             node herramientas/ver-lineas.js NEIVA
 *
 *  Lee lineas.xlsx y muestra, sede por sede, la linea que usaria el sistema al
 *  crear una campana. No necesita credenciales de Meta ni conexion: sirve para
 *  revisar el Excel antes de pautar.
 * ============================================================================
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leerLineasConDiagnostico, lineaDeSede } from '../src/lineas.js';
import { CODIGOS_SEDE, obtenerSedeNomenclatura } from '../src/nomenclatura.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA = resolve(process.env.CELRED_LINEAS_XLSX || join(RAIZ, 'lineas.xlsx'));

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
  const pedida = (process.argv[2] || '').toUpperCase();

  console.log(`\n${C.cyan}${C.bold}LINEAS DE WHATSAPP POR SEDE${C.reset}`);
  console.log(`${C.dim}Archivo: ${RUTA}${C.reset}\n`);

  let todas;
  let avisosDelArchivo = [];
  try {
    const lectura = leerLineasConDiagnostico(RUTA);
    todas = lectura.registros;
    avisosDelArchivo = lectura.avisos;
  } catch (error) {
    console.error(`${C.rojo}  ${error.message}${C.reset}\n`);
    process.exit(1);
  }

  // Los avisos del archivo son los MISMOS para las trece sedes, asi que van
  // una vez arriba y no repetidos trece veces debajo de cada fila.
  if (avisosDelArchivo.length > 0) {
    console.log(`${C.amarillo}${C.bold}  SOBRE EL ARCHIVO${C.reset}`);
    for (const aviso of avisosDelArchivo) console.log(`${C.amarillo}   ! ${aviso}${C.reset}`);
    console.log('');
  }

  const esDelArchivo = new Set(avisosDelArchivo);
  const sedes = pedida ? [pedida] : CODIGOS_SEDE;

  if (pedida && !CODIGOS_SEDE.includes(pedida)) {
    console.error(`${C.rojo}  Sede "${pedida}" no existe. Validas: ${CODIGOS_SEDE.join(', ')}${C.reset}\n`);
    process.exit(1);
  }

  console.log(
    `${C.dim}${'SEDE'.padEnd(11)}${'DIST'.padEnd(6)}${'LINEA ELEGIDA'.padEnd(16)}` +
      `${'LIDER'.padEnd(12)}${'N'.padEnd(4)}OTRAS LINEAS${C.reset}`,
  );
  console.log(`${C.dim}${'─'.repeat(86)}${C.reset}`);

  for (const codigo of sedes) {
    const ficha = obtenerSedeNomenclatura(codigo);
    try {
      const r = lineaDeSede(RUTA, codigo);
      const otras = r.alternativas.map((a) => a.telefono.replace(/^57/, '')).join(' ') || '—';
      const marcaLucid = r.registro?.esLucid ? `${C.verde}✓${C.reset}` : `${C.amarillo}?${C.reset}`;

      console.log(
        `${C.bold}${codigo.padEnd(11)}${C.reset}` +
          `${C.dim}${ficha.dist.padEnd(6)}${C.reset}` +
          `${C.verde}+${r.telefono}${C.reset} ${marcaLucid}  ` +
          `${String(r.registro?.lider || '—').padEnd(12)}` +
          `${String(r.todasDeLaSede.length).padEnd(4)}` +
          `${C.dim}${otras}${C.reset}`,
      );

      // Solo lo que es propio de esta sede; lo del archivo ya salio arriba.
      for (const aviso of r.avisos) {
        if (!esDelArchivo.has(aviso)) console.log(`${C.amarillo}            ! ${aviso}${C.reset}`);
      }
    } catch (error) {
      console.log(`${C.bold}${codigo.padEnd(11)}${C.reset}${C.rojo}${error.message.split('\n')[0]}${C.reset}`);
    }
  }

  console.log(`\n${C.dim}  ✓ = la linea esta marcada LUCID en el Excel (es la del bot del CRM).${C.reset}`);
  console.log(`${C.dim}  N = cuantas lineas distintas tiene esa sede en total.${C.reset}`);

  const sinSede = todas.filter((r) => !r.sede);
  if (sinSede.length > 0) {
    console.log(`\n${C.amarillo}${C.bold}  FILAS DEL EXCEL QUE NO SE PUDIERON ASIGNAR A UNA SEDE:${C.reset}`);
    for (const r of sinSede) {
      console.log(`${C.amarillo}   • fila ${r.fila}: "${r.tienda}" (${r.telefono})${C.reset}`);
    }
    console.log(`${C.dim}   Agrega el alias en ALIAS_TIENDA dentro de src/lineas.js.${C.reset}`);
  }

  console.log('');
}

main();
