import sys

p = sys.argv[1]
b = open(p).read()


def swap(old, new, count=1):
    global b
    assert b.count(old) == count, (old[:90], b.count(old))
    b = b.replace(old, new)


# --- the players, fallen or not, for those who look for one
swap("""    #players = [];
    #onPlayers = new Map();""", """    #players = [];
    #heroes = [];
    #onPlayers = new Map();""")
swap("""    // The players in the battle, and how many of their enemies are set on each (melee, ranged),
    // as they are this step (#drawnTo); and who's after whom as the step began (#inFight: id ->
    // the ids of those set on, attacking or told to fight them)""", """    // The players in the battle still standing as the step began, and how many of their enemies
    // are set on each (melee, ranged), as they are this step (#drawnTo); every player in it,
    // fallen or not (`#heroes`: #beckon, #rest); and who's after whom as the step began
    // (#inFight: id -> the ids of those set on, attacking or told to fight them)""")
swap("""        chasers.clear();
        this.#players = this.actors.filter((actor) => actor.kind === "player" && !actor.dead);
""", """        chasers.clear();
        this.#heroes = this.actors.filter((actor) => actor.kind === "player");
        this.#players = this.#heroes.filter((actor) => !actor.dead);
""")
swap("""        const player = this.actors.find((other) => other.kind === "player" && !other.dead && this.canSee(actor, other));
""", """        // (Among the players only, #heroes: not everyone asked whether they're one)
        const player = this.#heroes.find((other) => !other.dead && this.canSee(actor, other));
""")
swap("""        if (!this.actors.some((other) => other.kind === "player" && !other.dead && this.canSee(other, actor))) {""", """        if (!this.#heroes.some((other) => !other.dead && this.canSee(other, actor))) {""")

# --- the index: those standing over more than their own square
swap("""    // Where everyone stands, kept by cell (INDEX_CELL): made again if it might be out of date. {
    // cells: map id -> cell -> indices into `actors` (in their order), at: where each was (x, y),
    // order: each one's index }""", """    // Where everyone stands, kept by cell (INDEX_CELL): made again if it might be out of date. {
    // cells: map id -> cell -> indices into `actors` (in their order), at: where each was (x, y),
    // order: each one's index, wide: the indices of those standing over more than their own
    // square (a `footprint`: struck at its nearest square, however far off its middle is) }""")
swap("""        const at = new Float64Array(this.actors.length * 2);
        const order = new Map();
""", """        const at = new Float64Array(this.actors.length * 2);
        const order = new Map();
        const wide = [];
""")
swap("""            at[2 * k] = actor.x;
            at[2 * k + 1] = actor.y;
            order.set(actor, k);
        });

        return (this.#index = { actors: this.actors, length: this.actors.length, version: this.#version, cells, at, order });""", """            at[2 * k] = actor.x;
            at[2 * k + 1] = actor.y;
            order.set(actor, k);

            if (actor.footprint) {
                wide.push(k);
            }
        });

        return (this.#index = { actors: this.actors, length: this.actors.length, version: this.#version, cells, at, order, wide });""")

# --- #nearestEnemy: those with a footprint too, however far (`wide`)
swap("""    // The nearest enemy on its map that it's noticed (not unseen: Invisibility), within `within`
    // squares each way, that passes `test` (an enemy: one `enemy` of it, as hostile has it)
    #nearestEnemy(actor, test, within = Infinity, enemy = null) {""", """    // The nearest enemy on its map that it's noticed (not unseen: Invisibility), within `within`
    // squares each way, that passes `test` (an enemy: one `enemy` of it, as hostile has it). With
    // `wide`, those standing over more than their own square too, however far off their middles
    // are (a `footprint`: what's within reach of one is its nearest square, #aimAt)
    #nearestEnemy(actor, test, within = Infinity, enemy = null, wide = false) {""")
swap("""        // (One looked at: the cheap checks first, and `test` for none no nearer than the nearest yet)
        const look = (k) => {
            const other = actors[k];

            if (other.dead || other.map !== actor.map || STANDS.has(other.kind) || !this.#near(actor, other, within)) {
                return;
            }
""", """        // (One looked at: the cheap checks first, and `test` for none no nearer than the nearest yet)
        const look = (k, far = false) => {
            const other = actors[k];

            if (other.dead || other.map !== actor.map || STANDS.has(other.kind) || (!far && !this.#near(actor, other, within))) {
                return;
            }
""")
swap("""        const cells = this.#indexed().cells.get(actor.map);

        if (!cells) {
            return best;
        }

        const x = square[0] + 0.5;""", """        const index = this.#indexed();
        const cells = index.cells.get(actor.map);

        // (Those over more than their square, wherever they stand: looked at twice, if they're
        // near too, which changes nothing)
        for (let i = 0; wide && i < index.wide.length; i++) {
            look(index.wide[i], true);
        }

        if (!cells) {
            return best;
        }

        const x = square[0] + 0.5;""")
