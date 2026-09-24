#!/usr/bin/env node
/**
 * herramientas/revisar-sedes.js — Revision completa de las 13 sedes SIN Meta
 *
 *   npm run revisar-sedes
 *
 * Arma, sin conexion, una campana de Android, una de iPhone y una mixta por
 * cada sede con las piezas de creativos/, y revisa lo que se mandaria a Meta:
 * estado PAUSED, presupuesto en pesos, pagina y WhatsApp de la sede, destino
 * solo WhatsApp, ubicaciones, expansion apagada, piezas de la carpeta correcta,
 * formato de los 5 textos, mejoras automaticas y que ningun texto nombre otra
 * sede. No toca la red.
 */
import { interpretar } from '../src/interprete.js';
import { planificarEstructura, paramsDeCampana, paramsDeConjunto } from '../src/builder.js';
import { armarParamsAdCreative } from '../src/creatives.js';
import { paginaDeSede, RUTA_LINEAS_XLSX } from '../src/config.js';
import { lineaDeSede } from '../src/lineas.js';
import { revisarReglasDePago, LLAMADOS_A_LA_ACCION } from '../src/copys.js';
import { aplicarAjustes } from '../src/ajustes.js';
import { MARCA_PRECIO } from '../src/precios.js';
import { basename, dirname } from 'node:path';

