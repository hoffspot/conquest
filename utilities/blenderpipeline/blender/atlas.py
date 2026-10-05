"""Lays out a texture atlas: packs rectangles (each the share of a mesh's UVs one material, or one
UDIM tile, covers, in pixels at its own texture's resolution) into one square texture, drawn as
large as they fit, keeping their sizes relative to each other.

Pure Python (no Blender), so it can be tested on its own: python3 blender/test_atlas.py
"""

import math

# The smallest atlas made, and the smallest share one rectangle is given (pixels)
MIN_SIDE = 64
MIN_FOOTPRINT = 8


def shelf_pack(sizes, side, gap):
    """Places rectangles ([(w, h)], pixels) in a side x side square, in rows (shelves), tallest
    first. Each is kept `gap` pixels from the others and gap / 2 from the edges. Returns each
    one's bottom-left corner, in the order given, or None if they don't fit."""
    order = sorted(range(len(sizes)), key=lambda i: (-sizes[i][1], -sizes[i][0], i))
    edge = gap / 2
    places = [None] * len(sizes)
    x = y = edge
    shelf = 0.0

    for i in order:
        w, h = sizes[i]

        if x + w + edge > side:
            x = edge
            y += shelf + gap
            shelf = 0.0

        if x + w + edge > side or y + h + edge > side:
            return None

        places[i] = (x, y)
        x += w + gap
        shelf = max(shelf, h)

    return places


def pack(footprints, atlas_size, gap):
    """Packs footprints ([(w, h)], pixels at their textures' own resolution) into a square atlas
    at most `atlas_size` pixels across, `gap` pixels apart. Returns (side, scale, places): the
    atlas's side (a power of two), the scale every footprint is drawn at (1 or less), and where
    each is placed (bottom-left corners, whole pixels)."""
    if not footprints:
        raise ValueError("nothing to pack")

    sizes = [(max(w, MIN_FOOTPRINT), max(h, MIN_FOOTPRINT)) for w, h in footprints]

    def placed(scale, side):
        # (Whole pixels, so each one's texels line up with the atlas's)
        scaled = [(math.ceil(w * scale), math.ceil(h * scale)) for w, h in sizes]
        found = shelf_pack(scaled, side, gap)

        return found and [(math.ceil(x), math.ceil(y)) for x, y in found]

    # Everything at full size, in the smallest atlas it fits in
    if placed(1, atlas_size):
        side = atlas_size

        while side // 2 >= MIN_SIDE and placed(1, side // 2):
            side //= 2

        return side, 1.0, placed(1, side)

    # Or shrunk, as little as it must be, to fit the largest atlas allowed
    low, high = 0.0, 1.0

    for _ in range(40):
        middle = (low + high) / 2

        if placed(middle, atlas_size):
            low = middle
        else:
            high = middle

    if low <= 0 or not placed(low, atlas_size):
        raise ValueError(f"{len(sizes)} rectangles don't fit a {atlas_size} px atlas {gap} px apart")

    return atlas_size, low, placed(low, atlas_size)