swap("""        if (within === Infinity || !Battle.indexing) {
            for (let k = 0; k < actors.length; k++) {
                look(k);
            }

            return best;
        }
""", """        if (within === Infinity || !Battle.indexing) {
            for (let k = 0; k < actors.length; k++) {
                look(k, wide && Boolean(actors[k].footprint));
            }

            return best;
        }
""")

# --- #hold, #obey: no further than they reach
swap("""    #hold(actor) {
        const target = this.#nearestEnemy(actor, (enemy) => this.#reachable(actor, enemy));
""", """    #hold(actor) {
        // (Looked for no further off than its loops reach: all it could shoot at)
        const target = this.#nearestEnemy(actor, (enemy) => this.#reachable(actor, enemy), longestReach(actor.arms) + 1, null, true);
""")
swap("""            const target = locked && locked.map === actor.map && this.#reachable(actor, locked) ? locked : this.#nearestEnemy(actor, (enemy) => this.#reachable(actor, enemy) && !(enemy.wild?.temper === "defensive" && enemy.target === null));
""", """            // (Whoever's nearest: looked for no further off than their weapon reaches)
            const target = locked && locked.map === actor.map && this.#reachable(actor, locked) ? locked : this.#nearestEnemy(actor, (enemy) => this.#reachable(actor, enemy) && !(enemy.wild?.temper === "defensive" && enemy.target === null), longestReach(actor.arms) + 1, null, true);
""")

# --- the helper, after #within
swap("""    // The same as #within, into the one list `#found` and none made: how many it found there""", """    /**
     * Everyone still standing on a map within `radius` metres of a point (x, y), and with `of`
     * given only its enemies (hostile(of, other)): in their order in `actors`, as going through
     * everyone comes on them, so whatever's done to each in turn (a blow, a roll of the dice) is
     * done in the order it always was. Looked for among those near (#indexed), not through
     * everyone, which changes nothing (Battle.indexing off, it goes through everyone: the tests'
     * check). A list of its own, so whoever asked may search again while going through it.
     */
    #standingNear(mapId, x, y, radius, of = null) {
        const actors = this.actors;
        const near = [];
        const found = Battle.indexing && radius < Infinity ? this.#within(mapId, x, y, radius).sort((a, b) => a - b) : null;

        for (let i = 0; i < (found ?? actors).length; i++) {
            const other = found ? actors[found[i]] : actors[i];

            if (!other.dead && other.map === mapId && hypot(other.x - x, other.y - y) <= radius && (!of || this.hostile(of, other))) {
                near.push(other);
            }
        }

        return near;
    }

    // The same as #within, into the one list `#found` and none made: how many it found there""")

# --- the places that went through everyone
# warCry
swap("""        for (const other of this.actors) {
            if (!other.dead && other.map === actor.map && distanceBetween(actor.square, other.square) <= reach && this.hostile(other, actor) && this.canSee(other, actor) && this.taunt(id, other.id, { over, ms, cried: true })) {""", """        // (Squares apart, each's middle anywhere on its own: no further than that in metres)
        for (const other of this.#standingNear(actor.map, actor.x, actor.y, reach + SQUARE_SLACK)) {
            if (!other.dead && other.map === actor.map && distanceBetween(actor.square, other.square) <= reach && this.hostile(other, actor) && this.canSee(other, actor) && this.taunt(id, other.id, { over, ms, cried: true })) {""")
# slipAway
swap("""        for (const other of this.actors) {
            if (other.dead || other.map !== actor.map || distanceBetween(actor.square, other.square) > reach) {
                continue;
            }

            if (other.taunted?.by === id""", """        for (const other of this.#standingNear(actor.map, actor.x, actor.y, reach + SQUARE_SLACK)) {
            if (other.dead || other.map !== actor.map || distanceBetween(actor.square, other.square) > reach) {
                continue;
            }

            if (other.taunted?.by === id""")
