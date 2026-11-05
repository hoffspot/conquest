"""Tests for export_assets.py (no Unreal needed: a stand-in for its `unreal` module): python3 unreal/test_export_assets.py"""

import json
import os
import struct
import sys
import tempfile
import types
import unittest
import zlib

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
    # (Its LOD 0 sections, [slot, simulated as cloth]: one for each slot unless it's given them)
    def sections(self):
        return self.properties.get("sections", [[slot, False] for slot in range(len(self.properties.get("materials", [])))])

    def is_section_using_cloth(self, section, check_corresponding_sections):
        return self.sections()[section][1]


class StaticMesh(Asset):
    pass


class AnimSequence(Asset):
    pass


class Texture2D(Asset):
    # (What's loaded of it: as Unreal has it, only as much as the editor's drawn, 32 pixels across
    # for a texture it hasn't, whatever its size)
    def blueprint_get_size_x(self):
        return 32

    def blueprint_get_size_y(self):
        return 32


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


class GLTFExportOptions(Thing):
    # (One option this plugin version hasn't got)
    def set_editor_property(self, name, value):
        if name == "export_level_sequences":
            raise Exception("no property export_level_sequences")

        super().set_editor_property(name, value)


class SkeletalMeshEditorSubsystem:
    def get_num_sections(self, mesh, lod):
        return len(mesh.sections())

    def get_lod_material_slot(self, mesh, lod, section):
        return mesh.sections()[section][0]


class AssetExportTask(Thing):
    pass


# --- Files as Unreal's exporters write them: a binary FBX, a .glb ---


def fbx_file(nodes, version=7400):
    """A binary FBX of nodes, each (name, properties, children); a property an int (int64), bytes
    (a string), or (an int32 array, zlib'd or not)."""
    wide = version >= 7500
    head, size = ("<QQQ", 24) if wide else ("<III", 12)

    def properties(values):
        out = b""

        for value in values:
            if isinstance(value, bytes):
                out += b"S" + struct.pack("<I", len(value)) + value
            elif isinstance(value, int):
                out += b"L" + struct.pack("<q", value)
            else:
                numbers, packed = value
                raw = struct.pack(f"<{len(numbers)}i", *numbers)
                stored = zlib.compress(raw) if packed else raw
                out += b"i" + struct.pack("<III", len(numbers), 1 if packed else 0, len(stored)) + stored

        return out

    def write(node, at):
        name, values, children = node
        body = properties(values)
        start = at + size + 1 + len(name) + len(body)
        inside = b""

        for child in children:
            inside += write(child, start + len(inside))

        if children:
            inside += bytes(size + 1)

        return struct.pack(head, start + len(inside), len(values), len(body)) + bytes([len(name)]) + name.encode() + body + inside

    data = b"Kaydara FBX Binary  \x00\x1a\x00" + struct.pack("<I", version)

    for node in nodes:
        data += write(node, len(data))

    return data + bytes(size + 1)


def mesh_fbx(materials, faces, version=7400, packed=False, mapping=b"ByPolygon"):
    """A mesh's FBX as Unreal writes one: a triangle for each face, each slot's material in order (a
    material in two slots the second time numbered by its slot)."""
    each = [index for index, count in enumerate(faces) for _ in range(count)]
    corners = [corner for face in range(len(each)) for corner in (3 * face, 3 * face + 1, -(3 * face + 2) - 1)]
    names = [name if name not in materials[:index] else f"{name}_{index}" for index, name in enumerate(materials)]
    geometry = ("Geometry", [10, b"Mesh\x00\x01Geometry", b"Mesh"], [
        ("PolygonVertexIndex", [(corners, packed)], []),
        ("LayerElementMaterial", [0], [("MappingInformationType", [mapping], []), ("Materials", [(each if mapping == b"ByPolygon" else each[:1], packed)], [])]),
    ])
    model = ("Model", [20, b"Mesh\x00\x01Model", b"Mesh"], [])
    found = [("Material", [100 + index, name.encode() + b"\x00\x01Material", b""], []) for index, name in enumerate(names)]
    links = [("C", [b"OO", 10, 20], [])] + [("C", [b"OO", 100 + index, 20], []) for index in range(len(names))]

    return fbx_file([("FBXHeaderExtension", [], [("FBXVersion", [version], [])]), ("Objects", [], [geometry, model] + found), ("Connections", [], links)], version)


