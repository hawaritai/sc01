"""Attribute OSM footprints with Google/GEM-15 height and DTM ground elevation.

The output polygon plus base_z_m and roof_z_m represents a vertical building
prism. It is an inspectable 2.5D model, not a detailed roof mesh.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import sys

from osgeo import gdal, osr
for _candidate in osr.GetPROJSearchPaths():
    if (Path(_candidate) / "proj.db").is_file():
        os.environ.setdefault("PROJ_DATA", _candidate)
        break

import geopandas as gpd
import numpy as np
from pyproj import Transformer
from shapely import contains_xy
from shapely.affinity import translate
from shapely.geometry import box
from shapely.ops import transform

gdal.UseExceptions()


@dataclass
class HeightTile:
    path: Path
    dataset: object
    bounds: object
    source_bounds: object
    to_tile: object


def _tiles(folder: Path, source_crs) -> list[HeightTile]:
    result = []
    for path in sorted(folder.glob("*.tif")):
        dataset = gdal.Open(str(path))
        if dataset is None or dataset.RasterCount < 3:
            raise ValueError(f"Not a three-band Open Buildings raster: {path}")
        names = [dataset.GetRasterBand(i).GetDescription() for i in (1, 2, 3)]
        if names[1:] != ["building_height", "building_presence"]:
            raise ValueError(f"Unexpected height/presence bands in {path}: {names}")
        gt = dataset.GetGeoTransform()
        if gt[1] <= 0 or gt[5] >= 0 or gt[2] or gt[4]:
            raise ValueError(f"Height raster must be north-up: {path}")
        crs = dataset.GetProjection()
        if not crs:
            raise ValueError(f"Height raster has no CRS: {path}")
        bounds = box(gt[0], gt[3] + dataset.RasterYSize * gt[5],
                     gt[0] + dataset.RasterXSize * gt[1], gt[3])
        to_source = Transformer.from_crs(crs, source_crs, always_xy=True).transform
        result.append(HeightTile(path, dataset, bounds, transform(to_source, bounds),
                                 Transformer.from_crs(source_crs, crs, always_xy=True).transform))
    if not result:
        raise FileNotFoundError(f"No .tif height tiles in {folder}")
    return result


def _height_samples(footprint, tiles: list[HeightTile], threshold: float) -> dict:
    inside_count = valid_count = support_count = 0
    inside_area = support_area = 0.0
    heights = []
    presences = []
    for tile in tiles:
        if not footprint.intersects(tile.source_bounds):
            continue
        polygon = transform(tile.to_tile, footprint)
        if not polygon.intersects(tile.bounds):
            continue
        ds = tile.dataset
        gt = ds.GetGeoTransform()
        xmin, ymin, xmax, ymax = polygon.bounds
        x0 = max(0, math.floor((xmin - gt[0]) / gt[1]))
        x1 = min(ds.RasterXSize, math.ceil((xmax - gt[0]) / gt[1]))
        y0 = max(0, math.floor((gt[3] - ymax) / -gt[5]))
        y1 = min(ds.RasterYSize, math.ceil((gt[3] - ymin) / -gt[5]))
        if x1 <= x0 or y1 <= y0:
            continue
        width, height = x1 - x0, y1 - y0
        stride = max(1, math.ceil(max(width, height) / 512))
        cols = np.arange(0, width, stride)
        rows = np.arange(0, height, stride)
        xx = gt[0] + (x0 + cols + 0.5) * gt[1]
        yy = gt[3] + (y0 + rows + 0.5) * gt[5]
        inside = contains_xy(polygon, xx[None, :], yy[:, None])
        if not inside.any():
            continue
        hband, pband = ds.GetRasterBand(2), ds.GetRasterBand(3)
        h = hband.ReadAsArray(x0, y0, width, height)[::stride, ::stride]
        p = pband.ReadAsArray(x0, y0, width, height)[::stride, ::stride]
        good = inside & np.isfinite(h) & np.isfinite(p)
        for band, values in ((hband, h), (pband, p)):
            nodata = band.GetNoDataValue()
            if nodata is not None:
                good &= values != nodata
        inside_count += int(inside.sum())
        valid_count += int(good.sum())
        selected = good & (p >= threshold) & (h > 0) & (h <= 100)
        support_count += int(selected.sum())
        sampled_area = abs(gt[1] * gt[5]) * stride * stride
        inside_area += int(inside.sum()) * sampled_area
        support_area += int(selected.sum()) * sampled_area
        if selected.any():
            heights.append(h[selected])
            presences.append(p[selected])
    result = {"height_inside_pixels": inside_count, "height_valid_pixels": valid_count,
              "height_support_pixels": support_count,
              "height_support_area_m2": support_area,
              "height_support_fraction": support_area / inside_area if inside_area else 0.0,
              "height_m": np.nan,
              "height_p10_m": np.nan, "height_p90_m": np.nan,
              "presence_median": np.nan}
    if heights:
        values = np.concatenate(heights)
        result.update({"height_m": float(np.median(values)),
                       "height_p10_m": float(np.percentile(values, 10)),
                       "height_p90_m": float(np.percentile(values, 90)),
                       "presence_median": float(np.median(np.concatenate(presences)))})
    return result


def _surface_samples(footprint, dsm, dtm) -> dict:
    """Sample co-registered elevations inside a building footprint.

    A representative-point cell is used when a small polygon contains no
    15 m pixel centre. DSM-derived heights remain coarse for such buildings.
    """
    result = {"base_z_m": np.nan, "ground_samples": 0,
              "dsm_height_m": np.nan, "dsm_height_samples": 0}
    gt = dtm.GetGeoTransform()
    xmin, ymin, xmax, ymax = footprint.bounds
    x0 = max(0, math.floor((xmin - gt[0]) / gt[1]))
    x1 = min(dtm.RasterXSize, math.ceil((xmax - gt[0]) / gt[1]))
    y0 = max(0, math.floor((gt[3] - ymax) / -gt[5]))
    y1 = min(dtm.RasterYSize, math.ceil((gt[3] - ymin) / -gt[5]))
    if x1 <= x0 or y1 <= y0:
        return result
    xx = gt[0] + (x0 + np.arange(x1-x0) + 0.5) * gt[1]
    yy = gt[3] + (y0 + np.arange(y1-y0) + 0.5) * gt[5]
    inside = contains_xy(footprint, xx[None, :], yy[:, None])
    if not inside.any():
        point = footprint.representative_point()
        col = math.floor((point.x - gt[0]) / gt[1]) - x0
        row = math.floor((gt[3] - point.y) / -gt[5]) - y0
        if 0 <= row < y1-y0 and 0 <= col < x1-x0:
            inside[row, col] = True
    if not inside.any():
        return result
    ground_band = dtm.GetRasterBand(1)
    ground = ground_band.ReadAsArray(x0, y0, x1-x0, y1-y0)
    valid_ground = inside & np.isfinite(ground)
    ground_nodata = ground_band.GetNoDataValue()
    if ground_nodata is not None:
        valid_ground &= ground != ground_nodata
    if valid_ground.any():
        result["base_z_m"] = float(np.median(ground[valid_ground]))
        result["ground_samples"] = int(valid_ground.sum())
    surface_band = dsm.GetRasterBand(1)
    surface = surface_band.ReadAsArray(x0, y0, x1-x0, y1-y0)
    valid_surface = valid_ground & np.isfinite(surface)
    surface_nodata = surface_band.GetNoDataValue()
    if surface_nodata is not None:
        valid_surface &= surface != surface_nodata
    heights = surface - ground
    valid_surface &= (heights >= 1) & (heights <= 100)
    if valid_surface.any():
        result["dsm_height_m"] = float(np.median(heights[valid_surface]))
        result["dsm_height_samples"] = int(valid_surface.sum())
    return result


def build_model(osm_path: str | Path, height_dir: str | Path, dsm_path: str | Path,
                output_path: str | Path, presence_threshold: float = 0.5,
                min_support_area_m2: float = 16.0,
                overwrite: bool = False, progress=print,
                offset_east_m: float = 0.0, offset_north_m: float = 0.0,
                dtm_path: str | Path | None = None) -> dict:
    if not 0 < presence_threshold <= 1:
        raise ValueError("presence_threshold must be in (0, 1]")
    if min_support_area_m2 < 0:
        raise ValueError("min_support_area_m2 cannot be negative")
    if not all(math.isfinite(value) for value in (offset_east_m, offset_north_m)):
        raise ValueError("Building offsets must be finite metres")
    osm_path, height_dir, dsm_path, output_path = map(Path,
        (osm_path, height_dir, dsm_path, output_path))
    if dtm_path is None:
        raise ValueError("A co-registered GEM-15 DTM is required; pass dtm_path")
    dtm_path = Path(dtm_path)
    if output_path.exists() and not overwrite:
        raise FileExistsError(f"Output exists: {output_path}; use --overwrite")
    buildings = gpd.read_file(osm_path)
    if buildings.empty or buildings.crs is None:
        raise ValueError("OSM building layer is empty or lacks a CRS")
    if not {"osm_type", "osm_id"} <= set(buildings.columns):
        raise ValueError("OSM layer needs osm_type and osm_id fields")
    if not buildings.geometry.geom_type.isin(["Polygon", "MultiPolygon"]).all():
        raise ValueError("OSM layer contains non-polygon geometry")
    if offset_east_m or offset_north_m:
        axes = buildings.crs.axis_info
        if (not buildings.crs.is_projected or len(axes) < 2 or
                abs(axes[0].unit_conversion_factor - 1) > 1e-8 or
                abs(axes[1].unit_conversion_factor - 1) > 1e-8 or
                axes[0].direction != "east" or axes[1].direction != "north"):
            raise ValueError("Offsets need a projected metre CRS with east/north X/Y axes")
        buildings.geometry = buildings.geometry.apply(
            lambda geom: translate(geom, xoff=offset_east_m, yoff=offset_north_m))
    buildings["offset_east_m"] = offset_east_m
    buildings["offset_north_m"] = offset_north_m
    tiles = _tiles(height_dir, buildings.crs)
    dsm = gdal.Open(str(dsm_path))
    if dsm is None or not dsm.GetProjection():
        raise ValueError(f"Cannot open projected DSM: {dsm_path}")
    dtm = gdal.Open(str(dtm_path))
    if dtm is None or not dtm.GetProjection():
        raise ValueError(f"Cannot open projected DTM: {dtm_path}")
    gt = dsm.GetGeoTransform()
    if gt[1] <= 0 or gt[5] >= 0 or gt[2] or gt[4]:
        raise ValueError("DSM must be north-up")
    if (dsm.RasterXSize != dtm.RasterXSize or dsm.RasterYSize != dtm.RasterYSize
            or any(abs(a - b) > 1e-6 for a, b in zip(gt, dtm.GetGeoTransform()))
            or not bool(osr.SpatialReference(wkt=dsm.GetProjection()).IsSame(
                osr.SpatialReference(wkt=dtm.GetProjection())))):
        raise ValueError("DSM and DTM must have the same CRS, dimensions, and grid")
    dsm_transform = Transformer.from_crs(buildings.crs, dsm.GetProjection(), always_xy=True).transform
    dsm_geoms = [transform(dsm_transform, geom) for geom in buildings.geometry]
    output_rows = []
    for i, (geom, ground_geom) in enumerate(zip(buildings.geometry, dsm_geoms), 1):
        row = _height_samples(geom, tiles, presence_threshold)
        row.update(_surface_samples(ground_geom, dsm, dtm))
        google_height = math.isfinite(row["height_m"])
        if not google_height and math.isfinite(row["dsm_height_m"]):
            row["height_m"] = row["dsm_height_m"]
        base = row["base_z_m"]
        row["height_source"] = ("google_open_buildings_2023" if google_height else
                                "gem15_dsm_minus_dtm" if math.isfinite(row["height_m"]) else "none")
        row["ground_source"] = "gem15_dtm" if math.isfinite(base) else "none"
        row["roof_z_m"] = (base + row["height_m"] if
                           math.isfinite(base) and math.isfinite(row["height_m"]) else np.nan)
        row["model_status"] = ("missing_height" if not math.isfinite(row["height_m"]) else
                               "missing_ground" if not math.isfinite(base) else
                               "dsm_fallback" if not google_height else
                               "low_support" if row["height_support_area_m2"] < min_support_area_m2
                               or row["height_support_fraction"] < 0.1 else "ready")
        output_rows.append(row)
        if i % 500 == 0 or i == len(buildings):
            progress(f"Attributed {i:,}/{len(buildings):,} buildings")
    for column in output_rows[0]:
        buildings[column] = [row[column] for row in output_rows]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_name(output_path.stem + ".partial.gpkg")
    if temporary.exists():
        raise FileExistsError(f"Temporary output exists: {temporary}")
    try:
        buildings.to_file(temporary, layer="building_prisms", driver="GPKG", index=False)
        temporary.replace(output_path)
    finally:
        if temporary.exists():
            temporary.unlink()
    status = buildings["model_status"].value_counts().to_dict()
    summary = {"osm": str(osm_path), "height_tiles": str(height_dir),
               "height_tile_count": len(tiles), "dsm": str(dsm_path), "dtm": str(dtm_path),
               "output": str(output_path), "buildings": len(buildings),
               "offset_east_m": offset_east_m, "offset_north_m": offset_north_m,
               "height_dataset_year": 2023,
               "presence_threshold": presence_threshold,
               "min_support_area_m2": min_support_area_m2,
               "min_support_fraction": 0.1, "model_status": status,
               "ground_estimate": "median GEM-15 DTM inside each footprint",
               "height_fallback": "median positive GEM-15 DSM minus DTM inside each footprint (1-100 m)",
               "height_source": buildings["height_source"].value_counts().to_dict(),
               "median_height_m": (float(buildings["height_m"].median()) if
                                    buildings["height_m"].notna().any() else None),
               "note": "Polygon footprints with base/roof attributes define vertical prisms. "
                       "DSM fallback is coarse at 15 m and may contain vegetation; "
                       "inspect model_status and height_source before ray tracing."}
    output_path.with_suffix(".summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--osm", default=str(root / "data" / "osm_buildings_01C.gpkg"))
    parser.add_argument("--height-dir", default=str(root / "data" / "L1_open_building"))
    parser.add_argument("--dsm", default=str(root / "data" / "gem15" / "GEM15_01C_DSM.tif"))
    parser.add_argument("--dtm", default=str(root / "data" / "gem15" / "GEM15_01C_DTM.tif"))
    parser.add_argument("--output", default=str(root / "data" / "osm_buildings_01C_3d.gpkg"))
    parser.add_argument("--presence-threshold", type=float, default=0.5)
    parser.add_argument("--min-support-area-m2", type=float, default=16.0)
    parser.add_argument("--offset-east-m", type=float, default=-3.0,
                        help="Shift footprints east in projected metres; negative moves west")
    parser.add_argument("--offset-north-m", type=float, default=5.0,
                        help="Shift footprints north in projected metres; negative moves south")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(argv)
    try:
        summary = build_model(args.osm, args.height_dir, args.dsm, args.output,
                              args.presence_threshold, args.min_support_area_m2,
                              args.overwrite, offset_east_m=args.offset_east_m,
                              offset_north_m=args.offset_north_m, dtm_path=args.dtm)
    except Exception as exc:
        parser.exit(1, f"ERROR: {exc}\n")
    print(json.dumps(summary["model_status"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