# #drop
swap("""        const foes = this.actors.filter((other) => !other.dead && other.map === actor.map && this.hostile(actor, other) && !other.wild?.object && hypot(other.x - actor.x, other.y - actor.y) <= reach);""", """        const foes = this.#standingNear(actor.map, actor.x, actor.y, reach, actor).filter((other) => !other.wild?.object);""")
# #farthest
swap("""        for (const other of this.actors) {
            const off = other.map === actor.map && !other.dead && !other.wild?.object ? hypot(other.x - actor.x, other.y - actor.y) : -1;
""", """        for (const other of this.#standingNear(actor.map, actor.x, actor.y, most)) {
            const off = other.map === actor.map && !other.dead && !other.wild?.object ? hypot(other.x - actor.x, other.y - actor.y) : -1;
""")
# #ground
swap("""                for (const actor of this.actors) {
                    const theirs = side ? this.hostile(side, actor) : actor.team !== hazard.team && !actor.neutral;
""", """                for (const actor of this.#standingNear(hazard.map, hazard.x, hazard.y, hazard.radius)) {
                    const theirs = side ? this.hostile(side, actor) : actor.team !== hazard.team && !actor.neutral;
""")
# #prismatic
swap("""        const struck = [target, ...this.actors.filter((other) => other !== target && !other.dead && other.map === target.map && this.hostile(caster, other) && hypot(other.x - target.x, other.y - target.y) <= spell.area)];""", """        const struck = [target, ...this.#standingNear(target.map, target.x, target.y, spell.area, caster).filter((other) => other !== target)];""")
# #spellStruck
swap("""        const near = (from, reach) => this.actors.filter((other) => !other.dead && other.map === from.map && !struck.some(({ one }) => one === other) && this.hostile(caster, other) && hypot(other.x - from.x, other.y - from.y) <= reach);""", """        const near = (from, reach) => this.#standingNear(from.map, from.x, from.y, reach, caster).filter((other) => !struck.some(({ one }) => one === other));""")
# #foesNear
swap("""        const near = this.actors.filter((one) => !one.dead && one.map === map && one !== actor && hypot(one.x - x, one.y - y) <= radius && this.hostile(actor, one));
""", """        const near = this.#standingNear(map, x, y, radius, actor).filter((one) => one !== actor);
""")
# #blast
swap("""        const caught = this.actors.filter((actor) => !actor.dead && actor.map === map && !spare?.has(actor.id) && hypot(actor.x - x, actor.y - y) <= radius && inCone(actor) && this.hostile(side, actor));""", """        const caught = this.#standingNear(map, x, y, radius, side).filter((actor) => !spare?.has(actor.id) && inCone(actor));""")
# #seeThrough
swap("""        for (const other of this.actors) {
            const mighty = (other.wild?.tier ?? 0) >= SEE_THROUGH.tier || Boolean(other.wild?.unique);""", """        for (const other of this.#standingNear(actor.map, actor.x, actor.y, SEE_THROUGH.near)) {
            const mighty = (other.wild?.tier ?? 0) >= SEE_THROUGH.tier || Boolean(other.wild?.unique);""")
# #cryOut
swap("""        for (const other of this.actors) {
            if (!other.dead && other.map === actor.map && this.#guards(actor, leader, other.target) && distanceBetween(actor.square, other.square) <= reach && this.hostile(other, actor) && this.canSee(other, actor)) {""", """        for (const other of this.#standingNear(actor.map, actor.x, actor.y, reach + SQUARE_SLACK)) {
            if (!other.dead && other.map === actor.map && this.#guards(actor, leader, other.target) && distanceBetween(actor.square, other.square) <= reach && this.hostile(other, actor) && this.canSee(other, actor)) {""")
# #slip
swap("""        const on = this.actors.some((other) => !other.dead && other.map === actor.map && other.target === actor.id && distanceBetween(actor.square, other.square) <= SLIP.reach && this.hostile(other, actor));""", """        const on = this.#standingNear(actor.map, actor.x, actor.y, SLIP.reach + SQUARE_SLACK).some((other) => !other.dead && other.map === actor.map && other.target === actor.id && distanceBetween(actor.square, other.square) <= SLIP.reach && this.hostile(other, actor));""")

# SQUARE_SLACK beside the index's constants
swap("""const INDEX_CELL = """, """// Two no more than so many squares apart are no more than that many metres apart and this much
// (each's middle anywhere on its own square: a square's diagonal, and a little): what's added to
// a reach in squares to look for those within it by where they stand (#standingNear)
const SQUARE_SLACK = 1.5;
const INDEX_CELL = """)
open(p, "w").write(b)
print("ok")
