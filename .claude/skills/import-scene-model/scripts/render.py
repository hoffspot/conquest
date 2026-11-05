# An FBX drawn in clay from three sides (two from low down, one from above), each material a pale
# tint of its own (rock grey, ground green, glass blue, details gold), so its shapes and how it's made
# up read. Cycles, on the CPU. With the pipeline's Blender Python, from the repository's root:
#   utilities/blenderpipeline/.venv/bin/python -I .claude/skills/import-scene-model/scripts/render.py -- <out prefix> file.fbx [width] [samples]
# writes <out prefix>-a.png, -b.png and -c.png.
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
prefix, path = args[0], args[1]
width = int(args[2]) if len(args) > 2 else 1000
samples = int(args[3]) if len(args) > 3 else 12

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=path, use_custom_props=False)

TINTS = {"Rock": (0.42, 0.40, 0.37), "Ground": (0.35, 0.38, 0.30), "Glass": (0.45, 0.6, 0.75), "Floor": (0.6, 0.58, 0.52), "Wall": (0.8, 0.78, 0.74), "Details": (0.75, 0.62, 0.35)}
palette = [(0.93, 0.92, 0.88), (0.88, 0.86, 0.80), (0.85, 0.80, 0.70), (0.90, 0.88, 0.92), (0.82, 0.84, 0.86), (0.92, 0.85, 0.75)]
for k, mat in enumerate(bpy.data.materials):
    tint = next((c for key, c in TINTS.items() if key in mat.name), palette[k % len(palette)])
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*tint, 1)
    bsdf.inputs["Roughness"].default_value = 0.8
    out = nodes.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

lo = Vector((1e18,) * 3); hi = Vector((-1e18,) * 3)
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        for c in obj.bound_box:
            w = obj.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
centre = (lo + hi) / 2
radius = (hi - lo).length / 2

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = samples
scene.cycles.use_denoising = False
scene.cycles.threads_mode = "FIXED"
scene.cycles.threads = 2
scene.render.resolution_x = width
scene.render.resolution_y = int(width * 0.62)
scene.render.film_transparent = False
world = bpy.data.worlds.new("sky"); scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.65, 0.8, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); scene.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), 0, math.radians(35))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.lens = 35; cam.data.clip_end = radius * 20

for name, (yaw, pitch) in {"a": (35, 22), "b": (215, 22), "c": (125, 55)}.items():
    d = 2.25 * radius
    y, p = math.radians(yaw), math.radians(pitch)
    cam.location = centre + Vector((math.cos(y) * math.cos(p), math.sin(y) * math.cos(p), math.sin(p))) * d
    direction = centre - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = f"{prefix}-{name}.png"
    bpy.ops.render.render(write_still=True)
    print("rendered", scene.render.filepath, flush=True)