def glb_file(faces):
    """A .glb as Unreal's glTF Exporter writes one: a primitive for each material, named as it is."""
    document = {
        "asset": {"version": "2.0"},
        "materials": [{"name": name} for name in faces],
        "accessors": [{"count": 3 * count, "componentType": 5125, "type": "SCALAR"} for count in faces.values()],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": index, "material": index} for index in range(len(faces))]}],
    }
    text = json.dumps(document).encode()
    text += b" " * (-len(text) % 4)

    return b"glTF" + struct.pack("<II", 2, 20 + len(text)) + struct.pack("<II", len(text), 0x4E4F534A) + text


exported = []


class Exporter:
    @staticmethod
    def run_asset_export_task(task):
        asset, filename = task.properties["object"], task.properties["filename"]
        exported.append(task)

        # (A 16-bit texture TGA can't take; and one asset no exporter takes)
        if os.path.splitext(filename)[1] in asset.properties.get("refuses", ()):
            return False

        # (An image as its format starts: its size in its header, as Unreal writes it)
        width, height = asset.properties.get("size", (0, 0))
        ext = os.path.splitext(filename)[1]
        heads = {
            ".tga": bytes(12) + width.to_bytes(2, "little") + height.to_bytes(2, "little") + bytes([32, 8]),
            ".png": b"\x89PNG\r\n\x1a\n" + bytes([0, 0, 0, 13]) + b"IHDR" + width.to_bytes(4, "big") + height.to_bytes(4, "big"),
        }

        # (A mesh's FBX, each slot's faces as given, 12 to each slot otherwise; its .glb)
        if ext == ".fbx" and isinstance(asset, (SkeletalMesh, StaticMesh)):
            slots = asset.properties.get("materials", asset.properties.get("static_materials", []))
            materials = [(slot.properties["material_interface"].path.split(".")[-1] if slot.properties["material_interface"] else "WorldGridMaterial") for slot in slots]
            heads[ext] = asset.properties.get("fbx") or mesh_fbx(materials, asset.properties.get("faces", [12] * len(slots)))
        elif ext == ".glb":
            heads[ext] = glb_file(asset.properties["glb"])

        with open(filename, "wb") as file:
            file.write(heads.get(ext, b"exported"))

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
dialogs = []


class EditorDialog:
    @staticmethod
    def show_message(title, message, kind):
        dialogs.append((title, message, kind))


for name, value in list(locals().items()):
    if isinstance(value, type) and name not in ("Thing", "Asset", "Enum", "AssetData", "Registry"):
        setattr(unreal, name, value)

unreal.get_editor_subsystem = lambda kind: kind()
unreal.AppMsgType = types.SimpleNamespace(OK="OK")
unreal.GLTFMaterialBakeMode = types.SimpleNamespace(DISABLED="BAKE_DISABLED")
unreal.GLTFTextureImageFormat = types.SimpleNamespace(NONE="NO_IMAGES")

unreal.AnimationLibrary = types.SimpleNamespace(get_sequence_length=lambda animation: animation.properties["length"])
unreal.SystemLibrary = types.SimpleNamespace(get_engine_version=lambda: "5.5.1", get_game_name=lambda: "FabSamples")
unreal.Paths = types.SimpleNamespace(project_dir=lambda: "../../Project/", convert_relative_path_to_full=lambda path: "/project")
unreal.log = logged.append
unreal.log_warning = logged.append

sys.modules["unreal"] = unreal
sys.path.insert(0, os.path.dirname(__file__))

import export_assets  # noqa: E402
from export_assets import fbx_faces, glb_faces, main, relative_file  # noqa: E402

# --- A bought pack, as Fab adds it to a project ---