const SEDES = { 'la 16': 'LA16', sebastian: 'SEBASTIAN', liceo: 'LICEO', victoria: 'VICTORIA', zafiro: 'ZAFIRO', markus: 'MARKUS', tuquerres: 'TUQUERRES', orito: 'ORITO', 'la hormiga': 'HORMIGA', 'puerto asis': 'PTOASIS', mocoa: 'MOCOA', medellin: 'MEDELLIN', neiva: 'NEIVA' };
const CARPETA = { LA16: 'la16', SEBASTIAN: 'sebastian', LICEO: 'liceo', VICTORIA: 'victoria', ZAFIRO: 'zafiro', MARKUS: 'markus', TUQUERRES: 'tuquerres', ORITO: 'orito', HORMIGA: 'hormiga', PTOASIS: 'ptoasis', MOCOA: 'mocoa', MEDELLIN: 'medellin', NEIVA: 'neiva' };
// El modelo es obligatorio en la orden. El de contado lleva el precio escrito a
// mano, como se haria en la etapa 3 del panel.
const PEDIDOS = [
  { texto: 'tecno camon 50 pro y infinix hot 60 pro a credito' },
  { texto: 'iphone 13 a credito' },
  { texto: 'tecno camon 50 pro, infinix hot 60 pro y iphone 13 de contado', precio: 1999000 },
];
const INVALIDAS = new Set(['music', '3d_animation', 'image_generation', 'background_generation', 'catalog_feed_tags', 'generate_text']);
const OTRAS = ['Neiva', 'Mocoa', 'Orito', 'Hormiga', 'Ipiales', 'Medellín', 'Túquerres', 'Puerto Asís', 'Pasto'];
const sinTildes = (s) => String(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

let total = 0;
const fallos = [];
const mal = (caso, msg) => fallos.push({ caso, msg });

for (const [frase, codigo] of Object.entries(SEDES)) {
  for (const pedido of PEDIDOS) {
    const caso = `${codigo} · ${pedido.texto}`;
    total++;
    const l = interpretar(`campaña para ${frase} de ${pedido.texto}`);
    if (!l.ok) { mal(caso, 'no se entendio: ' + (l.problemas || []).join(' / ')); continue; }
    let plan;
    try {
      // El mismo camino que el panel: ajustes (con el precio escrito a mano) y validacion.
      const ajustes = pedido.precio
        ? { conjuntos: l.cfg.conjuntos.map((c) => ({ anuncios: c.anuncios.map(() => ({ precioContado: String(pedido.precio) })) })) }
        : {};
      const { cfg } = aplicarAjustes({ ...l.cfg, archivo: 'revision' }, ajustes);
      plan = await planificarEstructura({ ...cfg, sinConexion: true, estado: 'PAUSED' });
    }
    catch (e) { mal(caso, 'plan: ' + e.message.split('\n')[0]); continue; }

    if (plan.sede.codigo !== codigo) mal(caso, `sede ${plan.sede.codigo}`);
    const camp = paramsDeCampana(plan, 'PAUSED');
    if (camp.status !== 'PAUSED') mal(caso, 'campana no PAUSED');
    if (camp.daily_budget || camp.lifetime_budget) mal(caso, 'campana con presupuesto (debe ser ABO)');
    if (!/^C\d+ \| /.test(plan.campana.nombre)) mal(caso, 'nombre campana ' + plan.campana.nombre);

    const tel = lineaDeSede(RUTA_LINEAS_XLSX, codigo)?.telefono;
    const pagina = paginaDeSede(codigo);
    for (const cj of plan.conjuntos) {
      const p = paramsDeConjunto(plan, 'CAMP123', 'PAUSED', cj.indice);
      if (p.status !== 'PAUSED') mal(caso, 'conjunto no PAUSED');
      if (String(p.daily_budget) !== String(cj.presupuesto.cop)) mal(caso, `presupuesto a Meta ${p.daily_budget} distinto de ${cj.presupuesto.cop} COP`);
      if (cj.presupuesto.cop < 15000 || cj.presupuesto.cop > 60000) mal(caso, `presupuesto fuera de rango ${cj.presupuesto.cop}`);
      if (p.destination_type !== 'WHATSAPP') mal(caso, 'destino ' + p.destination_type);
      if (p.promoted_object?.page_id !== pagina) mal(caso, `pagina del conjunto ${p.promoted_object?.page_id} distinta de ${pagina}`);
      if (!tel || !String(p.promoted_object?.whatsapp_phone_number).endsWith(String(tel).slice(-10))) mal(caso, `whatsapp ${p.promoted_object?.whatsapp_phone_number} vs ${tel}`);
      const t = p.targeting;
      if (JSON.stringify(t).includes('explore')) mal(caso, 'ubicacion explore');
      if (t.targeting_automation?.advantage_audience !== 0) mal(caso, 'advantage_audience no es 0');
      if (!t.geo_locations || !Object.keys(t.geo_locations).length) mal(caso, 'sin geolocalizacion');
      if ('targeting_optimization' in t) mal(caso, 'targeting_optimization presente');
      if (new Date(p.start_time) <= new Date()) mal(caso, 'start_time en el pasado');
      if (!/\| CJTO\d+ \|/.test(cj.nombre)) mal(caso, 'nombre conjunto ' + cj.nombre);

      if (cj.anuncios.length === 0 || cj.anuncios.length > 5) mal(caso, `${cj.anuncios.length} anuncios`);
      for (const a of cj.anuncios) {
        const archivo = basename(a.archivo.ruta);
        const carpeta = basename(dirname(a.archivo.ruta));
        if (carpeta !== CARPETA[codigo]) mal(caso, `${a.nombre} usa pieza de ${carpeta}`);
        const esVideo = /\.mp4$/i.test(archivo);
        if ((a.formato === 'VID') !== esVideo) mal(caso, `${a.nombre} formato ${a.formato} con ${archivo}`);
        if (/IPHONE/.test(a.nombre) !== /iphone/i.test(archivo)) mal(caso, `${a.nombre} con pieza ${archivo}`);
        const asset = esVideo ? { tipo: 'video', videoId: '1', miniaturaUrl: 'https://x/y.jpg' } : { tipo: 'imagen', hash: 'h' };
        const c = armarParamsAdCreative({
          nombre: a.nombreCreativo, textosPrincipales: a.copy.textosPrincipales, titulos: a.copy.titulos,
          descripciones: a.copy.descripciones, mensajePrellenado: a.copy.mensajePrellenado,
          saludoWhatsApp: a.copy.saludoWhatsApp, asset, modoTexto: a.modoTexto, paginaId: plan.paginaId,
        });
        if (c.object_story_spec.page_id !== pagina) mal(caso, `pagina del creativo ${c.object_story_spec.page_id}`);
        const f = c.asset_feed_spec;
        if (a.modoTexto === 'multiple') {
          if (f.bodies.length !== 5 || f.titles.length !== 5 || f.descriptions.length !== 5) mal(caso, `${a.nombre} textos ${f.bodies.length}/${f.titles.length}/${f.descriptions.length}`);
          if (f.images || f.videos || f.link_urls || f.ad_formats) mal(caso, 'asset_feed_spec con piezas duplicadas');
          if (f.optimization_type !== 'DEGREES_OF_FREEDOM') mal(caso, 'sin optimization_type');
        }
        if (esVideo && (!c.object_story_spec.video_data || c.object_story_spec.link_data)) mal(caso, 'video mal armado');
        if (!esVideo && !c.object_story_spec.link_data?.image_hash) mal(caso, 'imagen mal armada');
        const cta = (c.object_story_spec.video_data || c.object_story_spec.link_data).call_to_action;
        if (cta.type !== 'WHATSAPP_MESSAGE') mal(caso, 'CTA ' + cta.type);
        const spec = c.degrees_of_freedom_spec?.creative_features_spec || {};
        for (const k of Object.keys(spec)) if (INVALIDAS.has(k)) mal(caso, 'mejora invalida ' + k);
        const on = Object.entries(spec).filter(([k, v]) => v.enroll_status === 'OPT_IN' && k !== 'text_optimizations');
        if (on.length) mal(caso, 'mejoras encendidas ' + on.map(([k]) => k));
        const todo = [...a.copy.textosPrincipales, ...a.copy.titulos, ...a.copy.descripciones, a.copy.mensajePrellenado, a.copy.saludoWhatsApp].join(' | ');
        const propias = `${plan.sede.sede} ${plan.sedeTargeting?.ciudad || ''} ${plan.sedeTargeting?.etiqueta || ''}`;
        for (const otra of OTRAS) if (!sinTildes(propias).includes(sinTildes(otra)) && todo.includes(otra)) mal(caso, `${a.nombre} menciona ${otra}`);
        a.copy.titulos.forEach((x) => x.length > 40 && mal(caso, `titulo de mas de 40: "${x}"`));
        a.copy.descripciones.forEach((x) => x.length > 30 && mal(caso, `descripcion de mas de 30: "${x}"`));
        // Los dos primeros textos pasan de 125 a proposito (src/copys.js): no es un fallo.
        const regla = revisarReglasDePago({ segmento: cj.segmento, producto: a.producto, textosPrincipales: a.copy.textosPrincipales, precioContado: a.precioContado });
        for (const e of regla.errores) mal(caso, e);
        if (a.faltaPrecio || regla.faltaPrecio) mal(caso, `${a.nombre} de contado sin precio`);
        if (todo.includes(MARCA_PRECIO)) mal(caso, `${a.nombre} quedo con {PRECIO} sin reemplazar`);
        const llamados = a.copy.textosPrincipales.map((t) => LLAMADOS_A_LA_ACCION.find((x) => t.includes(x)));
        if (!llamados.every(Boolean) || new Set(llamados).size !== llamados.length) mal(caso, `${a.nombre} sin llamados a la accion distintos`);
        const prod = a.nombre.split(' | ').pop();
        if (!sinTildes(a.copy.mensajePrellenado).includes(prod)) mal(caso, `prellenado no nombra ${prod}: ${a.copy.mensajePrellenado}`);
      }
    }
  }
}

console.log(`Casos revisados: ${total} · problemas: ${fallos.length}`);
if (fallos.length) process.exitCode = 1;
const grupos = {};
for (const { caso, msg } of fallos) (grupos[msg.replace(/\d+/g, '#')] ||= new Set()).add(caso.split(' · ')[0]);
for (const [msg, casos] of Object.entries(grupos)) console.log(`\n• ${msg}\n    sedes: ${[...casos].join(', ')}`);
