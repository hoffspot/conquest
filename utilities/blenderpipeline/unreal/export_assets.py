"""Export a bought asset out of Unreal Engine 5, for the pipeline (README.md, *From Unreal*).

Run it in the Unreal Editor, with the asset added to a project from Fab. Either paste it whole into
the Output Log, with the box at its foot set to Python (ROOT and OUT, below, say what's exported
and where to: change them first if need be), and press Enter; or, with that box set to Cmd,

    py "C:/path/to/export_assets.py"                         everything under /Game
    py "C:/path/to/export_assets.py" /Game/Monster4          only that folder
    py "C:/path/to/export_assets.py" /Game/Monster4 D:/Out   and into that folder

Or Tools → Execute Python Script…, for everything under /Game. (If `py` isn't known, turn on the
Python Editor Script Plugin in Edit → Plugins, and restart.)

It exports, into `<the project>/PellagosExport` (or the folder given), each asset where it is in
the Content Browser (`/Game/Monster4/Meshes/SK_Monster4` as `Monster4/Meshes/SK_Monster4.fbx`):
- every skeletal and static mesh as FBX: its full detail only (the pipeline makes its own lower
  ones), no collision, its morph targets and vertex colours;
- every animation sequence as FBX, without the mesh (its skeleton's bones are in it);
- every texture, as TGA, or PNG or EXR where TGA can't take it (16-bit, HDR);
- and `notes.json`: each mesh's skeleton and material slots, each animation's skeleton and length,
  each material's textures, numbers and colours (what an FBX doesn't carry: which texture is a
  material's colour, its normals, its packed masks), and each texture's colour space and
  compression (a normal map is `TC_NORMALMAP`; Unreal's are DirectX's, their green flipped for
  glTF by the pipeline's `flipGreen`); and anything that couldn't be exported.

Unreal's FBX export leaves some of a mesh out without a word: a section simulated as cloth (a
horse's caparison and barding, a cloak, a mane), and one turned off. So each mesh's FBX is read
back once it's written, and each material slot's faces counted. A slot that a section of the mesh
uses but that came out with none is said in `notes.json` (`lost`), in the Output Log and in a box
at the end, with why and what to do. Such a mesh is exported as glTF too (`SK_Monster4.glb`, beside
its FBX), which keeps cloth sections, when Unreal's glTF Exporter plugin is on (Edit → Plugins).

Montages, blend spaces, blueprints and levels aren't exported: they're Unreal's own, and the
animation sequences they're made of are.
"""

import json
import os
import struct
import sys
import zlib

import unreal

# What's exported (a folder in the Content Browser, and everything in it), and where to (None:
# `<the project>/PellagosExport`). Run with `py`, the folders given after the script's path are
# taken instead
ROOT = "/Game"
OUT = None

# What's exported, by the asset's class, and how
MESHES = ("SkeletalMesh", "StaticMesh")
ANIMATIONS = ("AnimSequence",)
TEXTURES = ("Texture2D",)
MATERIALS = ("Material", "MaterialInstanceConstant")

# A texture tried as each of these in turn, till one takes it
TEXTURE_FORMATS = (".tga", ".png", ".exr", ".hdr")

# The FBX export's options (the editor's FBX Export Options dialog): each set where the engine
# has it, the rest left as they are
FBX_OPTIONS = {
    "ascii": False,
    "level_of_detail": False,
    "collision": False,
    "vertex_color": True,
    "export_morph_targets": True,
    "export_preview_mesh": False,
    "map_skeletal_motion_to_root": False,
    "force_front_x_axis": False,
    "export_local_time": True,
}

# The glTF export's options (Unreal's glTF Exporter plugin), for a mesh whose FBX lost a part: its
# full detail, skinned, with no textures (they're exported on their own) and no animations. Each
# set where the plugin has it; (enum, value) for one of its enums
GLTF_OPTIONS = {
    "default_level_of_detail": 0,
    "export_vertex_colors": True,
    "export_vertex_skin_weights": True,
    "export_morph_targets": True,
    "export_preview_mesh": False,
    "export_animation_sequences": False,
    "export_level_sequences": False,
    "bake_material_inputs": ("GLTFMaterialBakeMode", "DISABLED"),
    "texture_image_format": ("GLTFTextureImageFormat", "NONE"),
}

