#!/usr/bin/env node
/**
 * ============================================================================
 *  herramientas/pruebas.js — Pruebas sin red ni credenciales
 * ============================================================================
 *  Ejecutar:  npm test
 *
 *  Verifica lo que se puede verificar sin llamar a Meta:
 *    - los cinco ejemplos de nombre del manual salen tal cual
 *    - los cinco errores frecuentes del punto 14 son rechazados
 *    - lineas.xlsx se lee y cada sede resuelve a un movil colombiano
 *    - los copys de la prueba de Neiva estan completos y dentro de limite
 *    - el targeting sale con toda la expansion apagada
 *    - el enlace de WhatsApp lleva numero y mensaje prellenado
 *
 *  Devuelve codigo de salida 1 si algo falla, para poder encadenarlo.
 * ============================================================================
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as nom from '../src/nomenclatura.js';
import {
  leerLineas,
  leerLineasConDiagnostico,
  lineaDeSede,
  normalizarTelefono,
  codigoDeTienda,
} from '../src/lineas.js';
import {
  construirTargeting,
  auditarExpansion,
  describirTargeting,
  sanitizarTargeting,
  normalizarExpansion,
  expansionPorDefecto,
  INTERRUPTORES_DE_EXPANSION,
  SEDES_DISPONIBLES,
  SEDES as SEDES_TARGETING,
} from '../src/targeting.js';
import {
  ENLACE_WHATSAPP,
  construirPageWelcomeMessage,
  normalizarNumeroWhatsApp,
  inspeccionarCreativoLocal,
  armarParamsAdCreative,
  escaleraDeIntentos,
  describirMejoras,
  MEJORAS_APAGADAS,
  MEJORAS_NUCLEO,
  MEJORA_DE_ROTACION_DE_TEXTO,
  MAX_OPCIONES_TEXTO,
} from '../src/creatives.js';
import { listarCampanas, cargarCampana, validarCampana } from '../src/campanas.js';
import { aplicarAjustes, CAMPOS_PROHIBIDOS } from '../src/ajustes.js';
import {
  interpretar,
  detectarSede,
  detectarProductos,
  detectarPresupuesto,
  segmentoDe,
  productosDeLaCarpeta,
} from '../src/interprete.js';
import { generarCopys, revisarReglasDePago, LLAMADOS_A_LA_ACCION, sinNegrilla, CREDITO_PARA_REPORTADOS } from '../src/copys.js';
import { formatearPrecio, leerPrecio, ponerPrecio, MARCA_PRECIO } from '../src/precios.js';
import { aplicarAjustes as aplicarAjustesPrecio } from '../src/ajustes.js';
import { DIRECCIONES, direccionDeSede, direccionEnUnaLinea } from '../src/direcciones.js';
import {
  CODIGOS_OBJETIVO,
  OBJETIVO_POR_DEFECTO,
  obtenerObjetivo,
  prefijoDe,
  usaWhatsApp,
  camposDeMeta,
  listarParaLaInterfaz,
} from '../src/objetivos.js';
import { cuentaDeSede, factorMoneda, aUnidadMenor, formatearMoneda } from '../src/config.js';
import { resolverCreativo, listarCreativosDeSede } from '../src/creativos-sede.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_LINEAS = resolve(process.env.CELRED_LINEAS_XLSX || join(RAIZ, 'lineas.xlsx'));

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', rojo: '\x1b[31m', verde: '\x1b[32m', cyan: '\x1b[36m' };

let pasadas = 0;
const fallas = [];

function comprobar(titulo, condicion, detalle = '') {
  if (condicion) {
    pasadas += 1;
    console.log(`  ${C.verde}✓${C.reset} ${titulo}`);
  } else {
    fallas.push({ titulo, detalle });
    console.log(`  ${C.rojo}✗ ${titulo}${C.reset}${detalle ? `\n      ${C.rojo}${detalle}${C.reset}` : ''}`);
  }
}

function seccion(titulo) {
  console.log(`\n${C.cyan}${C.bold}${titulo}${C.reset}`);
}

/* -------------------------------------------------------------------------- */

seccion('1. Nombres del manual (puntos 4, 5, 6, 10 y 13)');

const f170926 = new Date(2026, 8, 17);
comprobar(
  'Campana: C42 | VICTORIA | 170926',
  nom.nombreCampana({ numero: 42, sede: 'VICTORIA', fecha: f170926 }) === 'C42 | VICTORIA | 170926',
  nom.nombreCampana({ numero: 42, sede: 'VICTORIA', fecha: f170926 }),
);
comprobar(
  'Conjunto: C42 | VIC | CJTO1 | IPH-CRED',
  nom.nombreConjunto({ numeroCampana: 42, sede: 'VICTORIA', numeroConjunto: 1, segmento: 'IPH-CRED' }) ===
    'C42 | VIC | CJTO1 | IPH-CRED',
);
comprobar(
  'Conjunto en prueba: C42 | VIC | CJTO2 | AND-CRED | TEST',
  nom.nombreConjunto({
    numeroCampana: 42,
    sede: 'VICTORIA',
    numeroConjunto: 2,
    segmento: 'AND-CRED',
    sufijo: 'TEST',
  }) === 'C42 | VIC | CJTO2 | AND-CRED | TEST',
);
comprobar(
  'Anuncio con talento: ADS3 | VIC | VID | IPHONE 13 128GB | TATIANA',
  nom.nombreAnuncio({ numero: 3, sede: 'VICTORIA', formato: 'VID', referencia: 'iPhone 13 128GB', talento: 'Tatiana' }) ===
    'ADS3 | VIC | VID | IPHONE 13 128GB | TATIANA',
);
comprobar(
  'Anuncio con linea: ADS1 | L16 | IMG | REDMI NOTE 15 PRO | L2',
  nom.nombreAnuncio({ numero: 1, sede: 'LA16', formato: 'IMG', referencia: 'Redmi Note 15 Pro', linea: 'L2' }) ===
    'ADS1 | L16 | IMG | REDMI NOTE 15 PRO | L2',
);
comprobar(
  'Regional: R7 | IPIALES | EVENTO | 170926',
  nom.nombreCampanaRegional({ numero: 7, region: 'IPIALES', tipo: 'EVENTO', fecha: f170926 }) ===
    'R7 | IPIALES | EVENTO | 170926',
);
comprobar(
  'Conjunto regional sin distintivo: R7 | CJTO1 | GEO-5KM',
  nom.nombreConjuntoRegional({ numeroCampana: 7, numeroConjunto: 1, segmentacion: 'GEO-5KM' }) === 'R7 | CJTO1 | GEO-5KM',
);

seccion('2. Tildes, mayusculas y caracteres prohibidos (punto 2)');

comprobar('Tuquerres pierde la tilde', nom.normalizarCampo('Túquerres') === 'TUQUERRES');
comprobar('Puerto Asis pierde la tilde', nom.normalizarCampo('Puerto Asís') === 'PUERTO ASIS');
comprobar('La n con virgulilla se convierte', nom.normalizarCampo('Mañana') === 'MANANA');
comprobar('Se quitan las barras', !nom.normalizarCampo('15/09/26').includes('/'));
comprobar('Fecha DDMMAA de seis digitos', nom.fechaDDMMAA(f170926) === '170926');

seccion('3. Errores frecuentes del punto 14 (deben ser rechazados)');

for (const [nombre, nivel] of [
  ['Nuevo anuncio de Interacción', 'anuncio'],
  ['C3 VICTORIA PLAZA | INTE |18/08/26', 'campana'],
  ['CAMPAÑA #1 VICTORIA ... - Copia', 'campana'],
  ['C8 VICTORIA | 15/09', 'campana'],
  ['CAMPAÑA #10 LA 16 3169463848 DANIELA', 'campana'],
]) {
  comprobar(`Rechaza "${nombre}"`, !nom.auditarNombre(nombre, nivel).ok);
}

seccion('4. Listas cerradas');

comprobar('No acepta un segmento inventado', (() => {
  try {
    nom.nombreConjunto({ numeroCampana: 1, sede: 'NEIVA', numeroConjunto: 1, segmento: 'ANDROID-BARATO' });
    return false;
  } catch {
    return true;
  }
})());

comprobar('No acepta un formato distinto de IMG o VID', (() => {
  try {
    nom.nombreAnuncio({ numero: 1, sede: 'NEIVA', formato: 'CARRUSEL', referencia: 'X' });
    return false;
  } catch {
    return true;
  }
})());

comprobar('No acepta una sede que no existe', (() => {
  try {
    nom.obtenerSedeNomenclatura('BOGOTA');
    return false;
  } catch {
    return true;
  }
})());

seccion('5. Presupuestos (punto 9)');

comprobar('$35.000 de sede es valido', nom.validarPresupuesto(35000, 'sede').ok);
comprobar('$14.999 de sede se rechaza', !nom.validarPresupuesto(14999, 'sede').ok);
comprobar('$60.001 de sede se rechaza', !nom.validarPresupuesto(60001, 'sede').ok);
comprobar('$19.000 regional se rechaza', !nom.validarPresupuesto(19000, 'regional').ok);

seccion('6. Consecutivos');

const nombresReales = [
  'C3 | NEIVA | 150826',
  'C2 | NEIVA | 150826',
  'C1 | NEIVA | 290726',
  'C1 NEIVA | 3115279768 | GENERAL | TESTEO',
  'VACANTES NEIVA LIDER 10/7/26',
  'C61 | LA16 | 170926',
];
comprobar(
  'El siguiente C# de NEIVA es 4',
  nom.siguienteConsecutivoCampana(nombresReales, 'NEIVA').siguiente === 4,
  `dio ${nom.siguienteConsecutivoCampana(nombresReales, 'NEIVA').siguiente}`,
);
comprobar('Las vacantes de Neiva no cuentan como campana', nom.siguienteConsecutivoCampana(nombresReales, 'NEIVA').coincidencias.length === 4);
comprobar('El siguiente C# de LA16 es 62', nom.siguienteConsecutivoCampana(nombresReales, 'LA16').siguiente === 62);
comprobar('Una sede sin campanas arranca en C1', nom.siguienteConsecutivoCampana(nombresReales, 'MOCOA').siguiente === 1);
// El R# es OTRA serie. Antes el builder armaba el nombre regional con el
// consecutivo de la sede: con Neiva en C3, la primera regional salia R4.
const nombresConRegionales = [
  ...nombresReales,
  'R1 | NARINO | GEO | 100926',
  'R2 | NARINO | MAR | 120926',
  'R7 | PUTUMAYO | GEO | 010926',
];
comprobar(
  'El siguiente R# de NARINO es 3',
  nom.siguienteConsecutivoCampanaRegional(nombresConRegionales, 'NARINO').siguiente === 3,
  `dio ${nom.siguienteConsecutivoCampanaRegional(nombresConRegionales, 'NARINO').siguiente}`,
);
comprobar(
  'El R# de PUTUMAYO no se mezcla con el de NARINO',
  nom.siguienteConsecutivoCampanaRegional(nombresConRegionales, 'PUTUMAYO').siguiente === 8,
);
comprobar(
  'Una region sin regionales previas arranca en R1',
  nom.siguienteConsecutivoCampanaRegional(nombresConRegionales, 'NEIVA').siguiente === 1,
  'las C# de la sede NEIVA no deben contar como R#',
);
comprobar(
  'El C# de NEIVA no lo mueven las campanas regionales',
  nom.siguienteConsecutivoCampana(nombresConRegionales, 'NEIVA').siguiente === 4,
);
comprobar(
  'Una region inventada se rechaza',
  (() => {
    try {
      nom.siguienteConsecutivoCampanaRegional(nombresConRegionales, 'BOGOTA');
      return false;
    } catch {
      return true;
    }
  })(),
);
comprobar(
  'El consecutivo reconoce el nombre aunque lleve tilde',
  nom.siguienteConsecutivoCampana(['C9 | NEIVÁ | 150826'], 'NEIVA').siguiente === 10,
  'el rango de diacriticos estaba cortado en \\u032c y se saltaba las tildes',
);
comprobar(
  'CJTO# sigue al mayor existente',
  nom.siguienteConsecutivoConjunto(['C3 | CJTO3 | IPH-CRED', 'C3 | CJTO1 | IPH-CRED']).siguiente === 4,
);
comprobar(
  'ADS# tolera el espacio de los nombres viejos',
  nom.siguienteConsecutivoAnuncio(['ADS6 | VID | IPHONE 15 PRO', 'ADS 4 | IPH 14 IMG']).siguiente === 7,
);

