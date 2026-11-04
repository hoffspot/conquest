# A look at a scene from where it's told (Cycles, a few samples): python -I look.py <scene.fbx|.blend> <out.png> <eye x,y,z> <at x,y,z> [lens]
# (Blender's own coordinates: z up; the game's glTF has x, z up as y, -y as z)
import sys
import bpy
from mathutils import Vector

source, out, eye, at = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
lens = float(sys.argv[5]) if len(sys.argv) > 5 else 35
if source.endswith(".blend"):
    bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=source)
scene = bpy.context.scene
camera = bpy.data.objects.new("Look", bpy.data.cameras.new("Look"))
scene.collection.objects.link(camera)
camera.location = Vector(map(float, eye.split(",")))
camera.data.lens = lens
camera.data.clip_end = 5000
direction = Vector(map(float, at.split(","))) - camera.location
camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
scene.camera = camera
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 4
sun.rotation_euler = (0.9, 0.3, 2.6)
scene.collection.objects.link(sun)
world = bpy.data.worlds.new("Sky")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.7, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
scene.world = world
# (Plain clay, the shapes read by their light)
clay = bpy.data.materials.new("Clay")
clay.use_nodes = True
clay.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.75, 0.72, 0.68, 1)
for obj in scene.objects:
    if obj.type == "MESH":
        for slot in obj.material_slots:
            name = slot.material.name if slot.material else ""
            if name.startswith("M_Dress"):
                tint = bpy.data.materials.get("ClayDress") or bpy.data.materials.new("ClayDress")
                tint.use_nodes = True
                tint.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.85, 0.7, 0.5, 1)
                slot.material = tint
            elif name.startswith("M_Rock") or name == "M_Ground":
                slot.material = clay
            else:
                slot.material = clay
scene.render.engine = "CYCLES"
scene.cycles.samples = 12
scene.cycles.device = "CPU"
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print("wrote", out)
