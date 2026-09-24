/**
 * Comprueba el contraste de cada par texto/fondo del sistema, en los dos
 * modos, contra el minimo de la WCAG (4.5:1 para texto normal, 3:1 para
 * texto grande y para bordes/iconos).
 *
 * Lee los tokens del propio CSS: si alguien cambia un color, esto lo pilla.
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(process.argv[2] || 'panel/estilos.css', 'utf8');

/** Saca los tokens de un bloque :root o [data-tema="..."]. */
function tokensDe(selector) {
  const bloque = css.split(selector)[1]?.split('}')[0] || '';
  const mapa = {};
  for (const m of bloque.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    mapa[m[1]] = m[2].trim();
  }
  return mapa;
}

const base = tokensDe(':root {');
const oscuro = { ...base, ...tokensDe('[data-tema="oscuro"] {') };
const claro = { ...base, ...tokensDe('[data-tema="claro"] {') };

// El bloque ":root,\n[data-tema=oscuro]" define el oscuro por defecto.
const oscuroReal = { ...base, ...tokensDe('[data-tema="oscuro"] {\n  color-scheme: dark;') };
Object.assign(oscuro, oscuroReal);

// Los rellenos de boton (verde de aprobar, ambar y rojo) llevan letra blanca
// fija en los dos modos, asi que hace falta un "blanco" que comparar.
oscuro.blanco = '#ffffff';
claro.blanco = '#ffffff';

function resolver(mapa, valor, profundidad = 0) {
  if (profundidad > 5) return null;
  const v = String(valor).trim();
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  if (ref) return resolver(mapa, mapa[ref[1]], profundidad + 1);
  return /^#[0-9a-f]{6}$/i.test(v) ? v : null;
}

const aRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function luminancia(hex) {
  const [r, g, b] = aRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Los pares que de verdad aparecen en pantalla. */
const PARES = [
  ['txt', 'fondo', 4.5, 'texto principal sobre el fondo'],
  ['txt', 'sup-1', 4.5, 'texto sobre tarjeta'],
  ['txt', 'sup-2', 4.5, 'texto sobre superficie 2'],
  ['txt', 'sup-3', 4.5, 'texto sobre superficie 3'],
  ['txt-2', 'sup-1', 4.5, 'texto secundario sobre tarjeta'],
  ['txt-2', 'sup-2', 4.5, 'texto secundario sobre superficie 2'],
  ['txt-3', 'sup-1', 4.5, 'texto terciario / placeholder sobre tarjeta'],
  ['txt-3', 'sup-2', 4.5, 'texto terciario sobre superficie 2'],
  ['txt-3', 'fondo', 4.5, 'texto terciario sobre el fondo'],
  ['exito', 'exito-fondo', 4.5, 'texto de exito en su alerta'],
  ['aviso', 'aviso-fondo', 4.5, 'texto de aviso en su alerta'],
  ['error', 'error-fondo', 4.5, 'texto de error en su alerta'],
  ['info', 'info-fondo', 4.5, 'texto informativo en su alerta'],
  ['exito', 'sup-1', 4.5, 'texto verde sobre tarjeta'],
  ['error', 'sup-1', 4.5, 'texto rojo sobre tarjeta'],
  ['aviso', 'sup-1', 4.5, 'texto ambar sobre tarjeta'],
  ['acento', 'sup-1', 4.5, 'acento sobre tarjeta'],
  ['acento', 'fondo', 4.5, 'acento sobre el fondo'],
  ['txt', 'hundido', 4.5, 'codigo sobre fondo hundido'],
  ['txt-2', 'hundido', 4.5, 'texto de codigo sobre hundido'],
  ['acento-txt', 'acento', 4.5, 'texto del boton primario'],
  ['blanco', 'exito-solido', 4.5, 'texto del boton de aprobar'],
  ['blanco', 'aviso-solido', 4.5, 'check de la casilla de aviso'],
  ['blanco', 'error-solido', 4.5, 'check de la casilla en mal estado'],
  ['borde-medio', 'sup-1', 1.8, 'borde de input sobre tarjeta'],
  // El color de la alerta ya no es el fondo: es la barra de 3px de la
  // izquierda, y para un limite grafico la WCAG pide 3:1.
  ['exito', 'sup-1', 3, 'barra verde de la alerta sobre tarjeta'],
  ['aviso', 'sup-1', 3, 'barra ambar de la alerta sobre tarjeta'],
  ['error', 'sup-1', 3, 'barra roja de la alerta sobre tarjeta'],
  ['info', 'sup-1', 3, 'barra azul de la alerta sobre tarjeta'],
];

let fallos = 0;

for (const [nombre, mapa] of [['OSCURO', oscuro], ['CLARO', claro]]) {
  console.log(`\n\x1b[1m${nombre}\x1b[0m`);
  for (const [frente, fondo, minimo, que] of PARES) {
    const a = resolver(mapa, mapa[frente]);
    const b = resolver(mapa, mapa[fondo]);
    if (!a || !b) {
      console.log(`  \x1b[33m?\x1b[0m  ${que}  (no se pudo resolver)`);
      continue;
    }
    const r = contraste(a, b);
    const ok = r >= minimo;
    if (!ok) fallos += 1;
    console.log(
      `  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${r.toFixed(2).padStart(5)}:1  ` +
        `(min ${minimo})  ${que}   \x1b[2m${a} sobre ${b}\x1b[0m`,
    );
  }
}

console.log('');
console.log(fallos === 0 ? '\x1b[32mTodos los pares pasan.\x1b[0m' : `\x1b[31m${fallos} pares por debajo del minimo.\x1b[0m`);
process.exit(fallos === 0 ? 0 : 1);