seccion('7. lineas.xlsx');

let registros = [];
try {
  registros = leerLineas(RUTA_LINEAS);
  comprobar(`Se leyeron ${registros.length} lineas del Excel`, registros.length > 0);
} catch (error) {
  comprobar('Se pudo abrir lineas.xlsx', false, error.message);
}

comprobar('Todas las filas se asignaron a una sede', registros.every((r) => r.sede),
  registros.filter((r) => !r.sede).map((r) => r.tienda).join(', '));

// Solo las sedes abiertas: La Union todavia no tiene linea ni cuenta.
for (const codigo of nom.CODIGOS_SEDE_ACTIVA) {
  try {
    const r = lineaDeSede(RUTA_LINEAS, codigo);
    comprobar(
      `${codigo} resuelve a un movil colombiano (+${r.telefono})`,
      /^573\d{9}$/.test(r.telefono),
      r.telefono,
    );
  } catch (error) {
    comprobar(`${codigo} tiene linea en el Excel`, false, error.message.split('\n')[0]);
  }
}

comprobar('NEIVA es 573115279768', lineaDeSede(RUTA_LINEAS, 'NEIVA').telefono === '573115279768');
comprobar('Un numero con espacios se normaliza', normalizarTelefono('315 0913478') === '573150913478');
comprobar('Un numero fijo se rechaza', normalizarTelefono('6018001234') === null);

// Las trece tiendas del Excel, escritas como las escribe el equipo, tienen que
// caer en su codigo del manual. Si alguien renombra una, esto lo pilla.
const TIENDAS_DEL_EXCEL = {
  'EL LICEO': 'LICEO',
  'LA 16': 'LA16',
  SEBASTIAN: 'SEBASTIAN',
  MEDELLIN: 'MEDELLIN',
  MOCOA: 'MOCOA',
  'LA HORMIGA': 'HORMIGA',
  ORITO: 'ORITO',
  'PTO ASIS': 'PTOASIS',
  NEIVA: 'NEIVA',
  TUQUERRES: 'TUQUERRES',
  'VICTORIA PLAZA': 'VICTORIA',
  ZAFIRO: 'ZAFIRO',
  MARKUS: 'MARKUS',
};
for (const [comoLoEscriben, codigo] of Object.entries(TIENDAS_DEL_EXCEL)) {
  comprobar(
    `"${comoLoEscriben}" del Excel es la sede ${codigo}`,
    codigoDeTienda(comoLoEscriben) === codigo,
    `dio ${codigoDeTienda(comoLoEscriben)}`,
  );
}

// El titulo "LINEA MOVIL" se quedo en la columna A al borrar unas tablas,
// mientras los numeros siguen en la G. El lector tiene que fiarse de los datos
// y no del titulo — si se fiara del titulo leeria "1, 2, 3..." como telefonos.
const lectura = leerLineasConDiagnostico(RUTA_LINEAS);
comprobar(
  'Los telefonos se leen de la columna que de verdad los tiene',
  lectura.registros.length > 0 && lectura.registros.every((r) => /^573\d{9}$/.test(r.telefono)),
  lectura.registros.filter((r) => !/^573\d{9}$/.test(r.telefono)).map((r) => r.linea).join(', '),
);
comprobar(
  'Una columna deducida no pasa en silencio: queda un aviso',
  lectura.registros.every((r) => r.tabla.startsWith('G:')) ? lectura.avisos.length > 0 : true,
  'si la columna no es la que dice el titulo, tiene que avisarse',
);
comprobar(
  'El aviso del archivo llega hasta quien planifica la campana',
  lineaDeSede(RUTA_LINEAS, 'NEIVA').avisos.length >= lectura.avisos.length,
);

seccion('8. Targeting: las trece sedes y la de NEIVA en detalle');

// El sistema tiene que funcionar para cualquier sede, no solo la de la prueba.
for (const clave of SEDES_DISPONIBLES) {
  try {
    const t = construirTargeting(clave, {});
    const exp = auditarExpansion(t);
    const tieneGeo = Boolean(t.geo_locations.cities?.length || t.geo_locations.custom_locations?.length);
    comprobar(
      `${clave.padEnd(18)} se puede segmentar y sale sin expansion`,
      exp.ok && tieneGeo,
      exp.problemas.join(' '),
    );
  } catch (error) {
    comprobar(`${clave} se puede segmentar`, false, error.message.split('\n')[0]);
  }
}

// Las seis sedes que comparten ciudad no deben competir entre ellas por el
// mismo publico: por eso salen por punto y no por ciudad completa.
for (const clave of ['IPIALES_VICTORIA', 'IPIALES_ZAFIRO', 'IPIALES_MARKUS', 'PASTO_LA16', 'PASTO_SEBASTIAN', 'PASTO_LICEO']) {
  const t = construirTargeting(clave, {});
  comprobar(`${clave} usa el punto de la tienda, no la ciudad entera`, Boolean(t.geo_locations.custom_locations));
}

// Las siete que son la unica Celred de su ciudad si usan la ciudad completa.
for (const clave of ['TUQUERRES', 'ORITO', 'LA_HORMIGA', 'PUERTO_ASIS', 'MOCOA', 'MEDELLIN', 'NEIVA']) {
  const t = construirTargeting(clave, {});
  comprobar(`${clave} usa la ciudad de Meta`, Boolean(t.geo_locations.cities));
}

// Los dos modos tienen que poder forzarse desde la campana.
comprobar(
  'Una sede de ciudad puede forzarse a punto',
  Boolean(construirTargeting('NEIVA', { modoGeo: 'punto' }).geo_locations.custom_locations),
);
comprobar(
  'Una sede de punto puede forzarse a ciudad',
  Boolean(construirTargeting('PASTO_LA16', { modoGeo: 'ciudad' }).geo_locations.cities),
);

const targeting = construirTargeting('NEIVA', {
  edadMin: 18,
  edadMax: 55,
  radioKm: 40,
  modoGeo: 'ciudad',
  plataformas: ['facebook', 'instagram'],
  dispositivos: ['mobile'],
});

comprobar('La expansion queda toda apagada', auditarExpansion(targeting).ok, auditarExpansion(targeting).problemas.join(' '));
comprobar('advantage_audience = 0', targeting.targeting_automation.advantage_audience === 0);
// Meta elimino targeting_optimization y hoy rechaza el conjunto si se envia
// (codigo 100, subcodigo 1870197). Ahora la comprobacion es la contraria.
comprobar('targeting_optimization NO se envia (Meta lo elimino)', targeting.targeting_optimization === undefined);
comprobar(
  'Si alguien cuela targeting_optimization, se borra',
  sanitizarTargeting({ ...targeting, targeting_optimization: 'none' }).targeting_optimization === undefined,
);
comprobar(
  'Un targeting con targeting_optimization no pasa la auditoria',
  !auditarExpansion({ ...targeting, targeting_optimization: 'expansion_all' }).ok,
);
comprobar('No se manda flexible_spec', targeting.flexible_spec === undefined);
comprobar('Geo por ciudad de Meta', Array.isArray(targeting.geo_locations.cities));
comprobar('Radio de 40 km', targeting.geo_locations.cities[0].radius === 40);
comprobar('Ciudad de Neiva (key 474923)', targeting.geo_locations.cities[0].key === '474923');
comprobar('Solo a quien vive o estuvo alli', targeting.geo_locations.location_types.join(',') === 'home,recent');
comprobar('Sin Messenger en las ubicaciones', !targeting.publisher_platforms.includes('messenger'));
comprobar('El radio se recorta al tope de Meta', construirTargeting('NEIVA', { radioKm: 500 }).geo_locations.cities[0].radius === 80);

const descripcion = describirTargeting('NEIVA', targeting);
comprobar('La descripcion nombra los 40 km', descripcion.ubicacion.includes('40 km'), descripcion.ubicacion);

seccion('9. Creativos organizados por sede');

// No se fija una sede a mano: las piezas se mueven de carpeta y lo que hay que
// probar es el MECANISMO, no donde esten los archivos hoy. Se busca la primera
// sede que tenga algo y se prueba contra ella.
const sedeConPiezas = nom.CODIGOS_SEDE_ACTIVA.find((c) => listarCreativosDeSede(c).length > 0);
const otraSede = nom.CODIGOS_SEDE_ACTIVA.find((c) => c !== sedeConPiezas);

comprobar(
  'Alguna sede tiene piezas en creativos/',
  Boolean(sedeConPiezas),
  'todas las carpetas de creativos/ estan vacias',
);

if (sedeConPiezas) {
  const pieza = listarCreativosDeSede(sedeConPiezas)[0];
  const rutaRelativa = `./creativos/${sedeConPiezas.toLowerCase()}/${pieza.nombre}`;

  comprobar(
    `Un nombre suelto se resuelve contra la carpeta de su sede (${sedeConPiezas})`,
    resolverCreativo(sedeConPiezas, pieza.nombre).enCarpetaDeLaSede,
  );

  // El error caro y silencioso: pautar una sede con el creativo de otra.
  comprobar('Usar una pieza de otra sede se rechaza', (() => {
    try {
      resolverCreativo(otraSede, rutaRelativa);
      return false;
    } catch (e) {
      return e.message.includes(`no pertenece a ${otraSede}`);
    }
  })());

  comprobar(
    'Salvo que la campana lo autorice a proposito',
    resolverCreativo(otraSede, rutaRelativa, { permitirFueraDeLaSede: true }).enCarpetaDeLaSede === false,
  );
}

comprobar('Una pieza que no existe da un error claro', (() => {
  try {
    resolverCreativo('NEIVA', 'no-existe-esto.png');
    return false;
  } catch (e) {
    return e.message.includes('no existe');
  }
})());

seccion('10. Las campanas definidas en campanas/');

const LIMITES = { textosPrincipales: 125, titulos: 40, descripciones: 30 };
const campanasDefinidas = listarCampanas();

comprobar('Hay al menos una campana definida', campanasDefinidas.length > 0, campanasDefinidas.join(', '));
comprobar('La plantilla no aparece como campana', !campanasDefinidas.includes('_plantilla'));

/** Todas las campanas del proyecto, ya validadas. Se reusan mas abajo. */
const campanasCargadas = [];

