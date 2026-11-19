"""Combine planned-image DSM visibility over one Sub-Lots polygon."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from osgeo import gdal, ogr, osr

from engine import (_open_vector, _transform, _validate_dsm, _value,
                    calculate_exposure, companion_polygon, load_exposures)


STATUS_COLORS = {
    0: (0, 0, 0, 0),          # Outside sublot: transparent
    1: (215, 48, 39, 255),   # Unseen: red
    2: (26, 152, 80, 255),   # Covered: green
    3: (253, 174, 97, 255),  # Unknown: amber
}


def _sublot_geometry(path: str | Path, sublot: str, target_wkt: str):
    source, layer = _open_vector(path)
    try:
        if "Sub-Lots" not in {layer.GetLayerDefn().GetFieldDefn(i).GetName()
                              for i in range(layer.GetLayerDefn().GetFieldCount())}:
            raise ValueError("AOI layer needs a Sub-Lots field")
        target = osr.SpatialReference()
        target.ImportFromWkt(target_wkt)
        transform = _transform(layer.GetSpatialRef(), target)
        matches = []
        for feature in layer:
            if _value(feature, "Sub-Lots") == sublot:
                geom = feature.GetGeometryRef().Clone()
                geom.Transform(transform)
                matches.append(geom)
        if len(matches) != 1:
            raise ValueError(f"Expected one Sub-Lots={sublot} polygon; found {len(matches)}")
        geom = matches[0]
        if geom.IsEmpty() or geom.GetArea() <= 0:
            raise ValueError(f"Empty Sub-Lots={sublot} polygon")
        return geom
    finally:
        source = None


def _rasterize_polygons(geometries, width: int, height: int, gt, wkt: str) -> np.ndarray:
    mask = gdal.GetDriverByName("MEM").Create("", width, height, 1, gdal.GDT_Byte)
    mask.SetGeoTransform(gt)
    mask.SetProjection(wkt)
    driver = ogr.GetDriverByName("MEM")
    source = driver.CreateDataSource("")
    srs = osr.SpatialReference()
    srs.ImportFromWkt(wkt)
    layer = source.CreateLayer("sublot", srs=srs, geom_type=ogr.wkbUnknown)
    for geometry in geometries:
        feature = ogr.Feature(layer.GetLayerDefn())
        feature.SetGeometry(geometry)
        layer.CreateFeature(feature)
    gdal.RasterizeLayer(mask, [1], layer, burn_values=[1])
    return mask.ReadAsArray().astype(bool)


def _rasterize_polygon(geometry, width: int, height: int, gt, wkt: str) -> np.ndarray:
    return _rasterize_polygons([geometry], width, height, gt, wkt)


def _write_raster(path: Path, array: np.ndarray, gt, wkt: str,
                  nodata: int, description: str, palette: bool = False) -> None:
    temporary = path.with_name(path.stem + ".partial.tif")
    if temporary.exists():
        temporary.unlink()
    try:
        dtype = gdal.GDT_Int32 if array.dtype == np.int32 else gdal.GDT_Byte
        output = gdal.GetDriverByName("GTiff").Create(
            str(temporary), array.shape[1], array.shape[0], 1, dtype,
            options=["TILED=YES", "COMPRESS=DEFLATE", "PREDICTOR=2"] +
                    (["PHOTOMETRIC=PALETTE"] if palette else []),
        )
        output.SetGeoTransform(gt)
        output.SetProjection(wkt)
        band = output.GetRasterBand(1)
        if palette:
            colors = gdal.ColorTable()
            for value, rgba in STATUS_COLORS.items():
                colors.SetColorEntry(value, rgba)
            band.SetRasterColorTable(colors)
            band.SetRasterColorInterpretation(gdal.GCI_PaletteIndex)
        band.WriteArray(array)
        band.SetNoDataValue(nodata)
        band.SetDescription(description)
        output.FlushCache()
        output = None
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def _write_color_raster(path: Path, status: np.ndarray, gt, wkt: str) -> None:
    """Write an immediately viewable, georeferenced RGBA GeoTIFF."""
    temporary = path.with_name(path.stem + ".partial.tif")
    if temporary.exists():
        temporary.unlink()
    try:
        output = gdal.GetDriverByName("GTiff").Create(
            str(temporary), status.shape[1], status.shape[0], 4, gdal.GDT_Byte,
            options=["TILED=YES", "COMPRESS=DEFLATE", "PHOTOMETRIC=RGB"],
        )
        output.SetGeoTransform(gt)
        output.SetProjection(wkt)
        for channel, interpretation in enumerate((gdal.GCI_RedBand, gdal.GCI_GreenBand,
                                                   gdal.GCI_BlueBand, gdal.GCI_AlphaBand)):
            values = np.zeros(status.shape, dtype=np.uint8)
            for code, rgba in STATUS_COLORS.items():
                values[status == code] = rgba[channel]
            band = output.GetRasterBand(channel + 1)
            band.WriteArray(values)
            band.SetColorInterpretation(interpretation)
        output.FlushCache()
        output = None
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def run_sublot(point_path: str | Path, dsm_path: str | Path,
               sublots_path: str | Path, sublot: str, output_dir: str | Path,
               polygon_path: str | Path | None = None, limit: int | None = None,
               max_grid_cells: int = 30_000_000,
               progress=print) -> dict:
    """Count cameras seeing each DSM cell within one sublot.

    A complete result requires limit=None, no failed exposures and DSM coverage.
    """
    output_dir = Path(output_dir)
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"Output directory is not empty: {output_dir}")
    polygon_path = polygon_path or companion_polygon(point_path)
    dataset = gdal.Open(str(dsm_path))
    if dataset is None:
        raise FileNotFoundError(f"DSM not found or unreadable: {dsm_path}")
    wkt = _validate_dsm(dataset)
    geom = _sublot_geometry(sublots_path, sublot, wkt)
    gt = dataset.GetGeoTransform()
    px, py = gt[1], -gt[5]
    xmin, xmax, ymin, ymax = geom.GetEnvelope()
    col0 = math.floor((xmin - gt[0]) / px)
    col1 = math.ceil((xmax - gt[0]) / px)
    row0 = math.floor((gt[3] - ymax) / py)
    row1 = math.ceil((gt[3] - ymin) / py)
    width, height = col1 - col0, row1 - row0
    if width <= 0 or height <= 0 or width * height > max_grid_cells:
        raise ValueError(f"Sublot grid has {width * height:,} cells; limit is {max_grid_cells:,}")
    out_gt = (gt[0] + col0 * px, px, 0, gt[3] - row0 * py, 0, -py)
    inside = _rasterize_polygon(geom, width, height, out_gt, wkt)
    if not inside.any():
        raise ValueError("Sublot is smaller than one DSM cell at this resolution")
    valid = np.zeros((height, width), dtype=bool)
    x0, x1 = max(col0, 0), min(col1, dataset.RasterXSize)
    y0, y1 = max(row0, 0), min(row1, dataset.RasterYSize)
    if x1 > x0 and y1 > y0:
        terrain = dataset.GetRasterBand(1).ReadAsArray(x0, y0, x1 - x0, y1 - y0)
        nodata = dataset.GetRasterBand(1).GetNoDataValue()
        good = np.isfinite(terrain)
        if nodata is not None:
            good &= terrain != nodata
        valid[y0-row0:y1-row0, x0-col0:x1-col0] = good
    counts = np.zeros((height, width), dtype=np.int32)
    uncertain = np.zeros((height, width), dtype=bool)
    exposures = load_exposures(point_path, polygon_path, wkt, sublot, None, limit)
    failures = []
    failed_footprints = []
    progress(f"Sublot {sublot}: {len(exposures)} assigned exposures, {width}x{height} DSM cells")
    for number, exposure in enumerate(exposures, 1):
        try:
            mask, mask_gt, _ = calculate_exposure(dataset, exposure)
            offset_x = round((mask_gt[0] - out_gt[0]) / px)
            offset_y = round((out_gt[3] - mask_gt[3]) / py)
            ax0, ay0 = max(0, offset_x), max(0, offset_y)
            ax1, ay1 = min(width, offset_x + mask.shape[1]), min(height, offset_y + mask.shape[0])
            if ax1 > ax0 and ay1 > ay0:
                crop = mask[ay0-offset_y:ay1-offset_y, ax0-offset_x:ax1-offset_x]
                target = counts[ay0:ay1, ax0:ax1]
                target += (crop == 1) & inside[ay0:ay1, ax0:ax1] & valid[ay0:ay1, ax0:ax1]
                uncertain[ay0:ay1, ax0:ax1] |= (crop == 255) & inside[ay0:ay1, ax0:ax1]
        except Exception as exc:
            failures.append({"line": exposure.line, "event": exposure.event, "error": str(exc)})
            failed_footprints.append(ogr.CreateGeometryFromWkb(exposure.footprint_wkb))
            progress(f"[{number}/{len(exposures)}] {exposure.key}: ERROR {exc}")
        if number % 100 == 0 or number == len(exposures):
            progress(f"Processed {number}/{len(exposures)} exposures")
    if failed_footprints:
        # A failed camera might have been the only image for a cell. Keep cells
        # seen by another camera covered; mark the rest of its footprint unknown.
        uncertain |= _rasterize_polygons(failed_footprints, width, height, out_gt, wkt)
    status = np.zeros((height, width), dtype=np.uint8)
    status[inside & ~valid] = 3
    status[inside & valid] = 1
    status[inside & valid & uncertain] = 3
    status[inside & valid & (counts > 0)] = 2
    counts[~inside] = -1
    counts[inside & (status == 3)] = -2
    # EPSG:6933 gives physical area; distributing it across rasterized AOI cells
    # keeps the category totals tied to the vector boundary area.
    equal_area = osr.SpatialReference()
    equal_area.ImportFromEPSG(6933)
    area_geom = geom.Clone()
    source_srs = osr.SpatialReference()
    source_srs.ImportFromWkt(wkt)
    area_geom.Transform(_transform(source_srs, equal_area))
    total_area = area_geom.GetArea()
    cell_area = total_area / int(inside.sum())
    cells = {name: int(np.count_nonzero(status == code)) for name, code in
             (("unseen", 1), ("covered", 2), ("unknown", 3))}
    output_dir.mkdir(parents=True, exist_ok=True)
    _write_raster(output_dir / "coverage_count.tif", counts, out_gt, wkt, -1,
                  "Visible camera count; -1 outside sublot; -2 unknown DSM")
    _write_raster(output_dir / "coverage_status.tif", status, out_gt, wkt, 0,
                  "0 outside sublot; 1 unseen; 2 covered; 3 unknown", palette=True)
    _write_color_raster(output_dir / "coverage_color.tif", status, out_gt, wkt)
    summary = {
        "sublot": sublot, "grid_resolution_m": [px, py],
        "grid_size_cells": [width, height], "area_m2": total_area,
        "area_method": "EPSG:6933 vector area apportioned to rasterized AOI cells",
        "cells": cells,
        "areas_m2": {name: value * cell_area for name, value in cells.items()},
        "percent": {name: 100 * value / int(inside.sum()) for name, value in cells.items()},
        "exposures_processed": len(exposures), "exposures_failed": failures,
        "all_assigned_exposures_requested": limit is None,
        "color_legend": {"unseen": "#d73027", "covered": "#1a9850",
                         "unknown": "#fdae61", "outside": "transparent"},
        "complete": limit is None and not failures and cells["unknown"] == 0,
        "inputs": {"point": str(point_path), "polygon": str(polygon_path),
                   "sublots": str(sublots_path), "dsm": str(dsm_path)},
        "note": "Unseen means no processed camera sees the DSM surface. "
                "It is a final no-image estimate only when complete=true. "
                "Building footprints are not fused in this version.",
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary
