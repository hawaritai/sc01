"""Extract real AOIs (Sublot 01I Deduru Oya + Sublot 01C Hill Escarpment) from SC01 Lot 01 shapefiles,
export `lot01_aoi_data.js`, and generate ready-to-upload real-data sample files in `sample_uploads/`.
"""

import csv
import json
import math
import os
import struct
import urllib.parse
import urllib.request

# LOT01_DIR = r"D:\Projects\0_Current_projects\SC01\FlightPlan\Lot_01"
LOT01_DIR = r"D:\projects\SC01\FlightPlan\Lot_01"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_JS = os.path.join(BASE_DIR, "lot01_aoi_data.js")
SAMPLES_DIR = os.path.join(BASE_DIR, "sample_uploads")


def read_dbf_records(dbf_path):
    with open(dbf_path, "rb") as f:
        header = f.read(32)
        num_rec = struct.unpack("<I", header[4:8])[0]
        header_len, rec_len = struct.unpack("<HH", header[8:12])
        fields = []
        while True:
            b = f.read(32)
            if not b or b[0] == 0x0D:
                break
            name = b[:11].split(b"\x00")[0].decode("ascii", errors="ignore")
            fields.append((name, chr(b[11]), b[16], b[17]))
        f.seek(header_len)
        rows = []
        for idx in range(num_rec):
            rec_bytes = f.read(rec_len)
            if not rec_bytes:
                break
            offset = 1
            row = {}
            for name, _, flen, _ in fields:
                raw = rec_bytes[offset : offset + flen]
                row[name] = raw.replace(b"\x00", b"").decode("utf-8", errors="replace").strip()
                offset += flen
            rows.append((idx, row))
        return rows


def read_polygon_z(base_path, record_indices):
    shp_path = base_path + ".shp"
    shx_path = base_path + ".shx"
    results = {}
    with open(shx_path, "rb") as fx, open(shp_path, "rb") as fs:
        for idx in record_indices:
            fx.seek(100 + idx * 8)
            off_words, _ = struct.unpack(">2i", fx.read(8))
            fs.seek(off_words * 2 + 8)
            stype = struct.unpack("<i", fs.read(4))[0]
            bbox = struct.unpack("<4d", fs.read(32))
            nparts, npts = struct.unpack("<2i", fs.read(8))
            _parts = struct.unpack(f"<{nparts}i", fs.read(4 * nparts))
            pts2d = [struct.unpack("<2d", fs.read(16)) for _ in range(npts)]
            if stype == 15:
                _zrange = struct.unpack("<2d", fs.read(16))
                zs = struct.unpack(f"<{npts}d", fs.read(8 * npts))
            else:
                zs = [0.0] * npts
            results[idx] = {
                "bbox": bbox,
                "points": [(x, y, z) for (x, y), z in zip(pts2d, zs)],
            }
    return results


def parse_pos_local(pos_str):
    parts = pos_str.split()
    return float(parts[0]), float(parts[1]), float(parts[2])


def epsg3857_to_wgs84(x, y):
    lon = (x / 20037508.342789244) * 180.0
    lat = (2.0 * math.atan(math.exp(y / 6378137.0)) - math.pi / 2.0) * 180.0 / math.pi
    return lat, lon


def wgs84_to_epsg3857(lat, lon):
    x = (lon / 180.0) * 20037508.342789244
    y = math.log(math.tan((math.pi / 4.0) + (lat * math.pi / 360.0))) * 6378137.0
    return x, y


