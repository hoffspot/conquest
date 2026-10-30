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

Montages, blend spaces, blueprints and levels aren't exported: they're Unreal's own, and the
animation sequences they're made of are.
"""

import json
import os
import sys

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


def fbx_options():
    options = unreal.FbxExportOption()

    for name, value in FBX_OPTIONS.items():
        try:
            options.set_editor_property(name, value)
        except Exception:
            pass

    return options


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


def texture_notes(texture, file):
    notes = {"file": file}

    for name in ("srgb", "compression_settings", "lod_group"):
        value = get(texture, name)

        if value is not None:
            notes[name] = value if isinstance(value, bool) else enum_name(value)

    try:
        notes["size"] = [texture.blueprint_get_size_x(), texture.blueprint_get_size_y()]
    except Exception:
        pass

    notes["normal"] = "NORMALMAP" in str(notes.get("compression_settings", "")).upper()

    return notes


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
                    notes["textures"][path_of(asset)] = texture_notes(asset, file.replace(os.sep, "/"))
                else:
                    notes["failed"].append({"asset": package, "why": "no texture exporter took it"})
            elif export(asset, os.path.join(out, base + ".fbx"), fbx_options()):
                file = (base + ".fbx").replace(os.sep, "/")

                if kind in MESHES:
                    notes["meshes"][path_of(asset)] = mesh_notes(asset, file)
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

    return notes


# (However Unreal runs it, pasted or from its file, but not imported by its tests. Run with `py`,
# what's given after the script's path; pasted, ROOT and OUT)
if __name__ != "export_assets":
    main(*(sys.argv[1:3] if sys.argv and sys.argv[0].endswith(".py") else []))
