import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "frontend/src/geo/russia-subjects.json");
const tmp = join(root, "tmp-geo");

function distToSeg(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function rdp(points, eps) {
  if (points.length <= 4) return points;
  let maxD = 0;
  let idx = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i += 1) {
    const d = distToSeg(points[i], points[0], points[end]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

function roundRing(ring, digits = 2) {
  const k = 10 ** digits;
  const outRing = [];
  let prev = "";
  for (const pt of ring) {
    const lon = Math.round(pt[0] * k) / k;
    const lat = Math.round(pt[1] * k) / k;
    const key = `${lon},${lat}`;
    if (key === prev) continue;
    outRing.push([lon, lat]);
    prev = key;
  }
  if (
    outRing.length >= 2 &&
    outRing[0][0] === outRing.at(-1)[0] &&
    outRing[0][1] === outRing.at(-1)[1]
  ) {
    outRing.pop();
  }
  const simplified = rdp(outRing, 0.08);
  if (simplified.length < 3) return [];
  simplified.push(simplified[0]);
  return simplified;
}

function cleanCoords(coords, type) {
  if (type === "Polygon") {
    return coords.map((ring) => roundRing(ring)).filter((r) => r.length >= 4);
  }
  if (type === "MultiPolygon") {
    return coords
      .map((poly) => poly.map((ring) => roundRing(ring)).filter((r) => r.length >= 4))
      .filter((poly) => poly.length);
  }
  return coords;
}

function featureFromNominatim(file, name) {
  const geo = JSON.parse(readFileSync(join(tmp, file), "utf8"));
  const f = geo.features?.[0];
  if (!f?.geometry) throw new Error(`no geometry in ${file}`);
  const coordinates = cleanCoords(f.geometry.coordinates, f.geometry.type);
  if (!coordinates?.length) throw new Error(`empty after simplify: ${file}`);
  return {
    type: "Feature",
    properties: { name },
    geometry: { type: f.geometry.type, coordinates },
  };
}

const extra = [
  ["crimea-nom.geojson", "Республика Крым"],
  ["sevastopol-nom.geojson", "Севастополь"],
  ["donetsk-nom.geojson", "Донецкая Народная Республика"],
  ["luhansk-nom.geojson", "Луганская Народная Республика"],
  ["kherson-nom.geojson", "Херсонская область"],
].map(([file, name]) => featureFromNominatim(file, name));

const russia = JSON.parse(readFileSync(dest, "utf8"));
const have = new Set(russia.features.map((f) => f.properties.name));
for (const f of extra) {
  if (have.has(f.properties.name)) continue;
  russia.features.push(f);
  have.add(f.properties.name);
}

const json = JSON.stringify(russia);
writeFileSync(dest, json);
console.log("features", russia.features.length);
console.log("bytes", Buffer.byteLength(json));
console.log("added", extra.map((f) => f.properties.name).join(", "));