skeleton = Skeleton("/Game/Monster4/Meshes/SK_Monster4_Skeleton.SK_Monster4_Skeleton")
colour = Texture2D("/Game/Monster4/Textures/T_Monster4_D.T_Monster4_D", srgb=True, compression_settings=Enum("TC_DEFAULT"), size=(4096, 4096))
normal = Texture2D("/Game/Monster4/Textures/T_Monster4_N.T_Monster4_N", srgb=False, compression_settings=Enum("TC_NORMALMAP"), size=(4096, 4096))
masks = Texture2D("/Game/Monster4/Textures/T_Monster4_ORM.T_Monster4_ORM", srgb=False, compression_settings=Enum("TC_MASKS"), size=(2048, 2048), refuses=(".tga",))
sky = Texture2D("/Game/Monster4/Textures/T_Sky.T_Sky", srgb=False, imported_size=types.SimpleNamespace(x=1024, y=512), refuses=(".tga", ".png"))
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

# (A horse whose FBX loses parts, as the Order of the Bell's did: its caparison simulated as cloth,
# its mane's section turned off; a slot no section uses; and its .glb, which has the caparison)
coat, caparison, mane, spare = (MaterialInstanceConstant(f"/Game/Horse/Materials/{name}.{name}", parent=master) for name in ("MI_Horse", "MI_Horse_Cloth", "MI_Horse_Hair", "MI_Horse_Spare"))
horse = SkeletalMesh(
    "/Game/Horse/SKM_Horse.SKM_Horse",
    skeleton=skeleton,
    materials=[Thing(material_slot_name=slot, material_interface=material) for slot, material in (("Horse", coat), ("cloth", caparison), ("hair", mane), ("spare", spare), ("Horse2", coat))],
    mesh_clothing_assets=[Asset("/Game/Horse/SKM_Horse.SKM_Horse:ClothingAssetCommon_0")],
    sections=[[0, False], [1, True], [2, False], [4, False]],
    faces=[300, 0, 0, 0, 20],
    glb={"MI_Horse": 320, "MI_Horse_Cloth": 90},
)
walk = AnimSequence("/Game/Monster4/Animations/Walk_F.Walk_F", skeleton=skeleton, length=1.2333333)
stuck = AnimSequence("/Game/Monster4/Animations/Stuck.Stuck", skeleton=skeleton, length=1, refuses=(".fbx",))
blueprint = Blueprint("/Game/Monster4/BP_Monster4.BP_Monster4")

