"""The Blender stage of the pipeline (README.md): opens a .blend (or imports an .fbx, .glb or
.gltf), makes the materials given from texture files, picks what's to be exported and the actions
to go with it (from other .blend or .fbx files too), joins the objects asked to be one, bakes the
materials glTF can't carry (UDIM tiles, procedural or mixed shaders, several materials on one
mesh) onto one texture atlas, shrinks textures that are too big, and writes a GLB (and one for each
variant's materials), with a report of what it did (JSON).

build.js runs it with Blender's Python module (bpy, `npm run setup`) or with Blender itself:

    .venv/bin/python blender/export.py -- --job job.json
    blender --background --factory-startup --python-exit-code 1 --python blender/export.py -- --job job.json

The job is an asset's config (lib/config.js) with its paths made absolute, and `out` and `report`
(the files to write).
"""

import fnmatch
import json
import os
import re
import sys
import time
import traceback

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from atlas import pack  # noqa: E402

REPORT = {"warnings": [], "notes": []}

# Where each baked pass is saved as it's made (a PNG), if anywhere (build.js --keep)
PASSES = {"folder": None}

# Shader nodes the glTF exporter reads when they lead into a Principled BSDF: anything else (a
# mix, a ramp, a procedural texture, a bump) it can't carry, and the material's baked instead
EXPORTABLE = {"TEX_IMAGE", "NORMAL_MAP", "SEPARATE_COLOR", "SEPRGB", "SEPARATE_RGB", "UVMAP", "MAPPING", "TEX_COORD", "VERTEX_COLOR", "ATTRIBUTE", "REROUTE"}

# The Principled BSDF's inputs that are baked, and the texture each goes into
BAKED_INPUTS = {"basecolor": "Base Color", "alpha": "Alpha", "roughness": "Roughness", "metallic": "Metallic"}

# A bone's channel in an action: pose.bones["name"]...
BONE_PATH = re.compile(r'^pose\.bones\["((?:[^"\\]|\\.)*)"\]')

ATLAS_UV = "AtlasUV"


class PipelineError(Exception):
    pass


def log(message):
    print(f"[blender] {message}", flush=True)


def warn(message):
    REPORT["warnings"].append(message)
    log(f"warning: {message}")


def note(message):
    REPORT["notes"].append(message)
    log(message)


def job_from_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]

    if len(argv) != 2 or argv[0] != "--job":
        raise PipelineError("usage: export.py -- --job job.json")

    with open(argv[1], encoding="utf-8") as file:
        return json.load(file)


def new_material(name):
    material = bpy.data.materials.new(name)

    # (Materials always have nodes from Blender 5; before, they must be asked for)
    if bpy.app.version < (5, 0, 0):
        material.use_nodes = True

    return material


def deselect_all():
    # (Not the operator: it needs a window to run in)
    for thing in bpy.context.view_layer.objects:
        thing.select_set(False)


def set_colorspace(image, data):
    for name in (["Non-Color", "Raw", "Linear"] if data else ["sRGB"]):
        try:
            image.colorspace_settings.name = name
            return
        except TypeError:
            continue


# --- What's exported -------------------------------------------------------------------------


def open_source(path):
    if not os.path.isfile(path):
        raise PipelineError(f"no such file: {path}")

    kind = os.path.splitext(path)[1].lower()

    if kind != ".blend":
        # Imported into an empty scene: an FBX as Maya, 3ds Max, Unity or Unreal write them (its
        # textures given as materials if they're elsewhere), a glTF as it is
        bpy.ops.wm.read_factory_settings(use_empty=True)
        REPORT["sourceFormat"] = kind[1:]

        if kind == ".fbx":
            import_fbx(path)
        else:
            bpy.ops.import_scene.gltf(filepath=path)

        return

    bpy.ops.wm.open_mainfile(filepath=path, load_ui=False)
    REPORT["savedWith"] = ".".join(str(part) for part in bpy.data.version)

    # (Major and minor only: the file's third number is its format's, not Blender's patch)
    if tuple(bpy.data.version[:2]) > tuple(bpy.app.version[:2]):
        warn(f"{os.path.basename(path)} was saved by Blender {REPORT['savedWith']}, newer than this one ({bpy.app.version_string}): check the result")


def import_fbx(path):
    """Imports an FBX: its skeleton's bones as they were (not turned to point along their chains,
    which would change the rest pose its clips are relative to), its clips, its leaf bones."""
    result = bpy.ops.import_scene.fbx(filepath=path, use_anim=True, automatic_bone_orientation=False, ignore_leaf_bones=False, use_custom_props=False)

    if "FINISHED" not in result:
        raise PipelineError(f"Blender couldn't import {os.path.basename(path)} ({result})")


# --- Namespaces ------------------------------------------------------------------------------


def bare(name):
    """A name without its namespaces: "rig:Basemesh:pelvis" is "pelvis"."""
    return name.rsplit(":", 1)[-1] if ":" in name else name


def strip_action_namespaces(action):
    """An action's bone channels named without their bones' namespaces."""
    for fcurve in object_fcurves(action):
        match = BONE_PATH.match(fcurve.data_path)

        if match and ":" in match.group(1):
            fcurve.data_path = f'pose.bones["{bare(match.group(1))}"]{fcurve.data_path[match.end():]}'

    for group in getattr(action, "groups", []):
        group.name = bare(group.name)


def rename(thing, name, what):
    if thing.name == name:
        return

    taken = what.get(name) if hasattr(what, "get") else None
    thing.name = name

    if taken is not None and taken != thing:
        warn(f"{name} is two things' name without their namespaces: one's called {thing.name}")


def strip_namespaces():
    """Takes "namespace:" off every object's, bone's, material's, image's and action's name (Maya
    writes them into FBX files: "Basemesh_rig:pelvis")."""
    stripped = 0

    for armature in bpy.data.armatures:
        for bone in armature.bones:
            if ":" in bone.name:
                # (Renaming a bone renames the vertex groups it moves, and the channels of the
                # actions playing on it; the others' are renamed below)
                bone.name = bare(bone.name)
                stripped += 1

    for action in bpy.data.actions:
        strip_action_namespaces(action)

    for collection in (bpy.data.objects, bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images, bpy.data.actions):
        for thing in list(collection):
            if ":" in thing.name:
                rename(thing, bare(thing.name), collection)
                stripped += 1

    for thing in bpy.data.objects:
        for group in thing.vertex_groups:
            if ":" in group.name:
                group.name = bare(group.name)

    if stripped:
        note(f"namespaces taken off {stripped} names")


def pick_objects(job, scene):
    """The meshes to export, and the armature deforming them (one at most)."""
    shapes = set()

    for thing in bpy.data.objects:
        if thing.type == "ARMATURE" and thing.pose:
            shapes.update(bone.custom_shape for bone in thing.pose.bones if bone.custom_shape)

    if job.get("objects"):
        missing = [name for name in job["objects"] if name not in bpy.data.objects]

        if missing:
            raise PipelineError(f"no objects named {', '.join(missing)}")

        picked = [bpy.data.objects[name] for name in job["objects"]]
    elif job.get("collection"):
        collection = bpy.data.collections.get(job["collection"])

        if collection is None:
            raise PipelineError(f"no collection named {job['collection']}")

        picked = list(collection.all_objects)
    else:
        picked = [thing for thing in scene.objects if thing.type == "MESH" and thing not in shapes and thing.visible_get() and not thing.hide_render]

    meshes = [thing for thing in picked if thing.type == "MESH"]
    armatures = [thing for thing in picked if thing.type == "ARMATURE"]

    for mesh in meshes:
        deformers = [modifier.object for modifier in mesh.modifiers if modifier.type == "ARMATURE" and modifier.object]
        parent = mesh.parent

        while parent:
            if parent.type == "ARMATURE":
                deformers.append(parent)

            parent = parent.parent

        armatures.extend(deformer for deformer in deformers if deformer not in armatures)

    if not meshes:
        raise PipelineError("nothing to export: no mesh shown and rendered in the scene (or name them: objects, collection)")

    if len(armatures) > 1:
        raise PipelineError(f"more than one armature ({', '.join(a.name for a in armatures)}): export one at a time (objects, collection)")

    outside = [thing.name for thing in meshes + armatures if thing.name not in scene.objects]

    if outside:
        raise PipelineError(f"not in the scene {scene.name!r}: {', '.join(outside)}")

    skipped = sorted(thing.name for thing in scene.objects if thing not in meshes and thing not in armatures)

    if skipped:
        note(f"not exported: {', '.join(skipped)}")

    return meshes, (armatures[0] if armatures else None)