for (const nombre of campanasDefinidas) {
  let campana;
  try {
    campana = await cargarCampana(nombre);
    campanasCargadas.push(campana);
    comprobar(`${nombre}: carga y valida sin errores`, true);
  } catch (error) {
    comprobar(`${nombre}: carga y valida sin errores`, false, error.message.split('\n').slice(0, 3).join(' '));
    continue;
  }

  const sedeFicha = nom.obtenerSedeNomenclatura(campana.sede);

  comprobar(`${nombre}: la sede ${campana.sede} existe en el manual`, Boolean(sedeFicha));
  comprobar(
    `${nombre}: presupuesto dentro del manual`,
    nom.validarPresupuesto(campana.presupuestoDiarioCop, campana.tipoPresupuesto).ok,
    nom.validarPresupuesto(campana.presupuestoDiarioCop, campana.tipoPresupuesto).avisos.join(' '),
  );
  comprobar(
    `${nombre}: como maximo ${nom.MAX_ANUNCIOS_POR_CONJUNTO} anuncios`,
    campana.anuncios.length <= nom.MAX_ANUNCIOS_POR_CONJUNTO,
  );

  for (const anuncio of campana.anuncios) {
    const etiqueta = `${nombre} · ${anuncio.referencia}`;

    for (const [campo, limite] of Object.entries(LIMITES)) {
      const lista = anuncio[campo] || [];
      comprobar(`${etiqueta}: hay ${campo}`, lista.length > 0 && lista.length <= 5, `hay ${lista.length}`);
      comprobar(`${etiqueta}: ${campo} sin repetidos`, new Set(lista).size === lista.length);

      // El texto principal pasa de 125 a proposito: lleva la direccion en su
      // renglon (formato de Celred). Se revisan titulos y descripciones.
      const largos = campo === 'textosPrincipales' ? [] : lista.filter((t) => t.length > limite);
      comprobar(
        `${etiqueta}: ${campo} dentro de ${limite} caracteres`,
        largos.length === 0,
        largos.map((t) => `${t.length}: "${t}"`).join(' | '),
      );
    }

    comprobar(`${etiqueta}: tiene mensaje prellenado`, Boolean(anuncio.mensajePrellenado));
    comprobar(`${etiqueta}: tiene saludo de WhatsApp`, Boolean(anuncio.saludoWhatsApp));
    comprobar(
      `${etiqueta}: el prellenado nombra el producto`,
      nom.normalizarCampo(anuncio.mensajePrellenado).includes(nom.normalizarCampo(anuncio.producto)),
      anuncio.mensajePrellenado,
    );
    // Nombrar la sede es opcional: solo aporta donde hay varias tiendas en la
    // misma ciudad. Lo que NUNCA puede pasar es repetir una palabra pegada
    // ("Celred Neiva Neiva"), que fue un fallo real.
    comprobar(
      `${etiqueta}: el prellenado no repite ninguna palabra seguida`,
      !/\b(\w+)\s+\1\b/i.test(anuncio.mensajePrellenado),
      anuncio.mensajePrellenado,
    );

    // Nada de precios, cuotas ni superlativos: no hay cifra respaldada en COP.
    const todoElTexto = [...anuncio.textosPrincipales, ...anuncio.titulos, ...anuncio.descripciones].join(' ');
    comprobar(
      `${etiqueta}: ningun copy menciona cifras de precio`,
      !/\$|\bCOP\b|\bpesos\b|\bcuotas? de\b/i.test(todoElTexto),
      todoElTexto.match(/\$[^\s]*|\bCOP\b|\bpesos\b/gi)?.join(' ') || '',
    );
    comprobar(
      `${etiqueta}: sin superlativos no demostrables`,
      !/\bel mejor\b|\bla mejor\b|\bgarantizad[oa]\b|\bel m[aá]s r[aá]pido\b/i.test(todoElTexto),
    );
    // Confirmado por la sede: no se nombran plataformas de credito.
    comprobar(
      `${etiqueta}: no nombra financieras`,
      !/\bAddi\b|\bSistecr[eé]dito\b|\bBanco de Bogot[aá]\b|\bSUCUPO\b|\bKrediya\b/i.test(todoElTexto),
      todoElTexto.match(/Addi|Sistecr[eé]dito|Banco de Bogot[aá]|SUCUPO|Krediya/gi)?.join(' ') || '',
    );

    // La nomenclatura no lleva capacidad en GB ni nombre de talento.
    comprobar(
      `${etiqueta}: la referencia no lleva capacidad en GB`,
      !/\d+\s*(GB|TB)\b/i.test(anuncio.referencia),
      anuncio.referencia,
    );
    comprobar(`${etiqueta}: el anuncio no declara talento`, !anuncio.talento);

    const nombreAd = nom.nombreAnuncio({
      numero: 1,
      sede: campana.sede,
      formato: anuncio.formato,
      referencia: anuncio.referencia,
    });
    comprobar(`${etiqueta}: su nombre cumple el manual`, nom.auditarNombre(nombreAd, 'anuncio').ok, nombreAd);

    try {
      const archivo = inspeccionarCreativoLocal(anuncio.rutaCreativoLocal);
      const esperado = anuncio.formato === 'IMG' ? 'imagen' : 'video';
      comprobar(`${etiqueta}: el creativo existe y es ${esperado}`, archivo.tipo === esperado, `es ${archivo.tipo}`);
    } catch (error) {
      comprobar(`${etiqueta}: el creativo existe`, false, error.message.split('\n')[0]);
    }
  }

  // Dos anuncios de la misma campana no deben repetir textos.
  const textosPorAnuncio = campana.anuncios.map((a) => a.textosPrincipales);
  const todos = textosPorAnuncio.flat();
  comprobar(`${nombre}: los anuncios no repiten textos entre si`, new Set(todos).size === todos.length);
}

seccion('11. El estado no se puede forzar desde el archivo de la campana');

/**
 * Campana de mentira, armada aqui mismo sobre la primera pieza que exista.
 *
 * Antes esta seccion partia de la primera campana de campanas/, y el dia que
 * alguien movio los creativos de Neiva a otra carpeta las tres pruebas
 * fallaron por arrastre: la campana no cargaba y el objeto llegaba vacio. Lo
 * que se prueba aqui es la regla del estado, no que una campana concreta siga
 * teniendo sus archivos.
 *
 * El creativo si tiene que existir de verdad, porque validarCampana lo
 * comprueba — por eso se usa la pieza que se encontro en la seccion 9.
 */
const campanaDeMentira = sedeConPiezas
  ? {
      archivo: '_de-prueba',
      sede: sedeConPiezas,
      // La clave de targeting no siempre es el codigo: LA16 es PASTO_LA16.
      sedeTargeting: Object.keys(SEDES_TARGETING).find((k) => SEDES_TARGETING[k].codigo === sedeConPiezas),
      objetivo: 'MENSAJES_WHATSAPP',
      conjuntos: [
        {
          segmento: 'AND-CRED',
          presupuestoDiarioCop: 35000,
          tipoPresupuesto: 'sede',
          anuncios: [
            {
              formato: listarCreativosDeSede(sedeConPiezas)[0].tipo === 'video' ? 'VID' : 'IMG',
              producto: 'EQUIPO DE PRUEBA',
              referencia: 'EQUIPO DE PRUEBA 128GB',
              rutaCreativoLocal: listarCreativosDeSede(sedeConPiezas)[0].nombre,
              mensajePrellenado: 'Hola, quiero informacion',
              textosPrincipales: ['Uno para reportados', 'Dos para reportados', 'Tres para reportados', 'Cuatro para reportados', 'Cinco para reportados'],
              titulos: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'],
              descripciones: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'],
            },
          ],
        },
      ],
    }
  : null;

if (!campanaDeMentira) {
  comprobar('Hay alguna pieza con la que armar la campana de prueba', false, 'creativos/ esta vacio');
} else {
  comprobar('Una campana que pide ACTIVE se rechaza', (() => {
    try {
      validarCampana({ ...campanaDeMentira, estado: 'ACTIVE' });
      return false;
    } catch (e) {
      return e.message.includes('--publicar-en-vivo');
    }
  })());
  comprobar('Una campana que pide PAUSED se acepta', (() => {
    try {
      validarCampana({ ...campanaDeMentira, estado: 'PAUSED' });
      return true;
    } catch {
      return false;
    }
  })(), validarProblemas(campanaDeMentira));
  comprobar('Un segmento inventado en una campana se rechaza', (() => {
    try {
      validarCampana({
        ...campanaDeMentira,
        conjuntos: campanaDeMentira.conjuntos.map((c) => ({ ...c, segmento: 'LO-QUE-SEA' })),
      });
      return false;
    } catch (e) {
      return e.message.includes('lista cerrada');
    }
  })());
}

/** El mensaje de validarCampana, para poder enseñarlo cuando una prueba falla. */
function validarProblemas(cfg) {
  try {
    validarCampana({ ...cfg, estado: 'PAUSED' });
    return '';
  } catch (e) {
    return e.message.split('\n').join(' ');
  }
}

seccion('12. La cuenta publicitaria se deduce de la sede (punto 7)');

const CUENTA_CA01 = 'act_2191226887906149';
const CUENTA_CA02 = 'act_2776880309009610';

for (const [codigo, esperada] of [
  ['VICTORIA', CUENTA_CA01],
  ['TUQUERRES', CUENTA_CA01],
  ['ORITO', CUENTA_CA01],
  ['MOCOA', CUENTA_CA01],
  ['LA16', CUENTA_CA02],
  ['SEBASTIAN', CUENTA_CA02],
  ['LICEO', CUENTA_CA02],
  ['ZAFIRO', CUENTA_CA02],
  ['MARKUS', CUENTA_CA02],
  ['HORMIGA', CUENTA_CA02],
  ['PTOASIS', CUENTA_CA02],
  ['NEIVA', CUENTA_CA02],
]) {
  const r = cuentaDeSede(nom.obtenerSedeNomenclatura(codigo));
  comprobar(`${codigo.padEnd(10)} va a ${esperada === CUENTA_CA01 ? 'CA 01' : 'CA 02'}`, r.id === esperada, r.id);
}

// Medellin esta en las dos cuentas: hay que poder elegir, y si no se elige,
// el sistema tiene que decirlo en vez de decidir en silencio.
const med = nom.obtenerSedeNomenclatura('MEDELLIN');
comprobar('MEDELLIN sin elegir cuenta avisa', cuentaDeSede(med).avisos.length > 0);
comprobar("MEDELLIN con cuenta: 'CA 01' va a CA 01", cuentaDeSede(med, 'CA 01').id === CUENTA_CA01);
comprobar("MEDELLIN con cuenta: 'CA 02' va a CA 02", cuentaDeSede(med, 'CA 02').id === CUENTA_CA02);
comprobar("MEDELLIN acepta 'CA01' sin espacio", cuentaDeSede(med, 'CA01').id === CUENTA_CA01);

seccion('13. Destino WhatsApp: enlace pelado y mensaje prellenado');

// El numero NO va en la URL. Si va, Meta lo ignora y los mensajes caen en la
// linea que tenga vinculada la Pagina: un fallo silencioso que mandaria los
// leads de Neiva a otra sede.
comprobar('El enlace es exactamente la URL base', ENLACE_WHATSAPP === 'https://api.whatsapp.com/send');
comprobar('El enlace NO lleva el numero', !ENLACE_WHATSAPP.includes('phone='));
comprobar('El enlace NO lleva el texto prellenado', !ENLACE_WHATSAPP.includes('text='));

comprobar('Un movil colombiano queda en solo digitos', normalizarNumeroWhatsApp('+57 311 527 9768') === '573115279768');
comprobar('Un numero vacio se rechaza', (() => {
  try {
    normalizarNumeroWhatsApp('');
    return false;
  } catch {
    return true;
  }
})());

for (const campana of campanasCargadas) {
  for (const anuncio of campana.anuncios) {
    const pwm = construirPageWelcomeMessage({
      mensajePrellenado: anuncio.mensajePrellenado,
      saludo: anuncio.saludoWhatsApp,
    });
    const etiqueta = `${campana.archivo} · ${anuncio.referencia}`;

    comprobar(`${etiqueta}: page_welcome_message es VISUAL_EDITOR v2`, pwm.type === 'VISUAL_EDITOR' && pwm.version === 2);
    comprobar(`${etiqueta}: landing_screen_type welcome_message`, pwm.landing_screen_type === 'welcome_message');
    comprobar(
      `${etiqueta}: customer_action_type autofill_message`,
      pwm.text_format.customer_action_type === 'autofill_message',
    );
    comprobar(
      `${etiqueta}: el prellenado va en autofill_message.content`,
      pwm.text_format.message.autofill_message.content === anuncio.mensajePrellenado,
    );
    comprobar(`${etiqueta}: el saludo va en message.text`, pwm.text_format.message.text === anuncio.saludoWhatsApp);
    comprobar(`${etiqueta}: se serializa a JSON sin perder nada`, (() => {
      const ida = JSON.stringify(pwm);
      return JSON.parse(ida).text_format.message.autofill_message.content === anuncio.mensajePrellenado;
    })());
  }
}

comprobar('Sin mensaje prellenado se rechaza', (() => {
  try {
    construirPageWelcomeMessage({ mensajePrellenado: '' });
    return false;
  } catch {
    return true;
  }
})());

/* -------------------------------------------------------------------------- */

seccion('14. Los 5 textos viajan completos y ningun reintento los reduce');

const assetFalso = { tipo: 'imagen', hash: 'abc123' };
const assetVideoFalso = { tipo: 'video', videoId: '999', miniaturaUrl: 'https://x/y.jpg' };

