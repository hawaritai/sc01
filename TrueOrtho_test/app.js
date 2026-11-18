/* SC01 Sri Lanka — Minimalist 3D True Orthophoto Simulator with Hilly DTM */
(function () {
  "use strict";

  const DATA = window.LOT01_AOI_DATA;
  if (!DATA) {
    alert("Missing lot01_aoi_data.js. Run extract_lot01_aoi.py first.");
    return;
  }

  const STRIP_PALETTE = [
    "#38bdf8", "#a78bfa", "#34d399", "#fbbf24",
    "#f472b6", "#60a5fa", "#fb923c", "#2dd4bf", "#c084fc",
  ];

  const CAM_COLORS = [
    "#38bdf8", "#818cf8", "#34d399", "#fbbf24", "#f472b6", "#22d3ee", "#a3e635",
    "#60a5fa", "#c084fc", "#2dd4bf", "#fb923c", "#e879f9", "#4ade80", "#facc15",
  ];

  // DTM block domain (Three.js world: x = East, y = Elevation MSL, z = -North)
  const DTM_HALF = 1200; // 2400m x 2400m sculpted 3D terrain block
  const DTM_NX = 101;    // 24m grid spacing
  const DTM_NZ = 101;
  const AOI_HALF_X = 850; // Evaluation zone: 1700m x 1900m on the hilly terrain
  const AOI_HALF_Z = 950;

  // Curated 30 buildings including high-rise towers (95m-185m) and mid/low-rise blocks across valley, slopes & ridges
  const HILL_BUILDINGS = [
    // Central Valley Downtown High-Rise Skyline (near z = 0, x = -220..+280)
    { id: "B01", label: "Skyline Landmark Tower", cx: -35, cy: 52, w: 52, d: 48, h: 185 },
    { id: "B02", label: "Central Twin High-Rise S", cx: -35, cy: -42, w: 52, d: 48, h: 155 },
    { id: "B03", label: "East Metro Tower A", cx: 58, cy: 48, w: 54, d: 46, h: 138 },
    { id: "B04", label: "East Metro Tower B", cx: 60, cy: -40, w: 54, d: 46, h: 112 },
    { id: "B05", label: "Market Hall West", cx: -145, cy: 18, w: 68, d: 60, h: 28 },
    { id: "B06", label: "West Financial High-Rise", cx: -145, cy: -80, w: 54, d: 48, h: 128 },
    { id: "B07", label: "Civic Apex Skyscraper", cx: 168, cy: 12, w: 50, d: 52, h: 168 },
    { id: "B08", label: "Depot East Low-Rise", cx: 270, cy: -35, w: 72, d: 52, h: 24 },
    { id: "B25", label: "West Plaza High-Rise", cx: -255, cy: 30, w: 48, d: 48, h: 118 },
    { id: "B26", label: "South Gate High-Rise", cx: 168, cy: -98, w: 48, d: 44, h: 98 },

    // North Hillside Cluster (around cy = +420..+520)
    { id: "B09", label: "North Slope High-Rise 1", cx: -120, cy: 470, w: 54, d: 48, h: 115 },
    { id: "B10", label: "North Slope Block 2", cx: -120, cy: 386, w: 58, d: 44, h: 42 },
    { id: "B11", label: "North Hill Landmark Tower", cx: 38, cy: 445, w: 50, d: 50, h: 148 },
    { id: "B12", label: "North Terrace West", cx: -260, cy: 430, w: 66, d: 50, h: 30 },
    { id: "B13", label: "North Terrace East", cx: 188, cy: 455, w: 56, d: 48, h: 96 },
    { id: "B27", label: "North Corridor Tower", cx: -15, cy: 250, w: 46, d: 46, h: 124 },

    // South Hillside Cluster (around cy = -420..-520)
    { id: "B14", label: "South Slope High-Rise 1", cx: 62, cy: -418, w: 56, d: 46, h: 120 },
    { id: "B15", label: "South Slope Block 2", cx: 62, cy: -502, w: 60, d: 44, h: 44 },
    { id: "B16", label: "South Hill Landmark Tower", cx: -95, cy: -460, w: 52, d: 52, h: 152 },
    { id: "B17", label: "South Depot", cx: -245, cy: -465, w: 72, d: 54, h: 26 },
    { id: "B18", label: "South Annex High-Rise", cx: 210, cy: -455, w: 52, d: 48, h: 105 },
    { id: "B28", label: "South Corridor Tower", cx: 35, cy: -245, w: 46, d: 46, h: 116 },

    // Ridge Crest & High-Slope Structures (NW, NE, SW, SE hills)
    { id: "B19", label: "NW Ridge Tower", cx: -480, cy: 425, w: 50, d: 50, h: 110 },
    { id: "B20", label: "NW Slope Complex", cx: -480, cy: 335, w: 60, d: 44, h: 36 },
    { id: "B21", label: "NE Peak High-Rise", cx: 510, cy: 380, w: 52, d: 50, h: 125 },
    { id: "B22", label: "SW Hill High-Rise", cx: -450, cy: -490, w: 54, d: 50, h: 108 },
    { id: "B23", label: "SE Escarpment Tower", cx: 480, cy: -455, w: 52, d: 52, h: 132 },
    { id: "B24", label: "SE Terrace Block", cx: 480, cy: -545, w: 60, d: 44, h: 34 },
    { id: "B29", label: "North Valley Overlook", cx: -45, cy: 675, w: 48, d: 46, h: 98 },
    { id: "B30", label: "South Valley Overlook", cx: 55, cy: -685, w: 48, d: 46, h: 102 },
  ];

  const PRESETS = {
    lot01_actual: {
      useExactShapefile: true,
      lockSpacing: false,
      heightAgl: 1720,
      forelapPct: 80.5,
      sidelapPct: 41.8,
      lineSpacingM: 921,
      airbaseM: 214,
      headingDeg: 90,
      focalMm: 40,
      sensorAlongMm: 40.051,
      sensorCrossMm: 53.407,
      pixelUm: 3.76,
      nominalGsdCm: null,
      omega: 0,
      phi: 0,
      bldgHeightScale: 1.0,
      dtmReliefAmp: 1.0,
    },
    sintegra_top: {
      useExactShapefile: false,
      lockSpacing: false,
      heightAgl: 1500,
      forelapPct: 80,
      sidelapPct: 60,
      lineSpacingM: 804,
      airbaseM: 300,
      headingDeg: 90,
      focalMm: 40,
      sensorAlongMm: 40.051,
      sensorCrossMm: 53.407,
      pixelUm: 3.76,
      nominalGsdCm: null,
      omega: 0,
      phi: 0,
      bldgHeightScale: 1.0,
      dtmReliefAmp: 1.0,
    },
    sintegra_40: {
      useExactShapefile: false,
      lockSpacing: false,
      heightAgl: 1500,
      forelapPct: 80,
      sidelapPct: 40,
      lineSpacingM: 1202,
      airbaseM: 300,
      headingDeg: 90,
      focalMm: 40,
      sensorAlongMm: 40.051,
      sensorCrossMm: 53.407,
      pixelUm: 3.76,
      nominalGsdCm: null,
      omega: 0,
      phi: 0,
      bldgHeightScale: 1.0,
      dtmReliefAmp: 1.0,
    },
    cloud_750_unadj: {
      useExactShapefile: false,
      lockSpacing: true,
      heightAgl: 750,
      forelapPct: 60,
      sidelapPct: -20,
      lineSpacingM: 1202,
      airbaseM: 300,
      headingDeg: 90,
      focalMm: 40,
      sensorAlongMm: 40.051,
      sensorCrossMm: 53.407,
      pixelUm: 3.76,
      nominalGsdCm: null,
      omega: 0,
      phi: 0,
      bldgHeightScale: 1.0,
      dtmReliefAmp: 1.0,
    },
    cloud_750_adj: {
      useExactShapefile: false,
      lockSpacing: false,
      heightAgl: 750,
      forelapPct: 80,
      sidelapPct: 60,
      lineSpacingM: 401,
      airbaseM: 150,
      headingDeg: 90,
      focalMm: 40,
      sensorAlongMm: 40.051,
      sensorCrossMm: 53.407,
      pixelUm: 3.76,
      nominalGsdCm: null,
      omega: 0,
      phi: 0,
      bldgHeightScale: 1.0,
      dtmReliefAmp: 1.0,
    },
    steep_hills: {
      useExactShapefile: false,
      lockSpacing: false,
      heightAgl: 900,
      forelapPct: 75,
      sidelapPct: 45,
      lineSpacingM: 660,
      airbaseM: 225,
      headingDeg: 90,
      focalMm: 40,
      sensorAlongMm: 40.051,
      sensorCrossMm: 53.407,
      pixelUm: 3.76,
      nominalGsdCm: null,
      omega: 0,
      phi: 0,
      bldgHeightScale: 1.8,
      dtmReliefAmp: 1.4,
    },
  };

  const CAMERA_MODELS = {
    ixm_rs150f_40: {
      label: "Phase One iXM-RS150F 40mm",
      focalMm: 40,
      sensorCrossMm: 53.407,
      sensorAlongMm: 40.051,
      pixelUm: 3.76,
      pupilMm: 94.1,
    },
    ixm_rs150f_50: {
      label: "Phase One iXM-RS150F 50mm",
      focalMm: 50,
      sensorCrossMm: 53.407,
      sensorAlongMm: 40.051,
      pixelUm: 3.76,
      pupilMm: 99.3,
    },
  };

  const state = {
    aoiKey: "poly1",         // 'poly1' | 'poly2' | '01I' | '01C'
    surfaceMode: "dtm",      // 'dtm' | 'dsm'
    baseMapMode: "google_sat", // 'google_sat' | 'google_hybrid' | 'satellite' | 'osm' | 'topo' | 'none' | 'custom'
    baseMapZoom: 17,           // 15 (4.8m/px) .. 18 (0.6m/px)
    showBaseMapLayer: true,
    showBldgsLayer: true,
    showContoursLayer: true,
    crsMode: "EPSG:3857",
    lastHoverWorldXZ: null,
    customBaseMapImg: null,
    presetKey: "lot01_actual",
    camModel: "ixm_rs150f_40",
    targetMode: "both",      // 'both' | 'nadir' | 'full3d'
    colorMode: "pass_fail",  // 'pass_fail' | 'heatmap' | 'per_camera'
    showVisColoring: true,
    lightOpacity: 0.70,
    showFootprints: true,
    showFrustums: true,
    lockSpacing: false,
    useExactShapefile: true,

    heightAgl: 1720,
    forelapPct: 80.5,
    sidelapPct: 41.8,
    lineSpacingM: 921,
    airbaseM: 214,
    headingDeg: 90,
    focalMm: 40,
    sensorAlongMm: 40.051,
    sensorCrossMm: 53.407,
    pixelUm: 3.76,
    pupilMm: 94.1,
    nominalGsdCm: null,
    omega: 0,
    phi: 0,

    bldgHeightScale: 1.0,
    dtmReliefAmp: 1.0,

    theme: "light", // 'light' | 'dark'
    originEpsg3857: [...((DATA.aois && DATA.aois.poly1 && DATA.aois.poly1.originEpsg3857) || DATA.originEpsg3857)],
    customDtm: null,       // { worldMinX, worldMaxX, worldMinY, worldMaxY, nx, ny, data: Float32Array, isLocal, name }
    customDsm: null,       // { worldMinX, worldMaxX, worldMinY, worldMaxY, nx, ny, data: Float32Array, isLocal, name }
    customBuildings: null, // [{ id, label, worldRing: [[wx,wy],...], isLocal, heightM, heightSource }]
    customFlight: null,    // { name, cameras: [{ id, strip, wx, wy, altMsl, omega, phi, kappa, isLocal, aoi }], rawRecords }
    dtmSourceLabel: "",
    bldgSourceLabel: "",
    flightSourceLabel: "",
    cameras: [],
    selectedCamIndex: 0,
    inspectedHit: null,
  };

  const NEON_HEX = 0x00f0ff;
  const NEON_ACCENT_HEX = 0x39ff14;

  // Three.js & geometry state
  let scene, camera, renderer, controls, raycaster;
  let dtmGroup, dtmMesh, dtmLightOverlayMesh, dtmContourLines, dtmSkirtMesh, aoiBorderLine;
  let ovVertexGridIdx = new Int32Array(0);
  let baseMapCanvas = null, hillCanvas = null, baseMapTexture = null, baseMapReqId = 0, lastBaseMapKey = "";
  let buildingsGroup, buildingsMesh, buildingsEdgeLines;
  let flightGroup, rayGroup;
  let cameraPickMeshes = [];

  // Cached DTM height & normal grid (DTM_NX x DTM_NZ)
  const dtmGrid = {
    nx: DTM_NX,
    nz: DTM_NZ,
    elev: new Float32Array(DTM_NX * DTM_NZ),
    normX: new Float32Array(DTM_NX * DTM_NZ),
    normY: new Float32Array(DTM_NX * DTM_NZ),
    normZ: new Float32Array(DTM_NX * DTM_NZ),
    inAoi: new Uint8Array(DTM_NX * DTM_NZ),
    insideBldg: new Uint8Array(DTM_NX * DTM_NZ),
    minZ: 40,
    maxZ: 300,
    meanZ: 135,
  };

  let buildingBoxes = [];
  const BLDG_GRID_N = 24;
  let bldgGridCells = [];
  let bldgTestStamp = new Int32Array(0);
  let bldgStampId = 0;
  let globalMaxBldgY = 0;
  let buildingPatches = {
    count: 0,
    px: null, py: null, pz: null,
    nx: null, ny: null, nz: null,
    isRoof: null,
    bIdx: null,
    area: null,
    vertStart: null,
    vertCount: null,
    visR: null, visG: null, visB: null,
    colorAttr: null,
    faceMeta: [],
  };

  // =========================================================================
  // 1. CRS Helpers, Sculpted / Real DTM & DSM Queries
  // =========================================================================
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

  function wgs84ToUtm44N(latDeg, lonDeg) {
    const a = 6378137.0;
    const f = 1.0 / 298.257223563;
    const e2 = 2 * f - f * f;
    const ep2 = e2 / (1 - e2);
    const k0 = 0.9996;
    const lat = (latDeg * Math.PI) / 180;
    const lon = (lonDeg * Math.PI) / 180;
    const lon0 = (81.0 * Math.PI) / 180;
    const sinLat = Math.sin(lat), cosLat = Math.cos(lat), tanLat = Math.tan(lat);
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    const T = tanLat * tanLat;
    const C = ep2 * cosLat * cosLat;
    const A = cosLat * (lon - lon0);
    const M = a * (
      (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * lat -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * lat) +
      ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * lat) -
      ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * lat)
    );
    const east = 500000 + k0 * N * (
      A + ((1 - T + C) * A * A * A) / 6 +
      ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A * A * A * A * A) / 120
    );
    const north = k0 * (
      M + N * tanLat * (
        (A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A * A * A * A) / 24 +
        ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A * A * A * A * A * A) / 720
      )
    );
    return [east, north];
  }

  function updateHoverCoordinateUI(threeX, elevY, threeZ) {
    state.lastHoverWorldXZ = [threeX, elevY, threeZ];
    const isLocalData = !!(state.customDtm && state.customDtm.isLocal);
    const mx = state.originEpsg3857[0] + threeX;
    const my = state.originEpsg3857[1] - threeZ;
    const [lat, lon] = epsg3857ToWgs84(mx, my);

    let coordText = "";
    if (state.crsMode === "LOCAL" || isLocalData) {
      coordText = `X ${threeX.toFixed(1)}, Y ${(-threeZ).toFixed(1)} m`;
    } else if (state.crsMode === "EPSG:4326") {
      coordText = `${lon.toFixed(6)}°, ${lat.toFixed(6)}°`;
    } else if (state.crsMode === "EPSG:32644") {
      const [ue, un] = wgs84ToUtm44N(lat, lon);
      coordText = `${ue.toFixed(1)} E, ${un.toFixed(1)} N`;
    } else {
      coordText = `${mx.toFixed(1)} E, ${my.toFixed(1)} N`;
    }

    const xyEl = document.getElementById("coord-xy");
    const llEl = document.getElementById("coord-latlon");
    const zEl = document.getElementById("coord-elev");
    if (xyEl) xyEl.textContent = coordText;
    if (llEl) llEl.textContent = isLocalData ? "Local Grid" : `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;
    if (zEl) zEl.textContent = `${elevY.toFixed(1)} m`;
  }

  function detectCrsAndToWorld(x, y) {
    // Returns { wx, wy, isLocal, crs } where wx/wy are EPSG:3857 if geo, or local meters
    if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
      const [mx, my] = wgs84ToEpsg3857(y, x); // x=lon, y=lat
      return { wx: mx, wy: my, isLocal: false, crs: "WGS84" };
    }
    if (Math.abs(x) < 25000 && Math.abs(y) < 25000) {
      return { wx: x, wy: y, isLocal: true, crs: "LOCAL" };
    }
    return { wx: x, wy: y, isLocal: false, crs: "PROJECTED" };
  }

  function worldToThreeXZ(wx, wy, isLocal) {
    if (isLocal) return [wx, -wy];
    return [wx - state.originEpsg3857[0], -(wy - state.originEpsg3857[1])];
  }

  function realignOriginIfNeeded(centerWx, centerWy, isLocal) {
    if (isLocal) return;
    const dist = Math.hypot(centerWx - state.originEpsg3857[0], centerWy - state.originEpsg3857[1]);
    if (dist > 4500) {
      state.originEpsg3857 = [centerWx, centerWy];
    }
    const [lat, lon] = epsg3857ToWgs84(state.originEpsg3857[0], state.originEpsg3857[1]);
    const osmInput = document.getElementById("osm-latlon");
    if (osmInput) osmInput.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }

  function sampleRasterGrid(raster, wx, wy, isLocal) {
    if (!raster) return null;
    const qx = isLocal && !raster.isLocal ? wx + state.originEpsg3857[0] : wx;
    const qy = isLocal && !raster.isLocal ? wy + state.originEpsg3857[1] : wy;
    const u = ((qx - raster.worldMinX) / (raster.worldMaxX - raster.worldMinX)) * (raster.nx - 1);
    const v = ((qy - raster.worldMinY) / (raster.worldMaxY - raster.worldMinY)) * (raster.ny - 1);
    if (u < -0.5 || u > raster.nx - 0.5 || v < -0.5 || v > raster.ny - 0.5) return null;
    const ix = Math.max(0, Math.min(raster.nx - 2, Math.floor(u)));
    const iy = Math.max(0, Math.min(raster.ny - 2, Math.floor(v)));
    const fx = Math.max(0, Math.min(1, u - ix));
    const fy = Math.max(0, Math.min(1, v - iy));
    const d = raster.data;
    const z00 = d[iy * raster.nx + ix];
    const z10 = d[iy * raster.nx + ix + 1];
    const z01 = d[(iy + 1) * raster.nx + ix];
    const z11 = d[(iy + 1) * raster.nx + ix + 1];
    if (!Number.isFinite(z00) || !Number.isFinite(z10) || !Number.isFinite(z01) || !Number.isFinite(z11)) {
      return Number.isFinite(z00) ? z00 : null;
    }
    return z00 * (1 - fx) * (1 - fy) + z10 * fx * (1 - fy) + z01 * (1 - fx) * fy + z11 * fx * fy;
  }

  function updateDataStatusUI() {
    const box = document.getElementById("data-status");
    if (!box) return;
    box.innerHTML =
      `<div><strong>DTM:</strong> ${state.dtmSourceLabel}</div>` +
      `<div><strong>Buildings:</strong> ${state.bldgSourceLabel}</div>` +
      `<div><strong>Flight:</strong> ${state.flightSourceLabel}</div>`;
  }

  function getActiveSublotData() {
    if (DATA.aois && DATA.aois[state.aoiKey]) return DATA.aois[state.aoiKey];
    if (DATA.sublots && DATA.sublots[state.aoiKey]) return DATA.sublots[state.aoiKey];
    return DATA;
  }

  function evalBaseLot01Z(x, z) {
    const east = x;
    const north = -z;
    const aoi = getActiveSublotData();
    const g = (state.surfaceMode === "dsm" && aoi.dsmGrid) ? aoi.dsmGrid : (aoi.dtmGrid || DATA.dtmGrid);
    const tx = ((east - g.minX) / (g.maxX - g.minX)) * (g.nx - 1);
    const ty = ((north - g.minY) / (g.maxY - g.minY)) * (g.ny - 1);
    const ix = Math.max(0, Math.min(g.nx - 2, Math.floor(tx)));
    const iy = Math.max(0, Math.min(g.ny - 2, Math.floor(ty)));
    const fx = Math.max(0, Math.min(1, tx - ix));
    const fy = Math.max(0, Math.min(1, ty - iy));
    return (
      g.elevations[iy][ix] * (1 - fx) * (1 - fy) +
      g.elevations[iy][ix + 1] * fx * (1 - fy) +
      g.elevations[iy + 1][ix] * (1 - fx) * fy +
      g.elevations[iy + 1][ix + 1] * fx * fy
    );
  }

  function evalSculptedHillOffset(x, z) {
    const gauss = (cx, cz, amp, sx, sz) => {
      const dx = (x - cx) / sx;
      const dz = (z - cz) / sz;
      return amp * Math.exp(-0.5 * (dx * dx + dz * dz));
    };

    let h = 0;
    h += gauss(-580, -490, 245, 360, 320);
    h += gauss(590, -410, 225, 330, 310);
    h += gauss(-520, 540, 210, 350, 320);
    h += gauss(540, 500, 240, 340, 330);
    h += gauss(20, -10, 52, 240, 200);
    h += gauss(-20, -680, 120, 320, 200);
    h += gauss(40, 690, 115, 320, 200);

    const valleyCenterZ = 140 * Math.sin(x * 0.0022);
    const dValley = (z - valleyCenterZ) / 145;
    h -= 52 * Math.exp(-0.5 * dValley * dValley);

    h += 22 * Math.sin(x * 0.0048 + 0.5) * Math.cos(z * 0.0042);
    h += 12 * Math.cos((x - z) * 0.0062);

    return Math.max(0, h + 38);
  }

  function rebuildDtmGridCache() {
    let minZ = Infinity, maxZ = -Infinity, sumZ = 0;
    const step = (2 * DTM_HALF) / (DTM_NX - 1);
    const rawElev = new Float32Array(DTM_NX * DTM_NZ);
    let rawSum = 0;

    const isRealTerrain = !!(state.customDtm || state.aoiKey === "poly1" || state.aoiKey === "poly2" || state.aoiKey === "01C");

    for (let j = 0; j < DTM_NZ; j++) {
      const z = -DTM_HALF + j * step;
      for (let i = 0; i < DTM_NX; i++) {
        const x = -DTM_HALF + i * step;
        const idx = j * DTM_NX + i;
        let elev;
        if (state.customDtm) {
          const wx = state.customDtm.isLocal ? x : state.originEpsg3857[0] + x;
          const wy = state.customDtm.isLocal ? -z : state.originEpsg3857[1] - z;
          const v = sampleRasterGrid(state.customDtm, wx, wy, state.customDtm.isLocal);
          elev = v !== null ? v : 45.0;
        } else if (isRealTerrain) {
          elev = evalBaseLot01Z(x, z);
        } else {
          elev = Math.max(12, evalBaseLot01Z(x, z) + state.dtmReliefAmp * evalSculptedHillOffset(x, z));
        }
        rawElev[idx] = elev;
        rawSum += elev;
        dtmGrid.inAoi[idx] = Math.abs(x) <= AOI_HALF_X && Math.abs(z) <= AOI_HALF_Z ? 1 : 0;
      }
    }

    const rawMean = rawSum / (DTM_NX * DTM_NZ);
    for (let idx = 0; idx < rawElev.length; idx++) {
      const elev = isRealTerrain
        ? rawMean + state.dtmReliefAmp * (rawElev[idx] - rawMean)
        : rawElev[idx];
      dtmGrid.elev[idx] = elev;
      if (elev < minZ) minZ = elev;
      if (elev > maxZ) maxZ = elev;
      sumZ += elev;
    }

    dtmGrid.minZ = minZ;
    dtmGrid.maxZ = maxZ;
    dtmGrid.meanZ = sumZ / (DTM_NX * DTM_NZ);

    // Finite-difference surface normals per vertex
    for (let j = 0; j < DTM_NZ; j++) {
      const jm = Math.max(0, j - 1);
      const jp = Math.min(DTM_NZ - 1, j + 1);
      for (let i = 0; i < DTM_NX; i++) {
        const im = Math.max(0, i - 1);
        const ip = Math.min(DTM_NX - 1, i + 1);
        const hL = dtmGrid.elev[j * DTM_NX + im];
        const hR = dtmGrid.elev[j * DTM_NX + ip];
        const hU = dtmGrid.elev[jm * DTM_NX + i];
        const hD = dtmGrid.elev[jp * DTM_NX + i];
        const dx = (ip - im) * step;
        const dz = (jp - jm) * step;
        const nx = -(hR - hL) / dx;
        const ny = 1.0;
        const nz = -(hD - hU) / dz;
        const inv = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        const idx = j * DTM_NX + i;
        dtmGrid.normX[idx] = nx * inv;
        dtmGrid.normY[idx] = ny * inv;
        dtmGrid.normZ[idx] = nz * inv;
      }
    }

    const reliefSpan = Math.round(maxZ - minZ);
    document.getElementById("val-dtm-amp").textContent = `${state.dtmReliefAmp.toFixed(1)}x (${reliefSpan}m)`;
  }

  function getDtmElevationAt(worldX, worldZ) {
    const u = ((worldX + DTM_HALF) / (2 * DTM_HALF)) * (DTM_NX - 1);
    const v = ((worldZ + DTM_HALF) / (2 * DTM_HALF)) * (DTM_NZ - 1);
    const ix = Math.max(0, Math.min(DTM_NX - 2, Math.floor(u)));
    const iz = Math.max(0, Math.min(DTM_NZ - 2, Math.floor(v)));
    const fx = Math.max(0, Math.min(1, u - ix));
    const fz = Math.max(0, Math.min(1, v - iz));
    const e00 = dtmGrid.elev[iz * DTM_NX + ix];
    const e10 = dtmGrid.elev[iz * DTM_NX + ix + 1];
    const e01 = dtmGrid.elev[(iz + 1) * DTM_NX + ix];
    const e11 = dtmGrid.elev[(iz + 1) * DTM_NX + ix + 1];
    return (
      e00 * (1 - fx) * (1 - fz) +
      e10 * fx * (1 - fz) +
      e01 * (1 - fx) * fz +
      e11 * fx * fz
    );
  }

  function intersectRayWithDtm(ox, oy, oz, dx, dy, dz) {
    if (dy >= -0.02) {
      const t = 4000;
      const fx = ox + dx * t, fz = oz + dz * t;
      return new THREE.Vector3(fx, getDtmElevationAt(fx, fz), fz);
    }
    let t = (dtmGrid.meanZ - oy) / dy;
    if (t < 10) t = 10;
    for (let iter = 0; iter < 6; iter++) {
      const rx = ox + dx * t;
      const rz = oz + dz * t;
      const gy = getDtmElevationAt(rx, rz);
      t = (gy - oy) / dy;
      if (t < 10) t = 10;
    }
    const fx = ox + dx * t;
    const fz = oz + dz * t;
    return new THREE.Vector3(fx, getDtmElevationAt(fx, fz), fz);
  }

  // =========================================================================
  // 2. Three.js Initialization & Hilly DTM Block Meshes
  // =========================================================================
  function initThree() {
    const container = document.getElementById("canvas-container");
    scene = new THREE.Scene();
    const bgHex = state.theme === "dark" ? "#141416" : "#eef0f3";
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.00009);

    camera = new THREE.PerspectiveCamera(46, container.clientWidth / container.clientHeight, 5, 22000);
    camera.position.set(1450, 1180, 1650);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 120;
    controls.maxDistance = 8500;
    controls.target.set(0, 120, 0);
    controls.update();

    raycaster = new THREE.Raycaster();

    // Crisp sun + sky fill lighting to accentuate 3D hill slopes
    scene.add(new THREE.AmbientLight(0xdbeafe, 0.55));
    const sun = new THREE.DirectionalLight(0xfffbeb, 0.92);
    sun.position.set(1600, 2200, 1100);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x93c5fd, 0.35);
    fill.position.set(-1400, 900, -1300);
    scene.add(fill);

    dtmGroup = new THREE.Group();
    buildingsGroup = new THREE.Group();
    flightGroup = new THREE.Group();
    rayGroup = new THREE.Group();
    scene.add(dtmGroup);
    scene.add(buildingsGroup);
    scene.add(flightGroup);
    scene.add(rayGroup);

    rebuildDtmGridCache();
    buildDtmMeshes();

    window.addEventListener("resize", onWindowResize);
    setupViewportClicks();
  }

  function getNaturalTerrainColor(elev) {
    // Neutral QGIS hillshade grey/slate so Red/Green light opacity fades unmistakably against DSM
    const t = Math.max(0, Math.min(1, (elev - dtmGrid.minZ) / Math.max(10, dtmGrid.maxZ - dtmGrid.minZ)));
    const cLow = new THREE.Color("#565e68");
    const cMid = new THREE.Color("#737b85");
    const cHigh = new THREE.Color("#939ba6");
    const cPeak = new THREE.Color("#b8c0ca");
    const c = new THREE.Color();
    if (t < 0.35) c.copy(cLow).lerp(cMid, t / 0.35);
    else if (t < 0.72) c.copy(cMid).lerp(cHigh, (t - 0.35) / 0.37);
    else c.copy(cHigh).lerp(cPeak, (t - 0.72) / 0.28);
    return c;
  }

  function renderProceduralBaseMap(ctx, W, H, mode) {
    if (!ctx) return;
    if (!hillCanvas) {
      hillCanvas = document.createElement("canvas");
      hillCanvas.width = 512;
      hillCanvas.height = 512;
    }
    const hW = hillCanvas.width || 512;
    const hH = hillCanvas.height || 512;
    const hCtx = hillCanvas.getContext ? hillCanvas.getContext("2d") : null;
    if (!hCtx) return;

    const isLightMap = mode === "osm" || mode === "topo";
    const imgData = hCtx.createImageData(hW, hH);
    const d = imgData.data;
    const invSpan = 1 / Math.max(10, dtmGrid.maxZ - dtmGrid.minZ);
    const sx = (DTM_NX - 1) / (hW - 1);
    const sy = (DTM_NZ - 1) / (hH - 1);
    const lx = 0.56, ly = 0.68, lz = 0.47;

    for (let py = 0; py < hH; py++) {
      const gy = py * sy;
      const j0 = Math.min(DTM_NZ - 2, Math.floor(gy));
      const fy = gy - j0;
      for (let px = 0; px < hW; px++) {
        const gx = px * sx;
        const i0 = Math.min(DTM_NX - 2, Math.floor(gx));
        const fx = gx - i0;
        const k00 = j0 * DTM_NX + i0;
        const elev =
          dtmGrid.elev[k00] * (1 - fx) * (1 - fy) +
          dtmGrid.elev[k00 + 1] * fx * (1 - fy) +
          dtmGrid.elev[k00 + DTM_NX] * (1 - fx) * fy +
          dtmGrid.elev[k00 + DTM_NX + 1] * fx * fy;
        const nx = dtmGrid.normX[k00], ny = dtmGrid.normY[k00], nz = dtmGrid.normZ[k00];
        const shade = Math.max(0.55, Math.min(1.22, 0.55 + 0.68 * Math.max(0, nx * lx + ny * ly + nz * lz)));
        const t = Math.max(0, Math.min(1, (elev - dtmGrid.minZ) * invSpan));
        const p = (py * hW + px) * 4;
        if (isLightMap) {
          d[p] = Math.min(255, (230 - 30 * t) * shade);
          d[p + 1] = Math.min(255, (234 - 22 * t) * shade);
          d[p + 2] = Math.min(255, (224 - 36 * t) * shade);
        } else {
          // Neutral hillshade under satellite tiles before remote tiles finish loading
          const base = 78 + 70 * t;
          d[p] = Math.min(255, base * shade);
          d[p + 1] = Math.min(255, (base + 4) * shade);
          d[p + 2] = Math.min(255, (base + 8) * shade);
        }
        d[p + 3] = 255;
      }
    }
    hCtx.putImageData(imgData, 0, 0);
    ctx.drawImage(hillCanvas, 0, 0, W, H);
  }

  function loadMapTileImage(url) {
    return new Promise((resolve) => {
      if (typeof Image === "undefined") { resolve(null); return; }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function syncDtmBaseMaterial() {
    if (!dtmMesh || !dtmMesh.material) return;
    const mat = dtmMesh.material;
    const active = state.showBaseMapLayer && state.baseMapMode !== "none";
    const wantMap = active && baseMapTexture ? baseMapTexture : null;
    const wantVertCol = !wantMap;
    if (mat.map !== wantMap || mat.vertexColors !== wantVertCol) {
      mat.map = wantMap;
      mat.vertexColors = wantVertCol;
      mat.color.setHex(0xffffff);
      mat.needsUpdate = true;
    }
  }

  function getEffectiveBaseMapZoom() {
    const zReq = Math.max(15, Math.min(18, Number(state.baseMapZoom) || 17));
    return state.baseMapMode === "topo" ? Math.min(zReq, 17) : zReq;
  }

  function getTargetBaseMapDim(z) {
    const maxTex = renderer && renderer.capabilities && renderer.capabilities.maxTextureSize
      ? Math.min(4096, renderer.capabilities.maxTextureSize)
      : 4096;
    if (z >= 17) return maxTex;
    if (z === 16) return Math.min(2048, maxTex);
    return 1024;
  }

  function ensureBaseMapTexture(targetDim) {
    const dim = targetDim || getTargetBaseMapDim(getEffectiveBaseMapZoom());
    const dimChanged = baseMapCanvas && (baseMapCanvas.width !== dim || baseMapCanvas.height !== dim);
    if (!baseMapCanvas) {
      baseMapCanvas = document.createElement("canvas");
      baseMapCanvas.width = dim;
      baseMapCanvas.height = dim;
    } else if (dimChanged) {
      baseMapCanvas.width = dim;
      baseMapCanvas.height = dim;
      if (baseMapTexture) {
        baseMapTexture.dispose();
        baseMapTexture = null;
      }
    }
    if (!baseMapTexture) {
      baseMapTexture = new THREE.CanvasTexture(baseMapCanvas);
      baseMapTexture.wrapS = THREE.ClampToEdgeWrapping;
      baseMapTexture.wrapT = THREE.ClampToEdgeWrapping;
      baseMapTexture.minFilter = THREE.LinearMipmapLinearFilter;
      baseMapTexture.magFilter = THREE.LinearFilter;
      baseMapTexture.generateMipmaps = true;
      const maxAniso = renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy
        ? renderer.capabilities.getMaxAnisotropy()
        : 16;
      baseMapTexture.anisotropy = Math.min(16, Math.max(1, maxAniso));
    }
    return baseMapTexture;
  }

  function buildTileUrl(mode, z, tileX, iy) {
    const shard = (tileX + iy) & 3;
    if (mode === "google_hybrid") return `https://mt${shard}.google.com/vt/lyrs=y&x=${tileX}&y=${iy}&z=${z}`;
    if (mode === "satellite") return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${iy}/${tileX}`;
    if (mode === "osm") return `https://tile.openstreetmap.org/${z}/${tileX}/${iy}.png`;
    if (mode === "topo") return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${iy}/${tileX}`;
    return `https://mt${shard}.google.com/vt/lyrs=s&x=${tileX}&y=${iy}&z=${z}`;
  }

  function collectTilesForZoom(z, W, H, ox, oy) {
    const M = 20037508.342789244;
    const N = 1 << z;
    const minMx = ox - DTM_HALF, maxMx = ox + DTM_HALF;
    const minMy = oy - DTM_HALF, maxMy = oy + DTM_HALF;

    const txMin = ((minMx + M) / (2 * M)) * N;
    const txMax = ((maxMx + M) / (2 * M)) * N;
    const tyMin = ((M - maxMy) / (2 * M)) * N;
    const tyMax = ((M - minMy) / (2 * M)) * N;
    const spanTx = txMax - txMin;
    const spanTy = tyMax - tyMin;
    const txMid = 0.5 * (txMin + txMax);
    const tyMid = 0.5 * (tyMin + tyMax);

    const tiles = [];
    const ix0 = Math.floor(txMin), ix1 = Math.floor(txMax);
    const iy0 = Math.floor(tyMin), iy1 = Math.floor(tyMax);

    for (let iy = iy0; iy <= iy1; iy++) {
      if (iy < 0 || iy >= N) continue;
      for (let ix = ix0; ix <= ix1; ix++) {
        const tileX = ((ix % N) + N) % N;
        const dist2 = (ix + 0.5 - txMid) ** 2 + (iy + 0.5 - tyMid) ** 2;
        tiles.push({
          tileX,
          iy,
          dx: ((ix - txMin) / spanTx) * W,
          dy: ((iy - tyMin) / spanTy) * H,
          dw: (1 / spanTx) * W + 0.9,
          dh: (1 / spanTy) * H + 0.9,
          dist2,
        });
      }
    }
    tiles.sort((a, b) => a.dist2 - b.dist2);
    return tiles;
  }

  function setQmsStatusText(txt) {
    const el = document.getElementById("qms-status");
    if (el) el.textContent = txt;
  }

  function updateBaseMapTexture(forceReload = false) {
    const targetZ = getEffectiveBaseMapZoom();
    const targetDim = getTargetBaseMapDim(targetZ);
    ensureBaseMapTexture(targetDim);
    syncDtmBaseMaterial();

    if (!state.showBaseMapLayer || state.baseMapMode === "none") {
      lastBaseMapKey = "none";
      setQmsStatusText("Off");
      return;
    }

    const imgUid = state.customBaseMapImg ? (state.customBaseMapImg._uid || "img") : "";
    const key = `${state.baseMapMode}|z${targetZ}|d${targetDim}|${state.originEpsg3857[0].toFixed(1)}|${state.originEpsg3857[1].toFixed(1)}|${state.dtmReliefAmp.toFixed(1)}|${imgUid}`;
    if (!forceReload && lastBaseMapKey === key) return;
    lastBaseMapKey = key;

    const W = baseMapCanvas.width || targetDim;
    const H = baseMapCanvas.height || targetDim;

    if (state.baseMapMode === "custom") {
      setQmsStatusText("Custom");
    } else {
      setQmsStatusText(`HD z${targetZ} • ${W}px`);
    }

    const ctx = baseMapCanvas.getContext ? baseMapCanvas.getContext("2d") : null;
    if (!ctx) return;

    const reqId = ++baseMapReqId;

    if (state.baseMapMode === "custom") {
      if (state.customBaseMapImg) {
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(state.customBaseMapImg, 0, 0, W, H);
      } else {
        renderProceduralBaseMap(ctx, W, H, "google_sat");
      }
      baseMapTexture.needsUpdate = true;
      return;
    }

    // Fast procedural relief underlay while streaming tiles
    renderProceduralBaseMap(ctx, W, H, state.baseMapMode);
    baseMapTexture.needsUpdate = true;

    const ox = state.originEpsg3857[0];
    const oy = state.originEpsg3857[1];
    const mode = state.baseMapMode;

    // Stage 1: Fast z=15 base preview (< 200ms) while Stage 2 high-res center-out tiles download
    let stage1Done = targetZ <= 15;
    const hiTiles = collectTilesForZoom(targetZ, W, H, ox, oy);
    setQmsStatusText(`z${targetZ} 0/${hiTiles.length}`);

    const loadedHiBuffer = [];
    const flushHiBuffer = () => {
      if (!loadedHiBuffer.length || reqId !== baseMapReqId) return;
      for (const item of loadedHiBuffer) {
        ctx.drawImage(item.img, item.t.dx, item.t.dy, item.t.dw, item.t.dh);
      }
      loadedHiBuffer.length = 0;
      baseMapTexture.needsUpdate = true;
    };

    if (!stage1Done) {
      const previewTiles = collectTilesForZoom(15, W, H, ox, oy);
      const previewPromises = previewTiles.map((t) =>
        loadMapTileImage(buildTileUrl(mode, 15, t.tileX, t.iy)).then((img) => {
          if (reqId === baseMapReqId && img && !stage1Done) {
            ctx.drawImage(img, t.dx, t.dy, t.dw, t.dh);
          }
        })
      );
      Promise.all(previewPromises).then(() => {
        if (reqId !== baseMapReqId) return;
        stage1Done = true;
        baseMapTexture.needsUpdate = true;
        flushHiBuffer();
      });
      setTimeout(() => {
        if (reqId === baseMapReqId && !stage1Done) {
          stage1Done = true;
          flushHiBuffer();
        }
      }, 350);
    }

    // Stage 2: Center-out bounded concurrency queue (12 parallel tile requests)
    let cursor = 0;
    let completed = 0;
    const total = hiTiles.length;
    const WORKERS = Math.min(12, total);

    const runWorker = async () => {
      while (cursor < total && reqId === baseMapReqId) {
        const t = hiTiles[cursor++];
        const img = await loadMapTileImage(buildTileUrl(mode, targetZ, t.tileX, t.iy));
        if (reqId !== baseMapReqId) return;
        completed++;
        if (img) {
          if (stage1Done) {
            ctx.drawImage(img, t.dx, t.dy, t.dw, t.dh);
            if (completed % 8 === 0 || completed === total) {
              baseMapTexture.needsUpdate = true;
            }
          } else {
            loadedHiBuffer.push({ t, img });
          }
        }
        setQmsStatusText(completed === total ? `HD z${targetZ} ✓` : `z${targetZ} ${completed}/${total}`);
      }
    };

    for (let w = 0; w < WORKERS; w++) {
      runWorker();
    }
  }

  function buildDtmLightOverlayMesh() {
    if (dtmLightOverlayMesh && dtmGroup) {
      dtmGroup.remove(dtmLightOverlayMesh);
      if (dtmLightOverlayMesh.geometry) dtmLightOverlayMesh.geometry.dispose();
      if (dtmLightOverlayMesh.material) dtmLightOverlayMesh.material.dispose();
      dtmLightOverlayMesh = null;
    }

    const step = (2 * DTM_HALF) / (DTM_NX - 1);
    const gridToOv = new Int32Array(DTM_NX * DTM_NZ);
    gridToOv.fill(-1);
    const positions = [];
    const colors = [];
    const gridList = [];
    const indices = [];

    const ensureVert = (k) => {
      if (gridToOv[k] >= 0) return gridToOv[k];
      const i = k % DTM_NX;
      const j = (k - i) / DTM_NX;
      const ovIdx = gridList.length;
      gridToOv[k] = ovIdx;
      gridList.push(k);
      positions.push(-DTM_HALF + i * step, dtmGrid.elev[k] + 0.35, -DTM_HALF + j * step);
      colors.push(0.10, 0.78, 0.48);
      return ovIdx;
    };

    for (let j = 0; j < DTM_NZ - 1; j++) {
      for (let i = 0; i < DTM_NX - 1; i++) {
        const k00 = j * DTM_NX + i;
        const k10 = k00 + 1;
        const k01 = (j + 1) * DTM_NX + i;
        const k11 = k01 + 1;
        if (!dtmGrid.inAoi[k00] || !dtmGrid.inAoi[k10] || !dtmGrid.inAoi[k01] || !dtmGrid.inAoi[k11]) {
          continue;
        }
        // Standard PlaneGeometry winding (0, 2, 1) and (2, 3, 1) for outward +Y normal
        if (!(dtmGrid.insideBldg[k00] && dtmGrid.insideBldg[k01] && dtmGrid.insideBldg[k10])) {
          indices.push(ensureVert(k00), ensureVert(k01), ensureVert(k10));
        }
        if (!(dtmGrid.insideBldg[k01] && dtmGrid.insideBldg[k11] && dtmGrid.insideBldg[k10])) {
          indices.push(ensureVert(k01), ensureVert(k11), ensureVert(k10));
        }
      }
    }

    ovVertexGridIdx = new Int32Array(gridList);
    const ovGeom = new THREE.BufferGeometry();
    ovGeom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    ovGeom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    ovGeom.setIndex(indices);

    const op = state.showVisColoring ? Math.max(0, Math.min(1, state.lightOpacity)) : 0.0;
    dtmLightOverlayMesh = new THREE.Mesh(
      ovGeom,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: op,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    dtmLightOverlayMesh.renderOrder = 2;
    dtmLightOverlayMesh.visible = op > 0.005;
    if (dtmGroup) dtmGroup.add(dtmLightOverlayMesh);
  }

  function buildDtmMeshes() {
    while (dtmGroup.children.length > 0) {
      const ch = dtmGroup.children.pop();
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material) ch.material.dispose();
    }
    dtmLightOverlayMesh = null;

    const size = DTM_HALF * 2;
    const geom = new THREE.PlaneGeometry(size, size, DTM_NX - 1, DTM_NZ - 1);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let j = 0; j < DTM_NZ; j++) {
      for (let i = 0; i < DTM_NX; i++) {
        const idx = j * DTM_NX + i;
        const elev = dtmGrid.elev[idx];
        pos.setY(idx, elev);
        const c = getNaturalTerrainColor(elev);
        colors[idx * 3] = c.r;
        colors[idx * 3 + 1] = c.g;
        colors[idx * 3 + 2] = c.b;
      }
    }

    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();

    ensureBaseMapTexture();
    const useBaseMap = state.showBaseMapLayer && state.baseMapMode !== "none";
    dtmMesh = new THREE.Mesh(
      geom,
      new THREE.MeshLambertMaterial({
        vertexColors: !useBaseMap,
        map: useBaseMap ? baseMapTexture : null,
        color: 0xffffff,
      })
    );
    dtmGroup.add(dtmMesh);

    buildDtmLightOverlayMesh();
    updateBaseMapTexture(false);

    // Solid geological block side skirts down below lowest elevation
    const skirtVerts = [];
    const baseY = dtmGrid.minZ - 65;
    const step = size / (DTM_NX - 1);

    const pushSkirtStrip = (pts) => {
      for (let k = 0; k < pts.length - 1; k++) {
        const [x0, y0, z0] = pts[k];
        const [x1, y1, z1] = pts[k + 1];
        skirtVerts.push(x0, baseY, z0, x1, baseY, z1, x1, y1, z1);
        skirtVerts.push(x0, baseY, z0, x1, y1, z1, x0, y0, z0);
      }
    };

    const northEdge = [], southEdge = [], westEdge = [], eastEdge = [];
    for (let i = 0; i < DTM_NX; i++) {
      const x = -DTM_HALF + i * step;
      northEdge.push([x, dtmGrid.elev[i], -DTM_HALF]);
      southEdge.push([x, dtmGrid.elev[(DTM_NZ - 1) * DTM_NX + i], DTM_HALF]);
    }
    for (let j = 0; j < DTM_NZ; j++) {
      const z = -DTM_HALF + j * step;
      westEdge.push([-DTM_HALF, dtmGrid.elev[j * DTM_NX], z]);
      eastEdge.push([DTM_HALF, dtmGrid.elev[j * DTM_NX + (DTM_NX - 1)], z]);
    }
    pushSkirtStrip(southEdge);
    pushSkirtStrip(northEdge.reverse());
    pushSkirtStrip(eastEdge.reverse());
    pushSkirtStrip(westEdge);

    // Bottom cap
    skirtVerts.push(
      -DTM_HALF, baseY, -DTM_HALF,
      DTM_HALF, baseY, -DTM_HALF,
      DTM_HALF, baseY, DTM_HALF,
      -DTM_HALF, baseY, -DTM_HALF,
      DTM_HALF, baseY, DTM_HALF,
      -DTM_HALF, baseY, DTM_HALF
    );

    const skirtGeom = new THREE.BufferGeometry();
    skirtGeom.setAttribute("position", new THREE.Float32BufferAttribute(skirtVerts, 3));
    skirtGeom.computeVertexNormals();
    dtmSkirtMesh = new THREE.Mesh(
      skirtGeom,
      new THREE.MeshLambertMaterial({ color: 0x1e293b, side: THREE.DoubleSide })
    );
    dtmGroup.add(dtmSkirtMesh);

    // Topographic Contour Lines via Marching Squares (25m interval)
    const cVerts = [];
    if (dtmGrid.maxZ - dtmGrid.minZ > 15) {
      const interval = 25;
      const startL = Math.ceil(dtmGrid.minZ / interval) * interval;
      for (let level = startL; level < dtmGrid.maxZ; level += interval) {
        for (let j = 0; j < DTM_NZ - 1; j++) {
          const z0 = -DTM_HALF + j * step;
          const z1 = z0 + step;
          for (let i = 0; i < DTM_NX - 1; i++) {
            const x0 = -DTM_HALF + i * step;
            const x1 = x0 + step;
            const e00 = dtmGrid.elev[j * DTM_NX + i];
            const e10 = dtmGrid.elev[j * DTM_NX + i + 1];
            const e11 = dtmGrid.elev[(j + 1) * DTM_NX + i + 1];
            const e01 = dtmGrid.elev[(j + 1) * DTM_NX + i];

            const crossings = [];
            const checkEdge = (xa, za, ea, xb, zb, eb) => {
              if ((ea < level && eb >= level) || (eb < level && ea >= level)) {
                const t = (level - ea) / (eb - ea);
                crossings.push([xa + (xb - xa) * t, level + 0.6, za + (zb - za) * t]);
              }
            };
            checkEdge(x0, z0, e00, x1, z0, e10);
            checkEdge(x1, z0, e10, x1, z1, e11);
            checkEdge(x1, z1, e11, x0, z1, e01);
            checkEdge(x0, z1, e01, x0, z0, e00);

            if (crossings.length >= 2) {
              cVerts.push(
                crossings[0][0], crossings[0][1], crossings[0][2],
                crossings[1][0], crossings[1][1], crossings[1][2]
              );
            }
          }
        }
      }
    }
    const cGeom = new THREE.BufferGeometry();
    cGeom.setAttribute("position", new THREE.Float32BufferAttribute(cVerts, 3));
    dtmContourLines = new THREE.LineSegments(
      cGeom,
      new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.32 })
    );
    dtmContourLines.visible = state.showContoursLayer;
    dtmGroup.add(dtmContourLines);

    // Glowing Cyan Evaluation AOI Border draped on hills
    const bPts = [];
    const steps = 40;
    for (let k = 0; k <= steps; k++) {
      const x = -AOI_HALF_X + (2 * AOI_HALF_X * k) / steps;
      bPts.push(new THREE.Vector3(x, getDtmElevationAt(x, -AOI_HALF_Z) + 1.8, -AOI_HALF_Z));
    }
    for (let k = 1; k <= steps; k++) {
      const z = -AOI_HALF_Z + (2 * AOI_HALF_Z * k) / steps;
      bPts.push(new THREE.Vector3(AOI_HALF_X, getDtmElevationAt(AOI_HALF_X, z) + 1.8, z));
    }
    for (let k = 1; k <= steps; k++) {
      const x = AOI_HALF_X - (2 * AOI_HALF_X * k) / steps;
      bPts.push(new THREE.Vector3(x, getDtmElevationAt(x, AOI_HALF_Z) + 1.8, AOI_HALF_Z));
    }
    for (let k = 1; k < steps; k++) {
      const z = AOI_HALF_Z - (2 * AOI_HALF_Z * k) / steps;
      bPts.push(new THREE.Vector3(-AOI_HALF_X, getDtmElevationAt(-AOI_HALF_X, z) + 1.8, z));
    }
    aoiBorderLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(bPts),
      new THREE.LineBasicMaterial({ color: 0x38bdf8 })
    );
    dtmGroup.add(aoiBorderLine);
  }

  // =========================================================================
  // 3. 3D Buildings (Rectangular & Arbitrary OSM/GeoJSON Polygons + DSM nDSM)
  // =========================================================================
  function pointInPoly2D(x, z, poly) {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i][0], zi = poly[i][1];
      const xj = poly[j][0], zj = poly[j][1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-12) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function polySignedAreaXZ(poly) {
    // In XZ plane where +Y is up, CCW seen from +Y has positive sum of (x0*z1 - x1*z0) negated:
    // Let's use standard 2D (x, y=-z) signed area: > 0 means CCW seen from +Y
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      s += a[0] * (-b[1]) - b[0] * (-a[1]);
    }
    return s * 0.5;
  }

  function cleanRingXZ(rawPts) {
    const pts = [];
    for (let i = 0; i < rawPts.length; i++) {
      const p = rawPts[i];
      if (!pts.length || Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]) > 0.25) {
        pts.push([p[0], p[1]]);
      }
    }
    if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.25) {
      pts.pop();
    }
    if (pts.length >= 3 && polySignedAreaXZ(pts) < 0) {
      pts.reverse();
    }
    return pts;
  }

  function triangulatePolygonXZ(pts) {
    const n = pts.length;
    if (n < 3) return [];
    if (n === 3) return [[pts[0], pts[1], pts[2]]];
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    const tris = [];
    const cross = (a, b, c) => (b[0] - a[0]) * (-c[1] + a[1]) - (-b[1] + a[1]) * (c[0] - a[0]);
    const inTri = (p, a, b, c) => {
      const c1 = cross(a, b, p), c2 = cross(b, c, p), c3 = cross(c, a, p);
      return c1 >= -1e-6 && c2 >= -1e-6 && c3 >= -1e-6;
    };

    let guard = 0;
    while (idx.length > 3 && guard++ < n * n) {
      let earFound = false;
      for (let k = 0; k < idx.length; k++) {
        const i0 = idx[(k - 1 + idx.length) % idx.length];
        const i1 = idx[k];
        const i2 = idx[(k + 1) % idx.length];
        const a = pts[i0], b = pts[i1], c = pts[i2];
        if (cross(a, b, c) <= 1e-6) continue;
        let hasInside = false;
        for (let m = 0; m < idx.length; m++) {
          const im = idx[m];
          if (im === i0 || im === i1 || im === i2) continue;
          if (inTri(pts[im], a, b, c)) {
            hasInside = true;
            break;
          }
        }
        if (!hasInside) {
          tris.push([a, b, c]);
          idx.splice(k, 1);
          earFound = true;
          break;
        }
      }
      if (!earFound) break;
    }
    if (idx.length === 3) tris.push([pts[idx[0]], pts[idx[1]], pts[idx[2]]]);
    return tris;
  }

  function getActiveBuildingSpecs() {
    if (state.customBuildings && state.customBuildings.length > 0) {
      return state.customBuildings.map((cb) => {
        const polyXZ = cleanRingXZ(
          cb.worldRing.map(([wx, wy]) => worldToThreeXZ(wx, wy, cb.isLocal))
        );
        let h = cb.heightM;
        if (state.customDsm && polyXZ.length >= 3) {
          // Sample nDSM = DSM - DTM inside footprint to extract real building height
          let maxNdsm = 0;
          let cx = 0, cz = 0;
          for (const [px, pz] of polyXZ) { cx += px; cz += pz; }
          cx /= polyXZ.length; cz /= polyXZ.length;
          const samplePts = [[cx, cz], ...polyXZ];
          for (const [sx, sz] of samplePts) {
            const wx = state.customDsm.isLocal ? sx : state.originEpsg3857[0] + sx;
            const wy = state.customDsm.isLocal ? -sz : state.originEpsg3857[1] - sz;
            const dsmVal = sampleRasterGrid(state.customDsm, wx, wy, state.customDsm.isLocal);
            if (dsmVal !== null) {
              const dtmVal = getDtmElevationAt(sx, sz);
              const diff = dsmVal - dtmVal;
              if (diff > maxNdsm) maxNdsm = diff;
            }
          }
          if (maxNdsm >= 2.0) h = maxNdsm;
        }
        return {
          id: cb.id,
          label: cb.label,
          isRect: false,
          polyXZ,
          h,
        };
      }).filter((b) => {
        if (b.polyXZ.length < 3) return false;
        // Keep buildings inside DTM block domain
        const p0 = b.polyXZ[0];
        return Math.abs(p0[0]) <= DTM_HALF - 30 && Math.abs(p0[1]) <= DTM_HALF - 30;
      });
    }

    // If DSM uploaded WITHOUT custom vector buildings, synthesize nDSM elevated blocks
    if (state.customDsm && !state.customBuildings) {
      const blocks = [];
      const blockStep = 36;
      let count = 0;
      for (let z = -AOI_HALF_Z + 30; z <= AOI_HALF_Z - 30; z += blockStep) {
        for (let x = -AOI_HALF_X + 30; x <= AOI_HALF_X - 30; x += blockStep) {
          const wx = state.customDsm.isLocal ? x : state.originEpsg3857[0] + x;
          const wy = state.customDsm.isLocal ? -z : state.originEpsg3857[1] - z;
          const dsmVal = sampleRasterGrid(state.customDsm, wx, wy, state.customDsm.isLocal);
          if (dsmVal !== null) {
            const dtmVal = getDtmElevationAt(x, z);
            const diff = dsmVal - dtmVal;
            if (diff >= 3.0) {
              count++;
              const hw = blockStep * 0.44;
              blocks.push({
                id: `DSM-${count}`,
                label: "nDSM Elevated Structure",
                isRect: true,
                polyXZ: [
                  [x - hw, z + hw], [x + hw, z + hw], [x + hw, z - hw], [x - hw, z - hw],
                ],
                h: diff,
              });
            }
          }
        }
      }
      if (blocks.length > 0) return blocks;
    }

    // Embedded real OSM buildings for selected GEM15 AOI (poly1 / poly2)
    const aoiObj = getActiveSublotData();
    if (!state.customBuildings && aoiObj && aoiObj.buildings && aoiObj.buildings.length > 0) {
      return aoiObj.buildings.map((b) => {
        const polyXZ = cleanRingXZ(b.localRing.map(([e, n]) => [e, -n]));
        let h = b.h || 12.0;
        if (state.customDsm && polyXZ.length >= 3) {
          let cx = 0, cz = 0;
          for (const [px, pz] of polyXZ) { cx += px; cz += pz; }
          cx /= polyXZ.length; cz /= polyXZ.length;
          const wx = state.customDsm.isLocal ? cx : state.originEpsg3857[0] + cx;
          const wy = state.customDsm.isLocal ? -cz : state.originEpsg3857[1] - cz;
          const dsmVal = sampleRasterGrid(state.customDsm, wx, wy, state.customDsm.isLocal);
          if (dsmVal !== null) {
            const diff = dsmVal - getDtmElevationAt(cx, cz);
            if (diff >= 2.0) h = diff;
          }
        }
        return { id: b.id, label: b.label, isRect: false, polyXZ, h };
      }).filter((b) => b.polyXZ.length >= 3);
    }

    // Built-in hilly skyline buildings (with optional DSM override if customDsm loaded)
    return HILL_BUILDINGS.map((b) => {
      const hw = b.w * 0.5, hd = b.d * 0.5;
      const cx = b.cx, cz = -b.cy;
      let h = b.h;
      if (state.customDsm) {
        const wx = state.customDsm.isLocal ? cx : state.originEpsg3857[0] + cx;
        const wy = state.customDsm.isLocal ? -cz : state.originEpsg3857[1] - cz;
        const dsmVal = sampleRasterGrid(state.customDsm, wx, wy, state.customDsm.isLocal);
        if (dsmVal !== null) {
          const diff = dsmVal - getDtmElevationAt(cx, cz);
          if (diff >= 2.0) h = diff;
        }
      }
      return {
        id: b.id,
        label: b.label,
        isRect: true,
        polyXZ: [
          [cx - hw, cz + hd], [cx + hw, cz + hd], [cx + hw, cz - hd], [cx - hw, cz - hd],
        ],
        h,
      };
    });
  }

  function buildBuildings() {
    while (buildingsGroup.children.length > 0) {
      const ch = buildingsGroup.children.pop();
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material) ch.material.dispose();
    }

    const PATCH_STEP = 10.0;
    buildingBoxes = [];

    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    const patchMeta = [];
    const faceMeta = [];
    const edgeVerts = [];

    let maxH = 0;
    const specs = getActiveBuildingSpecs();

    specs.forEach((b, bIdx) => {
      const polyXZ = b.polyXZ;
      if (!polyXZ || polyXZ.length < 3) return;

      const h = Math.max(2.0, b.h * state.bldgHeightScale);
      if (h > maxH) maxH = h;

      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      let cx = 0, cz = 0;
      const cornerZs = [];
      for (const [px, pz] of polyXZ) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (pz < minZ) minZ = pz;
        if (pz > maxZ) maxZ = pz;
        cx += px;
        cz += pz;
        cornerZs.push(getDtmElevationAt(px, pz));
      }
      cx /= polyXZ.length;
      cz /= polyXZ.length;
      cornerZs.push(getDtmElevationAt(cx, cz));

      const minTerrain = Math.min(...cornerZs);
      const maxTerrain = Math.max(...cornerZs);
      const baseY = minTerrain - 6.0;
      const roofY = maxTerrain + h;

      buildingBoxes.push({
        id: b.id,
        label: b.label,
        isRect: !!b.isRect,
        polyXZ,
        minX, maxX,
        minY: baseY, maxY: roofY,
        minZ, maxZ,
        heightM: h,
      });

      // Architectural edges around polygon roof & vertical corners
      for (let i = 0; i < polyXZ.length; i++) {
        const p0 = polyXZ[i];
        const p1 = polyXZ[(i + 1) % polyXZ.length];
        edgeVerts.push(p0[0], roofY + 0.12, p0[1], p1[0], roofY + 0.12, p1[1]);
        edgeVerts.push(p0[0], cornerZs[i], p0[1], p0[0], roofY + 0.12, p0[1]);
      }

      function addPatchTri(a3, b3, c3, normal, isRoof) {
        const vertStart = positions.length / 3;
        positions.push(...a3, ...b3, ...c3);
        for (let k = 0; k < 3; k++) {
          normals.push(normal[0], normal[1], normal[2]);
          colors.push(0.65, 0.72, 0.8);
        }
        const pIndex = patchMeta.length;
        indices.push(vertStart, vertStart + 1, vertStart + 2);
        faceMeta.push(pIndex);

        const abx = b3[0] - a3[0], aby = b3[1] - a3[1], abz = b3[2] - a3[2];
        const acx = c3[0] - a3[0], acy = c3[1] - a3[1], acz = c3[2] - a3[2];
        const cxp = aby * acz - abz * acy;
        const cyp = abz * acx - abx * acz;
        const czp = abx * acy - aby * acx;
        const area = 0.5 * Math.sqrt(cxp * cxp + cyp * cyp + czp * czp);

        const midX = (a3[0] + b3[0] + c3[0]) / 3;
        const midY = (a3[1] + b3[1] + c3[1]) / 3;
        const midZ = (a3[2] + b3[2] + c3[2]) / 3;
        const localGround = getDtmElevationAt(midX, midZ);
        const aboveGround = isRoof || midY >= localGround - 0.5;

        patchMeta.push({
          px: midX, py: midY, pz: midZ,
          nx: normal[0], ny: normal[1], nz: normal[2],
          isRoof: isRoof ? 1 : 0,
          bIdx,
          area: aboveGround ? area : 0,
          vertStart,
          vertCount: 3,
        });
      }

      function subdivideRoofTri(a3, b3, c3, depth) {
        const lab = Math.hypot(b3[0] - a3[0], b3[2] - a3[2]);
        const lbc = Math.hypot(c3[0] - b3[0], c3[2] - b3[2]);
        const lca = Math.hypot(a3[0] - c3[0], a3[2] - c3[2]);
        if (depth >= 3 || Math.max(lab, lbc, lca) <= PATCH_STEP * 1.6) {
          addPatchTri(a3, b3, c3, [0, 1, 0], true);
          return;
        }
        const m01 = [0.5 * (a3[0] + b3[0]), roofY, 0.5 * (a3[2] + b3[2])];
        const m12 = [0.5 * (b3[0] + c3[0]), roofY, 0.5 * (b3[2] + c3[2])];
        const m20 = [0.5 * (c3[0] + a3[0]), roofY, 0.5 * (c3[2] + a3[2])];
        subdivideRoofTri(a3, m01, m20, depth + 1);
        subdivideRoofTri(m01, b3, m12, depth + 1);
        subdivideRoofTri(m20, m12, c3, depth + 1);
        subdivideRoofTri(m01, m12, m20, depth + 1);
      }

      function addSubdividedQuad(p00, uVec, vVec, uLen, vLen, normal, isRoof) {
        const nu = Math.max(1, Math.round(uLen / PATCH_STEP));
        const nv = Math.max(1, Math.round(vLen / PATCH_STEP));
        const du = uLen / nu;
        const dv = vLen / nv;
        const area = du * dv;

        for (let iv = 0; iv < nv; iv++) {
          for (let iu = 0; iu < nu; iu++) {
            const u0 = iu * du, u1 = (iu + 1) * du;
            const v0 = iv * dv, v1 = (iv + 1) * dv;
            const vA = [p00[0] + uVec[0] * u0 + vVec[0] * v0, p00[1] + uVec[1] * u0 + vVec[1] * v0, p00[2] + uVec[2] * u0 + vVec[2] * v0];
            const vB = [p00[0] + uVec[0] * u1 + vVec[0] * v0, p00[1] + uVec[1] * u1 + vVec[1] * v0, p00[2] + uVec[2] * u1 + vVec[2] * v0];
            const vC = [p00[0] + uVec[0] * u1 + vVec[0] * v1, p00[1] + uVec[1] * u1 + vVec[1] * v1, p00[2] + uVec[2] * u1 + vVec[2] * v1];
            const vD = [p00[0] + uVec[0] * u0 + vVec[0] * v1, p00[1] + uVec[1] * u0 + vVec[1] * v1, p00[2] + uVec[2] * u0 + vVec[2] * v1];

            const vertStart = positions.length / 3;
            positions.push(...vA, ...vB, ...vC, ...vD);
            for (let k = 0; k < 4; k++) {
              normals.push(normal[0], normal[1], normal[2]);
              colors.push(0.65, 0.72, 0.8);
            }

            const pIndex = patchMeta.length;
            indices.push(vertStart, vertStart + 1, vertStart + 2);
            faceMeta.push(pIndex);
            indices.push(vertStart, vertStart + 2, vertStart + 3);
            faceMeta.push(pIndex);

            const midX = 0.25 * (vA[0] + vB[0] + vC[0] + vD[0]);
            const midY = 0.25 * (vA[1] + vB[1] + vC[1] + vD[1]);
            const midZ = 0.25 * (vA[2] + vB[2] + vC[2] + vD[2]);
            const localGround = getDtmElevationAt(midX, midZ);
            const aboveGround = isRoof || midY >= localGround - 0.5;

            patchMeta.push({
              px: midX, py: midY, pz: midZ,
              nx: normal[0], ny: normal[1], nz: normal[2],
              isRoof: isRoof ? 1 : 0,
              bIdx,
              area: aboveGround ? area : 0,
              vertStart,
              vertCount: 4,
            });
          }
        }
      }

      // Roof: subdivide triangulated polygon
      const roofTris = triangulatePolygonXZ(polyXZ);
      for (const [tA, tB, tC] of roofTris) {
        subdivideRoofTri([tA[0], roofY, tA[1]], [tB[0], roofY, tB[1]], [tC[0], roofY, tC[1]], 0);
      }

      // Walls: one subdivided quad per polygon edge with outward CCW normal
      const wallH = roofY - baseY;
      for (let i = 0; i < polyXZ.length; i++) {
        const p0 = polyXZ[i];
        const p1 = polyXZ[(i + 1) % polyXZ.length];
        const ex = p1[0] - p0[0];
        const ez = p1[1] - p0[1];
        const edgeLen = Math.hypot(ex, ez);
        if (edgeLen < 0.2) continue;
        const uVec = [ex / edgeLen, 0, ez / edgeLen];
        // Outward normal for CCW seen from +Y: u x (0, 1, 0) = (-ez, 0, ex)
        const nVec = [-ez / edgeLen, 0, ex / edgeLen];
        addSubdividedQuad([p0[0], baseY, p0[1]], uVec, [0, 1, 0], edgeLen, wallH, nVec, false);
      }
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    const colorAttr = new THREE.Float32BufferAttribute(colors, 3);
    geom.setAttribute("color", colorAttr);
    geom.setIndex(indices);

    buildingsMesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ vertexColors: true }));
    buildingsGroup.add(buildingsMesh);

    const edgeGeom = new THREE.BufferGeometry();
    edgeGeom.setAttribute("position", new THREE.Float32BufferAttribute(edgeVerts, 3));
    buildingsEdgeLines = new THREE.LineSegments(
      edgeGeom,
      new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.72 })
    );
    buildingsGroup.add(buildingsEdgeLines);

    const nP = patchMeta.length;
    buildingPatches.count = nP;
    buildingPatches.px = new Float32Array(nP);
    buildingPatches.py = new Float32Array(nP);
    buildingPatches.pz = new Float32Array(nP);
    buildingPatches.nx = new Float32Array(nP);
    buildingPatches.ny = new Float32Array(nP);
    buildingPatches.nz = new Float32Array(nP);
    buildingPatches.isRoof = new Uint8Array(nP);
    buildingPatches.bIdx = new Int16Array(nP);
    buildingPatches.area = new Float32Array(nP);
    buildingPatches.vertStart = new Int32Array(nP);
    buildingPatches.vertCount = new Uint8Array(nP);
    buildingPatches.visR = new Float32Array(nP);
    buildingPatches.visG = new Float32Array(nP);
    buildingPatches.visB = new Float32Array(nP);
    buildingPatches.colorAttr = colorAttr;
    buildingPatches.faceMeta = faceMeta;

    for (let i = 0; i < nP; i++) {
      const m = patchMeta[i];
      buildingPatches.px[i] = m.px;
      buildingPatches.py[i] = m.py;
      buildingPatches.pz[i] = m.pz;
      buildingPatches.nx[i] = m.nx;
      buildingPatches.ny[i] = m.ny;
      buildingPatches.nz[i] = m.nz;
      buildingPatches.isRoof[i] = m.isRoof;
      buildingPatches.bIdx[i] = m.bIdx;
      buildingPatches.area[i] = m.area;
      buildingPatches.vertStart[i] = m.vertStart;
      buildingPatches.vertCount[i] = m.vertCount;
    }

    // Build 24x24 spatial cell grid for O(1) ray-building pruning
    bldgGridCells = Array.from({ length: BLDG_GRID_N * BLDG_GRID_N }, () => []);
    globalMaxBldgY = -Infinity;
    const cellSpan = (2 * DTM_HALF) / BLDG_GRID_N;
    for (let b = 0; b < buildingBoxes.length; b++) {
      const box = buildingBoxes[b];
      if (box.maxY > globalMaxBldgY) globalMaxBldgY = box.maxY;
      const gx0 = Math.max(0, Math.min(BLDG_GRID_N - 1, Math.floor((box.minX + DTM_HALF) / cellSpan)));
      const gx1 = Math.max(0, Math.min(BLDG_GRID_N - 1, Math.floor((box.maxX + DTM_HALF) / cellSpan)));
      const gz0 = Math.max(0, Math.min(BLDG_GRID_N - 1, Math.floor((box.minZ + DTM_HALF) / cellSpan)));
      const gz1 = Math.max(0, Math.min(BLDG_GRID_N - 1, Math.floor((box.maxZ + DTM_HALF) / cellSpan)));
      for (let gz = gz0; gz <= gz1; gz++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          bldgGridCells[gz * BLDG_GRID_N + gx].push(b);
        }
      }
    }
    bldgTestStamp = new Int32Array(buildingBoxes.length);
    bldgStampId = 0;

    // Mark DTM vertices strictly inside building footprints (exact polygon test for non-rect)
    const step = (2 * DTM_HALF) / (DTM_NX - 1);
    for (let j = 0; j < DTM_NZ; j++) {
      const z = -DTM_HALF + j * step;
      for (let i = 0; i < DTM_NX; i++) {
        const x = -DTM_HALF + i * step;
        let inside = 0;
        for (let b = 0; b < buildingBoxes.length; b++) {
          const box = buildingBoxes[b];
          if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) {
            if (box.isRect || pointInPoly2D(x, z, box.polyXZ)) {
              inside = 1;
              break;
            }
          }
        }
        dtmGrid.insideBldg[j * DTM_NX + i] = inside;
      }
    }

    buildingsGroup.visible = state.showBldgsLayer;
    buildDtmLightOverlayMesh();
    document.getElementById("val-bldg-h").textContent = `${state.bldgHeightScale.toFixed(1)}x (${Math.round(maxH)}m)`;
  }

  // =========================================================================
  // 4. Flight Lines, Cameras & Terrain-Draped Footprints
  // =========================================================================
  function degToRad(d) {
    return (d * Math.PI) / 180;
  }

  function radToDeg(r) {
    return (r * 180) / Math.PI;
  }

  function getFovCrossDeg() {
    return radToDeg(2 * Math.atan((state.sensorCrossMm * 0.5) / state.focalMm));
  }

  function getFovAlongDeg() {
    return radToDeg(2 * Math.atan((state.sensorAlongMm * 0.5) / state.focalMm));
  }

  function refreshCameraModelTag() {
    const match = Object.entries(CAMERA_MODELS).find(([, m]) =>
      Math.abs(state.focalMm - m.focalMm) < 0.05 &&
      Math.abs(state.pixelUm - m.pixelUm) < 0.01 &&
      (
        (Math.abs(state.sensorCrossMm - m.sensorCrossMm) < 0.05 && Math.abs(state.sensorAlongMm - m.sensorAlongMm) < 0.05) ||
        (Math.abs(state.sensorCrossMm - m.sensorAlongMm) < 0.05 && Math.abs(state.sensorAlongMm - m.sensorCrossMm) < 0.05)
      )
    );
    if (match) {
      state.camModel = match[0];
      state.pupilMm = match[1].pupilMm;
    } else {
      state.camModel = "custom";
      state.pupilMm = null;
    }
  }

  function getSensorHalfTans() {
    return {
      halfTanU: (state.sensorAlongMm * 0.5) / state.focalMm,
      halfTanV: (state.sensorCrossMm * 0.5) / state.focalMm,
    };
  }

  function computeCameraBasis(headingDeg, omegaDeg, phiDeg, kappaDeg = 0) {
    const hdgRad = (headingDeg * Math.PI) / 180;
    const omegaRad = (omegaDeg * Math.PI) / 180;
    const phiRad = (phiDeg * Math.PI) / 180;
    const kappaRad = (kappaDeg * Math.PI) / 180;

    const up = new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3(Math.sin(hdgRad), 0, -Math.cos(hdgRad)).normalize();
    const v = new THREE.Vector3().crossVectors(u, up).normalize();
    const w = new THREE.Vector3(0, -1, 0);

    if (Math.abs(kappaRad) > 1e-6) {
      u.applyAxisAngle(up, -kappaRad);
      v.applyAxisAngle(up, -kappaRad);
    }
    if (Math.abs(phiRad) > 1e-6) {
      u.applyAxisAngle(v, phiRad);
      w.applyAxisAngle(v, phiRad);
    }
    if (Math.abs(omegaRad) > 1e-6) {
      v.applyAxisAngle(u, omegaRad);
      w.applyAxisAngle(u, omegaRad);
    }
    return { u: u.normalize(), v: v.normalize(), w: w.normalize() };
  }

  function buildCamerasFromState(preserveToggleState = false) {
    const prevMap = new Map();
    if (preserveToggleState) {
      for (const c of state.cameras) {
        prevMap.set(c.id, { active: c.active, showFootprint: c.showFootprint });
      }
    }

    const { halfTanU, halfTanV } = getSensorHalfTans();
    const basis = computeCameraBasis(state.headingDeg, state.omega, state.phi, 0);
    const rawCams = [];

    if (state.customFlight && state.customFlight.cameras.length > 0 && state.useExactShapefile) {
      state.customFlight.cameras.forEach((sc, idx) => {
        const prev = prevMap.get(sc.id);
        const [tx, tz] = worldToThreeXZ(sc.wx, sc.wy, sc.isLocal);
        const b = (sc.omega || sc.phi || sc.kappa)
          ? computeCameraBasis(state.headingDeg, state.omega + (sc.omega || 0), state.phi + (sc.phi || 0), sc.kappa || 0)
          : basis;
        const altMsl = Number.isFinite(sc.altMsl) ? sc.altMsl : dtmGrid.meanZ + state.heightAgl;
        rawCams.push({
          id: sc.id,
          strip: sc.strip || 1,
          color: CAM_COLORS[idx % CAM_COLORS.length],
          active: prev ? prev.active : true,
          showFootprint: prev ? prev.showFootprint : true,
          O: new THREE.Vector3(tx, altMsl, tz),
          u: b.u.clone(),
          v: b.v.clone(),
          w: b.w.clone(),
          halfTanU,
          halfTanV,
          altAgl: Math.round(altMsl - dtmGrid.meanZ),
        });
      });
    } else if (state.useExactShapefile) {
      const subCams = getActiveSublotData().cameras || DATA.cameras;
      subCams.forEach((sc, idx) => {
        const prev = prevMap.get(sc.id);
        rawCams.push({
          id: sc.id,
          strip: sc.strip,
          color: CAM_COLORS[idx % CAM_COLORS.length],
          active: prev ? prev.active : true,
          showFootprint: prev ? prev.showFootprint : true,
          O: new THREE.Vector3(sc.east, sc.altMsl, -sc.north),
          u: basis.u.clone(),
          v: basis.v.clone(),
          w: basis.w.clone(),
          halfTanU,
          halfTanV,
          altAgl: Math.round(sc.altMsl - dtmGrid.meanZ),
        });
      });
    } else {
      const camY = dtmGrid.meanZ + state.heightAgl;
      const airbase = Math.max(40, state.airbaseM);
      const lineSpacing = Math.max(60, state.lineSpacingM);
      const nHalfStrips = Math.min(4, Math.max(1, Math.ceil(1050 / lineSpacing)));
      const nHalfShots = Math.min(8, Math.max(2, Math.ceil(780 / airbase)));

      const hdgRad = (state.headingDeg * Math.PI) / 180;
      const dirAlong = new THREE.Vector3(Math.sin(hdgRad), 0, -Math.cos(hdgRad));
      const dirCross = new THREE.Vector3().crossVectors(dirAlong, new THREE.Vector3(0, 1, 0));

      let idxCounter = 0;
      for (let s = -nHalfStrips; s <= nHalfStrips; s++) {
        const stripNum = s + nHalfStrips + 1;
        const crossOffset = s * lineSpacing;
        for (let k = -nHalfShots; k <= nHalfShots; k++) {
          const alongOffset = k * airbase;
          const id = `L${stripNum}-${String(k + nHalfShots + 1).padStart(3, "0")}`;
          const prev = prevMap.get(id);
          rawCams.push({
            id,
            strip: stripNum,
            color: CAM_COLORS[idxCounter % CAM_COLORS.length],
            active: prev ? prev.active : true,
            showFootprint: prev ? prev.showFootprint : true,
            O: new THREE.Vector3(
              dirAlong.x * alongOffset + dirCross.x * crossOffset,
              camY,
              dirAlong.z * alongOffset + dirCross.z * crossOffset
            ),
            u: basis.u.clone(),
            v: basis.v.clone(),
            w: basis.w.clone(),
            halfTanU,
            halfTanV,
            altAgl: Math.round(state.heightAgl),
          });
          idxCounter++;
        }
      }
    }

    const cornerSigns = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const cam of rawCams) {
      const corners = [];
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [su, sv] of cornerSigns) {
        const dir = cam.w.clone().addScaledVector(cam.u, su * halfTanU).addScaledVector(cam.v, sv * halfTanV).normalize();
        const hit = intersectRayWithDtm(cam.O.x, cam.O.y, cam.O.z, dir.x, dir.y, dir.z);
        corners.push(hit);
        if (hit.x < minX) minX = hit.x;
        if (hit.x > maxX) maxX = hit.x;
        if (hit.z < minZ) minZ = hit.z;
        if (hit.z > maxZ) maxZ = hit.z;
      }

      const ring = [];
      for (let edge = 0; edge < 4; edge++) {
        const [su0, sv0] = cornerSigns[edge];
        const [su1, sv1] = cornerSigns[(edge + 1) % 4];
        for (let step = 0; step < 7; step++) {
          const t = step / 7;
          const su = su0 + (su1 - su0) * t;
          const sv = sv0 + (sv1 - sv0) * t;
          const dir = cam.w.clone().addScaledVector(cam.u, su * halfTanU).addScaledVector(cam.v, sv * halfTanV).normalize();
          ring.push(intersectRayWithDtm(cam.O.x, cam.O.y, cam.O.z, dir.x, dir.y, dir.z));
        }
      }

      cam.corners = corners;
      cam.footprintRing = ring;
      cam.fpMinX = minX - 20;
      cam.fpMaxX = maxX + 20;
      cam.fpMinZ = minZ - 20;
      cam.fpMaxZ = maxZ + 20;
      cam.candBldgs = [];
      for (let b = 0; b < buildingBoxes.length; b++) {
        const box = buildingBoxes[b];
        if (box.maxX >= cam.fpMinX && box.minX <= cam.fpMaxX && box.maxZ >= cam.fpMinZ && box.minZ <= cam.fpMaxZ) {
          cam.candBldgs.push(b);
        }
      }
    }

    state.cameras = rawCams;
    if (state.selectedCamIndex >= rawCams.length) {
      state.selectedCamIndex = Math.max(0, rawCams.length - 1);
    }
  }

  function renderFlightSceneObjects() {
    while (flightGroup.children.length > 0) {
      const ch = flightGroup.children.pop();
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material) ch.material.dispose();
    }
    cameraPickMeshes = [];

    const byStrip = new Map();
    state.cameras.forEach((cam, idx) => {
      if (!byStrip.has(cam.strip)) byStrip.set(cam.strip, []);
      byStrip.get(cam.strip).push({ cam, idx });
    });

    for (const [stripNum, list] of byStrip.entries()) {
      const pts = list.map((x) => x.cam.O);
      if (pts.length >= 2) {
        flightGroup.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({
              color: new THREE.Color(STRIP_PALETTE[(stripNum - 1) % STRIP_PALETTE.length]),
              transparent: true,
              opacity: 0.75,
            })
          )
        );
      }
    }

    const sphereGeom = new THREE.SphereGeometry(22, 12, 10);
    const anyActive = state.cameras.some((c) => c.active);
    const neonCol = new THREE.Color(NEON_HEX);
    const neonAccentCol = new THREE.Color(NEON_ACCENT_HEX);

    state.cameras.forEach((cam, idx) => {
      const isSelected = idx === state.selectedCamIndex;
      const baseColor = new THREE.Color(cam.color);
      const dispColor = isSelected ? neonCol : baseColor;

      const marker = new THREE.Mesh(
        sphereGeom,
        new THREE.MeshBasicMaterial({
          color: isSelected ? neonCol : cam.active ? baseColor : new THREE.Color("#71717a"),
        })
      );
      marker.position.copy(cam.O);
      if (isSelected) marker.scale.setScalar(1.65);
      marker.userData = { camIndex: idx };
      flightGroup.add(marker);
      cameraPickMeshes.push(marker);

      if (isSelected) {
        const ringGeom = new THREE.RingGeometry(34, 45, 28);
        ringGeom.rotateX(-Math.PI / 2);
        const ring = new THREE.Mesh(
          ringGeom,
          new THREE.MeshBasicMaterial({ color: neonAccentCol, side: THREE.DoubleSide })
        );
        ring.position.copy(cam.O);
        flightGroup.add(ring);
      }

      // Pose cone: visible for active cameras, or selected camera if active/selected
      const showCone = state.showFrustums && (cam.active || isSelected);
      if (showCone) {
        const scale = isSelected ? 1.0 : 0.25;
        const cPts = cam.corners.map((c) => cam.O.clone().lerp(c, scale));
        const fVerts = [];
        for (let k = 0; k < 4; k++) {
          fVerts.push(cam.O.x, cam.O.y, cam.O.z, cPts[k].x, cPts[k].y, cPts[k].z);
          const n = cPts[(k + 1) % 4];
          fVerts.push(cPts[k].x, cPts[k].y, cPts[k].z, n.x, n.y, n.z);
        }
        const fGeom = new THREE.BufferGeometry();
        fGeom.setAttribute("position", new THREE.Float32BufferAttribute(fVerts, 3));
        flightGroup.add(
          new THREE.LineSegments(
            fGeom,
            new THREE.LineBasicMaterial({
              color: dispColor,
              transparent: true,
              opacity: isSelected ? 1.0 : 0.24,
            })
          )
        );

        // Distinct translucent neon pyramid faces for selected camera when other cameras are also ON
        if (isSelected) {
          const facePos = [];
          for (let k = 0; k < 4; k++) {
            const pA = cPts[k];
            const pB = cPts[(k + 1) % 4];
            facePos.push(cam.O.x, cam.O.y, cam.O.z, pA.x, pA.y, pA.z, pB.x, pB.y, pB.z);
          }
          const faceGeom = new THREE.BufferGeometry();
          faceGeom.setAttribute("position", new THREE.Float32BufferAttribute(facePos, 3));
          flightGroup.add(
            new THREE.Mesh(
              faceGeom,
              new THREE.MeshBasicMaterial({
                color: neonCol,
                transparent: true,
                opacity: anyActive ? 0.13 : 0.10,
                side: THREE.DoubleSide,
                depthWrite: false,
              })
            )
          );
        }

        // Pose optical vector
        const axisEnd = cam.O.clone().addScaledVector(cam.w, isSelected ? 280 : 105);
        flightGroup.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([cam.O, axisEnd]),
            new THREE.LineBasicMaterial({
              color: isSelected ? neonAccentCol : baseColor,
              transparent: true,
              opacity: isSelected ? 1.0 : 0.52,
            })
          )
        );
      }

      if (state.showFootprints && (cam.showFootprint || isSelected)) {
        const lift = isSelected ? 3.2 : 2.0;
        const lifted = cam.footprintRing.map((p) => new THREE.Vector3(p.x, p.y + lift, p.z));
        flightGroup.add(
          new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(lifted),
            new THREE.LineBasicMaterial({
              color: dispColor,
              transparent: true,
              opacity: isSelected ? 1.0 : cam.active ? 0.62 : 0.25,
            })
          )
        );

        if (isSelected) {
          // Outer neon halo ring + translucent footprint highlight across terrain
          const lifted2 = cam.footprintRing.map((p) => new THREE.Vector3(p.x, p.y + 4.4, p.z));
          flightGroup.add(
            new THREE.LineLoop(
              new THREE.BufferGeometry().setFromPoints(lifted2),
              new THREE.LineBasicMaterial({ color: neonAccentCol, transparent: true, opacity: 0.95 })
            )
          );

          const c = cam.corners;
          const fillPos = new Float32Array([
            c[0].x, c[0].y + 1.5, c[0].z,
            c[1].x, c[1].y + 1.5, c[1].z,
            c[2].x, c[2].y + 1.5, c[2].z,
            c[0].x, c[0].y + 1.5, c[0].z,
            c[2].x, c[2].y + 1.5, c[2].z,
            c[3].x, c[3].y + 1.5, c[3].z,
          ]);
          const fillGeom = new THREE.BufferGeometry();
          fillGeom.setAttribute("position", new THREE.BufferAttribute(fillPos, 3));
          flightGroup.add(
            new THREE.Mesh(
              fillGeom,
              new THREE.MeshBasicMaterial({
                color: neonCol,
                transparent: true,
                opacity: 0.16,
                side: THREE.DoubleSide,
                depthWrite: false,
              })
            )
          );
        }
      }
    });
  }

  // =========================================================================
  // 5. Fast Exact 3D Line-of-Sight (Building + Hilly Terrain Self-Occlusion)
  // =========================================================================
  function isSegmentOccluded(ox, oy, oz, px, py, pz, selfBldgIdx, candList) {
    const dx = px - ox;
    const dy = py - oy;
    const dz = pz - oz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 1e-3) return -1;

    const tMaxAllow = 1.0 - 0.18 / dist;
    const invDx = Math.abs(dx) > 1e-9 ? 1.0 / dx : 1e9;
    const invDy = Math.abs(dy) > 1e-9 ? 1.0 / dy : 1e9;
    const invDz = Math.abs(dz) > 1e-9 ? 1.0 / dz : 1e9;

    // 1. Building occlusion via 2D spatial grid pruning (only tests buildings under ray ceiling)
    if (buildingBoxes.length > 0 && (py <= globalMaxBldgY + 2 || oy <= globalMaxBldgY + 2)) {
      const sCeil = oy > py ? Math.min(1.0, Math.max(0.02, (globalMaxBldgY + 2.0 - py) / (oy - py))) : 1.0;
      const ex = px + (ox - px) * sCeil;
      const ez = pz + (oz - pz) * sCeil;
      const cellSpan = (2 * DTM_HALF) / BLDG_GRID_N;
      const gx0 = Math.max(0, Math.min(BLDG_GRID_N - 1, Math.floor((Math.min(px, ex) + DTM_HALF) / cellSpan)));
      const gx1 = Math.max(0, Math.min(BLDG_GRID_N - 1, Math.floor((Math.max(px, ex) + DTM_HALF) / cellSpan)));
      const gz0 = Math.max(0, Math.min(BLDG_GRID_N - 1, Math.floor((Math.min(pz, ez) + DTM_HALF) / cellSpan)));
      const gz1 = Math.max(0, Math.min(BLDG_GRID_N - 1, Math.floor((Math.max(pz, ez) + DTM_HALF) / cellSpan)));

      if (++bldgStampId > 2000000000) {
        bldgTestStamp.fill(0);
        bldgStampId = 1;
      }

      for (let gz = gz0; gz <= gz1; gz++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const cell = bldgGridCells[gz * BLDG_GRID_N + gx];
          for (let k = 0; k < cell.length; k++) {
            const bIdx = cell[k];
            if (bIdx === selfBldgIdx || bldgTestStamp[bIdx] === bldgStampId) continue;
            bldgTestStamp[bIdx] = bldgStampId;
            const box = buildingBoxes[bIdx];

            let t1 = (box.minX - ox) * invDx;
            let t2 = (box.maxX - ox) * invDx;
            let tmin = t1 < t2 ? t1 : t2;
            let tmax = t1 < t2 ? t2 : t1;

            t1 = (box.minY - oy) * invDy;
            t2 = (box.maxY - oy) * invDy;
            const tymin = t1 < t2 ? t1 : t2;
            const tymax = t1 < t2 ? t2 : t1;
            if (tymin > tmin) tmin = tymin;
            if (tymax < tmax) tmax = tymax;
            if (tmin > tmax) continue;

            t1 = (box.minZ - oz) * invDz;
            t2 = (box.maxZ - oz) * invDz;
            const tzmin = t1 < t2 ? t1 : t2;
            const tzmax = t1 < t2 ? t2 : t1;
            if (tzmin > tmin) tmin = tzmin;
            if (tzmax < tmax) tmax = tzmax;

            if (tmin <= tmax && tmax > 0.001 && tmin < tMaxAllow) {
              if (box.isRect) return bIdx;

              if (Math.abs(dy) > 1e-9) {
                const tRoof = (box.maxY - oy) / dy;
                if (tRoof > 0.001 && tRoof < tMaxAllow && pointInPoly2D(ox + dx * tRoof, oz + dz * tRoof, box.polyXZ)) {
                  return bIdx;
                }
              }
              const poly = box.polyXZ;
              for (let i = 0; i < poly.length; i++) {
                const x1 = poly[i][0], z1 = poly[i][1];
                const x2 = poly[(i + 1) % poly.length][0], z2 = poly[(i + 1) % poly.length][1];
                const ex2 = x2 - x1, ez2 = z2 - z1;
                const denom = dx * ez2 - dz * ex2;
                if (Math.abs(denom) < 1e-9) continue;
                const rx = x1 - ox, rz = z1 - oz;
                const tRay = (rx * ez2 - rz * ex2) / denom;
                if (tRay <= 0.001 || tRay >= tMaxAllow) continue;
                const sEdge = (rx * dz - rz * dx) / denom;
                if (sEdge < 0 || sEdge > 1) continue;
                const yHit = oy + dy * tRay;
                if (yHit >= box.minY && yHit <= box.maxY) {
                  return bIdx;
                }
              }
            }
          }
        }
      }
    }

    // 2. Hilly terrain ridge self-occlusion (ray-march points when ray crosses terrain heights)
    if (state.dtmReliefAmp > 0.15) {
      const horizDist = Math.sqrt(dx * dx + dz * dz);
      if (horizDist > 80) {
        const steps = 12;
        for (let s = 1; s < steps; s++) {
          const t = 0.25 + (0.72 * s) / steps;
          const ry = oy + dy * t;
          if (ry > dtmGrid.maxZ + 1.0) continue;
          const rx = ox + dx * t;
          const rz = oz + dz * t;
          if (ry < getDtmElevationAt(rx, rz) - 0.6) {
            return -2; // occluded by hill ridge
          }
        }
      }
    }

    return -1;
  }

  function canCameraSeePoint(cam, px, py, pz, nx, ny, nz, selfBldgIdx) {
    if (px < cam.fpMinX || px > cam.fpMaxX || pz < cam.fpMinZ || pz > cam.fpMaxZ) {
      return { inFrustum: false, visible: false, blocker: -1 };
    }
    const toCamX = cam.O.x - px;
    const toCamY = cam.O.y - py;
    const toCamZ = cam.O.z - pz;
    if (toCamX * nx + toCamY * ny + toCamZ * nz <= 0.02) {
      return { inFrustum: false, visible: false, blocker: -1 };
    }
    const vx = -toCamX, vy = -toCamY, vz = -toCamZ;
    const depth = vx * cam.w.x + vy * cam.w.y + vz * cam.w.z;
    if (depth <= 1.0) return { inFrustum: false, visible: false, blocker: -1 };
    const projU = vx * cam.u.x + vy * cam.u.y + vz * cam.u.z;
    const projV = vx * cam.v.x + vy * cam.v.y + vz * cam.v.z;
    if (Math.abs(projU) > depth * cam.halfTanU || Math.abs(projV) > depth * cam.halfTanV) {
      return { inFrustum: false, visible: false, blocker: -1 };
    }
    const blocker = isSegmentOccluded(cam.O.x, cam.O.y, cam.O.z, px, py, pz, selfBldgIdx, cam.candBldgs);
    return { inFrustum: true, visible: blocker === -1, blocker };
  }

  function getVisColor(hits, sumR, sumG, sumB, baseR, baseG, baseB, ignoreToggle = false) {
    if (!ignoreToggle && !state.showVisColoring) return [baseR, baseG, baseB];
    if (state.colorMode === "pass_fail") {
      return hits >= 1 ? [0.10, 0.78, 0.48] : [0.92, 0.16, 0.20];
    }
    if (state.colorMode === "heatmap") {
      if (hits === 0) return [0.90, 0.15, 0.20];
      if (hits === 1) return [0.96, 0.62, 0.08];
      if (hits === 2) return [0.16, 0.78, 0.94];
      return [0.09, 0.80, 0.52];
    }
    // per_camera
    if (hits === 0) return [0.58, 0.10, 0.13];
    return [Math.min(1, sumR / hits), Math.min(1, sumG / hits), Math.min(1, sumB / hits)];
  }

  function applyLightOpacity() {
    const op = state.showVisColoring ? Math.max(0, Math.min(1, state.lightOpacity)) : 0.0;
    if (dtmLightOverlayMesh && dtmLightOverlayMesh.material) {
      dtmLightOverlayMesh.material.opacity = op;
      dtmLightOverlayMesh.material.needsUpdate = true;
      dtmLightOverlayMesh.visible = op > 0.005;
    }

    const bp = buildingPatches;
    if (bp && bp.count > 0 && bp.colorAttr && bp.visR) {
      const bColArr = bp.colorAttr.array;
      for (let i = 0; i < bp.count; i++) {
        const isRoof = bp.isRoof[i] === 1;
        const baseR = isRoof ? 0.72 : 0.54;
        const baseG = isRoof ? 0.76 : 0.60;
        const baseB = isRoof ? 0.82 : 0.68;
        const area = bp.area[i];
        const r = area === 0 ? 0.25 : baseR * (1 - op) + bp.visR[i] * op;
        const g = area === 0 ? 0.30 : baseG * (1 - op) + bp.visG[i] * op;
        const b = area === 0 ? 0.35 : baseB * (1 - op) + bp.visB[i] * op;

        const vs = bp.vertStart[i] * 3;
        const vc = bp.vertCount ? bp.vertCount[i] : 4;
        for (let v = 0; v < vc; v++) {
          bColArr[vs + v * 3] = r;
          bColArr[vs + v * 3 + 1] = g;
          bColArr[vs + v * 3 + 2] = b;
        }
      }
      bp.colorAttr.needsUpdate = true;
    }
    updateLegend();
  }

  function evaluateVisibility() {
    const activeCams = [];
    for (let i = 0; i < state.cameras.length; i++) {
      if (state.cameras[i].active) {
        const c = new THREE.Color(state.cameras[i].color);
        activeCams.push({ cam: state.cameras[i], r: c.r, g: c.g, b: c.b });
      }
    }

    let groundTotal = 0, groundLit = 0, groundUnlitCount = 0;
    let roofTotal = 0, roofLit = 0, roofUnlitCount = 0;
    let facadeTotal = 0, facadeLit = 0, facadeUnlitCount = 0;

    // 1. Evaluate 3D Hilly DTM / DSM Vertices -> write RGB to AOI-only dtmLightOverlayMesh
    syncDtmBaseMaterial();
    const step = (2 * DTM_HALF) / (DTM_NX - 1);
    const cellArea = step * step;
    const dtmColAttr = dtmMesh.geometry.attributes.color;
    const dtmColArr = dtmColAttr.array;
    const gridVisRgb = new Float32Array(DTM_NX * DTM_NZ * 3);

    for (let j = 0; j < DTM_NZ; j++) {
      const pz = -DTM_HALF + j * step;
      for (let i = 0; i < DTM_NX; i++) {
        const idx = j * DTM_NX + i;
        const px = -DTM_HALF + i * step;
        const py = dtmGrid.elev[idx];
        const nat = getNaturalTerrainColor(py);

        dtmColArr[idx * 3] = nat.r;
        dtmColArr[idx * 3 + 1] = nat.g;
        dtmColArr[idx * 3 + 2] = nat.b;

        if (!dtmGrid.inAoi[idx] || dtmGrid.insideBldg[idx]) {
          gridVisRgb[idx * 3] = nat.r;
          gridVisRgb[idx * 3 + 1] = nat.g;
          gridVisRgb[idx * 3 + 2] = nat.b;
          continue;
        }

        const nx = dtmGrid.normX[idx], ny = dtmGrid.normY[idx], nz = dtmGrid.normZ[idx];
        let hits = 0, sr = 0, sg = 0, sb = 0;

        for (let c = 0; c < activeCams.length; c++) {
          const ac = activeCams[c];
          const res = canCameraSeePoint(ac.cam, px, py + 0.3, pz, nx, ny, nz, -1);
          if (res.visible) {
            hits++;
            sr += ac.r; sg += ac.g; sb += ac.b;
          }
        }

        groundTotal += cellArea;
        if (hits >= 1) groundLit += cellArea;
        else groundUnlitCount++;

        const rgb = getVisColor(hits, sr, sg, sb, nat.r, nat.g, nat.b, true);
        gridVisRgb[idx * 3] = rgb[0];
        gridVisRgb[idx * 3 + 1] = rgb[1];
        gridVisRgb[idx * 3 + 2] = rgb[2];
      }
    }
    dtmColAttr.needsUpdate = true;

    if (dtmLightOverlayMesh && ovVertexGridIdx.length > 0) {
      const ovColAttr = dtmLightOverlayMesh.geometry.attributes.color;
      const ovArr = ovColAttr.array;
      for (let v = 0; v < ovVertexGridIdx.length; v++) {
        const k = ovVertexGridIdx[v];
        ovArr[v * 3] = gridVisRgb[k * 3];
        ovArr[v * 3 + 1] = gridVisRgb[k * 3 + 1];
        ovArr[v * 3 + 2] = gridVisRgb[k * 3 + 2];
      }
      ovColAttr.needsUpdate = true;
    }

    // 2. Evaluate Building Roofs & Walls (store raw visibility RGB for instant opacity sliding)
    const bp = buildingPatches;
    for (let i = 0; i < bp.count; i++) {
      const area = bp.area[i];
      const isRoof = bp.isRoof[i] === 1;
      let hits = 0, sr = 0, sg = 0, sb = 0;

      if (area > 0) {
        const px = bp.px[i], py = bp.py[i], pz = bp.pz[i];
        const nx = bp.nx[i], ny = bp.ny[i], nz = bp.nz[i];
        const bIdx = bp.bIdx[i];

        for (let c = 0; c < activeCams.length; c++) {
          const ac = activeCams[c];
          const res = canCameraSeePoint(ac.cam, px, py, pz, nx, ny, nz, bIdx);
          if (res.visible) {
            hits++;
            sr += ac.r; sg += ac.g; sb += ac.b;
          }
        }

        if (isRoof) {
          roofTotal += area;
          if (hits >= 1) roofLit += area;
          else roofUnlitCount++;
        } else {
          facadeTotal += area;
          if (hits >= 1) facadeLit += area;
          else facadeUnlitCount++;
        }
      }

      const baseR = isRoof ? 0.72 : 0.54;
      const baseG = isRoof ? 0.76 : 0.60;
      const baseB = isRoof ? 0.82 : 0.68;
      const vRgb = area === 0 ? [0.25, 0.30, 0.35] : getVisColor(hits, sr, sg, sb, baseR, baseG, baseB, true);
      if (bp.visR) {
        bp.visR[i] = vRgb[0];
        bp.visG[i] = vRgb[1];
        bp.visB[i] = vRgb[2];
      }
    }

    applyLightOpacity();

    updateVerdictUI({
      groundTotal, groundLit, groundUnlitCount,
      roofTotal, roofLit, roofUnlitCount,
      facadeTotal, facadeLit, facadeUnlitCount,
      activeCount: activeCams.length,
    });

    if (state.inspectedHit) drawInspectedRayFan(state.inspectedHit);
  }

  // =========================================================================
  // 6. Verdict, Legend & Camera List UI
  // =========================================================================
  function updateVerdictUI(s) {
    const fmt = (p) => (p > 99.9 && p < 100) || (p > 0 && p < 0.1) ? p.toFixed(2) : p.toFixed(1);

    const nadirTotal = Math.max(1, s.groundTotal + s.roofTotal);
    const nadirLitPct = ((s.groundLit + s.roofLit) / nadirTotal) * 100;
    const nadirPass = s.activeCount > 0 && s.groundUnlitCount === 0 && s.roofUnlitCount === 0;

    const facTotal = Math.max(1, s.facadeTotal);
    const facLitPct = (s.facadeLit / facTotal) * 100;
    const facPass = s.activeCount > 0 && s.facadeUnlitCount === 0;

    const combPass = nadirPass && facPass;

    document.getElementById("stat-nadir").textContent = `${fmt(nadirLitPct)}% Lit (${fmt(100 - nadirLitPct)}% unlit)`;
    document.getElementById("stat-facade").textContent = `${fmt(facLitPct)}% Lit (${fmt(100 - facLitPct)}% unlit)`;

    const bn = document.getElementById("badge-nadir");
    bn.textContent = nadirPass ? "PASS" : "FAIL";
    bn.className = `badge ${nadirPass ? "pass" : "fail"}`;

    const bf = document.getElementById("badge-facade");
    bf.textContent = facPass ? "PASS" : "FAIL";
    bf.className = `badge ${facPass ? "pass" : "fail"}`;

    const pill = document.getElementById("verdict-pill");
    const label = document.getElementById("verdict-label");
    const badge = document.getElementById("verdict-badge");
    const desc = document.getElementById("verdict-desc");

    if (s.activeCount === 0) {
      pill.className = "verdict-pill fail";
      label.textContent = "NO CAMERAS ACTIVE";
      badge.textContent = "FAIL";
      badge.className = "badge fail";
      desc.textContent = "Turn on at least one camera to inspect visibility.";
    } else if (state.targetMode === "nadir") {
      pill.className = `verdict-pill ${nadirPass ? "pass" : "fail"}`;
      label.textContent = nadirPass ? "JUSTIFIED (GROUND + ROOFS)" : "NOT JUSTIFIED — UNLIT AREAS";
      badge.textContent = nadirPass ? "PASS" : "FAIL";
      badge.className = `badge ${nadirPass ? "pass" : "fail"}`;
      desc.textContent = nadirPass
        ? "Every hill, valley & building roof has camera visibility."
        : `${fmt(100 - nadirLitPct)}% of ground/roofs receive NO light (red).`;
    } else if (state.targetMode === "full3d") {
      pill.className = `verdict-pill ${combPass ? "pass" : "fail"}`;
      label.textContent = combPass ? "JUSTIFIED (FULL 3D)" : "NOT JUSTIFIED — UNLIT SURFACES";
      badge.textContent = combPass ? "PASS" : "FAIL";
      badge.className = `badge ${combPass ? "pass" : "fail"}`;
      desc.textContent = combPass
        ? "All terrain, roofs, and building walls are illuminated."
        : `Unlit: ${fmt(100 - nadirLitPct)}% ground/roofs, ${fmt(100 - facLitPct)}% walls.`;
    } else {
      if (combPass) {
        pill.className = "verdict-pill pass";
        label.textContent = "JUSTIFIED (ALL SURFACES)";
        badge.textContent = "PASS";
        badge.className = "badge pass";
        desc.textContent = "100% of ground, roofs, and walls have line-of-sight.";
      } else if (nadirPass) {
        pill.className = "verdict-pill warn";
        label.textContent = "2.5D PASS / WALLS PARTIAL";
        badge.textContent = "2.5D PASS";
        badge.className = "badge pass";
        desc.textContent = `Ground + Roofs 100% lit. Walls: ${fmt(facLitPct)}% lit (${fmt(100 - facLitPct)}% unlit).`;
      } else {
        pill.className = "verdict-pill fail";
        label.textContent = "NOT JUSTIFIED — UNLIT AREAS";
        badge.textContent = "FAIL";
        badge.className = "badge fail";
        desc.textContent = `Ground/Roofs ${fmt(100 - nadirLitPct)}% unlit, Walls ${fmt(100 - facLitPct)}% unlit.`;
      }
    }

    updateOpticalMetaUI();
    document.getElementById("cam-count").textContent = `${s.activeCount}/${state.cameras.length}`;

    updateLegend();
  }

  function updateOpticalMetaUI() {
    const { halfTanU, halfTanV } = getSensorHalfTans();
    const swathA = Math.round(2 * state.heightAgl * halfTanU);
    const swathC = Math.round(2 * state.heightAgl * halfTanV);
    const gsd = state.useExactShapefile && state.nominalGsdCm
      ? state.nominalGsdCm
      : ((state.pixelUm * 1e-6) * (state.heightAgl / (state.focalMm * 1e-3))) * 100;

    document.getElementById("meta-gsd").textContent = `GSD ${gsd.toFixed(1)} cm`;
    document.getElementById("meta-fp").textContent = `${swathA} × ${swathC} m`;
  }

  function updateLegend() {
    const el = document.getElementById("legend-row");
    if (!state.showVisColoring || state.lightOpacity <= 0.005) {
      const lbl = !state.showBaseMapLayer || state.baseMapMode === "none"
        ? "3D Hillshade Only"
        : `Base Map (${state.baseMapMode.replace("_", " ").toUpperCase()})`;
      el.innerHTML = `<div class="legend-item"><span class="swatch" style="background:#6d747e"></span><span>${lbl} (Light Off / 0% Opacity)</span></div>`;
      return;
    }
    if (state.colorMode === "pass_fail") {
      el.innerHTML = `
        <div class="legend-item"><span class="swatch" style="background:#1ac77a"></span><span>Visible / Lit (&ge;1 Camera)</span></div>
        <div class="legend-item"><span class="swatch" style="background:#eb2933"></span><span>No Light / Blind Spot (0 Cameras)</span></div>
      `;
    } else if (state.colorMode === "heatmap") {
      el.innerHTML = `
        <div class="legend-item"><span class="swatch" style="background:#e62633"></span><span>0 Cams (No Light)</span></div>
        <div class="legend-item"><span class="swatch" style="background:#f59e14"></span><span>1 Cam</span></div>
        <div class="legend-item"><span class="swatch" style="background:#29c7f0"></span><span>2 Cams</span></div>
        <div class="legend-item"><span class="swatch" style="background:#17cc85"></span><span>3+ Cams</span></div>
      `;
    } else {
      el.innerHTML = `
        <div class="legend-item"><span class="swatch" style="background:#941a21"></span><span>No Light</span></div>
        <div class="legend-item"><span class="swatch" style="background:#38bdf8"></span><span>Strip 1</span></div>
        <div class="legend-item"><span class="swatch" style="background:#a78bfa"></span><span>Strip 2</span></div>
        <div class="legend-item"><span class="swatch" style="background:#34d399"></span><span>Strip 3</span></div>
        <div class="legend-item"><span class="swatch" style="background:#fbbf24"></span><span>Strip 4</span></div>
      `;
    }
  }

  function applyTheme(theme) {
    state.theme = theme === "dark" ? "dark" : "light";
    if (document.documentElement && document.documentElement.setAttribute) {
      document.documentElement.setAttribute("data-theme", state.theme);
    }
    const btn = document.getElementById("btn-theme");
    if (btn) btn.textContent = state.theme === "dark" ? "White" : "Dark";
    if (scene) {
      const bgHex = state.theme === "dark" ? "#141416" : "#eef0f3";
      scene.background = new THREE.Color(bgHex);
      if (scene.fog) scene.fog.color = new THREE.Color(bgHex);
    }
  }

  function selectCamera(idx, scrollToSelected = true) {
    if (idx < 0 || idx >= state.cameras.length) return;
    const allWereOff = state.cameras.every((c) => !c.active);
    state.selectedCamIndex = idx;
    const cam = state.cameras[idx];

    if (allWereOff || !cam.active) {
      cam.active = true;
      cam.showFootprint = true;
      state.showVisColoring = true;
      state.showFootprints = true;
      state.showFrustums = true;
      document.getElementById("chk-fp").checked = true;
      document.getElementById("chk-frustum").checked = true;
      syncLayerControlsUI();
    } else if (state.showFootprints) {
      cam.showFootprint = true;
    }

    renderFlightSceneObjects();
    renderCameraList(scrollToSelected);
    evaluateVisibility();
  }

  function renderCameraList(scrollToSelected = false) {
    const stripRow = document.getElementById("strip-row");
    const camGrid = document.getElementById("cam-grid");

    const byStrip = new Map();
    state.cameras.forEach((c) => {
      if (!byStrip.has(c.strip)) byStrip.set(c.strip, []);
      byStrip.get(c.strip).push(c);
    });

    stripRow.innerHTML = "";
    for (const [s, list] of byStrip.entries()) {
      const allOn = list.every((c) => c.active);
      const btn = document.createElement("button");
      btn.className = `btn sm ${allOn ? "active" : ""}`;
      btn.textContent = `L${s} (${list.length})`;
      btn.title = `Toggle Flight Line ${s}`;
      btn.addEventListener("click", () => {
        const turnOn = !allOn;
        list.forEach((c) => {
          c.active = turnOn;
          c.showFootprint = turnOn;
        });
        renderFlightSceneObjects();
        renderCameraList(false);
        evaluateVisibility();
      });
      stripRow.appendChild(btn);
    }

    camGrid.innerHTML = "";
    let selectedEl = null;
    state.cameras.forEach((cam, idx) => {
      const isSelected = idx === state.selectedCamIndex;
      const item = document.createElement("div");
      item.className = `cam-item ${isSelected ? "selected" : ""}`;
      item.innerHTML = `
        <div class="cam-id">
          <span class="dot" style="background:${isSelected ? "#00e5ff" : cam.color}"></span>
          <span>${cam.id}</span>
          ${isSelected ? '<span class="cam-sel-tag">NEON</span>' : ""}
        </div>
      `;

      const checks = document.createElement("div");
      checks.className = "cam-checks";

      const btnLight = document.createElement("button");
      btnLight.type = "button";
      btnLight.className = `cam-pill ${cam.active ? "on-light" : "off"}`;
      btnLight.dataset.vis = String(idx);
      btnLight.title = "Click to toggle camera Light visibility";
      btnLight.textContent = "Light";
      btnLight.addEventListener("click", (e) => {
        e.stopPropagation();
        const next = !state.cameras[idx].active;
        state.cameras[idx].active = next;
        if (next) state.cameras[idx].showFootprint = true;
        state.selectedCamIndex = idx;
        renderFlightSceneObjects();
        renderCameraList(false);
        evaluateVisibility();
      });

      const btnFp = document.createElement("button");
      btnFp.type = "button";
      btnFp.className = `cam-pill ${cam.showFootprint ? "on-fp" : "off"}`;
      btnFp.dataset.fp = String(idx);
      btnFp.title = "Click to toggle camera Footprint";
      btnFp.textContent = "FP";
      btnFp.addEventListener("click", (e) => {
        e.stopPropagation();
        state.cameras[idx].showFootprint = !state.cameras[idx].showFootprint;
        state.selectedCamIndex = idx;
        renderFlightSceneObjects();
        renderCameraList(false);
      });

      checks.appendChild(btnLight);
      checks.appendChild(btnFp);
      item.appendChild(checks);

      item.addEventListener("click", (e) => {
        if (e.target && (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.tagName === "LABEL")) return;
        selectCamera(idx, false);
      });
      if (isSelected) selectedEl = item;
      camGrid.appendChild(item);
    });

    if (scrollToSelected && selectedEl && typeof selectedEl.scrollIntoView === "function") {
      selectedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  // =========================================================================
  // 7. Click-to-Inspect Sight Rays
  // =========================================================================
  function clearInspectedRays() {
    while (rayGroup.children.length > 0) {
      const ch = rayGroup.children.pop();
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material) ch.material.dispose();
    }
    state.inspectedHit = null;
    document.getElementById("ray-pill").style.display = "none";
  }

  function drawInspectedRayFan(hit) {
    while (rayGroup.children.length > 0) {
      const ch = rayGroup.children.pop();
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material) ch.material.dispose();
    }
    const { point, normal, selfBldgIdx, label } = hit;
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(7, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    dot.position.copy(point);
    rayGroup.add(dot);

    const vis = [], occ = [];
    for (const cam of state.cameras) {
      if (!cam.active) continue;
      const res = canCameraSeePoint(cam, point.x, point.y, point.z, normal.x, normal.y, normal.z, selfBldgIdx);
      if (!res.inFrustum) continue;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([point, cam.O]),
        new THREE.LineBasicMaterial({ color: res.visible ? 0x34d399 : 0xef4444, transparent: true, opacity: res.visible ? 0.85 : 0.45 })
      );
      rayGroup.add(line);
      if (res.visible) vis.push(cam.id);
      else occ.push(res.blocker === -2 ? `${cam.id} (Hill)` : `${cam.id} (${buildingBoxes[res.blocker].id})`);
    }

    document.getElementById("ray-pill").style.display = "block";
    document.getElementById("ray-info").innerHTML =
      `<strong>${label}</strong> (Z ${Math.round(point.y)}m)<br>` +
      `<span style="color:${vis.length ? "#34d399" : "#f87171"}">Visible (${vis.length}): ${vis.join(", ") || "NONE"}</span>` +
      (occ.length ? `<br><span style="color:#fca5a5">Blocked (${occ.length}): ${occ.join(", ")}</span>` : "");
  }

  function setupViewportClicks() {
    const dom = renderer.domElement;
    let down = { x: 0, y: 0 };
    let lastHoverTs = 0;

    const mouseFromEvent = (e) => {
      const rect = dom.getBoundingClientRect();
      return new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
    };

    dom.addEventListener("pointermove", (e) => {
      const now = performance.now();
      if (now - lastHoverTs < 30) return;
      lastHoverTs = now;
      if (!raycaster || !camera) return;
      raycaster.setFromCamera(mouseFromEvent(e), camera);
      const targets = [];
      if (buildingsMesh && buildingsGroup && buildingsGroup.visible) targets.push(buildingsMesh);
      if (dtmMesh) targets.push(dtmMesh);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const h = hits[0];
        updateHoverCoordinateUI(h.point.x, h.point.y, h.point.z);
      }
    });

    dom.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
    dom.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      raycaster.setFromCamera(mouseFromEvent(e), camera);

      const camHits = raycaster.intersectObjects(cameraPickMeshes, false);
      if (camHits.length > 0) {
        selectCamera(camHits[0].object.userData.camIndex, true);
        return;
      }

      const targets = [];
      if (buildingsMesh && buildingsGroup && buildingsGroup.visible) targets.push(buildingsMesh);
      if (dtmMesh) targets.push(dtmMesh);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const h = hits[0];
        updateHoverCoordinateUI(h.point.x, h.point.y, h.point.z);
        if (h.object === buildingsMesh && h.faceIndex !== undefined) {
          const pIdx = buildingPatches.faceMeta[h.faceIndex];
          const n = new THREE.Vector3(buildingPatches.nx[pIdx], buildingPatches.ny[pIdx], buildingPatches.nz[pIdx]);
          const bIdx = buildingPatches.bIdx[pIdx];
          state.inspectedHit = {
            point: h.point.clone().addScaledVector(n, 0.3),
            normal: n,
            selfBldgIdx: bIdx,
            label: `${buildingBoxes[bIdx].id} ${buildingPatches.isRoof[pIdx] ? "Roof" : "Wall"}`,
          };
          drawInspectedRayFan(state.inspectedHit);
        } else if (h.object === dtmMesh) {
          const n = h.face ? h.face.normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
          state.inspectedHit = {
            point: h.point.clone().addScaledVector(n, 0.4),
            normal: n,
            selfBldgIdx: -1,
            label: "DTM Terrain",
          };
          drawInspectedRayFan(state.inspectedHit);
        }
      }
    });
  }

  // =========================================================================
  // 8. Controls, Sliders & Presets
  // =========================================================================
  let visTimer = null;
  function scheduleRecompute() {
    renderFlightSceneObjects();
    if (visTimer) clearTimeout(visTimer);
    visTimer = setTimeout(() => evaluateVisibility(), 35);
  }

  function syncLayerControlsUI() {
    const opPct = Math.round(state.lightOpacity * 100);
    const s1 = document.getElementById("sl-light-opacity");
    const v1 = document.getElementById("val-light-opacity");
    const s2 = document.getElementById("sl-layer-light-op");
    const v2 = document.getElementById("val-layer-light-op");
    if (s1) s1.value = opPct;
    if (v1) v1.textContent = `${opPct}%`;
    if (s2) s2.value = opPct;
    if (v2) v2.textContent = `${opPct}%`;

    const c1 = document.getElementById("chk-vis");
    const c2 = document.getElementById("chk-layer-light");
    if (c1) c1.checked = state.showVisColoring;
    if (c2) c2.checked = state.showVisColoring;

    const cb = document.getElementById("chk-layer-bldgs");
    const cc = document.getElementById("chk-layer-contours");
    const cm = document.getElementById("chk-layer-basemap");
    if (cb) cb.checked = state.showBldgsLayer;
    if (cc) cc.checked = state.showContoursLayer;
    if (cm) cm.checked = state.showBaseMapLayer;

    const bs = document.getElementById("basemap-select");
    if (bs) bs.value = state.baseMapMode;
    const br = document.getElementById("basemap-res-select");
    if (br) br.value = String(state.baseMapZoom);
    document.querySelectorAll("#qms-list .qms-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.qms === state.baseMapMode);
    });
    const cs = document.getElementById("crs-select");
    if (cs) cs.value = state.crsMode;
  }

  function syncSliders() {
    document.getElementById("sl-height").value = state.heightAgl;
    document.getElementById("val-height").textContent = `${Math.round(state.heightAgl)} m`;
    document.getElementById("chk-lock-spacing").checked = state.lockSpacing;

    document.getElementById("sl-forelap").value = Math.max(20, Math.min(90, state.forelapPct));
    document.getElementById("val-forelap").textContent = `${Math.round(state.forelapPct)}% (${Math.round(state.airbaseM)} m)`;

    document.getElementById("sl-sidelap").value = Math.max(0, Math.min(85, state.sidelapPct));
    document.getElementById("val-sidelap").textContent = `${Math.round(state.sidelapPct)}% (${Math.round(state.lineSpacingM)} m)`;

    document.getElementById("sl-line-dist").value = Math.max(180, Math.min(1600, state.lineSpacingM));
    document.getElementById("val-line-dist").textContent = `${Math.round(state.lineSpacingM)} m`;

    document.getElementById("sl-focal").value = state.focalMm;
    document.getElementById("val-focal").textContent = `${Number(state.focalMm.toFixed(1))} mm`;

    const fovCross = getFovCrossDeg();
    const fovAlong = getFovAlongDeg();
    document.getElementById("sl-fov-cross").value = Math.max(20, Math.min(100, fovCross)).toFixed(1);
    document.getElementById("val-fov-cross").textContent = `${fovCross.toFixed(1)}°`;
    document.getElementById("sl-fov-along").value = Math.max(15, Math.min(90, fovAlong)).toFixed(1);
    document.getElementById("val-fov-along").textContent = `${fovAlong.toFixed(1)}°`;

    document.getElementById("sl-sensor-cross").value = state.sensorCrossMm.toFixed(2);
    document.getElementById("val-sensor-cross").textContent = `${state.sensorCrossMm.toFixed(2)} mm`;
    document.getElementById("sl-sensor-along").value = state.sensorAlongMm.toFixed(2);
    document.getElementById("val-sensor-along").textContent = `${state.sensorAlongMm.toFixed(2)} mm`;

    document.getElementById("sl-pixel-um").value = state.pixelUm.toFixed(2);
    document.getElementById("val-pixel-um").textContent = `${state.pixelUm.toFixed(2)} µm`;

    const pxC = Math.round((state.sensorCrossMm * 1000) / Math.max(0.5, state.pixelUm));
    const pxA = Math.round((state.sensorAlongMm * 1000) / Math.max(0.5, state.pixelUm));
    const pupilStr = state.pupilMm ? ` • Pupil ${state.pupilMm.toFixed(1)} mm` : "";
    document.getElementById("cam-spec-summary").textContent =
      `${pxC} × ${pxA} px • ${state.sensorCrossMm.toFixed(2)} × ${state.sensorAlongMm.toFixed(2)} mm • ${state.pixelUm.toFixed(2)} µm${pupilStr}`;

    document.getElementById("cam-model-select").value = state.camModel;
    syncLayerControlsUI();

    document.getElementById("sl-heading").value = state.headingDeg;
    document.getElementById("val-heading").textContent = `${Math.round(state.headingDeg)}°`;

    document.getElementById("sl-omega").value = state.omega;
    document.getElementById("val-omega").textContent = `${state.omega}°`;

    document.getElementById("sl-phi").value = state.phi;
    document.getElementById("val-phi").textContent = `${state.phi}°`;

    document.getElementById("sl-dtm-amp").value = state.dtmReliefAmp;
    document.getElementById("sl-bldg-h").value = state.bldgHeightScale;
    updateOpticalMetaUI();
  }

  function recomputeSpacingFromOverlap() {
    const { halfTanU, halfTanV } = getSensorHalfTans();
    state.airbaseM = Math.max(40, 2 * state.heightAgl * halfTanU * (1 - state.forelapPct / 100));
    state.lineSpacingM = Math.max(60, 2 * state.heightAgl * halfTanV * (1 - state.sidelapPct / 100));
  }

  function recomputeOverlapFromSpacing() {
    const { halfTanU, halfTanV } = getSensorHalfTans();
    state.forelapPct = (1 - state.airbaseM / (2 * state.heightAgl * halfTanU)) * 100;
    state.sidelapPct = (1 - state.lineSpacingM / (2 * state.heightAgl * halfTanV)) * 100;
  }

  function rebuildSceneAndEvaluate(resetViewTarget = false) {
    rebuildDtmGridCache();
    buildDtmMeshes();
    buildBuildings();
    syncSliders();
    buildCamerasFromState(false);
    renderFlightSceneObjects();
    renderCameraList(false);
    evaluateVisibility();
    updateDataStatusUI();
    updateHoverCoordinateUI(0, dtmGrid.meanZ, 0);
    if (resetViewTarget && controls) {
      controls.target.set(0, dtmGrid.meanZ + 40, 0);
      camera.position.set(1450, dtmGrid.meanZ + 1150, 1650);
      controls.update();
    }
  }

  function applyAoi(aoiKey, keepPreset = true) {
    state.aoiKey = aoiKey;
    const sel = document.getElementById("aoi-select");
    if (sel) sel.value = aoiKey;
    applyPreset(keepPreset ? state.presetKey : "lot01_actual");
  }

  function applyPreset(key) {
    const p = PRESETS[key];
    if (!p) return;
    state.presetKey = key;
    state.selectedCamIndex = 0;
    state.customDtm = null;
    state.customDsm = null;
    state.customBuildings = null;
    state.customFlight = null;
    document.getElementById("shp-sublot-wrap").style.display = "none";

    Object.assign(state, p);
    refreshCameraModelTag();
    const subData = getActiveSublotData();
    state.originEpsg3857 = [...(subData.originEpsg3857 || DATA.originEpsg3857)];
    const [lat0, lon0] = subData.centerLatLon || DATA.centerLatLon || [7.75114, 80.00201];
    const osmInput = document.getElementById("osm-latlon");
    if (osmInput) osmInput.value = `${lat0.toFixed(5)}, ${lon0.toFixed(5)}`;

    // Match default AGL height to real camera height when using exact Lot 01 shapefile on poly1/poly2/01C
    if (p.useExactShapefile && subData.cameras && subData.cameras.length > 0 && subData.dtmGrid) {
      const meanCamAlt = subData.cameras.reduce((a, c) => a + c.altMsl, 0) / subData.cameras.length;
      state.heightAgl = Math.round(meanCamAlt - subData.dtmGrid.meanZ);
    }

    if (state.aoiKey === "poly1" || state.aoiKey === "poly2") {
      const g = state.surfaceMode === "dsm" && subData.dsmGrid ? subData.dsmGrid : subData.dtmGrid;
      state.dtmSourceLabel = `${subData.dsmFile} (${state.surfaceMode.toUpperCase()} ${Math.round(g.minZ)}-${Math.round(g.maxZ)}m)`;
      state.bldgSourceLabel = `OSM (${subData.buildings.length} real polygons)`;
      state.flightSourceLabel = p.useExactShapefile
        ? `${subData.title.split(":")[0]} Lot01 (${subData.cameras.length} cams)`
        : `Parametric ${Math.round(state.heightAgl)}m (${Math.round(state.forelapPct)}/${Math.round(state.sidelapPct)}%)`;
    } else {
      state.dtmSourceLabel = state.aoiKey === "01C"
        ? "Sublot 01C Real Mountain (209-816m)"
        : "Built-in Sublot 01I Hilly";
      state.bldgSourceLabel = "30 Built-in Towers & Blocks";
      state.flightSourceLabel = p.useExactShapefile
        ? `Lot 01 Sublot ${state.aoiKey} (${(subData.cameras || DATA.cameras).length} cams)`
        : `Parametric ${Math.round(state.heightAgl)}m (${Math.round(state.forelapPct)}/${Math.round(state.sidelapPct)}%)`;
    }

    document.getElementById("preset-select").value = key;
    rebuildSceneAndEvaluate(true);
  }

  // =========================================================================
  // 9. Real Data Parsers (GeoTIFF, ASC, XYZ, SHP+DBF, GeoJSON, KML, CSV, OSM)
  // =========================================================================
  function parseAsciiGridText(text) {
    const tokens = text.trim().split(/\s+/);
    let idx = 0;
    const hdr = {};
    while (idx < tokens.length && isNaN(Number(tokens[idx]))) {
      const k = tokens[idx++].toLowerCase();
      const v = Number(tokens[idx++]);
      hdr[k] = v;
    }
    const nx = hdr.ncols;
    const ny = hdr.nrows;
    const cell = hdr.cellsize || 10;
    const nodata = hdr.nodata_value !== undefined ? hdr.nodata_value : -9999;
    const xll = hdr.xllcorner !== undefined ? hdr.xllcorner : (hdr.xllcenter !== undefined ? hdr.xllcenter - cell * 0.5 : 0);
    const yll = hdr.yllcorner !== undefined ? hdr.yllcorner : (hdr.yllcenter !== undefined ? hdr.yllcenter - cell * 0.5 : 0);
    if (!nx || !ny || tokens.length - idx < nx * ny) {
      throw new Error("Invalid ESRI ASCII Grid (.asc) format.");
    }

    const data = new Float32Array(nx * ny);
    // ASC row 0 is top (north = maxY), store internal row 0 as bottom (south = minY)
    for (let rowTop = 0; rowTop < ny; rowTop++) {
      const rowBot = ny - 1 - rowTop;
      for (let col = 0; col < nx; col++) {
        const val = Number(tokens[idx++]);
        data[rowBot * nx + col] = (val === nodata || !Number.isFinite(val)) ? NaN : val;
      }
    }

    const [wx0, wy0] = (() => {
      const c = detectCrsAndToWorld(xll, yll);
      return [c.wx, c.wy];
    })();
    const [wx1, wy1] = (() => {
      const c = detectCrsAndToWorld(xll + nx * cell, yll + ny * cell);
      return [c.wx, c.wy];
    })();
    const isLocal = detectCrsAndToWorld(xll, yll).isLocal;
    return {
      worldMinX: Math.min(wx0, wx1),
      worldMaxX: Math.max(wx0, wx1),
      worldMinY: Math.min(wy0, wy1),
      worldMaxY: Math.max(wy0, wy1),
      nx,
      ny,
      data,
      isLocal,
    };
  }

  function parseXyzTerrainText(text) {
    const lines = text.trim().split(/\r?\n/);
    const pts = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const parts = line.split(/[,\s;\t]+/).map(Number);
      if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
        const c = detectCrsAndToWorld(parts[0], parts[1]);
        pts.push({ wx: c.wx, wy: c.wy, z: parts[2], isLocal: c.isLocal });
      }
    }
    if (pts.length < 4) throw new Error("XYZ/CSV terrain file needs at least 4 numeric X Y Z points.");

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.wx < minX) minX = p.wx;
      if (p.wx > maxX) maxX = p.wx;
      if (p.wy < minY) minY = p.wy;
      if (p.wy > maxY) maxY = p.wy;
    }

    const nx = 61, ny = 61;
    const data = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      const wy = minY + (maxY - minY) * (j / (ny - 1));
      for (let i = 0; i < nx; i++) {
        const wx = minX + (maxX - minX) * (i / (nx - 1));
        let wsum = 0, wzsum = 0;
        // Fast IDW using closest 8 samples (or all if small)
        const stride = pts.length > 2500 ? Math.ceil(pts.length / 1500) : 1;
        for (let k = 0; k < pts.length; k += stride) {
          const p = pts[k];
          const d2 = Math.max(1.0, (wx - p.wx) ** 2 + (wy - p.wy) ** 2);
          const w = 1.0 / d2;
          wsum += w;
          wzsum += w * p.z;
        }
        data[j * nx + i] = wsum > 0 ? wzsum / wsum : 0;
      }
    }

    return { worldMinX: minX, worldMaxX: maxX, worldMinY: minY, worldMaxY: maxY, nx, ny, data, isLocal: pts[0].isLocal };
  }

  async function parseGeoTiffBuffer(arrayBuffer) {
    if (!window.GeoTIFF || typeof window.GeoTIFF.fromArrayBuffer !== "function") {
      throw new Error("GeoTIFF library not available.");
    }
    const tiff = await window.GeoTIFF.fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    const imgW = image.getWidth();
    const imgH = image.getHeight();
    const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY]
    const noData = image.getGDALNoData();

    const c0 = detectCrsAndToWorld(bbox[0], bbox[1]);
    const c1 = detectCrsAndToWorld(bbox[2], bbox[3]);
    const fullMinX = Math.min(c0.wx, c1.wx);
    const fullMaxX = Math.max(c0.wx, c1.wx);
    const fullMinY = Math.min(c0.wy, c1.wy);
    const fullMaxY = Math.max(c0.wy, c1.wy);
    const spanW = fullMaxX - fullMinX;
    const spanH = fullMaxY - fullMinY;

    let win = null;
    let outMinX = fullMinX, outMaxX = fullMaxX, outMinY = fullMinY, outMaxY = fullMaxY;

    // For regional GeoTIFFs (>5km), crop a 2.6km x 2.6km native-resolution window around active AOI or raster center
    if (!c0.isLocal && (spanW > 5000 || spanH > 5000)) {
      const resX = (bbox[2] - bbox[0]) / imgW;
      const resY = (bbox[3] - bbox[1]) / imgH;
      let cx = 0.5 * (bbox[0] + bbox[2]);
      let cy = 0.5 * (bbox[1] + bbox[3]);
      const ox = state.originEpsg3857[0], oy = state.originEpsg3857[1];
      if (ox >= bbox[0] + 600 && ox <= bbox[2] - 600 && oy >= bbox[1] + 600 && oy <= bbox[3] - 600) {
        cx = ox;
        cy = oy;
      }
      const halfM = 1300;
      const x0 = Math.max(0, Math.floor((cx - halfM - bbox[0]) / resX));
      const x1 = Math.min(imgW, Math.ceil((cx + halfM - bbox[0]) / resX));
      const y0 = Math.max(0, Math.floor((bbox[3] - (cy + halfM)) / resY));
      const y1 = Math.min(imgH, Math.ceil((bbox[3] - (cy - halfM)) / resY));
      win = [x0, y0, x1, y1];
      outMinX = bbox[0] + x0 * resX;
      outMaxX = bbox[0] + x1 * resX;
      outMinY = bbox[3] - y1 * resY;
      outMaxY = bbox[3] - y0 * resY;
    }

    const rasters = await image.readRasters(win ? { window: win, interleave: false } : { interleave: false });
    const band = rasters[0];
    const srcW = win ? (win[2] - win[0]) : imgW;
    const srcH = win ? (win[3] - win[1]) : imgH;

    const nx = Math.min(180, srcW);
    const ny = Math.min(180, srcH);
    const data = new Float32Array(nx * ny);
    for (let rowBot = 0; rowBot < ny; rowBot++) {
      const rowTop = ny - 1 - rowBot;
      const sy = Math.min(srcH - 1, Math.floor((rowTop / Math.max(1, ny - 1)) * (srcH - 1)));
      for (let col = 0; col < nx; col++) {
        const sx = Math.min(srcW - 1, Math.floor((col / Math.max(1, nx - 1)) * (srcW - 1)));
        const val = band[sy * srcW + sx];
        data[rowBot * nx + col] = (val === noData || val <= -500 || !Number.isFinite(val)) ? NaN : val;
      }
    }

    return {
      worldMinX: outMinX,
      worldMaxX: outMaxX,
      worldMinY: outMinY,
      worldMaxY: outMaxY,
      nx,
      ny,
      data,
      isLocal: c0.isLocal,
    };
  }

  async function loadTerrainUpload(file, isDsm) {
    const ext = file.name.split(".").pop().toLowerCase();
    let grid;
    if (ext === "tif" || ext === "tiff") {
      grid = await parseGeoTiffBuffer(await file.arrayBuffer());
    } else if (ext === "asc") {
      grid = parseAsciiGridText(await file.text());
    } else {
      grid = parseXyzTerrainText(await file.text());
    }
    grid.name = file.name;

    const cx = 0.5 * (grid.worldMinX + grid.worldMaxX);
    const cy = 0.5 * (grid.worldMinY + grid.worldMaxY);
    realignOriginIfNeeded(cx, cy, grid.isLocal);

    if (isDsm) {
      state.customDsm = grid;
      state.dtmSourceLabel = `${state.customDtm ? state.customDtm.name : "Built-in DTM"} + DSM (${file.name})`;
      if (!state.customBuildings) {
        state.bldgSourceLabel = `nDSM from ${file.name}`;
      }
    } else {
      state.customDtm = grid;
      state.dtmSourceLabel = `${file.name}${state.customDsm ? " + DSM (" + state.customDsm.name + ")" : ""}`;
    }
    rebuildSceneAndEvaluate(true);
  }

  function parseDbfBuffer(buf) {
    const dv = new DataView(buf);
    const numRec = dv.getUint32(4, true);
    const headerLen = dv.getUint16(8, true);
    const recLen = dv.getUint16(10, true);
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const bytes = new Uint8Array(buf);

    const fields = [];
    let pos = 32;
    while (pos < headerLen && bytes[pos] !== 0x0d) {
      let nameEnd = pos;
      while (nameEnd < pos + 11 && bytes[nameEnd] !== 0) nameEnd++;
      const name = decoder.decode(bytes.subarray(pos, nameEnd)).trim();
      const ftype = String.fromCharCode(bytes[pos + 11]);
      const flen = bytes[pos + 16];
      fields.push({ name, ftype, flen });
      pos += 32;
    }

    const rows = [];
    for (let r = 0; r < numRec; r++) {
      let off = headerLen + r * recLen + 1;
      if (off + recLen - 1 > bytes.length) break;
      const row = {};
      for (const f of fields) {
        let raw = decoder.decode(bytes.subarray(off, off + f.flen)).replace(/\0/g, "").trim();
        row[f.name] = raw;
        off += f.flen;
      }
      rows.push(row);
    }
    return rows;
  }

  function parseShpBuffer(buf) {
    const dv = new DataView(buf);
    const shapeType = dv.getInt32(32, true);
    const records = [];
    let pos = 100;
    while (pos + 8 <= buf.byteLength) {
      const contentWords = dv.getInt32(pos + 4, false);
      const recStart = pos + 8;
      const recEnd = recStart + contentWords * 2;
      if (recEnd > buf.byteLength) break;

      const rType = dv.getInt32(recStart, true);
      if (rType === 1 || rType === 11 || rType === 21) {
        const x = dv.getFloat64(recStart + 4, true);
        const y = dv.getFloat64(recStart + 12, true);
        const z = rType === 11 ? dv.getFloat64(recStart + 20, true) : NaN;
        records.push({ type: "Point", x, y, z });
      } else if (rType === 3 || rType === 5 || rType === 13 || rType === 15) {
        const nParts = dv.getInt32(recStart + 36, true);
        const nPts = dv.getInt32(recStart + 40, true);
        const parts = [];
        for (let p = 0; p < nParts; p++) {
          parts.push(dv.getInt32(recStart + 44 + p * 4, true));
        }
        const ptsOff = recStart + 44 + nParts * 4;
        const rings = [];
        for (let p = 0; p < nParts; p++) {
          const sIdx = parts[p];
          const eIdx = p + 1 < nParts ? parts[p + 1] : nPts;
          const ring = [];
          for (let k = sIdx; k < eIdx; k++) {
            const x = dv.getFloat64(ptsOff + k * 16, true);
            const y = dv.getFloat64(ptsOff + k * 16 + 8, true);
            ring.push([x, y]);
          }
          rings.push(ring);
        }
        records.push({ type: (rType === 5 || rType === 15) ? "Polygon" : "Polyline", rings });
      } else {
        records.push({ type: "Null" });
      }
      pos = recEnd;
    }
    return { shapeType, records };
  }

  function extractHeightFromProps(props) {
    if (!props) return null;
    for (const k of ["height", "Height", "HEIGHT", "h", "H", "bldg_h", "BLDG_H", "ele", "Z_MAX"]) {
      if (props[k] !== undefined && props[k] !== null && props[k] !== "") {
        const val = parseFloat(String(props[k]).replace(/[^\d.-]/g, ""));
        if (Number.isFinite(val) && val > 0.5) return val;
      }
    }
    const lvls = props["building:levels"] || props["levels"] || props["LEVELS"];
    if (lvls !== undefined && lvls !== null && lvls !== "") {
      const n = parseFloat(lvls);
      if (Number.isFinite(n) && n > 0) return n * 3.5;
    }
    return null;
  }

  function parseGeoJsonBuildings(geojsonText) {
    const obj = JSON.parse(geojsonText);
    const features = obj.type === "FeatureCollection" ? obj.features : obj.type === "Feature" ? [obj] : [];
    const list = [];
    let idx = 0;
    for (const f of features) {
      if (!f.geometry) continue;
      const geom = f.geometry;
      const props = f.properties || {};
      const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
      for (const rings of polys) {
        if (!rings || !rings[0] || rings[0].length < 3) continue;
        const worldRing = [];
        let isLocal = false;
        for (const pt of rings[0]) {
          const c = detectCrsAndToWorld(pt[0], pt[1]);
          worldRing.push([c.wx, c.wy]);
          isLocal = c.isLocal;
        }
        idx++;
        list.push({
          id: String(props.id || props.ID || `B-${idx}`),
          label: String(props.name || props.label || props.building || `Building ${idx}`),
          worldRing,
          isLocal,
          heightM: extractHeightFromProps(props) || 14.0,
        });
      }
    }
    return list;
  }

  function parseCsvBuildings(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const hdr = lines[0].split(/[,\t;]+/).map((s) => s.trim().toLowerCase());
    const findCol = (names) => hdr.findIndex((h) => names.some((n) => h === n || h.includes(n)));
    const iId = findCol(["id", "name"]);
    const iX = findCol(["east", "lon", "lng", "cx", "x"]);
    const iY = findCol(["north", "lat", "cy", "y"]);
    const iW = findCol(["width", "w"]);
    const iD = findCol(["depth", "d", "len"]);
    const iH = findCol(["height", "h", "elev"]);
    if (iX < 0 || iY < 0) throw new Error("CSV buildings need X/East/Lon and Y/North/Lat columns.");

    const list = [];
    for (let r = 1; r < lines.length; r++) {
      const cols = lines[r].split(/[,\t;]+/).map((s) => s.trim());
      const x = Number(cols[iX]), y = Number(cols[iY]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const w = iW >= 0 && Number(cols[iW]) > 0 ? Number(cols[iW]) : 32;
      const d = iD >= 0 && Number(cols[iD]) > 0 ? Number(cols[iD]) : 32;
      const h = iH >= 0 && Number(cols[iH]) > 0 ? Number(cols[iH]) : 16;
      const c = detectCrsAndToWorld(x, y);
      const hw = w * 0.5, hd = d * 0.5;
      list.push({
        id: iId >= 0 && cols[iId] ? cols[iId] : `B-${r}`,
        label: iId >= 0 && cols[iId] ? cols[iId] : `Building ${r}`,
        worldRing: [
          [c.wx - hw, c.wy - hd], [c.wx + hw, c.wy - hd],
          [c.wx + hw, c.wy + hd], [c.wx - hw, c.wy + hd],
        ],
        isLocal: c.isLocal,
        heightM: h,
      });
    }
    return list;
  }

  async function loadBuildingsUpload(fileList) {
    const files = Array.from(fileList);
    const shpFile = files.find((f) => f.name.toLowerCase().endsWith(".shp"));
    const dbfFile = files.find((f) => f.name.toLowerCase().endsWith(".dbf"));
    const geoFile = files.find((f) => /\.(geojson|json)$/i.test(f.name));
    const csvFile = files.find((f) => /\.(csv|txt)$/i.test(f.name));

    let list = [];
    let label = "";

    if (shpFile) {
      const shp = parseShpBuffer(await shpFile.arrayBuffer());
      const attrs = dbfFile ? parseDbfBuffer(await dbfFile.arrayBuffer()) : [];
      shp.records.forEach((rec, i) => {
        if (rec.type !== "Polygon" || !rec.rings.length) return;
        const props = attrs[i] || {};
        let isLocal = false;
        const worldRing = rec.rings[0].map(([px, py]) => {
          const c = detectCrsAndToWorld(px, py);
          isLocal = c.isLocal;
          return [c.wx, c.wy];
        });
        list.push({
          id: props.id || props.ID || `SHP-${i + 1}`,
          label: props.name || props.Name || `Building ${i + 1}`,
          worldRing,
          isLocal,
          heightM: extractHeightFromProps(props) || 14.0,
        });
      });
      label = `${shpFile.name} (${list.length} polys)`;
    } else if (geoFile) {
      list = parseGeoJsonBuildings(await geoFile.text());
      label = `${geoFile.name} (${list.length} polys)`;
    } else if (csvFile) {
      list = parseCsvBuildings(await csvFile.text());
      label = `${csvFile.name} (${list.length} bldgs)`;
    }

    if (!list.length) throw new Error("No valid building footprints found in uploaded file(s).");

    if (!list[0].isLocal) {
      let sx = 0, sy = 0, cnt = 0;
      for (const b of list) {
        sx += b.worldRing[0][0];
        sy += b.worldRing[0][1];
        cnt++;
      }
      realignOriginIfNeeded(sx / cnt, sy / cnt, false);
    }

    state.customBuildings = list;
    state.bldgSourceLabel = label;
    rebuildSceneAndEvaluate(false);
  }

  async function fetchOsmBuildings() {
    const raw = (document.getElementById("osm-latlon").value || "").trim();
    const parts = raw.split(/[,\s]+/).map(Number);
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
      alert("Enter valid center coordinates as: Lat, Lon (e.g. 6.77112, 81.08230)");
      return;
    }
    const [lat0, lon0] = parts;
    const btn = document.getElementById("btn-fetch-osm");
    const prevTxt = btn.textContent;
    btn.textContent = "Fetching...";
    btn.disabled = true;

    try {
      const rDeg = 0.010; // ~2.2 km x 2.2 km AOI box
      const w = (lon0 - rDeg).toFixed(5), s = (lat0 - rDeg).toFixed(5);
      const e = (lon0 + rDeg).toFixed(5), n = (lat0 + rDeg).toFixed(5);

      let data = null;
      // 1. Try official OpenStreetMap API v0.6 map.json first (fast & reliable)
      try {
        const osmResp = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${w},${s},${e},${n}`);
        if (osmResp.ok) {
          data = await osmResp.json();
        }
      } catch (_) {}

      // 2. Fallback to Overpass mirrors
      if (!data || !data.elements) {
        const q = `[out:json][timeout:12];(way["building"](${s},${w},${n},${e}););out body;>;out skel qt;`;
        const mirrors = [
          "https://overpass-api.de/api/interpreter",
          "https://overpass.kumi.systems/api/interpreter",
          "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        ];
        for (const url of mirrors) {
          try {
            const resp = await fetch(url, {
              method: "POST",
              body: "data=" + encodeURIComponent(q),
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            if (resp.ok) {
              data = await resp.json();
              break;
            }
          } catch (_) {}
        }
      }

      if (!data || !data.elements) {
        throw new Error("Could not reach OSM / Overpass API. You can upload polygon1_osm_buildings.geojson or polygon2_osm_buildings.geojson from data/AOI.");
      }

      const nodes = new Map();
      for (const el of data.elements) {
        if (el.type === "node") nodes.set(el.id, [el.lat, el.lon]);
      }

      const bldgs = [];
      for (const el of data.elements) {
        if (el.type === "way" && el.tags && el.tags.building && el.nodes && el.nodes.length >= 4) {
          const worldRing = [];
          for (const nid of el.nodes) {
            const ll = nodes.get(nid);
            if (ll) worldRing.push(wgs84ToEpsg3857(ll[0], ll[1]));
          }
          if (worldRing.length >= 3) {
            const tags = el.tags || {};
            bldgs.push({
              id: `OSM-${el.id}`,
              label: tags.name || tags.building || "OSM Building",
              worldRing,
              isLocal: false,
              heightM: extractHeightFromProps(tags) || 12.0,
            });
          }
        }
      }

      if (!bldgs.length) {
        throw new Error(`No OSM buildings found around (${lat0.toFixed(4)}, ${lon0.toFixed(4)}).`);
      }

      const [ox, oy] = wgs84ToEpsg3857(lat0, lon0);
      realignOriginIfNeeded(ox, oy, false);
      state.customBuildings = bldgs.slice(0, 450);
      state.bldgSourceLabel = `OSM (${state.customBuildings.length} buildings)`;
      rebuildSceneAndEvaluate(false);
    } finally {
      btn.textContent = prevTxt;
      btn.disabled = false;
    }
  }

  function parseFlightCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error("Flight CSV must have a header and at least one camera row.");
    const hdr = lines[0].split(/[,\t;]+/).map((s) => s.trim().toLowerCase());
    const findCol = (keys) => hdr.findIndex((h) => keys.some((k) => h === k || h.includes(k)));
    const iId = findCol(["photoid", "event", "id", "name"]);
    const iStrip = findCol(["strip", "line", "flightline"]);
    const iX = findCol(["east", "lon", "lng", "x"]);
    const iY = findCol(["north", "lat", "y"]);
    const iZ = findCol(["altmsl", "alt", "z", "elev", "height"]);
    const iOm = findCol(["omega", "roll"]);
    const iPh = findCol(["phi", "pitch"]);
    const iKa = findCol(["kappa", "yaw", "heading"]);
    if (iX < 0 || iY < 0) throw new Error("Flight CSV needs East/Lon/X and North/Lat/Y columns.");

    const cams = [];
    for (let r = 1; r < lines.length; r++) {
      const cols = lines[r].split(/[,\t;]+/).map((s) => s.trim());
      const x = Number(cols[iX]), y = Number(cols[iY]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const c = detectCrsAndToWorld(x, y);
      const z = iZ >= 0 && Number.isFinite(Number(cols[iZ])) ? Number(cols[iZ]) : NaN;
      cams.push({
        id: iId >= 0 && cols[iId] ? cols[iId] : `C-${r}`,
        strip: iStrip >= 0 && Number.isFinite(Number(cols[iStrip])) ? Number(cols[iStrip]) : 1,
        wx: c.wx,
        wy: c.wy,
        altMsl: z,
        omega: iOm >= 0 && Number.isFinite(Number(cols[iOm])) ? Number(cols[iOm]) : 0,
        phi: iPh >= 0 && Number.isFinite(Number(cols[iPh])) ? Number(cols[iPh]) : 0,
        kappa: iKa >= 0 && Number.isFinite(Number(cols[iKa])) ? Number(cols[iKa]) : 0,
        isLocal: c.isLocal,
      });
    }
    return cams;
  }

  function applyShapefileSublotSelection(allRecords, aoiFilter) {
    let subset = aoiFilter ? allRecords.filter((r) => r.aoi === aoiFilter) : allRecords;
    if (!subset.length) subset = allRecords;

    // If regional shapefile has hundreds/thousands of stations, take a ~2.4km AOI window around current or cluster center
    if (subset.length > 140) {
      let cx = 0, cy = 0;
      // Pick median-strip center point
      const mid = subset[Math.floor(subset.length * 0.5)];
      cx = mid.wx;
      cy = mid.wy;
      const near = subset.filter((c) => Math.abs(c.wx - cx) <= 1350 && Math.abs(c.wy - cy) <= 1350);
      subset = near.length >= 4 ? near.slice(0, 120) : subset.slice(0, 120);
    }

    let sx = 0, sy = 0;
    for (const c of subset) { sx += c.wx; sy += c.wy; }
    realignOriginIfNeeded(sx / subset.length, sy / subset.length, subset[0].isLocal);

    state.customFlight.cameras = subset;
    state.useExactShapefile = true;
    state.flightSourceLabel = `${state.customFlight.name}${aoiFilter ? " [" + aoiFilter + "]" : ""} (${subset.length} cams)`;
    rebuildSceneAndEvaluate(true);
  }

  async function loadFlightUpload(fileList) {
    const files = Array.from(fileList);
    const shpFile = files.find((f) => f.name.toLowerCase().endsWith(".shp"));
    const dbfFile = files.find((f) => f.name.toLowerCase().endsWith(".dbf"));
    const csvFile = files.find((f) => /\.(csv|txt)$/i.test(f.name));
    const geoFile = files.find((f) => /\.(geojson|json)$/i.test(f.name));
    const kmlFile = files.find((f) => /\.kml$/i.test(f.name));

    const subWrap = document.getElementById("shp-sublot-wrap");
    const subSel = document.getElementById("shp-sublot-select");
    subWrap.style.display = "none";

    if (shpFile) {
      const shp = parseShpBuffer(await shpFile.arrayBuffer());
      const attrs = dbfFile ? parseDbfBuffer(await dbfFile.arrayBuffer()) : [];
      const allPts = [];
      const aoiSet = new Set();

      shp.records.forEach((rec, i) => {
        if (rec.type !== "Point") return;
        const p = attrs[i] || {};
        const c = detectCrsAndToWorld(rec.x, rec.y);
        const aoi = p.AOI || p.aoi || "";
        if (aoi) aoiSet.add(aoi);
        const stripVal = Number(p.FlightLine || p.Line || p.Strip || 1);
        const altMsl = Number.isFinite(rec.z) ? rec.z
          : p["AltMSL[ft]"] ? Number(p["AltMSL[ft]"]) * 0.3048
          : NaN;
        allPts.push({
          id: p.EventLabel ? `L${stripVal}-${p.EventLabel}` : `C-${i + 1}`,
          strip: Number.isFinite(stripVal) ? stripVal : 1,
          wx: c.wx,
          wy: c.wy,
          altMsl,
          omega: Number(p.Omega || 0) || 0,
          phi: Number(p.Phi || 0) || 0,
          kappa: Number(p.Kappa || 0) || 0,
          isLocal: c.isLocal,
          aoi,
        });
      });

      if (!allPts.length) throw new Error("No Point camera records found in uploaded shapefile.");

      state.customFlight = { name: shpFile.name, allRecords: allPts, cameras: [] };
      const aois = Array.from(aoiSet).sort();
      if (aois.length > 1) {
        subSel.innerHTML = aois.map((a) => `<option value="${a}">Sublot ${a}</option>`).join("");
        const defAoi = aois.includes("01I") ? "01I" : aois[0];
        subSel.value = defAoi;
        subWrap.style.display = "block";
        applyShapefileSublotSelection(allPts, defAoi);
      } else {
        applyShapefileSublotSelection(allPts, aois[0] || "");
      }
      return;
    }

    let cams = [];
    let name = "";
    if (csvFile) {
      cams = parseFlightCsv(await csvFile.text());
      name = csvFile.name;
    } else if (geoFile) {
      const obj = JSON.parse(await geoFile.text());
      const feats = obj.features || [];
      feats.forEach((f, i) => {
        if (!f.geometry || f.geometry.type !== "Point") return;
        const [x, y, z] = f.geometry.coordinates;
        const c = detectCrsAndToWorld(x, y);
        const pr = f.properties || {};
        cams.push({
          id: String(pr.id || pr.PhotoID || `C-${i + 1}`),
          strip: Number(pr.strip || pr.FlightLine || 1) || 1,
          wx: c.wx,
          wy: c.wy,
          altMsl: Number.isFinite(z) ? z : Number(pr.altMsl || NaN),
          omega: Number(pr.omega || 0) || 0,
          phi: Number(pr.phi || 0) || 0,
          kappa: Number(pr.kappa || 0) || 0,
          isLocal: c.isLocal,
        });
      });
      name = geoFile.name;
    } else if (kmlFile) {
      const xml = new DOMParser().parseFromString(await kmlFile.text(), "text/xml");
      const pms = Array.from(xml.querySelectorAll("Placemark"));
      pms.forEach((pm, i) => {
        const pt = pm.querySelector("Point coordinates");
        if (!pt) return;
        const [lon, lat, alt] = pt.textContent.trim().split(",").map(Number);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        const [wx, wy] = wgs84ToEpsg3857(lat, lon);
        const nm = pm.querySelector("name");
        cams.push({
          id: nm ? nm.textContent.trim() : `KML-${i + 1}`,
          strip: 1,
          wx,
          wy,
          altMsl: Number.isFinite(alt) && alt > 0 ? alt : NaN,
          omega: 0, phi: 0, kappa: 0, isLocal: false,
        });
      });
      name = kmlFile.name;
    }

    if (!cams.length) throw new Error("No valid camera stations found in uploaded flight file.");
    state.customFlight = { name, allRecords: cams, cameras: cams };
    applyShapefileSublotSelection(cams, "");
  }

  function bindControls() {
    document.getElementById("btn-theme").addEventListener("click", () => {
      applyTheme(state.theme === "light" ? "dark" : "light");
    });
    document.getElementById("aoi-select").addEventListener("change", (e) => applyAoi(e.target.value, true));
    document.querySelectorAll("#surface-mode-seg .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#surface-mode-seg .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.surfaceMode = btn.dataset.smode;
        const subData = getActiveSublotData();
        if (state.aoiKey === "poly1" || state.aoiKey === "poly2") {
          const g = state.surfaceMode === "dsm" && subData.dsmGrid ? subData.dsmGrid : subData.dtmGrid;
          state.dtmSourceLabel = `${subData.dsmFile} (${state.surfaceMode.toUpperCase()} ${Math.round(g.minZ)}-${Math.round(g.maxZ)}m)`;
        }
        rebuildSceneAndEvaluate(false);
      });
    });
    document.getElementById("preset-select").addEventListener("change", (e) => applyPreset(e.target.value));
    document.getElementById("btn-reset").addEventListener("click", () => applyPreset(state.presetKey));

    const setBaseMapMode = (mode, allowUploadPrompt = false) => {
      state.baseMapMode = mode;
      if (mode !== "none") state.showBaseMapLayer = true;
      if (allowUploadPrompt && mode === "custom" && !state.customBaseMapImg) {
        const inp = document.getElementById("file-basemap");
        if (inp) { inp.value = ""; inp.click(); }
      }
      syncLayerControlsUI();
      updateBaseMapTexture(true);
      applyLightOpacity();
    };

    document.getElementById("basemap-select").addEventListener("change", (e) => {
      setBaseMapMode(e.target.value, true);
    });

    const baseResSel = document.getElementById("basemap-res-select");
    if (baseResSel) {
      baseResSel.addEventListener("change", (e) => {
        state.baseMapZoom = Number(e.target.value) || 17;
        if (state.baseMapMode !== "none" && state.showBaseMapLayer) {
          updateBaseMapTexture(true);
        }
        syncLayerControlsUI();
      });
    }

    document.querySelectorAll("#qms-list .qms-item").forEach((btn) => {
      btn.addEventListener("click", () => setBaseMapMode(btn.dataset.qms, false));
    });

    document.getElementById("btn-qms-upload").addEventListener("click", () => {
      const inp = document.getElementById("file-basemap");
      if (inp) { inp.value = ""; inp.click(); }
    });

    document.getElementById("chk-layer-basemap").addEventListener("change", (e) => {
      state.showBaseMapLayer = e.target.checked;
      syncLayerControlsUI();
      updateBaseMapTexture(false);
      applyLightOpacity();
    });

    document.getElementById("chk-layer-bldgs").addEventListener("change", (e) => {
      state.showBldgsLayer = e.target.checked;
      if (buildingsGroup) buildingsGroup.visible = state.showBldgsLayer;
      syncLayerControlsUI();
    });

    document.getElementById("chk-layer-contours").addEventListener("change", (e) => {
      state.showContoursLayer = e.target.checked;
      if (dtmContourLines) dtmContourLines.visible = state.showContoursLayer;
      syncLayerControlsUI();
    });

    document.getElementById("crs-select").addEventListener("change", (e) => {
      state.crsMode = e.target.value;
      const [hx, hy, hz] = state.lastHoverWorldXZ || [0, dtmGrid.meanZ, 0];
      updateHoverCoordinateUI(hx, hy, hz);
    });

    // Real Data & Uploads
    const bindFileBtn = (btnId, inputId, handler) => {
      const btn = document.getElementById(btnId);
      const inp = document.getElementById(inputId);
      btn.addEventListener("click", () => { inp.value = ""; inp.click(); });
      inp.addEventListener("change", async (e) => {
        if (!e.target.files || !e.target.files.length) return;
        try {
          await handler(e.target.files);
        } catch (err) {
          alert(`Upload failed: ${err && err.message ? err.message : err}`);
        }
      });
    };

    bindFileBtn("btn-up-basemap", "file-basemap", async (files) => {
      const file = files[0];
      if (!file) return;
      const img = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const im = new Image();
        im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
        im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not load map image.")); };
        im.src = url;
      });
      img._uid = `${file.name}:${file.size}:${Date.now()}`;
      state.customBaseMapImg = img;
      setBaseMapMode("custom", false);
    });

    bindFileBtn("btn-up-dtm", "file-dtm", (files) => loadTerrainUpload(files[0], false));
    bindFileBtn("btn-up-dsm", "file-dsm", (files) => loadTerrainUpload(files[0], true));
    bindFileBtn("btn-up-bldgs", "file-bldgs", (files) => loadBuildingsUpload(files));
    bindFileBtn("btn-up-flight", "file-flight", (files) => loadFlightUpload(files));

    document.getElementById("btn-fetch-osm").addEventListener("click", async () => {
      try {
        await fetchOsmBuildings();
      } catch (err) {
        alert(err && err.message ? err.message : String(err));
      }
    });

    document.getElementById("shp-sublot-select").addEventListener("change", (e) => {
      if (state.customFlight && state.customFlight.allRecords) {
        applyShapefileSublotSelection(state.customFlight.allRecords, e.target.value);
      }
    });

    document.getElementById("btn-clear-uploads").addEventListener("click", () => {
      applyPreset(state.presetKey);
    });

    // Segmented Target Mode
    document.querySelectorAll("#target-seg .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#target-seg .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.targetMode = btn.dataset.target;
        evaluateVisibility();
      });
    });

    // Segmented Color Mode
    document.querySelectorAll("#color-seg .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#color-seg .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.colorMode = btn.dataset.cmode;
        evaluateVisibility();
      });
    });

    // View Bar (dynamic relative to active DTM elevation)
    document.getElementById("btn-view-3d").addEventListener("click", () => {
      camera.position.set(1450, dtmGrid.meanZ + 1150, 1650);
      controls.target.set(0, dtmGrid.meanZ + 40, 0);
      controls.update();
    });
    document.getElementById("btn-view-top").addEventListener("click", () => {
      camera.position.set(0, dtmGrid.meanZ + 2800, 10);
      controls.target.set(0, dtmGrid.meanZ, 0);
      controls.update();
    });
    document.getElementById("btn-view-valley").addEventListener("click", () => {
      camera.position.set(360, dtmGrid.meanZ + 240, 420);
      controls.target.set(-30, dtmGrid.meanZ + 20, 0);
      controls.update();
    });
    document.getElementById("btn-view-cam").addEventListener("click", () => {
      const cam = state.cameras[state.selectedCamIndex];
      if (!cam) return;
      camera.position.set(cam.O.x + 80, cam.O.y - 30, cam.O.z + 180);
      controls.target.copy(intersectRayWithDtm(cam.O.x, cam.O.y, cam.O.z, cam.w.x, cam.w.y, cam.w.z));
      controls.update();
    });

    // Flight Sliders
    document.getElementById("chk-lock-spacing").addEventListener("change", (e) => {
      state.lockSpacing = e.target.checked;
    });

    const onFlightChange = (keepExact = false) => {
      if (!keepExact) state.useExactShapefile = false;
      syncSliders();
      buildCamerasFromState(true);
      renderCameraList();
      scheduleRecompute();
    };

    document.getElementById("sl-height").addEventListener("input", (e) => {
      state.heightAgl = Number(e.target.value);
      if (state.lockSpacing) recomputeOverlapFromSpacing();
      else recomputeSpacingFromOverlap();
      onFlightChange(false);
    });
    document.getElementById("sl-forelap").addEventListener("input", (e) => {
      state.forelapPct = Number(e.target.value);
      recomputeSpacingFromOverlap();
      onFlightChange(false);
    });
    document.getElementById("sl-sidelap").addEventListener("input", (e) => {
      state.sidelapPct = Number(e.target.value);
      recomputeSpacingFromOverlap();
      onFlightChange(false);
    });
    document.getElementById("sl-line-dist").addEventListener("input", (e) => {
      state.lineSpacingM = Number(e.target.value);
      recomputeOverlapFromSpacing();
      onFlightChange(false);
    });
    document.getElementById("sl-heading").addEventListener("input", (e) => {
      state.headingDeg = Number(e.target.value);
      onFlightChange(false);
    });
    const applyOpticsUpdate = () => {
      state.nominalGsdCm = null;
      refreshCameraModelTag();
      if (state.lockSpacing || state.useExactShapefile) recomputeOverlapFromSpacing();
      else recomputeSpacingFromOverlap();
      onFlightChange(state.useExactShapefile);
    };

    document.getElementById("cam-model-select").addEventListener("change", (e) => {
      const m = CAMERA_MODELS[e.target.value];
      if (m) {
        state.camModel = e.target.value;
        state.focalMm = m.focalMm;
        state.sensorCrossMm = m.sensorCrossMm;
        state.sensorAlongMm = m.sensorAlongMm;
        state.pixelUm = m.pixelUm;
        state.pupilMm = m.pupilMm;
        applyOpticsUpdate();
      } else {
        state.camModel = "custom";
        syncSliders();
      }
    });

    document.getElementById("btn-swap-sensor").addEventListener("click", () => {
      const tmp = state.sensorCrossMm;
      state.sensorCrossMm = state.sensorAlongMm;
      state.sensorAlongMm = tmp;
      applyOpticsUpdate();
    });

    document.getElementById("sl-focal").addEventListener("input", (e) => {
      state.focalMm = Number(e.target.value);
      applyOpticsUpdate();
    });
    document.getElementById("sl-fov-cross").addEventListener("input", (e) => {
      const fovRad = degToRad(Number(e.target.value));
      state.sensorCrossMm = 2 * state.focalMm * Math.tan(fovRad * 0.5);
      applyOpticsUpdate();
    });
    document.getElementById("sl-fov-along").addEventListener("input", (e) => {
      const fovRad = degToRad(Number(e.target.value));
      state.sensorAlongMm = 2 * state.focalMm * Math.tan(fovRad * 0.5);
      applyOpticsUpdate();
    });
    document.getElementById("sl-sensor-cross").addEventListener("input", (e) => {
      state.sensorCrossMm = Number(e.target.value);
      applyOpticsUpdate();
    });
    document.getElementById("sl-sensor-along").addEventListener("input", (e) => {
      state.sensorAlongMm = Number(e.target.value);
      applyOpticsUpdate();
    });
    document.getElementById("sl-pixel-um").addEventListener("input", (e) => {
      state.pixelUm = Number(e.target.value);
      state.nominalGsdCm = null;
      refreshCameraModelTag();
      syncSliders();
      scheduleRecompute();
    });
    document.getElementById("sl-omega").addEventListener("input", (e) => {
      state.omega = Number(e.target.value);
      onFlightChange(state.useExactShapefile);
    });
    document.getElementById("sl-phi").addEventListener("input", (e) => {
      state.phi = Number(e.target.value);
      onFlightChange(state.useExactShapefile);
    });

    // Terrain & Building Sliders
    document.getElementById("sl-dtm-amp").addEventListener("input", (e) => {
      state.dtmReliefAmp = Number(e.target.value);
      rebuildDtmGridCache();
      buildDtmMeshes();
      buildBuildings();
      syncSliders();
      buildCamerasFromState(true);
      scheduleRecompute();
    });
    document.getElementById("sl-bldg-h").addEventListener("input", (e) => {
      state.bldgHeightScale = Number(e.target.value);
      buildBuildings();
      syncSliders();
      buildCamerasFromState(true);
      scheduleRecompute();
    });

    // Visibility Toggles & Light Transparency Sliders
    const setShowLight = (flag) => {
      state.showVisColoring = !!flag;
      syncLayerControlsUI();
      applyLightOpacity();
    };
    const setLightOpacityPct = (pct) => {
      state.lightOpacity = Math.max(0, Math.min(1, Number(pct) / 100));
      syncLayerControlsUI();
      applyLightOpacity();
    };

    document.getElementById("chk-vis").addEventListener("change", (e) => setShowLight(e.target.checked));
    document.getElementById("chk-layer-light").addEventListener("change", (e) => setShowLight(e.target.checked));
    document.getElementById("sl-layer-light-op").addEventListener("input", (e) => setLightOpacityPct(e.target.value));

    const bindPanelToggle = (btnId, panelId) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.addEventListener("click", () => {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        const isMin = panel.classList.toggle("minimized");
        btn.textContent = isMin ? "+" : "−";
      });
    };
    bindPanelToggle("btn-toggle-layers", "panel-layers");
    bindPanelToggle("btn-toggle-input", "panel-input");
    setupEditableSliderValues();

    document.getElementById("chk-fp").addEventListener("change", (e) => {
      state.showFootprints = e.target.checked;
      renderFlightSceneObjects();
    });
    document.getElementById("chk-frustum").addEventListener("change", (e) => {
      state.showFrustums = e.target.checked;
      renderFlightSceneObjects();
    });

    document.getElementById("btn-all-on").addEventListener("click", () => {
      state.cameras.forEach((c) => { c.active = true; c.showFootprint = true; });
      if (state.selectedCamIndex < 0 && state.cameras.length > 0) state.selectedCamIndex = 0;
      state.showVisColoring = true;
      state.showFootprints = true;
      state.showFrustums = true;
      document.getElementById("chk-fp").checked = true;
      document.getElementById("chk-frustum").checked = true;
      syncLayerControlsUI();
      renderFlightSceneObjects(); renderCameraList(false); evaluateVisibility();
    });
    document.getElementById("btn-all-off").addEventListener("click", () => {
      state.cameras.forEach((c) => { c.active = false; c.showFootprint = false; });
      state.selectedCamIndex = -1;
      renderFlightSceneObjects(); renderCameraList(false); evaluateVisibility();
    });

    const walk = (delta) => {
      if (!state.cameras.length) return;
      const baseIdx = state.selectedCamIndex < 0 ? 0 : state.selectedCamIndex;
      state.selectedCamIndex = (baseIdx + delta + state.cameras.length) % state.cameras.length;
      state.cameras.forEach((c, i) => {
        c.active = i === state.selectedCamIndex;
        c.showFootprint = i === state.selectedCamIndex;
      });
      state.showVisColoring = true;
      state.showFootprints = true;
      state.showFrustums = true;
      document.getElementById("chk-fp").checked = true;
      document.getElementById("chk-frustum").checked = true;
      syncLayerControlsUI();
      renderFlightSceneObjects(); renderCameraList(true); evaluateVisibility();
    };
    document.getElementById("btn-prev").addEventListener("click", () => walk(-1));
    document.getElementById("btn-next").addEventListener("click", () => walk(+1));
    document.getElementById("btn-clear-ray").addEventListener("click", clearInspectedRays);
  }

  const EDITABLE_SLIDER_MAP = {
    "val-height": "sl-height",
    "val-forelap": "sl-forelap",
    "val-sidelap": "sl-sidelap",
    "val-line-dist": "sl-line-dist",
    "val-focal": "sl-focal",
    "val-heading": "sl-heading",
    "val-fov-cross": "sl-fov-cross",
    "val-fov-along": "sl-fov-along",
    "val-sensor-cross": "sl-sensor-cross",
    "val-sensor-along": "sl-sensor-along",
    "val-pixel-um": "sl-pixel-um",
    "val-omega": "sl-omega",
    "val-phi": "sl-phi",
    "val-dtm-amp": "sl-dtm-amp",
    "val-bldg-h": "sl-bldg-h",
    "val-layer-light-op": "sl-layer-light-op",
  };

  function setSliderValueByValId(valId, numVal) {
    const sliderId = EDITABLE_SLIDER_MAP[valId];
    if (!sliderId || !Number.isFinite(numVal)) return false;
    const slider = document.getElementById(sliderId);
    if (!slider) return false;

    const minV = Number(slider.min);
    const maxV = Number(slider.max);
    if (Number.isFinite(minV) && numVal < minV) slider.min = String(numVal);
    if (Number.isFinite(maxV) && numVal > maxV) slider.max = String(numVal);
    const st = Number(slider.step);
    const base = Number.isFinite(minV) ? minV : 0;
    if (Number.isFinite(st) && st > 0 && Math.abs(((numVal - base) / st) % 1) > 1e-4) {
      slider.step = "any";
    }

    slider.value = String(numVal);
    if (typeof Event === "function" && typeof slider.dispatchEvent === "function") {
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (typeof slider.trigger === "function") {
      slider.trigger("input");
    }
    return true;
  }

  function setupEditableSliderValues() {
    Object.keys(EDITABLE_SLIDER_MAP).forEach((valId) => {
      const valEl = document.getElementById(valId);
      const sliderId = EDITABLE_SLIDER_MAP[valId];
      const slider = document.getElementById(sliderId);
      if (!valEl || !slider) return;
      valEl.title = "Click to type exact value";

      valEl.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (valEl.style.display === "none") return;

        const curNum = parseFloat(slider.value);
        const inp = document.createElement("input");
        inp.type = "number";
        inp.step = "any";
        inp.className = "inline-num-input";
        inp.value = Number.isFinite(curNum) ? String(curNum) : "";

        const parent = valEl.parentNode;
        valEl.style.display = "none";
        if (parent) parent.insertBefore(inp, valEl.nextSibling || null);
        if (typeof inp.focus === "function") inp.focus();
        if (typeof inp.select === "function") inp.select();

        let finished = false;
        const finish = (apply) => {
          if (finished) return;
          finished = true;
          const parsed = parseFloat(inp.value);
          if (inp.parentNode) inp.parentNode.removeChild(inp);
          valEl.style.display = "";
          if (apply && Number.isFinite(parsed)) {
            setSliderValueByValId(valId, parsed);
          }
        };

        inp.addEventListener("keydown", (ke) => {
          if (ke.key === "Enter") {
            ke.preventDefault();
            finish(true);
          } else if (ke.key === "Escape") {
            ke.preventDefault();
            finish(false);
          }
        });
        inp.addEventListener("blur", () => finish(true));
      });
    });
  }

  function onWindowResize() {
    const c = document.getElementById("canvas-container");
    if (!c) return;
    camera.aspect = c.clientWidth / c.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(c.clientWidth, c.clientHeight);
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  initThree();
  applyTheme(state.theme);
  bindControls();
  applyAoi("poly1", false);
  animate();

  window.__TRUE_ORTHO_API__ = {
    state,
    CAMERA_MODELS,
    applyAoi,
    applyPreset,
    updateBaseMapTexture,
    evaluateVisibility,
    applyLightOpacity,
    updateHoverCoordinateUI,
    setSliderValueByValId,
    getFovCrossDeg,
    getFovAlongDeg,
    getSceneInspect: () => ({ dtmMesh, dtmLightOverlayMesh, dtmContourLines, buildingsGroup, baseMapTexture, baseMapCanvas }),
    loadTerrainUpload,
    loadBuildingsUpload,
    loadFlightUpload,
    parseAsciiGridText,
    parseGeoJsonBuildings,
    parseFlightCsv,
    parseShpBuffer,
    parseDbfBuffer,
  };
})();
