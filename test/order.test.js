// The Order of the Bell (core/creatures.js bellInitiate, bellBrother, bellSpearman, bellArcher,
// choirKnight and priorVane; weapons.js NATURAL; beasts/model.js MODELS): Bellhaven's zealots,
// holding its keep and none but them (dungeons/themes.js keep), their ranks rising in strength from
// the initiates in olive to the brothers in white to the Black Choir in black; drawn from one model
// with its parts kept apart, each kind in what it wears (beast.js partsOf, model.js partOf); and
// their Prior in the belfry, his toll warned of on the ground and the Choir called to him as he's
// worn down
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Group, Mesh } from "three";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, traitsOf, WILD } from "../client/js/core/creatures.js";
import { THEMES } from "../client/js/core/dungeons/themes.js";
import { NATURAL } from "../client/js/core/weapons.js";
import { MODELS, partOf } from "../client/js/beasts/model.js";
import { partsOf } from "../client/js/beasts/beast.js";
import { humanoidLook, LOOKS } from "../client/js/beasts/looks.js";
import { REGALIA } from "../client/js/beasts/champions.js";
import { SPOILS } from "../client/js/core/spoils.js";
import { swingOf } from "../client/js/app/game.js";
import { COURT, HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { ORDER } from "../client/js/core/creatures.js";
import { SCENERY, squareIn } from "../client/js/core/scenery.js";
import { GUILD_KINDS, Legends, openerOf, STEPS, THREADS } from "../client/js/core/rare.js";
import { WRITINGS } from "../client/js/core/writings.js";
import { patrolRound, placedOf, standsOn, wayInOf } from "../client/js/core/terrain/scenes.js";
import { squaresOf } from "../client/js/core/grid.js";
import { parseGrid } from "./helpers.js";

const THE_ORDER = ["bellInitiate", "bellBrother", "bellMaceman", "bellSpearman", "bellArcher", "choirKnight", "priorVane"];

// An open field `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

// The Prior in a battle, as the host puts him out, his toll as `change` has it, his rally left out
// unless it's wanted
function prior(battle, square, { hp = 1e5, change = {}, rally = false } = {}) {
    const { weapon, speed, chase, name } = CREATURES.priorVane;
    const traits = traitsOf("priorVane");

    return battle.add({
        id: "prior",
        kind: "beast",
        name,
        weapon,
        team: WILD,
        square,
        ai: "wild",
        hp,
        speed,
        chase,
        armed: true,
        wild: { creature: "priorVane", tier: 9, temper: "aggressive", guard: 0, roam: 0, leash: 60, pack: "prior", leader: null, menace: true, ...traits, moves: traits.moves.map((move) => ({ ...move, ...change })), rally: rally ? traits.rally : null },
    });
}

function play(battle, ms, players = []) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        for (const one of players) {
            one.hp = one.maxHp;
        }

        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

const hero = (battle, id, square) => battle.add({ id, kind: "player", weapon: "sword", team: "hero", square, hp: 1e5 });

// The most a kind's weapon does in one blow, its ways together
const heaviest = (kind) => Math.max(...NATURAL[CREATURES[kind].weapon].attacks.flatMap((attack) => attack.either ?? [attack]).map(({ damage }) => damage[1]));

describe("the Order of the Bell (creatures.js, weapons.js, beasts/model.js)", () => {
    it("holds Bellhaven's keep, and none but them: every floor's packs, its mini-bosses, its wardens, and the Prior its master", () => {
        const keep = THEMES.keep;
        const kinds = new Set([...keep.packs.flatMap(({ creatures }) => creatures), ...keep.minis.map(({ creature }) => creature), ...keep.realms.flatMap(({ warden }) => (warden ? [warden.creature, ...warden.guard] : [])), ...keep.bosses.flatMap(({ creature, guard }) => [creature, ...guard])]);

        assert.deepEqual([...kinds].filter((kind) => !THE_ORDER.includes(kind)), [], "(none but the Order)");
        assert.deepEqual(keep.bosses.map(({ creature, title, guard }) => [creature, title, guard]), [["priorVane", "Prior Osric Vane, the Voice of the Bell", ["choirKnight"]]]);
        assert.deepEqual(
            keep.realms.map(({ warden }) => warden && [warden.title, warden.creature]),
            [["the Castellan of Bellhaven", "choirKnight"], ["the Sub-Prior", "choirKnight"], ["the Lector of the Choir", "choirKnight"], undefined],
        );

        for (const { id } of [...keep.minis, ...keep.bosses]) {
            assert.ok(REGALIA[id], `${id}'s regalia`);
        }

        // (The harder the higher: the Black Choir's knights more of each floor's packs as it rises,
        // the Cloister's packs aside, where the initiates are tried)
        const choir = (realm) => realm.packs.reduce((sum, { creatures, weight }) => sum + (weight * creatures.filter((kind) => kind === "choirKnight").length) / creatures.length, 0) / realm.packs.reduce((sum, { weight }) => sum + weight, 0);
        const [hall, cloister, library, belfry] = keep.realms;

        assert.ok(choir(hall) === 0 && choir(cloister) === 0 && choir(library) > 0 && choir(belfry) > choir(library));
        assert.ok(cloister.packs.some(({ creatures }) => creatures.includes("bellInitiate")));
    });

    it("rises in strength by rank: its initiates, its brothers, the Black Choir, their Prior", () => {
        const ranks = [["bellInitiate"], ["bellBrother", "bellMaceman", "bellSpearman"], ["choirKnight"], ["priorVane"]];

        for (let k = 1; k < ranks.length; k++) {
            for (const lower of ranks[k - 1]) {
                for (const higher of ranks[k]) {
                    assert.ok(CREATURES[higher].hp > CREATURES[lower].hp, `${higher} hardier than ${lower}`);
                    assert.ok(CREATURES[higher].armor > CREATURES[lower].armor || CREATURES[higher].armor === 0.3, `${higher} better armoured than ${lower}`);
                    assert.ok(heaviest(higher) > heaviest(lower), `${higher} hits harder than ${lower}`);
                }
            }
        }

        // (Met only where they hold Bellhaven, never dealt to the wilds; the Choir too heavy to throw)
        assert.ok(THE_ORDER.every((kind) => CREATURES[kind].biomes.length === 0 && CREATURES[kind].hands));
        assert.ok(CREATURES.choirKnight.steady && CREATURES.priorVane.steady && !CREATURES.bellBrother.steady);
        assert.equal(CREATURES.bellArcher.keep, 7, "(a bowman keeps off)");
        assert.ok(THE_ORDER.every((kind) => SPOILS[kind].items.some(({ id }) => id === "bellToken")));
        assert.ok(SPOILS.priorVane.gold[0] > SPOILS.choirKnight.gold[1]);
    });

    it("is drawn from one model, each kind in what its rank wears, a brother's helm one of four by his seed, its Prior from a model of his own; a cleric's alb over mail standing in for it till it's read", () => {
        const ranks = THE_ORDER.filter((kind) => kind !== "priorVane");

        assert.ok(ranks.every((kind) => MODELS[kind].asset === "beast-order"));
        assert.equal(MODELS.priorVane.asset, "beast-prior");
        assert.deepEqual(THE_ORDER.map((kind) => MODELS[kind].skins ?? [""]), [["initiate"], [""], [""], [""], [""], ["choir"], [""]]);
        assert.deepEqual(partsOf("bellInitiate", 7), ["Body", "Head", "Surcoat", "Knife", "KnifeSheath"]);
        assert.equal(partsOf("orcKing", 7), null, "(a model drawn whole)");

        // (One helm each, the same for the same seed, all four among a company of them)
        const helms = new Set();

        for (let seed = 1; seed < 40; seed++) {
            const worn = partsOf("bellBrother", seed);

            assert.deepEqual(worn, partsOf("bellBrother", seed));
            assert.equal(worn.filter((part) => part.startsWith("Helm")).length, 1);
            helms.add(worn.find((part) => part.startsWith("Helm")));
        }

        assert.deepEqual([...helms].sort(), ["HelmBar", "HelmFlat", "HelmPlain", "HelmRidge"]);
        assert.ok(partsOf("choirKnight", 3).includes("HelmCross") && partsOf("choirKnight", 3).includes("MorningStar"));
        // (A mace-brother in white, a morning star and a heater shield, helmed as a brother is)
        assert.ok(["Surcoat", "MorningStar", "HeaterShield"].every((part) => partsOf("bellMaceman", 3).includes(part)) && partsOf("bellMaceman", 3).some((part) => part.startsWith("Helm")));
        // (Each drawn the taller the higher, the Prior a head and more over the heroes' 1.85 metres)
        const tall = (kind) => (MODELS[kind].made.tall * MODELS[kind].length) / MODELS[kind].made.long;

        assert.ok(tall("priorVane") > tall("choirKnight") && tall("choirKnight") > tall("bellBrother"));
        assert.ok(tall("priorVane") > 2.4 && tall("priorVane") < 2.8, `the Prior ${tall("priorVane").toFixed(2)} m`);

        // (Its stand-ins: people in an alb over mail, the Choir in a breastplate besides, an initiate
        // in a jerkin; a bit bigger the higher)
        assert.ok(THE_ORDER.every((kind) => LOOKS[kind].body === "humanoid"));
        assert.ok(humanoidLook("choirKnight", 2).equipment.includes("breastplate") && humanoidLook("bellBrother", 2).equipment.includes("alb"));
        assert.ok(humanoidLook("bellInitiate", 2).equipment.includes("jerkin") && !humanoidLook("bellInitiate", 2).equipment.includes("nasalHelm"));
        assert.ok(LOOKS.priorVane.scale[0] > LOOKS.choirKnight.scale[0] && LOOKS.choirKnight.scale[0] > LOOKS.bellBrother.scale[0]);
    });

    it("knows which part of its model a mesh is, at every level of detail, as three.js names them", () => {
        const part = new Group();
        const lower = new Mesh();
        const primitive = new Mesh();

        part.name = "Plate";
        primitive.name = "Plate_1";
        lower.name = "Platelod1";
        part.add(primitive);

        const unnamed = new Mesh();

        part.add(unnamed);

        assert.deepEqual([partOf(part), partOf(primitive), partOf(lower), partOf(unnamed)], ["Plate", "Plate", "Plate", "Plate"]);
        assert.equal(partOf(Object.assign(new Mesh(), { name: "HelmCrosslod2_3" })), "HelmCross");

        // (A part of several materials whose meshes are named for the mesh they're of, not the
        // part: the horse's body, its coat and its eyes, at its own detail and a lower one)
        for (const [group, meshes] of [["Body", ["SK_Horse_Alone", "SK_Horse_Alone_1"]], ["Bodylod1", ["SK_Horse_Alonelod1", "SK_Horse_Alonelod1_1"]]]) {
            const body = Object.assign(new Group(), { name: group });

            body.add(...meshes.map((name) => Object.assign(new Mesh(), { name })));
            assert.deepEqual(body.children.map(partOf), ["Body", "Body"]);
        }

        // (But a mesh at the model's top, beside its bones, its own)
        const scene = Object.assign(new Group(), { name: "Scene" });
        const mane = Object.assign(new Mesh(), { name: "ManeLight" });

        scene.add(new Group(), mane);
        assert.equal(partOf(mane), "ManeLight");
    });

    it("strikes each blow when its clip lands it, inside its clip's span; a spear reaching further, a bow loosing as it's drawn, the Choir crushing", () => {
        for (const kind of THE_ORDER) {
            const model = MODELS[kind];

            for (const attack of NATURAL[CREATURES[kind].weapon].attacks.flatMap((one) => one.either ?? [one])) {
                const span = model.spans[attack.animation];
                const chain = model.chains?.[attack.animation];
                const length = span ? span[1] - span[0] : chain.reduce((sum, { from, to }) => sum + to - from, 0);

                assert.ok(model.specials[attack.animation] || chain, `${kind} ${attack.id}`);
                assert.equal(Math.round(length * 1000), attack.duration, `${kind} ${attack.id}: its clip played at its own speed`);

                for (const at of attack.blows?.map((blow) => blow.at) ?? [attack.hitAt]) {
                    assert.ok(at > 0 && at < attack.duration, `${kind} ${attack.id} at ${at}`);
                }
            }
        }

        assert.ok(NATURAL.bellSpear.attacks[0].reach > NATURAL.bellSword.attacks[0].reach);
        assert.deepEqual(NATURAL.bellBow.attacks.map(({ kind, animation, hitAt }) => [kind, animation, hitAt]), [["ranged", "shoot", 1200]], "(the arrow away 0.2 seconds into the shot, after a second's draw)");
        assert.ok(NATURAL.choirMace.attacks[0].either.every(({ reaction }) => reaction === "crush"));
        assert.ok(NATURAL.bellSword.attacks[0].either.find(({ id }) => id === "bash").blows.some(({ toss }) => toss), "(the shield throws)");
    });

    it("has its stand-ins swing what they hold for a way of its model's own", () => {
        assert.equal(swingOf("cut", "bellSword"), "sword");
        assert.equal(swingOf("thrust", "bellSpear"), "staff");
        assert.equal(swingOf("shoot", "bellBow"), "bow");
        assert.equal(swingOf("cut", "choirMace"), "hammer");
        assert.equal(swingOf("cut", "bellKnife"), "cleaver");
        assert.equal(swingOf("sword", "sword"), "sword", "(a character's own motion as it is)");
    });

    it("tolls (the Prior): his shield driven down, warned of on the ground all round him first, whoever's close hurt and thrown, none further off", () => {
        const battle = new Battle(field(40), { seed: 4 });
        const near = hero(battle, "near", [20, 22]);
        const far = hero(battle, "far", [20, 30]);
        const me = prior(battle, [20, 20], { change: { first: 0 } });
        const [toll] = CREATURES.priorVane.moves;
        const events = play(battle, toll.hitAt + 400, [near, far]);
        const started = events.find(({ type, attack }) => type === "attack" && attack === "toll");
        const telegraph = events.find(({ type }) => type === "telegraph");

        assert.ok(started && telegraph, events.map(({ type }) => type).join(", "));
        assert.equal(telegraph.radius, toll.quake.radius);
        assert.ok(Math.hypot(telegraph.x - me.x, telegraph.y - me.y) < 0.5, "(all round him)");
        assert.ok(events.some(({ type, kind }) => type === "blast" && kind === "bellToll"));
        assert.ok(events.some(({ type, id, by, attack }) => type === "hit" && id === "near" && by === "prior" && attack === "bellToll"));
        assert.ok(!events.some(({ type, id, by, attack }) => type === "hit" && id === "far" && by === "prior" && attack === "bellToll"), "(not further off)");
    });

    it("cries out to the Bell as he's worn down, once at two thirds and once at one third: the Black Choir answers, told in his own words", () => {
        const battle = new Battle(field(40), { seed: 6 });
        const me = hero(battle, "me", [22, 20]);
        const him = prior(battle, [20, 20], { hp: 900, change: { first: 1e9 }, rally: true });
        let events = play(battle, 3000, [me]);

        assert.ok(!events.some(({ type }) => type === "call"), "none while he's whole");

        him.hp = 590;
        events = play(battle, 6000, [me]);
        assert.deepEqual(
            events.filter(({ type }) => type === "call").map(({ kind, told }) => [kind, told]),
            [["choirKnight", CREATURES.priorVane.rally[0].call.told]],
        );
        assert.ok(events.some(({ type, attack, animation }) => type === "attack" && attack === "rally" && animation === "rally"));

        him.hp = 250;
        events = play(battle, 6000, [me]);
        assert.deepEqual(
            events.filter(({ type }) => type === "call").map(({ kind, told }) => [kind, told]),
            [["choirKnight", CREATURES.priorVane.rally[1].call.told]],
        );
    });
});

// --- Bellhaven's court, held by the Order (host.js #holdCourt, #crossOrder; core/scenery.js `court`) ---

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const put = (actor, [x, y], map = actor.map) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

function run(host, ms, players = []) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        for (const one of players) {
            one.hp = one.maxHp;
        }

        events.push(...host.advance(STEP_MS));
    }

    return events;
}

