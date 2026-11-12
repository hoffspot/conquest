# The "lean" variant: the same battle, blow for blow (verify.mjs checks it), with its searches among
# those near making no arrays, #inFight asking who's after it before it looks round, #provoke's
# witnesses looked for among those near, and the hottest helpers reading their points by index
# rather than destructuring them. Written to variants/ (nothing in the repository's touched).
import sys

S = "/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/combat"
CORE = "/home/user/conquest/client/js/core"

def swap(src, old, new, count=1):
    assert src.count(old) == count, (old[:80], src.count(old))
    return src.replace(old, new)

def absolute(src):
    import re
    return re.sub(r'from "\./', f'from "{CORE}/', src)

# ---- weapons.js
w = absolute(open(f"{CORE}/weapons.js").read())
w = swap(w, "export const ringsApart = ([ax, ay], [bx, by]) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));",
            "export const ringsApart = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));")
w = swap(w, "export const distanceBetween = ([ax, ay], [bx, by]) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));",
            "export const distanceBetween = (a, b) => Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));")
w = swap(w, """export function longestReach(arms) {
    return Math.max(0, ...listOf(arms).map((attack) => attack.reach));
}""", """export function longestReach(arms) {
    const list = listOf(arms);
    let longest = 0;

    for (let k = 0; k < list.length; k++) {
        longest = Math.max(longest, list[k].reach);
    }

    return longest;
}""")
w = swap(w, """export function chooseAttack(arms, from, to, random = null) {
    const attack = listOf(arms).find((each) => inReach(each, from, to)) ?? null;
""", """export function chooseAttack(arms, from, to, random = null) {
    const list = listOf(arms);
    let attack = null;

    for (let k = 0; k < list.length; k++) {
        if (inReach(list[k], from, to)) {
            attack = list[k];
            break;
        }
    }
""")
open(f"{S}/variants/weapons-lean.js", "w").write(w)

# ---- grid.js
g = absolute(open(f"{CORE}/grid.js").read())
g = swap(g, """export function crosses(marked, [ax, ay], [bx, by], distance = Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by))) {
    const steps = Math.ceil(distance * 4);
    let [lastX, lastY] = [ax, ay];
""", """export function crosses(marked, a, b, distance = Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]))) {
    const ax = a[0];
    const ay = a[1];
    const bx = b[0];
    const by = b[1];
    const steps = Math.ceil(distance * 4);
    let lastX = ax;
    let lastY = ay;
""")
g = swap(g, """        [lastX, lastY] = [x, y];

        if (marked(x, y) && !(x === bx && y === by)) {""", """        lastX = x;
        lastY = y;

        if (marked(x, y) && !(x === bx && y === by)) {""")
open(f"{S}/variants/grid-lean.js", "w").write(g)

# ---- light.js
l = absolute(open(f"{CORE}/light.js").read())
l = swap(l, """export function sightAt(light, [x, y]) {
    if (!light || light.sky >= 1) {
        return 1;
    }

    for (const [cx, cy, reach2] of light.lit) {
        if ((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy) <= reach2) {
            return 1;
        }
    }
""", """export function sightAt(light, square) {
    if (!light || light.sky >= 1) {
        return 1;
    }

    const x = square[0];
    const y = square[1];
    const lit = light.lit;

    for (let k = 0; k < lit.length; k++) {
        const cx = lit[k][0];
        const cy = lit[k][1];

        if ((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy) <= lit[k][2]) {
            return 1;
        }
    }
""")
open(f"{S}/variants/light-lean.js", "w").write(l)

# ---- formation.js
f = absolute(open(f"{CORE}/formation.js").read())
f = swap(f, """export function placeAt({ anchor, facing }, [right, back]) {
    const [ax, ay] = [sin(facing), cos(facing)];

    return [anchor[0] - ay * right - ax * back, anchor[1] + ax * right - ay * back];
}""", """export function placeAt(formation, slot) {
    const anchor = formation.anchor;
    const ax = sin(formation.facing);
    const ay = cos(formation.facing);
    const right = slot[0];
    const back = slot[1];

    return [anchor[0] - ay * right - ax * back, anchor[1] + ax * right - ay * back];
}""")
open(f"{S}/variants/formation-lean.js", "w").write(f)

# ---- battle.js
b = absolute(open(f"{CORE}/battle.js").read())

