"""Tests for export_assets.py (no Unreal needed: a stand-in for its `unreal` module): python3 unreal/test_export_assets.py"""

import json
import os
import sys
import tempfile
import types
import unittest

# --- A stand-in for the Unreal Editor's Python module: the little the script uses ---

unreal = types.ModuleType("unreal")


class Enum:
    def __init__(self, name):
        self.name = name


class Thing:
    """An object with editor properties (a dict), some of which may be missing."""

    def __init__(self, **properties):
        self.properties = properties

    def get_editor_property(self, name):
        if name not in self.properties:
            raise Exception(f"no property {name}")

        return self.properties[name]

    def set_editor_property(self, name, value):
        self.properties[name] = value


class Asset(Thing):
    def __init__(self, path, **properties):
        super().__init__(**properties)
        self.path = path

    def get_path_name(self):
        return self.path


class Skeleton(Asset):
    pass


class SkeletalMesh(Asset):
    pass


class StaticMesh(Asset):
    pass


class AnimSequence(Asset):
    pass


class Texture2D(Asset):
    def blueprint_get_size_x(self):
        return self.properties.get("size", (0, 0))[0]

    def blueprint_get_size_y(self):
        return self.properties.get("size", (0, 0))[1]


class MaterialInterface(Asset):
    pass


class Material(MaterialInterface):
    pass


class MaterialInstance(MaterialInterface):
    def get_base_material(self):
        parent = self.properties.get("parent")

        return parent.get_base_material() if isinstance(parent, MaterialInstance) else parent


class MaterialInstanceConstant(MaterialInstance):
    pass


class Blueprint(Asset):
    pass


class FbxExportOption(Thing):
    # (One option this engine version hasn't got)
    def set_editor_property(self, name, value):
        if name == "export_local_time":
            raise Exception("no property export_local_time")

        super().set_editor_property(name, value)


class AssetExportTask(Thing):
    pass


exported = []


class Exporter:
    @staticmethod
    def run_asset_export_task(task):
        asset, filename = task.properties["object"], task.properties["filename"]
        exported.append(task)

        # (A 16-bit texture TGA can't take; and one asset no exporter takes)
        if os.path.splitext(filename)[1] in asset.properties.get("refuses", ()):
            return False

        with open(filename, "w") as file:
            file.write("exported")

        return True


class AssetData:
    def __init__(self, asset, kind):
        self.asset = asset
        self.package_name = asset.path.split(".")[0]
        self.asset_class_path = types.SimpleNamespace(asset_name=kind)

    def get_asset(self):
        return self.asset


class Registry:
    def __init__(self, entries):
        self.entries = entries

    def wait_for_completion(self):
        pass

    def get_assets_by_path(self, root, recursive=False):
        return [entry for entry in self.entries if entry.package_name.startswith(root.rstrip("/") + "/")]


class MaterialEditingLibrary:
    @staticmethod
    def get_texture_parameter_names(material):
        return list(material.properties.get("textures", {}))

    @staticmethod
    def get_scalar_parameter_names(material):
        return list(material.properties.get("scalars", {}))

    @staticmethod
    def get_vector_parameter_names(material):
        return list(material.properties.get("vectors", {}))

    @staticmethod
    def get_material_instance_texture_parameter_value(material, name):
        return material.properties["textures"][name]

    @staticmethod
    def get_material_instance_scalar_parameter_value(material, name):
        return material.properties["scalars"][name]

    @staticmethod
    def get_material_instance_vector_parameter_value(material, name):
        return material.properties["vectors"][name]

    get_material_default_texture_parameter_value = get_material_instance_texture_parameter_value
    get_material_default_scalar_parameter_value = get_material_instance_scalar_parameter_value
    get_material_default_vector_parameter_value = get_material_instance_vector_parameter_value

    @staticmethod
    def get_used_textures(material):
        return material.properties.get("used", [])


class ScopedSlowTask:
    def __init__(self, work, description):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def make_dialog(self, can_cancel):
        pass

    def should_cancel(self):
        return False

    def enter_progress_frame(self, work, description):
        pass


logged = []

for name, value in list(locals().items()):
    if isinstance(value, type) and name not in ("Thing", "Asset", "Enum", "AssetData", "Registry"):
        setattr(unreal, name, value)

unreal.AnimationLibrary = types.SimpleNamespace(get_sequence_length=lambda animation: animation.properties["length"])
unreal.SystemLibrary = types.SimpleNamespace(get_engine_version=lambda: "5.5.1", get_game_name=lambda: "FabSamples")
unreal.Paths = types.SimpleNamespace(project_dir=lambda: "../../Project/", convert_relative_path_to_full=lambda path: "/project")
unreal.log = logged.append
unreal.log_warning = logged.append