# Why a slot a section uses came through the FBX with no faces, and what's to be done about it
WHY = {
    "cloth": "its section is simulated as cloth, which Unreal's FBX export leaves out",
    "off": "its section is likely turned off, which Unreal's FBX export leaves out",
    "unknown": "this engine can't say whether a section uses it (if one does, it's cloth or turned off)",
}
FIX = {
    "cloth": "open the mesh, and in LOD 0's sections set that one's Clothing to None (on a duplicate of the mesh, to keep the pack's own as it is); then export again",
    "off": "open the mesh, and in its Asset Details, LOD 0, Sections, right-click that section and enable it; then export again",
    "unknown": "see the README, From Unreal",
}


def relative_file(package, root):
    """Where an asset's package (`/Game/Monster4/Meshes/SK_Monster4`) goes, under the export's folder."""
    parts = [part for part in package.split("/") if part]
    mount = [part for part in root.split("/") if part][:1]

    # (Under its mount point, /Game, as the Content Browser shows it)
    if parts[: len(mount)] == mount:
        parts = parts[len(mount):]

    return os.path.join(*parts)


def path_of(asset):
    """An asset's path (`/Game/Monster4/Materials/MI_Skin.MI_Skin`), or None."""
    return asset.get_path_name() if asset else None


def class_of(data):
    """An asset registry entry's class name (`SkeletalMesh`), as 5.1 and later have it, or 5.0."""
    try:
        return str(data.asset_class_path.asset_name)
    except AttributeError:
        return str(data.asset_class)


def enum_name(value):
    """An Unreal enum's value's name (`TC_NORMALMAP`), however this engine version prints it."""
    name = getattr(value, "name", None)

    if not isinstance(name, str):
        name = str(value)

    return name.strip("<>").split(":")[0].split(".")[-1]


def get(asset, name, default=None):
    """An asset's property, or `default` where this engine version hasn't got it."""
    try:
        return asset.get_editor_property(name)
    except Exception:
        return default


def options_of(kind, settings):
    """An export's options: each of `settings` set where this engine has it, the rest left as they are."""
    options = kind()

    for name, value in settings.items():
        try:
            if isinstance(value, tuple):
                value = getattr(getattr(unreal, value[0]), value[1])

            options.set_editor_property(name, value)
        except Exception:
            pass

    return options


def fbx_options():
    return options_of(unreal.FbxExportOption, FBX_OPTIONS)


def gltf_options():
    """The glTF export's options, or None where the glTF Exporter plugin isn't on."""
    kind = getattr(unreal, "GLTFExportOptions", None)

    return options_of(kind, GLTF_OPTIONS) if kind else None


def export(asset, filename, options=None):
    """Export one asset to a file (its kind from the file's extension): whether it was written."""
    os.makedirs(os.path.dirname(filename), exist_ok=True)

    task = unreal.AssetExportTask()

    task.set_editor_property("object", asset)
    task.set_editor_property("filename", filename)
    task.set_editor_property("automated", True)
    task.set_editor_property("prompt", False)
    task.set_editor_property("replace_identical", True)

    if options is not None:
        task.set_editor_property("options", options)

    return bool(unreal.Exporter.run_asset_export_task(task)) and os.path.isfile(filename)


def skeleton_of(asset):
    skeleton = get(asset, "skeleton")

    if skeleton is None:
        try:
            skeleton = asset.get_skeleton()
        except Exception:
            skeleton = None

    return path_of(skeleton)


def mesh_notes(mesh, file):
    slots = get(mesh, "materials") if isinstance(mesh, unreal.SkeletalMesh) else get(mesh, "static_materials")

    return {
        "file": file,
        "skeleton": skeleton_of(mesh) if isinstance(mesh, unreal.SkeletalMesh) else None,
        "materials": [{"slot": str(get(slot, "material_slot_name", "")), "material": path_of(get(slot, "material_interface"))} for slot in slots or []],
    }


