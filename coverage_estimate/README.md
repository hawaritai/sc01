# Planned-image occlusion masks

First-version desktop tool for estimating geometric visibility of a DSM from planned nadir camera exposures. It reads the QGIS Flight Planner `*_Point.shp` and matching `*_Polygon.shp` export. It can write per-exposure masks or combine all assigned exposures into a sublot coverage raster. No photographs are needed.

Camera IO is already reflected in the flight planner's exported exposure footprints. This version uses those footprints directly and therefore does not ask for a separate IO file. A future version can regenerate footprints from calibrated IO and camera pose.

## Inputs

- **Point shapefile:** 3D exposure points with `AOI`, `FlightLine`, and `EventLabel`. Point Z is the absolute planned camera height, in metres for the supplied SC01 export.
- **Polygon shapefile:** exposure footprints with `AOI`, `Line`, `Event`, and `Details`. The app finds it beside the point shapefile automatically. Only `ReleaseByPosition` events are images; start/end events and line polygons are ignored.
- **DSM:** north-up, projected GeoTIFF in metres, with elevations in the same vertical datum and units as point Z. The camera point must lie inside valid DSM coverage.
- **Sublots:** polygon shapefile with a `Sub-Lots` field. Combined coverage clips to exactly one matching polygon and selects only plan exposures whose `AOI` equals that sublot ID.

The supplied SC01 point plan has 49,335 records, of which 48,559 are `ReleaseByPosition` image events. Sublot 01C has 11,542 assigned image exposures. The combined coverage command processes all of them by default; use `--limit` for a quick diagnostic.

## Run

Use a Python environment with `requirements.txt` installed. The default command processes every exposure assigned to sublot 01C using the local Lot 01 plan, AOI polygon and GEM15 polygon1 DSM. This is a long-running calculation:

```powershell
python main.py
```

The installed QGIS 3.40 Python also provides the required packages. On the development machine it can be launched with:

```powershell
& 'C:\Program Files\QGIS 3.40.10\apps\Python312\python.exe' main.py
```

Each default run creates a timestamped folder under `outputs`. For a quick 10-image check, use `python main.py --limit 10`; that sample will show mostly unseen area because it contains only 10 of 11,542 assigned images. Use `python main.py --gui` to open the per-exposure desktop interface. Paths are resolved from the project directory, so the command can be launched from another working directory. Override `--point`, `--sublots`, `--sublot`, `--dsm`, or `--output` as needed.

Command-line use:

```powershell
python main.py --point D:\path\Plan_Point.shp --dsm D:\path\dsm.tif --output D:\path\masks --aoi 01L --line 001 --limit 10
```

Use `--polygon` if the matching polygon file does not follow the standard name. Add `--overwrite` to replace existing masks. Omit `--line` to process multiple lines within an AOI, but keep an intentional `--limit` for the first run.

Combined coverage pilot for Lot 01, using the available 15 m GEM15 DSM:

```powershell
& 'C:\Program Files\QGIS 3.40.10\apps\Python312\python.exe' main.py `
  --point data\Lot_01\SC01_Lot01_2112_Plan_Point.shp `
  --sublots data\AOI_three_lots\Revised_Lot_01_Splitted.shp `
  --sublot 01C `
  --dsm ..\TrueOrtho_test\data\GEM15_SriLanka_DSM_polygon1.tif `
  --output outputs\01C_sample --limit 10
