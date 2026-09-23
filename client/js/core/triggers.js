import { TRIGGER_CHECK_INTERVAL_MS } from "./config.js";

/**
 * Runs a level's timed and conditional triggers against game time.
 *
 * The book scheduled triggers with setTimeout()/setInterval(), which kept running on wall-clock
 * time even when the game loop was throttled or paused, and stored timer handles on the shared
 * level definitions. Here triggers are evaluated at the end of every game tick instead, so they
 * pause with the game and behave identically on every multiplayer client.
 */
export class TriggerRunner {
    constructor(game, definitions = []) {
        this.game = game;
        this.pending = definitions.map((definition) => {
            if (definition.type === "timed") {
                return { definition, nextTime: definition.time };
            }

            if (definition.type === "conditional") {
                return { definition, nextTime: TRIGGER_CHECK_INTERVAL_MS };
            }

            throw new Error(`Unknown trigger type: ${definition.type}`);
        });
    }

    /** Run every trigger that is due at the given game time (in milliseconds). */
    update(time) {
        for (const trigger of [...this.pending]) {
            // Stop as soon as a trigger ends the level
            if (this.game.ended) {
                return;
            }

            if (time < trigger.nextTime) {
                continue;
            }

            const { definition } = trigger;

            if (definition.type === "timed") {
                if (definition.repeat) {
                    trigger.nextTime += definition.time;
                } else {
                    this.#remove(trigger);
                }

                definition.action(this.game);
            } else {
                trigger.nextTime += TRIGGER_CHECK_INTERVAL_MS;

                if (definition.condition(this.game)) {
                    this.#remove(trigger);
                    definition.action(this.game);
                }
            }
        }
    }

    #remove(trigger) {
        this.pending.splice(this.pending.indexOf(trigger), 1);
    }
}