const cincoTextos = {
  nombre: 'PRUEBA | CREATIVO',
  textosPrincipales: ['t1', 't2', 't3', 't4', 't5'],
  titulos: ['h1', 'h2', 'h3', 'h4', 'h5'],
  descripciones: ['d1', 'd2', 'd3', 'd4', 'd5'],
  mensajePrellenado: 'Hola, quiero informacion.',
};

const escaleraMultiple = escaleraDeIntentos('multiple');

comprobar(
  'La escalera de modo multiple tiene mas de un escalon',
  escaleraMultiple.length > 1,
  `${escaleraMultiple.length} escalones`,
);
comprobar(
  'NINGUN escalon del modo multiple baja a texto simple',
  escaleraMultiple.every((e) => e.modoTexto === 'multiple'),
  escaleraMultiple.map((e) => e.modoTexto).join(', '),
);
comprobar(
  'La escalera de modo simple solo tiene escalones simples',
  escaleraDeIntentos('simple').every((e) => e.modoTexto === 'simple'),
);

for (const [i, escalon] of escaleraMultiple.entries()) {
  const params = armarParamsAdCreative({ ...cincoTextos, asset: assetFalso, ...escalon });
  const feed = params.asset_feed_spec || {};
  comprobar(
    `Escalon ${i + 1} manda los 5 textos, 5 titulos y 5 descripciones`,
    feed.bodies?.length === 5 && feed.titles?.length === 5 && feed.descriptions?.length === 5,
    `bodies=${feed.bodies?.length} titles=${feed.titles?.length} descriptions=${feed.descriptions?.length}`,
  );
}

comprobar(
  'El modo multiple con video tambien manda los 5 de cada uno',
  (() => {
    const p = armarParamsAdCreative({ ...cincoTextos, asset: assetVideoFalso, modoTexto: 'multiple' });
    return p.asset_feed_spec.bodies.length === 5 && p.object_story_spec.video_data?.video_id === '999' && !p.object_story_spec.link_data && !p.asset_feed_spec.videos;
  })(),
);

comprobar(
  `Mas de ${MAX_OPCIONES_TEXTO} textos se rechaza en vez de recortarse`,
  (() => {
    try {
      armarParamsAdCreative({
        ...cincoTextos,
        textosPrincipales: ['t1', 't2', 't3', 't4', 't5', 't6'],
        asset: assetFalso,
      });
      return false;
    } catch {
      return true;
    }
  })(),
);

comprobar(
  'El escalon con bienvenida sin serializar la manda como objeto',
  (() => {
    const p = armarParamsAdCreative({ ...cincoTextos, asset: assetFalso, bienvenidaComoObjeto: true });
    return typeof p.object_story_spec.link_data.page_welcome_message === 'object';
  })(),
);
comprobar(
  'Por defecto la bienvenida viaja serializada como string',
  typeof armarParamsAdCreative({ ...cincoTextos, asset: assetFalso }).object_story_spec.link_data
    .page_welcome_message === 'string',
);

comprobar(
  'El modo simple, si se pide a proposito, si usa un solo texto',
  (() => {
    const p = armarParamsAdCreative({ ...cincoTextos, asset: assetFalso, modoTexto: 'simple' });
    return !p.asset_feed_spec && p.object_story_spec.link_data.message === 't1';
  })(),
);

/* -------------------------------------------------------------------------- */

seccion('15. Cero optimizaciones automaticas de Meta');

const mejorasMultiple = describirMejoras({ modoTexto: 'multiple', nivel: 'completo' });
const mejorasSimple = describirMejoras({ modoTexto: 'simple', nivel: 'completo' });

comprobar(
  'Se apagan todas las mejoras de la lista',
  mejorasMultiple.apagadas.length === MEJORAS_APAGADAS.length,
  `${mejorasMultiple.apagadas.length} de ${MEJORAS_APAGADAS.length}`,
);
comprobar(
  'standard_enhancements va declarada en OPT_OUT',
  mejorasMultiple.apagadas.includes('standard_enhancements'),
);
for (const funcion of ['image_touchups', 'text_generation', 'enhance_cta', 'inline_comment', 'advantage_plus_creative']) {
  comprobar(`${funcion} queda en OPT_OUT`, mejorasMultiple.apagadas.includes(funcion));
}
comprobar(
  'La rotacion de texto NO aparece entre las apagadas en modo multiple',
  !mejorasMultiple.apagadas.includes(MEJORA_DE_ROTACION_DE_TEXTO),
);
comprobar(
  'En modo multiple la rotacion de texto va en OPT_IN',
  mejorasMultiple.rotacionDeTexto === 'OPT_IN',
  mejorasMultiple.rotacionDeTexto,
);
comprobar(
  'En modo simple la rotacion de texto va en OPT_OUT',
  mejorasSimple.rotacionDeTexto === 'OPT_OUT',
  mejorasSimple.rotacionDeTexto,
);

comprobar(
  'En el creativo real, la unica en OPT_IN es la rotacion de texto',
  (() => {
    const p = armarParamsAdCreative({ ...cincoTextos, asset: assetFalso, modoTexto: 'multiple' });
    const spec = p.degrees_of_freedom_spec.creative_features_spec;
    const encendidas = Object.entries(spec)
      .filter(([, v]) => v.enroll_status === 'OPT_IN')
      .map(([k]) => k);
    return encendidas.length === 1 && encendidas[0] === MEJORA_DE_ROTACION_DE_TEXTO;
  })(),
);

comprobar(
  'El escalon de respaldo sigue apagando las mejoras confirmadas',
  describirMejoras({ modoTexto: 'multiple', nivel: 'nucleo' }).apagadas.length === MEJORAS_NUCLEO.length,
);
comprobar(
  'El ultimo escalon no declara mejoras (y el sistema lo reporta)',
  escaleraMultiple.at(-1).mejoras === 'ninguno',
);

comprobar(
  'La expansion de publico sigue apagada en las trece sedes',
  SEDES_DISPONIBLES.every((sede) => auditarExpansion(construirTargeting(sede, {})).ok),
);

/* -------------------------------------------------------------------------- */

seccion('16. El panel solo puede tocar lo que esta en la lista blanca');

// Si las campanas de campanas/ no cargan —normalmente porque alguien movio un
// creativo de carpeta— se usa la campana de mentira de la seccion 11. Lo que
// se prueba aqui es la lista blanca de ajustes, no el disco.
const campanaBase =
  campanasCargadas[0] ||
  (campanaDeMentira ? validarCampana({ ...campanaDeMentira, estado: 'PAUSED' }) : null);

if (!campanaBase) {
  comprobar('Hay alguna campana con la que probar los ajustes', false, 'ni campanas/ ni creativos/');
}

comprobar('Sin ajustes, la configuracion no cambia', (() => {
  const { cambios } = aplicarAjustes(campanaBase, {});
  return cambios.length === 0;
})());

/** Atajo: ajustes para el primer conjunto. */
const alPrimerConjunto = (parche) => ({ conjuntos: [parche] });

comprobar('Un cambio de presupuesto se aplica y queda anotado', (() => {
  const { cfg, cambios } = aplicarAjustes(campanaBase, alPrimerConjunto({ presupuestoDiarioCop: 42000 }));
  return cfg.conjuntos[0].presupuestoDiarioCop === 42000 && cambios.some((c) => c.despues === '42000');
})());

comprobar('Un radio fuera de rango se rechaza', (() => {
  try {
    aplicarAjustes(campanaBase, alPrimerConjunto({ segmentacion: { radioKm: 500 } }));
    return false;
  } catch {
    return true;
  }
})());

comprobar('Una edad minima mayor que la maxima se rechaza', (() => {
  try {
    aplicarAjustes(campanaBase, alPrimerConjunto({ segmentacion: { edadMin: 50, edadMax: 20 } }));
    return false;
  } catch {
    return true;
  }
})());

comprobar('Seis textos principales se rechazan', (() => {
  try {
    aplicarAjustes(campanaBase, alPrimerConjunto({ anuncios: [{ textosPrincipales: ['a', 'b', 'c', 'd', 'e', 'f'] }] }));
    return false;
  } catch {
    return true;
  }
})());

comprobar('Textos principales repetidos se rechazan', (() => {
  try {
    aplicarAjustes(campanaBase, alPrimerConjunto({ anuncios: [{ textosPrincipales: ['a', 'a', 'b'] }] }));
    return false;
  } catch {
    return true;
  }
})());

comprobar('Una lista de textos vacia se rechaza', (() => {
  try {
    aplicarAjustes(campanaBase, alPrimerConjunto({ anuncios: [{ titulos: [] }] }));
    return false;
  } catch {
    return true;
  }
})());

comprobar('Editar los textos de un anuncio funciona', (() => {
  const { cfg } = aplicarAjustes(campanaBase, alPrimerConjunto({ anuncios: [{ titulos: ['Uno', 'Dos', 'Tres'] }] }));
  const t = cfg.conjuntos[0].anuncios[0].titulos;
  return t.length === 3 && t[0] === 'Uno';
})());

comprobar('El nombre de campana a mano se guarda para auditarlo despues', (() => {
  const { cfg } = aplicarAjustes(campanaBase, { campana: { nombre: 'C9 | NEIVA | 010126' } });
  return cfg.nombreCampanaManual === 'C9 | NEIVA | 010126';
})());

for (const campo of ['estado', 'permitirEnVivo', 'sede', 'rutaCreativoLocal', 'permitirCreativoFueraDeLaSede']) {
  comprobar(`El panel NO puede cambiar "${campo}"`, (() => {
    const { cfg, rechazados } = aplicarAjustes(campanaBase, alPrimerConjunto({ [campo]: 'lo-que-sea' }));
    return rechazados.includes(campo) && cfg[campo] === campanaBase[campo];
  })());
}

comprobar(
  'La lista de campos prohibidos cubre el estado y la publicacion en vivo',
  CAMPOS_PROHIBIDOS.includes('estado') && CAMPOS_PROHIBIDOS.includes('permitirEnVivo'),
);

comprobar('Mas ajustes de anuncios que anuncios se rechaza', (() => {
  try {
    aplicarAjustes(campanaBase, alPrimerConjunto({ anuncios: new Array(9).fill({ titulos: ['x'] }) }));
    return false;
  } catch {
    return true;
  }
})());

comprobar('Mas ajustes de conjuntos que conjuntos se rechaza', (() => {
  try {
    aplicarAjustes(campanaBase, { conjuntos: new Array(4).fill({ presupuestoDiarioCop: 20000 }) });
    return false;
  } catch {
    return true;
  }
})());

/* -------------------------------------------------------------------------- */

seccion('17. El interprete: de una frase a una campana');

comprobar('Reconoce "la 16" como LA16, no como Pasto a secas', detectarSede('campana para la sede la 16').sede === 'LA16');
comprobar('Reconoce "la victoria" como VICTORIA', detectarSede('campana para la victoria').sede === 'VICTORIA');
comprobar('Prefiere la sede concreta sobre la ciudad', detectarSede('campana para pasto sede la 16').sede === 'LA16');
comprobar('"pasto" a secas es ambiguo y no adivina', (() => {
  const r = detectarSede('campana para pasto de iphone 15');
  return r.sede === null && r.ambiguo.length === 3;
})());
comprobar('"ipiales" a secas es ambiguo', detectarSede('campana para ipiales').ambiguo?.length === 3);
comprobar('Una sede unica en su ciudad se reconoce sola', detectarSede('campana para neiva').sede === 'NEIVA');

comprobar('Lee "iphone 16"', detectarProductos('campana de iphone 16')[0]?.referencia === 'IPHONE 16');
comprobar('Lee "samsung a07"', detectarProductos('con samsung a07')[0]?.referencia === 'SAMSUNG A07');
comprobar('Lee modelos con nombre: "tecno camon 50 pro"', (() => {
  const p = detectarProductos('con tecno camon 50 pro');
  return p[0]?.referencia === 'TECNO CAMON 50 PRO';
})());
comprobar('Separa equipos unidos por "y"', detectarProductos('samsung a07 y samsung a17').length === 2);
comprobar('Separa equipos unidos por "e"', detectarProductos('tecno camon 50 pro e infinix hot 60 pro').length === 2);
comprobar('Una marca sin modelo no es un producto', detectarProductos('campana de android samsung').length === 0);
comprobar('No repite el mismo equipo dos veces', detectarProductos('iphone 15 y iphone 15').length === 1);

