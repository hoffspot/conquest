// Each people's works (core/setpieces/works.js lays them out, sites.js sets them down,
// art/kits/works.js builds them, far/shapes.js draws them afar): a lumber mill in its ring of
// trees, a mine's pit with its headframe, a quarry's faces round three sides; each with its yard
// open at its front, its guards' posts and round open ground, the same every time
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// (Textured materials paint a canvas: enough of one for them to in Node, every other drawing call
// doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const { buildWorld } = await import("../client/js/core/overworld.js");
const { layoutNeutral } = await import("../client/js/core/setpieces/neutral.js");
const { MINE, WORKS_SIZE } = await import("../client/js/core/setpieces/works.js");
const { PLOT } = await import("../client/js/core/setpieces/pieces.js");
const { heightAt } = await import("../client/js/core/terrain/height.js");
const { WORKS, WORLD_SIZE } = await import("../client/js/core/worldplan/plan.js");
const { builderOf } = await import("../client/js/world/town3d.js");
const { WORK_PARTS } = await import("../client/js/world/art/kits/works.js");
const { Shapes, siteShapes } = await import("../client/js/world/far/shapes.js");

function trianglesOf(object) {
    let count = 0;

    object.traverse((node) => {
        if (node.isMesh) {
            count += (node.geometry.index ? node.geometry.index.count : node.geometry.attributes.position.count) / 3;
        }
    });

    return count;
}

