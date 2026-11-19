import tempfile
import unittest
from pathlib import Path

from build_3d_buildings import build_model
import geopandas as gpd
import numpy as np
from osgeo import gdal, osr
from shapely.geometry import box


def crs():
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(32644)
    return srs.ExportToWkt()


class BuildingModelTests(unittest.TestCase):
    def test_height_and_ground_are_kept_separate(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            osm = root / "osm.gpkg"
            output = root / "model.gpkg"
            tiles = root / "tiles"
            tiles.mkdir()
            gpd.GeoDataFrame({"osm_type": ["way", "way"], "osm_id": ["1", "2"]},
                             geometry=[box(10, 10, 20, 20), box(65, 10, 75, 20)],
                             crs="EPSG:32644").to_file(osm, driver="GPKG")
            dsm = gdal.GetDriverByName("GTiff").Create(str(root / "dsm.tif"), 200, 200, 1,
                                                       gdal.GDT_Float32)
            dsm.SetGeoTransform((0, 1, 0, 200, 0, -1))
            dsm.SetProjection(crs())
            dsm.GetRasterBand(1).WriteArray(np.full((200, 200), 100, np.float32))
            dsm.GetRasterBand(1).SetNoDataValue(-9999)
            dsm = None
            tile = gdal.GetDriverByName("GTiff").Create(str(tiles / "height.tif"),
                                                        100, 100, 3, gdal.GDT_Float32)
            tile.SetGeoTransform((0, 0.5, 0, 50, 0, -0.5))
            tile.SetProjection(crs())
            for band, name, value in ((1, "building_fractional_count", 0),
                                      (2, "building_height", 5),
                                      (3, "building_presence", 0.9)):
                tile.GetRasterBand(band).SetDescription(name)
                tile.GetRasterBand(band).WriteArray(np.full((100, 100), value, np.float32))
                tile.GetRasterBand(band).SetNoDataValue(-99)
            tile = None
            summary = build_model(osm, tiles, root / "dsm.tif", output,
                                  progress=lambda _: None)
            self.assertEqual(summary["model_status"], {"ready": 1, "missing_height": 1})
            model = gpd.read_file(output).set_index("osm_id")
            self.assertAlmostEqual(model.loc["1", "height_m"], 5)
            self.assertAlmostEqual(model.loc["1", "base_z_m"], 100)
            self.assertAlmostEqual(model.loc["1", "roof_z_m"], 105)
            self.assertGreater(model.loc["1", "height_support_pixels"], 0)
            self.assertTrue(np.isnan(model.loc["2", "roof_z_m"]))
            self.assertEqual(model.loc["2", "model_status"], "missing_height")
            shifted_output = root / "shifted.gpkg"
            shifted = build_model(osm, tiles, root / "dsm.tif", shifted_output,
                                  offset_east_m=-5, offset_north_m=5,
                                  progress=lambda _: None)
            self.assertEqual((shifted["offset_east_m"], shifted["offset_north_m"]), (-5, 5))
            moved = gpd.read_file(shifted_output).set_index("osm_id")
            self.assertAlmostEqual(moved.loc["1", "geometry"].centroid.x,
                                   model.loc["1", "geometry"].centroid.x - 5)
            self.assertAlmostEqual(moved.loc["1", "geometry"].centroid.y,
                                   model.loc["1", "geometry"].centroid.y + 5)
            self.assertAlmostEqual(gpd.read_file(osm).geometry.iloc[0].centroid.x, 15)


if __name__ == "__main__":
    unittest.main()