// Asi es como se escribe de verdad: pegado, como el nombre del archivo.
comprobar('Lee la marca pegada al modelo: "infinixhot60pro"', (() => {
  const p = detectarProductos('campana para neiva para infinixhot60pro');
  return p[0]?.referencia === 'INFINIX HOT 60 PRO' && p[0]?.familia === 'AND';
})());
comprobar('Lee "tecnocamon50pro"', detectarProductos('con tecnocamon50pro')[0]?.referencia === 'TECNO CAMON 50 PRO');
comprobar('Lee "iphone15" pegado', detectarProductos('de iphone15')[0]?.referencia === 'IPHONE 15');
comprobar('Lee "samsunga07" sin partir el modelo', (() => {
  const p = detectarProductos('con samsunga07');
  return p[0]?.referencia === 'SAMSUNG A07';
})());
comprobar('"motorolaedge50" usa Motorola, no Moto', (() => {
  const p = detectarProductos('con motorolaedge50');
  return p[0]?.producto.startsWith('Motorola Edge');
})());
comprobar('Una marca pegada sin numero no cuenta como producto', detectarProductos('con samsunggalaxy').length === 0);

comprobar('Lee "35 mil" como 35000', detectarPresupuesto('con 35 mil diarios') === 35000);
comprobar('Lee "$35.000" como 35000', detectarPresupuesto('presupuesto de $35.000 al dia') === 35000);
comprobar('Sin presupuesto devuelve null', detectarPresupuesto('campana para la 16 de iphone') === null);

comprobar('iPhone a credito da IPH-CRED', segmentoDe('IPH', { credito: true, contado: false }) === 'IPH-CRED');
comprobar('Android de contado da AND-CONT', segmentoDe('AND', { credito: false, contado: true }) === 'AND-CONT');
comprobar('Sin decir nada se asume credito', segmentoDe('AND', {}) === 'AND-CRED');
comprobar('Retoma gana sobre la familia', segmentoDe('IPH', { retoma: true }) === 'RETOMA');
comprobar('Mac e iPad dan MAC-IPAD', segmentoDe('MAC', { credito: true }) === 'MAC-IPAD');

comprobar('Sin sede no arma nada y lo dice', (() => {
  const r = interpretar('quiero una campana de iphone 16');
  return !r.ok && r.problemas.length > 0;
})());
comprobar('Sin equipos no arma nada y lo dice', (() => {
  const r = interpretar('campana para la sede la 16');
  return !r.ok && r.problemas[0].includes('ningun equipo');
})());
comprobar('Un equipo sin creativo se reporta, no se inventa', (() => {
  const r = interpretar('campana para la sede la 16 con el iphone 16');
  return !r.ok && r.problemas.some((p) => p.includes('No hay creativo'));
})());

// Estas dos van contra la sede que TENGA piezas, no contra una fija: los
// archivos se mueven de carpeta y la prueba no debe depender de donde esten
// hoy. La frase nombra los modelos que hay en la carpeta: el modelo es obligatorio.
if (sedeConPiezas) {
  const modelos = productosDeLaCarpeta(sedeConPiezas, 'AND').productos.map((p) => p.referencia.toLowerCase());
  const frase = `campana para ${sedeConPiezas.toLowerCase()} con ${modelos.join(' y ')}`;

  comprobar(`Arma la campana de ${sedeConPiezas} con las piezas que existen`, (() => {
    const r = interpretar(frase);
    return r.ok && r.cfg.conjuntos.length === 1 && r.cfg.conjuntos[0].anuncios.length >= 1;
  })(), interpretar(frase).problemas?.join(' '));

  comprobar('El formato sale del archivo, no de la frase', (() => {
    const r = interpretar(frase);
    if (!r.ok) return false;
    // Cada anuncio lleva el formato del archivo que lo respalda.
    return r.cfg.conjuntos[0].anuncios.every(
      (a) => a.formato === (/\.(mp4|mov|avi|mkv)$/i.test(a.rutaCreativoLocal) ? 'VID' : 'IMG'),
    );
  })());
}

comprobar('Separa iPhone y Android en conjuntos distintos', (() => {
  // Se comprueba el agrupado, que no depende de que existan las piezas.
  const productos = detectarProductos('android redmi 15 y samsung a07 y de iphone el iphone 15 y el iphone 13');
  const familias = new Set(productos.map((p) => p.familia));
  return familias.size === 2 && familias.has('AND') && familias.has('IPH');
})());

comprobar('Reparte tres equipos mezclados: dos Android y un iPhone', (() => {
  const r = interpretar('campana para neiva con redmi 17, iphone 13 y infinixhot60pro');
  const g = r.lectura.agrupacionPrevista;
  const and = g.find((x) => x.segmento.startsWith('AND'));
  const iph = g.find((x) => x.segmento.startsWith('IPH'));
  return g.length === 2 && and.equipos.length === 2 && iph.equipos.length === 1;
})());

comprobar('El reparto se enseña aunque falten creativos', (() => {
  const r = interpretar('campana para la victoria con redmi 15, samsung a07 y iphone 15');
  // En Victoria no hay piezas, asi que no sale campana, pero SI el reparto.
  return !r.ok && r.lectura.agrupacionPrevista.length === 2;
})());

/* --- Lectura de la carpeta (el modelo es obligatorio en la orden) ------ */

// Contra la sede que TENGA piezas: los archivos cambian de carpeta y lo que se
// prueba es el barrido, no donde vivan hoy.
if (sedeConPiezas) {
  const nombreSede = sedeConPiezas.toLowerCase();
  const delBarrido = productosDeLaCarpeta(sedeConPiezas);
  const primeraReferencia = delBarrido.productos[0]?.referencia;

  comprobar(
    `Lee los equipos que hay en la carpeta de ${sedeConPiezas}`,
    delBarrido.productos.length > 0,
    `no identifico nada en creativos/${nombreSede}/`,
  );

  comprobar(`"campana para ${nombreSede} de android" ya NO barre la carpeta: pide el modelo`, (() => {
    const r = interpretar(`ayudame a crear una campana para ${nombreSede} de android`);
    return !r.ok && r.problemas.some((p) => p.includes('sin decir el modelo'));
  })());

  comprobar('Nombrar modelos NO dispara el barrido de la carpeta', (() => {
    const r = interpretar(`campana para ${nombreSede} con ${primeraReferencia.toLowerCase()}`);
    return r.ok && r.cfg.conjuntos[0].anuncios.length <= 2;
  })());

  comprobar('La ruta del creativo apunta al archivo de verdad, no a la raiz', (() => {
    const r = interpretar(`campana para ${nombreSede} con ${primeraReferencia.toLowerCase()}`);
    if (!r.ok) return false;
    // Se resuelve con el mismo criterio que usa el builder.
    return r.cfg.conjuntos[0].anuncios.every((a) => {
      try {
        return inspeccionarCreativoLocal(a.rutaCreativoLocal).bytes > 0;
      } catch {
        return false;
      }
    });
  })());
}

comprobar('Filtra el barrido por familia', (() => {
  // Pida la familia que pida, solo vuelven equipos de esa familia. No depende
  // de que haya o no piezas de iPhone en las carpetas.
  const iph = productosDeLaCarpeta(sedeConPiezas || 'NEIVA', 'IPH');
  const and = productosDeLaCarpeta(sedeConPiezas || 'NEIVA', 'AND');
  const esIphone = (p) => /iphone/i.test(JSON.stringify(p));
  return iph.productos.every(esIphone) && !and.productos.some(esIphone);
})());

comprobar('Los archivos que no puede leer se reportan, no se ignoran', (() => {
  // Un nombre del que no se puede sacar marca y modelo no se adivina: se lista
  // aparte para que alguien lo renombre.
  const r = productosDeLaCarpeta(sedeConPiezas || 'NEIVA');
  return Array.isArray(r.noIdentificados);
})());

comprobar('Pedir una familia sin modelo pide el modelo', (() => {
  const r = interpretar(`campana para ${(sedeConPiezas || 'NEIVA').toLowerCase()} de ipad`);
  return !r.ok && r.problemas.some((p) => p.includes('sin decir el modelo'));
})());

comprobar('"de android" sin modelo NO toma piezas de la carpeta', (() => {
  const r = interpretar('campana para mocoa de android');
  return !r.ok && r.problemas.some((p) => p.includes('Especifica marca y modelo'));
})());

comprobar('...y dice que modelos hay en la carpeta', (() => {
  const r = interpretar('campana para mocoa de android');
  return r.problemas.some((p) => p.includes('Tecno Camon 50 Pro'));
})());

/* -------------------------------------------------------------------------- */

seccion('18. Los copys generados dicen solo lo comprobable');

const copysDePrueba = generarCopys({
  producto: 'Samsung A17',
  ciudad: 'Ipiales',
  sede: 'Victoria Plaza',
  segmento: 'AND-CRED',
  formato: 'IMG',
});

comprobar('Genera 5 textos principales', copysDePrueba.textosPrincipales.length === 5);
comprobar('Genera 5 titulos', copysDePrueba.titulos.length === 5);
comprobar('Genera 5 descripciones', copysDePrueba.descripciones.length === 5);
comprobar('Genera el mensaje prellenado', copysDePrueba.mensajePrellenado.length > 0);
comprobar('Se marca como generado, para que la interfaz lo diga', copysDePrueba.generado === true);

const todosLosCopys = [
  ...copysDePrueba.textosPrincipales,
  ...copysDePrueba.titulos,
  ...copysDePrueba.descripciones,
  copysDePrueba.mensajePrellenado,
];

// El texto principal SI puede pasar de 125: el feed lo recorta pero se
// despliega, y es el formato que usa Celred. Titulos y descripciones no: esos
// Meta los corta de verdad.
comprobar(
  'Todos los textos principales llevan la direccion de la sede',
  generarCopys({ producto: 'Samsung A17', codigoSede: 'VICTORIA', segmento: 'AND-CRED' }).textosPrincipales.every((t) => t.includes('📍')),
);
comprobar('Ningun titulo pasa de 40 caracteres', copysDePrueba.titulos.every((t) => t.length <= 40));
comprobar('Ninguna descripcion pasa de 30 caracteres', copysDePrueba.descripciones.every((t) => t.length <= 30));
comprobar('No hay textos repetidos', new Set(todosLosCopys).size === todosLosCopys.length);
comprobar('Nombra el producto', copysDePrueba.textosPrincipales.some((t) => t.includes('Samsung A17')));
comprobar('Nombra la ciudad', copysDePrueba.textosPrincipales.some((t) => t.includes('Ipiales')));
comprobar('El prellenado nombra la sede concreta', copysDePrueba.mensajePrellenado.includes('Victoria Plaza'));

// Las tres prohibiciones que fijo el cliente, aplicadas a lo que genera el
// sistema y no solo a lo que se escribe a mano.
for (const prohibida of ['addi', 'sistecredito', 'sistecrédito', 'banco de bogota', 'banco de bogotá']) {
  comprobar(
    `Los copys generados no nombran "${prohibida}"`,
    !todosLosCopys.some((t) => t.toLowerCase().includes(prohibida)),
  );
}
comprobar('Los copys generados no ponen capacidad en GB', !todosLosCopys.some((t) => /\d+\s*gb/i.test(t)));
for (const talento of nom.TALENTOS) {
  comprobar(
    `Los copys generados no nombran a ${talento}`,
    !todosLosCopys.some((t) => t.toUpperCase().includes(talento)),
  );
}

// Lo mas importante: no puede inventarse caracteristicas que no conoce.
comprobar(
  'No inventa megapixeles, mAh, Hz ni pulgadas',
  !todosLosCopys.some((t) => /\d+\s*(mp|mah|hz|pulgadas|w\b)/i.test(t)),
);
comprobar(
  'No promete precios ni porcentajes de descuento',
  !todosLosCopys.some((t) => /\$\s*\d|\d+\s*%/.test(t)),
);

