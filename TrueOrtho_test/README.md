# True Ortho 3D Simulator — User Guide & Portable Deployment

Interactive Three.js 3D visibility, footprint, and flight-plan justification simulator for True Orthophoto production (**Phase One iXM-150 RGB 40mm** camera model, real Sri Lanka Lot 01 & GEM15 DSM/OSM datasets, and custom user uploads).

---

## 1. Running This Project on Another PC

All runtime libraries (`vendor/three.min.js`, `vendor/OrbitControls.js`, `vendor/geotiff.js`) and built-in Sri Lanka Lot 01 + GEM15 datasets (`lot01_aoi_data.js`) are bundled locally inside `TrueOrtho_test/`. **No internet connection, build step, or npm install is required to run it.**

### Option A — Windows One-Click Launcher (Recommended)
1. Extract the portable `.zip` archive on the target PC.
2. Open the extracted folder and double-click **`start_server.bat`**.
3. It automatically starts a local HTTP server on `http://localhost:8090` (using Python or Node.js if installed) and opens the simulator in your browser.
4. If neither Python nor Node.js is installed, `start_server.bat` opens `index.html` directly in your browser.

### Option B — macOS / Linux Launcher
```bash
chmod +x start_server.sh
./start_server.sh
```
This launches a local server on `http://localhost:8090` using `python3`, `python`, or `node`.

### Option C — Zero-Install Direct Open
Double-click **`index.html`** directly in Chrome, Edge, or Firefox. Because all scripts are loaded via relative `<script>` tags with no CORS-blocked `fetch()` calls on startup, built-in AOIs and file uploads (`Upload DTM`, `Upload DSM`, `Upload Buildings`, `Upload Flight`) work offline even from `file://`.
*(Internet access is only needed when clicking **Fetch OSM** to download live OpenStreetMap buildings.)*

---

## 2. Camera Model (Phase One iXM-RS150F), Optics & Visualization Controls

* **Supported Camera / Lens Presets (`CAMERA_MODELS` & `Camera (iXM-RS150F) & Flight Controls`):**
  * **iXM-RS150F 40mm** *(default)*: `40 mm` focal length, `53.407 × 40.051 mm` sensor (`14,204 × 10,652 px`, `3.76 µm`), FOV **67.5° (Long) × 53.2° (Short)**, Entrance pupil `94.1 mm` (`14.1 cm` GSD and `1502 × 2003 m` swath at `1,500 m AGL`).
  * **iXM-RS150F 50mm**: `50 mm` focal length, `53.407 × 40.051 mm` sensor (`14,204 × 10,652 px`, `3.76 µm`), FOV **56.2° (Long) × 43.7° (Short)**, Entrance pupil `99.3 mm` (`11.3 cm` GSD and `1202 × 1602 m` swath at `1,500 m AGL`).
  * **Custom & Interactive Optical Sliders**: Directly adjust **Focal Length (`mm`)**, **FOV Long / Cross (`°`)**, **FOV Short / Along (`°`)**, **Sensor Cross (`mm`)**, **Sensor Along (`mm`)**, **Pixel Pitch (`µm`)**, and click **`Swap 90°`** to rotate the sensor between Cross-Track and Along-Track orientation.
* **Base Map Wrapped on 3D DSM / DTM**:
  * Use the **Base Map** dropdown in the top card to drape **Satellite Imagery (Esri)**, **Satellite + Roads Hybrid**, **OpenStreetMap Streets**, **Topographic Map**, **None (Elevation Tint)**, or a **Custom Map Image** (via **`Upload Map`**, supporting `.jpg`, `.png`, `.webp`) directly onto the 3D terrain / DSM surface.
* **Light Transparency / Opacity Slider (`Cameras & Visibility` right panel)**:
  * Drag **`Light Opacity (Red / Green)`** (`0%`–`100%`, default `70%`) to blend the Red/Green coverage light cleanly over the Base Map and 3D buildings (`0%` reveals pure underlying imagery/DSM; `100%` shows solid opaque visibility light).