def build_idw_dtm_grid(z_samples, origin_x, origin_y, half_w=1200.0, half_h=1200.0, nx=81, ny=81, add_micro=False):
    local_samples = [(x - origin_x, y - origin_y, z) for x, y, z in z_samples]
    xs = [-half_w + (2.0 * half_w) * i / (nx - 1) for i in range(nx)]
    ys = [-half_h + (2.0 * half_h) * j / (ny - 1) for j in range(ny)]

    bins = {}
    for sx, sy, sz in local_samples:
        key = (round(sx / 30.0), round(sy / 30.0))
        if key not in bins:
            bins[key] = [sx, sy, sz, 1]
        else:
            b = bins[key]
            b[0] += sx
            b[1] += sy
            b[2] += sz
            b[3] += 1
    reduced = [(b[0] / b[3], b[1] / b[3], b[2] / b[3]) for b in bins.values()]

    grid = []
    for y in ys:
        row_vals = []
        for x in xs:
            dists = []
            for sx, sy, sz in reduced:
                d2 = (x - sx) ** 2 + (y - sy) ** 2
                if d2 < 1.0:
                    d2 = 1.0
                dists.append((d2, sz))
            dists.sort(key=lambda t: t[0])
            k_near = dists[:10]
            wsum = 0.0
            wzsum = 0.0
            for d2, sz in k_near:
                w = 1.0 / d2
                wsum += w
                wzsum += w * sz
            base_z = wzsum / wsum if wsum > 0 else 45.0
            if add_micro:
                base_z += 2.2 * math.sin(x * 0.0045) * math.cos(y * 0.0038)
            row_vals.append(round(base_z, 2))
        grid.append(row_vals)

    flat_vals = [v for r in grid for v in r]
    return {
        "nx": nx,
        "ny": ny,
        "minX": -half_w,
        "maxX": half_w,
        "minY": -half_h,
        "maxY": half_h,
        "meanZ": round(sum(flat_vals) / len(flat_vals), 2),
        "minZ": round(min(flat_vals), 2),
        "maxZ": round(max(flat_vals), 2),
        "elevations": grid,
    }


def extract_sublot_window(line_rows, point_rows, poly_dbf, poly_base, aoi_code, target_lines, target_events, x_range=None):
    sel_lines = [
        r for _, r in line_rows
        if r["AOI"] == aoi_code and r["FlightLin0"] in target_lines
    ]
    sel_pts = []
    for _, r in point_rows:
        if r["AOI"] == aoi_code and r["FlightLine"] in target_lines:
            x, y, z = parse_pos_local(r["Positionlo"])
            if target_events and r["EventLabel"] not in target_events:
                continue
            if x_range and not (x_range[0] <= x <= x_range[1]):
                continue
            sel_pts.append((r, x, y, z))

    origin_x = 0.5 * (min(p[1] for p in sel_pts) + max(p[1] for p in sel_pts))
    origin_y = 0.5 * (min(p[2] for p in sel_pts) + max(p[2] for p in sel_pts))

    all_aoi_poly_indices = [
        idx for idx, r in poly_dbf
        if r["AOI"] == aoi_code and r["Event"] != ""
    ]
    poly_geoms = read_polygon_z(poly_base, all_aoi_poly_indices)

    z_samples = []
    for idx in all_aoi_poly_indices:
        for px, py, pz in poly_geoms[idx]["points"]:
            if abs(px - origin_x) <= 2200.0 and abs(py - origin_y) <= 2200.0 and pz > 0:
                z_samples.append((px, py, pz))

    cameras = []
    for r, x, y, z in sel_pts:
        cameras.append({
            "id": f"L{int(r['FlightLine'])}-{r['EventLabel']}",
            "strip": int(r["FlightLine"]),
            "event": int(r["EventLabel"]),
            "east": round(x - origin_x, 2),
            "north": round(y - origin_y, 2),
            "altMsl": round(z, 2),
            "altFt": int(float(r["AltMSL[ft]"])),
            "gsdCm": float(r["MeanGSD[cm"]),
            "wgs84": r["PositionWG"].replace("?", "\u00b0"),
        })
    cameras.sort(key=lambda c: (c["strip"], c["event"]))

    lat0, lon0 = epsg3857_to_wgs84(origin_x, origin_y)
    dtm_grid = build_idw_dtm_grid(z_samples, origin_x, origin_y, half_w=1200.0, half_h=1200.0, nx=81, ny=81)

    return {
        "aoi": aoi_code,
        "originEpsg3857": [round(origin_x, 2), round(origin_y, 2)],
        "centerLatLon": [round(lat0, 5), round(lon0, 5)],
        "terrainStats": {
            "sampleCount": len(z_samples),
            "meanZ": dtm_grid["meanZ"],
            "minZ": dtm_grid["minZ"],
            "maxZ": dtm_grid["maxZ"],
        },
        "dtmGrid": dtm_grid,
        "cameras": cameras,
    }


