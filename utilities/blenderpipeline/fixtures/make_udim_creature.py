"""Makes the UDIM test creature (fixtures/udim-creature/): a .blend with what the CC0 examples
don't have, to test the pipeline on (test/pipeline.test.js, test/browser.spec.js).

    node build.js --fixtures      (or: .venv/bin/python fixtures/make_udim_creature.py)

udim-creature.blend: a four-segment creature, one mesh with three materials:
  - Skin: its colour from a UDIM image of four tiles (skin.1001.png to skin.1004.png), one solid
    colour each (TILE_COLOURS), one tile for each segment, head to tail;
  - Horn: procedural (noise through a colour ramp, and a bump), metallic;
  - Eye: one flat colour that glows (emission).
It's skinned to an armature (root, tail, body, chest, head) with a control bone that doesn't
deform (CTRL_look) and a custom bone shape (WGT_root) that's shown but mustn't be exported; and
there's a camera, a light and a hidden collider that mustn't be exported either. Actions: Idle
(loops), Crawl (travels 1.5 m forward in its 1 s, and loops), Rear (doesn't loop), Look (only the
control bone).

udim-creature-extra.blend: the same, with one more action, Roar, to be brought in from it.

Made in metres, facing -y (Blender's front: +z in glTF).
"""

import math
import os
import struct
import zlib

# (bpy first: Blender's Python module makes bmesh and mathutils importable)
import bpy  # isort: skip
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "udim-creature")

# The tiles' colours (sRGB), head to tail: 1001 is the head's
TILE_COLOURS = [(220, 40, 40), (40, 200, 60), (50, 80, 230), (230, 200, 30)]
TILE_SIZE = 64

# The bones, head to tail, each with the segment it moves (centre along y, metres)
SEGMENTS = [("head", -0.75), ("chest", -0.25), ("body", 0.25), ("tail", 0.75)]


def write_png(path, width, height, colour):
    """A solid-colour RGB PNG, written by hand (no Blender needed, the same bytes every time)."""
    row = b"\x00" + bytes(colour) * width
    raw = row * height

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    with open(path, "wb") as file:
        file.write(b"\x89PNG\r\n\x1a\n")
        file.write(chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)))
        file.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        file.write(chunk(b"IEND", b""))


def new_material(name):
    material = bpy.data.materials.new(name)

    if bpy.app.version < (5, 0, 0):
        material.use_nodes = True

    return material


def skin_material():
    material = new_material("Skin")
    tree = material.node_tree
    shader = tree.nodes["Principled BSDF"]
    texture = tree.nodes.new("ShaderNodeTexImage")
    image = bpy.data.images.load(os.path.join(HERE, "textures", "skin.1001.png"))
    image.name = "skin"
    image.source = "TILED"
    image.filepath = "//textures/skin.<UDIM>.png"

    for number in range(1002, 1001 + len(TILE_COLOURS)):
        if image.tiles.get(number) is None:
            image.tiles.new(tile_number=number)

    image.reload()
    texture.image = image
    tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.6

    return material


def horn_material():
    material = new_material("Horn")
    tree = material.node_tree
    shader = tree.nodes["Principled BSDF"]
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 12
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.08, 0.05, 0.03, 1)
    ramp.color_ramp.elements[1].color = (0.85, 0.8, 0.65, 1)
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.5
    tree.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    shader.inputs["Metallic"].default_value = 0.8
    shader.inputs["Roughness"].default_value = 0.3

    return material


def eye_material():
    material = new_material("Eye")
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (1.0, 0.75, 0.1, 1)
    shader.inputs["Emission Color"].default_value = (1.0, 0.6, 0.05, 1)
    shader.inputs["Emission Strength"].default_value = 2.0
    shader.inputs["Roughness"].default_value = 0.2

    return material


def build_mesh():
    """One mesh: four boxes (each on its own UDIM tile), a horn and two eyes, weighted to the bones."""
    mesh = bpy.data.meshes.new("Body")
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    deform = bm.verts.layers.deform.new()
    bones = [name for name, _ in SEGMENTS]

    def add(made, material, bone, uv_shift=0.0):
        verts = made["verts"]
        faces = {face for vert in verts for face in vert.link_faces}

        for face in faces:
            face.material_index = material

            for loop in face.loops:
                loop[uv].uv.x += uv_shift

        for vert in verts:
            vert[deform][bones.index(bone)] = 1.0

    for tile, (bone, y) in enumerate(SEGMENTS):
        made = bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True, matrix=Matrix.LocRotScale(Vector((0, y, 0.3)), None, Vector((0.4, 0.45, 0.4))))
        add(made, 0, bone, uv_shift=tile)

    made = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12, radius1=0.08, radius2=0.0, depth=0.3, calc_uvs=True, matrix=Matrix.Translation((0, -0.8, 0.65)))
    add(made, 1, "head")

    for side in (-1, 1):
        made = bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True, matrix=Matrix.LocRotScale(Vector((side * 0.215, -0.85, 0.38)), None, Vector((0.04, 0.08, 0.08))))
        add(made, 2, "head")

    bm.to_mesh(mesh)
    bm.free()

    return mesh, bones


