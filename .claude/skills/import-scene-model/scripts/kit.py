# A kit of a pack's parts, for drawing a dungeon's floors with (Bellhaven's keep: world/keepkit.js),
# saved as a .blend for the model pipeline to build (its own config, `source` the .blend; each part
# a node of its own in what it builds, named for its part in the kit). Each part is brought in from
# its FBX, its objects joined into one, its foot at z = 0 and centred across; a part set against a
# wall turned with its thin way along y and the side its detail's on to -y (Blender's front: the
# game's +z), its back at y = 0, so the game sets it against a wall by turning it alone. A material
# brought in twice (Blender's "M_II_2.001") is made the one material again, as the pipeline's config
# names it. With the pipeline's Blender Python, from the repository's root:
#   utilities/blenderpipeline/.venv/bin/python -I .claude/skills/import-scene-model/scripts/kit.py -- <Meshes dir> <pieces.json> <out .blend> [<picture.png>] [--cells <metres>]
# pieces.json: [[part, the pack's mesh (its FBX's name), set against a wall], ...]: Bellhaven's keep's
# is bellhaven-kit.json, beside this. A part made of several of the pack's meshes (a chest's body
# and its lid, each where it sits on the other) names them all, a list; a fourth, `{ "turn": 180 }`,
# turns a part about the upright once it's set (degrees, counterclockwise from above: a bed's head
# to the back, a wall piece the pack's heuristic turned the wrong way round); `"trim": [low, high]`
# keeps only its faces between those heights (metres, as the pack has it: a chandelier's chain
# cut short, the game drawing its own up to the ceiling); and `"candles": true` finds its
# candles (loose parts thinner than 6 cm and taller than 8 cm) and writes the tip of each, where
# its flame goes, beside the .blend (<out>.candles.json: metres from the middle of the part's foot
# (its box's), as the game has them: x across, y up, z out of its front). The picture: the parts in a row, in
# clay. A face whose texture coordinates sit on one point (a palette's way) is spread over a few
# texels there, so the kit's atlas bakes its colour.
# --cells: each part set in the middle of a square of its own, that many metres a side, in rows of
# five along x (Blender's x; the game's z its -y), for the pipeline to join them, bake their
# materials onto one atlas and cut them apart again (its config's `join` and `cells` with
# `bakeFirst`: utilities/blenderpipeline/README.md, *A kit of pieces*), every part then drawn with
# the one material; which square each is in (its node, "<joined>@<i>,<j>") written beside the
# .blend, <out>.cells.json.
import bpy, bmesh, sys, os, math, json
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
cells = None
if "--cells" in args:
    at = args.index("--cells")
    cells = float(args[at + 1])
    args = args[:at] + args[at + 2:]
src, listed, out = args[:3]
picture = args[3] if len(args) > 3 else None

# (part, source mesh or meshes, set against a wall, how it's turned once set)
with open(listed) as f:
    PIECES = [(each[0], each[1], each[2], each[3] if len(each) > 3 else {}) for each in json.load(f)]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
made = []
candles = {}


def spreadPoints(me):
    # (A face whose texture coordinates all sit on one point of its texture, as a palette's do, or
    # along a line: spread over a few texels round its middle, so baking its material onto the
    # kit's atlas can sample its colour there, not leave it black)
    if not me.uv_layers:
        return
    uv = me.uv_layers.active.data
    spread = 0
    for poly in me.polygons:
        loops = list(poly.loop_indices)
        us = [uv[i].uv.x for i in loops]; vs = [uv[i].uv.y for i in loops]
        # (Its area on its texture: none, or less than a quarter of a 512-pixel texture's texel,
        # its corners on a point or a line)
        area = abs(sum(us[k] * vs[k - 1] - us[k - 1] * vs[k] for k in range(len(loops)))) / 2
        if area < 1e-6:
            cu, cv = sum(us) / len(us), sum(vs) / len(vs)
            for k, i in enumerate(loops):
                angle = 2 * math.pi * k / len(loops)
                uv[i].uv = (cu + 0.0015 * math.cos(angle), cv + 0.0015 * math.sin(angle))
            spread += 1
    if spread:
        print(f"  {me.name}: {spread} faces on a point of their texture spread over a few texels")


def candleTips(me):
    # (Its loose parts: those thinner than 6 cm across and taller than 8 cm its candles, the top
    # of each the tip; as the game has it: x, its height, and out of its front, -y)
    seen, tips = set(), []
    every = [v.co for v in me.vertices]
    mx = (min(c.x for c in every) + max(c.x for c in every)) / 2
    my = (min(c.y for c in every) + max(c.y for c in every)) / 2
    foot = min(c.z for c in every)
    links = {v.index: [] for v in me.vertices}
    for e in me.edges:
        a, b = e.vertices
        links[a].append(b); links[b].append(a)
    for v in me.vertices:
        if v.index in seen:
            continue
        stack, part = [v.index], []
        seen.add(v.index)
        while stack:
            a = stack.pop(); part.append(me.vertices[a].co)
            for b in links[a]:
                if b not in seen:
                    seen.add(b); stack.append(b)
        xs = [c.x for c in part]; ys = [c.y for c in part]; zs = [c.z for c in part]
        if max(max(xs) - min(xs), max(ys) - min(ys)) < 0.06 and max(zs) - min(zs) > 0.08:
            tips.append([round((min(xs) + max(xs)) / 2 - mx, 4), round(max(zs) - foot, 4), round(my - (min(ys) + max(ys)) / 2, 4)])
    # (A candle stood in its cup: the cup's top left out, the candle's own kept, the highest of
    # those within 2 cm of each other across)
    kept = []
    for tip in sorted(tips, key=lambda t: -t[1]):
        if all(math.hypot(tip[0] - k[0], tip[2] - k[2]) > 0.02 for k in kept):
            kept.append(tip)
    return sorted(kept)