entries = [
    AssetData(mesh, "SkeletalMesh"),
    AssetData(rock, "StaticMesh"),
    AssetData(horse, "SkeletalMesh"),
    AssetData(walk, "AnimSequence"),
    AssetData(stuck, "AnimSequence"),
    AssetData(colour, "Texture2D"),
    AssetData(normal, "Texture2D"),
    AssetData(masks, "Texture2D"),
    AssetData(sky, "Texture2D"),
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
                "Horse/SKM_Horse.fbx",
                "Horse/SKM_Horse.glb",
                "Monster4/Animations/Walk_F.fbx",
                "Monster4/Meshes/SK_Monster4.fbx",
                "Monster4/Textures/T_Monster4_D.tga",
                "Monster4/Textures/T_Monster4_N.tga",
                "Monster4/Textures/T_Monster4_ORM.png",
                "Monster4/Textures/T_Sky.exr",
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
            {
                "file": "Monster4/Meshes/SK_Monster4.fbx",
                "skeleton": skeleton.path,
                "materials": [{"slot": "Body", "material": skin.path, "faces": 12}],
                "sections": [{"slot": 0, "cloth": False}],
            },
        )
        self.assertEqual(notes["meshes"][rock.path]["materials"], [{"slot": "Rock", "material": None, "faces": 12}])
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

        # (Each one's size as exported, not what the editor's loaded of it; one whose file it can't
        # read, as it was imported)
        self.assertEqual(notes["textures"][colour.path]["size"], [4096, 4096])
        self.assertEqual(notes["textures"][masks.path]["size"], [2048, 2048])
        self.assertEqual([notes["textures"][sky.path]["file"], notes["textures"][sky.path]["size"]], ["Monster4/Textures/T_Sky.exr", [1024, 512]])

    def test_what_failed_said(self):
        self.assertEqual(
            sorted((failure["asset"], failure["why"]) for failure in self.notes["failed"]),
            [("/Game/Monster4/Animations/Stuck", "the FBX export failed"), ("/Game/Monster4/Textures/T_Broken", "no texture exporter took it")],
        )
        self.assertTrue(any("Not exported: /Game/Monster4/Textures/T_Broken" in line for line in logged))

    def test_a_mesh_whose_fbx_lost_parts(self):
        notes = self.notes["meshes"][horse.path]

        # (Each slot's faces as the FBX has them; its sections and clothing)
        self.assertEqual([slot["faces"] for slot in notes["materials"]], [300, 0, 0, 0, 20])
        self.assertEqual(notes["sections"], [{"slot": 0, "cloth": False}, {"slot": 1, "cloth": True}, {"slot": 2, "cloth": False}, {"slot": 4, "cloth": False}])
        self.assertEqual(notes["clothing"], ["/Game/Horse/SKM_Horse.SKM_Horse:ClothingAssetCommon_0"])

        # (Lost: the caparison, as cloth, and the mane, its section off; not the slot no section uses)
        self.assertEqual(notes["lost"], [{"slot": "cloth", "material": caparison.path, "why": "cloth"}, {"slot": "hair", "material": mane.path, "why": "off"}])

        # (Exported as glTF too, which has the caparison but not the mane)
        self.assertEqual(notes["glb"], "Horse/SKM_Horse.glb")
        self.assertEqual(notes["glbFaces"], {"MI_Horse": 320, "MI_Horse_Cloth": 90})
        self.assertEqual(notes["found"], ["cloth"])

        warnings = self.notes["warnings"]

        self.assertEqual(len(warnings), 2)
        self.assertIn("SKM_Horse: the slot 'cloth' (MI_Horse_Cloth) has no faces in its FBX: its section is simulated as cloth", warnings[0])
        self.assertIn("It's in SKM_Horse.glb", warnings[0])
        self.assertIn("SKM_Horse: the slot 'hair' (MI_Horse_Hair) has no faces in its FBX: its section is likely turned off", warnings[1])
        self.assertIn("right-click that section and enable it", warnings[1])
        self.assertIn("SKM_Horse.glb hasn't it either", warnings[1])

        # (Said in the log, and in a box at the end)
        self.assertTrue(any(line.startswith("Left out: SKM_Horse: the slot 'hair'") for line in logged))
        self.assertEqual(dialogs[-1][0], "Exported for Pellagos, with parts left out")
        self.assertEqual(dialogs[-1][1], "\n\n".join(warnings))

        # (No glTF of a mesh that lost nothing)
        self.assertNotIn("glb", self.notes["meshes"][mesh.path])
        self.assertNotIn("lost", self.notes["meshes"][mesh.path])

    def test_gltf_options(self):
        gltf = [task for task in exported if task.properties["filename"].endswith(".glb")]

        self.assertEqual([task.properties["object"] for task in gltf], [horse])

        options = gltf[0].properties["options"].properties

        self.assertEqual(gltf[0].properties["prompt"], False)
        self.assertEqual(options["default_level_of_detail"], 0)
        self.assertEqual(options["export_vertex_skin_weights"], True)
        self.assertEqual(options["export_animation_sequences"], False)
        self.assertEqual(options["bake_material_inputs"], "BAKE_DISABLED")
        self.assertEqual(options["texture_image_format"], "NO_IMAGES")
        self.assertNotIn("export_level_sequences", options)

    def test_without_the_gltf_exporter(self):
        out = tempfile.mkdtemp()
        del unreal.GLTFExportOptions

        try:
            notes = main("/Game/Horse", out)
        finally:
            unreal.GLTFExportOptions = GLTFExportOptions

        self.assertFalse(os.path.exists(os.path.join(out, "Horse", "SKM_Horse.glb")))
        self.assertNotIn("glb", notes["meshes"][horse.path])
        self.assertEqual(len(notes["warnings"]), 2)

        for warning in notes["warnings"]:
            self.assertIn("To have it, open the mesh", warning)
            self.assertIn("turn on the glTF Exporter plugin", warning)

    def test_an_engine_that_cant_say_which_slots_are_used(self):
        out = tempfile.mkdtemp()
        unreal.get_editor_subsystem = lambda kind: (_ for _ in ()).throw(Exception("no subsystem"))

        try:
            notes = main("/Game/Horse", out)
        finally:
            unreal.get_editor_subsystem = lambda kind: kind()

        # (Every empty slot of it told of, the unused one too; sections not said)
        self.assertNotIn("sections", notes["meshes"][horse.path])
        self.assertEqual([(part["slot"], part["why"]) for part in notes["meshes"][horse.path]["lost"]], [("cloth", "unknown"), ("hair", "unknown"), ("spare", "unknown")])
        self.assertIn("can't say whether a section uses it", notes["warnings"][0])

    def test_an_fbx_it_cant_read_back(self):
        out = tempfile.mkdtemp()
        horse.properties["fbx"] = b"Kaydara FBX Binary  \x00\x1a\x00" + struct.pack("<I", 7400) + bytes([5, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1]) + b"X" + b"?"

        try:
            notes = main("/Game/Horse", out)
        finally:
            del horse.properties["fbx"]

        self.assertEqual(notes["warnings"], ["SKM_Horse: its FBX couldn't be read back, to see that all of it came through"])
        self.assertNotIn("faces", notes["meshes"][horse.path]["materials"][0])

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


