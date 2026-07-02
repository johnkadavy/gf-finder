/**
 * Digest hero map generator — renders a neighborhood highlighted on a flat
 * illustrated map of the surrounding area, from lib/nyc-neighborhoods.json.
 *
 * Resolution mirrors the app: custom zone (nyc-custom-zones.ts) first, then
 * geojson name, then NTA aliases (nyc-nta-aliases.ts). Custom zones are
 * clipped to land; alias-merged targets have carve-out zones subtracted and
 * render only their largest connected piece.
 *
 * Usage:  node --experimental-strip-types scripts/digest-heroes/mapgen.mjs "Williamsburg" out/williamsburg.svg
 * Needs:  npm i -D @turf/union @turf/difference @turf/intersect @turf/helpers
 * Then:   python3 scripts/digest-heroes/rasterize.py out/ public/digest/
 */
import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { union } = require("@turf/union");
const { difference } = require("@turf/difference");
const { featureCollection, polygon } = require("@turf/helpers");
const { intersect } = require("@turf/intersect");

import { fileURLToPath } from "url";
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const geo = JSON.parse(readFileSync(`${ROOT}lib/nyc-neighborhoods.json`, "utf8"));
const aliasSrc = readFileSync(`${ROOT}lib/nyc-nta-aliases.ts`, "utf8");
const zones = (await import(`${ROOT}lib/nyc-custom-zones.ts`)).CUSTOM_ZONES;
const TOPIC = process.argv[2], OUT = process.argv[3];
const W = 560, H = 315;

const aliasPairs = [...aliasSrc.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map(m => [m[1], m[2]]);
const targetNames = new Set([TOPIC, ...aliasPairs.filter(([, v]) => v === TOPIC).map(([k]) => k)]);
const zoneList = Array.isArray(zones) ? zones : Object.values(zones).find(Array.isArray) ?? [];
const zoneMatch = zoneList.find(z => z.name === TOPIC);

let merged;
if (zoneMatch) {
  const zonePoly = polygon([zoneMatch.polygon]);
  // clip zone to land so rectangles don't spill into rivers
  const zb = [Math.min(...zoneMatch.polygon.map(p=>p[0])), Math.min(...zoneMatch.polygon.map(p=>p[1])), Math.max(...zoneMatch.polygon.map(p=>p[0])), Math.max(...zoneMatch.polygon.map(p=>p[1]))];
  const pieces = [];
  for (const f of geo.features) {
    const frings = f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat();
    const pts = frings.flat();
    const fb = [Math.min(...pts.map(p=>p[0])), Math.min(...pts.map(p=>p[1])), Math.max(...pts.map(p=>p[0])), Math.max(...pts.map(p=>p[1]))];
    if (fb[0] > zb[2] || fb[2] < zb[0] || fb[1] > zb[3] || fb[3] < zb[1]) continue;
    try { const p = intersect(featureCollection([zonePoly, f])); if (p) pieces.push(p); } catch {}
  }
  merged = pieces.length ? pieces.reduce((a, b) => union(featureCollection([a, b]))) : zonePoly;
} else {
  const feats = geo.features.filter(f => targetNames.has(f.properties.name));
  if (!feats.length) { console.error("NO FEATURES for", TOPIC); process.exit(1); }
  merged = feats.length > 1 ? union(featureCollection(feats)) : feats[0];
  // subtract custom zones carved out of this area (no-op if disjoint)
  for (const z of zoneList) {
    if (z.name === TOPIC) continue;
    try {
      const d = difference(featureCollection([merged, polygon([z.polygon])]));
      if (d) merged = d;
    } catch {}
  }
}

const rings = f => {
  const g = f.geometry;
  if (g.type === "Polygon") return g.coordinates;
  if (g.type === "MultiPolygon") return g.coordinates.flat();
  return [];
};
let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
for (const ring of rings(merged)) for (const [x,y] of ring) {
  minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y);
}
const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
const spanX = Math.max((maxX-minX)*3.4, (maxY-minY)*3.4*(W/H)*0.7);
const spanY = spanX*Math.cos(cy*Math.PI/180)*(H/W);
const x0=cx-spanX/2, x1=cx+spanX/2, y0=cy-spanY/2, y1=cy+spanY/2;
const px = ([lng,lat]) => [ (lng-x0)/(x1-x0)*W, (1-(lat-y0)/(y1-y0))*H ];

function simplify(pts, tol=1.2) {
  const out=[pts[0]]; let last=pts[0];
  for (const p of pts) { if (Math.hypot(p[0]-last[0],p[1]-last[1])>tol){out.push(p);last=p;} }
  out.push(pts[pts.length-1]); return out;
}
const toPath = f => rings(f).map(ring => {
  let pts = ring.map(px);
  if (!pts.some(([x,y]) => x>-80&&x<W+80&&y>-80&&y<H+80)) return "";
  pts = simplify(pts);
  return "M" + pts.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join("L") + "Z";
}).join("");

let land="", borders="";
for (const f of geo.features) {
  const d = toPath(f);
  if (!d) continue;
  land += `<path d="${d}" fill="#EAE3D0"/>`;
  borders += `<path d="${d}" fill="none" stroke="#D9D1BA" stroke-width="1"/>`;
}
function ringAreaPx(ring) {
  const pts = ring.map(px); let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}
const biggest = rings(merged).reduce((best, r) => ringAreaPx(r) > ringAreaPx(best) ? r : best);
const td = toPath({ geometry: { type: "Polygon", coordinates: [biggest] } });

const allRings = geo.features.flatMap(rings).map(r => r.map(px));
function inRing(pt, ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const[xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>pt[1])!=(yj>pt[1]))&&(pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi))c=!c;}return c;}
const inLand = pt => allRings.some(r => inRing(pt, r));
const waterPts = [];
for (let gx=60; gx<=500; gx+=44) for (let gy=50; gy<=270; gy+=40) {
  const pt=[gx+((gy*7)%23),gy];
  if (inLand(pt)) continue;
  if (waterPts.some(w=>Math.hypot(w[0]-pt[0],w[1]-pt[1])<90)) continue;
  waterPts.push(pt);
  if (waterPts.length>=5) break;
}
const waves = waterPts.map(([x,y])=>`<path d="M${x-12},${y} q6,-6 12,0 q6,6 12,0" stroke="#C9BFA4" stroke-width="2" fill="none" stroke-linecap="round"/>`).join("");

const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#F4F1E8"/>
${land}${borders}${waves}
<path d="${td}" fill="#FF7444" stroke="#D85A30" stroke-width="2"/>
</svg>`;
writeFileSync(OUT, svg);
console.log(TOPIC, "→", OUT, zoneMatch ? "(custom zone)" : "(NTA)", svg.length+"b");
