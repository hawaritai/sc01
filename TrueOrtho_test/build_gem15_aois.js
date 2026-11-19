/**
 * Build real AOI datasets from:
 *  - TrueOrtho_test/data/GEM15_SriLanka_DSM_polygon1.tif + AOI/L1_lower_right_partial.gpkg
 *  - TrueOrtho_test/data/GEM15_SriLanka_DSM_polygon2.tif + AOI/L1_upper_left_partial.gpkg
 *  - Real OSM building footprints via api.openstreetmap.org
 *  - Real Lot 01 flight plan cameras from FlightPlan/Lot_01/SC01_Lot01_2112_Plan_Point.dbf
 *
 * Updates lot01_aoi_data.js and saves polygon1_osm_buildings.geojson / polygon2_osm_buildings.geojson.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const vm = require("vm");

global.Worker = function () {};
const GeoTIFF = require(path.join(__dirname, "vendor", "geotiff.js"));

const DATA_DIR = path.join(__dirname, "data");
const AOI_DIR = path.join(DATA_DIR, "AOI");
const LOT01_POINT_DBF = "D:\\projects\\SC01\\FlightPlan\\Lot_01\\SC01_Lot01_2112_Plan_Point.dbf";
// const LOT01_POINT_DBF = "D:\\Projects\\0_Current_projects\\SC01\\FlightPlan\\Lot_01\\SC01_Lot01_2112_Plan_Point.dbf";
const LOT01_DATA_JS = path.join(__dirname, "lot01_aoi_data.js");

function wgs84ToEpsg3857(lat, lon) {
  const x = (lon / 180.0) * 20037508.342789244;
  const y = Math.log(Math.tan(Math.PI / 4.0 + (lat * Math.PI) / 360.0)) * 6378137.0;
  return [x, y];
}

function epsg3857ToWgs84(x, y) {
  const lon = (x / 20037508.342789244) * 180.0;
  const lat = (2.0 * Math.atan(Math.exp(y / 6378137.0)) - Math.PI / 2.0) * (180.0 / Math.PI);
  return [lat, lon];
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "SC01-TrueOrtho-Simulator/1.0" }, timeout: 25000 },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

function readLot01Points() {
  const buf = fs.readFileSync(LOT01_POINT_DBF);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const numRec = dv.getUint32(4, true);
  const headerLen = dv.getUint16(8, true);
  const recLen = dv.getUint16(10, true);
  const dec = new TextDecoder("utf-8", { fatal: false });

  const fields = [];
  let pos = 32;
  while (pos < headerLen && buf[pos] !== 0x0d) {
    let end = pos;
    while (end < pos + 11 && buf[end] !== 0) end++;
    fields.push({ name: dec.decode(buf.subarray(pos, end)).trim(), len: buf[pos + 16] });
    pos += 32;
  }

  const pts = [];
  for (let r = 0; r < numRec; r++) {
    let off = headerLen + r * recLen + 1;
    const row = {};
    for (const f of fields) {
      row[f.name] = dec.decode(buf.subarray(off, off + f.len)).replace(/\0/g, "").trim();
      off += f.len;
    }
    const parts = (row.Positionlo || "").split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      pts.push({
        aoi: row.AOI,
        line: row.FlightLine,
        event: row.EventLabel,
        x: parts[0],
        y: parts[1],
        z: parts[2],
        gsdCm: Number(row["MeanGSD[cm"] || 8),
        altFt: Number(row["AltMSL[ft]"] || 6000),
        wgs84: (row.PositionWG || "").replace(/\?/g, "\u00b0"),
      });
    }
  }
  return pts;
}

async function extractDsmAndDtm(tifPath, centerLat, centerLon, halfSpanM = 1200, outN = 81) {
  const buf = fs.readFileSync(tifPath);
  const tiff = await GeoTIFF.fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const srcW = img.getWidth();
  const srcH = img.getHeight();
  const bbox = img.getBoundingBox(); // [minX, minY, maxX, maxY]
  const resX = (bbox[2] - bbox[0]) / srcW;
  const resY = (bbox[3] - bbox[1]) / srcH;

  const [cx, cy] = wgs84ToEpsg3857(centerLat, centerLon);
  const pxCenter = (cx - bbox[0]) / resX;
  const pyCenter = (bbox[3] - cy) / resY;
  const halfPxX = Math.ceil(halfSpanM / resX) + 4;
  const halfPxY = Math.ceil(halfSpanM / resY) + 4;

  const x0 = Math.max(0, Math.floor(pxCenter - halfPxX));
  const y0 = Math.max(0, Math.floor(pyCenter - halfPxY));
  const x1 = Math.min(srcW, Math.ceil(pxCenter + halfPxX));
  const y1 = Math.min(srcH, Math.ceil(pyCenter + halfPxY));

  const winW = x1 - x0;
  const winH = y1 - y0;
  const rasters = await img.readRasters({ window: [x0, y0, x1, y1] });
  const raw = rasters[0];

  // Fill any rare NoData pixels with local median/average
  const filled = new Float32Array(winW * winH);
  let fallbackMean = 0, cnt = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] > -500 && Number.isFinite(raw[i])) {
      fallbackMean += raw[i];
      cnt++;
    }
  }
  fallbackMean = cnt ? fallbackMean / cnt : 100;

  for (let py = 0; py < winH; py++) {
    for (let px = 0; px < winW; px++) {
      const v = raw[py * winW + px];
      if (v > -500 && Number.isFinite(v)) {
        filled[py * winW + px] = v;
      } else {
        let sum = 0, n = 0;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const yy = py + dy, xx = px + dx;
            if (yy >= 0 && yy < winH && xx >= 0 && xx < winW) {
              const nv = raw[yy * winW + xx];
              if (nv > -500 && Number.isFinite(nv)) { sum += nv; n++; }
            }
          }
        }
        filled[py * winW + px] = n ? sum / n : fallbackMean;
      }
    }
  }

  // Morphological bare-earth DTM estimate: 3x3 erosion (min) followed by 3x3 smoothing
  const eroded = new Float32Array(winW * winH);
  for (let py = 0; py < winH; py++) {
    for (let px = 0; px < winW; px++) {
      let mn = Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = Math.max(0, Math.min(winH - 1, py + dy));
          const xx = Math.max(0, Math.min(winW - 1, px + dx));
          const v = filled[yy * winW + xx];
          if (v < mn) mn = v;
        }
      }
      eroded[py * winW + px] = mn;
    }
  }
  const dtmWin = new Float32Array(winW * winH);
  for (let py = 0; py < winH; py++) {
    for (let px = 0; px < winW; px++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = Math.max(0, Math.min(winH - 1, py + dy));
          const xx = Math.max(0, Math.min(winW - 1, px + dx));
          sum += eroded[yy * winW + xx];
          n++;
        }
      }
      dtmWin[py * winW + px] = sum / n;
    }
  }

  // Bilinear sample onto outN x outN grid covering [-halfSpanM, +halfSpanM] (row 0 = South -halfSpanM)
  function sampleWin(arr, east, north) {
    const wx = cx + east;
    const wy = cy + north;
    const u = (wx - bbox[0]) / resX - x0;
    const v = (bbox[3] - wy) / resY - y0;
    const ix = Math.max(0, Math.min(winW - 2, Math.floor(u)));
    const iy = Math.max(0, Math.min(winH - 2, Math.floor(v)));
    const fx = Math.max(0, Math.min(1, u - ix));
    const fy = Math.max(0, Math.min(1, v - iy));
    return (
      arr[iy * winW + ix] * (1 - fx) * (1 - fy) +
      arr[iy * winW + ix + 1] * fx * (1 - fy) +
      arr[(iy + 1) * winW + ix] * (1 - fx) * fy +
      arr[(iy + 1) * winW + ix + 1] * fx * fy
    );
  }

  const dsmRows = [], dtmRows = [];
  let dsmMin = Infinity, dsmMax = -Infinity, dsmSum = 0;
  let dtmMin = Infinity, dtmMax = -Infinity, dtmSum = 0;

  for (let j = 0; j < outN; j++) {
    const north = -halfSpanM + (2 * halfSpanM * j) / (outN - 1);
    const dsmR = [], dtmR = [];
    for (let i = 0; i < outN; i++) {
      const east = -halfSpanM + (2 * halfSpanM * i) / (outN - 1);
      const zvDsm = Number(sampleWin(filled, east, north).toFixed(2));
      const zvDtm = Number(sampleWin(dtmWin, east, north).toFixed(2));
      dsmR.push(zvDsm);
      dtmR.push(zvDtm);
      if (zvDsm < dsmMin) dsmMin = zvDsm;
      if (zvDsm > dsmMax) dsmMax = zvDsm;
      dsmSum += zvDsm;
      if (zvDtm < dtmMin) dtmMin = zvDtm;
      if (zvDtm > dtmMax) dtmMax = zvDtm;
      dtmSum += zvDtm;
    }
    dsmRows.push(dsmR);
    dtmRows.push(dtmR);
  }

  const makeGridObj = (rows, mn, mx, sm) => ({
    nx: outN,
    ny: outN,
    minX: -halfSpanM,
    maxX: halfSpanM,
    minY: -halfSpanM,
    maxY: halfSpanM,
    minZ: Number(mn.toFixed(2)),
    maxZ: Number(mx.toFixed(2)),
    meanZ: Number((sm / (outN * outN)).toFixed(2)),
    elevations: rows,
  });

  return {
    originEpsg3857: [Number(cx.toFixed(2)), Number(cy.toFixed(2))],
    dsmGrid: makeGridObj(dsmRows, dsmMin, dsmMax, dsmSum),
    dtmGrid: makeGridObj(dtmRows, dtmMin, dtmMax, dtmSum),
    sampleNdsmAtLocal: (east, north) => Math.max(0, sampleWin(filled, east, north) - sampleWin(dtmWin, east, north)),
  };
}

async function fetchOsmBuildingsForAoi(centerLat, centerLon, originX, originY, sampleNdsmFn, geojsonOutPath) {
  const halfLon = 0.011;
  const halfLat = 0.011;
  const w = (centerLon - halfLon).toFixed(5);
  const s = (centerLat - halfLat).toFixed(5);
  const e = (centerLon + halfLon).toFixed(5);
  const n = (centerLat + halfLat).toFixed(5);

  const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${w},${s},${e},${n}`;
  console.log("Fetching OSM buildings from:", url);
  const osm = await fetchJson(url);

  const nodes = new Map();
  for (const el of osm.elements || []) {
    if (el.type === "node") nodes.set(el.id, [el.lon, el.lat]);
  }

  const features = [];
  const compactBuildings = [];

  for (const el of osm.elements || []) {
    if (el.type !== "way" || !el.tags || !el.tags.building || !el.nodes || el.nodes.length < 4) continue;
    const wgsRing = [];
    const localRing = [];
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    let sumE = 0, sumN = 0;

    for (const nid of el.nodes) {
      const pt = nodes.get(nid);
      if (!pt) continue;
      wgsRing.push(pt);
      const [mx, my] = wgs84ToEpsg3857(pt[1], pt[0]);
      const le = Number((mx - originX).toFixed(2));
      const ln = Number((my - originY).toFixed(2));
      localRing.push([le, ln]);
      if (le < minE) minE = le;
      if (le > maxE) maxE = le;
      if (ln < minN) minN = ln;
      if (ln > maxN) maxN = ln;
      sumE += le;
      sumN += ln;
    }

    if (localRing.length < 4) continue;
    const ce = sumE / localRing.length;
    const cn = sumN / localRing.length;
    const tags = el.tags;

    let h = null;
    let hSrc = "osm_default";
    if (tags.height) {
      const parsed = parseFloat(String(tags.height).replace(/[^\d.-]/g, ""));
      if (Number.isFinite(parsed) && parsed > 1) {
        h = parsed;
        hSrc = "osm_height";
      }
    }
    if (h === null && tags["building:levels"]) {
      const lvls = parseFloat(tags["building:levels"]);
      if (Number.isFinite(lvls) && lvls > 0) {
        h = lvls * 3.5;
        hSrc = "osm_levels";
      }
    }
    if (h === null) {
      const ndsm = sampleNdsmFn(ce, cn);
      if (ndsm >= 3.0) {
        h = Number(Math.min(48, ndsm).toFixed(1));
        hSrc = "gem15_ndsm";
      } else {
        // Realistic Sri Lanka town building height variation based on footprint area
        const areaApprox = (maxE - minE) * (maxN - minN);
        h = areaApprox > 600 ? 15.0 : areaApprox > 250 ? 11.0 : 8.0;
        hSrc = "footprint_est";
      }
    }

    features.push({
      type: "Feature",
      properties: {
        id: `osm_${el.id}`,
        name: tags.name || tags["name:en"] || `OSM-${el.id}`,
        building: tags.building,
        height: Number(h.toFixed(1)),
        height_source: hSrc,
        "building:levels": tags["building:levels"] || null,
      },
      geometry: { type: "Polygon", coordinates: [wgsRing] },
    });

    // Keep buildings inside the 2100m x 2100m DTM core for fast interactive 3D rendering
    if (Math.abs(ce) <= 1020 && Math.abs(cn) <= 1020) {
      const dist2 = ce * ce + cn * cn;
      compactBuildings.push({
        id: `OSM-${el.id}`,
        label: tags.name || tags["name:en"] || `OSM Building (${tags.building})`,
        localRing,
        h: Number(h.toFixed(1)),
        dist2,
      });
    }
  }

  fs.writeFileSync(
    geojsonOutPath,
    JSON.stringify({ type: "FeatureCollection", features }, null, 2),
    "utf8"
  );

  // Prioritize up to 420 buildings closest to center so 3D extrusion & raycast stay snappy
  compactBuildings.sort((a, b) => a.dist2 - b.dist2);
  const selected = compactBuildings.slice(0, 420).map(({ id, label, localRing, h }) => ({
    id,
    label,
    localRing,
    h,
  }));

  console.log(`  Saved ${features.length} total OSM polygons -> ${path.basename(geojsonOutPath)} (embedded ${selected.length} in simulator)`);
  return selected;
}

async function main() {
  // Load existing lot01_aoi_data.js to keep 01I and 01C intact
  const sb = { window: {} };
  vm.runInNewContext(fs.readFileSync(LOT01_DATA_JS, "utf8"), sb);
  const payload = sb.window.LOT01_AOI_DATA;
  if (!payload) throw new Error("Failed to load existing lot01_aoi_data.js");

  const allLot01Pts = readLot01Points();

  const configs = [
    {
      key: "poly1",
      title: "Polygon 1: L1 Lower-Right (Monaragala Mountain Town)",
      gpkg: "L1_lower_right_partial.gpkg",
      tifName: "GEM15_SriLanka_DSM_polygon1.tif",
      centerLat: 6.8730,
      centerLon: 81.3490,
      aoiHint: "01D",
      geojsonOut: path.join(AOI_DIR, "polygon1_osm_buildings.geojson"),
    },
    {
      key: "poly2",
      title: "Polygon 2: L1 Upper-Left (Sublot 01J Hill-Town)",
      gpkg: "L1_upper_left_partial.gpkg",
      tifName: "GEM15_SriLanka_DSM_polygon2.tif",
      centerLat: 7.6334,
      centerLon: 80.3129,
      aoiHint: "01J",
      geojsonOut: path.join(AOI_DIR, "polygon2_osm_buildings.geojson"),
    },
  ];

  payload.aois = payload.aois || {};

  for (const cfg of configs) {
    console.log(`\n=== Building ${cfg.title} ===`);
    const tifPath = path.join(DATA_DIR, cfg.tifName);
    const { originEpsg3857, dsmGrid, dtmGrid, sampleNdsmAtLocal } = await extractDsmAndDtm(
      tifPath,
      cfg.centerLat,
      cfg.centerLon,
      1200,
      81
    );
    const [ox, oy] = originEpsg3857;
    console.log(`  DSM Z: ${dsmGrid.minZ}..${dsmGrid.maxZ}m (mean ${dsmGrid.meanZ}m) | DTM Z: ${dtmGrid.minZ}..${dtmGrid.maxZ}m`);

    const buildings = await fetchOsmBuildingsForAoi(
      cfg.centerLat,
      cfg.centerLon,
      ox,
      oy,
      sampleNdsmAtLocal,
      cfg.geojsonOut
    );

    const cams = allLot01Pts
      .filter((p) => Math.abs(p.x - ox) <= 1600 && Math.abs(p.y - oy) <= 1600)
      .map((p) => ({
        id: `L${Number(p.line)}-${p.event}`,
        strip: Number(p.line),
        event: Number(p.event),
        east: Number((p.x - ox).toFixed(2)),
        north: Number((p.y - oy).toFixed(2)),
        altMsl: Number(p.z.toFixed(2)),
        altFt: p.altFt,
        gsdCm: p.gsdCm,
        wgs84: p.wgs84,
      }));
    cams.sort((a, b) => a.strip - b.strip || a.event - b.event);
    console.log(`  Lot 01 overlapping cameras (${cfg.aoiHint}): ${cams.length}`);

    payload.aois[cfg.key] = {
      key: cfg.key,
      title: cfg.title,
      gpkg: cfg.gpkg,
      dsmFile: cfg.tifName,
      originEpsg3857,
      centerLatLon: [cfg.centerLat, cfg.centerLon],
      dtmGrid,
      dsmGrid,
      buildings,
      cameras: cams,
    };
  }

  fs.writeFileSync(
    LOT01_DATA_JS,
    "// Auto-generated from Lot 01 shapefiles, GEM15 DSM GeoTIFFs & OSM Buildings\nwindow.LOT01_AOI_DATA = " +
      JSON.stringify(payload) +
      ";\n",
    "utf8"
  );
  console.log(`\nUpdated ${LOT01_DATA_JS} (${(fs.statSync(LOT01_DATA_JS).size / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