// A host with two players in a party (Ada and Bea) and a third (Cy) not, Bellhaven's castle made,
// and Ada gone in over its bridge's foot
function inTheCastle() {
    const world = buildWorld({ seed: 1 });
    const host = new Host(world, { populate: false });
    const building = world.interiors.buildings.get(`site:${world.plan.sites.find(({ scenery }) => scenery === "bellhaven").id}`);

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.join({ id: "bea", hero: { ...HERO, name: "Bea" } });
    host.join({ id: "cy", hero: { ...HERO, name: "Cy" } });
    host.command(HOST_PLAYER, { type: "party", do: "invite", who: "bea" });
    host.command("bea", { type: "party", do: "accept" });

    const [ada, bea, cy] = [HOST_PLAYER, "bea", "cy"].map((id) => Object.assign(host.battle.actor(id), { hp: 1e6, maxHp: 1e6 }));

    put(ada, building.door.ends[0].arrive, "town");
    host.command(HOST_PLAYER, { type: "enter", link: building.door.id });

    for (let t = 0; t < 30000 && ada.map === "town"; t += 250) {
        run(host, 250, [ada, bea, cy]);
    }

    return { host, building, ada, bea, cy, grounds: building.maps[0] };
}

describe("Bellhaven's court, held by the Order of the Bell (host.js, core/scenery.js)", () => {
    it("is held while anyone's in the castle: one of the Order at each of its posts, on its floor, setting on no one who hasn't crossed it", () => {
        const { host, building, ada, grounds } = inTheCastle();
        const court = host.courts.get(building.key);
        const posted = court.ids.map((id) => host.battle.actor(id));

        assert.equal(ada.map, grounds);
        assert.equal(posted.length, SCENERY.bellhaven.court.posts.length);
        assert.deepEqual(posted.map((one) => host.wild.get(one.id).creature), SCENERY.bellhaven.court.posts.map(([kind]) => kind));
        assert.ok(posted.every((one) => one.team === ORDER && one.map === grounds && !one.dead && host.wild.get(one.id).court === building.key));

        // (Each by its post)
        for (const [k, [, at]] of SCENERY.bellhaven.court.posts.entries()) {
            const [x, y] = squareIn("bellhaven", at);

            assert.ok(Math.hypot(posted[k].square[0] - x, posted[k].square[1] - y) <= 2, `post ${k}`);
        }

        assert.ok(posted.every((one) => !host.battle.hostile(one, ada)), "(no one's enemy till crossed)");
        assert.ok(host.canFight(ada, posted[0]), "(but they can be struck)");

        // (Not let go as the wild's creatures are, far from the world's players)
        run(host, 20000, [ada]);
        assert.ok(court.ids.every((id) => host.battle.actor(id) && !host.battle.actor(id).dead));
    });

    it("warns off one who lingers by them, no oftener than every so often", () => {
        const { host, building, ada } = inTheCastle();
        const [first] = host.courts.get(building.key).ids.map((id) => host.battle.actor(id));

        put(ada, [first.square[0], first.square[1] + 2]);

        const events = run(host, COURT.every + 2000, [ada]);
        const warned = events.filter(({ type, change }) => type === "order" && change === "warn");

        assert.ok(warned.length >= 1 && warned.length <= 2, `${warned.length}`);
        assert.equal(warned[0].player, HOST_PLAYER);
        assert.ok(SCENERY.bellhaven.court.warnings.includes(warned[0].words));
        assert.equal(host.legends.marked(HOST_PLAYER, "order"), false);
    });

    it("is crossed by one who strikes a brother: marked so in the world, the court against them and their party, not the rest; and as it's let go and held again, still", () => {
        const { host, building, ada, bea, cy } = inTheCastle();
        const posted = host.courts.get(building.key).ids.map((id) => host.battle.actor(id));
        const brother = posted.find((one) => host.wild.get(one.id).creature === "bellBrother");

        put(ada, [brother.square[0], brother.square[1] + 1]);
        host.command(HOST_PLAYER, { type: "engage", target: brother.id });

        const events = run(host, 4000, [ada]);
        const crossed = events.find(({ type, change }) => type === "order" && change === "crossed");

        assert.ok(crossed, events.filter(({ type }) => type === "hit").length + " hits");
        assert.equal(crossed.player, HOST_PLAYER);
        assert.ok(SCENERY.bellhaven.court.crossed.includes(crossed.words));
        assert.ok(host.legends.marked(HOST_PLAYER, "order"));
        assert.ok(posted.filter((one) => !one.dead).every((one) => host.battle.hostile(one, ada) && host.battle.hostile(one, bea)), "(against them and their party)");
        assert.ok(posted.every((one) => !host.battle.hostile(one, cy)), "(not the rest)");
        assert.ok(posted.some((one) => one.target === HOST_PLAYER), "(and set on them)");

        // (Kept in the world's legends, and its snapshot)
        assert.deepEqual(JSON.parse(JSON.stringify(host.legends)).marks, { [HOST_PLAYER]: ["order"] });
    });

    it("is crossed by going into its keep", () => {
        const { host, building, ada } = inTheCastle();
        const keep = host.world.interiors.buildings.get(`${building.key}-keep`);

        assert.ok(keep, "(its keep)");
        put(ada, squareIn("bellhaven", [-0.5, -138.5]));
        host.command(HOST_PLAYER, { type: "enter", link: keep.door.id });

        let crossed = false;

        for (let t = 0; t < 30000 && !crossed; t += 250) {
            crossed = run(host, 250, [ada]).some(({ type, change, player }) => type === "order" && change === "crossed" && player === HOST_PLAYER);
        }

        assert.ok(crossed && host.legends.marked(HOST_PLAYER, "order"));
    });

    it("is sworn against whoever brought its Prior down, and their party: set on them wherever it sees them, past its posts' guard, without a word of warning; the rest let be", () => {
        const { host, building, ada, bea, cy } = inTheCastle();
        const posted = host.courts.get(building.key).ids.map((id) => host.battle.actor(id));
        const brother = posted.find((one) => host.wild.get(one.id).creature === "bellBrother");
        const off = [brother.square[0], brother.square[1] + COURT.guard + 3];

        // (Crossed, not sworn: let be past its guard)
        host.legends.mark(HOST_PLAYER, "order");
        put(ada, off);
        run(host, 3000, [ada]);
        assert.ok(posted.every((one) => one.target !== HOST_PLAYER), "(crossed: only within its guard)");

        // (Sworn, as the Prior's felled: #priorFell)
        host.legends.mark(HOST_PLAYER, "sworn");
        put(ada, off);

        const events = run(host, 3000, [ada]);

        assert.ok(posted.some((one) => one.target === HOST_PLAYER), "(set on her past its guard)");
        assert.ok(!events.some(({ type, change }) => type === "order" && change === "warn"), "(no warning)");

        // (Her party too; not the rest)
        put(ada, [ada.square[0] + 300, ada.square[1]], "town");
        put(bea, off, posted[0].map);
        put(cy, [off[0] + 1, off[1]], posted[0].map);

        for (const one of posted) {
            Object.assign(one, { target: null });
        }

        run(host, 3000, [bea, cy]);
        assert.ok(posted.some((one) => one.target === "bea"));
        assert.ok(posted.every((one) => one.target !== "cy"));
    });

    it("tolls its Great Bell as its keep's made again after its Prior's fallen: heard by everyone, he walks again", () => {
        const { host, building, ada } = inTheCastle();
        const keep = host.world.interiors.buildings.get(`${building.key}-keep`);

        put(ada, squareIn("bellhaven", [-0.5, -138.5]));
        host.command(HOST_PLAYER, { type: "enter", link: keep.door.id });

        for (let t = 0; t < 30000 && !keep.maps.includes(ada.map); t += 250) {
            run(host, 250, [ada]);
        }

        const delve = host.dungeons.get(keep.site);
        const generation = keep.generation ?? 0;

        assert.ok(delve, "(its keep gone into)");

        // (Its hoard opened, its Prior felled: #delveFell; and everyone gone)
        Object.assign(delve, { cleared: true, masterFell: true });
        put(ada, [ada.square[0] + 400, ada.square[1]], "town");

        let tolls = null;

        for (let t = 0; t < 30000 && !tolls; t += 250) {
            tolls = run(host, 250, [ada]).find(({ type, change }) => type === "order" && change === "tolls") ?? null;
        }

        assert.ok(tolls, "(the bell tolls)");
        assert.equal(tolls.words, SCENERY.bellhaven.court.tolls);
        assert.equal(keep.generation, generation + 1, "(made again)");
        assert.equal(delve.masterFell, false);

        // (Made again with no Prior fallen in it: not)
        Object.assign(delve, { cleared: true });

        const quiet = run(host, 5000, [ada]);

        assert.ok(!quiet.some(({ type, change }) => type === "order" && change === "tolls"));
    });

    it("is let go when everyone's left the castle, its brothers gone from the battle", () => {
        const { host, building, ada } = inTheCastle();
        const ids = [...host.courts.get(building.key).ids];

        host.command(HOST_PLAYER, { type: "enter", link: building.door.id, run: true });

        for (let t = 0; t < 60000 && ada.map !== "town"; t += 250) {
            run(host, 250, [ada]);
        }

        // (And well away from its way in, where it's let go)
        put(ada, [ada.square[0] + 300, ada.square[1]]);

        for (let t = 0; t < 30000 && host.courts.has(building.key); t += 250) {
            run(host, 250, [ada]);
        }

        assert.equal(host.courts.has(building.key), false);
        assert.ok(ids.every((id) => !host.battle.actor(id) && !host.wild.has(id)));
    });
});