class ReadBack(unittest.TestCase):
    def write(self, data, ext=".fbx"):
        path = os.path.join(tempfile.mkdtemp(), "mesh" + ext)

        with open(path, "wb") as file:
            file.write(data)

        return path

    def test_fbx_faces_by_material_in_order(self):
        for version, packed in ((7400, False), (7500, True), (7700, True)):
            path = self.write(mesh_fbx(["MI_Body", "MI_Cloth", "MI_Cloth", "MI_Cloth"], [40, 0, 7, 3], version=version, packed=packed))

            self.assertEqual(fbx_faces(path), [["MI_Body", 40], ["MI_Cloth", 0], ["MI_Cloth_2", 7], ["MI_Cloth_3", 3]], f"FBX {version}")

    def test_fbx_faces_one_material_for_all(self):
        path = self.write(mesh_fbx(["MI_Rock", "MI_Moss"], [9, 0], mapping=b"AllSame"))

        self.assertEqual(fbx_faces(path), [["MI_Rock", 9], ["MI_Moss", 0]])

    def test_fbx_faces_of_what_isnt_a_binary_fbx(self):
        self.assertIsNone(fbx_faces(self.write(b"; FBX 7.4.0 project file")))
        self.assertIsNone(fbx_faces(os.path.join(tempfile.mkdtemp(), "none.fbx")))

    def test_glb_faces(self):
        self.assertEqual(glb_faces(self.write(glb_file({"MI_Horse": 12, "MI_Horse_Cloth": 5}), ".glb")), {"MI_Horse": 12, "MI_Horse_Cloth": 5})
        self.assertIsNone(glb_faces(self.write(b"not a glb", ".glb")))


class RelativeFile(unittest.TestCase):
    def test_under_its_mount_point(self):
        self.assertEqual(relative_file("/Game/Monster4/Meshes/SK_Monster4", "/Game"), os.path.join("Monster4", "Meshes", "SK_Monster4"))
        self.assertEqual(relative_file("/Game/Monster4/Meshes/SK_Monster4", "/Game/Monster4"), os.path.join("Monster4", "Meshes", "SK_Monster4"))
        self.assertEqual(relative_file("/FabPlugin/Meshes/SK_Wolf", "/FabPlugin"), os.path.join("Meshes", "SK_Wolf"))


if __name__ == "__main__":
    unittest.main()