for part, name, wall, how in PIECES:
    before = set(scene.objects)
    for each in [name] if isinstance(name, str) else name:
        bpy.ops.import_scene.fbx(filepath=os.path.join(src, each + ".fbx"))
    name = name if isinstance(name, str) else "+".join(name)
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
    if how.get("trim"):
        low, high = how["trim"]
        bm = bmesh.new()
        bm.from_mesh(piece.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if any(v.co.z < low or v.co.z > high for v in f.verts)], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(piece.data)
        bm.free()
    piece.name = part
    piece.data.name = part
    spreadPoints(piece.data)
    me = piece.data

    if wall:
        # (Its thin way across its depth: turned so that's along y; then its front the side its
        # detail's on, where most of its points lie off its middle, turned to -y)
        xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
        if max(xs) - min(xs) < max(ys) - min(ys):
            me.transform(Matrix.Rotation(math.radians(90), 4, "Z"))
        ys = [v.co.y for v in me.vertices]
        middle = (min(ys) + max(ys)) / 2
        if sum(y - middle for y in ys) / len(ys) > 0:
            me.transform(Matrix.Rotation(math.radians(180), 4, "Z"))

    if how.get("turn"):
        me.transform(Matrix.Rotation(math.radians(how["turn"]), 4, "Z"))

    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    if part == "floor":
        shift = Vector((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs)))
    elif part == "wall":
        # (A plane: stood up facing -y, its foot at 0, centred across)
        shift = Vector((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs)))
    elif wall:
        shift = Vector((-(min(xs) + max(xs)) / 2, -max(ys), -min(zs)))
    else:
        shift = Vector((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs)))
    me.transform(Matrix.Translation(shift))
    me.update()
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    if how.get("candles"):
        candles[part] = candleTips(me)
        print(f"{part}: {len(candles[part])} candles", candles[part])
    print(f"{part:10s} {name:34s} {len(me.polygons):6d} faces  x {min(xs):6.2f}..{max(xs):6.2f}  y {min(ys):6.2f}..{max(ys):6.2f}  z {min(zs):6.2f}..{max(zs):6.2f}  {[m.name for m in me.materials]}")
    made.append(piece)

# (A material brought in twice, its second named "M_II_2.001": the one material, as the pipeline's
# config names it)
for piece in made:
    for slot in piece.material_slots:
        if slot.material and "." in slot.material.name:
            base = bpy.data.materials.get(slot.material.name.split(".")[0])
            if base:
                slot.material = base
# (The meshes joined into others left behind, and with them any hold they had on a material)
for mesh in list(bpy.data.meshes):
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)
for material in list(bpy.data.materials):
    if "." in material.name and material.users == 0:
        bpy.data.materials.remove(material)
print("materials", sorted(m.name for m in bpy.data.materials))

# (Each in a square of its own, its middle the square's: what's in each told beside the .blend)
if cells:
    squares = {}
    for k, piece in enumerate(made):
        me = piece.data
        xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
        if max(xs) - min(xs) >= cells or max(ys) - min(ys) >= cells:
            raise SystemExit(f"{piece.name} is {max(xs) - min(xs):.2f} x {max(ys) - min(ys):.2f}: more than a square of {cells:g} m")
        i, j = k % 5, k // 5
        me.transform(Matrix.Translation(Vector(((i + 0.5) * cells - (min(xs) + max(xs)) / 2, -(j + 0.5) * cells - (min(ys) + max(ys)) / 2, 0))))
        me.update()
        squares[piece.name] = [i, j]
    with open(out + ".cells.json", "w") as f:
        json.dump(squares, f, indent=1)
    print("squares", squares)

if candles:
    with open(out + ".candles.json", "w") as f:
        json.dump(candles, f, indent=1)

# (Laid out in a row, apart, only for the picture; each kept at its own origin in the file)
bpy.ops.wm.save_as_mainfile(filepath=out)

if picture:
    x = 0
    for piece in made:
        w = piece.dimensions.x
        piece.location.x = x + w / 2
        x += w + 1.5
    for piece in made:
        for slot in piece.material_slots:
            slot.material = None
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = x * 0.55
    cam.location = (x / 2, -40, 5)
    cam.rotation_euler = (math.radians(84), 0, 0)
    scene.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.rotation_euler = (math.radians(50), math.radians(15), math.radians(-30))
    scene.collection.objects.link(sun)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 12
    scene.render.resolution_x, scene.render.resolution_y = 1800, 600
    world = bpy.data.worlds.new("w"); scene.world = world; world.color = (0.6, 0.62, 0.66)
    scene.render.filepath = picture
    bpy.ops.render.render(write_still=True)
