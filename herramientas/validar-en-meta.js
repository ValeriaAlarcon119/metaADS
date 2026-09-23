#!/usr/bin/env node
/**
 * ============================================================================
 *  herramientas/validar-en-meta.js — Ensayo real contra Meta SIN crear nada
 * ============================================================================
 *  Ejecutar:  npm run validar <campana>
 *
 *  Manda a Meta exactamente los mismos parametros con los que se crearia la
 *  campana, pero con `execution_options=['validate_only']`. Meta los revisa
 *  como si fuera a crear, responde si los acepta... y no crea nada. No queda
 *  ningun objeto en Ads Manager.
 *
 *  Sirve para saber, antes de gastar una subida de 80 MB, si el token alcanza,
 *  si la Pagina se puede usar, si el presupuesto entra y si el targeting con la
 *  expansion apagada es valido.
 *
 *  LO QUE NO PUEDE COMPROBAR
 *  El creativo. `validate_only` no existe para /adcreatives, y el creativo
 *  necesita el asset ya subido. Si las 5 opciones de texto se aceptan o no,
 *  solo se sabe creando de verdad.
 * ============================================================================
 */

import axios from 'axios';

import { planificarEstructura, paramsDeCampana, paramsDeConjunto } from '../src/builder.js';
import { cargarCampana, listarCampanas } from '../src/campanas.js';
import { ACCESS_TOKEN, GRAPH_BASE, credencialesFaltantes, formatearMoneda } from '../src/config.js';

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

/**
 * POST con validate_only. Meta revisa los parametros y responde sin crear.
 * Los objetos van serializados igual que en la creacion real.
 */
async function ensayar(camino, params) {
  const cuerpo = new URLSearchParams();
  cuerpo.append('access_token', ACCESS_TOKEN);
  cuerpo.append('execution_options', JSON.stringify(['validate_only']));

  for (const [clave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null) continue;
    cuerpo.append(clave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor));
  }

  try {
    const { data } = await axios.post(`${GRAPH_BASE}/${camino}`, cuerpo, { timeout: 60000 });
    return { ok: true, datos: data };
  } catch (error) {
    const e = error.response?.data?.error;
    return {
      ok: false,
      mensaje: e?.message || error.message,
      titulo: e?.error_user_title || '',
      detalle: e?.error_user_msg || '',
      codigo: e?.code,
      subcodigo: e?.error_subcode,
      campo: e?.error_data?.blame_field_specs,
    };
  }
}

function contar(resultado, etiqueta) {
  if (resultado.ok) {
    console.log(`  ${OK} ${etiqueta}`);
    return true;
  }

  console.log(`  ${MAL} ${etiqueta}`);
  console.log(`      ${C.rojo}${resultado.mensaje}${C.reset}`);
  if (resultado.titulo) console.log(`      ${C.rojo}${resultado.titulo}${C.reset}`);
  if (resultado.detalle) console.log(`      ${C.amarillo}${resultado.detalle}${C.reset}`);
  if (resultado.codigo) {
    console.log(
      `      ${C.dim}codigo ${resultado.codigo}${resultado.subcodigo ? ` · subcodigo ${resultado.subcodigo}` : ''}${C.reset}`,
    );
  }
  if (resultado.campo) console.log(`      ${C.dim}campo: ${JSON.stringify(resultado.campo)}${C.reset}`);
  return false;
}

/* -------------------------------------------------------------------------- */

const faltan = credencialesFaltantes();
if (faltan.length > 0) {
  console.error(`\n${C.rojo}  Faltan credenciales en el .env: ${faltan.map((v) => v.clave).join(', ')}${C.reset}\n`);
  process.exit(1);
}

const nombre = process.argv.slice(2).find((a) => !a.startsWith('-')) || listarCampanas()[0];

console.log(
  `\n${C.cyan}${C.bold}CELRED ADS MANAGER${C.reset} ` +
    `${C.dim}· ensayo con validate_only — NO se crea nada${C.reset}\n`,
);

const campana = await cargarCampana(nombre);
console.log(`${C.dim}Campana:${C.reset} ${C.bold}${campana.archivo}${C.reset}`);
console.log(`${C.dim}Leyendo consecutivos reales en Ads Manager...${C.reset}\n`);

const plan = await planificarEstructura({ ...campana, estado: 'PAUSED' });