def build_rig(scene):
    data = bpy.data.armatures.new("Rig")
    rig = bpy.data.objects.new("Rig", data)
    scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    root = data.edit_bones.new("root")
    root.head, root.tail = (0, 0, 0), (0, 0, 0.15)
    parent = root

    # (Tail to head, each its segment's length)
    for name, y in reversed(SEGMENTS):
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = (0, y + 0.25, 0.3), (0, y - 0.25, 0.3)
        bone.parent = parent
        bone.use_connect = parent is not root
        parent = bone

    look = data.edit_bones.new("CTRL_look")
    look.head, look.tail = (0, -1.4, 0.4), (0, -1.6, 0.4)
    look.parent = root
    look.use_deform = False
    bpy.ops.object.mode_set(mode="OBJECT")

    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"

    return rig


def key_action(rig, name, frames, pose):
    """An action: pose(bones, frame) sets the bones for each frame keyed."""
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action

    for frame in frames:
        for bone in rig.pose.bones:
            bone.location = (0, 0, 0)
            bone.rotation_euler = (0, 0, 0)

        keyed = pose(rig.pose.bones, frame)

        for bone_name, paths in keyed.items():
            for path in paths:
                rig.pose.bones[bone_name].keyframe_insert(path, frame=frame)

    rig.animation_data.action = None

    return action


def idle(bones, frame):
    wave = math.sin(2 * math.pi * frame / 48)
    bones["head"].rotation_euler.x = 0.15 * wave
    bones["chest"].rotation_euler.x = 0.05 * wave

    return {"head": ["rotation_euler"], "chest": ["rotation_euler"]}


def crawl(bones, frame):
    # 1.5 m forward (-y) in 24 frames, a little bounce, and a wiggle. (A pose bone moves along its
    # own axes: the root points up, so its y is up and its z is forward)
    bones["root"].location = (0, 0.03 * math.sin(4 * math.pi * frame / 24), 1.5 * frame / 24)
    wave = math.sin(2 * math.pi * frame / 24)
    bones["body"].rotation_euler.z = 0.2 * wave
    bones["chest"].rotation_euler.z = -0.2 * wave

    return {"root": ["location"], "body": ["rotation_euler"], "chest": ["rotation_euler"]}


def rear(bones, frame):
    up = math.sin(0.5 * math.pi * min(frame, 24) / 24)
    bones["chest"].rotation_euler.x = 0.6 * up
    bones["head"].rotation_euler.x = -0.3 * up

    return {"chest": ["rotation_euler"], "head": ["rotation_euler"]}


def look(bones, frame):
    bones["CTRL_look"].rotation_euler.z = 0.5 * math.sin(2 * math.pi * frame / 24)

    return {"CTRL_look": ["rotation_euler"]}


def roar(bones, frame):
    shake = math.sin(2 * math.pi * frame / 6) * math.sin(math.pi * frame / 30)
    bones["head"].rotation_euler.x = 0.35 * math.sin(math.pi * frame / 30) + 0.08 * shake
    bones["chest"].rotation_euler.x = 0.2 * math.sin(math.pi * frame / 30)

    return {"head": ["rotation_euler"], "chest": ["rotation_euler"]}


def main():
    os.makedirs(os.path.join(HERE, "textures"), exist_ok=True)

    for tile, colour in enumerate(TILE_COLOURS):
        write_png(os.path.join(HERE, "textures", f"skin.{1001 + tile}.png"), TILE_SIZE, TILE_SIZE, colour)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    main_file = os.path.join(HERE, "udim-creature.blend")

    # (Saved first, so the textures' paths can be relative to it)
    bpy.ops.wm.save_as_mainfile(filepath=main_file)
    scene = bpy.context.scene
    scene.render.fps = 24
    rig = build_rig(scene)

    mesh, bones = build_mesh()
    body = bpy.data.objects.new("Body", mesh)
    scene.collection.objects.link(body)
    body.parent = rig

    for name in bones:
        body.vertex_groups.new(name=name)

    body.modifiers.new("Armature", "ARMATURE").object = rig

    for material in (skin_material(), horn_material(), eye_material()):
        mesh.materials.append(material)

    # A bone's custom shape (shown, but not to be exported), a hidden collider, a camera, a light
    widget = bpy.data.objects.new("WGT_root", bpy.data.meshes.new("WGT_root"))
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, segments=16, radius=0.5)
    bm.to_mesh(widget.data)
    bm.free()
    scene.collection.objects.link(widget)
    rig.pose.bones["root"].custom_shape = widget

    collider = bpy.data.objects.new("Collider", bpy.data.meshes.new("Collider"))
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bm.to_mesh(collider.data)
    bm.free()
    collider.hide_render = True
    scene.collection.objects.link(collider)

    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    camera.location = (4, -4, 2)
    scene.collection.objects.link(camera)
    light = bpy.data.objects.new("Light", bpy.data.lights.new("Light", "SUN"))
    scene.collection.objects.link(light)

    key_action(rig, "Idle", range(0, 49, 4), idle)
    key_action(rig, "Crawl", range(0, 25, 2), crawl)
    key_action(rig, "Rear", range(0, 37, 4), rear)
    key_action(rig, "Look", range(0, 25, 4), look)
    bpy.ops.wm.save_as_mainfile(filepath=main_file, compress=True)

    # The extra file: the same, with Roar
    key_action(rig, "Roar", range(0, 31, 2), roar)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "udim-creature-extra.blend"), compress=True, copy=True)
    print(f"made {main_file} and udim-creature-extra.blend", flush=True)


main()
os._exit(0)