// Inside a building of a settlement's (`kind`: "church"...), laid out as it'd be as the world
// near it's made, gone in by its door
function into(host, kind, place) {
    host.world.maps.town.settlements.of(host.world.plan.places.find(({ id }) => id === place));

    const building = [...host.world.interiors.buildings.values()].find((one) => one.kind === kind && one.place === place);
    const me = host.battle.actor(HOST_PLAYER);

    put(me, building.door.ends[0].squares[0], "town");
    // (Up on their feet first, if a blow's knocked them off them)
    run(host, Math.max(0, (me.downUntil ?? 0) - host.battle.time) + STEP_MS, [me]);

    const entered = host.command(HOST_PLAYER, { type: "enter", link: building.door.id });

    assert.equal(entered.ok, true, JSON.stringify(entered));
    run(host, STEP_MS * 4, [me]);

    return building;
}

// Talking to one of a building's folk (`folk`: its record), stood before them
function talkTo(host, folk) {
    const me = host.battle.actor(HOST_PLAYER);
    const them = host.battle.actor(folk.id);

    put(me, [them.square[0], them.square[1] + 1], them.map);

    return host.command(HOST_PLAYER, { type: "talk", with: them.id }).ok;
}

// A foe felled by `actor`, beside it, kept alive the while
function felled(host, actor, id) {
    const foe = host.battle.actor(id);
    const events = [];

    put(actor, foe.square.map((v, k) => v + (k ? 0 : 1)), foe.map);
    Object.assign(foe, { hp: 1 });
    Object.assign(actor, { power: { melee: 1e4, ranged: 1e4 } });
    host.command(actor.id, { type: "engage", target: id });

    for (let t = 0; t < 8000 && !foe.dead; t += 250) {
        events.push(...run(host, 250, [actor]));
    }

    return [...events, ...run(host, 500, [actor])];
}