console.log(`${C.bold}LO QUE SE VA A ENSAYAR${C.reset}`);
console.log(`  cuenta      ${plan.cuenta.etiqueta} · ${plan.cuenta.id} (${plan.cuenta.name})`);
console.log(`  campana     ${plan.campana.nombre}`);
console.log(`  conjunto    ${plan.conjunto.nombre}`);
console.log(
  `  presupuesto ${formatearMoneda(plan.presupuesto.unidadMenor, plan.presupuesto.moneda, plan.presupuesto.factor)}`,
);
console.log(`  whatsapp    +${plan.whatsapp.telefono}`);
console.log(`  anuncios    ${plan.anuncios.map((a) => a.nombre).join('\n              ')}\n`);

let todoOk = true;

/* --- 1. La campana -------------------------------------------------------- */

console.log(`${C.bold}1. CAMPANA${C.reset}`);

// Los mismos parametros que usa la creacion real, no una copia.
todoOk = contar(
  await ensayar(`${plan.cuenta.id}/campaigns`, paramsDeCampana(plan, 'PAUSED')),
  'Meta acepta la campana',
) && todoOk;

/* --- 2. El conjunto ------------------------------------------------------- */

console.log(`\n${C.bold}2. CONJUNTO DE ANUNCIOS${C.reset}`);

// El conjunto necesita colgar de una campana. Como no se creo ninguna, se
// ensaya contra la ultima campana real de la cuenta: los campos que importan
// —presupuesto, destino, promoted_object, targeting— se validan igual.
let campanaDeApoyo = plan.campana.id;

if (!campanaDeApoyo) {
  try {
    const { data } = await axios.get(`${GRAPH_BASE}/${plan.cuenta.id}/campaigns`, {
      params: { access_token: ACCESS_TOKEN, fields: 'id,name', limit: 1 },
      timeout: 30000,
    });
    campanaDeApoyo = data?.data?.[0]?.id;
    if (campanaDeApoyo) {
      console.log(`  ${C.dim}se valida contra la campana existente ${campanaDeApoyo} (no se toca)${C.reset}`);
    }
  } catch {
    /* si no hay campanas, se avisa abajo */
  }
}

if (!campanaDeApoyo) {
  console.log(`  ${C.amarillo}No hay ninguna campana en la cuenta contra la que validar el conjunto.${C.reset}`);
  console.log(`${C.dim}      Se ensayara al crear de verdad.${C.reset}`);
} else {
  const paramsAdSet = paramsDeConjunto(plan, campanaDeApoyo, 'PAUSED');
  const conjuntoOk = contar(
    await ensayar(`${plan.cuenta.id}/adsets`, paramsAdSet),
    'Meta acepta el conjunto completo',
  );
  todoOk = conjuntoOk && todoOk;

  // Solo si el conjunto fallo: se repite quitando el numero de WhatsApp. Si
  // entonces pasa, el problema es el numero o el permiso sobre la Pagina.
  if (!conjuntoOk) {
    const sinNumero = { ...paramsAdSet, promoted_object: { page_id: paramsAdSet.promoted_object.page_id } };
    const r = await ensayar(`${plan.cuenta.id}/adsets`, sinNumero);
    console.log(
      r.ok
        ? `  ${C.amarillo}→ Sin el numero de WhatsApp SI pasa: el problema esta en el numero o en el permiso sobre la Pagina.${C.reset}`
        : `  ${C.dim}→ Tampoco pasa sin el numero: el problema es otro campo.${C.reset}`,
    );
  }
}

/* --- 3. Los creativos locales --------------------------------------------- */

console.log(`\n${C.bold}3. ARCHIVOS LOCALES${C.reset}`);
for (const anuncio of plan.anuncios) {
  console.log(
    `  ${OK} ${anuncio.archivo.nombre} · ${anuncio.archivo.tipo} · ${anuncio.archivo.megas} MB` +
      `${anuncio.archivo.porPartes ? ' · sube por partes' : ''}`,
  );
}
console.log(`${C.dim}      Los creativos no se pueden ensayar: validate_only no existe para`);
console.log(`      /adcreatives y el creativo necesita el asset ya subido.${C.reset}`);

/* --- Cierre --------------------------------------------------------------- */

console.log(`\n${'─'.repeat(70)}`);
if (todoOk) {
  console.log(`${C.verde}${C.bold}  Meta acepta la estructura. No se creo nada.${C.reset}`);
  console.log(`${C.dim}  Para crearla de verdad: npm run panel  o  node test-run.js ${campana.archivo}${C.reset}\n`);
  process.exit(0);
}

console.log(`${C.rojo}${C.bold}  Meta rechazo algo. No se creo nada.${C.reset}\n`);
process.exit(1);
