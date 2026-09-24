#!/usr/bin/env node
/**
 * ============================================================================
 *  herramientas/ver-cuentas.js — Que alcanza el token que hay en el .env
 * ============================================================================
 *  Ejecutar:  npm run cuentas
 *
 *  Es la primera comprobacion que conviene hacer al poner credenciales nuevas,
 *  y la primera que hay que mirar cuando algo falla. Responde cuatro preguntas,
 *  todas de SOLO LECTURA:
 *
 *    1. El token, ¿de que app es, que permisos trae y cuando caduca?
 *    2. Las dos cuentas publicitarias, ¿se alcanzan, estan activas y se puede
 *       CREAR en ellas?
 *    3. La Pagina del .env, ¿existe y se puede leer?
 *    4. Esa Pagina, ¿tiene un numero de WhatsApp Business vinculado?
 *
 *  La segunda hace un ensayo con `validate_only`, que Meta revisa como si
 *  fuera a crear y luego descarta. Sigue sin crearse nada, pero deja de dar
 *  por buena una cuenta que solo se puede leer.
 *
 *  La cuarta es informativa. El numero que se usa sale de lineas.xlsx, no de
 *  aqui: por decision del proyecto no se valida nada contra la Fanpage.
 * ============================================================================
 */

import axios from 'axios';

import {
  ACCESS_TOKEN,
  APP_ID,
  CUENTAS,
  GRAPH_BASE,
  PAGE_ID,
  credencialesFaltantes,
  formatearMoneda,
  factorMoneda,
} from '../src/config.js';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  rojo: '\x1b[31m',
  verde: '\x1b[32m',
  amarillo: '\x1b[33m',
  cyan: '\x1b[36m',
};

const OK = `${C.verde}✓${C.reset}`;
const MAL = `${C.rojo}✗${C.reset}`;
const DUDA = `${C.amarillo}?${C.reset}`;

/** GET al Graph API que nunca lanza: devuelve el dato o el error de Meta. */
async function leer(camino, params = {}) {
  try {
    const { data } = await axios.get(`${GRAPH_BASE}/${camino}`, {
      params: { access_token: ACCESS_TOKEN, ...params },
      timeout: 30000,
    });
    return { ok: true, datos: data };
  } catch (error) {
    const e = error.response?.data?.error;
    return {
      ok: false,
      mensaje: e?.message || error.message,
      codigo: e?.code,
      detalle: e?.error_user_msg || '',
    };
  }
}

/**
 * ¿El token puede CREAR en esta cuenta, no solo leerla?
 *
 * Leer y escribir son permisos distintos, y esa diferencia costo una tarde:
 * la cuenta salia en verde porque se leia bien, y al crear Meta contestaba
 * "No tienes permiso de escritura" (codigo 200, subcodigo 2490585). Una
 * comprobacion que solo lee no sirve para saber si se va a poder pautar.
 *
 * Se manda con `execution_options=['validate_only']`: Meta revisa los
 * parametros como si fuera a crear, responde... y NO crea nada. No queda
 * ningun objeto en Ads Manager.
 */
async function puedeCrear(cuentaId) {
  const cuerpo = new URLSearchParams();
  cuerpo.append('access_token', ACCESS_TOKEN);
  cuerpo.append('execution_options', JSON.stringify(['validate_only']));
  cuerpo.append('name', 'ENSAYO DE PERMISOS — NO SE CREA');
  cuerpo.append('objective', 'OUTCOME_ENGAGEMENT');
  cuerpo.append('status', 'PAUSED');
  cuerpo.append('special_ad_categories', JSON.stringify([]));
  cuerpo.append('is_adset_budget_sharing_enabled', 'false');

  try {
    await axios.post(`${GRAPH_BASE}/${cuentaId}/campaigns`, cuerpo, { timeout: 60000 });
    return { ok: true };
  } catch (error) {
    const e = error.response?.data?.error;
    return {
      ok: false,
      mensaje: e?.error_user_title || e?.message || error.message,
      detalle: e?.error_user_msg || '',
      codigo: e?.code,
      subcodigo: e?.error_subcode,
    };
  }
}

