// Keeping a running world (generated/world_server_plan.md §5, "When it saves"): saved on each turn
// of its war (once a minute of the world's time: its runner tells of each, core/runner.js; a few
// steps after it, KEEPER.after, the step that turns the war being the world's longest already), and
// whenever it's asked to be: when the world goes empty, when it's stopped or set aside, when the
// server shuts down, before a restore or a migration. Each save is the world as it is between two
// steps (Host.snapshotText: written out at once, straight from the world's own with nothing
// copied, so the world can go on), kept as storage/worlds.js keeps it. A save that fails is told in the world's journal, and the next is tried as usual.

import { STEP_MS } from "../client/js/core/battle.js";
import { elapsedOf } from "../client/js/core/daytime.js";
import { SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { WAR_VERSION } from "../client/js/core/war/war.js";

/**
 * How many steps after a turn of the war the world's saved for it (generated/
 * multiplayer_scaling_plan.md 1-4): the turn's own step moves every realm, so the save's few
 * milliseconds go to a step that has them to spare.
 */
export const KEEPER = Object.freeze({ after: 4 });

export class Keeper {
    /**
     * @param {object} runner - The world's runner (core/runner.js WorldRunner): told to save on each war turn.
     * @param {object} stored - Where it's kept (storage/worlds.js StoredWorld).
     */
    constructor(runner, stored) {
        this.runner = runner;
        this.stored = stored;

        /** How long it had been played before (ms), and how many saves have reached the disk. */
        this.playedBefore = stored.meta.played ?? 0;
        this.saved = 0;

        /** The last save that failed: { why, error }, or null. */
        this.failed = null;

        /** Told of each save once it's on the disk, or has failed: (ms it took, by the runner's clock if it has one; ok). */
        this.onSave = null;

        // (Every save asked for, in order)
        this.saving = Promise.resolve();

        // The world's time at which the last turn's save is due (null: none waiting)
        this.turnAt = null;

        runner.onTurn = () => {
            this.turnAt ??= runner.host.battle.time + KEEPER.after * STEP_MS;
        };
        runner.onStep = () => {
            if (this.turnAt !== null && runner.host.battle.time >= this.turnAt) {
                this.save("turn");
            }
        };
    }

    /** How long the world's been played in all (ms): before, and on this runner. */
    get played() {
        return this.playedBefore + this.runner.time;
    }

    /** The world saved as it now is (`why`: "turn", "empty", "stopped"...). Returns when it's on the disk (or failed). */
    save(why) {
        const started = this.runner.clock?.() ?? 0;
        const took = () => (this.runner.clock?.() ?? 0) - started;
        const { host } = this.runner;

        // (Whatever turn's save was waiting: this is it)
        this.turnAt = null;

        const about = { worldTime: host.battle.time, elapsed: elapsedOf(host.war), versions: { snapshot: SNAPSHOT_VERSION, war: host.war ? WAR_VERSION : null } };
        const saving = this.stored.saveText(host.snapshotText(), about, { why, played: this.played }).then(
            () => {
                this.saved++;
                this.onSave?.(took(), true);
            },
            async (error) => {
                this.failed = { why, error };
                this.onSave?.(took(), false);
                await this.stored.journal(`Couldn't save (${why}): ${error.message}`).catch(() => {});
            },
        );

        this.saving = saving;

        return saving;
    }

    /** Once every save asked for so far is done. */
    settled() {
        return this.saving;
    }
}
