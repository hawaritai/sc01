import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from osgeo import gdal, ogr, osr

from engine import available_groups, companion_polygon, load_exposures, run
from coverage import run_sublot
from main import main


def srs():
    value = osr.SpatialReference()
    value.ImportFromEPSG(32644)
    value.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return value


def vector(path, geometry_type, fields, geometry):
    source = ogr.GetDriverByName("ESRI Shapefile").CreateDataSource(str(path))
    layer = source.CreateLayer(path.stem, srs=srs(), geom_type=geometry_type)
    for name in fields:
        field = ogr.FieldDefn(name, ogr.OFTString)
        field.SetWidth(30)
        layer.CreateField(field)
    feature = ogr.Feature(layer.GetLayerDefn())
    for name, value in fields.items():
        feature.SetField(name, value)
    feature.SetGeometry(geometry)
    layer.CreateFeature(feature)
    feature = source = None


class VisibilityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="occlusion_test_")
        self.root = Path(self.temporary.name)
        self.point = self.root / "Plan_Point.shp"
        self.polygon = self.root / "Plan_Polygon.shp"
        self.dsm = self.root / "dsm.tif"
        self.sublots = self.root / "sublots.shp"
        dataset = gdal.GetDriverByName("GTiff").Create(str(self.dsm), 100, 100, 1, gdal.GDT_Float32)
        dataset.SetGeoTransform((0, 1, 0, 100, 0, -1))
        dataset.SetProjection(srs().ExportToWkt())
        terrain = np.zeros((100, 100), dtype=np.float32)
        terrain[:, 50] = 30.0  # A wall-like ridge between camera and far cells.
        dataset.GetRasterBand(1).WriteArray(terrain)
        dataset.GetRasterBand(1).SetNoDataValue(-9999)
        dataset = None
        camera = ogr.Geometry(ogr.wkbPoint25D)
        camera.AddPoint(20, 50, 20)
        vector(self.point, ogr.wkbPoint25D,
               {"AOI": "A", "FlightLine": "001", "EventLabel": "001"}, camera)
        footprint = ogr.CreateGeometryFromWkt("POLYGON ((10 20, 90 20, 90 80, 10 80, 10 20))")
        vector(self.polygon, ogr.wkbPolygon,
               {"AOI": "A", "Line": "001", "Event": "001",
                "Details": "ReleaseByPosition"}, footprint)
        sublot = ogr.CreateGeometryFromWkt("POLYGON ((0 0, 100 0, 100 100, 0 100, 0 0))")
        vector(self.sublots, ogr.wkbPolygon, {"Sub-Lots": "A"}, sublot)

    def tearDown(self):
        self.temporary.cleanup()

    def test_plan_join_and_visibility_mask(self):
        self.assertEqual(companion_polygon(self.point), self.polygon)
        self.assertEqual(available_groups(self.point), {"A": ["001"]})
        rows = run(self.point, self.dsm, self.root / "output", "A", "001", 1)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["error"], "")
        self.assertAlmostEqual(rows[0]["camera_agl_above_dsm"], 20.0)
        result = gdal.Open(rows[0]["mask"])
        arr = result.ReadAsArray()
        inv = gdal.InvGeoTransform(result.GetGeoTransform())

        def value(x, y):
            col, row = gdal.ApplyGeoTransform(inv, x, y)
            return int(arr[int(row), int(col)])

        self.assertEqual(value(30, 50), 1)
        self.assertEqual(value(80, 50), 2)
        self.assertEqual(value(20, 10), 0)
        self.assertGreater(rows[0]["visible_cells"], 0)
        self.assertGreater(rows[0]["occluded_cells"], 0)
        self.assertTrue((self.root / "output" / "manifest.csv").is_file())

    def test_invalid_height_and_existing_output_are_reported(self):
        rows = run(self.point, self.dsm, self.root / "output", "A", "001", 1)
        self.assertFalse(rows[0]["error"])
        repeat = run(self.point, self.dsm, self.root / "output", "A", "001", 1)
        self.assertIn("Mask exists", repeat[0]["error"])
        changed = run(self.point, self.dsm, self.root / "output", "A", "001", 1,
                      overwrite=True)
        self.assertFalse(changed[0]["error"])

    def test_combined_sublot_coverage(self):
        summary = run_sublot(self.point, self.dsm, self.sublots, "A",
                             self.root / "combined", limit=None, progress=lambda _: None)
        self.assertTrue(summary["complete"])
        self.assertEqual(summary["exposures_processed"], 1)
        self.assertAlmostEqual(sum(summary["areas_m2"].values()), summary["area_m2"])
        self.assertGreater(summary["cells"]["covered"], 0)
        self.assertGreater(summary["cells"]["unseen"], 0)
        self.assertEqual(summary["cells"]["unknown"], 0)
        count = gdal.Open(str(self.root / "combined" / "coverage_count.tif")).ReadAsArray()
        status = gdal.Open(str(self.root / "combined" / "coverage_status.tif")).ReadAsArray()
        self.assertEqual(int(status[50, 30]), 2)
        self.assertEqual(int(status[50, 80]), 1)
        self.assertEqual(int(status[90, 20]), 1)
        self.assertEqual(int(count[50, 30]), 1)
        color_ds = gdal.Open(str(self.root / "combined" / "coverage_color.tif"))
        self.assertEqual(color_ds.RasterCount, 4)
        self.assertEqual(color_ds.GetGeoTransform(),
                         gdal.Open(str(self.root / "combined" / "coverage_status.tif")).GetGeoTransform())
        self.assertEqual(tuple(int(color_ds.GetRasterBand(i).ReadAsArray(30, 50, 1, 1)[0, 0])
                               for i in range(1, 5)), (26, 152, 80, 255))
        self.assertEqual(tuple(int(color_ds.GetRasterBand(i).ReadAsArray(80, 50, 1, 1)[0, 0])
                               for i in range(1, 5)), (215, 48, 39, 255))
        palette = gdal.Open(str(self.root / "combined" / "coverage_status.tif"))
        self.assertEqual(palette.GetRasterBand(1).GetRasterColorTable().GetColorEntry(2),
                         (26, 152, 80, 255))
        sample = run_sublot(self.point, self.dsm, self.sublots, "A",
                            self.root / "sample", limit=1, progress=lambda _: None)
        self.assertFalse(sample["complete"])

    def test_cli_defaults_to_all_01c_exposures(self):
        result = {"percent": {"covered": 0, "unseen": 0, "unknown": 100},
                  "complete": False, "exposures_failed": []}
        with patch("main.run_sublot", return_value=result) as calculate:
            self.assertEqual(main([]), 0)
            self.assertEqual(calculate.call_args.args[3], "01C")
            self.assertIsNone(calculate.call_args.kwargs["limit"])
            self.assertEqual(main(["--limit", "10"]), 0)
            self.assertEqual(calculate.call_args.kwargs["limit"], 10)

    def test_failed_camera_footprint_is_unknown(self):
        dataset = gdal.Open(str(self.dsm), gdal.GA_Update)
        dataset.GetRasterBand(1).WriteArray(np.array([[-9999]], dtype=np.float32), 20, 50)
        dataset = None
        summary = run_sublot(self.point, self.dsm, self.sublots, "A",
                             self.root / "failed", progress=lambda _: None)
        self.assertEqual(len(summary["exposures_failed"]), 1)
        self.assertFalse(summary["complete"])
        status = gdal.Open(str(self.root / "failed" / "coverage_status.tif")).ReadAsArray()
        self.assertEqual(int(status[50, 30]), 3)
        self.assertEqual(int(status[90, 20]), 1)


if __name__ == "__main__":
    unittest.main()
