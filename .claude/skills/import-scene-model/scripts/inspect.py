# A pack's meshes measured, each FBX: its objects' triangles, vertices, materials, UV sets and world
# bounds (metres, Blender's: z up), its triangles by material, and its 40 biggest parts. A line of
# JSON a file, appended to the output. With the pipeline's Blender Python, from the repository's root:
#   utilities/blenderpipeline/.venv/bin/python -I .claude/skills/import-scene-model/scripts/inspect.py -- out.jsonl file.fbx [file.fbx ...]
import json
import os
import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
out_path, files = args[0], args[1:]


def measure(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.fbx(filepath=path, use_custom_props=False)
    if "FINISHED" not in result:
        return {"file": os.path.basename(path), "error": str(result)}
    deps = bpy.context.evaluated_depsgraph_get()
    objects = []
    lo = [1e18] * 3
    hi = [-1e18] * 3
    per_material = {}
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        ev = obj.evaluated_get(deps)
        mesh = ev.to_mesh()
        mw = obj.matrix_world
        tris = 0
        mats = [slot.material.name if slot.material else None for slot in obj.material_slots]
        for poly in mesh.polygons:
            t = len(poly.vertices) - 2
            tris += t
            name = mats[poly.material_index] if poly.material_index < len(mats) else None
            per_material[name] = per_material.get(name, 0) + t
        olo = [1e18] * 3
        ohi = [-1e18] * 3
        for v in mesh.vertices:
            w = mw @ v.co
            for i in range(3):
                olo[i] = min(olo[i], w[i]); ohi[i] = max(ohi[i], w[i])
        for i in range(3):
            lo[i] = min(lo[i], olo[i]); hi[i] = max(hi[i], ohi[i])
        objects.append({"name": obj.name, "tris": tris, "verts": len(mesh.vertices), "materials": mats, "uvs": len(mesh.uv_layers), "size": [round(ohi[i] - olo[i], 3) for i in range(3)], "min": [round(x, 3) for x in olo]})
        ev.to_mesh_clear()
    total = sum(o["tris"] for o in objects)
    return {
        "file": os.path.basename(path),
        "objects": len(objects),
        "tris": total,
        "verts": sum(o["verts"] for o in objects),
        "size": [round(hi[i] - lo[i], 3) for i in range(3)] if objects else None,
        "min": [round(x, 3) for x in lo] if objects else None,
        "perMaterial": per_material,
        "parts": sorted(objects, key=lambda o: -o["tris"])[:40],
    }


with open(out_path, "a") as out:
    for f in files:
        try:
            row = measure(f)
        except Exception as error:  # (a broken file: said so, and on to the next)
            row = {"file": os.path.basename(f), "error": repr(error)}
        out.write(json.dumps(row) + "\n")
        out.flush()
        print(row["file"], row.get("tris"), row.get("size"), flush=True)
