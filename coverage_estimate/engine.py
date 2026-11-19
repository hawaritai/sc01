"""Per-exposure DSM visibility for QGIS Flight Planner point/polygon exports."""

from __future__ import annotations

import csv
from dataclasses import dataclass
import math
from pathlib import Path
from typing import Callable

import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()
ogr.UseExceptions()
osr.UseExceptions()


@dataclass(frozen=True)
class Exposure:
    aoi: str
    line: str
    event: str
    x: float
    y: float
    z: float
    footprint_wkb: bytes

    @property
    def key(self) -> str:
        return f"{self.aoi}_{self.line}_{self.event}"


def companion_polygon(point_path: str | Path) -> Path:
    point_path = Path(point_path)
    if not point_path.name.lower().endswith("_point.shp"):
        raise ValueError("Select a *_Point.shp file or provide --polygon explicitly")
    return point_path.with_name(point_path.name[:-10] + "_Polygon.shp")


def _open_vector(path: str | Path):
    source = ogr.Open(str(path))
    if source is None:
        raise ValueError(f"Cannot open vector file: {path}")
    layer = source.GetLayer(0)
    if layer.GetSpatialRef() is None:
        raise ValueError(f"Vector file has no CRS: {path}")
    return source, layer


def _fields(layer) -> set[str]:
    definition = layer.GetLayerDefn()
    return {definition.GetFieldDefn(i).GetName() for i in range(definition.GetFieldCount())}


def _value(feature, name: str) -> str:
    value = feature.GetField(name)
    return "" if value is None else str(value).strip()


def available_groups(point_path: str | Path) -> dict[str, list[str]]:
    source, layer = _open_vector(point_path)
    try:
        needed = {"AOI", "FlightLine", "EventLabel"}
        if not needed <= _fields(layer):
            raise ValueError(f"Point layer needs fields {sorted(needed)}")
        groups: dict[str, set[str]] = {}
        for feature in layer:
            aoi, line = _value(feature, "AOI"), _value(feature, "FlightLine")
            if aoi and line and _value(feature, "EventLabel"):
                groups.setdefault(aoi, set()).add(line)
        return {aoi: sorted(lines) for aoi, lines in sorted(groups.items())}
    finally:
        source = None


def _transform(source_srs, target_srs):
    source_srs = source_srs.Clone()
    target_srs = target_srs.Clone()
    source_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    target_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return osr.CoordinateTransformation(source_srs, target_srs)


