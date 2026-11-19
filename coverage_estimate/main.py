"""Desktop and command-line entry point for planned-image occlusion masks."""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
import sys

from engine import run
from coverage import run_sublot


def main(argv=None) -> int:
    project = Path(__file__).resolve().parent
    dsm = project.parent / "TrueOrtho_test" / "data" / "GEM15_SriLanka_DSM_polygon1.tif"
    parser = argparse.ArgumentParser(description="Calculate per-exposure DSM visibility masks")
    parser.add_argument("--point", default=str(project / "data" / "Lot_01" /
                        "SC01_Lot01_2112_Plan_Point.shp"),
                        help="QGIS Flight Planner *_Point.shp (defaults to Lot 01 plan)")
    parser.add_argument("--polygon", help="Matching *_Polygon.shp (found automatically by default)")
    parser.add_argument("--dsm", default=str(dsm), help="Projected DSM GeoTIFF (defaults to GEM15 polygon1)")
    parser.add_argument("--output", default=str(project / "outputs" /
                        ("01C_coverage_" + datetime.now().strftime("%Y%m%d_%H%M%S"))),
                        help="Output directory (defaults to a timestamped 01C coverage folder)")
    parser.add_argument("--aoi", help="AOI identifier, for example 01L")
    parser.add_argument("--sublots", default=str(project / "data" / "AOI_three_lots" /
                        "Revised_Lot_01_Splitted.shp"),
                        help="AOI shapefile with Sub-Lots polygons (defaults to Lot 01)")
    parser.add_argument("--sublot", default="01C", help="Sub-Lots ID (default: 01C)")
    parser.add_argument("--line", help="FlightLine identifier, for example 001")
    parser.add_argument("--limit", type=int, help="Limit exposures for a quick sample (default: all assigned images for combined coverage)")
    parser.add_argument("--all", action="store_true", help="Process every assigned exposure (also the combined coverage default)")
    parser.add_argument("--overwrite", action="store_true", help="Replace existing masks")
    parser.add_argument("--gui", action="store_true", help="Open the per-exposure desktop interface")
    args = parser.parse_args(argv)
    if args.gui:
        from gui import launch
        return launch()
    combined = not (args.aoi or args.line)
    if args.all and not combined:
        parser.error("--all is only for combined sublot coverage")
    if args.all and args.limit is not None:
        parser.error("Use either --all or --limit, not both")
    required = {"--point": args.point, "--dsm": args.dsm, "--output": args.output}
    if combined:
        required.update({"--sublots": args.sublots, "--sublot": args.sublot})
    else:
        required["--aoi"] = args.aoi
    missing = [name for name, value in required.items() if not value]
    if missing:
        parser.error("Missing required options: " + ", ".join(missing))
    try:
        if combined:
            summary = run_sublot(args.point, args.dsm, args.sublots, args.sublot,
                                 args.output, polygon_path=args.polygon,
                                 limit=None if args.all else args.limit)
            print(f"Covered {summary['percent']['covered']:.2f}%, "
                  f"unseen {summary['percent']['unseen']:.2f}%, "
                  f"unknown {summary['percent']['unknown']:.2f}%; "
                  f"complete={summary['complete']}")
            return 1 if summary["exposures_failed"] else 0
        rows = run(args.point, args.dsm, args.output, args.aoi, args.line,
                   args.limit if args.limit is not None else 10,
                   polygon_path=args.polygon, overwrite=args.overwrite)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 1 if any(row["error"] for row in rows) else 0


if __name__ == "__main__":
    raise SystemExit(main())
