"""Makes the FBX test creature (fixtures/fbx-creature/): a model as a bought asset comes, in FBX
files with its textures beside them, to test the pipeline on (test/pipeline.test.js,
test/browser.spec.js) without one.

    node build.js --fixtures      (or: .venv/bin/python fixtures/make_fbx_creature.py)

creature.fbx: a little creature as Maya writes one, every name in a namespace ("beast:"): a body
and a head (beast:Body) and teeth (beast:Teeth), with the material beast:skin; two strips of fur
(beast:FurBack, beast:FurMane), with beast:fur; skinned to an armature (beast:rig: hips, spine,
head); and a control object (beast:Ctrl_Hips), as HumanIK's are, with a clip of its own that
mustn't be exported. Its materials name textures that aren't there (old/skin.jpg, old/fur.jpg),
as a bought FBX's do: the config makes them from the files that are. Its clip: Idle (the spine
swaying back and forth, looping).

creature@wave.fbx: the same armature with one more clip, Wave (the spine bending to the side and
back), and the control object's clip with it, as an FBX of animation alone comes.

textures/: the textures, as an asset's come, each made here pixel by pixel (the same bytes every
time): skin_colour.png and skin2_colour.png (another look, for a variant), skin_rough.png,
skin_metal_smooth.png (no metal in red, smoothness in alpha, as Unity packs them),
skin_ao.png, skin_normal.png, skin_glow.png (glowing eyes), and fur_colour.png (strands, with
gaps between them in its alpha).

Made in metres, facing -y (Blender's front: +z in glTF).
"""

import math
import os
import struct
import zlib

# (bpy first: Blender's Python module makes bmesh and mathutils importable)
import bpy  # isort: skip
from mathutils import Vector  # noqa: E402

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fbx-creature")
TEXTURES = os.path.join(HERE, "textures")
SIZE = 128

# The bones (head and tail, metres), and the namespace every name's in
BONES = [("hips", (0, 0, 0.5), (0, 0, 0.8), None), ("spine", (0, 0, 0.8), (0, 0, 1.2), "hips"), ("head", (0, 0, 1.2), (0, 0, 1.5), "spine")]
NS = "beast:"


def write_png(path, width, height, pixel):
    """An RGBA PNG, written by hand from pixel(x, y) -> (r, g, b, a) (0 to 255): the same bytes
    every time."""
    raw = b"".join(b"\x00" + b"".join(bytes(pixel(x, y)) for x in range(width)) for y in range(height))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    with open(path, "wb") as file:
        file.write(b"\x89PNG\r\n\x1a\n")
        file.write(chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)))
        file.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        file.write(chunk(b"IEND", b""))