def load_exposures(
    point_path: str | Path,
    polygon_path: str | Path,
    target_wkt: str,
    aoi: str,
    line: str | None,
    limit: int | None,
) -> list[Exposure]:
    if limit is not None and limit < 1:
        raise ValueError("Exposure limit must be at least 1")
    points_source, points = _open_vector(point_path)
    polygons_source, polygons = _open_vector(polygon_path)
    try:
        if not {"AOI", "FlightLine", "EventLabel"} <= _fields(points):
            raise ValueError("Point layer needs AOI, FlightLine, EventLabel")
        if not {"AOI", "Line", "Event", "Details"} <= _fields(polygons):
            raise ValueError("Polygon layer needs AOI, Line, Event, Details")
        target = osr.SpatialReference()
        target.ImportFromWkt(target_wkt)
        point_transform = _transform(points.GetSpatialRef(), target)
        polygon_transform = _transform(polygons.GetSpatialRef(), target)
        footprints = {}
        for feature in polygons:
            key = (_value(feature, "AOI"), _value(feature, "Line"),
                   _value(feature, "Event"))
            if key[0] != aoi or (line is not None and key[1] != line):
                continue
            if _value(feature, "Details") != "ReleaseByPosition":
                continue
            if key in footprints:
                raise ValueError(f"Duplicate exposure footprint: {key}")
            geometry = feature.GetGeometryRef()
            if geometry is None or geometry.IsEmpty():
                raise ValueError(f"Empty exposure footprint: {key}")
            geometry = geometry.Clone()
            geometry.Transform(polygon_transform)
            if ogr.GT_Flatten(geometry.GetGeometryType()) not in (ogr.wkbPolygon, ogr.wkbMultiPolygon):
                raise ValueError(f"Exposure footprint is not a polygon: {key}")
            footprints[key] = bytes(geometry.ExportToWkb())
        selected = {}
        order = []
        for feature in points:
            key = (_value(feature, "AOI"), _value(feature, "FlightLine"),
                   _value(feature, "EventLabel"))
            if key not in footprints:
                continue
            if key in selected:
                raise ValueError(f"Duplicate exposure point: {key}")
            geometry = feature.GetGeometryRef()
            if geometry is None or ogr.GT_Flatten(geometry.GetGeometryType()) != ogr.wkbPoint:
                raise ValueError(f"Exposure point has invalid geometry: {key}")
            if geometry.GetCoordinateDimension() < 3:
                raise ValueError(f"Exposure point has no Z height: {key}")
            x, y, z = geometry.GetPoint(0)
            if not all(math.isfinite(v) for v in (x, y, z)):
                raise ValueError(f"Exposure point has non-finite coordinate: {key}")
            tx, ty, _ = point_transform.TransformPoint(x, y, 0)
            selected[key] = (tx, ty, z)
            order.append(key)
            if limit is not None and len(order) >= limit:
                break
        if not order:
            raise ValueError(f"No ReleaseByPosition exposures found for AOI={aoi}, line={line or 'all'}")
        return [Exposure(*key, *selected[key], footprints[key]) for key in order]
    finally:
        points_source = polygons_source = None


def _raster_srs(dataset):
    wkt = dataset.GetProjection()
    if not wkt:
        raise ValueError("DSM has no CRS")
    srs = osr.SpatialReference()
    srs.ImportFromWkt(wkt)
    if not srs.IsProjected() or abs(srs.GetLinearUnits() - 1.0) > 1e-8:
        raise ValueError("DSM must use a projected CRS with metre units")
    return wkt


def _validate_dsm(dataset):
    if dataset.RasterCount < 1:
        raise ValueError("DSM has no raster band")
    gt = dataset.GetGeoTransform()
    if gt[1] <= 0 or gt[5] >= 0 or abs(gt[2]) > 1e-10 or abs(gt[4]) > 1e-10:
        raise ValueError("DSM must be a north-up raster with no grid rotation")
    return _raster_srs(dataset)


def _camera_ground(dataset, x: float, y: float) -> float:
    gt = dataset.GetGeoTransform()
    inv = gdal.InvGeoTransform(gt)
    px, py = gdal.ApplyGeoTransform(inv, x, y)
    col, row = math.floor(px), math.floor(py)
    if not (0 <= col < dataset.RasterXSize and 0 <= row < dataset.RasterYSize):
        raise ValueError("Camera lies outside DSM extent")
    band = dataset.GetRasterBand(1)
    elevation = float(band.ReadAsArray(col, row, 1, 1)[0, 0])
    nodata = band.GetNoDataValue()
    if not math.isfinite(elevation) or (nodata is not None and elevation == nodata):
        raise ValueError("DSM has no valid elevation at camera position")
    return elevation


def _footprint_raster(footprint_wkb: bytes, view, srs_wkt: str) -> np.ndarray:
    mask_ds = gdal.GetDriverByName("MEM").Create("", view.RasterXSize, view.RasterYSize, 1, gdal.GDT_Byte)
    mask_ds.SetGeoTransform(view.GetGeoTransform())
    mask_ds.SetProjection(srs_wkt)
    driver = ogr.GetDriverByName("MEM") or ogr.GetDriverByName("Memory")
    source = driver.CreateDataSource("")
    srs = osr.SpatialReference()
    srs.ImportFromWkt(srs_wkt)
    layer = source.CreateLayer("footprint", srs=srs, geom_type=ogr.wkbPolygon)
    feature = ogr.Feature(layer.GetLayerDefn())
    feature.SetGeometry(ogr.CreateGeometryFromWkb(footprint_wkb))
    layer.CreateFeature(feature)
    gdal.RasterizeLayer(mask_ds, [1], layer, burn_values=[1])
    return mask_ds.ReadAsArray().astype(bool)