def try_fetch_osm_buildings(lat0, lon0, radius_deg=0.008):
    s, w, n, e = lat0 - radius_deg, lon0 - radius_deg, lat0 + radius_deg, lon0 + radius_deg
    query = f'[out:json][timeout:8];way["building"]({s:.5f},{w:.5f},{n:.5f},{e:.5f});out body;>;out skel qt;'
    try:
        req = urllib.request.Request(
            "https://overpass-api.de/api/interpreter",
            data=urllib.parse.urlencode({"data": query}).encode("utf-8"),
            headers={"User-Agent": "SC01-TrueOrtho-Simulator/1.0"},
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read().decode("utf-8"))
        nodes = {el["id"]: (el["lat"], el["lon"]) for el in data.get("elements", []) if el.get("type") == "node"}
        feats = []
        for el in data.get("elements", []):
            if el.get("type") == "way" and el.get("nodes"):
                ring = []
                for nid in el["nodes"]:
                    if nid in nodes:
                        la, lo = nodes[nid]
                        ring.append([lo, la])
                if len(ring) >= 4:
                    tags = el.get("tags", {})
                    feats.append({
                        "type": "Feature",
                        "properties": {
                            "id": f"osm_{el['id']}",
                            "name": tags.get("name", f"Building {el['id']}"),
                            "building": tags.get("building", "yes"),
                            "height": tags.get("height"),
                            "building:levels": tags.get("building:levels"),
                        },
                        "geometry": {"type": "Polygon", "coordinates": [ring]},
                    })
        return feats
    except Exception:
        return []


