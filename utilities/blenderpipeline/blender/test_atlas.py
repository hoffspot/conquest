"""Tests for atlas.py (no Blender needed): python3 blender/test_atlas.py"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from atlas import pack, shelf_pack  # noqa: E402


def overlaps(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


class ShelfPack(unittest.TestCase):
    def test_rows_tallest_first_and_apart(self):
        places = shelf_pack([(10, 5), (10, 20), (10, 10)], 100, 4)

        self.assertEqual(places, [(30, 2), (2, 2), (16, 2)])

    def test_too_big(self):
        self.assertIsNone(shelf_pack([(60, 60), (60, 60)], 100, 4))


class Pack(unittest.TestCase):
    def check(self, footprints, atlas, gap):
        side, scale, places = pack(footprints, atlas, gap)
        rects = [(x, y, x + max(w, 8) * scale, y + max(h, 8) * scale) for (w, h), (x, y) in zip(footprints, places)]

        for i, a in enumerate(rects):
            # Inside the atlas, gap / 2 from its edges
            self.assertGreaterEqual(min(a[0], a[1]), gap / 2 - 1e-9)
            self.assertLessEqual(max(a[2], a[3]), side - gap / 2 + 1e-9)

            # Apart from every other
            for b in rects[i + 1:]:
                self.assertFalse(overlaps((a[0] - gap / 2, a[1] - gap / 2, a[2] + gap / 2, a[3] + gap / 2), b), (a, b))

        return side, scale, places

    def test_nine_udim_tiles_shrink_to_fit(self):
        # Nine 2048 px tiles in one 2048 px atlas: three across, a third the size, less the gaps
        side, scale, _ = self.check([(2048, 2048)] * 9, 2048, 16)

        self.assertEqual(side, 2048)
        self.assertAlmostEqual(scale, (2048 - 3 * 16) / 3 / 2048, places=2)

    def test_small_content_gets_a_small_atlas(self):
        side, scale, _ = self.check([(100, 100), (40, 40)], 1024, 8)

        self.assertEqual((side, scale), (256, 1.0))

    def test_relative_sizes_kept(self):
        side, scale, places = self.check([(1024, 1024), (256, 256), (512, 128)], 512, 8)

        self.assertEqual(side, 512)
        self.assertLess(scale, 1)

    def test_tiny_and_empty_footprints_get_room(self):
        self.check([(0, 0), (3, 500), (1000, 1000)], 1024, 8)

    def test_nothing(self):
        with self.assertRaises(ValueError):
            pack([], 1024, 8)


if __name__ == "__main__":
    unittest.main()
