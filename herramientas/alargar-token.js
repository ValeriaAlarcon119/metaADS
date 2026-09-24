#!/usr/bin/env node
/**
 * ============================================================================
 *  herramientas/alargar-token.js — De token de 1 hora a token de 60 dias
 * ============================================================================
 *  Ejecutar:  npm run alargar-token
 *
 *  POR QUE HACE FALTA
 *
 *  El token que da el Explorador de la API Graph es de usuario y de corta
 *  duracion: caduca en una o dos horas. Eso no sirve para trabajar — a media
 *  tarde el panel deja de alcanzar Meta y hay que volver al Explorador.
 *
 *  Meta permite cambiarlo por uno de larga duracion (60 dias) si se firma con
 *  el ID y el secreto de la app, que ya estan en el .env. Es una sola llamada
 *  y no requiere permisos nuevos: el token largo alcanza EXACTAMENTE lo mismo
 *  que el corto, solo que dura mas.
 *
 *  QUE HACE Y QUE NO HACE
 *
 *  Pide el token largo y lo imprime. NO escribe el .env: ese archivo se edita
 *  a mano a proposito, porque es donde vive la credencial que puede crear
 *  campanas en las dos cuentas y no debe cambiarla un script sin mirar.
 *
 *  Con --escribir si lo reemplaza en el .env, guardando antes una copia.
 * ============================================================================
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import axios from 'axios';

import { ACCESS_TOKEN, APP_ID, APP_SECRET, GRAPH_HOST, GRAPH_VERSION } from '../src/config.js';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  rojo: '\x1b[31m',
  verde: '\x1b[32m',
  amarillo: '\x1b[33m',
  cyan: '\x1b[36m',
};

const escribir = process.argv.includes('--escribir');
const RUTA_ENV = resolve(process.cwd(), '.env');

/** Dias que faltan para una fecha, redondeados hacia abajo. */
const diasHasta = (fecha) => Math.floor((fecha - Date.now()) / 86400000);

function salirCon(mensaje, ayuda = '') {
  console.error(`\n${C.rojo}${C.bold}  ${mensaje}${C.reset}`);
  if (ayuda) console.error(`${C.dim}  ${ayuda}${C.reset}`);
  console.error('');
  process.exit(1);
}

console.log(`\n${C.cyan}${C.bold}CELRED ADS MANAGER${C.reset} ${C.dim}· alargar el token${C.reset}\n`);

if (!ACCESS_TOKEN) salirCon('No hay META_ACCESS_TOKEN en el .env.');
if (!APP_ID || !APP_SECRET) {
  salirCon(
    'Faltan META_APP_ID o META_APP_SECRET en el .env.',
    'Sin ellos Meta no deja cambiar un token corto por uno largo.',
  );
}

/* --- 1. Que es el token de ahora ------------------------------------------ */

async function inspeccionar(token) {
  const { data } = await axios.get(`${GRAPH_HOST}/${GRAPH_VERSION}/debug_token`, {
    params: { input_token: token, access_token: `${APP_ID}|${APP_SECRET}` },
    timeout: 30000,
  });
  return data.data || {};
}

let antes;
try {
  antes = await inspeccionar(ACCESS_TOKEN);
} catch (error) {
  const e = error.response?.data?.error;
  salirCon(
    `No se pudo inspeccionar el token: ${e?.message || error.message}`,
    'Si dice que caduco, saca uno nuevo en el Explorador de la API Graph y vuelve a correr esto.',
  );
}

const caducaAntes = antes.expires_at ? new Date(antes.expires_at * 1000) : null;

console.log(`${C.bold}EL TOKEN DE AHORA${C.reset}`);
console.log(`  tipo:   ${antes.type || '—'}`);
console.log(`  app:    ${antes.app_id || '—'}`);
console.log(
  `  caduca: ` +
    (caducaAntes
      ? `${caducaAntes.toISOString().slice(0, 16).replace('T', ' ')} UTC ` +
        `${C.amarillo}(en ${Math.max(0, Math.round((caducaAntes - Date.now()) / 3600000))} h)${C.reset}`
      : `${C.verde}nunca${C.reset}`),
);