describe("the Bell Tolls Again (rare.js THREADS bellhaven, writings.js)", () => {
    it("is the Order's thread: begun by a temple priest's rumour near Bellhaven, its courts' warning or the Bellbound's end; no card in it; its cleansers fought, the Prior's writ taken to the priest, the keep gone into, the Prior struck down there, and word taken back", () => {
        const thread = THREADS.bellhaven;

        assert.deepEqual(thread.steps.map(({ kind }) => kind), ["fight", "talk", "enter", "slay", "talk"]);
        assert.deepEqual([thread.opens.kind, thread.opens.role, thread.opens.post, thread.opens.near], ["talk", "priest", "temple", "bellhaven"]);
        assert.ok(thread.steps[0].foes.every(({ creature }) => THE_ORDER.includes(creature)));
        assert.deepEqual([thread.steps[0].reward.writing, thread.steps[3].reward.writing], ["writ", "bell"]);
        assert.ok(WRITINGS.writ.entries.at(-1).signed.includes("Osric Vane") && WRITINGS.bell.entries.some(({ heading }) => heading === "From the Rule of the Order"));
        assert.deepEqual([thread.steps[2].theme, thread.steps[3].theme], ["keep", "keep"]);
        assert.ok(STEPS.includes("slay"));
        assert.equal(THREADS.bellbound.then, "bellhaven");
        assert.equal(SCENERY.bellhaven.court.thread, "bellhaven");

        // (Its rumour told with no card in play for it)
        assert.ok(new Legends(null, { cards: {} }).opening("bellhaven"));
        assert.equal(new Legends(null, { cards: {} }).opening("harrowstone"), false, "(a card's thread: not without its card)");
    });

    it("is begun by the Order's warning in Bellhaven's courts, and followed to its end: the cleansers driven off, the writ read out, the keep gone into, the Prior felled in his belfry, the priest told", () => {
        const { host, building, ada } = inTheCastle();
        const plan = host.world.plan;
        const opener = openerOf(plan, "bellhaven");
        const castle = plan.sites.find(({ id }) => id === building.site);
        const keepId = `${castle.id}-keep`;
        const given = (events, gold, writing = null) => events.some(({ type, change, id, gold: purse, writing: kept }) => type === "thread" && change === "given" && id === HOST_PLAYER && purse === gold && (kept ?? null) === writing);

        assert.ok(opener && GUILD_KINDS.includes(opener.town.kind));

        // Warned in the court: begun, its home the priest's town nearest Bellhaven
        const [first] = host.courts.get(building.key).ids.map((id) => host.battle.actor(id));

        put(ada, [first.square[0], first.square[1] + 2]);

        const begun = run(host, 3000, [ada]).find(({ type, change }) => type === "thread" && change === "begun");
        const thread = host.legends.threads.bellhaven;

        assert.ok(begun && begun.thread === "bellhaven" && begun.ids.includes(HOST_PLAYER));
        assert.deepEqual([thread.step, thread.home, thread.at], [0, opener.town.id, [...castle.at]]);

        const off = Math.hypot(thread.place[0] - castle.at[0], thread.place[1] - castle.at[1]);

        assert.ok(off >= 160 && off <= 240, `${off}`);

        // The cleansers: out as she comes, Brother Anselm among them; all fallen, the writ hers
        put(ada, thread.place.map(Math.floor), "town");
        run(host, 1500, [ada]);
        assert.ok(thread.foes?.length >= 5);
        assert.ok(thread.foes.some((id) => host.battle.actor(id).name === "Brother Anselm the Cleanser"));

        for (const id of thread.foes) {
            host.battle.afflict(id, "poison", { by: HOST_PLAYER, damage: 1e7 });
        }

        const fought = run(host, 2000, [ada]);

        assert.equal(thread.step, 1);
        assert.ok(given(fought, 60, "writ"));

        // The writ to the priest: read out, Bellhaven shown on everyone's maps
        assert.equal(thread.town, opener.town.id);

        const temple = into(host, "church", opener.town.id);

        assert.ok(talkTo(host, temple.folk.find((one) => one.role === "priest")));
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "bellhaven", step: 1 } }).ok, true);
        host.command(HOST_PLAYER, { type: "talk", with: null });
        assert.equal(thread.step, 2);
        assert.ok(host.legends.lasting().some(({ kind, site }) => kind === "reveal" && site === castle.id));

        // The keep: its way in marked, gone into from the court (the Order crossed so)
        assert.deepEqual([thread.site, thread.place], [keepId, [...castle.at]]);
        put(ada, building.door.ends[0].arrive, "town");
        host.command(HOST_PLAYER, { type: "enter", link: building.door.id });

        for (let t = 0; t < 30000 && ada.map === "town"; t += 250) {
            run(host, 250, [ada]);
        }

        const keep = host.world.interiors.buildings.get(`${building.key}-keep`);

        put(ada, squareIn("bellhaven", [-0.5, -138.5]));
        host.command(HOST_PLAYER, { type: "enter", link: keep.door.id });

        for (let t = 0; t < 30000 && thread.step === 2; t += 250) {
            run(host, 250, [ada]);
        }

        assert.equal(thread.step, 3);
        assert.ok(host.legends.marked(HOST_PLAYER, "order"));
        assert.deepEqual([thread.site, thread.place], [keepId, [...castle.at]]);

        // The belfry: the Prior, its master, felled; his book hers, and a purse
        const top = keep.maps.at(-1);
        const stairs = host.battle.links.find(({ ends }) => ends.some(({ map }) => map === top));

        put(ada, stairs.ends.find(({ map }) => map === top).arrive, top);
        run(host, 1500, [ada]);

        const [prior] = [...host.wild].find(([, beast]) => beast.dungeon === keepId && beast.champion === "boss") ?? [];

        assert.equal(host.wild.get(prior)?.creature, "priorVane");

        const slain = felled(host, ada, prior);

        assert.equal(thread.step, 4);
        assert.ok(given(slain, 150, "bell"));

        // (The Great Bell's one low note: he'll walk again, and the Order's sworn against her and
        // her party: #priorFell)
        const fallen = slain.find(({ type, change }) => type === "order" && change === "fallen");

        assert.ok(fallen && fallen.players.includes(HOST_PLAYER));
        assert.equal(fallen.words, SCENERY.bellhaven.court.fallen);
        assert.ok(host.legends.marked(HOST_PLAYER, "sworn") && host.legends.marked(HOST_PLAYER, "order"));

        // Word taken back to the priest: its end, a festival in the town
        const again = into(host, "church", opener.town.id);

        assert.ok(talkTo(host, again.folk.find((one) => one.role === "priest")));
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "bellhaven", step: 4 } }).ok, true);
        assert.ok(thread.done);
        assert.ok(host.legends.lasting().some(({ kind, name, town }) => kind === "festival" && name === "the Feast of the Silent Bell" && town === opener.town.id));
    });

    it("is begun by the priest's rumour, and, it not begun, as the Bellbound's word's taken back to the rogue", () => {
        const { host } = inTheCastle();
        const plan = host.world.plan;
        const opener = openerOf(plan, "bellhaven");
        const temple = into(host, "church", opener.town.id);

        assert.ok(host.legends.opening("bellhaven"));
        assert.ok(talkTo(host, temple.folk.find((one) => one.role === "priest")));
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { thread: "bellhaven", step: null } }).ok, true);
        assert.deepEqual([host.legends.threads.bellhaven.step, host.legends.threads.bellhaven.home], [0, opener.town.id]);

        // (Another world: the Bellbound at its last step, word taken back to its rogue)
        const { host: other } = inTheCastle();
        const bellbound = openerOf(other.world.plan, "bellbound");

        other.legends.begin("bellbound", { at: bellbound.town.at, ids: [HOST_PLAYER], home: bellbound.town.id });
        Object.assign(other.legends.threads.bellbound, { step: 2, town: bellbound.town.id });

        const guild = into(other, "guild", bellbound.town.id);
        const rogue = guild.folk.find((one) => (one.role === "adventurer" || one.talk === "adventurer") && one.look === "rogue");

        assert.ok(talkTo(other, rogue));
        assert.equal(other.command(HOST_PLAYER, { type: "effect", effect: { thread: "bellbound", step: 2 } }).ok, true);
        assert.ok(other.legends.threads.bellbound.done);
        assert.deepEqual([other.legends.threads.bellhaven?.step, other.legends.threads.bellhaven?.home], [0, openerOf(other.world.plan, "bellhaven").town.id]);
    });
});

