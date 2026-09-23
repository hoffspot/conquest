// Validation for player commands.
//
// In multiplayer, commands are the only thing players send each other, so a command from the
// network is never trusted as it is. Every command is rebuilt from the fields its type needs:
// anything else (extra properties, nested orders, objects in place of ids) is dropped, and
// commands that are missing something are rejected. Both the game and the server use this.

// Orders a newly built unit may start with (e.g. the campaign's enemy starports build hunters)
const UNIT_STARTING_ORDERS = new Set(["stand", "sentry", "hunt"]);

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

// A map position, rebuilt as a plain { x, y } object
function point(value) {
    if (value !== null && typeof value === "object" && isFiniteNumber(value.x) && isFiniteNumber(value.y)) {
        return { x: value.x, y: value.y };
    }

    return undefined;
}

/**
 * Return a clean copy of a command's details, or undefined if the command is invalid.
 *
 * Commands that target an item (attack, guard, deploy) must name it by id with toUid; the game
 * looks the item up itself when it carries out the command.
 */
export function sanitizeCommand(details) {
    if (details === null || typeof details !== "object") {
        return undefined;
    }

    const { type } = details;

    switch (type) {
        case "stand":
        case "sentry":
        case "hunt":
            return { type };

        case "move": {
            const to = point(details.to);

            return to && { type, to };
        }

        case "patrol": {
            const to = point(details.to);
            const from = point(details.from);

            return to && from && { type, to, from };
        }

        case "attack":
        case "guard":
        case "deploy":
            return Number.isInteger(details.toUid) ? { type, toUid: details.toUid } : undefined;

        case "construct-building": {
            const building = details.details;

            if (typeof building?.name === "string" && Number.isInteger(building.x) && Number.isInteger(building.y)) {
                return { type, details: { type: "buildings", name: building.name, x: building.x, y: building.y } };
            }

            return undefined;
        }

        case "construct-unit": {
            const unit = details.details;

            if ((unit?.type === "vehicles" || unit?.type === "aircraft") && typeof unit.name === "string") {
                const clean = { type: unit.type, name: unit.name };

                if (UNIT_STARTING_ORDERS.has(unit.orders?.type)) {
                    clean.orders = { type: unit.orders.type };
                }

                return { type, details: clean };
            }

            return undefined;
        }

        default:
            return undefined;
    }
}

/** Is this a list of item ids, as sent with a command? */
export function isUidList(uids) {
    return Array.isArray(uids) && uids.length <= 500 && uids.every(Number.isInteger);
}
