# Every part in a pack's meshes folder, for choosing a kit from: each FBX's size (metres, Blender's:
# z up), where its box starts, its triangles and its materials, as a JSON list. Leaves out the files
# whose names start with any prefix given (the whole scene and the big buildings: slow to read, and
# no kit's part). With the pipeline's Blender Python, from the repository's root:
#   utilities/blenderpipeline/.venv/bin/python -I .claude/skills/import-scene-model/scripts/pieces.py -- <Meshes dir> <out.json> [skip prefix ...]
# (White Castle: SM_Scene SM_B_ SM_SM_B_ SM_Gat_12_ SM_Gat_16_ SM_Gat_Retopo)
import json
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
src, out = args[:2]
skip = tuple(args[2:])
rows = []

for name in sorted(os.listdir(src)):
    if not name.endswith(".fbx") or (skip and name.startswith(skip)):
        continue

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(src, name), use_custom_props=False)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    tris = 0
    materials = set()

    for o in meshes:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
        me = o.data
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        materials |= {m.name for m in me.materials if m}

    rows.append({"name": name[:-4], "size": [round(v, 2) for v in (hi - lo)], "min": [round(v, 2) for v in lo], "tris": tris, "materials": sorted(materials)})
    print(name[:-4], rows[-1]["size"], tris, flush=True)

with open(out, "w") as f:
    json.dump(rows, f, indent=1)