* **Automatic Coordinate Reference System (CRS) Detection (`detectCrsAndToWorld`):**
  * **WGS84 Geographic (`lon`, `lat`)**: When `|X| <= 180` and `|Y| <= 90`, coordinates are automatically projected to `EPSG:3857` meters.
  * **Local Meter Grid**: When `|X| < 25,000` and `|Y| < 25,000`, coordinates are treated as local meters centered near `(0, 0)`.
  * **Projected Meters (e.g., `EPSG:3857` Web Mercator, UTM)**: Any larger meter coordinates are mapped relative to the active scene origin (`state.originEpsg3857`), auto-realigning whenever uploaded data is more than `4,500 m` away from the current origin.

> **Tip:** Make sure your DTM/DSM, Buildings, and Flight Plan for the same custom AOI use compatible horizontal coordinates (for example, all in **WGS84** or all in **`EPSG:3857`** / consistent local meters).

---

## 3. How to Add DSM & DTM Data

In the left panel under **Real Data & Uploads**:
1. Click **`Upload DTM`** to load a bare-earth Digital Terrain Model (terrain elevation MSL in meters).
2. Click **`Upload DSM`** to load a Digital Surface Model (terrain + buildings + canopy elevation MSL in meters).
3. You can also toggle between **`DTM + 3D OSM`** and **`Raw GEM15 DSM`** in the top **AOI Area & Flight Plan** card when viewing `poly1` or `poly2`.

### How DSM Helps Building Heights (`nDSM = DSM - DTM`)
When both a **DTM** (uploaded or built-in) and a custom **DSM** are loaded alongside 2D building footprints, `getActiveBuildingSpecs()` samples `nDSM = DSM - DTM` across each building's centroid and polygon vertices and automatically extrudes the 3D building using the maximum height difference (`if maxNdsm >= 2.0 m`).

### Supported Terrain Formats
1. **GeoTIFF (`.tif`, `.tiff`)** — parsed via `vendor/geotiff.js` (`parseGeoTiffBuffer`):
   * Single-band elevation raster (`Float32`, `Int16`, `UInt16`, `Float64`).
   * **Large / Regional GeoTIFF Auto-Cropping**: If a georeferenced raster spans more than `5 km × 5 km`, it automatically crops a native-resolution `2.6 km × 2.6 km` window (`halfM = 1300`) centered around the active AOI (if inside bounds) or the raster center, downsampled cleanly to at most `180 × 180` grid cells for interactive Three.js performance.
   * Try with included files: `data/GEM15_SriLanka_DSM_polygon1.tif` or `data/GEM15_SriLanka_DSM_polygon2.tif`.
2. **Esri ASCII Grid (`.asc`)** — parsed via `parseAsciiGridText`:
   * Example header (from `sample_uploads/sample_dtm.asc`):
     ```text
     ncols         81
     nrows         81
     xllcorner     9024787.20
     yllcorner     754331.00
     cellsize      30.00
     NODATA_value  -9999
     816.46 813.35 807.82 ...
     ```
   * Supports both `xllcorner`/`yllcorner` and `xllcenter`/`yllcenter`. Row 0 in `.asc` is North/Top and is converted automatically to bottom-to-top internal grid indexing.
3. **XYZ / CSV Point Elevations (`.xyz`, `.csv`, `.txt`)** — parsed via `parseXyzTerrainText`:
   * Space-, comma-, tab-, or semicolon-separated `X Y Z` numeric rows (minimum 4 points; `#` comment lines supported).
   * Interpolated via Inverse Distance Weighting (IDW) onto a `61 × 61` terrain grid.

---

## 4. How to Add OSM & Building Footprint Data

### Method A — Live OpenStreetMap Fetch (`Fetch OSM`)
1. In the **Real Data & Uploads** card, enter the center **`Lat, Lon`** in decimal degrees (for example, `6.87300, 81.34900` — automatically updated whenever a georeferenced DTM/DSM or flight plan shifts the origin).
2. Click **`Fetch OSM`**.
3. The simulator queries a `~2.2 km × 2.2 km` (`±0.010°`) bounding box from the OpenStreetMap API v0.6 (`https://api.openstreetmap.org/api/0.6/map.json`), automatically falling back to Overpass mirrors (`overpass-api.de`, `overpass.kumi.systems`, `maps.mail.ru`) if needed.
4. Up to `450` `building=*` polygons are loaded and extruded using OSM `height`, `building:levels × 3.5 m`, or `12.0 m` default (or overridden by `nDSM = DSM - DTM` when a custom DSM is active).

