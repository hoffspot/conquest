// The server's players (server/storage/players.js; the scaling plan's 6B-1).

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { newPlayerSecret, playerIdOf, publicKeyOf } from "../client/js/core/player.js";
import { PLAYER_FIELDS, PLAYERS_FILE, PLAYERS_STEPS, PLAYERS_VERSION, PlayerStore } from "../server/storage/players.js";
import { NewerDataError, SERVER_VERSION } from "../server/storage/versions.js";

const someone = (name) => {
    const key = publicKeyOf(newPlayerSecret());

    return { id: playerIdOf(key), key, name };
};
const at = (text) => new Date(text);

describe("the server's players (storage/players.js)", () => {
    it("keeps a record for each player who's come in by their own identity, and reads it back: their key and name, first and last seen, days and minutes played, an age band, standing and flags, and nothing else", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-players-"));

        try {
            const store = await PlayerStore.open(root);
            const wren = someone("Wren");
            const ash = someone("Ash");

            assert.deepEqual([store.size, store.get(wren.id)], [0, null]);
            assert.deepEqual(PLAYER_FIELDS, ["key", "name", "firstSeen", "lastSeen", "days", "minutes", "ageBand", "standing", "flags", "nanny", "agecheck", "attempts"]);

            // Seen for the first time
            assert.deepEqual(await store.seen(wren, at("2026-11-27T22:00:00Z")), { id: wren.id, key: wren.key, name: "Wren", firstSeen: "2026-11-27T22:00:00.000Z", lastSeen: "2026-11-27T22:00:00.000Z", days: 1, minutes: 0, ageBand: null, standing: {}, flags: {}, nanny: null, agecheck: null, attempts: null });

            // Again the same day, under another name: no day more
            assert.deepEqual(await store.seen({ ...wren, name: "Wren the Bold" }, at("2026-11-27T23:30:00Z")), { id: wren.id, key: wren.key, name: "Wren the Bold", firstSeen: "2026-11-27T22:00:00.000Z", lastSeen: "2026-11-27T23:30:00.000Z", days: 1, minutes: 0, ageBand: null, standing: {}, flags: {}, nanny: null, agecheck: null, attempts: null });

            // The next day (UTC), and a week on: a day more each
            assert.equal((await store.seen(wren, at("2026-11-28T00:10:00Z"))).days, 2);
            assert.equal((await store.seen(wren, at("2026-12-05T09:00:00Z"))).days, 3);

            // Minutes played, as they leave: to a tenth, never taken off, and of no one it doesn't know
            store.played(wren.id, 12.34);
            store.played(wren.id, 0.5);
            store.played(wren.id, -5);
            store.played(wren.id, NaN);
            store.played(ash.id, 30);
            await store.flush();
            assert.deepEqual([store.get(wren.id).minutes, store.get(ash.id)], [12.8, null]);

            // Another player; and what isn't an identity is no one
            await store.seen(ash, at("2026-12-05T10:00:00Z"));
            assert.equal(await store.seen({ id: "not-an-id", key: ash.key, name: "Mallory" }), null);
            assert.equal(await store.seen({ id: ash.id, name: "No key" }), null);
            assert.equal(await store.seen(), null);
            assert.equal(store.size, 2);

            // A copy's given out: changing it changes nothing kept
            store.get(wren.id).standing.muted = true;
            assert.deepEqual(store.get(wren.id).standing, {});

            // Read back by the next server to open the folder, as it was written
            const written = JSON.parse(await readFile(path.join(root, PLAYERS_FILE), "utf8"));

            assert.deepEqual([written.playersVersion, written.writtenBy, Object.keys(written.players)], [PLAYERS_VERSION, SERVER_VERSION, [wren.id, ash.id]]);
            assert.deepEqual(Object.keys(written.players[wren.id]), PLAYER_FIELDS);

            const again = await PlayerStore.open(root);

            assert.deepEqual([again.size, again.get(wren.id), again.get(ash.id)], [2, store.get(wren.id), store.get(ash.id)]);
            assert.equal(again.error, null);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("holds a player to Nanny Mode after they're seen from a listed country (6B-21): the country and when, renewed at each sighting, let go of once it's run out, or at once by a pass; kept across a restart", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-players-"));
        const DAY = 86400000;
        let now = Date.UTC(2026, 10, 28);

        try {
            const store = await PlayerStore.open(root, { clock: () => now });
            const wren = someone("Wren");

            // Of no one it doesn't know, and nothing that isn't a country
            store.sighted(wren.id, "GB");
            await store.seen(wren);
            store.sighted(wren.id, "gb");
            store.sighted(wren.id, "GBR");
            store.sighted(wren.id, null);
            assert.equal(store.get(wren.id).nanny, null);
            assert.deepEqual([store.lapse(wren.id, 30), store.release(wren.id), store.lapse("nobody", 30)], [false, false, false]);

            // Seen from the United Kingdom: held, from now
            store.sighted(wren.id, "GB");
            assert.deepEqual(store.get(wren.id).nanny, { seen: "GB", at: now });

            // Twenty-nine days on: held still. Seen there again: renewed from then
            now += 29 * DAY;
            assert.equal(store.lapse(wren.id, 30), false);
            store.sighted(wren.id, "GB");
            assert.deepEqual(store.get(wren.id).nanny, { seen: "GB", at: now });

            // Kept across a restart
            await store.flush();
            assert.deepEqual((await PlayerStore.open(root, { clock: () => now })).get(wren.id).nanny, { seen: "GB", at: now });

            // A moment short of thirty days from the last sighting: held. Thirty days: run out, and not kept
            now += 30 * DAY - 1;
            assert.equal(store.lapse(wren.id, 30), false);
            now += 1;
            assert.equal(store.lapse(wren.id, 30), true);
            assert.equal(store.get(wren.id).nanny, null);
            await store.flush();
            assert.equal(JSON.parse(await readFile(path.join(root, PLAYERS_FILE), "utf8")).players[wren.id].nanny, null);

            // Seen from Brazil, then a pass: let go at once, whenever it was set
            store.sighted(wren.id, "BR");
            assert.deepEqual(store.get(wren.id).nanny, { seen: "BR", at: now });
            assert.deepEqual([store.release(wren.id), store.get(wren.id).nanny, store.release(wren.id)], [true, null, false]);

            // No days of hold at all (the server's setting at 0): never held past the moment
            store.sighted(wren.id, "GB");
            assert.equal(store.lapse(wren.id, 0), true);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("brings an older server's file forward a step at a time and writes it again; refuses a newer server's, and one with a step missing or no version", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-players-"));
        const file = path.join(root, PLAYERS_FILE);
        const wren = someone("Wren");
        const old = { key: wren.key, name: "Wren", firstSeen: "2026-11-27T22:00:00.000Z", lastSeen: "2026-11-27T22:00:00.000Z", days: 1, minutes: 5, ageBand: null, standing: {}, flags: {} };

        try {
            await writeFile(file, JSON.stringify({ playersVersion: 1, writtenBy: "0.0.1", players: { [wren.id]: old } }));

            // Version 1 (before Nanny Mode's hold, and before age checks) to this server's, a step at
            // a time: no hold, pass or tries of anyone known then, and the file written at 3
            const opened = await PlayerStore.open(root);

            assert.equal(PLAYERS_VERSION, 3);
            assert.deepEqual(opened.get(wren.id), { id: wren.id, ...old, nanny: null, agecheck: null, attempts: null });
            assert.deepEqual([JSON.parse(await readFile(file, "utf8")).playersVersion, Object.keys(JSON.parse(await readFile(file, "utf8")).players[wren.id])], [3, PLAYER_FIELDS]);

            // Version 2 (with a hold, before age checks): its hold kept
            await writeFile(file, JSON.stringify({ playersVersion: 2, writtenBy: "0.0.2", players: { [wren.id]: { ...old, nanny: { seen: "GB", at: 1 } } } }));
            assert.deepEqual((await PlayerStore.open(root)).get(wren.id), { id: wren.id, ...old, nanny: { seen: "GB", at: 1 }, agecheck: null, attempts: null });

            // A step on to a version 4 that names each record's hours: taken after this server's own, and written at 4
            await writeFile(file, JSON.stringify({ playersVersion: 1, writtenBy: "0.0.1", players: { [wren.id]: old } }));

            const steps = { ...PLAYERS_STEPS, 3: (players) => Object.fromEntries(Object.entries(players).map(([id, one]) => [id, { ...one, hours: one.minutes / 60 }])) };
            const stepped = await PlayerStore.open(root, { steps, version: 4 });

            assert.deepEqual([stepped.get(wren.id).hours, stepped.get(wren.id).nanny, stepped.get(wren.id).agecheck], [5 / 60, null, null]);
            assert.deepEqual([JSON.parse(await readFile(file, "utf8")).playersVersion, JSON.parse(await readFile(file, "utf8")).players[wren.id].hours], [4, 5 / 60]);

            // That file, to this server: a newer server's, refused, untouched
            await assert.rejects(() => PlayerStore.open(root), NewerDataError);
            assert.equal(JSON.parse(await readFile(file, "utf8")).playersVersion, 4);

            // A step missing; and no version at all
            await assert.rejects(() => PlayerStore.open(root, { steps: {}, version: 5 }), /step's missing/);
            await writeFile(file, JSON.stringify({ players: {} }));
            await assert.rejects(() => PlayerStore.open(root), /no version/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