# offRound: no arrays made, read by index
b = swap(b, """function offRound(patrol, [x, y]) {
    let nearest = distanceBetween(patrol[0], [x, y]);

    for (let k = 0; patrol.length > 1 && k < patrol.length; k++) {
        const [ax, ay] = patrol[k];
        const [bx, by] = patrol[(k + 1) % patrol.length];
        const [dx, dy] = [bx - ax, by - ay];
        const length = dx * dx + dy * dy;
        const along = length ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;

        nearest = Math.min(nearest, distanceBetween([ax + dx * along, ay + dy * along], [x, y]));
    }

    return nearest;
}""", """function offRound(patrol, square) {
    const x = square[0];
    const y = square[1];
    let nearest = distanceBetween(patrol[0], square);

    for (let k = 0; patrol.length > 1 && k < patrol.length; k++) {
        const ax = patrol[k][0];
        const ay = patrol[k][1];
        const dx = patrol[(k + 1) % patrol.length][0] - ax;
        const dy = patrol[(k + 1) % patrol.length][1] - ay;
        const length = dx * dx + dy * dy;
        const along = length ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
        const px = ax + dx * along;
        const py = ay + dy * along;

        nearest = Math.min(nearest, Math.sqrt((px - x) * (px - x) + (py - y) * (py - y)));
    }

    return nearest;
}""")

# The one list every search among those near fills (none kept past the loop over it, none nested:
# the colossal's, which nest, make their own); and marks for #provoke's two lists
b = swap(b, """    #players = [];
    #onPlayers = new Map();
    #chasers = new Map();
""", """    #players = [];
    #onPlayers = new Map();
    #chasers = new Map();
    #found = new Int32Array(64);
    #marks = [];
    #marking = 0;
""")

# #inFight: who's after it first (no looking round, nothing in the way asked), then those near
b = swap(b, """        const after = (other) => other.target === actor.id || other.attack?.target === actor.id || (other.order?.type === "engage" && other.order.target === actor.id);

        // (The cheap checks first: whether it's after it, or near enough to be seen, before how
        // their peoples stand, and only then whether anything's in the way. Those near first; then
        // anyone further off who was after it as the step began, and is still: #chasers)
        return (
            this.#nearSquare(actor, SIGHT).some((k) => {
                const other = this.actors[k];

                if (other.dead || other.map !== actor.map) {
                    return false;
                }

                const chasing = after(other);

                return (chasing || this.#near(actor, other, SIGHT)) && this.hostile(other, actor) && (chasing || this.canSee(actor, other));
            }) ||
            (this.#chasers.get(actor.id) ?? []).some((id) => {
                const other = this.actor(id);

                return other && !other.dead && other.map === actor.map && after(other) && this.hostile(other, actor);
            })
        );
    }
""", """        const id = actor.id;
        const chasers = this.#chasers.get(id);

        // (Whoever was after it as the step began, and is still: no looking round for them)
        if (chasers) {
            for (let i = 0; i < chasers.length; i++) {
                const other = this.actor(chasers[i]);

                if (other && !other.dead && other.map === actor.map && (other.target === id || other.attack?.target === id || (other.order?.type === "engage" && other.order.target === id)) && this.hostile(other, actor)) {
                    return true;
                }
            }
        }

        const count = this.#nearSquare(actor, SIGHT);
        const near = this.#found;

        for (let i = 0; i < count; i++) {
            const other = this.actors[near[i]];

            if (other.dead || other.map !== actor.map) {
                continue;
            }

            const chasing = other.target === id || other.attack?.target === id || (other.order?.type === "engage" && other.order.target === id);

            if ((chasing || this.#near(actor, other, SIGHT)) && this.hostile(other, actor) && (chasing || this.canSee(actor, other))) {
                return true;
            }
        }

        return false;
    }
""")

