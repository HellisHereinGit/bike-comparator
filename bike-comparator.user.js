// ==UserScript==
// @name Comparador de Bicicletas (Vadebicis)
// @namespace https://vadebicis.local/bike-comparator
// @version 1.0.0
// @description Selecciona hasta 4 bicicletas navegando por trekbikes.com (u otras marcas soportadas) y genera una ficha comparativa en PDF/Word: foto y especificaciones de cada modelo en columnas paralelas, con una única sección de garantías al final. Proyecto independiente del extractor de fichas individuales (bike-spec-extractor.user.js); no lo sustituye ni lo modifica.
// @author Vadebicis
// @match https://www.trekbikes.com/*
// @match https://*.trekbikes.com/*
// @match https://www.orbea.com/*
// @match https://*.orbea.com/*
// @match https://www.mondraker.com/*
// @match https://*.mondraker.com/*
// @icon https://www.google.com/s2/favicons?sz=64&domain=trekbikes.com
// @grant GM_xmlhttpRequest
// @grant GM_addStyle
// @grant GM_setValue
// @grant GM_getValue
// @connect *
// -----------------------------------------------------------------------
// AUTOACTUALIZACIÓN: sube este archivo como asset de una release en un
// repositorio público de GitHub (puede ser el mismo repo que
// bike-spec-extractor, como archivo aparte), llamando SIEMPRE al asset
// "bike-comparator.user.js" (nombre fijo, sin la versión en el nombre) en
// cada release nueva. Sustituye <TU-USUARIO-GITHUB> y <TU-REPO> por los
// reales. Con esta URL de "latest/download", Tampermonkey siempre comprueba
// contra la última release publicada, sin que haya que tocar esta línea.
// -----------------------------------------------------------------------
// @updateURL https://github.com/HellisHereinGit/bike-comparator/releases/latest/download/bike-comparator.user.js
// @downloadURL https://github.com/HellisHereinGit/bike-comparator/releases/latest/download/bike-comparator.user.js
// @require https://cdn.jsdelivr.net/npm/jspdf@2/dist/jspdf.umd.min.js
// @require https://cdn.jsdelivr.net/npm/jspdf-autotable@3/dist/jspdf.plugin.autotable.min.js
// @require https://cdn.jsdelivr.net/npm/html-docx-js/dist/html-docx.js
// @run-at document-idle
// ==/UserScript==

/* eslint-disable no-console */

/*
* ============================================================================
* COMPARADOR DE BICICLETAS — arquitectura del script
* ============================================================================
*
* Proyecto HERMANO de bike-spec-extractor.user.js, no una modificación suya.
* Reutiliza el mismo motor de extracción (adaptadores por marca, heurísticas
* de specs/galería, descarga y proceso de imágenes, texto de garantías) para
* no reinventar nada que ya funciona, pero vive en su propio archivo, con su
* propio namespace, sus propios prefijos de CSS/IDs ("bcb-" en vez de "bse-")
* y su propio almacenamiento (GM_setValue con clave propia). Esto permite
* tener AMBOS scripts instalados y activos a la vez sin que choquen entre sí:
* uno para una ficha individual rápida, este para comparar varios modelos.
*
* FLUJO:
* 1. En cualquier ficha de producto soportada aparece un botón flotante
* "🔀 Comparador (n/4)" (esquina inferior IZQUIERDA, para no solaparse con
* el botón "📋 Extraer ficha" del otro script, que vive en la derecha).
* 2. Al pulsarlo se abre un panel: nombre de cliente (se recuerda entre
* bicis), lista de bicis ya añadidas, y un botón para añadir la bici de
* la página actual (pide el % de descuento de esa bici en concreto).
* 3. El estado (cliente + bicis + descuentos) se guarda con GM_setValue, así
* que sobrevive a navegar por la web de Trek en la MISMA pestaña para ir
* añadiendo más bicis (hasta 4).
* 4. Cuando ya están todas, "Generar comparativa" abre un menú para elegir
* qué incluir (galería de fotos, tabla de SKUs, garantías) y genera un
* PDF y/o Word con una tabla comparativa (especificación en columnas,
* una columna por bici) y la sección de garantías UNA sola vez al final.
* ============================================================================
*/