```

The grid uses the DSM's native resolution and alignment; it does not resample the 15 m DSM to claim finer detail. `--limit` produces a useful diagnostic but `complete` is always false. The combined result includes `coverage_count.tif` (number of cameras seeing each cell), `coverage_status.tif` (category codes with an embedded color table), `coverage_color.tif` (georeferenced RGBA image), and `summary.json`. Open `coverage_color.tif` in QGIS for immediate visualization: **red** = unseen, **green** = covered, **amber** = unknown, **transparent** = outside the sublot. Status codes are `0` outside sublot, `1` unseen, `2` covered, `3` unknown. Count values `-1` and `-2` mean outside and unknown. Unseen cells within a limited run mean unseen *by the processed images* only.

The summary reports physical area in square metres using the sublot polygon transformed to EPSG:6933. It apportions that area over rasterized AOI cells; category areas have boundary error at the 15 m grid scale. Unknown includes targets outside DSM coverage, DSM NoData and unresolved viewshed pixels. A run is marked complete only if all assigned exposures were requested, none failed, and no unknown cells remain. The footprint and ray test use only GEM15; Google Open Buildings and OSM building footprint/height data are not yet fused. Thus the result estimates visibility of the DSM's top surface, not the ground beneath buildings.

For 01C, 11 local Google Open Buildings temporal raster tiles in `data/L1_lower_right_partial` overlap the sublot bounding box. Each tile has building fractional count, building height, and building presence bands. A 300-point sample inside the 01C polygon found valid tile data at all sampled locations; this is a spot check rather than a full completeness audit. No OSM building vector data is present in this project. The building rasters are available for a later fused-surface calculation but are not used by the current command.

## Download OSM building footprints

Install the optional OSM dependency in a Python environment with GeoPandas and GDAL support:

```powershell
python -m pip install -r requirements-osm.txt
```

Then run from this project directory:

```powershell
python download_osm_buildings.py
```

By default the script reads `Sub-Lots=01C` from `data/AOI_three_lots/Revised_Lot_01_Splitted.shp`, asks OpenStreetMap/Overpass for `building=*` features, and saves `data/osm_buildings_01C.gpkg` plus `data/osm_buildings_01C.summary.json`. The GeoPackage contains clipped polygons with OSM element type/ID and any `height`, `building:levels`, or `roof:height` tags. OSMnx subdivides the large AOI into queries of at most 100 km². It caches responses in `data/osmnx_cache`, so reruns can reuse successful requests. Public Overpass servers can be busy; failed downloads produce an error rather than a partial final GeoPackage.

To use a different polygon, pass `--aoi path/to/polygons.shp --field Sub-Lots --sublot 01D --output path/to/buildings.gpkg`. The output file is protected against accidental replacement; add `--overwrite` to refresh it. These are 2D OSM footprints only; use the building-model step below to add height. OSM data is © OpenStreetMap contributors and subject to the [ODbL](https://www.openstreetmap.org/copyright).

## Build an inspectable 01C building model

With `data/osm_buildings_01C.gpkg` downloaded, run:

```powershell
python build_3d_buildings.py
```

This command reads `data/gem15/GEM15_01C_DSM.tif` and
`data/gem15/GEM15_01C_DTM.tif` by default. Use `--dsm` and `--dtm` together
for another sublot; the rasters must share one CRS and pixel grid. Add
`--overwrite` to replace an existing model.

This joins each OSM footprint to Google Open Buildings Temporal 2023 `building_height` (band 2) where `building_presence` (band 3) is at least 0.5. It takes the median of the supported height pixels inside the OSM polygon. The output `data/osm_buildings_01C_3d.gpkg` retains every footprint and adds `height_m`, supporting-pixel count/area/fraction, height 10th/90th percentiles, and `model_status`. No OSM footprint is silently dropped. The 0.5 presence threshold is provisional: Google states that its confidence values are uncalibrated. Their height has an effective 4 m resolution despite the 0.5 m pixel spacing, so the support counts are not independent observations.

The script now takes `base_z_m` from the median GEM-15 DTM elevation inside each footprint. When Google provides no valid height, it estimates `height_m` from the median positive GEM-15 DSM minus DTM difference inside that footprint (1–100 m). It uses a representative-point pixel for footprints smaller than a 15 m cell. The output records `height_source`, `ground_source`, `dsm_height_m`, and sample counts so the fallback can be inspected. `roof_z_m = base_z_m + height_m`. DSM fallback models have `model_status=dsm_fallback`; Google-derived models remain `ready` or `low_support`. Missing data remain `missing_height` or `missing_ground`. The 15 m DSM may include vegetation and cannot resolve every small roof, so fallback heights need review before ray tracing. This model is **not yet used** by `main.py` coverage calculations.

If the OSM footprints are displaced relative to the height raster, use an explicit translation. For 01C, 5 m west and 5 m north:

```powershell
python build_3d_buildings.py --offset-east-m -5 --offset-north-m 5 `
  --output data\osm_buildings_01C_3d_W5_N5.gpkg
```