### Method B — Upload Building Footprints (`Upload Buildings`)
Click **`Upload Buildings`** and select one of the supported formats:

1. **GeoJSON (`.geojson`, `.json`)** — `FeatureCollection` or single `Feature` with `Polygon` or `MultiPolygon` geometries (`sample_uploads/sample_buildings_osm.geojson`, `data/AOI/polygon1_osm_buildings.geojson`, `data/AOI/polygon2_osm_buildings.geojson`):
   * Coordinates can be WGS84 `[lon, lat]`, `EPSG:3857` `[east, north]`, or local meters `[x, y]`.
   * Height property lookup order (`extractHeightFromProps`):
     `height`, `Height`, `HEIGHT`, `h`, `H`, `bldg_h`, `BLDG_H`, `ele`, `Z_MAX`, then `building:levels` / `levels` / `LEVELS` (`levels × 3.5 m`), falling back to `14.0 m` if missing.
   ```json
   {
     "type": "FeatureCollection",
     "features": [
       {
         "type": "Feature",
         "properties": { "id": "OSM-101", "name": "Central Skyline Tower", "height": 165 },
         "geometry": {
           "type": "Polygon",
           "coordinates": [[[81.08141, 6.77162], [81.08188, 6.77162], [81.08188, 6.77205], [81.08141, 6.77205], [81.08141, 6.77162]]]
         }
       }
     ]
   }
   ```
2. **Esri Shapefile (`.shp` + `.dbf`)**:
   * Hold `Ctrl` / `Shift` in the file picker to select **both `.shp` and `.dbf` together**.
   * Reads `Polygon` / `PolygonZ` geometry (`shapeType` `5` / `15`) and DBF height attributes (`extractHeightFromProps`).
3. **CSV / TXT Rectangular Building Table (`.csv`, `.txt`)**:
   * Header columns (case-insensitive substring match): `id`/`name`, `east`/`lon`/`lng`/`cx`/`x`, `north`/`lat`/`cy`/`y`, `width`/`w`, `depth`/`d`/`len`, `height`/`h`/`elev`.

---

## 5. How to Add Camera Pose (Exterior Orientation / Flight Plan) Data

### Method A — Interactive Flight & Camera Pose Controls (Parametric)
In the **Flight & Terrain • iXM-150 (40mm)** card on the left panel:
* **Camera Height (AGL)**, **Forward Overlap**, **Side Overlap**, **Flight Line Distance**, **Focal Length**, **Heading**, **Roll (`ω`)**, and **Pitch (`φ`)** generate or adjust camera stations and 3D frustum cones in real time.
* Checking **`Keep Line/Shot Distance Fixed when Height changes`** lets you test lower cloud-ceiling altitudes while keeping existing flight lines fixed.

### Method B — Upload Real Camera Stations & Exterior Orientation (`Upload Flight`)
Click **`Upload Flight`** and select one of the supported formats:

1. **CSV / TXT Exterior Orientation Table (`.csv`, `.txt`)** (`parseFlightCsv`):
   * Required horizontal columns (case-insensitive header match):
     * **X**: `East`, `Lon`, `Lng`, or `X`
     * **Y**: `North`, `Lat`, or `Y`
   * Optional pose & metadata columns:
     * **ID**: `PhotoID`, `Event`, `ID`, or `Name`
     * **Strip**: `Strip`, `Line`, or `FlightLine`
     * **Altitude (m MSL)**: `AltMSL`, `Alt`, `Z`, `Elev`, or `Height` *(if omitted or `NaN`, uses current `Height AGL` above local DTM mean)*
     * **Roll / Pitch / Yaw (degrees)**: `Omega` (`Roll`), `Phi` (`Pitch`), `Kappa` (`Yaw`, `Heading`)
   * Example (`sample_uploads/sample_flightplan_eo.csv`):
     ```csv
     PhotoID,Strip,East_EPSG3857,North_EPSG3857,AltMSL,Omega,Phi,Kappa
     L28-006,28,9024629.0,756612.3,1911.0,0.0,0.0,0.0
     L28-007,28,9024753.8,756612.3,1911.0,0.0,0.0,0.0
     ```
   * *Note on Pose Sign Convention*: Camera view direction and frustum orientation rotate dynamically with **Heading / Kappa (`κ`)**, **Roll (`ω`)**, and **Pitch (`φ`)** relative to vertical nadir (`-Y` in Three.js world space). Adjusting the Roll/Pitch sliders adds offset tilt or sets camera attitude depending on flight mode.

