# The "calm" variant, on the lean one (this one CHANGES what happens, a little: NET_VERSION's to
# bump): those set on no one look round for an enemy every RETHINK_MS, each in its own step of
# them, not every step (as those in a line of battle do already); a player near, room on them, at
# once still (#drawnTo); and whoever wasn't in a fight when it last asked asks again only as often.
S = "/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/combat"
b = open(f"{S}/variants/battle-lean.js").read()

def swap(src, old, new, count=1):
    assert src.count(old) == count, (old[:80], src.count(old))
    return src.replace(old, new)

# Each its own step of the five to look in, from when it's added
b = swap(b, """            formation: formation ? { id: formation.id, slot: [...formation.slot], role: formation.role ?? null } : null,
            rethinkAt: 0,
""", """            formation: formation ? { id: formation.id, slot: [...formation.slot], role: formation.role ?? null } : null,
            rethinkAt: (this.actors.length % (RETHINK_MS / STEP_MS)) * STEP_MS,
            // (Not in a fight when it last asked, #arm: and when it asks again)
            quietUntil: ((this.actors.length + 2) % (RETHINK_MS / STEP_MS)) * STEP_MS,
""")

# #arm: in no fight last it asked, set on no one and not struck since: asked again every RETHINK_MS
b = swap(b, """        if (this.#inFight(actor)) {
            actor.foughtAt = this.time;
""", """        const quiet = actor.target === null && !actor.attack && actor.order?.type !== "engage" && this.time < (actor.quietUntil ?? 0);
        const fighting = !quiet && this.#inFight(actor);

        if (!quiet && !fighting) {
            actor.quietUntil = this.time + RETHINK_MS;
        } else if (fighting) {
            actor.quietUntil = 0;
        }

        if (fighting) {
            actor.foughtAt = this.time;
""")
# (Struck: asks at once)
b = swap(b, """        // (Struck while it waited, holding a place: it fights back at once)
        target.waryUntil = 0;
""", """        // (Struck while it waited, holding a place: it fights back at once)
        target.waryUntil = 0;
        target.quietUntil = 0;
""")

# #patrol: one in no line of battle, set on no one: a player near at once, the rest every RETHINK_MS
b = swap(b, "        const thinking = !actor.formation || this.time >= actor.rethinkAt;\n", "        const thinking = (!actor.formation && actor.target !== null) || this.time >= actor.rethinkAt;\n")
b = swap(b, """            if (actor.formation) {
                actor.rethinkAt = this.time + RETHINK_MS;
            }
        }

        const chased = actor.target === null ? null : this.actor(actor.target);
        const trail = chased?.crossed;""", """            if (actor.formation || !seen) {
                actor.rethinkAt = this.time + RETHINK_MS;
            }
        } else if (!broken && !seen && !actor.formation && !actor.siege) {
            // (Between looks: a player near, room on them, at once all the same)
            seen = this.#seeded(actor, this.#drawnTo(actor));
        }

        const chased = actor.target === null ? null : this.actor(actor.target);
        const trail = chased?.crossed;""")

# #wild: set on no one, the nearest it's roused by looked for every RETHINK_MS
b = swap(b, """        const seen = this.#chosen(actor, rousing) ?? this.#seeded(actor, this.#nearestSeen(actor, rousing));

        if (seen) {
            // (Holding a place gone into, set on no one: a moment's pause on first seeing them,""", """        const looking = actor.target !== null || this.time >= actor.rethinkAt;
        const seen = this.#chosen(actor, rousing) ?? (looking ? this.#seeded(actor, this.#nearestSeen(actor, rousing)) : null);

        if (looking && !seen) {
            actor.rethinkAt = this.time + RETHINK_MS;
        }

        if (seen) {
            // (Holding a place gone into, set on no one: a moment's pause on first seeing them,""")
open(f"{S}/variants/battle-calm.js", "w").write(b)
print("written")
