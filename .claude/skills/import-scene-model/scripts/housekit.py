# A modular house kit made one file for the model pipeline (Meshsmith Foundry's half-timbered
# building kit: world/art/kits/kithouse.js builds the humans' houses of it). Unlike kit.py's pieces,
# every piece keeps the pack's own pivot, the point its grid snaps to: a wall piece's inner face at
# y = 0 and its foot at z = 0, -y out (the game's +z). Each is set with its pivot in the middle of a
# square of its own (`--cells` metres), for the pipeline to join them by kind, bake each kind's
# materials onto one atlas and cut them apart again into those squares; which square each is in
# written beside the .blend (<out>.cells.json), and what each kind is (<out>.joins.json: the
# config's `join`).
#
# Kinds, each a mesh of its own once joined (one draw call each):
# - "walls": frames, braces, window frames, doors, foundations, floors, beams, finials, ridge caps,
#   baked onto one atlas;
# - "fills": the plaster between the timbers, one plain material (the game draws it with its own
#   plaster, each house's limewash);
# - "glass": the windows' panes, one plain material (the game draws them with its own glass, lit at
#   night);
# - "RoofTiles_<colour>": a plane of one repeat of the roof's tiles (2 m across, ten rows up the
#   slope), its own material, baked flat from the kit's tiles (tiles.py), for the game's roofs.
#
# With the pipeline's Blender Python, from the repository's root:
#   utilities/blenderpipeline/.venv/bin/python -I .claude/skills/import-scene-model/scripts/housekit.py -- <Meshes dir> <pieces.json> <tiles dir> <out .blend> [--cells 3]
# pieces.json: the pack's mesh names ("S_WallFrame_2m", ...); roofs come from the tiles dir:
# tile_<Colour>_colour.png and tile_<Colour>_normal.png.
import bpy, sys, os, json, glob
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
cells = 3.0
if "--cells" in args:
    at = args.index("--cells")
    cells = float(args[at + 1])
    args = args[:at] + args[at + 2:]
src, listed, tiles, out = args[:4]
ROW = 10
REPEAT = (2.0, 10 * (1 + 1.2 ** 2) ** 0.5 / 7)

with open(listed) as f:
    NAMES = [n for n in json.load(f) if not n.startswith("S_RoofRed_") and not n.startswith("S_RoofSlate_")]
files = {os.path.basename(p)[:-4]: p for p in glob.glob(os.path.join(src, "**", "*.fbx"), recursive=True)}

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
def made(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    return material


plaster = made("M_Plaster")
glass = made("M_Glass")
joins = {"walls": [], "fills": [], "glass": []}
squares = {}


def square(k):
    i, j = k % ROW, k // ROW
    return i, j, Matrix.Translation(Vector(((i + 0.5) * cells, -(j + 0.5) * cells, 0)))


def bring(name):
    before = set(scene.objects)
    bpy.ops.import_scene.fbx(filepath=files[name])
    meshes = [o for o in set(scene.objects) - before if o.type == "MESH"]
    for o in set(scene.objects) - before:
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    piece = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return piece


for k, name in enumerate(NAMES):
    piece = bring(name)
    part = name[2:]
    piece.name = part
    piece.data.name = part
    me = piece.data
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
    if max(abs(min(xs)), abs(max(xs))) * 2 >= cells or max(abs(min(ys)), abs(max(ys))) * 2 >= cells:
        raise SystemExit(f"{part} reaches {min(xs):.2f}..{max(xs):.2f} x {min(ys):.2f}..{max(ys):.2f} from its pivot: more than a square of {cells:g} m holds")
    i, j, move = square(k)
    names = [part]

    if part.startswith("WallFill_"):
        me.materials.clear()
        me.materials.append(plaster)
        joins["fills"].append(part)
    else:
        # (A window's panes made a mesh of their own)
        panes = [s for s, slot in enumerate(piece.material_slots) if slot.material and "Glass" in slot.material.name]
        if panes:
            bpy.ops.object.select_all(action="DESELECT")
            piece.select_set(True)
            bpy.context.view_layer.objects.active = piece
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="DESELECT")
            for s in panes:
                piece.active_material_index = s
                bpy.ops.object.material_slot_select()
            bpy.ops.mesh.separate(type="SELECTED")
            bpy.ops.object.mode_set(mode="OBJECT")
            pane = [o for o in bpy.context.selected_objects if o is not piece][0]
            pane.name = "Glass_" + part
            pane.data.name = pane.name
            pane.data.materials.clear()
            pane.data.materials.append(glass)
            pane.data.transform(move)
            joins["glass"].append(pane.name)
            names.append(pane.name)
            # (its own slots left empty of the panes)
            for s in reversed(panes):
                piece.active_material_index = s
                bpy.ops.object.material_slot_remove()
        joins["walls"].append(part)

    me.transform(move)
    me.update()
    squares[part] = {"cell": [i, j], "nodes": names}
    print(f"{part:44s} square {i},{j}  {len(me.polygons):5d} faces  {[m.name for m in me.materials if m]}")

# The roofs' tiles: a plane each of one repeat, its own material and textures
for n, colour in enumerate(("Red", "Slate")):
    k = len(NAMES) + n
    i, j, move = square(k)
    w, h = REPEAT
    me = bpy.data.meshes.new("RoofTiles_" + colour)
    me.from_pydata([(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)], [], [(0, 1, 2, 3)])
    me.update()
    uv = me.uv_layers.new(name="UVMap")
    for loop, (u, v) in zip(me.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[loop.index].uv = (u, v)
    material = made("M_RoofTiles_" + colour)
    me.materials.append(material)
    me.transform(move)
    o = bpy.data.objects.new(me.name, me)
    scene.collection.objects.link(o)
    squares[me.name] = {"cell": [i, j], "nodes": [me.name], "repeat": [w, round(h, 5)]}
    print(f"{me.name:44s} square {i},{j}  one repeat {w} x {h:.4f} m")

# (A material brought in twice, "MI_Wood_Clean.001": the one material, as the config names it)
for o in scene.objects:
    for slot in o.material_slots:
        if slot.material and "." in slot.material.name:
            base = bpy.data.materials.get(slot.material.name.split(".")[0])
            if base:
                slot.material = base
for material in list(bpy.data.materials):
    if "." in material.name and material.users == 0:
        bpy.data.materials.remove(material)
print("materials", sorted(m.name for m in bpy.data.materials if m.users))

with open(out + ".cells.json", "w") as f:
    json.dump({"size": cells, "row": ROW, "pieces": squares}, f, indent=1)
with open(out + ".joins.json", "w") as f:
    json.dump(joins, f, indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out))
print("pieces", len(squares), "walls", len(joins["walls"]), "fills", len(joins["fills"]), "glass", len(joins["glass"]))
