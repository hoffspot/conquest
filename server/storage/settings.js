// The world server's own settings (generated/world_server_plan.md §5.1, §10), kept in server.json
// in its data folder, written only by the server. Every setting has a schema (SETTINGS: its kind,
// its range, its default), and a change is checked against it before it's written: a bad value is
// refused with the reason. The file carries its version (configVersion) and the server that wrote
// it; one kept by an older server is brought forward a step at a time (SETTINGS_STEPS: renaming
// or changing what one means), after a copy's been made of it; one kept by a newer server is
// refused. A setting added needs no step: it's filled in with its default. Keys it doesn't know
// are kept, not dropped, so a newer server's settings come through an older one unharmed.

import { exists, readJSON, writeJSON } from "./files.js";
import { checkVersion, forward, SERVER_VERSION } from "./versions.js";

/** The settings file's version: bump it, with a step in SETTINGS_STEPS, when one's renamed or comes to mean something else. */
export const CONFIG_VERSION = 1;

/** The steps that bring an older server's settings forward: [n] takes them from version n to n + 1 (and returns them). */
export const SETTINGS_STEPS = Object.freeze({});

/**
 * Every setting: its kind ("boolean", "integer", "number"), its range, its default, and what it's
 * for (as the management page says it).
 */
export const SETTINGS = Object.freeze({
    port: { kind: "integer", min: 1, max: 65535, default: 8480, about: "The port players reach the server on (and the management page, from the Wi-Fi, at /admin)" },
    adminPort: { kind: "integer", min: 1, max: 65535, default: 8481, about: "The port the management page answers on, on this computer alone, needing no key" },
    worldsAtOnce: { kind: "integer", min: 1, max: 64, default: 2, about: "How many worlds may be running or loading at once" },
    setAsideMinutes: { kind: "number", min: 0, max: 1440, default: 2, about: "How long a world with nobody in it waits before it's saved and set aside (minutes)" },
    keepAwake: { kind: "boolean", default: true, about: "Keep the computer awake while players are in" },
    bonjour: { kind: "boolean", default: true, about: "Show this server to others on the Wi-Fi, and list the servers near it (Bonjour)" },
    internet: { kind: "boolean", default: false, about: "Answer the internet (over TLS alone, once the server has a certificate)" },
    router: { kind: "boolean", default: true, about: "Ask the router to let the internet in (PCP, NAT-PMP or UPnP), while the internet's answered" },
    checkUpdates: { kind: "boolean", default: true, about: "Check once a day whether there's a new version" },
});

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** Why `value` can't be setting `key` (a sentence), or null if it can. */
export function settingReason(key, value) {
    return schemaReason(SETTINGS, key, value);
}

/**
 * Why `value` can't be `key` in `schema` (settings as SETTINGS has them: a world's are another),
 * or null if it can.
 */
export function schemaReason(schema, key, value) {
    const setting = Object.hasOwn(schema, key) ? schema[key] : null;

    if (!setting) {
        return `There's no setting called "${key}".`;
    }

    switch (setting.kind) {
        case "boolean":
            return typeof value === "boolean" ? null : `${key} must be true or false, not ${JSON.stringify(value)}.`;
        case "integer":
            return Number.isInteger(value) && value >= setting.min && value <= setting.max ? null : `${key} must be a whole number from ${setting.min} to ${setting.max}, not ${JSON.stringify(value)}.`;
        default:
            return Number.isFinite(value) && value >= setting.min && value <= setting.max ? null : `${key} must be a number from ${setting.min} to ${setting.max}, not ${JSON.stringify(value)}.`;
    }
}

/** Refused: a settings file holding a value its setting can't have (`reason`). */
export class SettingsError extends Error {
    constructor(file, reason) {
        super(`The server's settings (${file}) can't be used: ${reason} Correct it, restore it from a backup, or move it aside to start again from the defaults.`);
        this.name = "SettingsError";
        Object.assign(this, { file, reason });
    }
}

/** The server's settings, as kept in its settings file. */
export class Settings {
    #values;

    constructor(file, values, version = CONFIG_VERSION) {
        /** Where they're kept, and at which version. */
        this.file = file;
        this.version = version;

        this.#values = values;
    }

    /**
     * The settings kept in `file` (made with every default, if there's no file): brought forward
     * if an older server kept them (`beforeMoving(file)` told first, to copy them), refused if a
     * newer one did (versions.js NewerDataError) or if one's value can't be (SettingsError).
     * `current` and `steps` are CONFIG_VERSION and SETTINGS_STEPS but for the tests.
     */
    static async open(file, { current = CONFIG_VERSION, steps = SETTINGS_STEPS, beforeMoving = async () => {} } = {}) {
        let stored = {};
        let older = false;

        if (await exists(file)) {
            let document;

            try {
                document = await readJSON(file);
            } catch (error) {
                throw new SettingsError(file, `it isn't JSON (${error.message}).`);
            }

            if (!isObject(document)) {
                throw new SettingsError(file, "it isn't a JSON object.");
            }

            const { configVersion, writtenBy, ...values } = document;
            const what = `The server's settings (${file})`;

            older = checkVersion(what, { found: configVersion, current, writtenBy });

            if (older) {
                await beforeMoving(file);
            }

            stored = older ? forward(what, values, { found: configVersion, current, steps, writtenBy }) : values;
        }

        for (const [key, value] of Object.entries(stored)) {
            const reason = Object.hasOwn(SETTINGS, key) ? settingReason(key, value) : null;

            if (reason) {
                throw new SettingsError(file, reason);
            }
        }

        // (Every setting it knows, those not kept filled in with their defaults; and whatever else
        // was kept, kept)
        const defaults = Object.fromEntries(Object.entries(SETTINGS).map(([key, { default: value }]) => [key, value]));
        const settings = new Settings(file, { ...defaults, ...stored }, current);

        if (older || Object.keys(defaults).some((key) => !Object.hasOwn(stored, key))) {
            await settings.#write(settings.#values);
        }

        return settings;
    }

    /** A setting's value. */
    get(key) {
        if (!Object.hasOwn(SETTINGS, key)) {
            throw new Error(`There's no setting called "${key}".`);
        }

        return this.#values[key];
    }

    /** Every setting it knows, and its value. */
    all() {
        return Object.fromEntries(Object.keys(SETTINGS).map((key) => [key, this.#values[key]]));
    }

    /**
     * Settings changed (`changes`: { key: value }), each checked first: { ok: true } once they're
     * written, or { ok: false, reasons } and nothing changed.
     */
    async change(changes) {
        if (!isObject(changes) || !Object.keys(changes).length) {
            return { ok: false, reasons: ["Nothing to change."] };
        }

        const reasons = Object.entries(changes)
            .map(([key, value]) => settingReason(key, value))
            .filter(Boolean);

        if (reasons.length) {
            return { ok: false, reasons };
        }

        const values = { ...this.#values, ...changes };

        await this.#write(values);
        this.#values = values;

        return { ok: true };
    }

    // Written to its file (atomically), with its version and the server that wrote it
    async #write(values) {
        await writeJSON(this.file, { configVersion: this.version, writtenBy: SERVER_VERSION, ...values });
    }
}