comprobar('Un conjunto de contado no promete credito', (() => {
  const c = generarCopys({ producto: 'iPhone 15', ciudad: 'Pasto', segmento: 'IPH-CONT', precioContado: 1999000 });
  const textos = [...c.textosPrincipales, ...c.titulos, ...c.descripciones];
  return !textos.some((t) => /credito/i.test(t));
})());

comprobar('El texto de un video habla de video', (() => {
  const c = generarCopys({ producto: 'iPhone 15', ciudad: 'Pasto', segmento: 'IPH-CRED', formato: 'VID' });
  return c.textosPrincipales[0].toLowerCase().includes('video');
})());

comprobar('Un producto de nombre largo sigue cabiendo en los titulos', (() => {
  const c = generarCopys({ producto: 'Samsung Galaxy S25 Ultra Edition', ciudad: 'Tuquerres', segmento: 'AND-CRED' });
  return c.titulos.length >= 3 && c.titulos.every((t) => t.length <= 40);
})());

/* --- El mensaje prellenado lo escribe el CLIENTE ----------------------- */

comprobar('El prellenado va en primera persona, como lo enviaria el cliente', (() => {
  const c = generarCopys({ producto: 'Samsung A17', codigoSede: 'NEIVA', segmento: 'AND-CRED' });
  return c.mensajePrellenado.startsWith('Hola, quiero');
})());

comprobar('El prellenado nombra el equipo', (() => {
  const c = generarCopys({ producto: 'Samsung A17', codigoSede: 'NEIVA', segmento: 'AND-CRED' });
  return c.mensajePrellenado.includes('Samsung A17');
})());

// Este fue un fallo real: "Celred Neiva Neiva", porque la sede se llama igual
// que la ciudad y se concatenaban las dos.
comprobar('El prellenado NO repite la ciudad cuando la sede se llama igual', (() => {
  const c = generarCopys({ producto: 'iPhone 15', codigoSede: 'NEIVA', sede: 'Neiva', segmento: 'IPH-CRED' });
  return !/Neiva\s+Neiva/i.test(c.mensajePrellenado);
})());

comprobar('En una ciudad con varias tiendas si se nombra el local', (() => {
  const c = generarCopys({ producto: 'iPhone 15', codigoSede: 'LA16', sede: 'La 16', segmento: 'IPH-CRED' });
  return c.mensajePrellenado.includes('La 16');
})());

comprobar('El saludo previo SI lo dice la tienda', (() => {
  const c = generarCopys({ producto: 'iPhone 15', codigoSede: 'NEIVA', segmento: 'IPH-CRED' });
  return c.saludoWhatsApp.includes('Bienvenido');
})());

/* --- Dispositivos: los dos de entrada ---------------------------------- */

comprobar('Sin decir nada, el targeting lleva movil Y escritorio', (() => {
  const t = construirTargeting('NEIVA', {});
  return t.device_platforms.includes('mobile') && t.device_platforms.includes('desktop');
})());

comprobar('Se puede dejar solo movil si se pide', (() => {
  const t = construirTargeting('NEIVA', { dispositivos: ['mobile'] });
  return t.device_platforms.length === 1 && t.device_platforms[0] === 'mobile';
})());

/* --- Talento de varias palabras ---------------------------------------- */

comprobar('Un nombre de anuncio con "SOFIA MEDELLIN" es valido', (() => {
  return nom.auditarNombre('ADS1 | NEI | IMG | REDMI NOTE 15 PRO | SOFIA MEDELLIN', 'anuncio').ok;
})());
comprobar('Con talento de una palabra tambien', nom.auditarNombre('ADS2 | VIC | VID | IPHONE 13 | SOFIA', 'anuncio').ok);
comprobar('Y sin talento, que es lo normal', nom.auditarNombre('ADS1 | NEI | IMG | SAMSUNG A17', 'anuncio').ok);
comprobar('El nombre con talento lo construye igual', (() => {
  return (
    nom.nombreAnuncio({ numero: 1, sede: 'NEIVA', formato: 'IMG', referencia: 'REDMI NOTE 15 PRO', talento: 'SOFIA MEDELLIN' }) ===
    'ADS1 | NEI | IMG | REDMI NOTE 15 PRO | SOFIA MEDELLIN'
  );
})());

/* --- Las mejoras, explicadas ------------------------------------------- */

comprobar('Cada mejora apagada tiene explicacion en castellano', (() => {
  const d = describirMejoras({ modoTexto: 'multiple', nivel: 'completo' });
  const explicadas = d.grupos.flatMap((g) => g.funciones);
  return explicadas.length === d.total;
})());

comprobar('Las mejoras vienen agrupadas por lo que hacen', (() => {
  const d = describirMejoras({ modoTexto: 'multiple', nivel: 'completo' });
  return d.grupos.length >= 3 && d.grupos.every((g) => g.etiqueta && g.funciones.length > 0);
})());

comprobar('Ninguna explicacion es solo el nombre tecnico', (() => {
  const d = describirMejoras({ modoTexto: 'multiple', nivel: 'completo' });
  return d.grupos.flatMap((g) => g.funciones).every((f) => f.que && f.que !== f.campo && /\s/.test(f.que));
})());

/* --- Direcciones oficiales: la fuente maestra -------------------------- */

comprobar('Las 13 sedes activas tienen direccion', (() => {
  return nom.CODIGOS_SEDE_ACTIVA.every((s) => direccionDeSede(s) !== null);
})());

comprobar('La Union tambien la tiene, para cuando abra', direccionDeSede('LAUNION') !== null);

comprobar('Cada direccion trae calle, corta, ciudad y zona', (() => {
  return Object.values(DIRECCIONES).every((d) => d.direccion && d.corta && d.ciudad && d.zona);
})());

comprobar('La direccion de ORITO es la del documento oficial', (() => {
  const d = direccionDeSede('ORITO');
  return d.direccion.includes('Calle 8 # 10-47') && d.direccion.includes('Marco Fidel Suárez') && d.ciudad === 'Orito';
})());

comprobar('Las tres sedes de Pasto tienen direcciones DISTINTAS', (() => {
  const d = ['LA16', 'LICEO', 'SEBASTIAN'].map((s) => direccionDeSede(s).direccion);
  return new Set(d).size === 3;
})());

comprobar('Las tres sedes de Ipiales tienen direcciones DISTINTAS', (() => {
  const d = ['VICTORIA', 'ZAFIRO', 'MARKUS'].map((s) => direccionDeSede(s).direccion);
  return new Set(d).size === 3;
})());

comprobar('No hay dos sedes con la misma direccion', (() => {
  const todas = Object.values(DIRECCIONES).map((d) => d.direccion);
  return new Set(todas).size === todas.length;
})());

comprobar('Pedir una sede que no existe falla, no devuelve otra', (() => {
  try {
    direccionDeSede('BOGOTA');
    return false;
  } catch {
    return true;
  }
})());

comprobar('La direccion en una linea lleva la ciudad', direccionEnUnaLinea('NEIVA').includes('Neiva'));

// El error que mas caro sale: que el copy de una sede lleve la calle de otra.
for (const sede of ['ORITO', 'NEIVA', 'VICTORIA', 'MEDELLIN']) {
  comprobar(`El copy de ${sede} lleva SU direccion y ninguna otra`, (() => {
    const c = generarCopys({ producto: 'iPhone 15', codigoSede: sede, segmento: 'IPH-CRED' });
    const texto = c.textosPrincipales.join(' ');
    const propia = direccionDeSede(sede).direccion;

    if (!texto.includes(propia)) return false;

    // Ninguna direccion de otra sede puede aparecer.
    return Object.entries(DIRECCIONES)
      .filter(([codigo]) => codigo !== sede)
      .every(([, d]) => !texto.includes(d.direccion));
  })());
}

comprobar('Sin codigo de sede, el copy sale SIN direccion (no inventada)', (() => {
  const c = generarCopys({ producto: 'iPhone 15', ciudad: 'Pasto', segmento: 'IPH-CRED' });
  return !c.textosPrincipales.some((t) => t.includes('📍'));
})());

/* --- Cero promociones (decision del 23/09/2026) ------------------------ */

const copysDeVariasSedes = ['ORITO', 'NEIVA', 'LA16', 'MEDELLIN'].flatMap((sede) => {
  const c = generarCopys({ producto: 'Redmi Note 15 Pro', codigoSede: sede, segmento: 'AND-CRED' });
  return [...c.textosPrincipales, ...c.titulos, ...c.descripciones, c.mensajePrellenado];
});

for (const prohibida of [
  'sorteo', 'gratis', 'rifa', 'descuento', 'promocion', 'promoción',
  'sin inicial', 'oferta', '% de', 'aprovecha antes',
]) {
  comprobar(
    `Los copys NO hablan de "${prohibida}"`,
    !copysDeVariasSedes.some((t) => t.toLowerCase().includes(prohibida)),
  );
}

comprobar('Los copys no ponen fechas de campana', !copysDeVariasSedes.some((t) => /\bdel \d{1,2} al \d{1,2}\b/i.test(t)));
comprobar('Los copys no ponen precios', !copysDeVariasSedes.some((t) => /\$\s*\d/.test(t)));

/* -------------------------------------------------------------------------- */

seccion('19. Objetivo, sedes, regiones y talentos');

comprobar('Hay objetivos definidos', CODIGOS_OBJETIVO.length >= 3);
comprobar('El objetivo por defecto es mensajes a WhatsApp', OBJETIVO_POR_DEFECTO === 'MENSAJES_WHATSAPP');

for (const codigo of CODIGOS_OBJETIVO) {
  const o = obtenerObjetivo(codigo);
  comprobar(
    `"${o.etiqueta}" declara los tres campos de Meta por separado`,
    Boolean(o.objetivoMeta && o.optimizationGoal && o.billingEvent),
    `${o.objetivoMeta} · ${o.optimizationGoal} · ${o.billingEvent}`,
  );
}

comprobar('Mensajes a WhatsApp usa prefijo C (campana de sede)', prefijoDe('MENSAJES_WHATSAPP') === 'C');
comprobar('Reconocimiento usa prefijo R (regional)', prefijoDe('RECONOCIMIENTO') === 'R');
comprobar('Trafico usa prefijo R (regional)', prefijoDe('TRAFICO') === 'R');
comprobar('Solo el de WhatsApp pide numero', usaWhatsApp('MENSAJES_WHATSAPP') && !usaWhatsApp('TRAFICO'));
comprobar('Solo el de WhatsApp lleva destination_type', (() => {
  return camposDeMeta('MENSAJES_WHATSAPP').destination_type === 'WHATSAPP' &&
    camposDeMeta('RECONOCIMIENTO').destination_type === null;
})());
comprobar('Un objetivo inventado se rechaza con la lista de validos', (() => {
  try {
    obtenerObjetivo('VENTAS_MAGICAS');
    return false;
  } catch (e) {
    return e.amigable === true && e.message.includes('MENSAJES_WHATSAPP');
  }
})());
comprobar('Se distingue lo ensayado de lo no ensayado contra Meta', (() => {
  const l = listarParaLaInterfaz();
  return l.some((o) => o.ensayado) && l.some((o) => !o.ensayado);
})());

/* --- Sedes y regiones ------------------------------------------------- */

comprobar('La Union existe pero no esta activa', (() => {
  return nom.CODIGOS_SEDE.includes('LAUNION') && !nom.CODIGOS_SEDE_ACTIVA.includes('LAUNION');
})());
comprobar('No se puede nombrar una campana de La Union todavia', !nom.auditarNombre('C1 | LAUNION | 230926', 'campana').ok);
comprobar('La Union ya tiene distintivo (UNI), confirmado por Celred', nom.SEDES.LAUNION.dist === 'UNI');
comprobar('La Union no inventa cuenta publicitaria', (() => {
  const f = nom.SEDES.LAUNION;
  return f.cuenta === '' && Boolean(f.pendiente);
})());
comprobar('Una campana para La Union se rechaza mientras no abra', (() => {
  try {
    validarCampana({ ...campanasCargadas[0], sede: 'LAUNION' });
    return false;
  } catch (e) {
    return e.message.includes('proxima sede');
  }
})());
comprobar('Las 13 sedes de siempre siguen activas', nom.CODIGOS_SEDE_ACTIVA.length === 13);