const KINDS = WORKS.map(({ kind }) => kind);
const inside = ([x, y], [x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1;

describe("each people's works laid out (setpieces/works.js)", () => {
    it("lays each out the same every time, in its plots, its yard, heart, posts and round on open ground", () => {
        for (const kind of KINDS) {
            for (const seed of [1, 7, 42, 9001]) {
                const laid = layoutNeutral({ kind, seed, people: "human" });
                const [width, depth] = WORKS_SIZE[kind].map((plots) => plots * PLOT);

                assert.deepEqual(layoutNeutral({ kind, seed, people: "human" }), laid, `${kind} ${seed}: the same`);
                assert.deepEqual(laid.size, WORKS_SIZE[kind]);

                for (const spot of [laid.heart, laid.yard, ...laid.posts, ...laid.round]) {
                    assert.ok(spot[0] > 0 && spot[0] < width && spot[1] > 0 && spot[1] < depth, `${kind} ${seed}: ${spot} in its plots`);
                    assert.ok(laid.solid.every((rect) => !inside(spot, rect)), `${kind} ${seed}: ${spot} open`);
                }

                // (Its yard at its front, open across it: no part stands between it and the front)
                assert.ok(laid.yard[1] > depth - 6, `${kind}: its yard at its front`);
                assert.equal(laid.posts.length, 4);
                assert.equal(laid.round.length, 6);

                // (Every part one the art builds)
                for (const part of laid.parts) {
                    assert.ok(part.part === "tree" || WORK_PARTS.includes(part.part), `${kind}: ${part.part}`);
                }
            }
        }
    });

    it("rings a lumber mill with trees at its back and sides, open at its front, the stumps of the felled between", () => {
        const laid = layoutNeutral({ kind: "lumber mill", seed: 3, people: "elf" });
        const [width, depth] = WORKS_SIZE["lumber mill"].map((plots) => plots * PLOT);
        const trees = laid.parts.filter(({ part }) => part === "tree");

        assert.ok(trees.length >= 14, `${trees.length} trees`);
        assert.ok(trees.every(({ y }) => y < depth - 8), "none across its front");
        assert.ok(trees.some(({ x }) => x < 4) && trees.some(({ x }) => x > width - 4) && trees.some(({ y }) => y < 4), "at its back and both sides");
        assert.ok(laid.parts.filter(({ part }) => part === "stump").length >= 3);
        assert.ok(["sawshed", "logdeck", "planks", "lodge", "clamp"].every((part) => laid.parts.some((each) => each.part === part)));
    });

    it("sinks a mine's pit into the ground, the shaft at its middle; puts a quarry's faces round three sides", () => {
        const mine = layoutNeutral({ kind: "mine", seed: 3, people: "orc" });

        assert.deepEqual(mine.pad, { at: [mine.parts.find(({ part }) => part === "shaft").x, mine.parts.find(({ part }) => part === "shaft").y], radius: MINE.pit.radius, raise: -MINE.pit.drop, ease: MINE.pit.ease });
        assert.ok(mine.parts.filter(({ part }) => part === "spoil").length >= 3);

        const quarry = layoutNeutral({ kind: "quarry", seed: 3, people: "cat" });

        assert.deepEqual(quarry.parts.filter(({ part }) => part === "face").map(({ side }) => side), ["back", "west", "east"]);
        assert.ok(quarry.parts.some(({ part }) => part === "derrick") && quarry.parts.filter(({ part }) => part === "blocks").length >= 3);
    });
});

describe("each people's works in the world (sites.js, art/kits/works.js, far/shapes.js)", () => {
    let world;
    let overworld;
    let works;

    before(() => {
        world = buildWorld({ seed: 1 });
        overworld = world.maps.town;
        works = world.plan.sites.filter(({ kind }) => KINDS.includes(kind));

        for (const site of works) {
            overworld.sites.heartOf(site);
        }
    });

    it("sets each down facing its trail, its yard, posts and round open, its pieces its people's", () => {
        let trailed = 0;

        assert.equal(works.length, 36);

        for (const site of works) {
            const down = overworld.sites.set.get(site.id);

            assert.ok(down, `${site.id} set down`);
            trailed += overworld.trails.facingOf(site) === null ? 0 : 1;

            for (const [x, y] of [down.yard, down.heart, ...down.posts, ...down.round]) {
                assert.ok(!down.squares.has(Math.floor(y) * WORLD_SIZE + Math.floor(x)), `${site.id}: ${x}, ${y} open`);
            }

            assert.ok(down.pieces.length >= 8 && down.pieces.every((piece) => piece.kind === "neutral" && piece.people === site.race && piece.name === site.kind), site.id);
            // (A mine's pit sunk into the ground; the rest lie with the land)
            assert.equal(Boolean(down.pad), site.kind === "mine", site.id);
        }

        // (A trail to nearly every one, from its road: the way its wagons go)
        assert.ok(trailed >= works.length * 0.8, `${trailed} of ${works.length} with a trail`);

        // (Its pit dug as deep as it's laid out)
        const mine = works.find(({ kind }) => kind === "mine");
        const { pad } = overworld.sites.set.get(mine.id);

        assert.ok(Math.abs(heightAt(world.plan, ...pad.at) - overworld.heightAt(...pad.at) - MINE.pit.drop) < 0.2, "its pit sunk");
    });

    it("plants a lumber mill's trees as the land's are, standing in their squares", () => {
        const mill = works.find(({ kind }) => kind === "lumber mill");
        const down = overworld.sites.set.get(mill.id);
        const trees = [...overworld.sites.trees.values()].flat().filter((tree) => tree.site === mill.id);

        assert.ok(trees.length >= 14, `${trees.length} trees`);

        for (const tree of trees) {
            overworld.chunkAt(Math.round(tree.x), Math.round(tree.y));
            assert.ok(overworld.squares.blocked(Math.round(tree.x), Math.round(tree.y)), `a tree at ${tree.x}, ${tree.y}`);
        }

        assert.ok(down.pieces.every(({ kind }) => kind !== "tree"), "not built as its pieces are");
    });

    it("builds every part of every people's, within a budget; and draws each from afar", () => {
        const most = new Map();

        for (const site of works) {
            const down = overworld.sites.set.get(site.id);
            let triangles = 0;

            for (const piece of down.pieces) {
                const built = trianglesOf(builderOf(piece)(piece));

                assert.ok(built > 0, `${site.id} ${piece.part.part} built`);
                triangles += built;
            }

            most.set(site.kind, Math.max(most.get(site.kind) ?? 0, triangles));

            const shapes = new Shapes();

            siteShapes(shapes, { kind: site.kind, people: site.race, seed: site.seed, x: down.x, z: down.y, facing: down.facing, w: WORKS_SIZE[site.kind][0], h: WORKS_SIZE[site.kind][1], heightOf: () => 0 });
            assert.ok(shapes.positions.length > 0, `${site.id} from afar`);
        }

        for (const [kind, triangles] of most) {
            assert.ok(triangles <= 16000, `${kind}: ${triangles} triangles at most`);
        }
    });
});

describe("each people's works come to life near a player (host.js)", () => {
    const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
    let STEP_MS;
    let Host;
    let HOST_PLAYER;
    let WORKS_OUT;
    let squaresOf;
    let nearestFree;
    let WORKED;
    let OVERRUN;

    before(async () => {
        ({ STEP_MS } = await import("../client/js/core/battle.js"));
        ({ Host, HOST_PLAYER, WORKS_OUT } = await import("../client/js/core/host.js"));
        ({ squaresOf, nearestFree } = await import("../client/js/core/grid.js"));
        ({ WORKED, OVERRUN } = await import("../client/js/core/war/war.js"));
    });

    const run = (host, ms) => {
        const events = [];

        for (let t = 0; t < ms; t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        return events;
    };

    // A world with its player in it, by the yard of a works (the nearest of `people`'s to where
    // they start)
    const atWorks = (people) => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });

        const start = host.world.start.at;
        const works = host.war.works.filter(({ owner }) => owner === people).sort((a, b) => Math.hypot(a.at[0] - start[0], a.at[1] - start[1]) - Math.hypot(b.at[0] - start[0], b.at[1] - start[1]))[0];
        const set = (host.world.maps.town.sites.heartOf(host.world.plan.sites.find(({ id }) => id === works.id)), host.world.maps.town.sites.set.get(works.id));
        const actor = host.battle.actor(HOST_PLAYER);
        const [x, y] = nearestFree(squaresOf(host.world.maps.town), [Math.floor(set.yard[0]), Math.floor(set.yard[1])], { within: 8 });

        Object.assign(actor, { map: "town", square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

        return { host, works, set, actor };
    };

    // Everyone out at a works put down by the player, made too strong to lose
    const putDown = (host, actor, ids) => {
        Object.assign(actor, { hp: 50000, maxHp: 50000 });

        for (const id of ids) {
            const one = host.battle.actor(id);

            if (one) {
                one.hp = 1;
            }
        }

        const events = [];

        for (let k = 0; k < 40 && ids.some((id) => host.battle.actor(id) && !host.battle.actor(id).dead); k++) {
            const next = ids.find((id) => host.battle.actor(id) && !host.battle.actor(id).dead);
            const one = host.battle.actor(next);

            Object.assign(actor, { square: [one.square[0], one.square[1] + 1], x: one.square[0] + 0.5, y: one.square[1] + 1.5, path: [], order: null });
            host.command(HOST_PLAYER, { type: "engage", target: next });
            events.push(...run(host, 3000));
        }

        return events;
    };

    it("brings a works' guards out near a player, of its people, at its posts and on its round; lets them go once the player's far", () => {
        const { host, works, set, actor } = atWorks("human");
        const events = run(host, 1000);
        const out = host.worksOut.get(works.id);
        const guards = host.battle.actors.filter(({ id }) => id.startsWith(`${works.id}/`));

        assert.ok(events.some(({ type, works: id }) => type === "worksOut" && id === works.id));
        assert.equal(guards.length, WORKED.guard);
        assert.equal(guards.filter(({ id }) => id.includes("/guard-")).length, WORKS_OUT.posted);
        assert.ok(guards.every(({ team, kind }) => team === "human" && kind === "soldier"));
        assert.ok(guards.filter(({ id }) => id.includes("/round-")).every(({ patrol }) => patrol.length === set.round.length));
        assert.equal(out.share, 1);
        assert.ok(host.war.watched.has(works.id), "the war leaves it be while the player's there");

        // (Far off: let go)
        Object.assign(actor, { square: [actor.square[0] + 400, actor.square[1]], x: actor.x + 400 });
        run(host, 1000);
        assert.ok(!host.worksOut.has(works.id));
        assert.equal(host.battle.actors.filter(({ id }) => id.startsWith(`${works.id}/`)).length, 0);
    });

    it("has an enemy's works seized by the player's people once its guards are all put down; each one down its guard the fewer", () => {
        const { host, works, actor } = atWorks("orc");

        host.war.relations[["human", "orc"].sort().join("|")] = { state: "hostile", since: 0 };
        host.war.known.push(["human", "orc"].sort().join("|"));
        run(host, 1000);

        const ids = [...host.worksOut.get(works.id).ids];
        const events = putDown(host, actor, ids);

        assert.ok(events.some(({ type, works: id, how, by }) => type === "works" && id === works.id && how === "seized" && by === "human"), "seized");
        assert.equal(works.owner, "human");
        assert.equal(works.guard, OVERRUN.held);

        // (Its new holders' guards out in their place)
        run(host, 1000);
        assert.equal(host.worksOut.get(works.id).people, "human");
    });

    it("has a works overrun by brigands held by them near a player, and cleared for its people once they're all put down", () => {
        const { host, works, actor } = atWorks("human");

        Object.assign(works, { held: true, band: 4, guard: 0 });
        run(host, 1000);

        const out = host.worksOut.get(works.id);

        assert.ok(out?.held && out.ids.length === 4, "the band out");
        assert.ok(out.ids.every((id) => host.wild.get(id)?.works === works.id));

        const events = putDown(host, actor, [...out.ids]);

        assert.ok(events.some(({ type, works: id, how }) => type === "works" && id === works.id && how === "cleared"), "cleared");
        assert.ok(!works.held && works.owner === "human" && works.guard === OVERRUN.held);
    });
});