/* -------------------------------------------------------------------------- */

const faltan = credencialesFaltantes();
if (faltan.length > 0) {
  console.error(`\n${C.rojo}${C.bold}  Faltan credenciales en el .env:${C.reset}`);
  faltan.forEach((v) => console.error(`${C.rojo}    - ${v.clave}  (${v.para})${C.reset}`));
  console.error('');
  process.exit(1);
}

console.log(`\n${C.cyan}${C.bold}CELRED ADS MANAGER${C.reset} ${C.dim}· que alcanza el token${C.reset}\n`);

const problemas = [];

/* --- 1. El token ---------------------------------------------------------- */

console.log(`${C.bold}1. TOKEN${C.reset}`);

const token = await leer('debug_token', { input_token: ACCESS_TOKEN });

if (!token.ok) {
  console.log(`  ${DUDA} No se pudo inspeccionar: ${token.mensaje}`);
  console.log(`${C.dim}      Suele pasar con tokens de usuario de sistema; no siempre es un problema.${C.reset}`);
} else {
  const d = token.datos.data || {};
  const caduca = d.expires_at ? new Date(d.expires_at * 1000) : null;

  console.log(`  ${d.is_valid ? OK : MAL} Valido: ${d.is_valid ? 'si' : 'NO'}`);
  console.log(`    ${C.dim}tipo:${C.reset} ${d.type || '—'}`);
  console.log(
    `    ${C.dim}app:${C.reset}  ${d.app_id || '—'}` +
      (APP_ID && d.app_id && String(d.app_id) !== APP_ID
        ? ` ${C.rojo}(el .env dice ${APP_ID})${C.reset}`
        : ''),
  );
  console.log(
    `    ${C.dim}caduca:${C.reset} ` +
      (caduca
        ? `${caduca.toISOString().slice(0, 16).replace('T', ' ')} UTC ${C.amarillo}(hay que renovarlo)${C.reset}`
        : `${C.verde}nunca — token de sistema${C.reset}`),
  );

  if (APP_ID && d.app_id && String(d.app_id) !== APP_ID) {
    problemas.push('El token pertenece a otra app distinta de META_APP_ID.');
  }
  if (!d.is_valid) problemas.push('El token no es valido.');

  const NECESARIOS = ['ads_management', 'ads_read', 'business_management', 'pages_show_list', 'pages_read_engagement'];
  const tiene = d.scopes || [];

  console.log(`    ${C.dim}permisos:${C.reset}`);
  for (const permiso of NECESARIOS) {
    const lo = tiene.includes(permiso);
    console.log(`      ${lo ? OK : MAL} ${permiso}${lo ? '' : `  ${C.rojo}FALTA${C.reset}`}`);
    if (!lo) problemas.push(`Al token le falta el permiso ${permiso}.`);
  }

  const extra = tiene.filter((p) => !NECESARIOS.includes(p));
  if (extra.length > 0) console.log(`      ${C.dim}otros: ${extra.join(', ')}${C.reset}`);
}

/* --- 2. Las cuentas publicitarias ----------------------------------------- */

console.log(`\n${C.bold}2. CUENTAS PUBLICITARIAS${C.reset}`);

const ESTADOS_CUENTA = {
  1: 'activa',
  2: 'deshabilitada',
  3: 'no pagada',
  7: 'en revision',
  8: 'pendiente de cierre',
  9: 'en periodo de gracia',
  100: 'cerrada',
  101: 'cualquier activa',
  201: 'cualquier cerrada',
};