def animation_notes(animation, file):
    try:
        seconds = round(float(unreal.AnimationLibrary.get_sequence_length(animation)), 3)
    except Exception:
        seconds = None

    return {"file": file, "skeleton": skeleton_of(animation), "seconds": seconds}


def colour(value):
    return [round(value.r, 4), round(value.g, 4), round(value.b, 4), round(value.a, 4)]


def material_notes(material):
    """A material's textures, numbers and colours by parameter, its parent's, and every texture it samples."""
    library = unreal.MaterialEditingLibrary
    instance = isinstance(material, unreal.MaterialInstance)
    notes = {"parent": path_of(get(material, "parent")) if instance else None, "textures": {}, "scalars": {}, "vectors": {}, "used": []}
    reads = (
        ("textures", library.get_texture_parameter_names, library.get_material_instance_texture_parameter_value if instance else library.get_material_default_texture_parameter_value, path_of),
        ("scalars", library.get_scalar_parameter_names, library.get_material_instance_scalar_parameter_value if instance else library.get_material_default_scalar_parameter_value, lambda value: round(float(value), 4)),
        ("vectors", library.get_vector_parameter_names, library.get_material_instance_vector_parameter_value if instance else library.get_material_default_vector_parameter_value, colour),
    )

    for key, names, value_of, kept in reads:
        try:
            for name in names(material):
                notes[key][str(name)] = kept(value_of(material, name))
        except Exception as error:
            notes.setdefault("unread", []).append(f"{key}: {error}")

    # (Textures sampled outside any parameter too, from the material it's made from)
    try:
        base = material.get_base_material() if instance else material
        notes["used"] = sorted(path_of(texture) for texture in library.get_used_textures(base))
    except Exception:
        pass

    return notes


