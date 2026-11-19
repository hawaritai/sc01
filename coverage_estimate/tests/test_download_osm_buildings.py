import tempfile
import unittest
from pathlib import Path

from download_osm_buildings import download_buildings
import geopandas as gpd
import pandas as pd
from shapely.geometry import box, Point


class DownloadBuildingsTests(unittest.TestCase):
    def test_polygon_selection_clipping_and_osm_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            aoi = root / "aoi.gpkg"
            output = root / "buildings.gpkg"
            gpd.GeoDataFrame({"Sub-Lots": ["01C", "01D"]},
                             geometry=[box(0, 0, 1000, 1000), box(2000, 0, 3000, 1000)],
                             crs="EPSG:3857").to_file(aoi, driver="GPKG")

            def fake_query(polygon):
                self.assertLess(polygon.bounds[2], 1)  # OSMnx receives lon/lat.
                inside = box(0.001, 0.001, 0.004, 0.004)
                outside = box(1, 1, 1.001, 1.001)
                return gpd.GeoDataFrame(
                    {"building": ["yes", "yes", "yes"], "height": ["9", None, None]},
                    geometry=[inside, outside, Point(0.002, 0.002)], crs="EPSG:4326",
                    index=pd.MultiIndex.from_tuples([("way", 11), ("way", 12), ("node", 13)]),
                )

            summary = download_buildings(aoi, "01C", output, query=fake_query)
            self.assertEqual(summary["clipped_buildings"], 1)
            self.assertEqual(summary["with_osm_height_tag"], 1)
            self.assertTrue(output.with_suffix(".summary.json").is_file())
            saved = gpd.read_file(output)
            self.assertEqual(saved.crs.to_epsg(), 3857)
            self.assertEqual(saved.loc[0, "osm_id"], "11")
            self.assertEqual(saved.loc[0, "osm_type"], "way")
            self.assertLess(saved.geometry.iloc[0].area, 1000 * 1000)
            with self.assertRaises(FileExistsError):
                download_buildings(aoi, "01C", output, query=fake_query)


if __name__ == "__main__":
    unittest.main()
