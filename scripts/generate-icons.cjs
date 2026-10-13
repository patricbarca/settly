// Genera todos los iconos de Settlia a partir de public/icons/logo-s.svg (la S
// original en alta definición: contorno vectorial + degradado/sombras del logo
// original). Mantiene la composición exacta de los iconos originales.
// Uso (desde la raíz del repo): node scripts/generate-icons.cjs .
// Requiere Playwright con Chromium.
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const fs = require('fs');
const OUT = process.argv[2] || '.';
const mark = fs.readFileSync(`${OUT}/public/icons/logo-s.svg`, 'utf8');
const vb = mark.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const markRatio = vb[2] / vb[3]; // ancho/alto de la S
const NAVY = '#0D1B2A';
const markURI = 'data:image/svg+xml;base64,' + Buffer.from(mark).toString('base64');

// sh = alto de la S / alto del icono; rx = radio de esquina / lado (null = a sangre)
function page(w, h, { sh, rx = null, bg = NAVY, cx = 0.5, cy = 0.5 }) {
  const sH = sh * h, sW = sH * markRatio;
  const box = bg ? `background:${bg};${rx === null ? '' : `border-radius:${rx * w}px;`}` : '';
  return `<html><body style="margin:0;background:transparent"><div style="position:relative;width:${w}px;height:${h}px;overflow:hidden;${box}">
<img src="${markURI}" style="position:absolute;left:${cx * w - sW / 2}px;top:${cy * h - sH / 2}px;width:${sW}px;height:${sH}px"></div></body></html>`;
}
// Composiciones medidas sobre los PNG originales.
const ICON = { sh: 0.57, rx: 0.2 };
const jobs = [
  ['public/icons/logo-s.png', 452, 552, { sh: 0.712, bg: null, cx: 0.508, cy: 0.506 }],
  ['public/icons/logo-s@4x.png', 1808, 2208, { sh: 0.712, bg: null, cx: 0.508, cy: 0.506 }],
  ['public/icons/icon-192.png', 192, 192, ICON],
  ['public/icons/icon-512.png', 512, 512, ICON],
  ['public/icons/icon-maskable-512.png', 512, 512, { sh: 0.486 }],
  ['public/icons/apple-touch-icon.png', 180, 180, { sh: 0.561, rx: 0.19 }],
  ['public/icons/favicon-32.png', 32, 32, { sh: 0.562, rx: 0.156 }],
  // iOS: a sangre y sin alfa (Apple rechaza iconos con transparencia)
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, 1024, { sh: 0.486 }, true],
];
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  const base = `android/app/src/main/res/mipmap-${d}/`;
  jobs.push([base + 'ic_launcher.png', 48 * k, 48 * k, { sh: 0.568, rx: 0.18 }]);
  jobs.push([base + 'ic_launcher_round.png', 48 * k, 48 * k, { sh: 0.568, rx: 0.18 }]);
  jobs.push([base + 'ic_launcher_foreground.png', 108 * k, 108 * k, { sh: 0.41, bg: null }]);
}
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [file, w, h, opt, opaque] of jobs) {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(page(w, h, opt));
    await p.waitForFunction(() => [...document.images].every((i) => i.complete));
    await p.screenshot({ path: `${OUT}/${file}`, omitBackground: !opaque });
    console.log('ok', file, w, h);
  }
  // icon.svg (favicon vectorial): cuadro navy redondeado + la S
  const S = 120, sH = ICON.sh * S, sW = sH * markRatio;
  const inner = mark.replace('<svg ', `<svg x="${(S - sW) / 2}" y="${(S - sH) / 2}" width="${sW}" height="${sH}" `);
  fs.writeFileSync(`${OUT}/public/icons/icon.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" rx="${ICON.rx * S}" fill="${NAVY}"/>${inner}</svg>`);
  await b.close();
})();