sys.modules["unreal"] = unreal
sys.path.insert(0, os.path.dirname(__file__))

import export_assets  # noqa: E402
from export_assets import main, relative_file  # noqa: E402

# --- A bought pack, as Fab adds it to a project ---

skeleton = Skeleton("/Game/Monster4/Meshes/SK_Monster4_Skeleton.SK_Monster4_Skeleton")
colour = Texture2D("/Game/Monster4/Textures/T_Monster4_D.T_Monster4_D", srgb=True, compression_settings=Enum("TC_DEFAULT"), size=(4096, 4096))
normal = Texture2D("/Game/Monster4/Textures/T_Monster4_N.T_Monster4_N", srgb=False, compression_settings=Enum("TC_NORMALMAP"), size=(4096, 4096))
masks = Texture2D("/Game/Monster4/Textures/T_Monster4_ORM.T_Monster4_ORM", srgb=False, compression_settings=Enum("TC_MASKS"), refuses=(".tga",))
broken = Texture2D("/Game/Monster4/Textures/T_Broken.T_Broken", refuses=(".tga", ".png", ".exr", ".hdr"))
master = Material("/Game/Monster4/Materials/M_Creature.M_Creature", used=[colour, normal, masks])
skin = MaterialInstanceConstant(
    "/Game/Monster4/Materials/MI_Monster4.MI_Monster4",
    parent=master,
    textures={"BaseColor": colour, "Normal": normal, "ORM": masks},
    scalars={"RoughnessScale": 0.85},
    vectors={"Tint": types.SimpleNamespace(r=1, g=0.5, b=0.25, a=1)},
)
mesh = SkeletalMesh(
    "/Game/Monster4/Meshes/SK_Monster4.SK_Monster4",
    skeleton=skeleton,
    materials=[Thing(material_slot_name="Body", material_interface=skin)],
)
rock = StaticMesh("/Game/Props/SM_Rock.SM_Rock", static_materials=[Thing(material_slot_name="Rock", material_interface=None)])
walk = AnimSequence("/Game/Monster4/Animations/Walk_F.Walk_F", skeleton=skeleton, length=1.2333333)
stuck = AnimSequence("/Game/Monster4/Animations/Stuck.Stuck", skeleton=skeleton, length=1, refuses=(".fbx",))
blueprint = Blueprint("/Game/Monster4/BP_Monster4.BP_Monster4")

entries = [
    AssetData(mesh, "SkeletalMesh"),
    AssetData(rock, "StaticMesh"),
    AssetData(walk, "AnimSequence"),
    AssetData(stuck, "AnimSequence"),
    AssetData(colour, "Texture2D"),
    AssetData(normal, "Texture2D"),
    AssetData(masks, "Texture2D"),
    AssetData(broken, "Texture2D"),
    AssetData(master, "Material"),
    AssetData(skin, "MaterialInstanceConstant"),
    AssetData(blueprint, "Blueprint"),
    AssetData(skeleton, "Skeleton"),
]
unreal.AssetRegistryHelpers = types.SimpleNamespace(get_asset_registry=lambda: Registry(entries))


