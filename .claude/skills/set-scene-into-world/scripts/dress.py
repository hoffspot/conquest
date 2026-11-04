"""A scene's plain faces dressed with its own parts, for the pipeline: a copy of each part where
the placements say, its materials copied as M_Dress_<name> (simplified apart from the rest:
bellhaven-far.json's `simplify.materials`), dark panes behind its windows (M_Dress_Pane), all
joined to the scene (`join`) and saved as a .blend.

    cd utilities/blenderpipeline
    python3 ../../.claude/skills/set-scene-into-world/scripts/backwalls.py > /tmp/placements.json
    .venv/bin/python -I ../../.claude/skills/set-scene-into-world/scripts/dress.py \
        private/white-castle/Meshes/SM_Scene.fbx private/white-castle/Meshes /tmp/placements.json \
        private/white-castle/SM_Scene_dressed.blend

The placements are in the game's own coordinates (glTF's: y up, the scene's back facing -z):
[{ "part", "face": "-z" | "+x" | "-x", "at": [along, up, plane] (the middle of its back's foot,
on the face), "scale": [along, out, up], "pane": true }]: `along` is x on a -z face and z on an x
face; `plane` the face's z, or x.
"""

import json
import math
import sys

import bpy
from mathutils import Matrix, Vector

scene_file, parts, placements_file, out = sys.argv[1:5]
placements = json.load(open(placements_file))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=scene_file, use_anim=True, automatic_bone_orientation=False, ignore_leaf_bones=False, use_custom_props=False)
scene = bpy.context.scene
target = next(o for o in scene.objects if o.type == "MESH" and o.name.startswith("SM_Scene"))

# Each part imported once, out of the scene: its mesh, its bounds where Blender put it
templates = {}


def template(name):
    if name not in templates:
        before = set(scene.objects)
        bpy.ops.import_scene.fbx(filepath=f"{parts}/{name}.fbx", use_custom_props=False)
        meshes = [o for o in scene.objects if o not in before and o.type == "MESH"]
        assert len(meshes) == 1, f"{name}: {len(meshes)} meshes"
        part = meshes[0]
        corners = [part.matrix_world @ Vector(c) for c in part.bound_box]
        lo = Vector([min(c[k] for c in corners) for k in range(3)])
        hi = Vector([max(c[k] for c in corners) for k in range(3)])
        # (Its materials its own copies, M_Dress_<name>)
        for slot in part.material_slots:
            original = slot.material
            # (Each part's import brings its own copy of the scene's material, "M_III_1.001": one
            # M_Dress_ of each name, whichever part it came with)
            dressed = f"M_Dress_{original.name.split('.')[0].removeprefix('M_')}"
            if not bpy.data.materials.get(dressed):
                original.copy().name = dressed
            slot.material = bpy.data.materials[dressed]
        templates[name] = (part, lo, hi)
        for o in [o for o in scene.objects if o not in before and o is not part]:
            bpy.data.objects.remove(o)
    return templates[name]


pane_material = bpy.data.materials.new("M_Dress_Pane")
pane_material.use_nodes = True
bsdf = pane_material.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.035, 0.04, 0.05, 1)
bsdf.inputs["Roughness"].default_value = 0.35

# Which way the face looks out (Blender's: x, y = -glTF z, z up), and the turn that brings a
# part's front (-y) round to it
FACES = {"-z": (Vector((0, 1, 0)), math.pi), "+x": (Vector((1, 0, 0)), math.pi / 2), "-x": (Vector((-1, 0, 0)), -math.pi / 2)}
EMBED = 0.05
# (How far off the wall a pane is, metres: clear of it, behind its tracery's front)
PANE = 0.1
# (How far from the face it's told of the wall's looked for, metres)
NEAR = 2.5
made = 0
missed = []
depsgraph = bpy.context.evaluated_depsgraph_get()

for k, place in enumerate(placements):
    part, lo, hi = template(place["part"])
    normal, turn = FACES[place["face"]]
    along, up, plane = place["at"]
    # (The spot on the face, from the game's coordinates)
    spot = Vector((along, -plane, up)) if place["face"] == "-z" else Vector((plane, -along, up))
    # (Onto the wall where it is: a ray from NEAR metres out, at the part's middle, to the scene's own face)
    middle = spot + Vector((0, 0, (hi.z - lo.z) * place["scale"][2] / 2))
    hit, at, _, _ = target.evaluated_get(depsgraph).ray_cast(target.matrix_world.inverted() @ (middle + normal * NEAR), target.matrix_world.inverted().to_3x3() @ -normal)
    # (Only the face it's told of, within a few metres: not a rock out in front of it)
    off = normal.dot(target.matrix_world @ at - spot) if hit else None
    if off is not None and abs(off) < NEAR:
        spot += normal * off
    else:
        missed.append(k)
    spot -= normal * EMBED
    anchor = Vector(((lo.x + hi.x) / 2, hi.y, lo.z))
    sx, sy, sz = place["scale"]
    matrix = Matrix.Translation(spot) @ Matrix.Rotation(turn, 4, "Z") @ Matrix.Diagonal((sx, sy, sz, 1)) @ Matrix.Translation(-anchor) @ part.matrix_world
    copy = part.copy()
    copy.name = f"Dress_{k}"
    copy.matrix_world = matrix
    scene.collection.objects.link(copy)
    made += 1

    if place.get("pane"):
        # (A dark pane behind its frame: its opening, a pointed top, just off the wall)
        width, height = hi.x - lo.x, hi.z - lo.z
        cx, y = (lo.x + hi.x) / 2, hi.y - (EMBED + PANE) / sy
        x0, x1 = cx - width * 0.36, cx + width * 0.36
        z0, z1, z2 = lo.z + height * 0.04, lo.z + height * 0.8, lo.z + height * 0.93
        mesh = bpy.data.meshes.new(f"Pane_{k}")
        mesh.from_pydata([(x0, y, z0), (x1, y, z0), (x1, y, z1), (cx, y, z2), (x0, y, z1)], [], [(0, 1, 2, 3, 4)])
        mesh.materials.append(pane_material)
        pane = bpy.data.objects.new(f"Dress_{k}_pane", mesh)
        pane.matrix_world = Matrix.Translation(spot) @ Matrix.Rotation(turn, 4, "Z") @ Matrix.Diagonal((sx, sy, sz, 1)) @ Matrix.Translation(-anchor)
        scene.collection.objects.link(pane)

for part, _, _ in templates.values():
    bpy.data.objects.remove(part)

print(f"dressed with {made} parts of {len(templates)} kinds; no wall found behind {missed}")
bpy.ops.wm.save_as_mainfile(filepath=out)