comprobar('TUQUERRES ya no es una region', !nom.REGIONES.includes('TUQUERRES'));
comprobar('NARINO si es una region', nom.REGIONES.includes('NARINO'));
comprobar('TUQUERRES sigue siendo una SEDE', nom.CODIGOS_SEDE_ACTIVA.includes('TUQUERRES'));
comprobar('NARINO incluye Tuquerres y La Union', (() => {
  const s = nom.SEDES_POR_REGION.NARINO;
  return s.includes('TUQUERRES') && s.includes('LAUNION') && s.includes('LA16');
})());
comprobar('Un nombre regional con NARINO es valido', nom.auditarNombre('R7 | NARINO | GEO | 230926', 'campanaRegional').ok);
comprobar('Un nombre regional con TUQUERRES ya no vale', !nom.auditarNombre('R7 | TUQUERRES | GEO | 230926', 'campanaRegional').ok);

/* --- Talentos --------------------------------------------------------- */

comprobar('Los talentos son ALEJA, SARA y SOFIA', nom.TALENTOS.join(',') === 'ALEJA,SARA,SOFIA');
for (const t of nom.TALENTOS) comprobar(`${t} se acepta`, nom.validarTalento(t).ok);
comprobar('Se acepta el talento con lugar: SOFIA MEDELLIN', nom.validarTalento('SOFIA MEDELLIN').ok);
comprobar('Se acepta SOFIA PUTUMAYO', nom.validarTalento('SOFIA PUTUMAYO').ok);
comprobar('El talento vacio se acepta: es opcional', nom.validarTalento('').ok);
comprobar('Un talento que no esta en la lista se rechaza', !nom.validarTalento('TATIANA').ok);
comprobar('El rechazo dice cuales son validos', nom.validarTalento('PEPE').motivo.includes('ALEJA'));

/* --- Codificacion del archivo ----------------------------------------- */

// Este archivo se corrompio una vez al reescribirlo con PowerShell: el rango
// de diacriticos quedo roto y `normalizarCampo` dejo de quitar tildes en
// silencio. Estas tres comprobaciones lo detectan al instante.
// El detector de tildes de auditarNombre llevaba tiempo roto sin que nadie lo
// notara: una reescritura del archivo corrompio su rango de caracteres y dejo
// de detectar la Ñ y las mayusculas acentuadas.
for (const malo of ['C1 | NEIVÁ | 230926', 'C1 | NIÑOS | 230926', 'C1 | TÚQUERRES | 230926']) {
  comprobar(`"${malo}" se rechaza por llevar tilde o ñ`, (() => {
    const r = nom.auditarNombre(malo, 'campana');
    return !r.ok && r.problemas.some((p) => p.includes('tildes'));
  })());
}
comprobar('Un nombre sin tildes no dispara ese aviso', (() => {
  const r = nom.auditarNombre('C4 | NEIVA | 230926', 'campana');
  return r.ok && !r.problemas.some((p) => p.includes('tildes'));
})());

// Los MENSAJES si van en castellano correcto: son para leerlos, no para Meta.
comprobar('Los mensajes de ayuda estan bien escritos', (() => {
  const textos = Object.values(nom.NIVELES).flatMap((n) => [n.que, n.formato, n.ayuda]);
  const juntos = textos.join(' ');
  return juntos.includes('campaña') && juntos.includes('número') && !/\bcampana\b/.test(juntos);
})());

comprobar('normalizarCampo quita tildes', nom.normalizarCampo('Túquerres') === 'TUQUERRES');
comprobar('normalizarCampo quita la n con virgulilla', nom.normalizarCampo('Nariño') === 'NARINO');
comprobar('normalizarCampo quita tildes en varias palabras', nom.normalizarCampo('Puerto Asís') === 'PUERTO ASIS');

/* -------------------------------------------------------------------------- */

seccion('20. Los interruptores de expansion se explican y se pueden cambiar');

comprobar('Hay una ficha por interruptor', INTERRUPTORES_DE_EXPANSION.length >= 5);

for (const i of INTERRUPTORES_DE_EXPANSION) {
  comprobar(
    `"${i.nombre}" trae nombre, campo, que hace y por que esta apagado`,
    Boolean(i.nombre && i.campo && i.enAdsManager && i.siSeEnciende && i.porQueApagado),
  );
}

comprobar(
  'Todos los interruptores vienen apagados por defecto',
  Object.values(expansionPorDefecto()).every((v) => v === false),
);

comprobar('Sin pedir nada, el targeting sale con todo en 0', (() => {
  const t = construirTargeting('NEIVA', {});
  return (
    t.targeting_automation.advantage_audience === 0 &&
    t.targeting_automation.individual_setting.age === 0 &&
    t.targeting_relaxation_types.lookalike === 0 &&
    t.targeting_relaxation_types.custom_audience === 0 &&
    t.flexible_spec === undefined
  );
})());

comprobar('Encender Advantage+ a proposito lo pone en 1', (() => {
  const t = construirTargeting('NEIVA', { expansion: { advantageAudience: true } });
  return t.targeting_automation.advantage_audience === 1;
})());

comprobar('Encender Advantage+ NO enciende los demas', (() => {
  const t = construirTargeting('NEIVA', { expansion: { advantageAudience: true } });
  return t.targeting_relaxation_types.lookalike === 0 && t.targeting_automation.individual_setting.age === 0;
})());

comprobar('Abrir edad y genero pone individual_setting en 1', (() => {
  const t = construirTargeting('NEIVA', { expansion: { edadYGenero: true } });
  const s = t.targeting_automation.individual_setting;
  return s.age === 1 && s.gender === 1 && s.geo === 1;
})());

comprobar('La auditoria aprueba un targeting que coincide con lo pedido', (() => {
  const pedida = { advantageAudience: true };
  const t = construirTargeting('NEIVA', { expansion: pedida });
  const r = auditarExpansion(t, pedida);
  return r.ok && !r.todoApagado && r.encendidos.length === 1;
})());

comprobar('La auditoria RECHAZA si el targeting no coincide con lo pedido', (() => {
  const t = construirTargeting('NEIVA', { expansion: { advantageAudience: true } });
  // Se audita como si se hubiera pedido apagado: tiene que saltar.
  return !auditarExpansion(t, {}).ok;
})());

comprobar('Con todo apagado, la auditoria dice todoApagado', (() => {
  const t = construirTargeting('NEIVA', {});
  const r = auditarExpansion(t, {});
  return r.ok && r.todoApagado && r.encendidos.length === 0;
})());

comprobar('Un interruptor no editable no se puede encender desde los ajustes', (() => {
  // "intereses" esta marcado como no editable: normalizarExpansion lo ignora.
  const e = normalizarExpansion({ intereses: true });
  return e.intereses === false;
})());

comprobar('El panel puede encender la expansion de un conjunto', (() => {
  const { cfg, cambios } = aplicarAjustes(campanaBase, {
    conjuntos: [{ expansion: { advantageAudience: true } }],
  });
  return cfg.conjuntos[0].expansion.advantageAudience === true && cambios.some((c) => c.campo.includes('expansión'));
})());

comprobar('El panel puede volver a apagarla', (() => {
  const { cfg } = aplicarAjustes(campanaBase, { conjuntos: [{ expansion: { advantageAudience: false } }] });
  return cfg.conjuntos[0].expansion.advantageAudience === false;
})());

comprobar('El panel puede encender el reparto de presupuesto', (() => {
  const { cfg } = aplicarAjustes(campanaBase, { campana: { compartirPresupuesto: true } });
  return cfg.compartirPresupuesto === true;
})());

comprobar('Una casilla marcada de un formulario HTML se entiende como si', (() => {
  const { cfg } = aplicarAjustes(campanaBase, { campana: { compartirPresupuesto: 'on' } });
  return cfg.compartirPresupuesto === true;
})());

comprobar('targeting_optimization se borra aunque se cuele con expansion encendida', (() => {
  const t = sanitizarTargeting(
    { ...construirTargeting('NEIVA', {}), targeting_optimization: 'expansion_all' },
    { advantageAudience: true },
  );
  return t.targeting_optimization === undefined;
})());

seccion('21. Presupuesto en pesos: Meta no usa centavos en COP');

comprobar('El COP va sin decimales (factor 1)', factorMoneda('COP') === 1);
comprobar('$25.000 al dia llega a Meta como 25000, no como 2500000', aUnidadMenor(25000, factorMoneda('COP')) === '25000');
comprobar('El dolar si lleva centavos (factor 100)', factorMoneda('USD') === 100);
comprobar('25000 en COP se muestra como 25.000', /25.000/.test(formatearMoneda(25000, 'COP')));

seccion('22. Credito dice "reportados"; contado lleva precio manual; llamados distintos');