class Export(unittest.TestCase):
    def setUp(self):
        exported.clear()
        self.out = tempfile.mkdtemp()
        self.notes = main("/Game", self.out)

    def files(self):
        return sorted(os.path.relpath(os.path.join(folder, name), self.out).replace(os.sep, "/") for folder, _, names in os.walk(self.out) for name in names)

    def test_each_where_it_is_in_the_content_browser(self):
        self.assertEqual(
            self.files(),
            [
                "Monster4/Animations/Walk_F.fbx",
                "Monster4/Meshes/SK_Monster4.fbx",
                "Monster4/Textures/T_Monster4_D.tga",
                "Monster4/Textures/T_Monster4_N.tga",
                "Monster4/Textures/T_Monster4_ORM.png",
                "Props/SM_Rock.fbx",
                "notes.json",
            ],
        )

    def test_fbx_options_the_full_mesh_alone(self):
        fbx = [task for task in exported if task.properties["filename"].endswith(".fbx")]

        self.assertTrue(fbx)

        for task in fbx:
            options = task.properties["options"].properties

            self.assertEqual(task.properties["automated"], True)
            self.assertEqual(task.properties["prompt"], False)
            self.assertEqual(options["level_of_detail"], False)
            self.assertEqual(options["collision"], False)
            self.assertEqual(options["export_morph_targets"], True)
            self.assertEqual(options["export_preview_mesh"], False)
            self.assertEqual(options["ascii"], False)
            self.assertNotIn("export_local_time", options)

    def test_notes(self):
        with open(os.path.join(self.out, "notes.json"), encoding="utf-8") as file:
            notes = json.load(file)

        self.assertEqual(notes, json.loads(json.dumps(self.notes, sort_keys=True)))
        self.assertEqual([notes["engine"], notes["project"], notes["root"]], ["5.5.1", "FabSamples", "/Game"])
        self.assertEqual(
            notes["meshes"][mesh.path],
            {"file": "Monster4/Meshes/SK_Monster4.fbx", "skeleton": skeleton.path, "materials": [{"slot": "Body", "material": skin.path}]},
        )
        self.assertEqual(notes["meshes"][rock.path]["materials"], [{"slot": "Rock", "material": None}])
        self.assertEqual(notes["animations"], {walk.path: {"file": "Monster4/Animations/Walk_F.fbx", "skeleton": skeleton.path, "seconds": 1.233}})

        instance = notes["materials"][skin.path]

        self.assertEqual(instance["parent"], master.path)
        self.assertEqual(instance["textures"], {"BaseColor": colour.path, "Normal": normal.path, "ORM": masks.path})
        self.assertEqual(instance["scalars"], {"RoughnessScale": 0.85})
        self.assertEqual(instance["vectors"], {"Tint": [1, 0.5, 0.25, 1]})
        self.assertEqual(instance["used"], sorted([colour.path, normal.path, masks.path]))
        self.assertIsNone(notes["materials"][master.path]["parent"])

        self.assertEqual(notes["textures"][normal.path], {"file": "Monster4/Textures/T_Monster4_N.tga", "srgb": False, "compression_settings": "TC_NORMALMAP", "size": [4096, 4096], "normal": True})
        self.assertEqual(notes["textures"][colour.path]["normal"], False)
        self.assertEqual(notes["textures"][masks.path]["file"], "Monster4/Textures/T_Monster4_ORM.png")

    def test_what_failed_said(self):
        self.assertEqual(
            sorted((failure["asset"], failure["why"]) for failure in self.notes["failed"]),
            [("/Game/Monster4/Animations/Stuck", "the FBX export failed"), ("/Game/Monster4/Textures/T_Broken", "no texture exporter took it")],
        )
        self.assertTrue(any("Not exported: /Game/Monster4/Textures/T_Broken" in line for line in logged))

    def test_one_folder(self):
        out = tempfile.mkdtemp()
        notes = main("/Game/Props", out)

        self.assertEqual(list(notes["meshes"]), [rock.path])
        self.assertTrue(os.path.isfile(os.path.join(out, "Props", "SM_Rock.fbx")))


class Pasted(unittest.TestCase):
    def test_root_and_out_as_set_at_the_top(self):
        out = tempfile.mkdtemp()
        export_assets.ROOT, export_assets.OUT = "/Game/Props", out

        try:
            notes = main()
        finally:
            export_assets.ROOT, export_assets.OUT = "/Game", None

        self.assertEqual(notes["root"], "/Game/Props")
        self.assertEqual(list(notes["meshes"]), [rock.path])
        self.assertTrue(os.path.isfile(os.path.join(out, "Props", "SM_Rock.fbx")))

    def test_into_the_project_by_default(self):
        project = tempfile.mkdtemp()
        unreal.Paths.convert_relative_path_to_full = lambda path: project

        try:
            main()
        finally:
            unreal.Paths.convert_relative_path_to_full = lambda path: "/project"

        self.assertTrue(os.path.isfile(os.path.join(project, "PellagosExport", "Monster4", "Meshes", "SK_Monster4.fbx")))
        self.assertTrue(os.path.isfile(os.path.join(project, "PellagosExport", "notes.json")))


class RelativeFile(unittest.TestCase):
    def test_under_its_mount_point(self):
        self.assertEqual(relative_file("/Game/Monster4/Meshes/SK_Monster4", "/Game"), os.path.join("Monster4", "Meshes", "SK_Monster4"))
        self.assertEqual(relative_file("/Game/Monster4/Meshes/SK_Monster4", "/Game/Monster4"), os.path.join("Monster4", "Meshes", "SK_Monster4"))
        self.assertEqual(relative_file("/FabPlugin/Meshes/SK_Wolf", "/FabPlugin"), os.path.join("Meshes", "SK_Wolf"))


if __name__ == "__main__":
    unittest.main()