def build_realistic_polygon_sample_buildings(origin_x, origin_y):
    """Create realistic polygon footprints (L-shapes, U-courtyards, stepped towers, blocks) in WGS84 GeoJSON."""
    def rect_poly(cx, cy, w, d):
        hw, hd = w * 0.5, d * 0.5
        return [[cx - hw, cy - hd], [cx + hw, cy - hd], [cx + hw, cy + hd], [cx - hw, cy + hd], [cx - hw, cy - hd]]

    def l_poly(cx, cy, w, d, cut_w, cut_d):
        hw, hd = w * 0.5, d * 0.5
        return [
            [cx - hw, cy - hd],
            [cx + hw, cy - hd],
            [cx + hw, cy + hd - cut_d],
            [cx + hw - cut_w, cy + hd - cut_d],
            [cx + hw - cut_w, cy + hd],
            [cx - hw, cy + hd],
            [cx - hw, cy - hd],
        ]

    def u_poly(cx, cy, w, d, wing_w, notch_d):
        hw, hd = w * 0.5, d * 0.5
        return [
            [cx - hw, cy - hd],
            [cx + hw, cy - hd],
            [cx + hw, cy + hd],
            [cx + hw - wing_w, cy + hd],
            [cx + hw - wing_w, cy + hd - notch_d],
            [cx - hw + wing_w, cy + hd - notch_d],
            [cx - hw + wing_w, cy + hd],
            [cx - hw, cy + hd],
            [cx - hw, cy - hd],
        ]

    specs = [
        ("OSM-101", "Central Skyline Tower", rect_poly(-35, 52, 52, 48), 165, 45),
        ("OSM-102", "Central Twin High-Rise S", rect_poly(-35, -42, 52, 48), 135, 38),
        ("OSM-103", "L-Shape Civic Complex", l_poly(78, 42, 74, 62, 34, 28), 78, 22),
        ("OSM-104", "U-Courtyard Mall", u_poly(-145, 22, 84, 72, 24, 38), 34, 9),
        ("OSM-105", "East Apex Skyscraper", rect_poly(172, 10, 50, 52), 152, 42),
        ("OSM-106", "West Financial High-Rise", rect_poly(-145, -85, 54, 48), 118, 32),
        ("OSM-107", "North Slope High-Rise", rect_poly(-115, 465, 54, 48), 110, 30),
        ("OSM-108", "North L-Block", l_poly(45, 445, 76, 60, 36, 26), 95, 26),
        ("OSM-109", "South Slope High-Rise", rect_poly(62, -425, 56, 46), 115, 32),
        ("OSM-110", "South Landmark Tower", rect_poly(-95, -460, 52, 52), 142, 39),
        ("OSM-111", "NW Ridge Tower", rect_poly(-480, 425, 52, 50), 104, 28),
        ("OSM-112", "NE Peak Complex", l_poly(505, 380, 72, 62, 32, 26), 88, 24),
        ("OSM-113", "SW Hill Complex", u_poly(-450, -490, 76, 66, 22, 34), 48, 13),
        ("OSM-114", "SE Escarpment Tower", rect_poly(480, -455, 52, 52), 126, 35),
        ("OSM-115", "Market Block North", rect_poly(255, -35, 70, 52), 26, 7),
        ("OSM-116", "Depot South", rect_poly(-245, -465, 72, 54), 24, 6),
    ]

    local_polys = []
    geojson_features = []
    for bid, name, ring_local, h, levels in specs:
        local_polys.append((bid, name, ring_local, h))
        ring_wgs = []
        for lx, ly in ring_local:
            lat, lon = epsg3857_to_wgs84(origin_x + lx, origin_y + ly)
            ring_wgs.append([round(lon, 7), round(lat, 7)])
        geojson_features.append({
            "type": "Feature",
            "properties": {
                "id": bid,
                "name": name,
                "height": h,
                "building:levels": levels,
                "building": "yes",
            },
            "geometry": {"type": "Polygon", "coordinates": [ring_wgs]},
        })
    return local_polys, {
        "type": "FeatureCollection",
        "name": "SC01_Sample_OSM_Buildings",
        "features": geojson_features,
    }


def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def write_sample_uploads(sublot_01c, sublot_01i):
    os.makedirs(SAMPLES_DIR, exist_ok=True)
    # Use Sublot 01C (real mountain escarpment 190-1014m MSL) for DTM/DSM + OSM sample uploads
    g = sublot_01c["dtmGrid"]
    ox, oy = sublot_01c["originEpsg3857"]
    nx, ny = g["nx"], g["ny"]
    cellsize = (g["maxX"] - g["minX"]) / (nx - 1)
    xll = ox + g["minX"] - cellsize * 0.5
    yll = oy + g["minY"] - cellsize * 0.5

    dtm_path = os.path.join(SAMPLES_DIR, "sample_dtm.asc")
    with open(dtm_path, "w", encoding="utf-8") as f:
        f.write(f"ncols         {nx}\n")
        f.write(f"nrows         {ny}\n")
        f.write(f"xllcorner     {xll:.2f}\n")
        f.write(f"yllcorner     {yll:.2f}\n")
        f.write(f"cellsize      {cellsize:.2f}\n")
        f.write("NODATA_value  -9999\n")
        # ASCII Grid starts at top row (north maxY) down to bottom row (south minY)
        for j in range(ny - 1, -1, -1):
            f.write(" ".join(f"{v:.2f}" for v in g["elevations"][j]) + "\n")

    local_polys, geojson = build_realistic_polygon_sample_buildings(ox, oy)
    geo_path = os.path.join(SAMPLES_DIR, "sample_buildings_osm.geojson")
    with open(geo_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2)

    # Sample DSM = DTM + building heights inside building footprints
    dsm_path = os.path.join(SAMPLES_DIR, "sample_dsm.asc")
    with open(dsm_path, "w", encoding="utf-8") as f:
        f.write(f"ncols         {nx}\n")
        f.write(f"nrows         {ny}\n")
        f.write(f"xllcorner     {xll:.2f}\n")
        f.write(f"yllcorner     {yll:.2f}\n")
        f.write(f"cellsize      {cellsize:.2f}\n")
        f.write("NODATA_value  -9999\n")
        for j in range(ny - 1, -1, -1):
            y_val = g["minY"] + j * cellsize
            row_out = []
            for i in range(nx):
                x_val = g["minX"] + i * cellsize
                z_val = g["elevations"][j][i]
                for _, _, poly, bh in local_polys:
                    if point_in_poly(x_val, y_val, poly):
                        z_val += bh
                        break
                row_out.append(f"{z_val:.2f}")
            f.write(" ".join(row_out) + "\n")

    # Sample Exterior Orientation CSV for Sublot 01C real flight plan
    eo_path = os.path.join(SAMPLES_DIR, "sample_flightplan_eo.csv")
    with open(eo_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["PhotoID", "Strip", "East_EPSG3857", "North_EPSG3857", "AltMSL", "Omega", "Phi", "Kappa"])
        for c in sublot_01c["cameras"]:
            w.writerow([c["id"], c["strip"], round(ox + c["east"], 2), round(oy + c["north"], 2), c["altMsl"], 0.0, 0.0, 0.0])