{
  const credito = generarCopys({ producto: 'Tecno Camon 50 Pro', codigoSede: 'MOCOA', segmento: 'AND-CRED' });
  comprobar(
    'Credito: los 5 textos principales dicen "reportados"',
    credito.textosPrincipales.length === 5 && credito.textosPrincipales.every((t) => /reportad/i.test(sinNegrilla(t))),
  );
  comprobar('Credito: un titulo lo dice', credito.titulos.some((t) => /reportad/i.test(sinNegrilla(t))));
  comprobar(
    'Credito: "CRÉDITO PARA REPORTADOS" en mayusculas y negrilla en los 5 textos',
    credito.textosPrincipales.every((t) => t.includes(CREDITO_PARA_REPORTADOS)),
  );
  comprobar('Credito: ningun texto dice "tambien"', !credito.textosPrincipales.some((t) => /tambi[eé]n/i.test(sinNegrilla(t))));
  comprobar(
    'Las descripciones son SOLO llamados a la accion, con emoji al inicio',
    credito.descripciones.length === 5 &&
      credito.descripciones.every((d) => LLAMADOS_A_LA_ACCION.includes(d) && /^\p{Extended_Pictographic}/u.test(d)),
  );
  comprobar('Los titulos son cortos (hasta 30 caracteres)', credito.titulos.every((t) => t.length <= 30));
  comprobar('Cada texto: el llamado a la accion va con emoji delante', credito.textosPrincipales.every((t) => {
    const ll = LLAMADOS_A_LA_ACCION.find((x) => t.includes(x));
    return ll && /^\p{Extended_Pictographic}/u.test(ll);
  }));
  comprobar('Cada texto: lleva una frase llamativa de Celred', credito.textosPrincipales.every((t) => /celred/i.test(t.split('\n')[2] || '')));
  comprobar('Credito: no pone precio', ![...credito.textosPrincipales, ...credito.titulos].some((t) => /\$\s*\d/.test(t)));
  comprobar('Credito: sus propios textos cumplen la regla', revisarReglasDePago({
    segmento: 'AND-CRED', producto: 'Tecno Camon 50 Pro', textosPrincipales: credito.textosPrincipales,
  }).errores.length === 0);

  for (const segmento of ['IPH-CRED', 'MIXTO', 'MAC-IPAD', 'RETOMA']) {
    const c = generarCopys({ producto: 'iPhone 15', codigoSede: 'NEIVA', segmento });
    comprobar(`${segmento}: los 5 textos dicen "reportados"`, c.textosPrincipales.every((t) => /reportad/i.test(sinNegrilla(t))));
  }

  /* --- Llamados a la accion ------------------------------------------- */
  const llamadosDe = (textos) => textos.map((t) => LLAMADOS_A_LA_ACCION.find((l) => t.includes(l)));
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const c = generarCopys({ producto: 'Redmi 15', codigoSede: 'LA16', segmento: vuelta % 2 ? 'AND-CRED' : 'AND-CONT' });
    const ll = llamadosDe(c.textosPrincipales);
    if (!ll.every(Boolean) || new Set(ll).size !== 5) {
      comprobar('Los 5 textos llevan un llamado a la accion, todos distintos', false, JSON.stringify(ll));
      break;
    }
    if (vuelta === 19) comprobar('Los 5 textos llevan un llamado a la accion, todos distintos (20 vueltas)', true);
  }
  {
    const vistos = new Set();
    for (let v = 0; v < 30; v++) vistos.add(llamadosDe(generarCopys({ producto: 'Redmi 15', codigoSede: 'LA16', segmento: 'AND-CRED' }).textosPrincipales).join('|'));
    comprobar('Los llamados se sortean: no salen siempre en el mismo orden', vistos.size > 1);
  }
  {
    const fijo = () => 0.5;
    const a = generarCopys({ producto: 'Redmi 15', codigoSede: 'LA16', segmento: 'AND-CRED', azar: fijo });
    const b = generarCopys({ producto: 'Redmi 15', codigoSede: 'LA16', segmento: 'AND-CRED', azar: fijo });
    comprobar('Con el azar fijado, el sorteo se puede repetir', a.textosPrincipales.join() === b.textosPrincipales.join());
  }
  comprobar('Hay al menos 7 llamados distintos para sortear', new Set(LLAMADOS_A_LA_ACCION).size >= 7);

  /* --- Contado: precio manual ----------------------------------------- */
  const sinPrecio = generarCopys({ producto: 'iPhone 13', codigoSede: 'VICTORIA', segmento: 'IPH-CONT', formato: 'VID' });
  comprobar('Contado sin precio: los copys salen igual, con {PRECIO} en su sitio', sinPrecio.textosPrincipales.every((t) => t.includes(MARCA_PRECIO)));
  comprobar('Contado sin precio: queda marcado como pendiente', sinPrecio.faltaPrecio === true);
  comprobar('Contado sin precio: la regla lo marca pendiente, no como error de texto', (() => {
    const r = revisarReglasDePago({ segmento: 'IPH-CONT', producto: 'iPhone 13', textosPrincipales: sinPrecio.textosPrincipales });
    return r.faltaPrecio && r.errores.length === 0;
  })());

  const contado = generarCopys({
    producto: 'iPhone 13', codigoSede: 'VICTORIA', segmento: 'IPH-CONT', formato: 'VID', precioContado: 1999000,
  });
  comprobar(
    'Contado con precio: los 5 textos principales lo llevan',
    contado.textosPrincipales.length === 5 && contado.textosPrincipales.every((t) => t.includes('$1.999.000')),
  );
  comprobar('Contado: un titulo lleva el precio', contado.titulos.some((t) => t.includes('$1.999.000')));
  comprobar('Contado: los 5 textos llevan la direccion', contado.textosPrincipales.every((t) => t.includes('📍')));
  comprobar('Contado: no promete credito', ![...contado.textosPrincipales, ...contado.titulos, ...contado.descripciones].some((t) => /cr[eé]dito/i.test(t)));
  comprobar('Contado: titulos y descripciones caben', contado.titulos.every((t) => t.length <= 40) && contado.descripciones.every((t) => t.length <= 30));

  comprobar('Texto a mano de credito sin "reportados" se rechaza', revisarReglasDePago({
    segmento: 'AND-CRED', producto: 'X', textosPrincipales: ['Llevalo a credito', 'Otro para reportados'],
  }).errores.length === 1);
  comprobar('Texto a mano de contado con otro precio se rechaza', revisarReglasDePago({
    segmento: 'IPH-CONT', producto: 'X', precioContado: 1999000, textosPrincipales: ['iPhone a $1.500.000'],
  }).errores.length === 1);
  comprobar('Texto a mano de contado con el precio correcto pasa', revisarReglasDePago({
    segmento: 'IPH-CONT', producto: 'X', precioContado: 1999000, textosPrincipales: ['iPhone a $1.999.000 de contado'],
  }).errores.length === 0);

  /* --- La orden de contado, de punta a punta -------------------------- */
  const orden = interpretar('campaña para victoria de iphone 13 de contado');
  comprobar('Una orden de contado se entiende aunque no traiga precio', orden.ok);
  if (orden.ok) {
    const r1 = aplicarAjustesPrecio({ ...orden.cfg, archivo: 'dictada' }, {});
    const a1 = r1.cfg.conjuntos[0].anuncios[0];
    comprobar('...queda pendiente de precio', a1.faltaPrecio === true);
    comprobar('...y avisa que el precio se escribe a mano', (r1.cfg.avisosDeConfiguracion || []).some((t) => t.includes('FALTA EL PRECIO')));

    const r2 = aplicarAjustesPrecio(r1.cfg, { conjuntos: [{ anuncios: [{ precioContado: '1.999.000' }] }] });
    const a2 = r2.cfg.conjuntos[0].anuncios[0];
    comprobar('Al escribir el precio en el panel, entra en los 5 textos', a2.textosPrincipales.every((t) => t.includes('$1.999.000')));
    comprobar('...y ya no queda ningun {PRECIO}', ![...a2.textosPrincipales, ...a2.titulos, ...a2.descripciones].some((t) => t.includes(MARCA_PRECIO)));
    comprobar('...y deja de estar pendiente', a2.faltaPrecio === false);

    const r3 = aplicarAjustesPrecio(r2.cfg, { conjuntos: [{ anuncios: [{ precioContado: '1899000' }] }] });
    const a3 = r3.cfg.conjuntos[0].anuncios[0];
    comprobar('Corregir el precio corrige los textos', a3.textosPrincipales.every((t) => t.includes('$1.899.000') && !t.includes('$1.999.000')));

    let rechazo = null;
    try { aplicarAjustesPrecio(r1.cfg, { conjuntos: [{ anuncios: [{ precioContado: 'abc' }] }] }); } catch (e) { rechazo = e; }
    comprobar('Un precio que no es numero se rechaza', Boolean(rechazo));
  }

  comprobar('El precio se escribe con puntos de mil', formatearPrecio(1999000) === '$1.999.000');
  comprobar('El precio se lee con o sin puntos', leerPrecio('1.999.000') === 1999000 && leerPrecio('$1999000') === 1999000);
  comprobar('Un precio vacio no es precio', leerPrecio('') === null);
  comprobar('ponerPrecio cambia la marca y el precio anterior', ponerPrecio('a {PRECIO} y $1.000.000', 2000000, 1000000) === 'a $2.000.000 y $2.000.000');
}

seccion('23. Rutas de archivo y objetivo escritos en la orden');

{
  const { extraerArchivos, detectarObjetivo } = await import('../src/interprete.js');
  const { copyFileSync, rmSync, existsSync } = await import('node:fs');
  const RAIZ_CREATIVOS = join(RAIZ, 'creativos');

  const e1 = extraerArchivos('campaña para neiva "C:\\a b\\infinixhot60pro neiva.mp4" a credito');
  comprobar('Ruta entre comillas, con espacios', e1.rutas[0] === 'C:\\a b\\infinixhot60pro neiva.mp4');
  comprobar('...y la ruta sale del texto de la orden', !e1.texto.includes('infinix'));

  const e2 = extraerArchivos('sede: Victoria\narchivos:\n  C:\\x y\\iphone13-victoria.png\n  creativos/victoria/a.mp4\npago: contado');
  comprobar('Bloque "archivos:" con un renglon por ruta', e2.rutas.length === 2 && e2.rutas[0] === 'C:\\x y\\iphone13-victoria.png');
  comprobar('...el bloque termina en la siguiente clave', e2.texto.includes('pago: contado'));

  const e3 = extraerArchivos('campaña para mocoa archivo: C:\\a b\\x.png y C:\\c\\y.mp4');
  comprobar('"archivo:" en medio de la frase, varias rutas con "y"', e3.rutas.length === 2 && e3.rutas[1] === 'C:\\c\\y.mp4');
  comprobar('...lo de antes de "archivo:" se conserva', e3.texto.includes('campaña para mocoa'));

  const e4 = extraerArchivos('campaña para zafiro con tecnocamon50pro-zafiro.png');
  comprobar('Nombre suelto de archivo', e4.rutas[0] === 'tecnocamon50pro-zafiro.png');

  const conRuta = interpretar('campaña para mocoa a credito archivo: creativos/mocoa/iphone13-mocoa.png');
  comprobar('Con la ruta, el equipo se lee del nombre del archivo', conRuta.ok && conRuta.cfg.conjuntos[0].anuncios[0].referencia === 'IPHONE 13');
  comprobar('...y el nombre dice si es iPhone o Android', conRuta.ok && conRuta.cfg.conjuntos[0].segmento === 'IPH-CRED');

  const mezcla = interpretar('campaña para mocoa a credito archivos: creativos/mocoa/iphone13-mocoa.png, creativos/mocoa/tecnocamon50pro-mocoa.png');
  comprobar('Dos rutas de familias distintas van a dos conjuntos', mezcla.ok && mezcla.cfg.conjuntos.map((c) => c.segmento).sort().join() === 'AND-CRED,IPH-CRED');

  const mal = join(RAIZ_CREATIVOS, 'mocoa', 'foto final.png');
  copyFileSync(join(RAIZ_CREATIVOS, 'mocoa', 'iphone13-mocoa.png'), mal);
  try {
    const r = interpretar('campaña para mocoa archivo: "foto final.png"');
    comprobar('Un archivo sin marca ni modelo en el nombre se rechaza', !r.ok && r.problemas.some((p) => p.includes('No pude leer marca y modelo')));
  } finally {
    if (existsSync(mal)) rmSync(mal);
  }

  const noExiste = interpretar('campaña para mocoa archivo: creativos/mocoa/iphone99-mocoa.png');
  comprobar('Un archivo que no existe se dice', !noExiste.ok && noExiste.problemas.some((p) => p.includes('No encontre el archivo')));

  const deOtra = interpretar('campaña para mocoa a credito archivo: creativos/neiva/tecnocamon50pro-neiva.png');
  comprobar('Una ruta de otra sede se acepta con aviso', deOtra.ok && deOtra.avisos.some((a) => a.includes('no esta en creativos/mocoa/')));
  comprobar('...y habilita esa pieza de fuera', deOtra.ok && deOtra.cfg.permitirCreativoFueraDeLaSede === true);

  comprobar('"objetivo: ventas"', detectarObjetivo('campaña objetivo: ventas')?.codigo === 'VENTAS_WHATSAPP');
  comprobar('"objetivo de clientes potenciales"', detectarObjetivo('objetivo de clientes potenciales')?.codigo === 'LEADS_WHATSAPP');
  comprobar('"campaña de reconocimiento"', detectarObjetivo('campaña de reconocimiento para mocoa')?.codigo === 'RECONOCIMIENTO');
  comprobar('"objetivo: mensajes"', detectarObjetivo('objetivo: mensajes')?.codigo === 'MENSAJES_WHATSAPP');
  comprobar('Sin objetivo en la orden, no se inventa', detectarObjetivo('campaña para mocoa de iphone 13') === null);

  const conObjetivo = interpretar('campaña para mocoa de iphone 13 a credito objetivo: clientes potenciales');
  comprobar('El objetivo de la orden llega a la campana', conObjetivo.ok && conObjetivo.cfg.objetivo === 'LEADS_WHATSAPP');
  comprobar('...y no se pega al modelo del equipo', conObjetivo.ok && conObjetivo.cfg.conjuntos[0].anuncios[0].referencia === 'IPHONE 13');

  const regional = interpretar('campaña de reconocimiento para mocoa con tecno camon 50 pro');
  comprobar('Un objetivo regional toma la region de la sede', regional.ok && regional.cfg.region === 'PUTUMAYO');

  const raro = interpretar('campaña para mocoa de iphone 13 objetivo: seguidores');
  comprobar('Un objetivo desconocido se rechaza y dice cuales hay', !raro.ok && raro.problemas.some((p) => p.includes('No reconozco el objetivo')));
}

/* -------------------------------------------------------------------------- */

console.log(`\n${'─'.repeat(70)}`);
if (fallas.length === 0) {
  console.log(`${C.verde}${C.bold}  ${pasadas} comprobaciones, todas pasaron.${C.reset}\n`);
  process.exit(0);
} else {
  console.log(`${C.rojo}${C.bold}  ${fallas.length} fallaron de ${pasadas + fallas.length}:${C.reset}`);
  fallas.forEach((f) => console.log(`${C.rojo}   • ${f.titulo}${f.detalle ? ` — ${f.detalle}` : ''}${C.reset}`));
  console.log('');
  process.exit(1);
}