2. **Esri Shapefile Point / PointZ (`.shp` + `.dbf`)**:
   * Select **both `.shp` and `.dbf` together** (`shapeType` `1`, `11`, or `21`).
   * Recognized DBF fields: `EventLabel`, `FlightLine` / `Line` / `Strip`, `AltMSL[ft]` (converted automatically from feet to meters `× 0.3048` if 2D Point), `Omega`, `Phi`, `Kappa`, and `AOI`.
   * If a shapefile contains multiple `AOI` values (like `SC01_Lot01_2112_Plan_Point.shp`), a **`Sublot`** dropdown automatically appears to switch regions; if more than `140` stations exist in one AOI, a `~2.4 km` local subset (`<= 120` cameras) is windowed automatically.

3. **GeoJSON Point Features (`.geojson`, `.json`)**:
   * Reads `Point` features (`coordinates: [x, y, altMsl]`) and properties `id` / `PhotoID`, `strip` / `FlightLine`, `altMsl`, `omega`, `phi`, `kappa`.

4. **KML (`.kml`)**:
   * Parses `<Placemark><name>...</name><Point><coordinates>lon,lat,alt</coordinates></Point></Placemark>`.

> **Using Uploaded Flight Camera Poses Exactly**: When a flight file is uploaded, `state.useExactShapefile` becomes `true`, placing each camera cone at its exact `(East, North, AltMSL)` and attitude. Clicking **`Upload Flight`** or switching the **Cameras & Visibility** panel on the right lets you toggle individual cameras, strip lines, footprints, and neon camera selection (`#00f0ff` / `#39ff14`). Click **`Clear`** in **Real Data & Uploads** to revert back to the built-in preset.

---

## 6. Pre-Baking New Default AOIs Offline (`build_gem15_aois.js`)

If you want new GeoTIFF DSMs, `.gpkg` AOIs, or OSM building footprints to appear permanently inside the **AOI Area & Flight Plan** dropdown on startup (`lot01_aoi_data.js`):
1. Edit the `configs` array (`centerLat`, `centerLon`, `tifName`, `geojsonOut`, etc.) in `build_gem15_aois.js`.
2. Ensure Node.js (`v18+`) and internet access (if fetching live OSM) are available.
3. Run:
   ```bash
   node build_gem15_aois.js
   ```
   This extracts `81 × 81` DSM + eroded bare-earth DTM grids, computes `nDSM` heights for OSM buildings, saves GeoJSON copies to `data/AOI/`, and regenerates `lot01_aoi_data.js`.

---

## 7. Included Files & Sample Data

| File / Folder | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | Simulator UI, Three.js WebGL scene, ray-casting occlusion engine, file parsers |
| `lot01_aoi_data.js` | Pre-baked Sri Lanka Lot 01 Sublots (`01I`, `01C`) + GEM15 `poly1` & `poly2` AOI datasets |
| `vendor/` | Local offline bundles (`three.min.js`, `OrbitControls.js`, `geotiff.js`) |
| `start_server.bat` / `start_server.sh` | One-click local HTTP server & browser launchers (Windows / macOS / Linux) |
| `sample_uploads/` | Ready-to-test files: `sample_dtm.asc`, `sample_dsm.asc`, `sample_buildings_osm.geojson`, `sample_flightplan_eo.csv` |
| `data/AOI/` | GeoPackages & extracted OSM building GeoJSONs (`polygon1_osm_buildings.geojson`, `polygon2_osm_buildings.geojson`) |
| `data/GEM15_SriLanka_DSM_polygon*.tif` | Raw GEM15 DSM GeoTIFF rasters (included in **Portable Full** export) |