for (const [etiqueta, id] of Object.entries(CUENTAS)) {
  const r = await leer(id, {
    fields: 'name,currency,account_status,min_daily_budget,timezone_name,disable_reason',
  });

  if (!r.ok) {
    console.log(`  ${MAL} ${etiqueta}  ${C.dim}${id}${C.reset}`);
    console.log(`      ${C.rojo}${r.mensaje}${C.reset}`);
    problemas.push(`No se alcanza la cuenta ${etiqueta} (${id}): ${r.mensaje}`);
    continue;
  }

  const d = r.datos;
  const activa = Number(d.account_status) === 1;
  const factor = factorMoneda(d.currency);

  console.log(`  ${activa ? OK : MAL} ${etiqueta}  ${C.bold}${d.name}${C.reset}  ${C.dim}${id}${C.reset}`);
  console.log(
    `      ${d.currency} · ${d.timezone_name} · estado ${d.account_status} ` +
      `(${ESTADOS_CUENTA[d.account_status] || 'desconocido'})`,
  );
  console.log(
    `      ${C.dim}presupuesto diario minimo: ${formatearMoneda(d.min_daily_budget || 0, d.currency, factor)}${C.reset}`,
  );

  if (!activa) problemas.push(`La cuenta ${etiqueta} no esta activa (estado ${d.account_status}).`);

  // Leer no es crear. Esta es la comprobacion que de verdad importa.
  const escribe = await puedeCrear(id);
  if (escribe.ok) {
    console.log(`      ${OK} ${C.verde}puede crear campanas${C.reset}`);
  } else {
    console.log(`      ${MAL} ${C.rojo}NO puede crear campanas: ${escribe.mensaje}${C.reset}`);
    if (escribe.detalle) console.log(`         ${C.amarillo}${escribe.detalle}${C.reset}`);
    console.log(
      `         ${C.dim}codigo ${escribe.codigo}${escribe.subcodigo ? ` · subcodigo ${escribe.subcodigo}` : ''}${C.reset}`,
    );
    problemas.push(`El token lee ${etiqueta} pero no puede crear en ella: ${escribe.mensaje}`);
  }
}

/* --- 3. La Pagina --------------------------------------------------------- */

console.log(`\n${C.bold}3. PAGINA DE FACEBOOK${C.reset}`);

if (!PAGE_ID) {
  console.log(`  ${MAL} Falta META_PAGE_ID en el .env.`);
  problemas.push('Falta META_PAGE_ID.');
} else {
  const r = await leer(PAGE_ID, { fields: 'id,name,category,link' });

  if (!r.ok) {
    console.log(`  ${MAL} ${PAGE_ID} — ${C.rojo}${r.mensaje}${C.reset}`);
    problemas.push(`No se puede leer la Pagina ${PAGE_ID}: ${r.mensaje}`);
  } else {
    console.log(`  ${OK} ${C.bold}${r.datos.name}${C.reset}  ${C.dim}${r.datos.id}${C.reset}`);
    if (r.datos.category) console.log(`      ${C.dim}${r.datos.category}${C.reset}`);
  }

  /* --- 4. WhatsApp vinculado (informativo) -------------------------------- */

  const wa = await leer(`${PAGE_ID}/whatsapp_business_account`, { fields: 'id,name' });
  console.log(`\n${C.bold}4. WHATSAPP VINCULADO A LA PAGINA${C.reset} ${C.dim}(informativo)${C.reset}`);

  if (wa.ok && wa.datos?.id) {
    console.log(`  ${OK} Cuenta de WhatsApp Business ${wa.datos.id}${wa.datos.name ? ` · ${wa.datos.name}` : ''}`);
  } else {
    console.log(`  ${DUDA} No se pudo leer: ${wa.mensaje || 'sin datos'}`);
  }

  console.log(
    `${C.dim}      Esto NO se valida ni bloquea nada: el numero de cada sede sale de\n` +
      `      lineas.xlsx y se escribe en el conjunto. Es solo para tu informacion.${C.reset}`,
  );
}

/* --- Cierre --------------------------------------------------------------- */

console.log(`\n${'─'.repeat(70)}`);

if (problemas.length === 0) {
  console.log(`${C.verde}${C.bold}  Todo en orden. El token alcanza lo que hace falta.${C.reset}\n`);
  process.exit(0);
}

console.log(`${C.rojo}${C.bold}  ${problemas.length} problema(s):${C.reset}`);
problemas.forEach((p) => console.log(`${C.rojo}   • ${p}${C.reset}`));
console.log('');
process.exit(1);