def _dsm_window(dataset, view) -> np.ndarray:
    gt = dataset.GetGeoTransform()
    vgt = view.GetGeoTransform()
    inv = gdal.InvGeoTransform(gt)
    xoff, yoff = gdal.ApplyGeoTransform(inv, vgt[0], vgt[3])
    col, row = round(xoff), round(yoff)
    if abs(xoff - col) > 1e-5 or abs(yoff - row) > 1e-5:
        raise ValueError("Viewshed output is not aligned to the DSM grid")
    if (col < 0 or row < 0 or col + view.RasterXSize > dataset.RasterXSize
            or row + view.RasterYSize > dataset.RasterYSize):
        raise ValueError("Viewshed output exceeds DSM extent")
    return dataset.GetRasterBand(1).ReadAsArray(col, row, view.RasterXSize, view.RasterYSize)


def process_exposure(dataset, exposure: Exposure, output_dir: str | Path,
                     overwrite: bool = False, max_cells: int = 40_000_000) -> dict:
    """Create a cropped, DSM-aligned visibility GeoTIFF for one planned image."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{exposure.aoi}_{exposure.line}_{exposure.event}.tif"
    destination = output_dir / filename
    if destination.exists() and not overwrite:
        raise FileExistsError(f"Mask exists: {destination}; use overwrite to replace it")
    result, view_gt, observer_height = calculate_exposure(dataset, exposure, max_cells)
    # Avoid an incomplete output if writing fails.
    temporary = destination.with_name(destination.stem + ".partial.tif")
    if temporary.exists():
        temporary.unlink()
    try:
        output = gdal.GetDriverByName("GTiff").Create(
            str(temporary), result.shape[1], result.shape[0], 1, gdal.GDT_Byte,
            options=["TILED=YES", "COMPRESS=DEFLATE", "PREDICTOR=2"],
        )
        output.SetGeoTransform(view_gt)
        output.SetProjection(dataset.GetProjection())
        output.SetMetadata({
            "AOI": exposure.aoi, "FLIGHT_LINE": exposure.line,
            "EVENT": exposure.event, "CAMERA_Z": str(exposure.z),
            "CAMERA_X": str(exposure.x), "CAMERA_Y": str(exposure.y),
            "POSE": "assumed_nadir", "VALUE_0": "outside_footprint",
            "VALUE_1": "visible", "VALUE_2": "occluded", "VALUE_255": "unknown",
        })
        band = output.GetRasterBand(1)
        band.WriteArray(result)
        band.SetNoDataValue(255)
        output.FlushCache()
        output = None
        temporary.replace(destination)
    finally:
        if temporary.exists():
            temporary.unlink()
    counts = np.bincount(result.ravel(), minlength=256)
    return {
        "aoi": exposure.aoi, "line": exposure.line, "event": exposure.event,
        "camera_x": exposure.x, "camera_y": exposure.y, "camera_z": exposure.z,
        "camera_agl_above_dsm": observer_height, "mask": str(destination),
        "visible_cells": int(counts[1]), "occluded_cells": int(counts[2]),
        "unknown_cells": int(counts[255]), "error": "",
    }


def calculate_exposure(dataset, exposure: Exposure,
                       max_cells: int = 40_000_000) -> tuple[np.ndarray, tuple, float]:
    """Return footprint-clipped visibility, DSM-aligned grid and camera AGL."""
    ground = _camera_ground(dataset, exposure.x, exposure.y)
    observer_height = exposure.z - ground
    if observer_height <= 0:
        raise ValueError(f"Camera height {exposure.z:.3f} is not above DSM {ground:.3f}")
    geometry = ogr.CreateGeometryFromWkb(exposure.footprint_wkb)
    xmin, xmax, ymin, ymax = geometry.GetEnvelope()
    radius = max(math.hypot(x - exposure.x, y - exposure.y)
                 for x in (xmin, xmax) for y in (ymin, ymax))
    gt = dataset.GetGeoTransform()
    radius += max(abs(gt[1]), abs(gt[5])) * 2
    estimate = math.ceil(2 * radius / abs(gt[1])) * math.ceil(2 * radius / abs(gt[5]))
    if estimate > max_cells:
        raise ValueError(f"Estimated viewshed is {estimate:,} cells, above limit {max_cells:,}; use a coarser DSM")
    view = gdal.ViewshedGenerate(
        dataset.GetRasterBand(1), "MEM", "", [], exposure.x, exposure.y,
        observer_height, 0.0, 1.0, 2.0, 0.0, 255.0, 0.0,
        gdal.GVM_Edge, radius,
    )
    if view is None:
        raise RuntimeError("GDAL viewshed generation failed")
    if view.RasterXSize * view.RasterYSize > max_cells:
        raise ValueError("Actual viewshed exceeds cell limit")
    values = view.ReadAsArray()
    footprint = _footprint_raster(exposure.footprint_wkb, view, dataset.GetProjection())
    terrain = _dsm_window(dataset, view)
    nodata = dataset.GetRasterBand(1).GetNoDataValue()
    unknown = ~np.isfinite(terrain)
    if nodata is not None:
        unknown |= terrain == nodata
    result = np.zeros(values.shape, dtype=np.uint8)
    result[footprint] = values[footprint]
    result[footprint & (unknown | ~np.isin(values, (1, 2)))] = 255
    return result, view.GetGeoTransform(), observer_height


def run(point_path: str | Path, dsm_path: str | Path, output_dir: str | Path,
        aoi: str, line: str | None, limit: int,
        polygon_path: str | Path | None = None, overwrite: bool = False,
        progress: Callable[[str], None] | None = None,
        cancelled: Callable[[], bool] | None = None) -> list[dict]:
    emit = progress or (lambda message: print(message, flush=True))
    cancelled = cancelled or (lambda: False)
    polygon_path = polygon_path or companion_polygon(point_path)
    if not Path(polygon_path).is_file():
        raise FileNotFoundError(f"Exposure polygon file not found: {polygon_path}")
    dataset = gdal.Open(str(dsm_path))
    if dataset is None:
        raise FileNotFoundError(f"DSM not found or unreadable: {dsm_path}")
    target_wkt = _validate_dsm(dataset)
    exposures = load_exposures(point_path, polygon_path, target_wkt, aoi, line, limit)
    emit(f"Loaded {len(exposures)} exposures. Heights are used as absolute Z; assumed nadir pose.")
    rows = []
    for index, exposure in enumerate(exposures, 1):
        if cancelled():
            emit("Cancelled before next exposure")
            break
        try:
            row = process_exposure(dataset, exposure, output_dir, overwrite=overwrite)
            emit(f"[{index}/{len(exposures)}] {exposure.key}: visible={row['visible_cells']:,}, occluded={row['occluded_cells']:,}, unknown={row['unknown_cells']:,}")
        except Exception as exc:
            row = {"aoi": exposure.aoi, "line": exposure.line, "event": exposure.event,
                   "camera_x": exposure.x, "camera_y": exposure.y, "camera_z": exposure.z,
                   "camera_agl_above_dsm": "", "mask": "", "visible_cells": "",
                   "occluded_cells": "", "unknown_cells": "", "error": str(exc)}
            emit(f"[{index}/{len(exposures)}] {exposure.key}: ERROR {exc}")
        rows.append(row)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    with (output_dir / "manifest.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    emit(f"Finished {len(rows)} exposures; manifest: {output_dir / 'manifest.csv'}")
    return rows
