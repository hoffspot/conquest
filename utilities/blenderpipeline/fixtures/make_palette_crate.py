"""Makes the palette crate (fixtures/palette-crate/): a .blend whose two materials take their
colours from one palette, every face's UVs on a single point of it, as low-poly models often are
(test/pipeline.test.js).

    node build.js --fixtures      (or: .venv/bin/python fixtures/make_palette_crate.py)

palette-crate.blend: a crate, its boards Wood and its corners Iron, both reading palette.png (two
pixels: brown, grey). Baking can't sample faces whose UVs cover no area, so the pipeline keeps its
two materials as they are rather than merging them onto an atlas.
"""

import os
import struct
import zlib

# (bpy first: Blender's Python module makes bmesh and mathutils importable)
import bpy  # isort: skip
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "palette-crate")

# The palette's pixels (sRGB), left to right, and the UV point of each
PALETTE = [(120, 78, 40), (110, 112, 118)]
POINTS = [(0.25, 0.5), (0.75, 0.5)]


def write_png(path, pixels):
    """A one-row RGB PNG, written by hand (the same bytes every time)."""
    raw = b"\x00" + b"".join(bytes(pixel) for pixel in pixels)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    with open(path, "wb") as file:
        file.write(b"\x89PNG\r\n\x1a\n")
        file.write(chunk(b"IHDR", struct.pack(">IIBBBBB", len(pixels), 1, 8, 2, 0, 0, 0)))
        file.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        file.write(chunk(b"IEND", b""))


def palette_material(name, image):
    material = bpy.data.materials.new(name)

    if bpy.app.version < (5, 0, 0):
        material.use_nodes = True

    tree = material.node_tree
    texture = tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Closest"
    tree.links.new(texture.outputs["Color"], tree.nodes["Principled BSDF"].inputs["Base Color"])

    return material


def main():
    os.makedirs(HERE, exist_ok=True)
    write_png(os.path.join(HERE, "palette.png"), PALETTE)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    path = os.path.join(HERE, "palette-crate.blend")
    bpy.ops.wm.save_as_mainfile(filepath=path)

    image = bpy.data.images.load(os.path.join(HERE, "palette.png"))
    image.filepath = "//palette.png"
    mesh = bpy.data.meshes.new("Crate")
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")

    # The boards: a box; the corners: four posts a little proud of it
    parts = [(Vector((0, 0, 0.4)), Vector((0.8, 0.8, 0.8)), 0)]
    parts += [(Vector((x * 0.4, y * 0.4, 0.4)), Vector((0.1, 0.1, 0.84)), 1) for x in (-1, 1) for y in (-1, 1)]

    for centre, size, material in parts:
        made = bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.LocRotScale(centre, None, size))

        for face in {face for vert in made["verts"] for face in vert.link_faces}:
            face.material_index = material

            for loop in face.loops:
                loop[uv].uv = POINTS[material]

    bm.to_mesh(mesh)
    bm.free()

    for name in ("Wood", "Iron"):
        mesh.materials.append(palette_material(name, image))

    crate = bpy.data.objects.new("Crate", mesh)
    bpy.context.scene.collection.objects.link(crate)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print(f"made {path}", flush=True)


main()
os._exit(0)