(function () {
'use strict';

const DEBUG = false;
const log = (...args) => DEBUG && console.log('[BikeComparator]', ...args);

const BUILD = 'v1.0.0 · comparador-multibici';
console.log('%c[BikeComparator] BUILD ' + BUILD, 'color:#1f4fb0;font-weight:bold;');

const STATE_KEY = 'bcb_state_v1';
const MAX_BIKES = 4;
const LOGO_URL = 'https://raw.githubusercontent.com/HellisHereinGit/documentos-de-apoyo/refs/heads/main/LOGO_VADE.jpg';
const LOGO_CACHE_KEY = 'bcb_logo_dataurl_v1';

// --------------------------------------------------------------------------
// 0. ESTILOS (prefijo bcb- en todo para no chocar con bike-spec-extractor)
// --------------------------------------------------------------------------
GM_addStyle(`
#bcb-launcher {
position: fixed; bottom: 24px; left: 24px; z-index: 2147483000;
background: #1f4fb0; color: #fff; border: none; border-radius: 999px;
padding: 14px 20px; font: 600 14px/1.2 -apple-system, Segoe UI, Roboto, sans-serif;
box-shadow: 0 6px 20px rgba(0,0,0,.35); cursor: pointer; display: flex;
align-items: center; gap: 8px; transition: transform .15s ease;
}
#bcb-launcher:hover { transform: translateY(-2px); }
#bcb-launcher[disabled] { opacity: .6; cursor: wait; }
#bcb-overlay {
position: fixed; inset: 0; z-index: 2147483001; background: rgba(15,16,20,.6);
display: flex; align-items: center; justify-content: center; padding: 24px;
font: 14px/1.5 -apple-system, Segoe UI, Roboto, sans-serif;
}
#bcb-panel, #bcb-menu-modal, #bcb-preview-modal {
background: #fff; color: #16181d; border-radius: 14px; padding: 26px 28px;
box-shadow: 0 20px 60px rgba(0,0,0,.4); position: relative;
}
#bcb-panel { width: min(460px, 100%); }
#bcb-menu-modal { width: min(440px, 100%); }
#bcb-preview-modal { width: min(900px, 100%); max-height: 88vh; overflow-y: auto; }
#bcb-panel h1, #bcb-menu-modal h1, #bcb-preview-modal h1 { font-size: 18px; margin: 0 0 4px; }
.bcb-sub { font-size: 13px; color: #666; margin: 0 0 16px; }
.bcb-close {
position: absolute; top: 16px; right: 16px; border: none; background: #eee;
width: 32px; height: 32px; border-radius: 50%; font-size: 16px; cursor: pointer;
}
.bcb-field { margin-bottom: 14px; }
.bcb-field label { display: block; font-size: 12.5px; font-weight: 600; margin-bottom: 4px; color: #333; }
.bcb-field input[type="text"], .bcb-field input[type="number"] {
width: 100%; padding: 9px 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box;
}
.bcb-bike-list { border-top: 1px solid #eee; margin-top: 6px; padding-top: 10px; }
.bcb-bike-row {
display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;
}
.bcb-bike-row .bcb-bike-info { flex: 1; }
.bcb-bike-row .bcb-bike-name { font-weight: 600; }
.bcb-bike-row .bcb-bike-meta { color: #777; font-size: 12px; }
.bcb-bike-row button { border: none; background: #fbe3e3; color: #b0281f; border-radius: 6px; padding: 5px 9px; cursor: pointer; font-size: 12px; }
.bcb-empty { color: #888; font-size: 13px; padding: 10px 0; }
.bcb-actions { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
.bcb-actions button { flex: 1 1 140px; padding: 11px 14px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; font-size: 13.5px; }
.bcb-btn-primary { background: #1f4fb0; color: #fff; }
.bcb-btn-secondary { background: #eee; color: #333; }
.bcb-btn-danger { background: #fbe3e3; color: #b0281f; }
.bcb-actions button[disabled] { opacity: .5; cursor: not-allowed; }
.bcb-warning { background: #fff4e5; border: 1px solid #f0c36d; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; font-size: 12.5px; }
#bcb-menu-modal .bcb-menu-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid #eee; }
#bcb-menu-modal .bcb-menu-row label { font-size: 14px; font-weight: 600; flex: 1; cursor: pointer; }
#bcb-menu-modal .bcb-menu-row input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; }
#bcb-menu-modal .bcb-menu-sub-row { display: none; padding: 6px 0 10px 28px; gap: 16px; font-size: 13px; }
#bcb-menu-modal .bcb-menu-sub-row.bcb-visible { display: flex; }
#bcb-menu-modal .bcb-menu-sub-row label { font-weight: 400; display: flex; align-items: center; gap: 6px; cursor: pointer; }
#bcb-preview-modal table.bcb-compare-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12.5px; }
#bcb-preview-modal table.bcb-compare-table th, #bcb-preview-modal table.bcb-compare-table td { padding: 6px 8px; border: 1px solid #eee; vertical-align: top; text-align: left; }
#bcb-preview-modal table.bcb-compare-table th { background: #1f4fb0; color: #fff; }
#bcb-preview-modal .bcb-cover-row { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
#bcb-preview-modal .bcb-cover-card { flex: 1 1 180px; border: 1px solid #eee; border-radius: 8px; padding: 10px; text-align: center; }
#bcb-preview-modal .bcb-cover-card img { width: 100%; height: 110px; object-fit: contain; margin-bottom: 6px; background: #f4f4f5; border-radius: 6px; }
#bcb-preview-modal .bcb-cover-card .bcb-price { color: #b0281f; font-weight: 700; font-size: 13px; }
#bcb-preview-modal .bcb-cover-card .bcb-pvp { color: #999; font-size: 11px; text-decoration: line-through; }
`);

// --------------------------------------------------------------------------
// 1. UTILIDADES GENERALES (copiadas de bike-spec-extractor: probadas ahí)
// --------------------------------------------------------------------------

function absUrl(url) {
try { return new URL(url, location.href).href; } catch (e) { return null; }
}

function shortenSourceUrl(url) {
if (!url) return url;
const match = url.match(/^(.*?\/([a-z]{2,3})\/\2)(?:[_/].*)?$/i);
return match ? match[1] : url;
}

function textOf(el) {
return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}

function isPlaceholderUrl(url) {
if (!url) return true;
if (url.startsWith('data:')) return true;
const lower = url.toLowerCase();
if (/(placeholder|blank|1x1|spacer|transparent|lazy-load)/.test(lower)) return true;
return false;
}

function bestSrcFromSrcset(srcset) {
if (!srcset) return null;
const candidates = srcset
.split(/,\s+/)
.map((s) => s.trim().split(/\s+/))
.filter((c) => c[0]);
candidates.sort((a, b) => (parseFloat(a[1]) || 0) - (parseFloat(b[1]) || 0));
const last = candidates[candidates.length - 1];
return last ? absUrl(last[0]) : null;
}

function bestSrcFromImg(img) {
const picture = img.closest('picture');
if (picture) {
const sources = Array.from(picture.querySelectorAll('source'));
for (const source of sources) {
const url = bestSrcFromSrcset(source.getAttribute('srcset') || source.getAttribute('data-srcset'));
if (url && !isPlaceholderUrl(url)) return url;
}
}
const lazyAttrs = ['data-src', 'data-original', 'data-zoom-src', 'data-zoom-image', 'data-large', 'data-full-src', 'data-lazy-src', 'data-hires'];
for (const attr of lazyAttrs) {
const raw = img.getAttribute(attr);
const cleaned = raw ? raw.trim().replace(/\s+\d+(?:\.\d+)?[wx]$/, '') : null;
const url = cleaned ? absUrl(cleaned) : null;
if (url && !isPlaceholderUrl(url)) return url;
}
const srcsetUrl = bestSrcFromSrcset(img.getAttribute('srcset') || img.getAttribute('data-srcset'));
if (srcsetUrl && !isPlaceholderUrl(srcsetUrl)) return srcsetUrl;
const fallback = absUrl(img.currentSrc || img.src || '');
return isPlaceholderUrl(fallback) ? null : fallback;
}

function looksLikeIcon(url, img) {
if (!url) return true;
const lower = url.toLowerCase();
if (/(icon|sprite|logo|favicon|placeholder|spinner|loader)/.test(lower)) return true;
if (img && img.complete && img.naturalWidth > 0 && img.naturalWidth < 80) return true;
return false;
}

function extractBackgroundImages(container) {
const results = [];
container.querySelectorAll('*').forEach((el) => {
const bg = getComputedStyle(el).backgroundImage;
const match = bg && bg.match(/url\(["']?([^"')]+)["']?\)/);
if (match && match[1]) {
const url = absUrl(match[1]);
if (url && !isPlaceholderUrl(url) && !looksLikeIcon(url, null)) {
results.push({ url, alt: el.getAttribute('aria-label') || '' });
}
}
});
return results;
}

function readJsonLdProduct() {
const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
for (const s of scripts) {
try {
const parsed = JSON.parse(s.textContent);
const candidates = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
for (const node of candidates) {
const type = node && node['@type'];
const types = Array.isArray(type) ? type : [type];
if (types.includes('Product')) return node;
}
} catch (e) { /* JSON-LD mal formado: se ignora */ }
}
return null;
}

function looksLikeHeadingEl(el) {
if (!el) return false;
if (/^H[1-6]$/.test(el.tagName)) return true;
const cls = (el.className || '').toString().toLowerCase();
return /(title|heading|section-name|group-name|category-name|label)/.test(cls) && textOf(el).length > 0 && textOf(el).length < 60;
}

function nearestHeadingText(el) {
let node = el.previousElementSibling;
let hops = 0;
while (node && hops < 12) {
if (looksLikeHeadingEl(node)) return textOf(node);
node = node.previousElementSibling;
hops++;
}
if (el.parentElement && el.parentElement !== document.body) {
let p = el.parentElement.previousElementSibling;
hops = 0;
while (p && hops < 6) {
if (looksLikeHeadingEl(p)) return textOf(p);
p = p.previousElementSibling;
hops++;
}
const siblingHeading = Array.from(el.parentElement.children).find((c) => c !== el && looksLikeHeadingEl(c));
if (siblingHeading) return textOf(siblingHeading);
}
return null;
}

function extractSpecsFromTables() {
const groups = [];
const seenRows = new Set();

document.querySelectorAll('table').forEach((table) => {
const trs = Array.from(table.querySelectorAll('tr'));
if (!trs.length) return;
const firstRowIsHeader = trs[0].querySelector('th') != null && trs.length > 1;
const headerCells = firstRowIsHeader ? Array.from(trs[0].children).filter((c) => /^(TD|TH)$/.test(c.tagName)).map(textOf) : [];
const dataRows = firstRowIsHeader ? trs.slice(1) : trs;
const rows = [];
dataRows.forEach((tr) => {
const cells = Array.from(tr.children).filter((c) => /^(TD|TH)$/.test(c.tagName));
if (cells.length < 2) return;
const label = textOf(cells[0]);
let value;
if (cells.length === 2) {
value = textOf(cells[1]);
} else {
value = cells
.slice(1)
.map((c, i) => {
const colName = headerCells[i + 1];
const v = textOf(c);
return colName ? `${colName}: ${v}` : v;
})
.filter(Boolean)
.join(' · ');
}
const key = label + '::' + value;
if (label && value && !seenRows.has(key)) {
seenRows.add(key);
rows.push({ label, value });
}
});
if (rows.length >= 1) {
groups.push({ category: nearestHeadingText(table) || 'Especificaciones', rows });
}
});

document.querySelectorAll('dl').forEach((dl) => {
const dts = Array.from(dl.querySelectorAll('dt'));
const dds = Array.from(dl.querySelectorAll('dd'));
const rows = [];
if (dts.length && dts.length === dds.length) {
dts.forEach((dt, i) => {
const label = textOf(dt);
const value = textOf(dds[i]);
const key = label + '::' + value;
if (label && value && !seenRows.has(key)) {
seenRows.add(key);
rows.push({ label, value });
}
});
}
if (rows.length >= 1) {
groups.push({ category: nearestHeadingText(dl) || 'Especificaciones', rows });
}
});

return groups;
}

function wait(ms) {
return new Promise((resolve) => setTimeout(resolve, ms));
}

function findTabByText(patterns) {
const norm = (s) =>
(s || '')
.toLowerCase()
.normalize('NFD')
.replace(/[̀-ͯ]/g, '')
.trim();
const candidates = Array.from(document.querySelectorAll('button, a, [role="tab"], li'));
for (const pattern of patterns) {
const p = norm(pattern);
const match = candidates.find((el) => {
const text = norm(el.textContent);
return text.length > 0 && text.length < 60 && (text === p || text.includes(p));
});
if (match) return match;
}
return null;
}

async function ensureSpecsTabOpen() {
if (extractSpecsFromTables().length) return;
const tab = findTabByText(['Especificaciones', 'Specifications', 'Specs', 'Especificações']);
if (tab) {
tab.click();
await wait(600);
}
}

function extractGalleryImages(limit = 14) {
const priorityContainers = document.querySelectorAll(
'[class*="gallery" i], [class*="carousel" i], [class*="slider" i], [class*="swiper" i], [id*="gallery" i], [data-testid*="gallery" i], picture'
);
const ordered = [];
const pushImgsFrom = (root) => {
root.querySelectorAll('img').forEach((img) => {
const url = bestSrcFromImg(img);
if (url && !looksLikeIcon(url, img)) ordered.push({ url, alt: img.alt || '' });
});
};
priorityContainers.forEach(pushImgsFrom);
priorityContainers.forEach((container) => {
extractBackgroundImages(container).forEach((item) => ordered.push(item));
});
pushImgsFrom(document.body);

const seen = new Set();
const result = [];
for (const item of ordered) {
if (seen.has(item.url)) continue;
seen.add(item.url);
result.push(item);
if (result.length >= limit) break;
}
return result;
}

function extractPriceFallback() {
const candidates = document.querySelectorAll('[class*="price" i]');
for (const el of candidates) {
const text = textOf(el);
if (text && text.length < 40 && /[€$£]|\bEUR\b|\bUSD\b|\bGBP\b/.test(text) && /\d/.test(text)) {
return text;
}
}
return null;
}

function extractSku(ld) {
if (ld && ld.sku) return String(ld.sku);
const metaSku = document.querySelector('meta[itemprop="sku"], meta[property="product:retailer_item_id"]');
if (metaSku) return metaSku.getAttribute('content');
const candidates = document.querySelectorAll('dt, dd, span, div, li, td, p');
for (const el of candidates) {
const text = textOf(el);
if (text.length > 60) continue;
const match = text.match(/^(SKU|Referencia|Ref\.?|C[oó]digo|Item\s*#?|Art[ií]culo)\s*:?\s*([A-Z0-9][A-Z0-9\-_.]{2,20})$/i);
if (match) return match[2];
}
return null;
}

async function genericExtract() {
const ld = readJsonLdProduct();
const metaContent = (name) => {
const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
return el ? el.getAttribute('content') : null;
};

const brand =
(ld && ld.brand && (ld.brand.name || ld.brand)) ||
metaContent('product:brand') ||
null;

const model =
(ld && ld.name) ||
metaContent('og:title') ||
document.title ||
null;

let price = null;
let currency = null;
if (ld && ld.offers) {
const offer = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
if (offer) {
price = offer.price || offer.lowPrice || null;
currency = offer.priceCurrency || null;
}
}
if (!price) price = metaContent('product:price:amount');
if (!currency) currency = metaContent('product:price:currency');
if (!price) price = extractPriceFallback();

const sku = extractSku(ld);

const description =
(ld && ld.description) ||
metaContent('og:description') ||
metaContent('description') ||
null;

let images = [];
if (ld && ld.image) {
images = (Array.isArray(ld.image) ? ld.image : [ld.image]).map((u) => ({ url: absUrl(u), alt: model || '' }));
}
images = images.concat(extractGalleryImages());
images = images.filter((im, i, arr) => im.url && arr.findIndex((x) => x.url === im.url) === i);

await ensureSpecsTabOpen();
const specs = extractSpecsFromTables();

return {
brand,
model,
sku,
skuSize: null,
skuColor: null,
skuTable: [],
price: price ? String(price) : null,
currency,
description,
specs,
images,
sourceUrl: location.href,
extractedAt: new Date().toISOString(),
};
}

function extractTrekPvpr() {
const candidates = document.querySelectorAll('td, div, span, dd, li');
for (const el of candidates) {
const text = textOf(el);
if (text.length > 60) continue;
const match = text.match(/PVP\s*recomendado\s*([\d.,]+\s?(?:€|EUR|\$|USD|£|GBP)?)/i);
if (match && match[1]) return match[1].trim();
}
return null;
}

function extractTrekColorFromUrl() {
try {
const code = new URL(location.href).searchParams.get('colorCode');
if (!code) return null;
return code.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
} catch (e) {
return null;
}
}

function extractTrekColorForInput(input) {
const collapseItem = input.closest('.pdl-collapse-item') || input.closest('[class*="collapse" i]');
if (!collapseItem) return null;
const header = collapseItem.querySelector('.pdl-collapse-item__header, [class*="header" i]');
if (!header) return null;
const text = textOf(header);
const match = text.match(/^(\S+)\s+(.+)$/);
return match ? match[2].trim() : text || null;
}

function extractTrekSkuTable() {
const urlColor = extractTrekColorFromUrl();
const rows = [];
const seen = new Set();
document.querySelectorAll('input[data-sku]').forEach((input) => {
const sku = input.getAttribute('data-sku');
if (!sku || seen.has(sku)) return;
const tr = input.closest('tr');
if (!tr) return;
const rowText = textOf(tr);
const sizeMatch = rowText.match(/Tallas?\s+(.+?)\s+UPC\s*\/?\s*EAN/i);
const upcMatch = rowText.match(/UPC\s*\/?\s*EAN\s+(\S+)/i);
const color = extractTrekColorForInput(input) || urlColor;
seen.add(sku);
rows.push({
size: sizeMatch ? sizeMatch[1].trim() : '',
color: color || '',
sku,
upc: upcMatch ? upcMatch[1].trim() : '',
});
});
return rows;
}

const ADAPTERS = [
{
id: 'trek',
matches: (host) => host.endsWith('trekbikes.com'),
extract: async () => {
const data = await genericExtract();
data.brand = data.brand || 'Trek';
try {
const layer = window.dataLayer || [];
for (const entry of layer) {
const products =
(entry && entry.ecommerce && entry.ecommerce.detail && entry.ecommerce.detail.products) ||
(entry && entry.ecommerce && entry.ecommerce.items) ||
null;
if (products && products[0]) {
const p = products[0];
if (p.name) data.model = p.name;
if (p.price) { data.price = String(p.price); data.currency = data.currency || entry.ecommerce.currency || 'USD'; }
if (!data.sku && (p.id || p.sku)) data.sku = String(p.id || p.sku);
break;
}
}
} catch (e) {
log('trek adapter: no se pudo leer dataLayer', e);
}
try {
const skuTable = extractTrekSkuTable();
if (skuTable.length) data.skuTable = skuTable;
if (data.sku) {
const match = skuTable.find((r) => String(r.sku) === String(data.sku));
if (match) {
data.skuSize = match.size || null;
data.skuColor = match.color || null;
}
}
} catch (e) {
log('trek adapter: no se pudo leer la tabla de tallas/SKU', e);
}
try {
const pvpr = extractTrekPvpr();
if (pvpr) {
data.price = pvpr;
data.currency = null;
}
} catch (e) {
log('trek adapter: no se pudo leer el PVP recomendado', e);
}
return data;
},
},
{
id: 'orbea',
matches: (host) => host.endsWith('orbea.com'),
extract: async () => {
const data = await genericExtract();
data.brand = data.brand || 'Orbea';
return data;
},
},
{
id: 'mondraker',
matches: (host) => host.endsWith('mondraker.com'),
extract: async () => {
const data = await genericExtract();
data.brand = data.brand || 'Mondraker';
return data;
},
},
{
id: 'generic',
matches: () => true,
extract: genericExtract,
},
];

function getAdapter() {
const host = location.hostname.replace(/^www\./, '');
return ADAPTERS.find((a) => a.matches(host)) || ADAPTERS[ADAPTERS.length - 1];
}

// --------------------------------------------------------------------------
// 2. CONTENIDO DE GARANTÍAS (mismo texto fijo que bike-spec-extractor, para
// que ambos proyectos digan siempre lo mismo). Se renderiza UNA sola vez
// en la comparativa, nunca por bici.
// --------------------------------------------------------------------------

const WARRANTY_CONTENT = {
fisica: [
{ type: 'h', text: 'Carbon Care' },
{ type: 'p', text: 'Queremos protegerte en todo momento, por lo que te facilitamos las cosas a la hora de cambiar un cuadro o una pieza de carbono que haya resultado dañada gracias al programa Trek Carbon Care. Carbon Care es un programa exclusivo que ofrece a los propietarios de una bicicleta Trek descuentos importantes a la hora de cambiar cuadros, horquillas y piezas de carbono que hayan resultado dañados.' },
{ type: 'h', text: 'Programa de fidelización de ruedas Carbon Care' },
{ type: 'p', text: 'El programa de fidelización de ruedas Carbon Care te da la tranquilidad de saber que estás cubierto por Trek y Bontrager. Somos conscientes de que las ruedas de carbono suponen una gran inversión, y este programa se ha diseñado para que te sientas completamente seguro a la hora de realizar tu compra.' },
{ type: 'h2', text: 'De por vida' },
{ type: 'p', text: 'Todas las ruedas de carbono Bontrager están protegidas por una garantía de por vida para el propietario original frente a defectos de fabricación y materiales. Esta garantía es aplicable a las ruedas compradas después del 1 de agosto de 2019 y a todas las bicicletas de la temporada 2020 y posteriores.' },
{ type: 'h2', text: 'Transcurridos los dos primeros años' },
{ type: 'p', text: 'Una vez transcurridos los dos años a partir de la fecha de compra original, ofrecemos importantes descuentos para la reparación o sustitución de las ruedas de carbono Bontrager dañadas.' },
{ type: 'p', text: 'El programa Carbon Care ofrece dos opciones y la resolución de la incidencia se determinará en función del modelo de rueda y de la gravedad del daño estructural.' },
{ type: 'li', text: 'La reparación de una rueda dañada estructuralmente (incluidos radios, pegatinas, cabecillas, y arandelas si son necesarias) y la reconstrucción en fábrica de los bujes originales.' },
{ type: 'li', text: 'La sustitución completa de la rueda.' },
{ type: 'note', text: '* La reparación y sustitución a través del programa de ruedas Carbon Care debe gestionarse a través de un distribuidor autorizado de Trek. Las tarifas son susceptibles de cambio sin previo aviso. Las tarifas de las reparaciones y la sustitución gratuita no incluyen los costes de envío de ida y vuelta al centro de reparación de ruedas Bontrager. Ponte en contacto con tu distribuidor de Trek para conocer el listado de ruedas cubiertas por este programa, la disponibilidad actual, las tarifas y los costes de envío.' },
{ type: 'p', text: 'Si tu rueda de carbono Bontrager sufre algún daño estructural durante los dos primeros años desde su compra mientras montas en bici, te la reemplazaremos o repararemos de forma gratuita*. Es así de fácil. Esta cobertura se aplica a las ruedas de carbono Bontrager que vienen de serie en las bicicletas, así como a las ruedas compradas a posteriori.' },
{ type: 'h', text: 'Crash Replacement (Sustitución por accidente)' },
{ type: 'p', text: 'Todos los cascos Trek y Bontrager vienen con cobertura Crash Replacement. Si tu casco sufre un impacto durante el primer año desde la fecha de compra, Trek te lo cambia gratis. Solo tienes que enviarnos el casco a portes pagados junto con una copia del ticket y una descripción del accidente. En cuanto recibamos el casco dañado, te enviaremos uno nuevo.' },
{ type: 'h', text: 'Garantía incondicional de 30 días' },
{ type: 'p', text: 'Si, por cualquier motivo, no quedas satisfecho con la compra de un producto Trek o Bontrager, podrás devolverlo, presentando el ticket de compra original, en la tienda donde lo compraste, en un plazo de 30 días, para cambiarlo por otro artículo o recuperar el importe. Es como si tuvieras 30 días de prueba. Esta garantía incluye componentes, ropa y accesorios Trek y Bontrager. No están incluidos los componentes Bontrager OE (equipamiento original) vendidos como parte de una bicicleta. Los productos usados han de limpiarse antes de su devolución. Si envías productos sin limpiar o lavar, te los devolveremos y los gastos correrán de tu cuenta.' },
{ type: 'h', text: 'Garantía Limitada Trek/Bontrager/Electra/Diamant' },
{ type: 'h2', text: 'Cuidamos de ti' },
{ type: 'p', text: 'Ofrecemos una garantía frente a defectos de fabricación o materiales en todos los productos tal y como se especifica a continuación.' },
{ type: 'h2', text: 'Empecemos por lo más importante' },
{ type: 'p', text: 'Ponte en contacto con un distribuidor o tienda autorizada para tramitar una incidencia de garantía. Es necesario presentar la factura legal de compra debidamente cumplimentada, incluyendo la descripción completa del producto, y para el caso de bicicletas o cuadros, su número de serie.' },
{ type: 'h2', text: 'GARANTIA DE LOS PRODUCTOS TREK (DICIEMBRE 2021)' },
{ type: 'p', text: 'TREK BICYCLE, S.L. Unipersonal con domicilio en la calle Ronda de Poniente 12 – 1º planta - 28760 Tres Cantos (Madrid), España (www.trekbikes.com/es/es_ES/contactUs/) garantiza sus productos desde la fecha de su primera adquisición en un concesionario autorizado de España con las siguientes garantías:' },
{ type: 'h2', text: 'GARANTÍA LEGAL' },
{ type: 'p', text: 'TREK BICYCLE, S.L. Unipersonal garantiza sus productos contra defectos de fabricación o materiales durante tres años (*) desde la fecha de su primera adquisición y ante la falta de conformidad conforme estipula la legislación vigente que resulta de aplicación.' },
{ type: 'note', text: '(*) Dos años si la adquisición ha sido antes del 1 de enero de 2022.' },
{ type: 'h2', text: 'GARANTÍA COMERCIAL' },
{ type: 'p', text: 'TREK BICYCLE, S.L. Unipersonal garantiza durante toda su vida útil los cuadros de las bicicletas de la gama 2012 y siguientes así como a los productos distintos a los cuadros de bicicleta que se especifican expresamente a continuación, exclusivamente para el propietario original (solo para personas físicas, quedando excluidas las personas jurídicas y las entidades sin personalidad jurídica que no son beneficiarias de la presente GARANTIA COMERCIAL), y desde la fecha de su primera adquisición con las siguientes limitaciones / particularidades:' },
{ type: 'h2', text: 'Gama 2022 y siguientes' },
{ type: 'li', text: '1) Garantía de por vida exclusivamente para: cuadros rígidos (cuadro y horquilla rígida); cuadro principal y basculante (vainas y tirantes) de los cuadros de doble suspensión; ruedas Bontrager con llantas de carbono.' },
{ type: 'li', text: '2) Propiedad posterior: tres años de garantía para los propietarios posteriores (segundo o sucesivos - excepto aquellos cuadros y basculantes de los mismos que se hayan destinado a competición), exclusivamente para: cuadros rígidos (cuadro y horquilla rígida); cuadro principal y basculante (vainas y tirantes) de los cuadros de doble suspensión; ruedas Bontrager con llantas de carbono adquiridas después del 1 de agosto de 2019.' },
{ type: 'h2', text: 'Gamas 2020 y 2021' },
{ type: 'li', text: '1) Garantía de por vida exclusivamente para: cuadros rígidos (cuadro y horquilla rígida); cuadro principal y basculante (vainas y tirantes) de los cuadros de doble suspensión; ruedas Bontrager con llantas de carbono.' },
{ type: 'li', text: '2) Propiedad posterior: tres años de garantía para los propietarios posteriores (segundo o sucesivos - excepto aquellos cuadros y basculantes de los mismos que se hayan destinado a competición), exclusivamente para: cuadros rígidos (cuadro y horquilla rígida); cuadro principal y basculante (vainas y tirantes) de los cuadros de doble suspensión; ruedas Bontrager con llantas de carbono adquiridas después del 1 de agosto de 2019.' },
{ type: 'h2', text: 'Gamas 2012 a 2019' },
{ type: 'li', text: '1) Garantía de por vida exclusivamente para: cuadros rígidos (no se incluye la horquilla rígida); cuadro principal (no se incluye el basculante – vainas y tirantes - de los cuadros de doble suspensión).' },
{ type: 'li', text: '2) Garantía de cinco años exclusivamente para: los basculantes (vainas y tirantes) de los cuadros de las bicicletas de doble suspensión, excepto las familias SESSION, SCRATCH y SLASH.' },
{ type: 'li', text: '3) Garantía de tres años exclusivamente para: los cuadros y sus basculantes (vainas y tirantes) de las familias SESSION (ALUMINIO), SCRATCH, SLASH y TICKET.' },
{ type: 'li', text: '4) Quedan excluidos de la garantía comercial: los cuadros y sus basculantes (vainas y tirantes) de la familia SESSION (CARBONO), así como las horquillas rígidas.' },
{ type: 'h2', text: 'Gama 2012 y anteriores' },
{ type: 'p', text: 'Para los productos adquiridos antes del año 2012, ponte en contacto con nosotros directamente para conocer la cobertura de la garantía.' },
{ type: 'h2', text: 'LIMITACIONES APLICABLES A LA GARANTIA COMERCIAL' },
{ type: 'p', text: 'La garantía comercial se limita expresamente a la reparación o sustitución de un cuadro, y/o su basculante (vaina y tirantes) con defectos de fabricación o de materiales, TREK BICYCLE, S.L. Unipersonal se reserva el derecho a modificar la nomenclatura, el acabado, el color, la pintura y/o calcomanías del cuadro reparado o de sustitución, las reclamaciones se deben gestionar a través de un concesionario autorizado de la marca TREK que dará traslado de las mismas a TREK BICYCLE, S.L. Unipersonal, se requiere para ello la factura legal de la compra, así como que el mismo acredite su identidad mediante DNI, NIE o PASAPORTE.' },
{ type: 'p', text: 'El propietario de la bicicleta queda advertido que, debido a las mejoras introducidas en diseño y tecnología, el cuadro suministrado dentro del periodo de garantía comercial puede presentar problemas de compatibilidad con los componentes / piezas de su cuadro original. A título meramente enunciativo, que no limitativo, indicamos los siguientes: conjunto de pedalier, rodamientos de la dirección, bieleta (pieza que une los tirantes con el amortiguador), vainas, tirantes, amortiguador, reductores del amortiguador, así como la tornillería precisa para los mismos, guías de cables y tapas de duo – trap, ABP, etc. quedando TREK BICYCLE, S.L. Unipersonal exonerada de los costes derivados por la adquisición de los nuevos componentes / piezas precisas para el montaje, así como de los costes derivados del desmontaje de las piezas y componentes del cuadro original, y de su posterior montaje en el cuadro suministrado o reparado dentro del periodo de garantía comercial.' },
{ type: 'p', text: 'La presente garantía comercial no es de aplicación a los cuadros de bicicletas que se utilicen para actividades comerciales, como por ejemplo para su alquiler, demostraciones o flotas de cuerpos de seguridad.' },
{ type: 'p', text: 'La presente garantía comercial no afecta a los derechos legales de los consumidores y usuarios ante la falta de conformidad de los productos con el contrato siendo éstos independientes y compatibles con la garantía comercial.' },
{ type: 'h2', text: 'LIMITACIONES APLICABLES A LA GARANTIA LEGAL Y COMERCIAL' },
{ type: 'p', text: 'TREK BICYCLE, S.L. Unipersonal garantiza todos los componentes originales de sus bicicletas durante un periodo de tres años (*) desde la fecha de su primera adquisición (excepto todos aquellos sometidos a desgaste por su uso).' },
{ type: 'note', text: '(*) Dos años si la adquisición ha sido antes del 1 de enero de 2022.' },
{ type: 'p', text: 'Las horquillas de suspensión, los amortiguadores y demás componentes de otros fabricantes, estarán cubiertos por la garantía de sus fabricantes originales – o, en su defecto - por sus distribuidores oficiales.' },
{ type: 'p', text: 'El acabado, la pintura y calcomanías de los cuadros de bicicleta cuentan con una garantía de tres años (*) desde la fecha de su primera adquisición contra defectos de fabricación y materiales, el propietario de la bicicleta queda advertido y ello supone una excepción a las garantías otorgadas, que la humedad, el sudor y otros agentes externos pueden provocar corrosión y que la exposición continuada a los rayos ultravioletas del sol deteriora las calcomanías y la pintura de las bicicletas, así como las de sus piezas y componentes.' },
{ type: 'note', text: '(*) Dos años si la adquisición ha sido antes del 1 de enero de 2022.' },
{ type: 'p', text: 'En el caso de las bicicletas eléctricas, todo el sistema eléctrico, incluida la consola (controladora), el cargador, el motor, el cableado y el puerto de la batería cuentan con una garantía de tres años (*) desde la fecha de su primera adquisición, en este sentido se advierte que la batería de la bicicleta es un producto consumible sometido a desgaste por su uso y por tanto se encuentra garantizada durante tres años (*) desde la fecha de su primera adquisición o bien 600 ciclos de carga, lo que primero acontezca.' },
{ type: 'note', text: '(*) Dos años si la adquisición ha sido antes del 1 de enero de 2022.' },
{ type: 'p', text: 'Las garantías otorgadas (legal y comercial) no cubren el deterioro por un uso o desgaste normales, un montaje o tareas de manteniendo inadecuadas, el desgaste de los rodamientos y casquillos de las bicicletas de doble suspensión, el desgaste de cualquier componente consumible (puños, cubiertas, cámaras, cadenas, cables, etc.) la instalación de piezas, accesorios o componentes no diseñados originalmente ni compatibles con la bicicleta vendida, daños producidos por accidentes o durante el transporte de la bicicleta por parte del usuario, un uso erróneo o negligente, así como la modificación o aplicación de pintura en el cuadro, horquilla, piezas y componentes; las garantías otorgadas no son un seguro a todo riesgo.' },
{ type: 'h2', text: 'Trek Carbon Care' },
{ type: 'p', text: 'Los accidentes, en ocasiones, son inevitables. Sabemos lo mucho que aprecias tu bicicleta Trek, y sabemos el inconveniente que supone tener que cambiar un cuadro o un componente dañado cuando no está cubierto por la garantía. Por este motivo, ofrecemos el Programa Trek Carbon Care (www.trekbikes.com/carbon_care/). Este programa permite obtener un descuento en la sustitución de un cuadro o componente en el caso de que los daños no estén cubiertos por la garantía.' },
],
juridica: [
{ type: 'h', text: 'Garantía Limitada Trek/Bontrager/Electra/Diamant' },
{ type: 'h2', text: 'Cuidamos de ti' },
{ type: 'p', text: 'Ofrecemos una garantía frente a defectos de fabricación o materiales en todos los productos tal y como se especifica a continuación.' },
{ type: 'h2', text: 'Empecemos por lo más importante' },
{ type: 'p', text: 'Ponte en contacto con un distribuidor o tienda autorizada para tramitar una incidencia de garantía. Es necesario presentar la factura legal de compra debidamente cumplimentada, incluyendo la descripción completa del producto, y para el caso de bicicletas o cuadros, su número de serie.' },
{ type: 'h2', text: 'GARANTIA DE LOS PRODUCTOS TREK (DICIEMBRE 2021)' },
{ type: 'p', text: 'TREK BICYCLE, S.L. Unipersonal con domicilio en la calle Ronda de Poniente 12 – 1º planta - 28760 Tres Cantos (Madrid), España (www.trekbikes.com/es/es_ES/contactUs/) garantiza sus productos desde la fecha de su primera adquisición en un concesionario autorizado de España con las siguientes garantías:' },
{ type: 'h2', text: 'GARANTÍA LEGAL' },
{ type: 'p', text: 'TREK BICYCLE, S.L. Unipersonal garantiza sus productos contra defectos de fabricación o materiales durante tres años (*) desde la fecha de su primera adquisición y ante la falta de conformidad conforme estipula la legislación vigente que resulta de aplicación.' },
{ type: 'note', text: '(*) Dos años si la adquisición ha sido antes del 1 de enero de 2022.' },
{ type: 'h2', text: 'GARANTÍA COMERCIAL' },
{ type: 'p', text: 'TREK BICYCLE, S.L. Unipersonal garantiza durante 3 años los cuadros de las bicicletas de la gama 2012 y siguientes así como a los productos distintos a los cuadros de bicicleta que se especifican expresamente a continuación, exclusivamente para el propietario original, y desde la fecha de su primera adquisición con las siguientes limitaciones / particularidades:' },
{ type: 'h2', text: 'Gama 2022 y siguientes' },
{ type: 'li', text: '1) Tres años de garantía para el propietario original (excepto aquellos cuadros y basculantes de los mismos que se hayan destinado a competición) para: cuadros rígidos (cuadro y horquilla rígida); cuadro principal y basculante (vainas y tirantes) de los cuadros de doble suspensión; ruedas Bontrager con llantas de carbono.' },
{ type: 'li', text: '2) Propiedad posterior: tres años de garantía para los propietarios posteriores (segundo o sucesivos - excepto aquellos cuadros y basculantes de los mismos que se hayan destinado a competición), exclusivamente para: cuadros rígidos (cuadro y horquilla rígida); cuadro principal y basculante (vainas y tirantes) de los cuadros de doble suspensión; ruedas Bontrager con llantas de carbono adquiridas después del 1 de agosto de 2019.' },
{ type: 'h2', text: 'Gamas 2020 y 2021' },
{ type: 'li', text: '1) Tres años de garantía para el propietario original (excepto aquellos cuadros y basculantes de los mismos que se hayan destinado a competición): cuadros rígidos (cuadro y horquilla rígida); cuadro principal y basculante (vainas y tirantes) de los cuadros de doble suspensión; ruedas Bontrager con llantas de carbono.' },
{ type: 'li', text: '2) Propiedad posterior: tres años de garantía para los propietarios posteriores (segundo o sucesivos - excepto aquellos cuadros y basculantes de los mismos que se hayan destinado a competición), exclusivamente para: cuadros rígidos (cuadro y horquilla rígida); cuadro principal y basculante (vainas y tirantes) de los cuadros de doble suspensión; ruedas Bontrager con llantas de carbono adquiridas después del 1 de agosto de 2019.' },
{ type: 'h2', text: 'Gamas 2012 a 2019' },
{ type: 'li', text: '1) Tres años de garantía para el propietario original (excepto aquellos cuadros y basculantes de los mismos que se hayan destinado a competición): cuadros rígidos (no se incluye la horquilla rígida); cuadro principal (no se incluye el basculante – vainas y tirantes - de los cuadros de doble suspensión).' },
{ type: 'li', text: '2) Garantía de cinco años exclusivamente para: los basculantes (vainas y tirantes) de los cuadros de las bicicletas de doble suspensión, excepto las familias SESSION, SCRATCH y SLASH.' },
{ type: 'li', text: '3) Garantía de tres años exclusivamente para: los cuadros y sus basculantes (vainas y tirantes) de las familias SESSION (ALUMINIO), SCRATCH, SLASH y TICKET.' },
{ type: 'li', text: '4) Quedan excluidos de la garantía comercial: los cuadros y sus basculantes (vainas y tirantes) de la familia SESSION (CARBONO), así como las horquillas rígidas.' },
{ type: 'h2', text: 'Gama 2012 y anteriores' },
{ type: 'p', text: 'Para los productos adquiridos antes del año 2012, ponte en contacto con nosotros directamente para conocer la cobertura de la garantía.' },
{ type: 'h2', text: 'LIMITACIONES APLICABLES A LA GARANTIA COMERCIAL' },
{ type: 'p', text: 'La garantía comercial se limita expresamente a la reparación o sustitución de un cuadro, y/o su basculante (vaina y tirantes) con defectos de fabricación o de materiales, TREK BICYCLE, S.L. Unipersonal se reserva el derecho a modificar la nomenclatura, el acabado, el color, la pintura y/o calcomanías del cuadro reparado o de sustitución, las reclamaciones se deben gestionar a través de un concesionario autorizado de la marca TREK que dará traslado de las mismas a TREK BICYCLE, S.L. Unipersonal, se requiere para ello la factura legal de la compra, así como que el mismo acredite su identidad mediante DNI, NIE o PASAPORTE.' },
{ type: 'p', text: 'El propietario de la bicicleta queda advertido que, debido a las mejoras introducidas en diseño y tecnología, el cuadro suministrado dentro del periodo de garantía comercial puede presentar problemas de compatibilidad con los componentes / piezas de su cuadro original. A título meramente enunciativo, que no limitativo, indicamos los siguientes: conjunto de pedalier, rodamientos de la dirección, bieleta (pieza que une los tirantes con el amortiguador), vainas, tirantes, amortiguador, reductores del amortiguador, así como la tornillería precisa para los mismos, guías de cables y tapas de duo – trap, ABP, etc. quedando TREK BICYCLE, S.L. Unipersonal exonerada de los costes derivados por la adquisición de los nuevos componentes / piezas precisas para el montaje, así como de los costes derivados del desmontaje de las piezas y componentes del cuadro original, y de su posterior montaje en el cuadro suministrado o reparado dentro del periodo de garantía comercial.' },
{ type: 'p', text: 'La presente garantía comercial no es de aplicación a los cuadros de bicicletas que se utilicen para actividades comerciales, como por ejemplo para su alquiler, demostraciones o flotas de cuerpos de seguridad.' },
{ type: 'p', text: 'La presente garantía comercial no afecta a los derechos legales de los consumidores y usuarios ante la falta de conformidad de los productos con el contrato siendo éstos independientes y compatibles con la garantía comercial.' },
{ type: 'h2', text: 'LIMITACIONES APLICABLES A LA GARANTIA LEGAL Y COMERCIAL' },
{ type: 'p', text: 'TREK BICYCLE, S.L. Unipersonal garantiza todos los componentes originales de sus bicicletas durante un periodo de tres años (*) desde la fecha de su primera adquisición (excepto todos aquellos sometidos a desgaste por su uso).' },
{ type: 'note', text: '(*) Dos años si la adquisición ha sido antes del 1 de enero de 2022.' },
{ type: 'p', text: 'Las horquillas de suspensión, los amortiguadores y demás componentes de otros fabricantes, estarán cubiertos por la garantía de sus fabricantes originales – o, en su defecto - por sus distribuidores oficiales.' },
{ type: 'p', text: 'El acabado, la pintura y calcomanías de los cuadros de bicicleta cuentan con una garantía de tres años (*) desde la fecha de su primera adquisición contra defectos de fabricación y materiales, el propietario de la bicicleta queda advertido y ello supone una excepción a las garantías otorgadas, que la humedad, el sudor y otros agentes externos pueden provocar corrosión y que la exposición continuada a los rayos ultravioletas del sol deteriora las calcomanías y la pintura de las bicicletas, así como las de sus piezas y componentes.' },
{ type: 'note', text: '(*) Dos años si la adquisición ha sido antes del 1 de enero de 2022.' },
{ type: 'p', text: 'En el caso de las bicicletas eléctricas, todo el sistema eléctrico, incluida la consola (controladora), el cargador, el motor, el cableado y el puerto de la batería cuentan con una garantía de tres años (*) desde la fecha de su primera adquisición, en este sentido se advierte que la batería de la bicicleta es un producto consumible sometido a desgaste por su uso y por tanto se encuentra garantizada durante tres años (*) desde la fecha de su primera adquisición o bien 600 ciclos de carga, lo que primero acontezca.' },
{ type: 'note', text: '(*) Dos años si la adquisición ha sido antes del 1 de enero de 2022.' },
{ type: 'p', text: 'Las garantías otorgadas (legal y comercial) no cubren el deterioro por un uso o desgaste normales, un montaje o tareas de manteniendo inadecuadas, el desgaste de los rodamientos y casquillos de las bicicletas de doble suspensión, el desgaste de cualquier componente consumible (puños, cubiertas, cámaras, cadenas, cables, etc.) la instalación de piezas, accesorios o componentes no diseñados originalmente ni compatibles con la bicicleta vendida, daños producidos por accidentes o durante el transporte de la bicicleta por parte del usuario, un uso erróneo o negligente, así como la modificación o aplicación de pintura en el cuadro, horquilla, piezas y componentes; las garantías otorgadas no son un seguro a todo riesgo.' },
],
};

function renderWarrantyBlocksHtml(blocks) {
let html = '';
let pendingList = [];
const flushList = () => {
if (pendingList.length) {
html += `<ul>${pendingList.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`;
pendingList = [];
}
};
blocks.forEach((b) => {
if (b.type === 'li') {
pendingList.push(b.text);
return;
}
flushList();
if (b.type === 'h') html += `<h4>${escapeHtml(b.text)}</h4>`;
else if (b.type === 'h2') html += `<h5>${escapeHtml(b.text)}</h5>`;
else if (b.type === 'note') html += `<p class="bcb-note">${escapeHtml(b.text)}</p>`;
else html += `<p>${escapeHtml(b.text)}</p>`;
});
flushList();
return html;
}

function addWarrantyToPdf(doc, blocks, margin, pageWidth, pageHeight, startY) {
let y = startY || margin;
const ensureSpace = (needed) => {
if (y + needed > pageHeight - margin) {
doc.addPage();
y = margin;
}
};
blocks.forEach((b) => {
if (b.type === 'h') {
ensureSpace(30);
y += 10;
doc.setFont('helvetica', 'bold');
doc.setFontSize(13);
doc.setTextColor(0);
doc.text(b.text, margin, y);
y += 16;
} else if (b.type === 'h2') {
ensureSpace(22);
y += 4;
doc.setFont('helvetica', 'bold');
doc.setFontSize(10.5);
doc.setTextColor(30);
doc.text(b.text, margin, y);
y += 13;
} else if (b.type === 'note') {
doc.setFont('helvetica', 'italic');
doc.setFontSize(8);
doc.setTextColor(120);
const lines = doc.splitTextToSize(b.text, pageWidth - margin * 2);
ensureSpace(lines.length * 10 + 4);
doc.text(lines, margin, y);
y += lines.length * 10 + 6;
} else {
const indent = b.type === 'li' ? 12 : 0;
const prefix = b.type === 'li' ? '• ' : '';
doc.setFont('helvetica', 'normal');
doc.setFontSize(9);
doc.setTextColor(40);
const lines = doc.splitTextToSize(prefix + b.text, pageWidth - margin * 2 - indent);
ensureSpace(lines.length * 11 + 6);
doc.text(lines, margin + indent, y);
y += lines.length * 11 + 6;
}
});
doc.setTextColor(0);
}

// --------------------------------------------------------------------------
// 3. DESCARGA Y PROCESADO DE IMÁGENES
// --------------------------------------------------------------------------

function fetchArrayBuffer(url) {
return new Promise((resolve, reject) => {
GM_xmlhttpRequest({
method: 'GET',
url,
responseType: 'arraybuffer',
timeout: 20000,
onload: (res) => {
if (res.status >= 200 && res.status < 300) resolve(res.response);
else reject(new Error('HTTP ' + res.status + ' al descargar ' + url));
},
onerror: () => reject(new Error('Error de red al descargar ' + url)),
ontimeout: () => reject(new Error('Timeout al descargar ' + url)),
});
});
}

async function processImage(url, maxDim = 1400) {
const buf = await fetchArrayBuffer(url);
const blob = new Blob([buf]);
const bitmap = await createImageBitmap(blob);
const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
const w = Math.max(1, Math.round(bitmap.width * scale));
const h = Math.max(1, Math.round(bitmap.height * scale));
const canvas = document.createElement('canvas');
canvas.width = w;
canvas.height = h;
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, w, h);
ctx.drawImage(bitmap, 0, 0, w, h);
const jpegBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
const arrayBuffer = await jpegBlob.arrayBuffer();
const dataUrl = await new Promise((resolve, reject) => {
const reader = new FileReader();
reader.onload = () => resolve(reader.result);
reader.onerror = reject;
reader.readAsDataURL(jpegBlob);
});
return { dataUrl, arrayBuffer, width: w, height: h, sourceUrl: url };
}

async function processImagesSafely(urls, maxDim) {
const out = [];
for (const url of urls) {
try {
out.push(await processImage(url, maxDim));
} catch (e) {
log('No se pudo procesar imagen', url, e);
}
}
return out;
}

function triggerDownload(blob, filename) {
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = filename;
document.body.appendChild(a);
a.click();
a.remove();
setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function escapeHtml(str) {
return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function getLogoDataUrl() {
const cached = GM_getValue(LOGO_CACHE_KEY, null);
if (cached) return cached;
try {
const asset = await processImage(LOGO_URL, 500);
GM_setValue(LOGO_CACHE_KEY, asset.dataUrl);
return asset.dataUrl;
} catch (e) {
log('No se pudo descargar el logo Vadebicis', e);
return null;
}
}

// --------------------------------------------------------------------------
// 4. PRECIOS: parseo de string a número y formateo en euros
// --------------------------------------------------------------------------

function parsePriceNumber(str) {
if (!str) return null;
let s = String(str).replace(/[^\d.,]/g, '').trim();
if (!s) return null;
const lastComma = s.lastIndexOf(',');
const lastDot = s.lastIndexOf('.');
if (lastComma > lastDot) {
s = s.replace(/\./g, '').replace(',', '.');
} else if (lastDot > lastComma) {
s = s.replace(/,/g, '');
} else {
s = s.replace(/,/g, '');
}
const n = parseFloat(s);
return isNaN(n) ? null : n;
}

function formatEUR(n) {
if (n == null || isNaN(n)) return '';
return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function bikeShortName(bike) {
return `${bike.data.brand || ''} ${bike.data.model || ''}`.trim() || 'Bici';
}

function bikeFinalPrice(bike) {
const pvp = parsePriceNumber(bike.data.price);
if (pvp == null) return null;
const pct = Number(bike.discountPct) || 0;
return pvp * (1 - pct / 100);
}

// --------------------------------------------------------------------------
// 5. ESTADO PERSISTENTE (sobrevive a navegar por la web en la misma pestaña)
// --------------------------------------------------------------------------

function loadState() {
const raw = GM_getValue(STATE_KEY, null);
if (!raw) return { client: '', bikes: [] };
try {
const parsed = JSON.parse(raw);
if (!parsed || !Array.isArray(parsed.bikes)) return { client: '', bikes: [] };
return parsed;
} catch (e) {
return { client: '', bikes: [] };
}
}

function saveState(state) {
GM_setValue(STATE_KEY, JSON.stringify(state));
}

function clearState() {
saveState({ client: '', bikes: [] });
}

// --------------------------------------------------------------------------
// 6. FUSIÓN DE ESPECIFICACIONES PARA LA TABLA COMPARATIVA
// Junta las categorías/filas de specs de todas las bicis en una única
// estructura: por cada categoría, la lista de etiquetas distintas vistas
// en cualquiera de las bicis (en orden de aparición), y para cada una el
// valor de CADA bici (o "—" si esa bici no tiene esa fila).
// --------------------------------------------------------------------------

function mergeSpecsForComparison(bikes) {
const categoryOrder = [];
const categoryMap = new Map(); // category -> { labelOrder: [], values: Map(label -> [v0..vN-1]) }

bikes.forEach((bike, bikeIdx) => {
(bike.data.specs || []).forEach((group) => {
const cat = group.category || 'Especificaciones';
if (!categoryMap.has(cat)) {
categoryMap.set(cat, { labelOrder: [], values: new Map() });
categoryOrder.push(cat);
}
const entry = categoryMap.get(cat);
group.rows.forEach((row) => {
if (!entry.values.has(row.label)) {
entry.values.set(row.label, new Array(bikes.length).fill(''));
entry.labelOrder.push(row.label);
}
entry.values.get(row.label)[bikeIdx] = row.value;
});
});
});

return categoryOrder.map((cat) => {
const entry = categoryMap.get(cat);
return {
category: cat,
rows: entry.labelOrder.map((label) => ({
label,
values: entry.values.get(label).map((v) => v || '—'),
})),
};
});
}

// --------------------------------------------------------------------------
// 7. NOMBRE DE ARCHIVO
// --------------------------------------------------------------------------

function comparatorFileName(state, ext) {
const n = state.bikes.length;
const clientPart = state.client ? '-' + state.client : '';
const base = `Comparativa_${n}_bicis${clientPart}`.replace(/[^\w\-]+/g, '_').slice(0, 90);
return `${base}.${ext}`;
}

// --------------------------------------------------------------------------
// 8. GENERACIÓN DE PDF (jsPDF + jspdf-autotable) — comparativa multi-bici
// --------------------------------------------------------------------------

async function buildComparisonPdf(state, sections) {
if (!window.jspdf) throw new Error('jsPDF no se cargó (revisa la consola / conexión a cdn.jsdelivr.net)');
const { jsPDF } = window.jspdf;
const doc = new jsPDF({ unit: 'pt', format: 'a4' });
const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();
const margin = 40;
const bikes = state.bikes;
const n = bikes.length;

const logoDataUrl = await getLogoDataUrl();
const heroAssets = [];
for (const bike of bikes) {
const url = bike.data.images && bike.data.images[0] ? bike.data.images[0].url : null;
const [asset] = url ? await processImagesSafely([url], 900) : [];
heroAssets.push(asset || null);
}

// ---- Portada ----
let y = margin;
doc.setFont('helvetica', 'bold');
doc.setFontSize(22);
doc.text('Comparativa de bicicletas', margin, y + 6);
y += 30;

doc.setFont('helvetica', 'normal');
doc.setFontSize(11);
doc.setTextColor(80);
if (state.client) {
doc.text(`Cliente: ${state.client}`, margin, y);
y += 16;
}
const todayStr = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
doc.text(`Fecha: ${todayStr}`, margin, y);
doc.setTextColor(0);
y += 26;

const gap = 14;
const cardW = (pageWidth - margin * 2 - gap * (n - 1)) / n;
const cardImgH = 110;
let cardY = y;
for (let i = 0; i < n; i++) {
const bike = bikes[i];
const cardX = margin + i * (cardW + gap);
const asset = heroAssets[i];
doc.setDrawColor(220);
doc.roundedRect(cardX, cardY, cardW, cardImgH + 96, 6, 6, 'S');
if (asset) {
const ratio = Math.min((cardW - 12) / asset.width, cardImgH / asset.height, 1);
const w = asset.width * ratio;
const h = asset.height * ratio;
const ix = cardX + (cardW - w) / 2;
doc.addImage(asset.dataUrl, 'JPEG', ix, cardY + 6, w, h);
}
let ty = cardY + cardImgH + 20;
doc.setFont('helvetica', 'bold');
doc.setFontSize(10.5);
doc.setTextColor(0);
const nameLines = doc.splitTextToSize(bikeShortName(bike), cardW - 12).slice(0, 2);
doc.text(nameLines, cardX + 6, ty);
ty += nameLines.length * 12 + 4;

doc.setFont('helvetica', 'normal');
doc.setFontSize(8.5);
doc.setTextColor(100);
if (bike.data.sku) {
doc.text(`SKU: ${bike.data.sku}`, cardX + 6, ty);
ty += 11;
}
const talleColor = [bike.data.skuSize ? `Talla ${bike.data.skuSize}` : '', bike.data.skuColor || ''].filter(Boolean).join(' · ');
if (talleColor) {
doc.text(talleColor, cardX + 6, ty);
ty += 11;
}

const pvp = parsePriceNumber(bike.data.price);
const finalPrice = bikeFinalPrice(bike);
doc.setFontSize(8.5);
doc.setTextColor(140);
if (pvp != null) {
doc.text(`PVP: ${formatEUR(pvp)}`, cardX + 6, ty);
ty += 11;
}
if (bike.discountPct) {
doc.text(`Descuento: ${bike.discountPct}%`, cardX + 6, ty);
ty += 11;
}
doc.setFont('helvetica', 'bold');
doc.setFontSize(11);
doc.setTextColor(176, 40, 31);
doc.text(finalPrice != null ? formatEUR(finalPrice) : (bike.data.price || ''), cardX + 6, ty + 4);
doc.setTextColor(0);
}
cardY += cardImgH + 96 + 20;

if (logoDataUrl) {
try {
const logoImg = await new Promise((resolve) => {
const img = new Image();
img.onload = () => resolve(img);
img.onerror = () => resolve(null);
img.src = logoDataUrl;
});
if (logoImg) {
const logoW = 130;
const logoH = logoW * (logoImg.height / logoImg.width);
doc.addImage(logoDataUrl, 'JPEG', pageWidth - margin - logoW, pageHeight - margin - logoH, logoW, logoH);
}
} catch (e) { log('logo pdf', e); }
}

// ---- Comparativa de especificaciones ----
const mergedSpecs = mergeSpecsForComparison(bikes);
if (mergedSpecs.length) {
doc.addPage();
let cursorY = margin;
doc.setFontSize(16);
doc.setFont('helvetica', 'bold');
doc.text('Comparativa de especificaciones', margin, cursorY);
cursorY += 16;

const headRow = ['Especificación', ...bikes.map((b) => bikeShortName(b))];
mergedSpecs.forEach((group) => {
if (cursorY > pageHeight - 120) {
doc.addPage();
cursorY = margin;
}
doc.autoTable({
startY: cursorY,
margin: { left: margin, right: margin },
head: [[group.category || 'General', ...headRow.slice(1)]],
body: group.rows.map((r) => [r.label, ...r.values]),
theme: 'striped',
headStyles: { fillColor: [31, 79, 176], fontSize: 8.5 },
styles: { fontSize: 8, cellPadding: 4 },
});
cursorY = doc.lastAutoTable.finalY + 16;
});
}

// ---- Galería de fotos (opcional, por bici) ----
if (sections.gallery) {
for (const bike of bikes) {
const urls = (bike.data.images || []).slice(0, 6).map((im) => im.url);
if (!urls.length) continue;
const assets = await processImagesSafely(urls, 700);
if (!assets.length) continue;
doc.addPage();
doc.setFontSize(15);
doc.setFont('helvetica', 'bold');
doc.text(`Galería — ${bikeShortName(bike)}`, margin, margin);
let gx = margin;
let gy = margin + 24;
const cellW = (pageWidth - margin * 2 - 10) / 2;
const cellH = 150;
assets.forEach((asset, i) => {
if (gy + cellH > pageHeight - margin) {
doc.addPage();
gx = margin;
gy = margin;
}
const ratio = Math.min(cellW / asset.width, cellH / asset.height, 1);
const w = asset.width * ratio;
const h = asset.height * ratio;
doc.addImage(asset.dataUrl, 'JPEG', gx, gy, w, h);
if (i % 2 === 0) {
gx += cellW + 10;
} else {
gx = margin;
gy += cellH + 14;
}
});
}
}

// ---- Tabla de SKUs (opcional, combinada con columna Modelo) ----
if (sections.skuTable) {
const combined = [];
bikes.forEach((bike) => {
(bike.data.skuTable || []).forEach((r) => {
combined.push([bikeShortName(bike), r.size, r.color || '', r.sku, r.upc]);
});
});
if (combined.length) {
doc.addPage();
doc.setFontSize(16);
doc.setFont('helvetica', 'bold');
doc.text('Tallas y SKUs disponibles', margin, margin);
doc.autoTable({
startY: margin + 14,
margin: { left: margin, right: margin },
head: [['Modelo', 'Talla', 'Color', 'SKU', 'UPC/EAN']],
body: combined,
theme: 'striped',
headStyles: { fillColor: [31, 79, 176] },
styles: { fontSize: 8.5, cellPadding: 5 },
});
}
}

// ---- Garantías (una sola vez) ----
if (sections.warranty) {
doc.addPage();
doc.setFontSize(16);
doc.setFont('helvetica', 'bold');
doc.setTextColor(0);
doc.text('Garantías', margin, margin);
doc.setFontSize(10);
doc.setFont('helvetica', 'normal');
doc.setTextColor(120);
doc.text(sections.warrantyType === 'juridica' ? 'Comprador: persona jurídica' : 'Comprador: persona física', margin, margin + 16);
doc.setTextColor(0);
const warrantyBlocks = WARRANTY_CONTENT[sections.warrantyType] || WARRANTY_CONTENT.fisica;
addWarrantyToPdf(doc, warrantyBlocks, margin, pageWidth, pageHeight, margin + 34);
}

const totalPages = doc.internal.getNumberOfPages();
for (let i = 1; i <= totalPages; i++) {
doc.setPage(i);
doc.setFontSize(8);
doc.setTextColor(150);
doc.text(`${i} / ${totalPages}`, pageWidth - margin - 30, pageHeight - 14);
}

doc.save(comparatorFileName(state, 'pdf'));
}

// --------------------------------------------------------------------------
// 9. GENERACIÓN DE WORD (html-docx-js) — comparativa multi-bici
// --------------------------------------------------------------------------

async function buildComparisonDocx(state, sections) {
if (!window.htmlDocx) throw new Error('html-docx-js no se cargó (revisa la consola / conexión a cdn.jsdelivr.net)');
const bikes = state.bikes;
const n = bikes.length;

const logoDataUrl = await getLogoDataUrl();
const heroAssets = [];
for (const bike of bikes) {
const url = bike.data.images && bike.data.images[0] ? bike.data.images[0].url : null;
const [asset] = url ? await processImagesSafely([url], 700) : [];
heroAssets.push(asset || null);
}

const CARD_IMG_WIDTH = Math.floor(480 / n) - 10;

const coverCardsHtml = bikes
.map((bike, i) => {
const asset = heroAssets[i];
const pvp = parsePriceNumber(bike.data.price);
const finalPrice = bikeFinalPrice(bike);
const talleColor = [bike.data.skuSize ? `Talla ${bike.data.skuSize}` : '', bike.data.skuColor || ''].filter(Boolean).join(' · ');
const imgTag = asset ? `<img src="${asset.dataUrl}" width="${CARD_IMG_WIDTH}" height="${Math.round(CARD_IMG_WIDTH * (asset.height / asset.width))}">` : '';
return `<td class="bcb-card">
${imgTag}<br>
<strong>${escapeHtml(bikeShortName(bike))}</strong><br>
${bike.data.sku ? `<span class="bcb-meta">SKU: ${escapeHtml(bike.data.sku)}</span><br>` : ''}
${talleColor ? `<span class="bcb-meta">${escapeHtml(talleColor)}</span><br>` : ''}
${pvp != null ? `<span class="bcb-meta">PVP: ${escapeHtml(formatEUR(pvp))}</span><br>` : ''}
${bike.discountPct ? `<span class="bcb-meta">Descuento: ${escapeHtml(String(bike.discountPct))}%</span><br>` : ''}
<span class="bcb-price">${escapeHtml(finalPrice != null ? formatEUR(finalPrice) : (bike.data.price || ''))}</span>
</td>`;
})
.join('');

const mergedSpecs = mergeSpecsForComparison(bikes);
const specsHtml = mergedSpecs
.map((group) => {
const headCells = ['Especificación', ...bikes.map((b) => escapeHtml(bikeShortName(b)))].map((h) => `<th>${h}</th>`).join('');
const rows = group.rows
.map((r) => `<tr><td class="bcb-label">${escapeHtml(r.label)}</td>${r.values.map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`)
.join('');
return `<h3>${escapeHtml(group.category || 'Especificaciones')}</h3><table class="bcb-compare"><tr>${headCells}</tr>${rows}</table>`;
})
.join('');

let galleryHtml = '';
if (sections.gallery) {
for (const bike of bikes) {
const urls = (bike.data.images || []).slice(0, 6).map((im) => im.url);
if (!urls.length) continue;
const assets = await processImagesSafely(urls, 500);
if (!assets.length) continue;
galleryHtml += `<h3>Galería — ${escapeHtml(bikeShortName(bike))}</h3><div class="bcb-gallery">${assets
.map((a) => `<img src="${a.dataUrl}" width="150" height="${Math.round(150 * (a.height / a.width))}" style="margin:4pt;">`)
.join('')}</div>`;
}
if (galleryHtml) galleryHtml = `<h2>Galería de fotos</h2>${galleryHtml}`;
}

let skuTableHtml = '';
if (sections.skuTable) {
const combinedRows = [];
bikes.forEach((bike) => {
(bike.data.skuTable || []).forEach((r) => {
combinedRows.push(
`<tr><td>${escapeHtml(bikeShortName(bike))}</td><td>${escapeHtml(r.size)}</td><td>${escapeHtml(r.color || '')}</td><td>${escapeHtml(r.sku)}</td><td>${escapeHtml(r.upc)}</td></tr>`
);
});
});
if (combinedRows.length) {
skuTableHtml = `<h2>Tallas y SKUs disponibles</h2>
<table class="bcb-compare"><tr><th>Modelo</th><th>Talla</th><th>Color</th><th>SKU</th><th>UPC/EAN</th></tr>${combinedRows.join('')}</table>`;
}
}

const warrantyHtml = sections.warranty
? `<h2>Garantías</h2>
<p class="bcb-meta">Comprador: ${sections.warrantyType === 'juridica' ? 'persona jurídica' : 'persona física'}</p>
${renderWarrantyBlocksHtml(WARRANTY_CONTENT[sections.warrantyType] || WARRANTY_CONTENT.fisica)}`
: '';

const todayStr = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const logoTag = logoDataUrl ? `<p style="text-align:right;"><img src="${logoDataUrl}" width="130"></p>` : '';

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: Calibri, Arial, sans-serif; color: #16181d; }
h1 { font-size: 24pt; margin-bottom: 4pt; }
h2 { font-size: 15pt; margin-top: 22pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
h3 { font-size: 11.5pt; margin-top: 14pt; margin-bottom: 4pt; color: #1f4fb0; }
h4 { font-size: 12pt; margin-top: 14pt; margin-bottom: 4pt; }
h5 { font-size: 10.5pt; margin-top: 10pt; margin-bottom: 3pt; color: #333; }
table.bcb-cover { width: 100%; border-collapse: collapse; margin: 14pt 0 4pt; }
table.bcb-cover td.bcb-card { border: 1px solid #ddd; border-radius: 6px; padding: 8pt; vertical-align: top; text-align: center; font-size: 9pt; width: ${Math.floor(100 / n)}%; }
table.bcb-compare { width: 100%; border-collapse: collapse; margin-bottom: 12pt; font-size: 9pt; }
table.bcb-compare th, table.bcb-compare td { border: 1px solid #ddd; padding: 4pt 6pt; vertical-align: top; }
table.bcb-compare th { background: #1f4fb0; color: #fff; }
table.bcb-compare td.bcb-label { font-weight: bold; }
.bcb-price { color: #b0281f; font-size: 11pt; font-weight: bold; }
.bcb-meta { font-size: 8pt; color: #666; }
.bcb-note { font-size: 8.5pt; font-style: italic; color: #777; }
.meta-top { font-size: 9pt; color: #666; }
</style>
</head>
<body>
<h1>Comparativa de bicicletas</h1>
${state.client ? `<p class="meta-top">Cliente: ${escapeHtml(state.client)}</p>` : ''}
<p class="meta-top">Fecha: ${todayStr}</p>
<table class="bcb-cover"><tr>${coverCardsHtml}</tr></table>
${logoTag}
${mergedSpecs.length ? `<h2>Comparativa de especificaciones</h2>${specsHtml}` : ''}
${galleryHtml}
${skuTableHtml}
${warrantyHtml}
</body>
</html>`;

const blob = htmlDocx.asBlob(html, { orientation: 'portrait' });
triggerDownload(blob, comparatorFileName(state, 'docx'));
}

// --------------------------------------------------------------------------
// 10. INTERFAZ: badge flotante + panel + menú final + resultado
// --------------------------------------------------------------------------

function closeOverlay() {
const overlay = document.getElementById('bcb-overlay');
if (overlay) overlay.remove();
}

function openOverlay(innerHtml, mountId) {
closeOverlay();
const overlay = document.createElement('div');
overlay.id = 'bcb-overlay';
overlay.addEventListener('click', (e) => {
if (e.target === overlay) closeOverlay();
});
overlay.innerHTML = innerHtml;
document.body.appendChild(overlay);
return document.getElementById(mountId);
}

function renderBadge() {
let btn = document.getElementById('bcb-launcher');
if (!btn) {
btn = document.createElement('button');
btn.id = 'bcb-launcher';
btn.title = 'Build ' + BUILD;
btn.addEventListener('click', openPanel);
document.body.appendChild(btn);
}
const state = loadState();
btn.textContent = `🔀 Comparador (${state.bikes.length}/${MAX_BIKES})`;
}

function panelBikeRowsHtml(state) {
if (!state.bikes.length) return '<div class="bcb-empty">Todavía no has añadido ninguna bici.</div>';
return `<div class="bcb-bike-list">${state.bikes
.map((bike, i) => {
const finalPrice = bikeFinalPrice(bike);
return `<div class="bcb-bike-row">
<div class="bcb-bike-info">
<div class="bcb-bike-name">${escapeHtml(bikeShortName(bike))}</div>
<div class="bcb-bike-meta">${bike.data.sku ? 'SKU ' + escapeHtml(bike.data.sku) + ' · ' : ''}Descuento ${bike.discountPct || 0}% ${finalPrice != null ? '· ' + escapeHtml(formatEUR(finalPrice)) : ''}</div>
</div>
<button data-bcb-remove="${i}">Quitar</button>
</div>`;
})
.join('')}</div>`;
}

function openPanel() {
const state = loadState();
const mount = openOverlay(
`<div id="bcb-panel">
<button class="bcb-close">✕</button>
<h1>Comparador de bicicletas</h1>
<p class="bcb-sub">Añade hasta ${MAX_BIKES} bicis navegando por la web (en la misma pestaña) y luego genera la comparativa.</p>
<div class="bcb-field">
<label for="bcb-client">Cliente</label>
<input type="text" id="bcb-client" placeholder="Nombre del cliente" value="${escapeHtml(state.client || '')}">
</div>
${panelBikeRowsHtml(state)}
<div class="bcb-actions">
<button class="bcb-btn-primary" id="bcb-add-btn" ${state.bikes.length >= MAX_BIKES ? 'disabled' : ''}>➕ Añadir esta página</button>
<button class="bcb-btn-secondary" id="bcb-generate-btn" ${state.bikes.length === 0 ? 'disabled' : ''}>📄 Generar comparativa (${state.bikes.length})</button>
</div>
<div class="bcb-actions">
<button class="bcb-btn-danger" id="bcb-clear-btn">Vaciar todo</button>
</div>
</div>`,
'bcb-panel'
);

document.querySelector('#bcb-overlay .bcb-close').addEventListener('click', closeOverlay);

const clientInput = mount.querySelector('#bcb-client');
clientInput.addEventListener('change', () => {
const s = loadState();
s.client = clientInput.value.trim();
saveState(s);
});

mount.querySelectorAll('[data-bcb-remove]').forEach((btn) => {
btn.addEventListener('click', () => {
const idx = Number(btn.getAttribute('data-bcb-remove'));
const s = loadState();
s.bikes.splice(idx, 1);
saveState(s);
renderBadge();
openPanel();
});
});

mount.querySelector('#bcb-clear-btn').addEventListener('click', () => {
if (!confirm('¿Vaciar la comparativa? Se perderán las bicis añadidas.')) return;
clearState();
renderBadge();
openPanel();
});

const addBtn = mount.querySelector('#bcb-add-btn');
addBtn.addEventListener('click', () => addCurrentBikeFlow());

const genBtn = mount.querySelector('#bcb-generate-btn');
genBtn.addEventListener('click', () => openFinalMenu());
}

async function addCurrentBikeFlow() {
const state = loadState();
if (state.bikes.length >= MAX_BIKES) return;

const addBtn = document.getElementById('bcb-add-btn');
if (addBtn) {
addBtn.disabled = true;
addBtn.textContent = '⏳ Extrayendo…';
}
let data;
try {
const adapter = getAdapter();
log('Usando adaptador:', adapter.id);
data = await adapter.extract();
} catch (e) {
console.error(e);
alert('No se pudo extraer la ficha de esta página: ' + e.message);
openPanel();
return;
}

openDiscountForm(data);
}

function openDiscountForm(data) {
const mount = openOverlay(
`<div id="bcb-panel">
<button class="bcb-close">✕</button>
<h1>Añadir a la comparativa</h1>
<p class="bcb-sub">${escapeHtml(((data.brand || '') + ' ' + (data.model || '')).trim() || 'Bici detectada')}${data.sku ? ' · SKU ' + escapeHtml(data.sku) : ''}</p>
${!data.model ? '<div class="bcb-warning">No se han podido detectar bien algunos datos de esta página. Puedes añadirla igualmente y revisarla luego en el documento final.</div>' : ''}
<div class="bcb-field">
<label for="bcb-discount">Descuento aplicado a esta bici (%)</label>
<input type="number" id="bcb-discount" value="0" min="0" max="100" step="0.5">
</div>
${data.price ? `<p class="bcb-sub">PVP detectado: ${escapeHtml(data.price)}${data.currency ? ' ' + escapeHtml(data.currency) : ''}</p>` : ''}
<div class="bcb-actions">
<button class="bcb-btn-secondary" id="bcb-discount-cancel">Cancelar</button>
<button class="bcb-btn-primary" id="bcb-discount-confirm">Añadir a la comparativa</button>
</div>
</div>`,
'bcb-panel'
);

document.querySelector('#bcb-overlay .bcb-close').addEventListener('click', () => openPanel());
mount.querySelector('#bcb-discount-cancel').addEventListener('click', () => openPanel());
mount.querySelector('#bcb-discount-confirm').addEventListener('click', () => {
const discountInput = mount.querySelector('#bcb-discount');
const discountPct = Math.max(0, Math.min(100, Number(discountInput.value) || 0));
const s = loadState();
if (s.bikes.length >= MAX_BIKES) {
alert(`Ya hay ${MAX_BIKES} bicis en la comparativa (el máximo).`);
openPanel();
return;
}
s.bikes.push({ data, discountPct });
saveState(s);
renderBadge();
openPanel();
});
}

function openFinalMenu() {
const state = loadState();
if (!state.bikes.length) { openPanel(); return; }

const hasGallery = state.bikes.some((b) => b.data.images && b.data.images.length > 1);
const hasSkuTable = state.bikes.some((b) => b.data.skuTable && b.data.skuTable.length);

const row = (id, label, available) =>
available
? `<div class="bcb-menu-row">
<input type="checkbox" id="${id}" checked>
<label for="${id}">${escapeHtml(label)}</label>
</div>`
: '';

const mount = openOverlay(
`<div id="bcb-menu-modal">
<button class="bcb-close">✕</button>
<h1>¿Qué incluye la comparativa?</h1>
<p class="bcb-sub">${state.bikes.length} bicis · Cliente: ${escapeHtml(state.client || '(sin especificar)')}</p>
${row('bcb-chk-gallery', 'Galería de fotos (por cada bici)', hasGallery)}
${row('bcb-chk-skutable', 'Tabla de SKUs disponibles', hasSkuTable)}
<div class="bcb-menu-row">
<input type="checkbox" id="bcb-chk-warranty">
<label for="bcb-chk-warranty">Garantías del fabricante (aparece una sola vez)</label>
</div>
<div class="bcb-menu-sub-row" id="bcb-warranty-sub">
<label><input type="radio" name="bcb-warranty-type" value="fisica" checked> Persona física</label>
<label><input type="radio" name="bcb-warranty-type" value="juridica"> Persona jurídica</label>
</div>
<div class="bcb-actions">
<button class="bcb-btn-secondary" id="bcb-menu-back">Volver</button>
<button class="bcb-btn-primary" id="bcb-menu-confirm">Continuar</button>
</div>
</div>`,
'bcb-menu-modal'
);

document.querySelector('#bcb-overlay .bcb-close').addEventListener('click', () => openPanel());
mount.querySelector('#bcb-menu-back').addEventListener('click', () => openPanel());

const warrantyChk = mount.querySelector('#bcb-chk-warranty');
const warrantySub = mount.querySelector('#bcb-warranty-sub');
warrantyChk.addEventListener('change', () => {
warrantySub.classList.toggle('bcb-visible', warrantyChk.checked);
});

mount.querySelector('#bcb-menu-confirm').addEventListener('click', () => {
const galleryChk = mount.querySelector('#bcb-chk-gallery');
const skuChk = mount.querySelector('#bcb-chk-skutable');
const warrantyType = mount.querySelector('input[name="bcb-warranty-type"]:checked');
const sections = {
gallery: hasGallery && !!(galleryChk && galleryChk.checked),
skuTable: hasSkuTable && !!(skuChk && skuChk.checked),
warranty: !!warrantyChk.checked,
warrantyType: warrantyType ? warrantyType.value : 'fisica',
};
showResultModal(state, sections);
});
}

function showResultModal(state, sections) {
const mount = openOverlay(
`<div id="bcb-preview-modal">
<button class="bcb-close">✕</button>
<h1>Comparativa lista para generar</h1>
<p class="bcb-sub">${state.bikes.length} bicis · Cliente: ${escapeHtml(state.client || '(sin especificar)')}</p>
<div class="bcb-bike-list">${state.bikes
.map((b) => {
const fp = bikeFinalPrice(b);
return `<div class="bcb-bike-row"><div class="bcb-bike-info"><div class="bcb-bike-name">${escapeHtml(bikeShortName(b))}</div><div class="bcb-bike-meta">${fp != null ? escapeHtml(formatEUR(fp)) : ''}</div></div></div>`;
})
.join('')}</div>
<div class="bcb-actions">
<button class="bcb-btn-secondary" id="bcb-result-back">Volver</button>
<button class="bcb-btn-primary" id="bcb-result-pdf">⬇ Descargar PDF</button>
<button class="bcb-btn-primary" id="bcb-result-docx">⬇ Descargar Word</button>
</div>
</div>`,
'bcb-preview-modal'
);

document.querySelector('#bcb-overlay .bcb-close').addEventListener('click', closeOverlay);
mount.querySelector('#bcb-result-back').addEventListener('click', () => openFinalMenu());

const pdfBtn = mount.querySelector('#bcb-result-pdf');
pdfBtn.addEventListener('click', async () => {
pdfBtn.disabled = true;
pdfBtn.textContent = 'Generando PDF…';
try {
await buildComparisonPdf(state, sections);
} catch (e) {
console.error(e);
alert('No se pudo generar el PDF: ' + e.message);
} finally {
pdfBtn.disabled = false;
pdfBtn.textContent = '⬇ Descargar PDF';
}
});

const docxBtn = mount.querySelector('#bcb-result-docx');
docxBtn.addEventListener('click', async () => {
docxBtn.disabled = true;
docxBtn.textContent = 'Generando Word…';
try {
await buildComparisonDocx(state, sections);
} catch (e) {
console.error(e);
alert('No se pudo generar el Word: ' + e.message);
} finally {
docxBtn.disabled = false;
docxBtn.textContent = '⬇ Descargar Word';
}
});
}

// --------------------------------------------------------------------------
// 11. ARRANQUE (con soporte para sitios de una sola página / navegación SPA)
// --------------------------------------------------------------------------

function boot() {
if (!document.body) {
setTimeout(boot, 200);
return;
}
renderBadge();
}

boot();

let lastUrl = location.href;
setInterval(() => {
if (location.href !== lastUrl) {
lastUrl = location.href;
closeOverlay();
renderBadge();
}
}, 1000);
})();
