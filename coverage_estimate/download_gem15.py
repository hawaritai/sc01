"""Download GEM-15 DSM and DTM for a buffered sublot polygon.

Requires GDAL's Python bindings. The public GEM-15 STAC index supplies the
tile URLs; GDAL reads just the needed windows from their cloud GeoTIFFs.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
import tempfile
import urllib.request
from urllib.parse import urljoin

from osgeo import gdal, ogr, osr


STAC_ITEMS = "https://storage.googleapis.com/climate-and-sustainability/gem-15/stac/items.ndjson"
STAC_COLLECTION = "https://storage.googleapis.com/climate-and-sustainability/gem-15/stac/gem-15/collection.json"
PIXEL_M = 15
NODATA = -9999
gdal.UseExceptions()
# Public COG tiles contain multi-megabyte compressed blocks. A slow or flaky
# connection can truncate a range response; allow GDAL to retry those reads.
gdal.SetConfigOption("GDAL_HTTP_MAX_RETRY", "8")
gdal.SetConfigOption("GDAL_HTTP_RETRY_DELAY", "2")
gdal.SetConfigOption("GDAL_HTTP_MULTIRANGE", "NO")
gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
try:
    import certifi
    gdal.SetConfigOption("CURL_CA_BUNDLE", certifi.where())
except ImportError:
    pass


def find_sublot(aoi_dir: Path, sublot: str, aoi_path: Path | None = None):
    paths = [aoi_path] if aoi_path else sorted(aoi_dir.glob("Revised_Lot_*_Splitted.shp"))
    if not paths:
        raise FileNotFoundError(f"No sublot shapefiles found in {aoi_dir}")
    matches = []
    for path in paths:
        ds = ogr.Open(str(path))
        if ds is None:
            raise RuntimeError(f"Cannot read AOI: {path}")
        layer = ds.GetLayer()
        if layer.GetLayerDefn().GetFieldIndex("Sub-Lots") < 0:
            raise ValueError(f"Missing 'Sub-Lots' field: {path}")
        srs = layer.GetSpatialRef()
        if srs is None or not srs.IsProjected():
            raise ValueError(f"AOI needs a projected metre CRS: {path}")
        if abs(srs.GetLinearUnits() - 1) > 1e-6:
            raise ValueError(f"AOI CRS units are not metres: {path}")
        for feature in layer:
            if str(feature.GetField("Sub-Lots")).strip().upper() == sublot.upper():
                geometry = feature.GetGeometryRef()
                if geometry is None or geometry.IsEmpty():
                    raise ValueError(f"Empty geometry for {sublot}: {path}")
                matches.append((geometry.Clone(), srs.Clone(), path))
        ds = None
    if len(matches) != 1:
        raise ValueError(f"Expected one sublot {sublot!r}; found {len(matches)}")
    return matches[0]


def transform_geometry(geom, source_srs, epsg):
    destination = osr.SpatialReference()
    destination.ImportFromEPSG(epsg)
    source = source_srs.Clone()
    source.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    destination.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    result = geom.Clone()
    result.Transform(osr.CoordinateTransformation(source, destination))
    return result


def intersects_bbox(a, b):
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


def _read_json(url):
    with urllib.request.urlopen(url, timeout=60) as stream:
        return json.load(stream)


def _signed_coordinate(part):
    return -int(part[1:]) if part.startswith("m") else int(part[1:])


def select_tiles(bbox, index: str):
    if index.startswith(("http://", "https://")) and index.endswith("collection.json"):
        collection = _read_json(index)
        selected = []
        for group in collection["links"]:
            if group["rel"] != "child":
                continue
            name = Path(group["href"]).parent.name
            match = re.fullmatch(r"([pm]\d+)_([pm]\d+)", name)
            if match is None:
                continue
            south, west = (_signed_coordinate(value) for value in match.groups())
            if not intersects_bbox(bbox, [west, south, west + 10, south + 10]):
                continue
            group_url = urljoin(index, group["href"])
            for link in _read_json(group_url)["links"]:
                if link["rel"] != "item":
                    continue
                item_name = Path(link["href"]).stem
                tile = re.fullmatch(r"w(m?\d+)s(m?\d+)", item_name)
                if tile is None:
                    continue
                west_tile = -int(tile[1][1:]) if tile[1].startswith("m") else int(tile[1])
                south_tile = -int(tile[2][1:]) if tile[2].startswith("m") else int(tile[2])
                if intersects_bbox(bbox, [west_tile, south_tile, west_tile + 1, south_tile + 1]):
                    item = _read_json(urljoin(group_url, link["href"]))
                    if intersects_bbox(bbox, item["bbox"]):
                        selected.append(item)
        if not selected:
            raise ValueError(f"No GEM-15 tiles intersect {bbox}")
        return selected
    if index.startswith(("http://", "https://")):
        stream = urllib.request.urlopen(index, timeout=120)
    else:
        stream = open(index, "rb")
    selected = []
    with stream:
        for line in stream:
            item = json.loads(line)
            if intersects_bbox(bbox, item["bbox"]):
                assets = item.get("assets", {})
                if "dsm" not in assets or "dtm" not in assets:
                    raise ValueError(f"GEM-15 item {item.get('id')} lacks DSM or DTM")
                selected.append(item)
    if not selected:
        raise ValueError(f"No GEM-15 tiles intersect {bbox}")
    return selected


def download(sublot: str, buffer_m: float, output_dir: Path, aoi_dir: Path,
             aoi_path: Path | None = None, index: str = STAC_ITEMS,
             overwrite: bool = False):
    if buffer_m < 0:
        raise ValueError("--buffer-m must be nonnegative")
    sublot = sublot.strip().upper()
    if not sublot or not all(c.isalnum() or c in "_-" for c in sublot):
        raise ValueError("Sublot ID must contain only letters, numbers, _ or -")
    geometry, srs, path = find_sublot(aoi_dir, sublot, aoi_path)
    buffered = geometry.Buffer(buffer_m)
    if buffered is None or buffered.IsEmpty():
        raise ValueError("Buffer produced an empty polygon")
    wgs84 = transform_geometry(buffered, srs, 4326)
    minx, maxx, miny, maxy = wgs84.GetEnvelope()
    bbox = [minx, miny, maxx, maxy]
    print(f"Searching GEM-15 tiles for {sublot}, {buffer_m:g} m buffer", flush=True)
    items = select_tiles(bbox, index)
    projected = transform_geometry(buffered, srs, 3857)
    x0, x1, y0, y1 = projected.GetEnvelope()
    bounds = [math.floor(x0 / PIXEL_M) * PIXEL_M,
              math.floor(y0 / PIXEL_M) * PIXEL_M,
              math.ceil(x1 / PIXEL_M) * PIXEL_M,
              math.ceil(y1 / PIXEL_M) * PIXEL_M]
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = {band: output_dir / f"GEM15_{sublot}_{band.upper()}.tif"
               for band in ("dsm", "dtm")}
    summary_path = output_dir / f"GEM15_{sublot}.json"
    existing = [p for p in (*outputs.values(), summary_path) if p.exists()]
    if existing and not overwrite:
        raise FileExistsError(f"Output exists: {existing[0]}; use --overwrite")

    with tempfile.TemporaryDirectory(prefix="gem15_", dir=output_dir) as temp:
        temp = Path(temp)
        cutline = temp / "buffer.geojson"
        cutline.write_text(json.dumps({"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {}, "geometry": json.loads(wgs84.ExportToJson())}
        ]}), encoding="utf-8")
        staged = {}
        for band in ("dsm", "dtm"):
            urls = [item["assets"][band]["href"] for item in items]
            sources = ["/vsicurl/" + url if url.startswith(("http://", "https://")) else url
                       for url in urls]
            target = temp / outputs[band].name
            print(f"Writing {band.upper()} from {len(sources)} tile(s): {target.name}", flush=True)
            ds = gdal.Warp(str(target), sources, format="GTiff", dstSRS="EPSG:3857",
                           outputBounds=bounds, xRes=PIXEL_M, yRes=PIXEL_M,
                           cutlineDSName=str(cutline), dstNodata=NODATA,
                           resampleAlg="bilinear", multithread=False,
                           creationOptions=["TILED=YES", "COMPRESS=DEFLATE", "PREDICTOR=3",
                                            "BIGTIFF=IF_SAFER"])
            if ds is None:
                raise RuntimeError(f"GDAL failed writing {band}")
            ds.FlushCache()
            ds = None
            staged[band] = target
        summary = {
            "source": "Google GEM-15 v1 STAC", "downloaded_utc": datetime.now(timezone.utc).isoformat(),
            "sublot": sublot, "aoi": str(path.resolve()), "buffer_m": buffer_m,
            "buffer_bbox_wgs84": bbox, "crs": "EPSG:3857", "resolution_m": PIXEL_M,
            "bounds_3857": bounds, "nodata": NODATA, "vertical_datum": "EGM96",
            "resampling": "bilinear", "tile_ids": [item["id"] for item in items],
            "assets": {band: [item["assets"][band]["href"] for item in items]
                       for band in ("dsm", "dtm")},
            "outputs": {band: str(path.resolve()) for band, path in outputs.items()},
            "note": "Pixels outside the buffered polygon or GEM-15 coverage are NoData. "
                    "15 m elevation does not resolve individual small buildings.",
        }
        (temp / summary_path.name).write_text(json.dumps(summary, indent=2), encoding="utf-8")
        for band in ("dsm", "dtm"):
            staged[band].replace(outputs[band])
        (temp / summary_path.name).replace(summary_path)
    print(f"Saved {outputs['dsm']} and {outputs['dtm']}", flush=True)
    return summary


def main():
    project = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sublot", default="01C", help="Sub-Lots ID (default: 01C)")
    parser.add_argument("--buffer-m", type=float, default=100,
                        help="Outward buffer in metres (default: 3000)")
    parser.add_argument("--aoi-dir", type=Path, default=project / "data" / "AOI_three_lots")
    parser.add_argument("--aoi", type=Path, help="Optional specific AOI shapefile")
    parser.add_argument("--output-dir", type=Path, default=project / "data" / "gem15")
    parser.add_argument("--stac-index", default=STAC_COLLECTION,
                        help="STAC collection URL or NDJSON URL/local file")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    download(args.sublot, args.buffer_m, args.output_dir, args.aoi_dir,
             args.aoi, args.stac_index, args.overwrite)


if __name__ == "__main__":
    main()
