# Code and data overview

True Ortho 3D is a static browser simulator. It builds a Three.js terrain and camera scene, then estimates which ground, roof, and wall samples each camera can see. There is no application backend or build step. `start_server.bat` (Windows) or `start_server.sh` (macOS/Linux) serves the files locally; `static_server.js` is the Node.js server used by the Windows launcher when Python is unavailable.

## Where things live

| Path | Role |
| --- | --- |
| `index.html`, `styles.css` | Controls, status panels, and viewer layout. |
| `app.js` | Browser state, file parsers, 3D scene, flight geometry, visibility calculation, and UI events. Functions are grouped into numbered sections. |
| `lot01_aoi_data.js` | Precomputed data loaded at startup through `window.LOT01_AOI_DATA`. |
| `vendor/` | Bundled Three.js, OrbitControls, and GeoTIFF parser. No npm install is needed. |
| `extract_lot01_aoi.py` | Generates the 01I/01C sublot data and sample uploads from the original Lot 01 shapefiles. |
| `build_gem15_aois.js` | Generates the `poly1`/`poly2` data from GEM15 rasters, Lot 01 camera records, and OSM buildings; updates `lot01_aoi_data.js`. |
| `data/`, `sample_uploads/` | Local raw/reference data and example upload files. Both directories are excluded by `.gitignore`. |

## Data used by the viewer

At startup, `app.js` reads `lot01_aoi_data.js` and selects `poly1`. The baked file contains four selectable areas: `poly1` and `poly2` each have 81 × 81 DTM and DSM grids, OSM-derived building polygons (345 and 420), and flight cameras (105 and 49); sublots `01I` and `01C` each have an 81 × 81 DTM grid and flight cameras (28 and 115). The 01I skyline also uses buildings defined in `app.js` for the demo scene.

The raw GEM15 GeoTIFFs, GeoPackages, and building GeoJSONs under `data/` are **not fetched during normal startup**. Editing those files does not update a built-in area until the baked JS is regenerated. Users can also upload terrain (GeoTIFF, ASC, XYZ/CSV), building footprints (GeoJSON, SHP/DBF, CSV), flight plans (CSV, SHP/DBF, GeoJSON, KML), or a map image through the UI. These uploads live in browser memory for the current session.

The base-map texture is separate from the elevation data. The default map mode requests online image tiles (Google, Esri, or OSM, depending on the selected mode); the app draws a procedural underlay while tiles load or if they fail. Live **Fetch OSM** also needs internet. The terrain and visibility simulation can use the baked data without those services.

## Main processing path in `app.js`

1. **Coordinates and terrain:** Input coordinates are converted to the scene's local meter frame (`X = east`, `Z = -north`, `Y = elevation`). Baked or uploaded elevation grids are bilinearly sampled onto a 101 × 101 terrain mesh; surface normals are estimated from neighboring heights.
2. **Buildings:** Polygon or rectangular footprints are cleaned, triangulated, and extruded. For an uploaded DSM paired with a DTM, `DSM - DTM` can supply building heights.
3. **Cameras and footprints:** A camera can use baked/uploaded stations or a parametric flight pattern. Sensor dimensions, focal length, heading, roll, pitch, and yaw define its view basis and frustum. Rays from the camera through the image corners are intersected with terrain to draw the footprint.
4. **Visibility:** Each active camera is tested against terrain vertices and building roof/wall patches. The test checks surface facing and camera frustum, then looks for building intersections and terrain blocking. A spatial grid reduces building candidates; terrain blocking uses sampled points along the ray. The result drives coverage colors, area totals, and the sight-ray inspector. This is a sampled simulation rather than orthophoto image production.
5. **Display and interaction:** Three.js WebGL renders the scene, OrbitControls handles orbit/pan/zoom, and UI changes rebuild or recolor the relevant geometry. The base-map tiles are drawn to a canvas and applied as a terrain texture.

`README.md` covers operation and upload formats; this file is a map of the implementation.
