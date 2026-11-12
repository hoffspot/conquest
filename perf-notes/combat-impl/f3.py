import sys

p = sys.argv[1]
b = open(p).read()


def swap(old, new, count=1):
    global b
    assert b.count(old) == count, (old[:90], b.count(old))
    b = b.replace(old, new)


OPTIONAL = """abilityReadyAt abilityTimes backOffAt backing bleed bombAt burntAt callAt charge coverUntil cries cryReadyAt darkSight distracted eating endurance enmityWeight enrageAt enraged facingTo fallBackUntil fallsAt faster fightSince fought guardAt guarding guise haste hatchAt hidden holdFire holds leech legendary lingering lying mastered mood moveAt movesAt oil onGuard phase rallied rank recovery regrowAt ruler siege slipReadyAt slips snaredUntil steeled steeledAt still stoneUntil tauntProofUntil tauntReadyAt tauntsTaken thrownAt treadAt unmasked ward warnedAt""".split()

lines = []
line = "   "
for key in OPTIONAL:
    piece = f' "{key}",'
    if len(line) + len(piece) > 104:
        lines.append(line)
        line = "   "
    line += piece
lines.append(line)
listed = "\n".join(lines)

# --- the list, before the class
swap("""export class Battle {
    /**
     * Whether the nearest enemy,""", """/**
 * What only some characters come to have, given them by the battle as they fight or by the host
 * (a player's gear, a follower's orders, a boss's fight, a wary beast's mood...): every character
 * is made with every one of them, undefined till it's given, after what add's own literal gives
 * it and in this order (#made). So every character in a battle is of one shape, which is what
 * lets the engine read `actor.x` the same quick way wherever it's asked: with eight or nine
 * shapes among a field battle's hundred, as there were, every read was a slower one. Undefined
 * is left out of what a snapshot's text holds (core/wire.js), as these were when they weren't
 * there. Never `delete` one off a character (that alone made every read of it a lookup for good):
 * make it undefined. A new one of the kind goes here too (test/battle-rules.test.js checks the
 * field battle's are all one shape).
 */
const OPTIONAL = Object.freeze([
""" + listed + """
]);

export class Battle {
    /**
     * Whether the nearest enemy,""")

# --- add: made by #made, then put in
swap("""     * up again where it fell (#rise), dodging `dodge` of blows.
     */
    add({ id, kind,""", """     * up again where it fell (#rise), dodging `dodge` of blows.
     */
    add(given) {
        const actor = this.#made(given);

        this.actors.push(actor);
        this.#roster++;
        this.#version++;

        return actor;
    }

    // A character as add makes one, in no battle yet. Every one's made here, add's and those
    // carried on from a snapshot (restore): by the one literal, every property of it there
    // whatever was given, and then every property only some come to have (OPTIONAL), so that all
    // are one shape
    #made({ id, kind,""")
swap("""            ...(wards ? { wards: { ...wards } } : {}),
""", """            wards: wards ? { ...wards } : undefined,
""")
swap("""            ...(tactic ? { tactic } : {}),
            ...(keep ? { keep } : {}),
            ...(lone ? { lone: true } : {}),
            ...(sight ? { sight } : {}),
        };

        this.actors.push(actor);
        this.#roster++;
        this.#version++;

        return actor;
    }
""", """            tactic: tactic || undefined,
            keep: keep || undefined,
            lone: lone ? true : undefined,
            sight: sight || undefined,
        };

        for (const key of OPTIONAL) {
            actor[key] = undefined;
        }

        return actor;
    }
""")

# --- reshape: no delete
swap("""            if (wards) {
                actor.wards = { ...wards };
            } else {
                delete actor.wards;
            }
""", """            // (None: undefined, not deleted, which would make every read of it a lookup: OPTIONAL)
            actor.wards = wards ? { ...wards } : undefined;
""")

# --- restore: each made as add makes one, then what was kept put on it
swap("""        battle.actors = snapshot.actors.map(({ chance: state, restVariety, to, steering, ...kept }) => {
            const actor = structuredClone(kept);
            const chance = createRandom(0);
""", """        battle.actors = snapshot.actors.map(({ chance: state, restVariety, to, steering, ...kept }) => {
            // (Made as add makes one, then all that was kept of it put on it: so it's of the one
            // shape every character is, whatever of it the snapshot's text left out, OPTIONAL)
            const actor = Object.assign(battle.#made({ id: kept.id, kind: KINDS[kept.kind] ? kept.kind : "folk", team: kept.team, square: kept.square ?? [0, 0] }), structuredClone(kept));
            const chance = createRandom(0);
""")

open(p, "w").write(b)
print("ok")
