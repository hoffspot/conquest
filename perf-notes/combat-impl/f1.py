import sys

p = sys.argv[1]
b = open(p).read()


def swap(old, new, count=1):
    global b
    assert b.count(old) == count, (old[:90], b.count(old))
    b = b.replace(old, new)


# --- the constant, and each one's own step
swap("""// One in a formation looks again for whom to fight only this often (ms), meanwhile set on whoever
// it's set on: a field battle's hundreds each looking every step was most of what it cost
const RETHINK_MS = 250;
""", """// One in a formation looks again for whom to fight only this often (ms), meanwhile set on whoever
// it's set on: a field battle's hundreds each looking every step was most of what it cost. And
// anyone set on no one looks round for an enemy only as often (#patrol, #wild), and asks whether
// it's in a fight (#arm): a camp at peace, each asking every step with no one to find, cost three
// times what the same hundred cost fighting. A player's noticed in the step they come into sight
// all the same (#playerSeen), and whoever a blow or a chase is already on is in its fight at once
const RETHINK_MS = 250;

// Which step of so many is a character's own, for what each does only every so often (looking
// round, RETHINK_MS; the folk looking about them, FLEE.look; a new way after someone, REPATH_MS):
// by its id, so it's the same in every copy of the world with nothing kept of it, and those who'd
// all do it in the same step (a camp, a line of battle, a pack setting out together) each do it
// in a step of their own
const turnOf = (id, steps) => {
    let sum = 0;

    for (let k = 0; k < id.length; k++) {
        sum += id.charCodeAt(k);
    }

    return sum % steps;
};
""")

# --- #arm: quiet, it asks in its own step only
swap("""        if (this.#inFight(actor)) {
            actor.foughtAt = this.time;
""", """        // (Set on no one, no one after it as the step began, and in no fight when it last asked:
        // asked again only in its own step, four times a second: RETHINK_MS)
        const quiet = actor.target === null && !actor.attack && actor.order?.type !== "engage" && actor.foughtAt < this.time - STEP_MS && !this.#chasers.has(actor.id) && !this.#ownStep(actor);

        if (!quiet && this.#inFight(actor)) {
            actor.foughtAt = this.time;
""")

# --- the steps of its own, beside #draw
swap("""    // Start drawing its weapon (`on`), or putting it away (it can't be used meanwhile)
    #draw(actor, on) {""", """    // Whether this step is a character's own of every `every` ms's (turnOf)
    #ownStep(actor, every = RETHINK_MS) {
        const steps = every / STEP_MS;

        return Math.floor(this.time / STEP_MS) % steps === turnOf(actor.id, steps);
    }

    // When a character's own step of every `every` ms's next comes round (ms): after this one
    #nextStep(actor, every = RETHINK_MS) {
        const steps = every / STEP_MS;
        const step = Math.floor(this.time / STEP_MS);
        const wait = (turnOf(actor.id, steps) - (step % steps) + steps) % steps;

        return (step + (wait || steps)) * STEP_MS;
    }

    // Start drawing its weapon (`on`), or putting it away (it can't be used meanwhile)
    #draw(actor, on) {""")

# --- #afraid: each of the folk looks about in a step of its own
swap("""        if (this.time >= (actor.lookAt ?? 0)) {
            actor.lookAt = this.time + FLEE.look;
""", """        if (this.time >= (actor.lookAt ?? 0)) {
            // (Again in its own step of the next FLEE.look: not all the folk in the same one)
            actor.lookAt = this.#nextStep(actor, FLEE.look);
""")