// A host with Ada (and Bea in her party) out in the world `off` metres east of Bellhaven
function nearBellhaven(off) {
    const world = buildWorld({ seed: 1 });
    const host = new Host(world, { populate: false });
    const site = world.plan.sites.find(({ scenery }) => scenery === "bellhaven");

    host.join({ id: HOST_PLAYER, hero: HERO });

    const ada = Object.assign(host.battle.actor(HOST_PLAYER), { hp: 1e6, maxHp: 1e6 });

    put(ada, [Math.floor(site.at[0] + off), Math.floor(site.at[1])], "town");

    return { host, site, ada };
}

describe("Bellhaven's patrols, the Order of the Bell's riders (host.js, core/scenery.js, terrain/scenes.js)", () => {
    it("rides quite strong: a brother or a knight of the Black Choir on a barded warhorse, harder than the Choir on foot, riding down whoever keeps off", () => {
        for (const kind of ["bellRider", "choirRider"]) {
            const spec = CREATURES[kind];

            assert.ok(spec.hp > CREATURES.choirKnight.hp && spec.armor >= CREATURES.choirKnight.armor && spec.steady, kind);
            assert.ok(heaviest(kind) > heaviest("choirKnight"), kind);
            assert.ok(spec.chase > CREATURES.choirKnight.chase * 2, `${kind}: a gallop`);
            assert.deepEqual(spec.moves.map(({ id, leap, quake }) => [id, Boolean(leap), quake.kind]), [["charge", true, "trample"]]);
            assert.equal(MODELS[kind].asset, "beast-order-mounted");
            assert.ok(MODELS[kind].parts.includes("Horse") && SPOILS[kind]);
            assert.equal(LOOKS[kind].body, "quadruped", "(a warhorse stands in for it till it's read)");
        }

        assert.ok(CREATURES.choirRider.hp > CREATURES.bellRider.hp && heaviest("choirRider") > heaviest("bellRider"));
        assert.deepEqual(MODELS.choirRider.skins, ["choir"]);
        assert.deepEqual([MODELS.bellRider.clips.walk, MODELS.bellRider.clips.run], ["Mount Trot", "Mount Gallop"]);
    });

    it("rides rounds round the castle, out past where it stands, the first from its road's end, on open ground", () => {
        const world = buildWorld({ seed: 1 });
        const site = world.plan.sites.find(({ scenery }) => scenery === "bellhaven");
        const placed = placedOf(site);
        const squares = squaresOf(world.maps.town);
        const { patrols } = SCENERY.bellhaven;
        const [first, second] = [0, 1].map((k) => patrolRound(placed, patrols, k, (x, y) => squares.blocked(x, y)));

        assert.deepEqual(first[0], wayInOf(placed).outside);

        for (const round of [first, second]) {
            assert.equal(round.length, patrols.stops);
            assert.ok(round.every(([x, y]) => !standsOn(placed, x, y) && !squares.blocked(x, y)));
            assert.ok(round.every(([x, y]) => Math.hypot(x - site.at[0], y - site.at[1]) < 400));
        }

        // (The second from the far side)
        assert.ok(Math.hypot(second[0][0] - first[0][0], second[0][1] - first[0][1]) > 250);
    });

    it("rides out as a player comes near, on the Order's side, setting on no one who hasn't crossed it; on those who have; and goes once everyone's far off", () => {
        const { host, site, ada } = nearBellhaven(300);

        run(host, 1000, [ada]);

        const out = host.patrols.get(site.id);
        const riders = out.ids.map((id) => host.battle.actor(id));

        assert.deepEqual(riders.map((one) => host.wild.get(one.id).creature), ["choirRider", "bellRider", "bellRider", "bellRider"]);
        assert.ok(riders.every((one) => one.team === ORDER && one.wild.round.length === SCENERY.bellhaven.patrols.stops && host.wild.get(one.id).patrol === site.id));
        assert.ok(riders.every((one) => !host.battle.hostile(one, ada)));

        // (On their rounds)
        const from = riders.map((one) => [...one.square]);

        run(host, 30000, [ada]);
        assert.ok(riders.some((one, k) => Math.hypot(one.square[0] - from[k][0], one.square[1] - from[k][1]) > 20));

        // (Against one who's crossed the Order)
        host.legends.mark(HOST_PLAYER, "order");
        assert.ok(riders.every((one) => host.battle.hostile(one, ada)));

        // (Gone once everyone's far off)
        put(ada, [Math.floor(site.at[0] + 900), Math.floor(site.at[1])]);
        run(host, 1000, [ada]);
        assert.equal(host.patrols.has(site.id), false);
        assert.ok(out.ids.every((id) => !host.battle.actor(id) && !host.wild.has(id)));
    });

    it("is crossed by one who strikes a rider", () => {
        const { host, site, ada } = nearBellhaven(300);

        run(host, 1000, [ada]);

        const [rider] = host.patrols.get(site.id).ids.map((id) => host.battle.actor(id));

        put(ada, [rider.square[0] + 1, rider.square[1]]);
        host.command(HOST_PLAYER, { type: "engage", target: rider.id });

        let crossed = false;

        for (let t = 0; t < 8000 && !crossed; t += 250) {
            crossed = run(host, 250, [ada]).some(({ type, change, player }) => type === "order" && change === "crossed" && player === HOST_PLAYER);
        }

        assert.ok(crossed && host.legends.marked(HOST_PLAYER, "order"));
    });
});