def textures():
    os.makedirs(TEXTURES, exist_ok=True)
    checker = lambda x, y: ((x // 16) + (y // 16)) % 2  # noqa: E731

    write_png(os.path.join(TEXTURES, "skin_colour.png"), SIZE, SIZE, lambda x, y: (150 + 40 * checker(x, y), 90, 50, 255))
    write_png(os.path.join(TEXTURES, "skin2_colour.png"), SIZE, SIZE, lambda x, y: (60, 70 + 40 * checker(x, y), 150, 255))
    write_png(os.path.join(TEXTURES, "skin_rough.png"), SIZE, SIZE, lambda x, y: (100 + x, 100 + x, 100 + x, 255))
    write_png(os.path.join(TEXTURES, "skin_metal_smooth.png"), SIZE, SIZE, lambda x, y: (0, 0, 0, 255 - (100 + x)))
    write_png(os.path.join(TEXTURES, "skin_ao.png"), SIZE, SIZE, lambda x, y: (255 - y // 2, 255 - y // 2, 255 - y // 2, 255))

    def normal(x, y):
        # (Gentle bumps, pointing out of the surface: OpenGL's convention, glTF's)
        nx = 0.3 * math.sin(x / SIZE * 4 * math.pi)
        ny = 0.3 * math.sin(y / SIZE * 4 * math.pi)
        nz = math.sqrt(max(0.0, 1 - nx * nx - ny * ny))

        return (round((nx + 1) * 127.5), round((ny + 1) * 127.5), round((nz + 1) * 127.5), 255)

    write_png(os.path.join(TEXTURES, "skin_normal.png"), SIZE, SIZE, normal)
    write_png(os.path.join(TEXTURES, "skin_glow.png"), SIZE, SIZE, lambda x, y: (255, 200, 40, 255) if (x - 96) ** 2 + (y - 32) ** 2 < 64 else (0, 0, 0, 255))
    write_png(os.path.join(TEXTURES, "fur_colour.png"), SIZE, SIZE // 2, lambda x, y: (90, 70, 50, 255 if (x // 4) % 2 == 0 and y < 48 else 0))


def material(name, missing):
    """A material naming a texture that isn't there, as a bought FBX's do."""
    made = bpy.data.materials.new(name)

    if bpy.app.version < (5, 0, 0):
        made.use_nodes = True

    image = bpy.data.images.new(missing, 4, 4)
    image.filepath = f"//old/{missing}"
    image.source = "FILE"
    node = made.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    made.node_tree.links.new(node.outputs["Color"], made.node_tree.nodes["Principled BSDF"].inputs["Base Color"])

    return made


def box(name, centre, size, skin):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
    thing = bpy.context.active_object
    thing.name = name
    thing.data.name = name
    thing.scale = size
    bpy.ops.object.transform_apply(scale=True)
    thing.data.materials.append(skin)

    return thing


def strip(name, centre, size, fur):
    bpy.ops.mesh.primitive_plane_add(size=1, location=centre, rotation=(math.pi / 2, 0, 0))
    thing = bpy.context.active_object
    thing.name = name
    thing.data.name = name
    thing.scale = (size[0], size[1], 1)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    thing.data.materials.append(fur)

    return thing


def rig():
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    armature = bpy.context.active_object
    armature.name = f"{NS}rig"
    armature.data.name = f"{NS}rig"
    edit = armature.data.edit_bones
    edit.remove(edit[0])

    for name, head, tail, parent in BONES:
        bone = edit.new(f"{NS}{name}")
        bone.head, bone.tail = Vector(head), Vector(tail)

        if parent:
            bone.parent = edit[f"{NS}{parent}"]

    bpy.ops.object.mode_set(mode="OBJECT")

    return armature


def skin_to(thing, armature, weights):
    """Skinned to the armature: each vertex to the bone nearest it by height (weights: {bone:
    lowest z}), or all to one."""
    for name, *_ in BONES:
        thing.vertex_groups.new(name=f"{NS}{name}")

    for vertex in thing.data.vertices:
        z = (thing.matrix_world @ vertex.co).z
        bone = max((low, name) for name, low in weights.items() if z >= low - 1e-6)[1] if isinstance(weights, dict) else weights
        thing.vertex_groups[f"{NS}{bone}"].add([vertex.index], 1.0, "REPLACE")

    thing.parent = armature
    modifier = thing.modifiers.new("Armature", "ARMATURE")
    modifier.object = armature


def clip(armature, name, bone, axis, angle, frames):
    """An action on the armature: `bone` turned back and forth about `axis` (loops)."""
    action = bpy.data.actions.new(f"{NS}{name}")
    armature.animation_data_create()
    armature.animation_data.action = action
    pose = armature.pose.bones[f"{NS}{bone}"]
    pose.rotation_mode = "XYZ"

    for frame, sign in ((1, 0), (frames // 2, 1), (frames, 0)):
        setattr(pose.rotation_euler, axis, sign * angle)
        pose.keyframe_insert("rotation_euler", frame=frame)

    return action


def control(armature):
    """A control object with a clip of its own, as HumanIK's are: the exporter mustn't take it."""
    bpy.ops.object.empty_add(location=(0, 0, 0.5))
    empty = bpy.context.active_object
    empty.name = f"{NS}Ctrl_Hips"
    empty.animation_data_create()
    empty.animation_data.action = bpy.data.actions.new(f"{NS}Ctrl_Hips|Take 001")

    for frame, z in ((1, 0.5), (12, 0.6), (24, 0.5)):
        empty.location.z = z
        empty.keyframe_insert("location", frame=frame)

    return empty


def export(path, objects):
    bpy.ops.object.select_all(action="DESELECT")

    for thing in objects:
        thing.select_set(True)

    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=True,
        object_types={"ARMATURE", "MESH", "EMPTY"},
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_actions=False,
        bake_anim_use_nla_strips=False,
        bake_anim_force_startend_keying=True,
        path_mode="STRIP",
        embed_textures=False,
    )


def main():
    os.makedirs(HERE, exist_ok=True)
    textures()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 24
    skin = material(f"{NS}skin", "skin.jpg")
    fur = material(f"{NS}fur", "fur.jpg")
    armature = rig()
    body = box(f"{NS}Body", (0, 0, 0.85), (0.4, 0.3, 0.7), skin)
    head = box(f"{NS}Head", (0, 0, 1.35), (0.3, 0.3, 0.3), skin)
    teeth = box(f"{NS}Teeth", (0, -0.16, 1.28), (0.12, 0.04, 0.04), skin)
    back = strip(f"{NS}FurBack", (0, 0.16, 0.9), (0.36, 0.5), fur)
    mane = strip(f"{NS}FurMane", (0, 0.16, 1.3), (0.3, 0.2), fur)

    # (The head joined to the body: one object of two boxes, as the model is)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    head.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()

    skin_to(body, armature, {"hips": 0.0, "spine": 0.8, "head": 1.2})
    skin_to(teeth, armature, "head")
    skin_to(back, armature, "spine")
    skin_to(mane, armature, "head")
    empty = control(armature)
    everything = [armature, body, teeth, back, mane, empty]

    scene.frame_start, scene.frame_end = 1, 24
    clip(armature, "Idle", "spine", "x", 0.15, 24)
    export(os.path.join(HERE, "creature.fbx"), everything)

    scene.frame_start, scene.frame_end = 1, 16
    clip(armature, "Wave", "spine", "z", 0.6, 16)
    export(os.path.join(HERE, "creature@wave.fbx"), [armature, empty])


main()
