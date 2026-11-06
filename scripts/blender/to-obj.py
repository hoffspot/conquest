# A model made in Blender (a .blend) or come as an FBX, as one OBJ for scripts/build-props.js
# (scripts/lib/blender.js runs it): the meshes its scene renders, their modifiers applied (a
# mirror's other half made), as they stand in the scene, y up as glTF has it, with where its
# pictures lie on it and its normals; nothing of its materials (build-props gives it its own).
# Run with Blender's Python module (bpy), never running any Python a .blend carries:
#
#   python -I scripts/blender/to-obj.py -- <model.blend or .fbx> <out.obj>
import sys

import bpy

source, out = sys.argv[sys.argv.index("--") + 1 :][:2]

if source.lower().endswith(".blend"):
    bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=source)

layer = bpy.context.view_layer
meshes = [ob for ob in layer.objects if ob.type == "MESH" and not ob.hide_render and ob.visible_get()]

if not meshes:
    raise SystemExit(f"{source}: no mesh to export")

for ob in layer.objects:
    ob.select_set(ob in meshes)

layer.objects.active = meshes[0]
bpy.ops.wm.obj_export(
    filepath=out,
    export_selected_objects=True,
    apply_modifiers=True,
    export_uv=True,
    export_normals=True,
    export_materials=False,
    export_triangulated_mesh=True,
    forward_axis="NEGATIVE_Z",
    up_axis="Y",
)
print(f"{source}: {len(meshes)} mesh(es) into {out}")