# --- Actions ---------------------------------------------------------------------------------


def object_fcurves(action):
    """The F-curves an action has for objects (not for shape keys, materials...)."""
    layers = getattr(action, "layers", None)

    # (Layered actions, with slots: Blender 4.4 and later)
    if layers is not None and len(layers):
        for layer in layers:
            for strip in layer.strips:
                for bag in getattr(strip, "channelbags", []):
                    if bag.slot is None or bag.slot.target_id_type == "OBJECT":
                        yield from bag.fcurves

        return

    if getattr(action, "id_root", "OBJECT") in ("OBJECT", ""):
        yield from getattr(action, "fcurves", [])


def animated_bones(action, armature):
    bones = set(armature.pose.bones.keys())
    found = set()

    for fcurve in object_fcurves(action):
        match = BONE_PATH.match(fcurve.data_path)

        if match:
            name = match.group(1).replace('\\"', '"').replace("\\\\", "\\")

            if name in bones:
                found.add(name)

    return found


class _nothing:
    """A stand-in for bpy.data.libraries.load, for the file that's open."""

    def __enter__(self):
        return None, None

    def __exit__(self, *_):
        return False


def matches(name, patterns):
    return any(fnmatch.fnmatchcase(name, pattern) for pattern in patterns)


def import_fbx_actions(path, strip, scene):
    """The clips an FBX brings that move a skeleton's bones (its armature's own); everything else
    it brings (its objects, their meshes and materials, the clips of a rig's control objects, as
    Maya's HumanIK has) left behind."""
    objects = set(bpy.data.objects)
    actions = set(bpy.data.actions)
    blocks = {kind: set(getattr(bpy.data, kind)) for kind in ("meshes", "armatures", "materials", "images", "cameras", "lights")}
    fps = (scene.render.fps, scene.render.fps_base)
    import_fbx(path)

    # (Its clips keep their own frames: the scene's rate stays the source's)
    scene.render.fps, scene.render.fps_base = fps
    brought = [thing for thing in bpy.data.objects if thing not in objects]
    kept = []

    for thing in brought:
        if thing.type == "ARMATURE" and thing.animation_data:
            for action in [thing.animation_data.action] + [strip.action for track in thing.animation_data.nla_tracks for strip in track.strips]:
                if action and action not in kept:
                    kept.append(action)

    for action in list(bpy.data.actions):
        if action not in actions and action not in kept:
            bpy.data.actions.remove(action)

    for thing in brought:
        bpy.data.objects.remove(thing, do_unlink=True)

    for kind, before in blocks.items():
        for block in list(getattr(bpy.data, kind)):
            if block not in before and block.users == 0:
                getattr(bpy.data, kind).remove(block)

    if not kept:
        raise PipelineError(f"{os.path.basename(path)} has no clip moving a skeleton's bones")

    for action in kept:
        # (Kept with nothing playing it)
        action.use_fake_user = True

        if strip:
            strip_action_namespaces(action)

            # (Often the same name as one there already, "Take 001": named in its actions entry)
            action.name = bare(action.name)

    return kept


def gather_actions(job, armature, scene):
    """Brings in the actions from other files, picks those to export (removing the rest, so the
    exporter takes only those), and names them as they're to be called."""
    origin = {}

    for spec in job.get("actions", []):
        path = spec["from"]

        if not os.path.isfile(path):
            raise PipelineError(f"no such file: {path}")

        if path.lower().endswith(".fbx"):
            brought = import_fbx_actions(path, job.get("stripNamespaces", True), scene)
            available = sorted(action.name for action in brought)
            names = [spec["action"]] if spec.get("action") else available
            missing = [name for name in names if name not in available]

            if missing:
                raise PipelineError(f"{os.path.basename(path)} has no clip {', '.join(missing)} moving a skeleton (it has: {', '.join(available)})")

            for action in brought:
                if action.name not in names:
                    bpy.data.actions.remove(action)

            loaded = [bpy.data.actions[name] for name in names]
        else:
            # (The file that's open has its actions already: Blender can't load from it)
            same = bool(bpy.data.filepath) and os.path.samefile(path, bpy.data.filepath)

            with bpy.data.libraries.load(path, link=False) if not same else _nothing() as (source, target):
                available = sorted(action.name for action in bpy.data.actions) if same else sorted(source.actions)
                names = [spec["action"]] if spec.get("action") else available
                missing = [name for name in names if name not in available]

                if missing:
                    raise PipelineError(f"{os.path.basename(path)} has no action {', '.join(missing)} (it has: {', '.join(available) or 'none'})")

                # (A copy: Blender fills the list it's given with what it loads)
                if not same:
                    target.actions = list(names)

            loaded = [bpy.data.actions[name] for name in names] if same else [action for action in target.actions if action is not None]

            if job.get("stripNamespaces", True):
                for action in loaded:
                    strip_action_namespaces(action)

        if spec.get("name"):
            if len(loaded) != 1:
                raise PipelineError(f"{os.path.basename(path)}: `name` needs one action (`action`), not {len(loaded)}")

            loaded[0].name = spec["name"]

            if loaded[0].name != spec["name"]:
                raise PipelineError(f"there's an action called {spec['name']} already: give {os.path.basename(path)}'s another name")
        else:
            # (Blender renames one brought in under a name that's taken: Idle.001)
            for name, action in zip(names, loaded):
                if action.name != name:
                    warn(f"{os.path.basename(path)}'s {name} is called {action.name} here, as there's an action called {name} already: name it (actions[].name)")

        for action in loaded:
            origin[action.name] = os.path.basename(path)

    clips = job.get("clips", {})
    include = clips.get("include") or ["*"]
    exclude = clips.get("exclude") or []
    rename = clips.get("rename") or {}
    chosen = []
    dropped = []

    for action in bpy.data.actions:
        bones = animated_bones(action, armature) if armature else set()

        if not bones:
            dropped.append(f"{action.name} (animates no bone)")
        elif not matches(action.name, include) or matches(action.name, exclude):
            dropped.append(f"{action.name} (left out)")
        else:
            chosen.append(action)

    if dropped:
        note(f"actions not exported: {', '.join(dropped)}")

    for action in list(bpy.data.actions):
        if action not in chosen:
            bpy.data.actions.remove(action)

    unknown = [name for name in rename if name not in [action.name for action in chosen]]

    if unknown:
        raise PipelineError(f"clips.rename names actions not exported: {', '.join(unknown)}")

    names = [rename.get(action.name, action.name) for action in chosen]
    doubled = sorted({name for name in names if names.count(name) > 1})

    if doubled:
        raise PipelineError(f"two clips would be called {', '.join(doubled)}: rename them (clips.rename)")

    # (Rename in two steps, so one swapping names with another isn't renamed .001)
    for action in chosen:
        action.name = f"__clip__{action.name}"

    fps = scene.render.fps / scene.render.fps_base
    actions = []

    for action, name in zip(chosen, names):
        source = origin.get(action.name[len("__clip__"):])
        action.name = name
        start, end = action.frame_range
        actions.append({"name": name, "from": source, "frames": [start, end], "seconds": (end - start) / fps, "bones": len(animated_bones(action, armature))})

    if armature is not None:
        # Nothing playing on it: the exporter takes every action fitting a lone armature, each
        # once, and its rest pose from its bones' rest positions
        armature.animation_data_create()
        armature.animation_data.action = None

        for track in list(armature.animation_data.nla_tracks):
            armature.animation_data.nla_tracks.remove(track)

    if armature is None and job.get("actions"):
        raise PipelineError("actions were given, but nothing exported has an armature")

    REPORT["fps"] = fps
    REPORT["actions"] = actions

    return chosen


# --- Materials from texture files ------------------------------------------------------------

