// Builds public/world.svg (country outlines, equirectangular projection, 1000x500 grid)
// from Natural Earth data via world-atlas. Run once; the dashboard then needs no internet.
const path = require('path');
const fs = require('fs');
const geoDir = process.argv[2];
const out = process.argv[3];
const topo = require(path.join(geoDir, 'node_modules/topojson-client'));
const world = require(path.join(geoDir, 'node_modules/world-atlas/countries-110m.json'));

const W = 1000, H = 500;
const X = (lon) => ((lon + 180) / 360) * W;
const Y = (lat) => ((90 - lat) / 180) * H;

const countries = topo.feature(world, world.objects.countries).features
  .filter((f) => f.properties.name !== 'Antarctica');

// Shapes that cross the date line (Russia, Fiji) jump across the whole map; start a new
// sub-path at the jump instead of drawing a line across the world.
const ring = (r) => {
  let d = '', prev = null;
  for (const [lon, lat] of r) {
    const jump = prev !== null && Math.abs(lon - prev) > 180;
    d += `${prev === null || jump ? 'M' : 'L'}${X(lon).toFixed(1)} ${Y(lat).toFixed(1)}`;
    prev = lon;
  }
  return d + 'Z';
};
const paths = countries.map((f) => {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map((p) => p.map(ring).join('')).join('');
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 14 ${W} 400"><g fill="#e4e3de" stroke="#ffffff" stroke-width="0.5">${paths.map((d) => `<path d="${d}"/>`).join('')}</g></svg>\n`;
fs.writeFileSync(out, svg);
console.log(`Wrote ${out} (${(svg.length / 1024).toFixed(0)} KB, ${countries.length} countries)`);
