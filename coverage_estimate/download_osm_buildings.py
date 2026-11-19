"""Download OSM building footprints for one AOI polygon to a GeoPackage.

OSMnx queries Overpass, subdividing large polygons. This downloads footprints
and existing OSM tags only; DSM-based building heights are a separate step.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

# A QGIS Python venv may inherit GDAL but not its PROJ_DATA setting.
_data_dirs = []
try:
    from osgeo import osr
    _data_dirs.extend(Path(path) for path in osr.GetPROJSearchPaths())
except ImportError:
    pass
_data_dirs.extend(parent / "share" / "proj" for parent in Path(sys.executable).resolve().parents)
for _proj in _data_dirs:
    if (_proj / "proj.db").is_file():
        os.environ.setdefault("PROJ_DATA", str(_proj))
        break

import geopandas as gpd
import pandas as pd
from shapely.geometry import Polygon, MultiPolygon


def _select_aoi(path: str | Path, field: str, value: str) -> tuple[object, object]:
    frame = gpd.read_file(path)
    if frame.crs is None:
        raise ValueError(f"AOI file has no CRS: {path}")
    if field not in frame.columns:
        raise ValueError(f"AOI file has no field {field!r}")
    selected = frame[frame[field].astype(str).str.strip() == value]
    if len(selected) != 1:
        raise ValueError(f"Expected one {field}={value} polygon; found {len(selected)}")
    geometry = selected.geometry.iloc[0]
    if geometry is None or geometry.is_empty or not isinstance(geometry, (Polygon, MultiPolygon)):
        raise ValueError(f"{field}={value} is not a nonempty polygon")
    return selected, geometry


def download_buildings(aoi_path: str | Path, sublot: str, output: str | Path,
                       field: str = "Sub-Lots", max_query_area_km2: float = 100,
                       overwrite: bool = False, query=None) -> dict:
    """Fetch OSM building polygons and save a clipped, ID-preserving GeoPackage.

    The injectable query is for offline tests; normal use calls OSMnx/Overpass.
    """
    if max_query_area_km2 <= 0:
        raise ValueError("max_query_area_km2 must be positive")
    aoi_path, output = Path(aoi_path), Path(output)
    if not aoi_path.is_file():
        raise FileNotFoundError(aoi_path)
    if output.exists() and not overwrite:
        raise FileExistsError(f"Output exists: {output}; use --overwrite to replace it")
    selected, geometry = _select_aoi(aoi_path, field, sublot)
    query_polygon = selected.to_crs(4326).geometry.iloc[0]
    if query is None:
        try:
            import osmnx as ox
        except ImportError as exc:
            raise RuntimeError("OSMnx is required: install it with 'pip install osmnx' "
                               "or 'conda install -c conda-forge osmnx'") from exc
        ox.settings.max_query_area_size = max_query_area_km2 * 1_000_000
        ox.settings.use_cache = True
        ox.settings.cache_folder = str(output.parent / "osmnx_cache")
        query = lambda polygon: ox.features_from_polygon(polygon, {"building": True})
    print(f"Querying OSM buildings for {field}={sublot}; large queries may take time", flush=True)
    raw = query(query_polygon)
    if raw.empty:
        raise ValueError(f"OSM returned no building features for {field}={sublot}")
    if not isinstance(raw.index, pd.MultiIndex) or raw.index.nlevels != 2:
        raise ValueError("Expected OSMnx features indexed by (element type, OSM ID)")
    buildings = raw[raw.geometry.geom_type.isin(["Polygon", "MultiPolygon"])].copy()
    if buildings.empty:
        raise ValueError("OSM returned no polygon building features")
    buildings["osm_type"] = buildings.index.get_level_values(0).astype(str)
    buildings["osm_id"] = buildings.index.get_level_values(1).astype(str)
    buildings = buildings.reset_index(drop=True)
    # Keep the OSM attributes relevant to later height estimation. Missing
    # values stay empty; they are not substituted with invented heights.
    for column in ("building", "height", "building:levels", "roof:height"):
        if column not in buildings:
            buildings[column] = None
    buildings = buildings[["osm_type", "osm_id", "building", "height",
                           "building:levels", "roof:height", "geometry"]]
    buildings = buildings.rename(columns={"building:levels": "building_levels",
                                  "roof:height": "roof_height"})
    buildings = buildings.to_crs(selected.crs)
    buildings.geometry = buildings.geometry.intersection(geometry)
    buildings = buildings[~buildings.geometry.is_empty &
                          buildings.geometry.geom_type.isin(["Polygon", "MultiPolygon"])].copy()
    buildings = buildings.drop_duplicates(subset=["osm_type", "osm_id"])
    if buildings.empty:
        raise ValueError("OSM buildings did not intersect the selected AOI")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.stem + ".partial.gpkg")
    if temporary.exists():
        raise FileExistsError(f"Temporary output exists from an earlier run: {temporary}")
    try:
        buildings.to_file(temporary, layer="buildings", driver="GPKG", index=False)
        temporary.replace(output)
    finally:
        if temporary.exists():
            temporary.unlink()
    summary = {
        "source": "OpenStreetMap via OSMnx/Overpass",
        "downloaded_utc": datetime.now(timezone.utc).isoformat(),
        "aoi_file": str(aoi_path.resolve()), "aoi_field": field,
        "sublot": sublot, "query_tag": "building=*",
        "max_query_area_km2": max_query_area_km2,
        "raw_features": len(raw), "clipped_buildings": len(buildings),
        "with_osm_height_tag": int(buildings["height"].notna().sum()),
        "with_osm_levels_tag": int(buildings["building_levels"].notna().sum()),
        "crs": str(buildings.crs), "output": str(output.resolve()),
        "note": "These are 2D footprints. DSM-derived heights and 3D buildings are not calculated here.",
    }
    summary_path = output.with_suffix(".summary.json")
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Saved {len(buildings):,} building footprints: {output}", flush=True)
    return summary


def main(argv=None) -> int:
    project = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aoi", default=str(project / "data" / "AOI_three_lots" /
                        "Revised_Lot_01_Splitted.shp"), help="Polygon vector file")
    parser.add_argument("--field", default="Sub-Lots", help="Polygon ID field (default: Sub-Lots)")
    parser.add_argument("--sublot", default="01C", help="Polygon ID value (default: 01C)")
    parser.add_argument("--output", default=str(project / "data" / "osm_buildings_01C.gpkg"),
                        help="Output GeoPackage")
    parser.add_argument("--max-query-area-km2", type=float, default=100,
                        help="Maximum Overpass subquery area in square kilometres")
    parser.add_argument("--overwrite", action="store_true", help="Replace an existing GeoPackage")
    args = parser.parse_args(argv)
    try:
        download_buildings(args.aoi, args.sublot, args.output, args.field,
                           args.max_query_area_km2, args.overwrite)
    except Exception as exc:
        parser.exit(1, f"ERROR: {exc}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
