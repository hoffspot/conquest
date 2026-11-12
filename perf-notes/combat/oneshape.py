# The "one shape" variant, on the lean one: every actor made with every property it may come to
# have (those seen on any over the field battle and a walk out of the start town: keys.mjs), in
# one order, so the engine keeps one shape for them all.
import json

S = "/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/combat"
b = open(f"{S}/variants/battle-lean.js").read()

def swap(src, old, new, count=1):
    assert src.count(old) == count, (old[:80], src.count(old))
    return src.replace(old, new)

b = swap(b, "            ...(wards ? { wards: { ...wards } } : {}),\n", "            wards: wards ? { ...wards } : undefined,\n")
b = swap(b, """            ...(tactic ? { tactic } : {}),
            ...(keep ? { keep } : {}),
            ...(lone ? { lone: true } : {}),
            ...(sight ? { sight } : {}),
        };
""", """            tactic: tactic || undefined,
            keep: keep || undefined,
            lone: lone ? true : undefined,
            sight: sight || undefined,
            // (What the host and the battle give some of them later, there from the start)
            oil: undefined,
            endurance: undefined,
            enmityWeight: undefined,
            haste: undefined,
            leech: undefined,
            bleed: undefined,
            mastered: undefined,
            darkSight: undefined,
            recovery: undefined,
            rank: undefined,
            mood: undefined,
            lingering: undefined,
            warnedAt: undefined,
            backing: undefined,
            backOffAt: undefined,
        };
""")
b = swap(b, "                delete actor.wards;", "                actor.wards = undefined;")
open(f"{S}/variants/battle-oneshape.js", "w").write(b)
print("written")
