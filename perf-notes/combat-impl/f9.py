import sys

p = sys.argv[1]
b = open(p).read()


def swap(old, new, count=1):
    global b
    assert b.count(old) == count, (old[:90], b.count(old))
    b = b.replace(old, new)


# --- the constant, after TAUNT
swap("""/**
 * Slipping away (FFXIV's old Diversion, WoW's Fade):""", """/**
 * Stuns on a boss (whatever resists taunts: a dungeon's boss, a hell level's own, one of a kind, an
 * elite, the Behemoth, #resists): a stun of any kind (a spell's, a shield bash's, a legendary
 * weapon's) lasts `share` as long on one, and each one within `within` ms of the last `share` as
 * long again (kept on it, `stunned`: { count, at }), till it's shorter than a step and shrugged
 * off; none for `within`, the next lasts its half again. As Fear wears thin (FEAR_MEMORY), and
 * with the taunts' own numbers (TAUNT resist): the owner, "For hold, halve stuns on bosses and
 * shorten each repeat, as Fear already wears thin". Hold alone, cast again as it came ready, kept
 * a dungeon's boss stunned 99.5% of a fight; so it's a breathing space now, not a lock.
 */
export const STUNS = Object.freeze({ share: 0.5, within: 20000 });

/**
 * Slipping away (FFXIV's old Diversion, WoW's Fade):""")

# --- OPTIONAL gains `stunned`
swap(""""slips", "snaredUntil", "steeled", "steeledAt", "still", "stoneUntil", "tauntProofUntil",""", """"slips", "snaredUntil", "steeled", "steeledAt", "still", "stoneUntil", "stunned", "tauntProofUntil",""")

# --- #freeze
swap("""        const held = Math.round(ms * (warded ? WARD : 1));

        target.stunnedUntil = Math.max(target.stunnedUntil, this.time + held);
        target.casting = null;

        if (target.attack && !target.attack.struck) {
            target.attack = null;
        }

        this.#turnOn(target, by, this.time + held);
        this.#emit("stunned", { id: target.id, by: by.id, effect: look, until: target.stunnedUntil });
    }
""", """        // (A boss: half as long, and less each time: STUNS)
        const held = this.#stunFor(target, Math.round(ms * (warded ? WARD : 1)));

        this.#turnOn(target, by, this.time + held);

        if (!held) {
            this.#emit("resisted", { id: target.id, by: by.id, spell: null, effect: look, always: false, worn: true });

            return;
        }

        target.stunnedUntil = Math.max(target.stunnedUntil, this.time + held);
        target.casting = null;

        if (target.attack && !target.attack.struck) {
            target.attack = null;
        }

        this.#emit("stunned", { id: target.id, by: by.id, effect: look, until: target.stunnedUntil });
    }

    // How long a stun of `ms` lasts on someone (ms): as long as it is; on a boss (#resists),
    // STUNS.share as long, and as much shorter again for each stun before it that came within
    // STUNS.within of the one before (its `stunned`: { count, at }); none at all (0) once that's
    // less than a step: shrugged off, though it still counts as one
    #stunFor(target, ms) {
        if (!this.#resists(target)) {
            return ms;
        }

        const before = target.stunned && this.time - target.stunned.at < STUNS.within ? target.stunned.count : 0;
        let lasts = ms;

        for (let k = 0; k <= before; k++) {
            lasts *= STUNS.share;
        }

        target.stunned = { count: before + 1, at: this.time };

        return lasts < STEP_MS ? 0 : Math.round(lasts);
    }
""")

# --- #bashed
swap("""        target.stunnedUntil = Math.max(target.stunnedUntil, this.time + ms);
        target.casting = null;

        if (target.attack && !target.attack.struck) {
            target.attack = null;
        }

        this.#turnOn(target, attacker, this.time + ms);
        this.#emit("stunned", { id: target.id, by: attacker.id, ability: "shieldBash", until: target.stunnedUntil });
    }
""", """        // (A boss: half as long, and less each time: STUNS)
        ms = this.#stunFor(target, ms);
        this.#turnOn(target, attacker, this.time + ms);

        if (!ms) {
            this.#emit("resisted", { id: target.id, by: attacker.id, spell: null, ability: "shieldBash", always: false, worn: true });

            return;
        }

        target.stunnedUntil = Math.max(target.stunnedUntil, this.time + ms);
        target.casting = null;

        if (target.attack && !target.attack.struck) {
            target.attack = null;
        }

        this.#emit("stunned", { id: target.id, by: attacker.id, ability: "shieldBash", until: target.stunnedUntil });
    }
""")

# --- #stun
swap("""        if (this.#warded(target, { school: SPELLS[id]?.school ?? "magic" })) {
            ms = Math.round(ms * WARD);
        }

        target.stunnedUntil = Math.max(target.stunnedUntil, this.time + ms);
        target.casting = null;

        if (target.attack && !target.attack.struck) {
            target.attack = null;
        }

        this.#turnOn(target, caster, this.time + ms);
        this.#emit("stunned", { id: target.id, by: caster.id, spell: id, until: target.stunnedUntil });
    }
""", """        if (this.#warded(target, { school: SPELLS[id]?.school ?? "magic" })) {
            ms = Math.round(ms * WARD);
        }

        // (A boss: half as long, and less each time, till it shrugs them off: STUNS)
        ms = this.#stunFor(target, ms);
        this.#turnOn(target, caster, this.time + ms);

        if (!ms) {
            this.#emit("resisted", { id: target.id, by: caster.id, spell: id, always: false, worn: true });

            return;
        }

        target.stunnedUntil = Math.max(target.stunnedUntil, this.time + ms);
        target.casting = null;

        if (target.attack && !target.attack.struck) {
            target.attack = null;
        }

        this.#emit("stunned", { id: target.id, by: caster.id, spell: id, until: target.stunnedUntil });
    }
""")

open(p, "w").write(b)
print("ok")