# #nearestEnemy: the rings walked in place
b = swap(b, """    #nearestEnemy(actor, test, within = Infinity, enemy = (other) => this.hostile(other, actor)) {
        let best = null;
        let bestDistance = Infinity;
        let bestK = Infinity;

        // (The cheap checks first, and `test` for none no nearer than the nearest yet; only those
        // near enough to be within `within`, if it's not everyone, the nearest cells first, and
        // none in cells too far off to beat the nearest yet. Of two as near, the first)
        for (const ring of within === Infinity ? [this.actors.keys()] : this.#ringsNear(actor, within)) {
            if (ring.least > bestDistance) {
                break;
            }

            for (const k of ring) {
                const other = this.actors[k];

                // (Nor a section of a palisade, nor a rift's tear or altar: none set on one of their
                // own accord)
                if (other.dead || other.map !== actor.map || STANDS.has(other.kind) || !this.#near(actor, other, within)) {
                    continue;
                }

                // (Further either way than the nearest yet is: no nearer, and not worth working out)
                if (Math.abs(actor.square[0] - other.square[0]) > bestDistance || Math.abs(actor.square[1] - other.square[1]) > bestDistance) {
                    continue;
                }

                const distance = distanceBetween(actor.square, other.square);

                if ((distance < bestDistance || (distance === bestDistance && k < bestK)) && enemy(other) && this.#noticed(actor, other) && test(other)) {
                    best = other;
                    bestDistance = distance;
                    bestK = k;
                }
            }
        }

        return best;
    }
""", """    #nearestEnemy(actor, test, within = Infinity, enemy = null) {
        const actors = this.actors;
        const square = actor.square;
        let best = null;
        let bestDistance = Infinity;
        let bestK = Infinity;

        // (One looked at: the cheap checks first, and `test` for none no nearer than the nearest yet)
        const look = (k) => {
            const other = actors[k];

            if (other.dead || other.map !== actor.map || STANDS.has(other.kind) || !this.#near(actor, other, within)) {
                return;
            }

            if (Math.abs(square[0] - other.square[0]) > bestDistance || Math.abs(square[1] - other.square[1]) > bestDistance) {
                return;
            }

            const distance = distanceBetween(square, other.square);

            if ((distance < bestDistance || (distance === bestDistance && k < bestK)) && (enemy ? enemy(other) : this.hostile(other, actor)) && this.#noticed(actor, other) && test(other)) {
                best = other;
                bestDistance = distance;
                bestK = k;
            }
        };

        if (within === Infinity || !Battle.indexing) {
            for (let k = 0; k < actors.length; k++) {
                look(k);
            }

            return best;
        }

        // (The rings of cells round its own, the nearest first, none too far off to beat the
        // nearest yet: as #ringsNear lays them out, walked in place)
        const cells = this.#indexed().cells.get(actor.map);

        if (!cells) {
            return best;
        }

        const x = square[0] + 0.5;
        const y = square[1] + 0.5;
        const out = within + 1 + INDEX_SLACK;
        const cx = Math.floor(x / INDEX_CELL);
        const cy = Math.floor(y / INDEX_CELL);
        const left = Math.floor((x - out) / INDEX_CELL);
        const right = Math.floor((x + out) / INDEX_CELL);
        const top = Math.floor((y - out) / INDEX_CELL);
        const bottom = Math.floor((y + out) / INDEX_CELL);
        const rings = Math.max(cx - left, right - cx, cy - top, bottom - cy);

        for (let r = 0; r <= rings; r++) {
            if ((r - 1) * INDEX_CELL - INDEX_SLACK - 2 > bestDistance) {
                break;
            }

            for (let ny = Math.max(top, cy - r); ny <= Math.min(bottom, cy + r); ny++) {
                for (let nx = Math.max(left, cx - r); nx <= Math.min(right, cx + r); nx++) {
                    if (Math.max(Math.abs(nx - cx), Math.abs(ny - cy)) === r) {
                        const list = cells.get(cellOf(nx, ny));

                        for (let i = 0; list && i < list.length; i++) {
                            look(list[i]);
                        }
                    }
                }
            }
        }

        return best;
    }
""")

# #lurk's own `enemy` (the only caller that passes one besides #afraid): unchanged, they pass theirs

# #alarmed, #mend, #bumps: indexed loops over the one list
b = swap(b, """        for (const k of this.#nearSquare(actor, SIGHT)) {
            const other = this.actors[k];

            if (other === actor || other.dead || other.target === null || other.ai !== "patrol" """, """        const count = this.#nearSquare(actor, SIGHT);
        const near = this.#found;

        for (let i = 0; i < count; i++) {
            const k = near[i];
            const other = this.actors[k];

            if (other === actor || other.dead || other.target === null || other.ai !== "patrol" """)
b = swap(b, """        for (const k of best ? [] : this.#nearSquare(actor, reach)) {
            const other = this.actors[k];
""", """        const count = best ? 0 : this.#nearSquare(actor, reach);
        const near = this.#found;

        for (let i = 0; i < count; i++) {
            const k = near[i];
            const other = this.actors[k];
""")
b = swap(b, """        for (const k of this.#within(actor.map, x, y, 2 * BODY)) {
            const other = this.actors[k];
""", """        const count = this.#near2(actor.map, x, y, 2 * BODY);
        const near = this.#found;

        for (let i = 0; i < count; i++) {
            const k = near[i];
            const other = this.actors[k];
""")