def main():
    line_dbf = read_dbf_records(os.path.join(LOT01_DIR, "SC01_Lot01_2112_Plan_Line.dbf"))
    point_dbf = read_dbf_records(os.path.join(LOT01_DIR, "SC01_Lot01_2112_Plan_Point.dbf"))
    poly_base = os.path.join(LOT01_DIR, "SC01_Lot01_2112_Plan_Polygon")
    poly_dbf = read_dbf_records(poly_base + ".dbf")

    sublot_01i = extract_sublot_window(
        line_dbf, point_dbf, poly_dbf, poly_base,
        aoi_code="01I",
        target_lines=("001", "002", "003", "004"),
        target_events=("009", "010", "011", "012", "013", "014", "015"),
    )

    sublot_01c = extract_sublot_window(
        line_dbf, point_dbf, poly_dbf, poly_base,
        aoi_code="01C",
        target_lines=("028", "029", "030", "031", "032"),
        target_events=None,
        x_range=(9024600, 9027400),
    )

    write_sample_uploads(sublot_01c, sublot_01i)

    payload = {
        "project": "SC01 Sri Lanka LiDAR & True Orthophoto Project",
        "lot": "Lot 01",
        "sublot": "01I (Deduru Oya Basin - Pilot Delivery Area)",
        "originEpsg3857": sublot_01i["originEpsg3857"],
        "centerLatLon": sublot_01i["centerLatLon"],
        "terrainStats": sublot_01i["terrainStats"],
        "dtmGrid": sublot_01i["dtmGrid"],
        "cameras": sublot_01i["cameras"],
        "sublots": {
            "01I": sublot_01i,
            "01C": sublot_01c,
        },
    }

    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("// Auto-generated from SC01 Lot 01 (Sublots 01I & 01C) by extract_lot01_aoi.py\n")
        f.write("window.LOT01_AOI_DATA = ")
        json.dump(payload, f, separators=(",", ":"))
        f.write(";\n")

    print(
        f"Generated {OUT_JS}: Sublot 01I ({len(sublot_01i['cameras'])} cams, Z {sublot_01i['dtmGrid']['minZ']}..{sublot_01i['dtmGrid']['maxZ']}m), "
        f"Sublot 01C ({len(sublot_01c['cameras'])} cams, Z {sublot_01c['dtmGrid']['minZ']}..{sublot_01c['dtmGrid']['maxZ']}m)"
    )
    print(f"Generated sample upload files in {SAMPLES_DIR}")


if __name__ == "__main__":
    main()