CHANNELS = {"R": 0, "G": 1, "B": 2, "A": 3}

# Each texture file read, by (file, largest size): its pixels and the size it was
TEXTURE_FILES = {}


def load_texture(file, limit):
    """A texture file's pixels (rows, columns, RGBA, as stored, 0 to 1), shrunk to `limit` pixels
    at most (None: as it is). Read once, however many maps take from it."""
    key = (file, limit)

    if key not in TEXTURE_FILES:
        if not os.path.isfile(file):
            raise PipelineError(f"no such texture: {file}")

        image = bpy.data.images.load(file, check_existing=False)
        width, height = image.size

        if not width:
            raise PipelineError(f"Blender can't read the texture {os.path.basename(file)}")

        if limit and max(width, height) > limit:
            factor = limit / max(width, height)
            image.scale(max(1, round(width * factor)), max(1, round(height * factor)))

        w, h = image.size
        pixels = np.empty(w * h * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        bpy.data.images.remove(image)
        TEXTURE_FILES[key] = (pixels.reshape(h, w, 4), [width, height])

    return TEXTURE_FILES[key]


def resized(pixels, shape):
    """Pixels scaled to (rows, columns), as Blender scales an image."""
    if pixels.shape[:2] == tuple(shape):
        return pixels

    image = bpy.data.images.new("__resize", pixels.shape[1], pixels.shape[0], alpha=True, float_buffer=True)
    image.pixels.foreach_set(np.ascontiguousarray(pixels, dtype=np.float32).ravel())
    image.scale(shape[1], shape[0])
    out = np.empty(shape[0] * shape[1] * 4, dtype=np.float32)
    image.pixels.foreach_get(out)
    bpy.data.images.remove(image)

    return out.reshape(shape[0], shape[1], 4)


def grey(spec, limit, shape):
    """One channel of a texture (spec: { file, channel, invert }), at `shape` (rows, columns)."""
    pixels, _ = load_texture(spec["file"], limit)
    channel = resized(pixels, shape)[..., CHANNELS[spec.get("channel", "R")]]

    return 1 - channel if spec.get("invert") else channel


def image_of(name, pixels, data):
    """An image made from pixels (rows, columns, RGBA), packed, as the exporter will write it."""
    rows, columns = pixels.shape[:2]
    image = bpy.data.images.new(name, columns, rows, alpha=True)
    set_colorspace(image, data)
    image.pixels.foreach_set(np.ascontiguousarray(pixels, dtype=np.float32).ravel())
    image.pack()

    return image


def make_material(name, spec, limit):
    """A material from texture files (materials.<name>, README.md): only the maps it's given, a
    Principled BSDF as the glTF exporter reads it; occlusion, roughness and metallic in one
    texture (red, green, blue) when any of them is a texture."""
    material = new_material(name)
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    alpha = spec.get("alpha", "opaque")
    made = {"material": name, "alpha": alpha.upper(), "textures": {}}

    def texture(image, kind, original):
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        made["textures"][kind] = {"size": list(image.size), "from": original}

        return node

    if "baseColor" in spec or "alphaMap" in spec:
        if "baseColor" in spec:
            pixels, original = load_texture(spec["baseColor"]["file"], limit)
            rgba = pixels.copy()
        else:
            pixels, original = load_texture(spec["alphaMap"]["file"], limit)
            rgba = np.ones_like(pixels)

        if alpha == "opaque":
            rgba[..., 3] = 1
        elif "alphaMap" in spec:
            rgba[..., 3] = grey(spec["alphaMap"], limit, rgba.shape[:2])

        node = texture(image_of(f"{name}_basecolor", rgba, False), "baseColor", original)

        if "baseColor" in spec:
            tree.links.new(node.outputs["Color"], shader.inputs["Base Color"])

        if alpha == "mask":
            # (Rounded: the exporter makes it a mask, cut off at a half)
            rounded = tree.nodes.new("ShaderNodeMath")
            rounded.operation = "ROUND"
            tree.links.new(node.outputs["Alpha"], rounded.inputs[0])
            tree.links.new(rounded.outputs[0], shader.inputs["Alpha"])
        elif alpha == "blend":
            tree.links.new(node.outputs["Alpha"], shader.inputs["Alpha"])

            if hasattr(material, "surface_render_method"):
                material.surface_render_method = "BLENDED"
            else:
                material.blend_method = "BLEND"

    maps = {kind: spec[kind] for kind in ("occlusion", "roughness", "metallic") if isinstance(spec.get(kind), dict)}

    if maps:
        loaded = {kind: load_texture(map_["file"], limit) for kind, map_ in maps.items()}
        shape = max((pixels.shape[:2] for pixels, _ in loaded.values()), key=lambda rows_columns: rows_columns[0] * rows_columns[1])
        orm = np.ones((*shape, 4), dtype=np.float32)
        orm[..., 0] = grey(maps["occlusion"], limit, shape) if "occlusion" in maps else 1
        orm[..., 1] = grey(maps["roughness"], limit, shape) if "roughness" in maps else spec.get("roughness", 0.5)
        orm[..., 2] = grey(maps["metallic"], limit, shape) if "metallic" in maps else spec.get("metallic", 0)
        node = texture(image_of(f"{name}_orm", orm, True), "occlusionRoughnessMetallic", {kind: original for kind, (_, original) in loaded.items()})
        split = tree.nodes.new("ShaderNodeSeparateColor")
        tree.links.new(node.outputs["Color"], split.inputs["Color"])
        tree.links.new(split.outputs["Green"], shader.inputs["Roughness"])
        tree.links.new(split.outputs["Blue"], shader.inputs["Metallic"])

        if "occlusion" in maps:
            group = tree.nodes.new("ShaderNodeGroup")
            group.node_tree = occlusion_group()
            tree.links.new(split.outputs["Red"], group.inputs["Occlusion"])
    else:
        shader.inputs["Roughness"].default_value = spec.get("roughness", 0.5)
        shader.inputs["Metallic"].default_value = spec.get("metallic", 0)

    if "normal" in spec:
        pixels, original = load_texture(spec["normal"]["file"], limit)
        pixels = pixels.copy()

        # (DirectX's normal maps, as Unreal's are, point green the other way from glTF's)
        if spec["normal"].get("flipGreen"):
            pixels[..., 1] = 1 - pixels[..., 1]

        pixels[..., 3] = 1
        node = texture(image_of(f"{name}_normal", pixels, True), "normal", original)
        mapping = tree.nodes.new("ShaderNodeNormalMap")
        tree.links.new(node.outputs["Color"], mapping.inputs["Color"])
        tree.links.new(mapping.outputs["Normal"], shader.inputs["Normal"])

    if "emission" in spec:
        pixels, original = load_texture(spec["emission"]["file"], limit)
        pixels = pixels.copy()
        pixels[..., 3] = 1
        node = texture(image_of(f"{name}_emission", pixels, False), "emission", original)
        tree.links.new(node.outputs["Color"], shader.inputs["Emission Color"])
        shader.inputs["Emission Strength"].default_value = spec.get("emissionStrength", 1)
        made["emissionStrength"] = spec.get("emissionStrength", 1)

    material.use_backface_culling = not spec.get("doubleSided", False)
    made["doubleSided"] = bool(spec.get("doubleSided", False))

    return material, made


def apply_materials(job):
    """The source's materials named in materials replaced by those made from texture files."""
    made = []

    for name, spec in (job.get("materials") or {}).items():
        old = bpy.data.materials.get(name)

        if old is None:
            raise PipelineError(f"materials.{name}: there's no material called {name} (there are: {', '.join(sorted(m.name for m in bpy.data.materials)) or 'none'})")

        old.name = f"{name}.replaced"
        material, info = make_material(name, spec, job["textures"]["maxSize"])

        for thing in bpy.data.objects:
            for slot in thing.material_slots:
                if slot.material == old:
                    slot.material = material

        bpy.data.materials.remove(old)
        made.append(info)

    if made:
        note(f"materials made from texture files: {', '.join(info['material'] for info in made)}")

    REPORT["madeMaterials"] = made


# --- Joined ----------------------------------------------------------------------------------


def join_objects(job, meshes):
    """The objects in each of join's groups joined into one mesh of that name (its parts that share
    a material one draw call): the rest as they are."""
    groups = job.get("join") or {}
    joined = []
    taken = {}

    for name, patterns in groups.items():
        # (In the order the group names them, then by name: the first is the one kept, the rest
        # joined into it, the same every time)
        order = lambda thing: (next(i for i, pattern in enumerate(patterns) if matches(thing.name, [pattern])), thing.name)  # noqa: E731
        members = sorted((thing for thing in meshes if matches(thing.name, patterns)), key=order)
        unmatched = [pattern for pattern in patterns if not any(matches(thing.name, [pattern]) for thing in meshes)]

        if unmatched:
            raise PipelineError(f"join.{name}: no mesh exported is called {', '.join(unmatched)} (there are: {', '.join(sorted(thing.name for thing in meshes))})")

        for thing in members:
            if thing.name in taken:
                raise PipelineError(f"{thing.name} is in join.{taken[thing.name]} and join.{name}: in one only")

            taken[thing.name] = name

        names = [thing.name for thing in members]
        first = members[0]

        # (Before they're joined: Blender removes the others then)
        meshes = [thing for thing in meshes if thing == first or thing not in members]

        if len(members) > 1:
            deselect_all()

            for thing in members:
                thing.hide_viewport = False
                thing.hide_set(False)
                thing.select_set(True)

            bpy.context.view_layer.objects.active = first

            with bpy.context.temp_override(active_object=first, object=first, selected_objects=members, selected_editable_objects=members):
                bpy.ops.object.join()

            # (What's left of the others, so their names are free)
            for other in names[1:]:
                leftover = bpy.data.objects.get(other)

                if leftover is not None and leftover != first:
                    bpy.data.objects.remove(leftover)

            for mesh in [mesh for mesh in bpy.data.meshes if mesh.users == 0]:
                bpy.data.meshes.remove(mesh)

        rename(first, name, bpy.data.objects)
        rename(first.data, name, bpy.data.meshes)
        joined.append({"name": name, "objects": names})

    if joined:
        note(f"joined: {'; '.join(group['name'] + ' (' + ', '.join(group['objects']) + ')' for group in joined)}")

    REPORT["joined"] = joined

    return meshes


# --- Materials -------------------------------------------------------------------------------


def surface_shader(material):
    """The node the material's output's surface comes from (for Cycles), or None."""
    if not material or not material.node_tree:
        return None, None

    tree = material.node_tree
    output = tree.get_output_node("CYCLES") or tree.get_output_node("ALL")

    if output is None or not output.inputs["Surface"].links:
        return output, None

    return output, output.inputs["Surface"].links[0].from_node


def principled(material):
    _, shader = surface_shader(material)

    return shader if shader is not None and shader.type == "BSDF_PRINCIPLED" else None


def upstream(socket, seen=None):
    """The nodes feeding a socket, all the way back."""
    seen = set() if seen is None else seen

    for link in socket.links:
        node = link.from_node

        if node.name in seen:
            continue

        seen.add(node.name)
        yield node

        for into in node.inputs:
            yield from upstream(into, seen)


def images_of(material):
    if not material or not material.node_tree:
        return []

    return [node.image for node in material.node_tree.nodes if node.type == "TEX_IMAGE" and node.image]


def uses_udim(material):
    return any(image.source == "TILED" for image in images_of(material))


def why_not_exportable(material):
    """Why the glTF exporter can't carry the material as it is (None if it can)."""
    if material is None:
        return None

    _, shader = surface_shader(material)

    if shader is None:
        return "nothing reaches its output"

    if shader.type != "BSDF_PRINCIPLED":
        return f"its surface is a {shader.type}"

    for socket in shader.inputs:
        for node in upstream(socket):
            # (Alpha rounded is the exporter's way to a mask cut off at a half: it carries that)
            if node.type == "MATH" and node.operation == "ROUND" and socket.name == "Alpha":
                continue

            if node.type not in EXPORTABLE:
                return f"{socket.name} comes from a {node.type}"

    return None


def uses_alpha(material):
    shader = principled(material)

    if shader is None:
        return False

    alpha = shader.inputs["Alpha"]

    return alpha.is_linked or alpha.default_value < 0.999


def alpha_mode(material):
    if getattr(material, "surface_render_method", None) == "BLENDED" or getattr(material, "blend_method", None) == "BLEND":
        return "BLEND"

    return "MASK"


def has_emission(material):
    if not material or not material.node_tree:
        return False

    for node in material.node_tree.nodes:
        if node.type == "EMISSION":
            return True

        if node.type == "BSDF_PRINCIPLED":
            strength = node.inputs["Emission Strength"]
            colour = node.inputs["Emission Color"]

            if (strength.is_linked or strength.default_value > 0) and (colour.is_linked or max(colour.default_value[:3]) > 0):
                return True

    return False


def has_normals(material):
    if not material or not material.node_tree:
        return False

    return any(node.type == "BSDF_PRINCIPLED" and node.inputs["Normal"].is_linked for node in material.node_tree.nodes) or any(node.type in ("NORMAL_MAP", "BUMP") for node in material.node_tree.nodes)


def is_flat(material):
    """A plain Principled BSDF with nothing linked into it: one colour, drawn without baking."""
    shader = principled(material)

    return shader is not None and not any(socket.is_linked for socket in shader.inputs)


def lost_in_baking(material):
    """What a material has that a glTF material made from it won't."""
    lost = []
    output, shader = surface_shader(material)

    if output is not None and output.inputs.get("Displacement") is not None and output.inputs["Displacement"].is_linked:
        lost.append("displacement")

    if shader is not None and shader.type == "BSDF_PRINCIPLED":
        for name, label in (("Subsurface Weight", "subsurface scattering"), ("Transmission Weight", "transmission"), ("Coat Weight", "coat"), ("Sheen Weight", "sheen")):
            socket = shader.inputs.get(name)

            if socket is not None and (socket.is_linked or socket.default_value > 0):
                lost.append(label)

    return lost


def material_slots_used(thing):
    count = len(thing.data.polygons)
    indices = np.zeros(count, dtype=np.int32)
    thing.data.polygons.foreach_get("material_index", indices)

    return sorted(set(indices.tolist())) if count else []


def bake_reasons(thing, textures):
    """Why a mesh's materials are baked onto an atlas (none: exported as they are)."""
    mode = textures["bake"]
    used = [thing.material_slots[i].material for i in material_slots_used(thing) if i < len(thing.material_slots)]
    reasons = []

    if mode == "never":
        return reasons

    if mode == "always":
        reasons.append("bake: always")

    for material in used:
        if material is None:
            continue

        if uses_udim(material) and textures["udim"] == "atlas":
            reasons.append(f"{material.name} has UDIM tiles")

        why = why_not_exportable(material)

        if why:
            reasons.append(f"{material.name}: {why}")

    distinct = {material for material in used if material is not None}

    if len(distinct) > 1 and textures["mergeMaterials"]:
        reasons.append(f"{len(distinct)} materials (merged into one)")

    return reasons


# --- Baking onto an atlas --------------------------------------------------------------------


def groups_of(thing, uv, textures):
    """A mesh's faces in groups, each laid out on the atlas as one: by material, and by UDIM tile
    for materials with tiles. Each: { key, material, tile, faces, corners, box (u0, v0, u1, v1),
    resolution (pixels a UV unit across, (u, v)), flat, pointed (faces whose UVs cover no area:
    mapped to a point on a palette, which baking can't sample) }."""
    mesh = thing.data
    count = len(mesh.polygons)
    starts = np.zeros(count, dtype=np.int64)
    totals = np.zeros(count, dtype=np.int64)
    slots = np.zeros(count, dtype=np.int64)
    mesh.polygons.foreach_get("loop_start", starts)
    mesh.polygons.foreach_get("loop_total", totals)
    mesh.polygons.foreach_get("material_index", slots)
    coords = np.zeros(len(mesh.loops) * 2, dtype=np.float64)
    uv.data.foreach_get("uv", coords)
    coords = coords.reshape(-1, 2)

    # Each corner's face, the corner after it round its face, and each face's middle and area in UV
    face_of = np.repeat(np.arange(count), totals)
    following = np.arange(len(coords)) + 1
    ends = starts + totals - 1
    following[ends] = starts
    centres = np.zeros((count, 2))
    np.add.at(centres, face_of, coords)
    centres /= np.maximum(totals, 1)[:, None]
    areas = np.zeros(count)
    np.add.at(areas, face_of, coords[:, 0] * coords[following, 1] - coords[following, 0] * coords[:, 1])
    areas = np.abs(areas) / 2

    # Which UDIM tile each face is on, for materials with tiles
    materials = [slot.material for slot in thing.material_slots]
    tiled = np.array([material is not None and uses_udim(material) for material in materials] or [False])
    on_tiles = tiled[np.minimum(slots, len(tiled) - 1)] & (slots < len(materials))
    tiles = np.where(on_tiles, 1001 + np.floor(centres[:, 0]).astype(np.int64) + 10 * np.floor(centres[:, 1]).astype(np.int64), 0)
    groups = []

    for slot, tile in sorted({(int(a), int(b)) for a, b in zip(slots, tiles)}):
        material = materials[slot] if slot < len(materials) else None
        faces = np.nonzero((slots == slot) & (tiles == tile))[0]
        corners = np.nonzero(np.isin(face_of, faces))[0]
        points = coords[corners]
        resolution = resolution_of(material, tile or None, textures)
        flat = material is None or is_flat(material)
        pixels = areas[faces] * (resolution[0] * resolution[1] if resolution else 0)

        groups.append({
            "key": (slot, tile or None),
            "material": material,
            "tile": tile or None,
            "faces": faces,
            "corners": corners,
            "box": (*points.min(axis=0), *points.max(axis=0)),
            "flat": flat,
            "resolution": resolution,
            "pointed": 0 if flat else int(np.count_nonzero(pixels < 0.25)),
        })

    return groups


def pointed_groups(groups):
    """The groups with more than a few faces that baking can't sample (their UVs a point)."""
    return [group for group in groups if group["pointed"] > 0.05 * len(group["faces"])]


def resolution_of(material, tile, textures):
    """How many pixels a UV unit of the material's textures has, across and up."""
    if material is None or is_flat(material):
        return None

    sizes = []

    for image in images_of(material):
        if image.source == "TILED":
            for one in image.tiles:
                if one.number == tile:
                    sizes.append(tuple(one.size))
        elif image.size[0]:
            sizes.append(tuple(image.size))

    if not sizes:
        return (textures["proceduralSize"], textures["proceduralSize"])

    return (max(size[0] for size in sizes), max(size[1] for size in sizes))


def lay_out_atlas(thing, source_name, groups, textures):
    """Packs the groups onto an atlas and writes the atlas's UV map."""
    mesh = thing.data
    source = mesh.uv_layers[source_name]
    flat_size = 16
    footprints = []

    for group in groups:
        u0, v0, u1, v1 = group["box"]

        if group["resolution"] is None:
            footprints.append((flat_size, flat_size))
        else:
            footprints.append(((u1 - u0) * group["resolution"][0], (v1 - v0) * group["resolution"][1]))

    gap = 2 * textures["margin"]
    side, scale, places = pack(footprints, textures["atlasSize"], gap)
    coords = np.zeros(len(mesh.loops) * 2, dtype=np.float64)
    source.data.foreach_get("uv", coords)
    coords = coords.reshape(-1, 2)
    atlas = coords.copy()

    for group, (fw, fh), (x, y) in zip(groups, footprints, places):
        u0, v0, u1, v1 = group["box"]
        corners = group["corners"]
        width = max(fw, 8) * scale
        height = max(fh, 8) * scale
        group["place"] = (x, y, width, height)

        # (A flat material's faces keep their own layout, squeezed into a small square that's
        # painted its colour after baking: faces with no area in UV would have no tangents to
        # shade a normal map by)
        span_u = max(u1 - u0, 1e-9)
        span_v = max(v1 - v0, 1e-9)
        atlas[corners, 0] = (x + (coords[corners, 0] - u0) / span_u * width) / side
        atlas[corners, 1] = (y + (coords[corners, 1] - v0) / span_v * height) / side

    layer = mesh.uv_layers.get(ATLAS_UV) or mesh.uv_layers.new(name=ATLAS_UV, do_init=False)
    layer.data.foreach_set("uv", atlas.astype(np.float32).ravel())

    return side, scale


def source_uv(thing):
    layers = thing.data.uv_layers

    if not len(layers):
        raise PipelineError(f"{thing.name} has no UV map to bake its materials from")

    for layer in layers:
        if layer.active_render:
            return layer

    return layers.active


def pin_uvs(material, uv_name):
    """Makes the material's textures read the mesh's own UV map by name, so they're unchanged
    when the atlas's UV map is made the active one to bake to."""
    tree = material.node_tree

    for node in list(tree.nodes):
        if node.type == "TEX_IMAGE" and not node.inputs["Vector"].is_linked:
            mapping = tree.nodes.new("ShaderNodeUVMap")
            mapping.uv_map = uv_name
            tree.links.new(mapping.outputs["UV"], node.inputs["Vector"])
        elif node.type == "NORMAL_MAP" and not node.uv_map:
            node.uv_map = uv_name
        elif node.type == "TEX_COORD":
            for link in list(node.outputs["UV"].links):
                mapping = tree.nodes.new("ShaderNodeUVMap")
                mapping.uv_map = uv_name
                tree.links.new(mapping.outputs["UV"], link.to_socket)


class Rewired:
    """For as long as it's in use, shows one of a material's Principled BSDF's inputs as emission
    (so baking emission bakes that input). A material without one, or with no input named, shows
    `fallback` instead."""

    def __init__(self, material, input_name, fallback):
        self.material = material
        self.input_name = input_name
        self.fallback = fallback
        self.node = None

    def __enter__(self):
        output, _ = surface_shader(self.material)
        shader = principled(self.material)

        if output is None:
            return

        tree = self.material.node_tree
        self.node = tree.nodes.new("ShaderNodeEmission")
        self.node.inputs["Strength"].default_value = 1
        socket = shader.inputs[self.input_name] if shader is not None and self.input_name else None

        if socket is not None and socket.is_linked:
            tree.links.new(socket.links[0].from_socket, self.node.inputs["Color"])
        else:
            value = socket.default_value if socket is not None else self.fallback
            self.node.inputs["Color"].default_value = tuple(value)[:3] + (1,) if hasattr(value, "__len__") else (value, value, value, 1)

        self.output = output
        links = output.inputs["Surface"].links
        self.was = links[0].from_socket if links else None
        tree.links.new(self.node.outputs["Emission"], output.inputs["Surface"])

    def __exit__(self, *_):
        if self.node is not None:
            tree = self.material.node_tree

            if self.was is not None:
                tree.links.new(self.was, self.output.inputs["Surface"])

            tree.nodes.remove(self.node)


def bake_pass(thing, materials, name, side, kind, data, rewire=None, fallback=0.0, samples=1):
    """Bakes one pass of the mesh's materials into a new side x side image: `kind` (Cycles's bake
    type), or with `rewire` an input of their Principled BSDFs ("" for `fallback` everywhere)."""
    image = bpy.data.images.new(f"{thing.name}_{name}", side, side, alpha=True)
    set_colorspace(image, data)
    targets = []

    for material in materials:
        tree = material.node_tree
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        tree.nodes.active = node
        targets.append((tree, node))

    rewired = [Rewired(material, rewire, fallback) for material in materials] if rewire is not None else []

    try:
        for one in rewired:
            one.__enter__()

        bpy.context.scene.cycles.samples = samples
        started = time.time()
        bpy.ops.object.bake(type=kind, pass_filter={"COLOR"} if kind == "DIFFUSE" else set(), margin=bake_margin(side), margin_type="EXTEND", use_clear=True, uv_layer=ATLAS_UV, target="IMAGE_TEXTURES", save_mode="INTERNAL", use_selected_to_active=False, normal_space="TANGENT")
        log(f"baked {thing.name}'s {name} ({side} px, {time.time() - started:.1f} s)")
    finally:
        for one in rewired:
            one.__exit__()

        for tree, node in targets:
            tree.nodes.remove(node)

    pixels = np.zeros(side * side * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)

    if PASSES["folder"]:
        image.save(filepath=os.path.join(PASSES["folder"], f"{thing.name}_{name}.png"))

    bpy.data.images.remove(image)

    return pixels.reshape(side, side, 4)


def bake_margin(side):
    return max(2, side // 128)


def linear_to_srgb(value):
    value = np.clip(np.asarray(value, dtype=np.float64), 0, 1)

    return np.where(value <= 0.0031308, value * 12.92, 1.055 * np.power(value, 1 / 2.4) - 0.055)


def flat_values(material):
    """A flat material's values, as the passes store them (colours sRGB, the rest as they are)."""
    shader = principled(material)
    colour = tuple(shader.inputs["Base Color"].default_value)[:3]
    emission = np.array(shader.inputs["Emission Color"].default_value[:3]) * shader.inputs["Emission Strength"].default_value

    return {
        "basecolor": linear_to_srgb(colour),
        "alpha": shader.inputs["Alpha"].default_value,
        "roughness": shader.inputs["Roughness"].default_value,
        "metallic": shader.inputs["Metallic"].default_value,
        "normal": (0.5, 0.5, 1.0),
        "emission": linear_to_srgb(emission),
        "ao": 1.0,
        "coverage": 1.0,
    }


def paint_flat(pixels, groups, name):
    for group in groups:
        if group["flat"] and group["material"] is not None:
            x, y, width, height = group["place"]
            value = flat_values(group["material"])[name]
            margin = 2
            rows = slice(max(0, int(y) - margin), int(y + height) + margin)
            columns = slice(max(0, int(x) - margin), int(x + width) + margin)
            pixels[rows, columns, :3] = value
            pixels[rows, columns, 3] = 1


def constant(pixels, channels, mask):
    """The value every covered pixel has in these channels, or None if they differ."""
    values = pixels[..., channels][mask]

    if values.size == 0:
        return None

    low = values.min(axis=0)
    high = values.max(axis=0)

    return low if np.all(high - low <= 2.5 / 255) else None


def image_from(name, pixels, data):
    side = pixels.shape[0]
    image = bpy.data.images.new(name, side, side, alpha=True)
    set_colorspace(image, data)
    image.pixels.foreach_set(np.ascontiguousarray(pixels, dtype=np.float32).ravel())
    image.pack()

    return image


def occlusion_group():
    """The node group the glTF exporter reads the occlusion texture from."""
    group = bpy.data.node_groups.get("glTF Material Output")

    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")

    return group


def bake_object(thing, armature, reasons, textures):
    """Bakes a mesh's materials onto one atlas and gives it one material made from it."""
    started = time.time()

    if thing.data.users > 1:
        thing.data = thing.data.copy()

    mesh = thing.data
    source_name = source_uv(thing).name

    # (Faces with no material: a plain grey one, so there's something to bake)
    for index in material_slots_used(thing):
        if index >= len(thing.material_slots) or thing.material_slots[index].material is None:
            plain = new_material(f"{thing.name}_plain")

            if index >= len(thing.material_slots):
                mesh.materials.append(plain)
            else:
                thing.material_slots[index].material = plain

    groups = groups_of(thing, mesh.uv_layers[source_name], textures)

    for group in pointed_groups(groups):
        warn(f"{thing.name}: {group['pointed']} of {group['material'].name}'s faces map to points on its textures (a palette): baking can't sample them, so they'll come out black. Give them UV areas, or don't bake (textures.bake: never)")

    side, scale = lay_out_atlas(thing, source_name, groups, textures)
    mesh.uv_layers.active = mesh.uv_layers[ATLAS_UV]
    materials = []

    for slot in thing.material_slots:
        if slot.material is not None:
            slot.material = slot.material.copy()
            pin_uvs(slot.material, source_name)
            materials.append(slot.material)

    for group in groups:
        group["material"] = thing.material_slots[group["key"][0]].material

    if not materials:
        raise PipelineError(f"{thing.name} has no materials to bake")

    used = [group["material"] for group in groups if group["material"] is not None]
    alpha = any(uses_alpha(material) for material in used)
    lost = sorted({what for material in used for what in lost_in_baking(material)})

    if lost:
        note(f"{thing.name}: glTF has no {', '.join(lost)}: left out")

    # Baked as it stands at rest, on its own
    pose = armature.data.pose_position if armature else None
    hidden = [other for other in bpy.context.scene.objects if other != thing and not other.hide_render]

    if armature:
        armature.data.pose_position = "REST"

    for other in hidden:
        other.hide_render = True

    deselect_all()
    thing.hide_set(False)
    thing.select_set(True)
    bpy.context.view_layer.objects.active = thing
    passes = {}

    try:
        # Which texels the mesh covers (white, on black): the rest isn't looked at
        passes["coverage"] = bake_pass(thing, materials, "coverage", side, "EMIT", True, rewire="", fallback=1.0)
        passes["basecolor"] = bake_pass(thing, materials, "basecolor", side, "EMIT", False, rewire="Base Color") if all(principled(m) for m in materials) else bake_pass(thing, materials, "basecolor", side, "DIFFUSE", False)

        if alpha:
            passes["alpha"] = bake_pass(thing, materials, "alpha", side, "EMIT", True, rewire="Alpha", fallback=1.0)

        passes["roughness"] = bake_pass(thing, materials, "roughness", side, "EMIT", True, rewire="Roughness") if all(principled(m) for m in materials) else bake_pass(thing, materials, "roughness", side, "ROUGHNESS", True)

        if any(principled(material) for material in materials):
            passes["metallic"] = bake_pass(thing, materials, "metallic", side, "EMIT", True, rewire="Metallic")

        if any(has_normals(material) for material in used):
            passes["normal"] = bake_pass(thing, materials, "normal", side, "NORMAL", True)

        if any(has_emission(material) for material in used):
            passes["emission"] = bake_pass(thing, materials, "emission", side, "EMIT", False)

        if textures["ao"]:
            passes["ao"] = bake_pass(thing, materials, "ao", side, "AO", True, samples=textures["aoSamples"])
    finally:
        if armature:
            armature.data.pose_position = pose

        for other in hidden:
            other.hide_render = False

    for name, pixels in passes.items():
        paint_flat(pixels, groups, name)

    log(f"baked {thing.name} onto a {side} px atlas in {time.time() - started:.1f} s")
    mask = passes.pop("coverage")[..., 0] > 0.5
    made = make_baked_material(thing, passes, mask, alpha, alpha_mode(used[0]) if alpha else "OPAQUE")

    # The atlas the only UV map, and the baked material the only one
    for name in [layer.name for layer in mesh.uv_layers if layer.name != ATLAS_UV]:
        mesh.uv_layers.remove(mesh.uv_layers[name])

    mesh.uv_layers[ATLAS_UV].name = "UVMap"
    mesh.uv_layers.active = mesh.uv_layers["UVMap"]
    mesh.uv_layers["UVMap"].active_render = True
    mesh.materials.clear()
    mesh.materials.append(made["material"])
    mesh.polygons.foreach_set("material_index", np.zeros(len(mesh.polygons), dtype=np.int32))

    return {
        "object": thing.name,
        "baked": True,
        "reasons": reasons,
        "material": made["material"].name,
        "atlas": side,
        "scale": round(scale, 4),
        "groups": [{"material": group["material"].name if group["material"] else None, "tile": group["tile"], "faces": int(len(group["faces"])), "pixels": [round(group["place"][2]), round(group["place"][3])]} for group in groups],
        "textures": made["textures"],
        "constants": made["constants"],
        "alphaMode": made["alphaMode"],
        "lost": lost,
    }


def make_baked_material(thing, passes, mask, alpha, mode):
    """A material made from the baked passes: textures for what varies, factors for the rest."""
    material = new_material(f"{thing.name}_baked")
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    side = passes["basecolor"].shape[0]
    textures = {}
    constants = {}

    def texture(image):
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = image

        return node

    # Base colour (and alpha)
    colour = passes["basecolor"].copy()
    colour[..., 3] = passes["alpha"][..., 0] if alpha else 1
    same = constant(colour, [0, 1, 2, 3] if alpha else [0, 1, 2], mask)

    if same is None:
        node = texture(image_from(f"{thing.name}_basecolor", colour, False))
        tree.links.new(node.outputs["Color"], shader.inputs["Base Color"])
        textures["basecolor"] = side

        if alpha:
            # (Rounded: the exporter makes it a mask, cut off at a half)
            if mode == "MASK":
                rounded = tree.nodes.new("ShaderNodeMath")
                rounded.operation = "ROUND"
                tree.links.new(node.outputs["Alpha"], rounded.inputs[0])
                tree.links.new(rounded.outputs[0], shader.inputs["Alpha"])
            else:
                tree.links.new(node.outputs["Alpha"], shader.inputs["Alpha"])
    else:
        rgb = [float(v) for v in same[:3]]
        linear = [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in rgb]
        shader.inputs["Base Color"].default_value = (*linear, 1)
        constants["basecolor"] = [round(v, 4) for v in linear]

        if alpha:
            shader.inputs["Alpha"].default_value = float(same[3])

    # Occlusion, roughness and metallic, in one texture (red, green, blue) if any of them varies
    roughness = constant(passes["roughness"], [0], mask)
    metallic = constant(passes["metallic"], [0], mask) if "metallic" in passes else np.array([0.0])
    occlusion = passes.get("ao")

    if roughness is None or metallic is None or occlusion is not None:
        orm = np.ones_like(passes["roughness"])
        orm[..., 0] = occlusion[..., 0] if occlusion is not None else 1
        orm[..., 1] = passes["roughness"][..., 0]
        orm[..., 2] = passes["metallic"][..., 0] if "metallic" in passes else 0
        node = texture(image_from(f"{thing.name}_orm", orm, True))
        split = tree.nodes.new("ShaderNodeSeparateColor")
        tree.links.new(node.outputs["Color"], split.inputs["Color"])
        tree.links.new(split.outputs["Green"], shader.inputs["Roughness"])
        tree.links.new(split.outputs["Blue"], shader.inputs["Metallic"])
        textures["orm"] = side

        if occlusion is not None:
            group = tree.nodes.new("ShaderNodeGroup")
            group.node_tree = occlusion_group()
            tree.links.new(split.outputs["Red"], group.inputs["Occlusion"])
    else:
        shader.inputs["Roughness"].default_value = float(roughness[0])
        shader.inputs["Metallic"].default_value = float(metallic[0])
        constants["roughness"] = round(float(roughness[0]), 4)
        constants["metallic"] = round(float(metallic[0]), 4)

    if "normal" in passes:
        flat = np.array([0.5, 0.5, 1.0])

        if np.all(np.abs(passes["normal"][..., :3][mask] - flat).max(axis=0) <= 3 / 255):
            note(f"{thing.name}'s normal map came out flat: left out")
        else:
            node = texture(image_from(f"{thing.name}_normal", passes["normal"], True))
            mapping = tree.nodes.new("ShaderNodeNormalMap")
            tree.links.new(node.outputs["Color"], mapping.inputs["Color"])
            tree.links.new(mapping.outputs["Normal"], shader.inputs["Normal"])
            textures["normal"] = side

    if "emission" in passes:
        same = constant(passes["emission"], [0, 1, 2], mask)

        if same is None or max(same) > 1 / 255:
            node = texture(image_from(f"{thing.name}_emission", passes["emission"], False))
            tree.links.new(node.outputs["Color"], shader.inputs["Emission Color"])
            shader.inputs["Emission Strength"].default_value = 1
            textures["emission"] = side

    return {"material": material, "textures": textures, "constants": constants, "alphaMode": mode if alpha else "OPAQUE"}


def shrink_images(meshes, max_size):
    """Scales down the textures of the materials exported as they are, to max_size at most."""
    seen = set()
    shrunk = []

    for thing in meshes:
        for slot in thing.material_slots:
            for image in images_of(slot.material):
                if image.name in seen:
                    continue

                seen.add(image.name)
                width, height = image.size

                if image.source == "TILED":
                    if any(max(tile.size) > max_size for tile in image.tiles):
                        warn(f"{image.name}'s UDIM tiles are larger than {max_size} px: exported as they are (udim: split)")

                    continue

                if not width:
                    warn(f"{image.name} has no pixels (is its file missing? {image.filepath})")
                    continue

                if max_size is not None and max(width, height) > max_size:
                    factor = max_size / max(width, height)
                    image.scale(max(1, round(width * factor)), max(1, round(height * factor)))
                    image.pack()
                    shrunk.append({"image": image.name, "from": [width, height], "to": list(image.size)})

    if shrunk:
        note(f"textures shrunk to {max_size} px: {', '.join(item['image'] for item in shrunk)}")

    return shrunk


def missing_images(meshes):
    missing = []

    for thing in meshes:
        for slot in thing.material_slots:
            for image in images_of(slot.material):
                if image.packed_file or image.source not in ("FILE", "TILED"):
                    continue

                if image.source == "TILED":
                    path = bpy.path.abspath(image.filepath)
                    found = any(os.path.isfile(path.replace("<UDIM>", str(tile.number))) for tile in image.tiles)
                else:
                    found = os.path.isfile(bpy.path.abspath(image.filepath))

                if not found and image.name not in missing:
                    missing.append(f"{image.name} ({image.filepath})")

    return missing


# --- Writing the GLB -------------------------------------------------------------------------


def drop_idle_bones(armature, meshes, keep):
    """Bones flagged to deform that move no vertex, with none below them that does (a chain's
    tip, a control bone flagged so by mistake), aren't exported: they're flagged not to, here
    (the file isn't saved). A bone that moves nothing itself but carries others (a root) stays,
    and so do those named in `keep`."""
    weighted = set()

    for thing in meshes:
        if not any(modifier.type == "ARMATURE" and modifier.object == armature for modifier in thing.modifiers):
            continue

        names = {group.index: group.name for group in thing.vertex_groups}

        for vertex in thing.data.vertices:
            for group in vertex.groups:
                if group.weight > 0 and group.group in names:
                    weighted.add(names[group.group])

    needed = {}

    def needs(bone):
        if bone.name not in needed:
            needed[bone.name] = bone.name in weighted or matches(bone.name, keep) or any([needs(child) for child in bone.children])

        return needed[bone.name]

    idle = [bone for bone in armature.data.bones if bone.use_deform and not needs(bone)]

    for bone in idle:
        bone.use_deform = False

    if idle:
        note(f"bones flagged to deform that move nothing, left out: {', '.join(sorted(bone.name for bone in idle))}")

    REPORT["armature"]["exported"] = sum(bone.use_deform for bone in armature.data.bones)



def export(job, meshes, armature, out=None, animations=True):
    deselect_all()
    out = out or job["out"]

    for thing in meshes + ([armature] if armature else []):
        thing.hide_viewport = False
        thing.hide_set(False)
        thing.select_set(True)

        if not thing.select_get():
            raise PipelineError(f"{thing.name} can't be selected to export (is its collection hidden or excluded?)")

    textures = job["textures"]
    # (KTX2 is made in Node from PNG, lossless: lib/ktx2.js)
    formats = {"webp": "WEBP", "jpeg": "JPEG", "png": "AUTO", "ktx2": "AUTO"}
    image_format = formats[textures["format"]]

    # Tangents (MikkTSpace, as normal maps are baked with) for a mesh with a normal map, so it's
    # shaded as it was made, not by tangents Three.js would guess
    tangents = any(has_normals(slot.material) for thing in meshes for slot in thing.material_slots if slot.material)

    if tangents:
        note("tangents exported, for the normal maps")

        # (Blender works tangents out for triangles and quads only: n-gons are cut into
        # triangles first, as glTF has them anyway)
        for thing in meshes:
            if any(polygon.loop_total > 4 for polygon in thing.data.polygons):
                if not job["applyModifiers"]:
                    warn(f"{thing.name} has n-gons, so no tangents can be worked out for it unless its modifiers are applied (applyModifiers)")
                    continue

                # (Once: a variant's export comes after the model's)
                if thing.modifiers.get("glTF triangles"):
                    continue

                cut = thing.modifiers.new("glTF triangles", "TRIANGULATE")

                if hasattr(cut, "keep_custom_normals"):
                    cut.keep_custom_normals = True

    # The exporter copies UDIM tiles' files as they are, and only into the format they're in
    if any(uses_udim(slot.material) for thing in meshes for slot in thing.material_slots if slot.material):
        image_format = "AUTO"
        note("UDIM tiles exported as their own files are (udim: split): textures kept in their own format, and the tiles at their own size")

    settings = {
        "filepath": out,
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": job["applyModifiers"],
        "export_yup": True,
        "export_texcoords": True,
        "export_normals": True,
        "export_tangents": tangents,
        "export_materials": "EXPORT",
        "export_image_format": image_format,
        "export_image_quality": textures["quality"],
        "export_jpeg_quality": textures["quality"],
        "export_vertex_color": "MATERIAL",
        "export_cameras": False,
        "export_lights": False,
        "export_extras": False,
        "export_animations": animations,
        "export_animation_mode": "ACTIONS",
        "export_anim_single_armature": True,
        "export_force_sampling": True,
        "export_frame_range": False,
        "export_frame_step": 1,
        "export_anim_slide_to_zero": True,
        "export_negative_frame": "SLIDE",
        "export_reset_pose_bones": True,
        "export_rest_position_armature": True,
        "export_optimize_animation_size": True,
        "export_def_bones": job["deformBonesOnly"],
        "export_leaf_bone": False,
        "export_skins": True,
        "export_influence_nb": 4,
        "export_all_influences": False,
        "export_morph": True,
        "export_morph_animation": True,
        "export_bake_animation": False,
        "export_merge_animation": "ACTION",
        "export_nla_strips": True,
    }
    known = {prop.identifier for prop in bpy.ops.export_scene.gltf.get_rna_type().properties}
    unknown = sorted(name for name in settings if name not in known)

    if unknown:
        note(f"this Blender's glTF exporter has no {', '.join(unknown)}: left out")

    os.makedirs(os.path.dirname(out), exist_ok=True)
    started = time.time()
    result = bpy.ops.export_scene.gltf(**{name: value for name, value in settings.items() if name in known})

    if "FINISHED" not in result or not os.path.isfile(out):
        raise PipelineError(f"the glTF exporter failed ({result})")

    log(f"wrote {out} ({os.path.getsize(out)} bytes, {time.time() - started:.1f} s)")


def export_variants(job, meshes, armature):
    """Each variant's materials, written as the exporter writes the model with them on, for Node
    to keep only the materials of (lib/optimize.js): its own textures, nothing else."""
    written = []

    for name, variant in (job.get("variants") or {}).items():
        swapped = []

        for material_name, spec in variant["materials"].items():
            current = bpy.data.materials.get(material_name)
            slots = [slot for thing in meshes for slot in thing.material_slots if current is not None and slot.material == current]

            if not slots:
                baked = any(material_name in item.get("materials", []) for item in REPORT.get("materials", []) if item.get("baked"))
                raise PipelineError(f"variants.{name}: no mesh exported has the material {material_name}{' (it was baked onto an atlas: a variant is for a material exported as it is, textures.bake: never)' if baked else ''}")

            current.name = f"{material_name}.main"
            look, info = make_material(material_name, spec, job["textures"]["maxSize"])

            for slot in slots:
                slot.material = look

            swapped.append((current, look, slots, info))

        export(job, meshes, armature, out=variant["out"], animations=False)
        written.append({"name": name, "materials": [info for *_, info in swapped]})

        # (The model's own materials back on, for the next)
        for current, look, slots, _ in swapped:
            for slot in slots:
                slot.material = current

            bpy.data.materials.remove(look)
            current.name = current.name[: -len(".main")]

    REPORT["variants"] = written


# --- The stage -------------------------------------------------------------------------------


def run(job):
    started = time.time()
    REPORT["blender"] = bpy.app.version_string
    REPORT["exporter"] = ".".join(str(part) for part in getattr(sys.modules.get("io_scene_gltf2"), "bl_info", {}).get("version", ()))
    REPORT["source"] = os.path.basename(job["source"])
    PASSES["folder"] = job.get("passes")
    open_source(job["source"])
    scene = bpy.context.scene

    if job.get("scene") and job["scene"] != scene.name:
        raise PipelineError(f"the file opens on the scene {scene.name!r}, not {job['scene']!r}: save it on that scene")

    if job.get("stripNamespaces", True):
        strip_namespaces()

    apply_materials(job)
    meshes, armature = pick_objects(job, scene)
    meshes = join_objects(job, meshes)
    missing = missing_images(meshes)

    if missing:
        raise PipelineError(f"textures not found: {', '.join(missing)}")

    gather_actions(job, armature, scene)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = False
    textures = job["textures"]
    materials = []

    for thing in meshes:
        reasons = bake_reasons(thing, textures)

        # (Baked only to merge its materials, but with faces baking can't sample, or no UVs:
        # its materials kept as they are instead)
        if reasons and all(reason.endswith("(merged into one)") for reason in reasons):
            if not len(thing.data.uv_layers):
                note(f"{thing.name}'s materials aren't merged: it has no UV map to bake them onto")
                reasons = []
            else:
                pointed = pointed_groups(groups_of(thing, source_uv(thing), textures))

                if pointed:
                    note(f"{thing.name}'s materials aren't merged: {', '.join(group['material'].name for group in pointed)} map faces to points on their textures (a palette), which baking can't sample")
                    reasons = []

        if reasons:
            log(f"baking {thing.name}: {'; '.join(reasons)}")
            materials.append(bake_object(thing, armature, reasons, textures))
        else:
            used = [thing.material_slots[i].material for i in material_slots_used(thing) if i < len(thing.material_slots)]
            lost = sorted({what for material in used if material for what in lost_in_baking(material)})
            udim = any(uses_udim(material) for material in used if material)

            if lost:
                note(f"{thing.name}: glTF has no {', '.join(lost)}: left out")

            for material in used:
                why = why_not_exportable(material)

                if why:
                    warn(f"{material.name}: {why}, which glTF can't carry, and it isn't baked (textures.bake: {textures['bake']}): it won't look the same")

            if udim and textures["bake"] == "never" and textures["udim"] == "atlas":
                raise PipelineError(f"{thing.name} has UDIM tiles: bake them (textures.bake) or split them (textures.udim: split)")

            materials.append({"object": thing.name, "baked": False, "materials": [m.name for m in used if m], "udim": udim, "lost": lost})

    REPORT["images"] = shrink_images(meshes, textures["maxSize"])
    REPORT["materials"] = materials
    REPORT["objects"] = [{"name": thing.name, "vertices": len(thing.data.vertices), "faces": len(thing.data.polygons), "modifiers": [m.type for m in thing.modifiers]} for thing in meshes]

    if armature:
        bones = armature.data.bones
        REPORT["armature"] = {"name": armature.name, "bones": len(bones), "deformBones": sum(bone.use_deform for bone in bones), "exported": sum(bone.use_deform for bone in bones) if job["deformBonesOnly"] else len(bones)}

    if armature and job["deformBonesOnly"]:
        drop_idle_bones(armature, meshes, job.get("keepBones") or [])

    export(job, meshes, armature)
    export_variants(job, meshes, armature)
    REPORT["seconds"] = round(time.time() - started, 1)


def main():
    job = None

    try:
        job = job_from_args()
        run(job)
        status = 0
    except PipelineError as error:
        REPORT["error"] = str(error)
        log(f"error: {error}")
        status = 1
    except Exception as error:  # noqa: BLE001 (anything else, with where it came from)
        REPORT["error"] = f"{type(error).__name__}: {error}"
        traceback.print_exc()
        status = 1

    if job and job.get("report"):
        os.makedirs(os.path.dirname(job["report"]), exist_ok=True)

        with open(job["report"], "w", encoding="utf-8") as file:
            json.dump(REPORT, file, indent=2)

    sys.stdout.flush()

    # (Blender's Python module can't be told to exit with a status but this way)
    os._exit(status)


main()