# #within left as it is (the colossal's, nested; #occupied's); beside it #near2, the same asked
# into the one list (how many it found), and #nearSquare asking that
b = swap(b, """    // The same as #nearSquare, in rings of cells round the character's, nearest first: each its""", """    // (#within's, into the one list `#found`: how many)
    #near2(mapId, x, y, reach) {
        let found = this.#found;
        let count = 0;

        if (found.length < this.actors.length) {
            found = this.#found = new Int32Array(Math.max(64, this.actors.length * 2));
        }

        if (!Battle.indexing) {
            for (let k = 0; k < this.actors.length; k++) {
                found[count++] = k;
            }

            return count;
        }

        const index = this.#indexed();
        const cells = index.cells.get(mapId);
        const out = reach + INDEX_SLACK;

        if (!cells) {
            return 0;
        }

        const x1 = Math.floor((x + out) / INDEX_CELL);
        const y1 = Math.floor((y + out) / INDEX_CELL);

        for (let cy = Math.floor((y - out) / INDEX_CELL); cy <= y1; cy++) {
            for (let cx = Math.floor((x - out) / INDEX_CELL); cx <= x1; cx++) {
                const list = cells.get(cellOf(cx, cy));

                for (let i = 0; list && i < list.length; i++) {
                    found[count++] = list[i];
                }
            }
        }

        return count;
    }

    // The same as #nearSquare, in rings of cells round the character's, nearest first: each its""")
b = swap(b, """    #nearSquare(actor, reach) {
        return this.#within(actor.map, actor.square[0] + 0.5, actor.square[1] + 0.5, reach + 1);
    }""", """    #nearSquare(actor, reach) {
        return this.#near2(actor.map, actor.square[0] + 0.5, actor.square[1] + 0.5, reach + 1);
    }""")

# #provoke: its own who saw, looked for among those near enough to (canSee looks no further than
# SIGHT), where neither's the colossal (aimed at over its footprint)
b = swap(b, """            for (const other of this.actors) {
                // (A creature: only its own pack)
                const own = other.team === target.team && (!target.wild || other.wild?.pack === target.wild.pack);

                if (other === target || (own && !target.lone && !other.neutral && !other.dead && other.map === target.map && !spares(other) && (this.canSee(other, target) || this.canSee(other, attacker)))) {
                    other.foes[attacker.id] = until;
                }
            }
""", """            const wide = !Battle.indexing || Boolean(target.footprint) || Boolean(attacker.footprint);
            const saw = (other) => {
                // (A creature: only its own pack)
                const own = other.team === target.team && (!target.wild || other.wild?.pack === target.wild.pack);

                if (other === target || (own && !target.lone && !other.neutral && !other.dead && other.map === target.map && !spares(other) && (this.canSee(other, target) || this.canSee(other, attacker)))) {
                    other.foes[attacker.id] = until;
                }
            };

            if (wide) {
                for (const other of this.actors) {
                    saw(other);
                }
            } else {
                const marks = this.#marks;
                const marking = ++this.#marking;

                target.foes[attacker.id] = until;

                for (const one of attacker.map === target.map ? [target, attacker] : [target]) {
                    const count = this.#nearSquare(one, SIGHT);
                    const near = this.#found;

                    for (let i = 0; i < count; i++) {
                        const k = near[i];

                        if (marks[k] !== marking) {
                            marks[k] = marking;
                            saw(this.actors[k]);
                        }
                    }
                }
            }
""")

# #distanceLeft: no options object, no destructuring
b = swap(b, """    #distanceLeft(actor, { reach = true } = {}) {
        let left = 0;
        let [x, y] = [actor.x, actor.y];

        for (const [px, py] of actor.path) {
            left += hypot(px - x, py - y);
            [x, y] = [px, py];
        }
""", """    #distanceLeft(actor, reach = true) {
        const path = actor.path;
        let left = 0;
        let x = actor.x;
        let y = actor.y;

        for (let k = 0; k < path.length; k++) {
            left += hypot(path[k][0] - x, path[k][1] - y);
            x = path[k][0];
            y = path[k][1];
        }
""")
b = swap(b, "            const left = this.#distanceLeft(actor, { reach: false });", "            const left = this.#distanceLeft(actor, false);")

# #ail: no closure made to ask whether each is invisible when nothing lasts on it
b = swap(b, """            if (this.buffOf(actor, "invisibility")) {
                this.#seeThrough(actor);
            }""", """            if (actor.buffs?.length && this.buffOf(actor, "invisibility")) {
                this.#seeThrough(actor);
            }""")

open(f"{S}/variants/battle-lean.js", "w").write(b)
print("written")