def image_size(path):
    """An exported image's width and height, as its file has them (TGA, PNG); None for another."""
    try:
        with open(path, "rb") as file:
            head = file.read(24)
    except OSError:
        return None

    if head[:8] == b"\x89PNG\r\n\x1a\n" and len(head) == 24:
        return [int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")]

    if path.lower().endswith(".tga") and len(head) >= 16:
        return [int.from_bytes(head[12:14], "little"), int.from_bytes(head[14:16], "little")]

    return None


def texture_notes(texture, file, path):
    notes = {"file": file}

    for name in ("srgb", "compression_settings", "lod_group"):
        value = get(texture, name)

        if value is not None:
            notes[name] = value if isinstance(value, bool) else enum_name(value)

    # (Its size as exported, else as it was imported: not what's loaded of it, blueprint_get_size_x,
    # only as much as the editor's drawn, 32 pixels across for one it hasn't)
    size = image_size(path)
    imported = get(texture, "imported_size")

    if size is None and imported is not None:
        size = [int(imported.x), int(imported.y)]

    if size:
        notes["size"] = size

    notes["normal"] = "NORMALMAP" in str(notes.get("compression_settings", "")).upper()

    return notes


# --- What came through: each mesh's sections, and its FBX's faces read back ---

# (A binary FBX's property types: arrays of numbers, and single ones, as struct reads them)
FBX_ARRAYS = {"f": ("f", 4), "d": ("d", 8), "l": ("q", 8), "i": ("i", 4), "b": ("b", 1)}
FBX_SCALARS = {"Y": ("h", 2), "C": ("?", 1), "I": ("i", 4), "F": ("f", 4), "D": ("d", 8), "L": ("q", 8)}


def read_fbx(data):
    """A binary FBX's nodes, each (name, properties, children); None for one that isn't (an ASCII one)."""
    if not data.startswith(b"Kaydara FBX Binary  \x00"):
        return None

    # (From 7.5 on, its records' offsets and counts are 64-bit)
    wide = struct.unpack_from("<I", data, 23)[0] >= 7500
    head, head_size = ("<QQQ", 24) if wide else ("<III", 12)

    def node(at):
        end, count, _ = struct.unpack_from(head, data, at)

        if end == 0:
            return None, at + head_size + 1

        at += head_size
        name = data[at + 1: at + 1 + data[at]].decode("ascii", "replace")
        at += 1 + data[at]
        properties = []

        for _ in range(count):
            kind = chr(data[at])
            at += 1

            if kind in FBX_SCALARS:
                code, size = FBX_SCALARS[kind]
                properties.append(struct.unpack_from("<" + code, data, at)[0])
                at += size
            elif kind in FBX_ARRAYS:
                length, encoding, stored = struct.unpack_from("<III", data, at)
                raw = data[at + 12: at + 12 + stored]
                at += 12 + stored
                code, size = FBX_ARRAYS[kind]
                properties.append(list(struct.unpack_from(f"<{length}{code}", zlib.decompress(raw) if encoding == 1 else raw)))
            elif kind in "SR":
                length = struct.unpack_from("<I", data, at)[0]
                properties.append(data[at + 4: at + 4 + length])
                at += 4 + length
            else:
                raise ValueError(f"an FBX property of a kind unknown: {kind!r}")

        children = []

        while at < end:
            child, at = node(at)

            if child is None:
                break

            children.append(child)

        return (name, properties, children), end

    nodes, at = [], 27

    while at < len(data) - head_size:
        top, at = node(at)

        if top is None:
            break

        nodes.append(top)

    return nodes


def child_of(node, name):
    return next((child for child in node[2] if child[0] == name), None)


def fbx_faces(path):
    """Each material's faces in an FBX, as its mesh has them in order ([[name, faces], ...]: Unreal
    writes a mesh's slots in order, a material in several slots named `MI_Cloth`, `MI_Cloth_6`...),
    or None for a file it can't read."""
    try:
        with open(path, "rb") as file:
            nodes = read_fbx(file.read())
    except Exception:
        return None

    if nodes is None:
        return None

    top = {node[0]: node for node in nodes}
    names, geometries, models = {}, {}, set()

    for thing in (top.get("Objects") or ("", [], []))[2]:
        if thing[0] == "Material":
            names[thing[1][0]] = thing[1][1].split(b"\x00\x01")[0].decode("utf-8", "replace")
        elif thing[0] == "Geometry" and len(thing[1]) > 2 and thing[1][2] == b"Mesh":
            geometries[thing[1][0]] = thing
        elif thing[0] == "Model":
            models.add(thing[1][0])

    # (Each model's materials, in the order they're joined to it; each mesh's model)
    materials_of, model_of = {}, {}

    for link in (top.get("Connections") or ("", [], []))[2]:
        if link[0] == "C" and link[1][0] == b"OO":
            source, target = link[1][1], link[1][2]

            if source in names and target in models:
                materials_of.setdefault(target, []).append(names[source])
            elif source in geometries and target in models:
                model_of[source] = target

    faces = {}

    for key, geometry in geometries.items():
        materials = materials_of.get(model_of.get(key), [])
        corners = child_of(geometry, "PolygonVertexIndex")
        polygons = sum(1 for corner in corners[1][0] if corner < 0) if corners else 0
        layer = child_of(geometry, "LayerElementMaterial")

        for name in materials:
            faces.setdefault(name, 0)

        if not materials:
            continue

        if layer is None or child_of(layer, "Materials") is None:
            each = [0] * polygons
        else:
            mapping = child_of(layer, "MappingInformationType")
            each = child_of(layer, "Materials")[1][0]

            if mapping is None or mapping[1][0] != b"ByPolygon":
                each = [each[0] if each else 0] * polygons

        for index in each:
            if 0 <= index < len(materials):
                faces[materials[index]] += 1

    return [[name, count] for name, count in faces.items()]


def glb_faces(path):
    """Each material's triangles in a .glb, by its name, or None for a file it can't read."""
    try:
        with open(path, "rb") as file:
            data = file.read()

        length, kind = struct.unpack_from("<II", data, 12)
        document = json.loads(data[20: 20 + length]) if data[:4] == b"glTF" and kind == 0x4E4F534A else None
    except Exception:
        return None

    if document is None:
        return None

    accessors, materials, faces = document.get("accessors", []), document.get("materials", []), {}

    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            read = primitive.get("indices", primitive.get("attributes", {}).get("POSITION"))

            if primitive.get("mode", 4) != 4 or read is None:
                continue

            material = primitive.get("material")
            name = materials[material].get("name", "") if material is not None and material < len(materials) else ""
            faces[name] = faces.get(name, 0) + accessors[read]["count"] // 3

    return faces


def glb_skins(path):
    """Each skinned material's vertices in a .glb, by its name: [how many, how many are weighted to
    no bone (a section simulated as cloth comes out so: it wouldn't move with the bones), how many
    have weights that don't add up to one (they'd tear as it moves)], or None for a file it can't
    read."""
    try:
        with open(path, "rb") as file:
            data = file.read()

        length = struct.unpack_from("<I", data, 12)[0]
        document = json.loads(data[20: 20 + length])
        size, kind = struct.unpack_from("<II", data, 20 + length) if len(data) >= 28 + length else (0, 0)
        blob = data[28 + length: 28 + length + size] if kind == 0x004E4942 else b""
    except Exception:
        return None

    accessors, views, materials, skins = document.get("accessors", []), document.get("bufferViews", []), document.get("materials", []), {}
    # (Each kind of number a weight may be: its code, and what it's out of, normalized)
    kinds = {5121: ("B", 255), 5123: ("H", 65535), 5126: ("f", 1)}

    def totals(index):
        accessor = accessors[index]
        view = views[accessor["bufferView"]]
        code, top = kinds[accessor["componentType"]]
        stride = view.get("byteStride") or 4 * struct.calcsize("<" + code)
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)

        return [sum(struct.unpack_from("<4" + code, blob, start + k * stride)) / top for k in range(accessor["count"])]

    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            sets = sorted(key for key in primitive.get("attributes", {}) if key.startswith("WEIGHTS_"))

            if not sets:
                continue

            try:
                each = [sum(weights) for weights in zip(*(totals(primitive["attributes"][key]) for key in sets))]
            except Exception:
                return None

            material = primitive.get("material")
            name = materials[material].get("name", "") if material is not None and material < len(materials) else ""
            had = skins.setdefault(name, [0, 0, 0])
            had[0] += len(each)
            had[1] += sum(1 for total in each if total < 0.01)
            had[2] += sum(1 for total in each if total >= 0.01 and abs(total - 1) > 0.02)

    return skins