East and north offsets default to -3 m and 5 m in the current command. They are applied to the footprint geometry **before** sampling Google height and GEM-15 elevations. The shifted GeoPackage records both offsets in every feature and its summary; `data/osm_buildings_01C.gpkg` remains the unshifted source. The script requires a projected east/north CRS in metres, as in the 01C EPSG:3857 file. Compare the shifted and unshifted support counts in their summaries before choosing the model for ray testing.

## Mask codes

| Value | Meaning |
| --- | --- |
| `0` | Outside this exposure's footprint |
| `1` | DSM surface visible from this camera |
| `2` | Inside footprint, occluded by a nearer DSM surface |
| `255` | Unknown: target DSM cell has NoData, or viewshed has no result |

The output folder also contains `manifest.csv` with the source point, camera height, mask path, cell counts, and any errors. Masks use the DSM's CRS and pixel grid. They can be loaded individually in QGIS and combined manually.

## Assumptions and limits

- The camera optical axis is assumed nadir. The exported footprints define candidate coverage; camera yaw is not needed for the line-of-sight test.
- This is a **2.5D** DSM viewshed. It estimates visibility of the DSM's top surface, not bare ground beneath roofs or canopy. Building edges are limited by DSM resolution and quality.
- The source point Z is already an absolute height. Do not add terrain elevation to it. The engine subtracts the DSM elevation *at the observer cell* only because GDAL's viewshed API requires an observer height relative to that surface.
- All height values must share one vertical datum. The shapefile's horizontal `.prj` does not establish that datum; confirm it before interpreting results.
- GDAL's viewshed does not fully account for input NoData along an intervening sight line. Unknown target cells are marked 255; holes elsewhere in the DSM can still make nearby visibility uncertain. Review or fill DSM holes before production use.
- The model assumes no curvature/refraction correction for these local image footprints.
- Full sublot calculation runs sequentially and may take a long time. Use `--limit` to check inputs and styling before a full run.

## Tests

```powershell
python -m unittest discover -s tests -v
```

The tests use generated shapefiles and a synthetic DSM; they do not need project data.

## Download buffered GEM-15 DSM and DTM

`download_gem15.py` reads a `Sub-Lots` polygon from the three lot shapefiles,
buffers it, selects the intersecting public GEM-15 STAC tiles, and exports a
DSM and bare-earth DTM clipped to the buffered polygon. For 01C:

```powershell
python download_gem15.py --sublot 01C --buffer-m 3000
```

The defaults are sublot `01C`, a 3000 m buffer, and output under `data/gem15/`.
The script searches all `Revised_Lot_*_Splitted.shp` files under
`data/AOI_three_lots`, so a different sublot only needs `--sublot` changed.
Use `--aoi` for a specific shapefile, `--output-dir` for another output folder,
and `--overwrite` to replace existing outputs. Python needs GDAL bindings and
network access to Google Cloud Storage. The QGIS Python installation can run
the script if a normal Python environment does not have GDAL.

Outputs are `GEM15_<ID>_DSM.tif`, `GEM15_<ID>_DTM.tif`, and
`GEM15_<ID>.json` with the selected tile IDs, URLs, buffer, and raster grid.
The two rasters share an EPSG:3857, 15 m grid. Their elevations are metres
relative to EGM96; NoData is -9999 outside the buffered area or source data.
The buffered DEMs are inputs for later ray testing and are not automatically
used by the current coverage calculation.

