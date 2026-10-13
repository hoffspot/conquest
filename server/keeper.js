// Keeping a running world (generated/world_server_plan.md §5, "When it saves"): saved on each turn
// of its war (once a minute of the world's time: its runner tells of each, core/runner.js), and
// whenever it's asked to be: when the world goes empty, when it's stopped or set aside, when the
// server shuts down, before a restore or a migration. Each save is the world as it is between two
// steps (Host.snapshot: taken at once, so the world can go on), written as storage/worlds.js
// writes it. A save that fails is told in the world's journal, and the next is tried as usual.

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

        // (Every save asked for, in order)
        this.saving = Promise.resolve();

        runner.onTurn = () => this.save("turn");
    }

    /** How long the world's been played in all (ms): before, and on this runner. */
    get played() {
        return this.playedBefore + this.runner.time;
    }

    /** The world saved as it now is (`why`: "turn", "empty", "stopped"...). Returns when it's on the disk (or failed). */
    save(why) {
        const saving = this.stored.save(this.runner.host.snapshot(), { why, played: this.played }).then(
            () => {
                this.saved++;
            },
            async (error) => {
                this.failed = { why, error };
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