def mesh_library():
    """What reads a skeletal mesh's LODs and sections: the editor's subsystem (5.1 on), or its library before."""
    try:
        return unreal.get_editor_subsystem(unreal.SkeletalMeshEditorSubsystem)
    except Exception:
        return getattr(unreal, "EditorSkeletalMeshLibrary", None)


def sections_of(mesh):
    """A skeletal mesh's LOD 0 sections, each [its slot, whether it's simulated as cloth], or None
    where this engine can't say."""
    library = mesh_library()

    try:
        count = library.get_num_sections(mesh, 0)
        slots = [library.get_lod_material_slot(mesh, 0, section) for section in range(max(0, count))]
    except Exception:
        return None

    sections = []

    for section, slot in enumerate(slots):
        try:
            cloth = bool(mesh.is_section_using_cloth(section, True))
        except Exception:
            cloth = None

        sections.append([slot, cloth])

    return sections


def material_name(path):
    """A material's object name (`MI_Skin`) from its path (`/Game/Monster4/Materials/MI_Skin.MI_Skin`)."""
    return path.split(".")[-1] if path else None


def slot_faces(slots, faces):
    """Each slot's faces in the FBX (None where it can't be matched): by place, as Unreal writes them,
    else by its material's name, as itself or numbered by its slot."""
    if faces is None:
        return [None] * len(slots)

    if len(faces) == len(slots):
        return [count for _, count in faces]

    by_name = dict((name, count) for name, count in faces)

    return [by_name.get(material_name(slot["material"]), by_name.get(f"{material_name(slot['material'])}_{index}")) for index, slot in enumerate(slots)]


