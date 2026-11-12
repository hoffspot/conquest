import sys

p = sys.argv[1]
b = open(p).read()


def swap(old, new, count=1):
    global b
    assert b.count(old) == count, (old[:90], b.count(old))
    b = b.replace(old, new)


# --- bug 1: a shot gives up
swap("""// An enemy that hasn't seen its target for this long goes back to its patrol (ms)
const GIVE_UP_MS = 3000;
""", """// An enemy that hasn't seen its target for this long goes back to its patrol (ms)
const GIVE_UP_MS = 3000;

// A shot follows whoever it was let go at, and gives up once it's flown this many times as far as
// its attack reaches without coming up with them (#fly: it fizzles, and hits no one): one let go
// at a rider galloping off followed them a third of a kilometre, and landed when they stopped
const SHOT_FLIES = 1.5;
""")
swap("""            attack,
            map: actor.map,
            x: actor.x,
            y: actor.y,
        };

        this.projectiles.push(projectile);""", """            attack,
            map: actor.map,
            x: actor.x,
            y: actor.y,
            // (How far it's flown, metres: #fly, SHOT_FLIES)
            flown: 0,
        };

        this.projectiles.push(projectile);""")
swap("""            } else {
                projectile.x += (dx / distance) * travel;
                projectile.y += (dy / distance) * travel;
            }
        }
    }""", """            } else {
                projectile.x += (dx / distance) * travel;
                projectile.y += (dy / distance) * travel;
                // (One kept before shots gave up has flown no way yet)
                projectile.flown = (projectile.flown ?? 0) + travel;

                // (Flown far past its reach after someone it can't catch: spent, SHOT_FLIES)
                if (projectile.attack.reach > 0 && projectile.flown > projectile.attack.reach * SHOT_FLIES) {
                    this.projectiles.splice(this.projectiles.indexOf(projectile), 1);
                    this.#emit("fizzle", { projectile: projectile.id, spent: true });
                }
            }
        }
    }""")
swap("""// An attack (weapons.js) lands its blow hitAt into it: melee attacks hit if the target is still
// within reach, ranged attacks let go of a projectile that flies to the target. Each hit rolls its""", """// An attack (weapons.js) lands its blow hitAt into it: melee attacks hit if the target is still
// within reach, ranged attacks let go of a projectile that flies to the target, after it as it
// moves, and gives up once it's flown half as far again as the attack reaches (SHOT_FLIES). Each hit rolls its""")

# --- bug 4: a hazard's hits aren't a fallen caster's
swap("""                        this.#hit(by, actor, { id: hazard.kind, kind: "hazard", reaction, stagger: 0, afflict, element }, null, { damage: hazard.damage, spell: hazard.spell, ground: true });""", """                        // (No one's blow once its caster's fallen, as a bomb's or what falls on a
                        // boss's arena is no one's: nothing's turned on the fallen for it, nor
                        // counted theirs)
                        this.#hit(by && !by.dead ? by : null, actor, { id: hazard.kind, kind: "hazard", reaction, stagger: 0, afflict, element }, null, { damage: hazard.damage, spell: hazard.spell, ground: true });""")

# --- bug 5: ranks closed when one falls and another joins in the same second
swap("""    #closeRanks(id, formation) {
        const members = this.actors.filter((actor) => !actor.dead && actor.formation?.id === id);

        if (members.length === formation.strength) {
            return;
        }
""", """    #closeRanks(id, formation) {
        const members = this.actors.filter((actor) => !actor.dead && actor.formation?.id === id);

        // (As many as when they were last closed, and none fallen or joined since: #regroup)
        if (members.length === formation.strength) {
            return;
        }
""")
swap("""    // The enemy a formation that advances is closing with:""", """    // One of a formation fallen, joined or taken out: its ranks to be closed again at its next
    // look (#closeRanks), however many it then has. (By its count alone, one fallen and another
    // joined in the same second left the gap open and the newcomer where it was put)
    #regroup(actor) {
        const formation = actor.formation ? this.formations[actor.formation.id] : null;

        if (formation) {
            formation.strength = null;
        }
    }

    // The enemy a formation that advances is closing with:""")
swap("""    add(given) {
        const actor = this.#made(given);

        this.actors.push(actor);
        this.#roster++;
        this.#version++;
""", """    add(given) {
        const actor = this.#made(given);

        this.actors.push(actor);
        this.#roster++;
        this.#version++;
        this.#regroup(actor);
""")
swap("""        this.actors.splice(this.actors.indexOf(actor), 1);
        this.#roster++;
        this.#version++;
""", """        this.actors.splice(this.actors.indexOf(actor), 1);
        this.#roster++;
        this.#version++;
        this.#regroup(actor);
""")
swap("""    #die(actor, killer) {
        actor.dead = true;
""", """    #die(actor, killer) {
        actor.dead = true;
        this.#regroup(actor);
""")

open(p, "w").write(b)
print("ok")
