// Bringing a kept world into play (generated/world_server_plan.md §5, §5.1): made again from its
// seed, and carried on from its latest save that reads (storage/worlds.js), brought forward if an
// older version of the game kept it (core/host.js Host.forward). A world kept by a newer version
// is refused, saying which server it needs. One that can't be carried on (none of its saves
// reads, or one's older than any step goes back to) can be started afresh from its seed, if its
// owner says so: its war carried on (as far as any save of it reads), its kept heroes kept, a
// copy of everything made first.
//
// And a player's solo world brought to the server (§5, "Bring my world to the server"): a world
// made with the same seed and the same war, their hero its first kept hero and they its owner
// (manage.js bringSolo); the rest from the seed, as a solo game's is each time it's loaded.

import { rm } from "node:fs/promises";
import { salvage } from "../client/js/app/character-file.js";
import { ExportError, forwardExport, importCharacter } from "../client/js/app/save.js";
import { Host, SNAPSHOT_STEPS, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { copyOf } from "../client/js/core/guid.js";
import { characterFrom } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { NewerDataError } from "./storage/versions.js";

/** The rules of a world the server runs (core/host.js RULES): time passes when everyone rests; debug commands are its owners', if its settings allow them. */
export function rulesFor(meta) {
    return { rest: "everyone", debug: meta.settings?.debugCommands ? "owner" : "none" };
}

/** Refused: a kept world that can't be carried on (`reason`), for its owner to choose a fresh start from its seed. */
export class CantCarryOn extends Error {
    constructor(stored, reason) {
        super(`World ${stored.id} ("${stored.meta.name}") can't be carried on: ${reason} It can be started afresh from its seed, keeping its war and its heroes.`);
        this.name = "CantCarryOn";
        Object.assign(this, { id: stored.id, reason });
    }
}

// The oldest version a snapshot can be brought forward from (SNAPSHOT_STEPS)
const OLDEST = Math.min(SNAPSHOT_VERSION, ...Object.keys(SNAPSHOT_STEPS).map(Number));

/**
 * A kept world in play: { host, from (the save it carried on from, or null for a new one made
 * from its seed), forwarded (the version it was brought forward from, or null) }. `build` makes a
 * world from its seed (core/overworld.js buildWorld, but for the tests).
 */
export async function openWorld(stored, { build = buildWorld } = {}) {
    let loaded;

    try {
        loaded = await stored.load();
    } catch (error) {
        throw new CantCarryOn(stored, `${error.message}`);
    }

    const { snapshot, from } = loaded;

    if (!snapshot) {
        return { host: new Host(build({ seed: stored.meta.seed, race: stored.meta.race }), { rules: rulesFor(stored.meta) }), from: null, forwarded: null };
    }

    if (snapshot.version > SNAPSHOT_VERSION) {
        throw new NewerDataError(`World ${stored.id}'s save (${from})`, { found: snapshot.version, reads: SNAPSHOT_VERSION, needs: stored.writtenBy });
    }

    if (snapshot.version < OLDEST) {
        throw new CantCarryOn(stored, `its save (${from}) was kept by version ${snapshot.version} of the game, older than any this one can bring forward (${OLDEST}).`);
    }

    const host = Host.restore(build({ seed: stored.meta.seed, race: stored.meta.race }), snapshot);
    const forwarded = snapshot.version === SNAPSHOT_VERSION ? null : snapshot.version;

    if (forwarded !== null) {
        await stored.journal(`Its save (${from}) brought forward from version ${forwarded} of the game to ${SNAPSHOT_VERSION}.`);
    }

    return { host, from, forwarded };
}

/**
 * A kept world's latest save brought forward to this version of the game, and saved so (as a new
 * version of the server does to every world as it's first started, before anyone's let in):
 * { from (the save, or null if it's never been saved), forwarded (the version it was brought
 * forward from, or null if it was this one's) }. Refused if a newer version kept it; one whose
 * saves don't read, or that's older than any step goes back to, is left as it was (it was
 * already, before this version: its owner's offered a fresh start when it's opened), and says so
 * ({ stuck: why }).
 */
export async function bringForward(stored) {
    let loaded;

    try {
        loaded = await stored.load();
    } catch (error) {
        return { from: null, forwarded: null, stuck: error.message };
    }

    const { snapshot, from } = loaded;

    if (!snapshot || snapshot.version === SNAPSHOT_VERSION) {
        return { from: from ?? null, forwarded: null };
    }

    if (snapshot.version > SNAPSHOT_VERSION) {
        throw new NewerDataError(`World ${stored.id}'s save (${from})`, { found: snapshot.version, reads: SNAPSHOT_VERSION, needs: stored.writtenBy });
    }

    if (snapshot.version < OLDEST) {
        return { from, forwarded: null, stuck: `its save (${from}) was kept by version ${snapshot.version} of the game, older than any this one can bring forward (${OLDEST}).` };
    }

    const forwarded = snapshot.version;

    await stored.save(Host.forward(snapshot), { why: `brought forward from version ${forwarded} of the game` });

    return { from, forwarded };
}

/**
 * A kept world started afresh from its seed (its owner having said so, generated/world_server_plan.md
 * §5.1): a copy of everything kept of it made first; its war carried on from the newest save
 * whose war reads (a new war if none does, or this version can't take it); its kept heroes left
 * as they were; saved, and its journal told. Returns the new world (a Host).
 */
export async function freshStart(stored, { why = "its owner asked", build = buildWorld, when = () => new Date() } = {}) {
    await stored.backUp("before-fresh-start", when());

    const kept = await stored.newest((snapshot) => snapshot.war !== null && typeof snapshot.war === "object");
    const world = build({ seed: stored.meta.seed, race: stored.meta.race });
    const rules = rulesFor(stored.meta);
    let host = null;
    let war = "a new war";

    if (kept) {
        try {
            host = new Host(world, { war: kept.snapshot.war, rules });
            war = `its war carried on from ${kept.from}, at turn ${host.war?.turn ?? 0}`;
        } catch (error) {
            war = `a new war (its war couldn't be taken: ${error.message})`;
        }
    }

    host ??= new Host(world, { rules });
    await stored.save(host.snapshot(), { why: "fresh start", when });
    await stored.journal(`Started afresh from its seed (${why}): ${war}; its kept heroes kept.`, when());

    return host;
}

/** Refused: a character and their world that can't be brought to the server, saying why (`newer`: kept by a newer game). */
export class SoloError extends Error {
    constructor(message, { newer = false } = {}) {
        super(message);
        this.name = "SoloError";
        this.newer = newer;
    }
}

/**
 * A player's solo world brought to the server (§5, "Bring my world to the server"): `exported` is
 * a character and their world as the game exports them (app/save.js exportCharacter), brought
 * forward and made one this version plays as a character file is (character-file.js salvage). A
 * new world is kept in `store` for it: its seed, its home people the hero's (as the game made it),
 * its war carried on, and the rest from the seed, as a solo game's is each time it's loaded;
 * made by `creator`, named `name` (or after the hero), its first heroes as `firstHero` has them.
 * Its hero isn't kept yet: they're kept for whoever brought it, once they're one of its players
 * (manage.js bringSolo). Throws SoloError, saying why, if it can't be brought. Returns { stored,
 * kept (the hero, as a world keeps one), left (what was left out or put right, as salvage says),
 * turn (its war's, or null for a new war) }.
 */
export async function importSolo(store, exported, { name = null, creator = null, firstHero = "new", id, build = buildWorld, when = () => new Date() } = {}) {
    let imported;
    let left;

    try {
        const salvaged = salvage(forwardExport(exported));

        imported = importCharacter(salvaged.exported);
        left = salvaged.left;
    } catch (error) {
        throw new SoloError(error instanceof ExportError ? error.message : "That isn't a character and world the game saved.", { newer: Boolean(error.newer) });
    }

    const character = imported && characterFrom({ hero: imported.hero, talks: imported.talks, progress: imported.progress, standing: imported.standing, followers: imported.followers });

    if (!character) {
        throw new SoloError("Its hero couldn't be brought in.");
    }

    // (A copy, the world's own from now on: the character stays on their device too, so it has an
    // id of its own, and theirs as its origin: core/guid.js)
    character.hero = copyOf(character.hero);

    const { hero } = character;
    const kept = { ...character, explored: imported.explored, wheels: imported.wheels, pin: imported.pin, place: imported.place, vitals: imported.vitals, messages: imported.messages, told: imported.told };
    let stored;

    try {
        stored = await store.create({ name: String(name ?? "").trim() || `${hero.name}'s world`.slice(0, 60), seed: imported.save.seed, race: hero.race, creator, heroes: "kept", firstHero }, { ...(id ? { id } : {}), when: when() });
    } catch (error) {
        throw new SoloError(error.message);
    }

    // (Its land made from the seed and its war carried on, then saved; if it can't be, nothing's
    // left of it)
    try {
        let host;

        try {
            host = new Host(build({ seed: imported.save.seed, race: hero.race }), { war: imported.war, rules: rulesFor(stored.meta) });
        } catch (error) {
            host = new Host(build({ seed: imported.save.seed, race: hero.race }), { rules: rulesFor(stored.meta) });
            imported.war = null;
            await stored.journal(`Its war couldn't be taken (${error.message}): a new war.`, when());
        }

        await stored.save(host.snapshot(), { why: "brought from a solo game", when });

        return { stored, kept, left, turn: imported.war ? (host.war?.turn ?? 0) : null };
    } catch (error) {
        await rm(stored.folder, { recursive: true, force: true });

        throw new SoloError(`It couldn't be made here (${error.message}).`);
    }
}