if (!antes.is_valid) {
  salirCon('El token no es valido.', 'Saca uno nuevo en el Explorador de la API Graph.');
}

// Un token de usuario de sistema ya no caduca: cambiarlo no aporta nada y el
// que volveria seria distinto del que la empresa tiene registrado.
if (!caducaAntes) {
  console.log(
    `\n${C.verde}${C.bold}  Este token ya no caduca. No hace falta alargarlo.${C.reset}\n`,
  );
  process.exit(0);
}

/* --- 2. El cambio --------------------------------------------------------- */

let largo;
try {
  const { data } = await axios.get(`${GRAPH_HOST}/${GRAPH_VERSION}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: APP_ID,
      client_secret: APP_SECRET,
      fb_exchange_token: ACCESS_TOKEN,
    },
    timeout: 30000,
  });
  largo = data.access_token;
} catch (error) {
  const e = error.response?.data?.error;
  salirCon(
    `Meta rechazo el cambio: ${e?.message || error.message}`,
    'Comprueba que META_APP_SECRET es el de la app ' + APP_ID + '.',
  );
}

if (!largo) salirCon('Meta respondio sin token.');

const despues = await inspeccionar(largo);
const caducaDespues = despues.expires_at ? new Date(despues.expires_at * 1000) : null;

console.log(`\n${C.bold}EL TOKEN NUEVO${C.reset}`);
console.log(
  `  ${C.verde}✓${C.reset} caduca: ` +
    (caducaDespues
      ? `${caducaDespues.toISOString().slice(0, 16).replace('T', ' ')} UTC ` +
        `${C.verde}(en ${diasHasta(caducaDespues)} dias)${C.reset}`
      : `${C.verde}nunca${C.reset}`),
);

// Los permisos tienen que ser los MISMOS. Si el token largo trajera menos,
// cambiarlo seria un retroceso silencioso.
const perdidos = (antes.scopes || []).filter((p) => !(despues.scopes || []).includes(p));
if (perdidos.length > 0) {
  console.log(`  ${C.rojo}✗${C.reset} pierde permisos: ${perdidos.join(', ')}`);
  salirCon('El token largo trae menos permisos que el corto. No se usa.');
}
console.log(`  ${C.verde}✓${C.reset} conserva los ${(despues.scopes || []).length} permisos`);

/* --- 3. Guardarlo (o no) -------------------------------------------------- */

if (!escribir) {
  console.log(`\n${C.bold}PEGA ESTO EN EL .env${C.reset} ${C.dim}(reemplaza la linea entera)${C.reset}\n`);
  console.log(`META_ACCESS_TOKEN=${largo}\n`);
  console.log(
    `${C.dim}  O corre "npm run alargar-token -- --escribir" y lo cambia solo,\n` +
      `  dejando antes una copia en .env.anterior.${C.reset}\n`,
  );
  process.exit(0);
}

if (!existsSync(RUTA_ENV)) salirCon(`No encuentro ${RUTA_ENV}.`);

copyFileSync(RUTA_ENV, `${RUTA_ENV}.anterior`);

const contenido = readFileSync(RUTA_ENV, 'utf8');
const linea = /^META_ACCESS_TOKEN=.*$/m;

if (!linea.test(contenido)) salirCon('En el .env no hay ninguna linea META_ACCESS_TOKEN=.');

writeFileSync(RUTA_ENV, contenido.replace(linea, `META_ACCESS_TOKEN=${largo}`), 'utf8');

console.log(`\n${C.verde}${C.bold}  .env actualizado.${C.reset}`);
console.log(`${C.dim}  Copia del anterior en .env.anterior${C.reset}`);
console.log(`${C.dim}  Comprueba que alcanza las dos cuentas con:  npm run cuentas${C.reset}\n`);