# --- #patrol
swap("""        // (One in a formation: set on whoever it's set on, or no one, a while before looking again,
        // unless whoever it's set on is gone; anyone: a player near before anyone else, as many as
        // can be on them)
        const thinking = !actor.formation || this.time >= actor.rethinkAt;
""", """        // (One in a formation: set on whoever it's set on, or no one, a while before looking again,
        // unless whoever it's set on is gone; one in none: looking every step while it's set on
        // someone, and set on no one only as often, RETHINK_MS, in its own step (and at once when
        // whoever it was on is lost: `rethinkAt` is only put off by a look that found no one);
        // anyone: a player near before anyone else, as many as can be on them)
        const thinking = this.time >= actor.rethinkAt || (!actor.formation && actor.target !== null);
""")
swap("""            if (actor.formation) {
                actor.rethinkAt = this.time + RETHINK_MS;
            }
        }

        const chased = actor.target === null ? null : this.actor(actor.target);
        const trail = chased?.crossed;""", """            // (Again in its own step of the next RETHINK_MS: #nextStep)
            if (actor.formation || (!seen && actor.target === null)) {
                actor.rethinkAt = this.#nextStep(actor);
            }
        } else if (!broken && !seen && !actor.formation) {
            // (Between its looks round: a player come into sight all the same, in the step they
            // do, as far off as it sees)
            seen = this.#seeded(actor, this.#drawnTo(actor) ?? (this.#sightOf(actor) > SIGHT ? this.#playerSeen(actor, (enemy) => this.#leashed(actor, enemy) && this.#roomOn(actor, enemy)) : null));
        }

        const chased = actor.target === null ? null : this.actor(actor.target);
        const trail = chased?.crossed;""")

# --- #wild
swap("""        // (Whom its enmity has it go for, else the nearest it's roused by: ENMITY)
        const rousing = (enemy) => leashed(enemy) && rouses(enemy);
        const seen = this.#chosen(actor, rousing) ?? this.#seeded(actor, this.#nearestSeen(actor, rousing));
""", """        // (Whom its enmity has it go for, else the nearest it's roused by: ENMITY. Set on no one, it
        // looks round for them only every RETHINK_MS, in its own step, and at once when whoever
        // it was on is lost; between its looks, for a player come into sight all the same)
        const rousing = (enemy) => leashed(enemy) && rouses(enemy);
        const looking = actor.target !== null || this.time >= actor.rethinkAt;
        const seen = this.#chosen(actor, rousing) ?? this.#seeded(actor, looking ? this.#nearestSeen(actor, rousing) : this.#playerSeen(actor, rousing));

        if (looking && !seen && actor.target === null) {
            actor.rethinkAt = this.#nextStep(actor);
        }
""")

# --- #sightOf, #playerSeen, beside #nearestSeen
swap("""    #nearestSeen(actor, test = () => true) {
        // (A siege engine as far as it reaches: its crew watch for it)
        const sight = actor.wild?.sight ?? actor.sight ?? (actor.engine ? Math.max(SIGHT, longestReach(actor.arms)) : SIGHT);

        return this.#nearestEnemy(actor, (enemy) => this.canSee(actor, enemy, sight) && test(enemy), sight);
    }
""", """    #nearestSeen(actor, test = () => true) {
        const sight = this.#sightOf(actor);

        return this.#nearestEnemy(actor, (enemy) => this.canSee(actor, enemy, sight) && test(enemy), sight);
    }

    // How far a character looks for enemies (squares: #nearestSeen). A siege engine as far as it
    // reaches: its crew watch for it
    #sightOf(actor) {
        return actor.wild?.sight ?? actor.sight ?? (actor.engine ? Math.max(SIGHT, longestReach(actor.arms)) : SIGHT);
    }

    // The nearest player it can see that passes `test`, as #nearestSeen finds them, looked for
    // among the players only: what one set on no one asks between its looks round (RETHINK_MS), so
    // a player's noticed in the step they come into sight. Of two as near, the first
    #playerSeen(actor, test) {
        const sight = this.#sightOf(actor);
        let best = null;
        let bestDistance = Infinity;

        for (const player of this.#players) {
            if (player.dead || player.map !== actor.map || !this.#near(actor, player, sight)) {
                continue;
            }

            const distance = distanceBetween(actor.square, player.square);

            if (distance < bestDistance && this.hostile(player, actor) && this.#noticed(actor, player) && this.canSee(actor, player, sight) && test(player)) {
                best = player;
                bestDistance = distance;
            }
        }

        return best;
    }
""")
swap("""        const sight = actor.wild?.sight ?? actor.sight ?? (actor.engine ? Math.max(SIGHT, longestReach(actor.arms)) : SIGHT);
        const sees = (other) => this.canSee(actor, other, sight);""", """        const sight = this.#sightOf(actor);
        const sees = (other) => this.canSee(actor, other, sight);""")

open(p, "w").write(b)
print("ok")