def look_over(mesh, entry, out, base):
    """What of a mesh came through its FBX: each slot's faces (`materials[].faces`); its LOD 0
    sections (`sections`) and clothing; the slots a section uses that have none (`lost`), and, for
    those, a glTF export of it beside the FBX (`glb`), its faces by material (`glbFaces`), which
    lost slots it has (`found`) and how its skin weights came out, by material (`glbSkins`: its
    vertices, those weighted to no bone, those whose weights don't add up to one). The warnings to
    give: one for each slot lost (one found in the glTF, but without its weights, said so), and one
    for each material whose weights are broken there."""
    slots = entry["materials"]
    read = fbx_faces(os.path.join(out, base + ".fbx"))
    faces = slot_faces(slots, read)
    name = base.replace(os.sep, "/").split("/")[-1]

    if read is None:
        return [f"{name}: its FBX couldn't be read back, to see that all of it came through"]

    for slot, count in zip(slots, faces):
        if count is not None:
            slot["faces"] = count

    sections = sections_of(mesh) if isinstance(mesh, unreal.SkeletalMesh) else None
    clothing = [path_of(asset) for asset in get(mesh, "mesh_clothing_assets") or []]

    if sections is not None:
        entry["sections"] = [{"slot": slot, "cloth": cloth} for slot, cloth in sections]

    if clothing:
        entry["clothing"] = clothing

    # (A slot no section uses is meant to be empty; where this engine can't say which are used,
    # skeletal meshes' empty slots are told of all the same)
    lost = []

    for index, (slot, count) in enumerate(zip(slots, faces)):
        if count != 0:
            continue

        if sections is None:
            if isinstance(mesh, unreal.SkeletalMesh):
                lost.append({"slot": slot["slot"], "material": slot["material"], "why": "unknown"})
        elif any(used == index for used, _ in sections):
            cloth = any(used == index and on for used, on in sections)
            lost.append({"slot": slot["slot"], "material": slot["material"], "why": "cloth" if cloth else "off"})

    if not lost:
        return []

    entry["lost"] = lost
    options = gltf_options()
    glb = os.path.join(out, base + ".glb")

    # (Its glTF: a lost slot is found there when its material has more faces there than in the FBX)
    if options is not None and export(mesh, glb, options):
        entry["glb"] = (base + ".glb").replace(os.sep, "/")
        had, fbx = glb_faces(glb) or {}, {}
        entry["glbFaces"] = had

        for slot in slots:
            fbx[material_name(slot["material"])] = fbx.get(material_name(slot["material"]), 0) + slot.get("faces", 0)

        entry["found"] = [part["slot"] for part in lost if had.get(material_name(part["material"]), 0) > fbx.get(material_name(part["material"]), 0)]
        skins = glb_skins(glb)

        if skins:
            entry["glbSkins"] = {material: {"vertices": vertices, "unweighted": unweighted, "broken": broken} for material, (vertices, unweighted, broken) in skins.items()}

    warnings = []

    for part in lost:
        said = f"{name}: the slot '{part['slot']}' ({material_name(part['material'])}) has no faces in its FBX: {WHY[part['why']]}."

        skin = entry.get("glbSkins", {}).get(material_name(part["material"]))

        if part["slot"] in entry.get("found", ()) and skin and skin["unweighted"] * 2 >= skin["vertices"]:
            said += f" It's in {name}.glb, exported beside it, but without its skin weights there (as Unreal keeps a cloth section's): it wouldn't move with the bones. To have it whole, {FIX[part['why']]}."
        elif part["slot"] in entry.get("found", ()):
            said += f" It's in {name}.glb, exported beside it."
        else:
            said += f" To have it, {FIX[part['why']]}."

            if options is None:
                said += " (Or turn on the glTF Exporter plugin, in Edit, Plugins, and export again: it keeps cloth.)"
            elif "glb" in entry:
                said += f" ({name}.glb hasn't it either, by its materials' names: glbFaces in notes.json.)"
            else:
                said += " (Its glTF export failed too.)"

        warnings.append(said)

    # (Weights that don't add up to one, besides: what Unreal's glTF export does to some meshes)
    for material, skin in entry.get("glbSkins", {}).items():
        if skin["broken"] > max(2, skin["vertices"] // 100):
            warnings.append(f"{name}.glb: {skin['broken']} of {skin['vertices']} of {material}'s vertices have skin weights that don't add up to one, which tear as it moves. Build those parts from the FBX (its weights are whole), or take the mesh's clothing off its sections and export again.")

    return warnings


def main(root=None, out=None):
    root = root or ROOT
    out = out or OUT or os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()), "PellagosExport")
    registry = unreal.AssetRegistryHelpers.get_asset_registry()

    try:
        registry.wait_for_completion()
    except Exception:
        pass

    wanted = MESHES + ANIMATIONS + TEXTURES + MATERIALS
    found = sorted((str(data.package_name), class_of(data), data) for data in registry.get_assets_by_path(root, recursive=True) if class_of(data) in wanted)
    notes = {
        "engine": unreal.SystemLibrary.get_engine_version(),
        "project": unreal.SystemLibrary.get_game_name(),
        "root": root,
        "meshes": {},
        "animations": {},
        "materials": {},
        "textures": {},
        "failed": [],
        "warnings": [],
    }

    unreal.log(f"Exporting {len(found)} assets under {root} into {out}")

    with unreal.ScopedSlowTask(len(found), "Exporting for Pellagos") as slow:
        slow.make_dialog(True)

        for package, kind, data in found:
            if slow.should_cancel():
                notes["failed"].append({"asset": package, "why": "cancelled"})
                break

            slow.enter_progress_frame(1, package)
            asset = data.get_asset()
            base = relative_file(package, root)

            if asset is None:
                notes["failed"].append({"asset": package, "why": "couldn't be loaded"})
            elif kind in MATERIALS:
                notes["materials"][path_of(asset)] = material_notes(asset)
            elif kind in TEXTURES:
                file = next((base + ext for ext in TEXTURE_FORMATS if export(asset, os.path.join(out, base + ext))), None)

                if file:
                    notes["textures"][path_of(asset)] = texture_notes(asset, file.replace(os.sep, "/"), os.path.join(out, file))
                else:
                    notes["failed"].append({"asset": package, "why": "no texture exporter took it"})
            elif export(asset, os.path.join(out, base + ".fbx"), fbx_options()):
                file = (base + ".fbx").replace(os.sep, "/")

                if kind in MESHES:
                    entry = notes["meshes"][path_of(asset)] = mesh_notes(asset, file)

                    try:
                        notes["warnings"] += look_over(asset, entry, out, base)
                    except Exception as error:
                        notes["warnings"].append(f"{package}: what came through its FBX couldn't be read ({error})")
                else:
                    notes["animations"][path_of(asset)] = animation_notes(asset, file)
            else:
                notes["failed"].append({"asset": package, "why": "the FBX export failed"})

    os.makedirs(out, exist_ok=True)

    with open(os.path.join(out, "notes.json"), "w", encoding="utf-8") as file:
        json.dump(notes, file, indent=2, sort_keys=True)

    counts = ", ".join(f"{len(notes[key])} {key}" for key in ("meshes", "animations", "materials", "textures"))

    unreal.log(f"Exported {counts} into {out} (notes.json beside them)")

    for failure in notes["failed"]:
        unreal.log_warning(f"Not exported: {failure['asset']} ({failure['why']})")

    for warning in notes["warnings"]:
        unreal.log_warning(f"Left out: {warning}")

    # (Said in a box too, as parts left out are easily missed in the log)
    if notes["warnings"]:
        shown = notes["warnings"][:8] + ([f"...and {len(notes['warnings']) - 8} more, in notes.json (\"warnings\")"] if len(notes["warnings"]) > 8 else [])

        try:
            unreal.EditorDialog.show_message("Exported for Pellagos, with parts left out", "\n\n".join(shown), unreal.AppMsgType.OK)
        except Exception:
            pass

    return notes


# (However Unreal runs it, pasted or from its file, but not imported by its tests. Run with `py`,
# what's given after the script's path; pasted, ROOT and OUT)
if __name__ != "export_assets":
    main(*(sys.argv[1:3] if sys.argv and sys.argv[0].endswith(".py") else []))
