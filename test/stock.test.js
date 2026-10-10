// The shops' stock (client/js/core/stock.js, with core/progress.js SHOPS and core/host.js;
// docs/WAR.md *Shops*): a specialist's and a master's new assortment each day and their daily
// special, as many of each as there are for everyone who plays together; a blacksmith's as well
// made as the player's mighty; what each shop buys
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { dayOf, elapsedOf } from "../client/js/core/daytime.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { buys, gradeOf, HAGGLE_CAP, ITEMS, priceOf, Progress, QUALITIES, SELL_SHARE, SHOPS, SMITH_MAKES, wares } from "../client/js/core/progress.js";
import { dailyStock, SPECIAL_MARKUP, shopPrice, stockKey } from "../client/js/core/stock.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const DAILY = Object.keys(SHOPS).filter((shop) => SHOPS[shop].daily);
const makes = Object.keys(QUALITIES);

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world with its player in it, rich, by the home tavern's barkeep, who for the test keeps a
// shop of another kind (`shop`)
function atShop(shop, progress = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold: 100000, gear: { mainHand: { id: HERO.weapon } }, ...progress } });
    host.populate();

    const keeper = host.battle.actor(host.world.folk.find(({ role }) => role === "barkeep").id);

    host.folk.get(keeper.id).shop = shop;
    put(host.battle.actor(HOST_PLAYER), keeper.map, [keeper.square[0], keeper.square[1] + 1]);

    return { host, keeper };
}

describe("a shop's daily stock (stock.js)", () => {
    it("has the specialists and the masters keep a daily stock, a blacksmith not", () => {
        assert.deepEqual(DAILY, ["swordsmith", "armorer", "scriptorium", "alchemist", "masterSwordsmith", "masterArmorer", "emporium"]);
        assert.equal(dailyStock("smith"), null);
        assert.equal(dailyStock("guild"), null);
    });

    it("is the same for the same world, shop and day, and another assortment the next day or another shop", () => {
        for (const shop of DAILY) {
            const today = dailyStock(shop, { seed: 2, key: "town-1/shop", day: 3 });

            assert.deepEqual(dailyStock(shop, { seed: 2, key: "town-1/shop", day: 3 }), today, shop);
            assert.notDeepEqual(dailyStock(shop, { seed: 2, key: "town-1/shop", day: 4 }), today, `${shop} the next day`);
            assert.notDeepEqual(dailyStock(shop, { seed: 2, key: "town-2/shop", day: 3 }), today, `${shop} in another town`);
            assert.notDeepEqual(dailyStock(shop, { seed: 3, key: "town-1/shop", day: 3 }), today, `${shop} in another world`);
        }
    });

    it("has in what the shop deals in, as well made or as rare as it keeps, so many of each; and a special of the rarest (or one it has in as if it were)", () => {
        for (const shop of DAILY) {
            const { items, daily } = SHOPS[shop];

            for (let day = 0; day < 20; day++) {
                const { wares: shelves, special } = dailyStock(shop, { seed: 5, key: "a/b", day });

                assert.equal(shelves.length, daily.picks, `${shop} day ${day}: ${shelves.length} things`);

                for (const ware of shelves) {
                    assert.ok(items.includes(ware.id), `${shop} keeps ${ware.id}`);
                    assert.ok(daily.grades[gradeOf(ware)] > 0, `${shop}: ${ware.id} ${gradeOf(ware)}`);
                    assert.ok(ware.count >= daily.count[0] && ware.count <= daily.count[1]);
                }

                // (A piece of gear in two makes at most; nothing twice alike)
                assert.equal(new Set(shelves.map(({ id, quality }) => `${id}|${quality}`)).size, shelves.length);
                assert.ok(shelves.every(({ id }) => shelves.filter((ware) => ware.id === id).length <= 2));

                assert.ok(items.includes(special.id), `${shop}'s special ${special.id}`);
                assert.ok(daily.special[gradeOf(special)] > 0 || daily.specials?.includes(special.id), `${shop}'s special ${special.id} ${gradeOf(special)}`);
            }
        }
    });

    it("has the specialists' wares better made than a blacksmith's best for the mightiest, and the masters' better still", () => {
        const best = (shop) => Math.max(...Array.from({ length: 30 }, (_, day) => dailyStock(shop, { seed: 1, key: "x", day }).wares.map((ware) => makes.indexOf(gradeOf(ware)))).flat());
        const least = (shop) => Math.min(...Array.from({ length: 30 }, (_, day) => dailyStock(shop, { seed: 1, key: "x", day }).wares.filter(({ id }) => ITEMS[id].slot).map((ware) => makes.indexOf(gradeOf(ware)))).flat());

        assert.equal(makes[Math.max(...SMITH_MAKES.flat().map((make) => makes.indexOf(make)))], "masterwork");

        for (const shop of ["swordsmith", "armorer"]) {
            assert.ok(best(shop) > makes.indexOf("masterwork"), `${shop}: rare and better`);
            assert.ok(least(shop) >= makes.indexOf("fine"), `${shop}: nothing common`);
        }

        for (const shop of ["masterSwordsmith", "masterArmorer", "emporium"]) {
            assert.ok(least(shop) >= makes.indexOf("rare"), `${shop}: rare at least`);
            assert.equal(best(shop), makes.indexOf("legendary"), `${shop}: legendary`);
            assert.equal(gradeOf(dailyStock(shop, { seed: 1, key: "x", day: 2 }).special), "legendary");
        }
    });

    it("always has a sword at a swordsmith's", () => {
        for (let day = 0; day < 20; day++) {
            assert.ok(dailyStock("swordsmith", { seed: 7, key: "k", day }).wares.some(({ id }) => id === "sword"));
            assert.ok(dailyStock("masterSwordsmith", { seed: 7, key: "k", day }).wares.some(({ id }) => id === "sword"));
        }
    });

    it("asks twice the price at a master's shop, and a quarter more again for a daily special", () => {
        const sword = { id: "sword", quality: "rare" };

        assert.equal(shopPrice(sword, "swordsmith"), priceOf(sword));
        assert.equal(shopPrice(sword, "masterSwordsmith"), priceOf(sword) * 2);
        assert.equal(shopPrice(sword, "masterSwordsmith", { special: true }), Math.round(priceOf(sword) * 2 * SPECIAL_MARKUP));
        assert.equal(shopPrice(sword, "swordsmith", { haggle: 0.1 }), priceOf(sword, { haggle: 0.1 }));
    });

    it("keeps a shop's stock by the building it's kept in, the same for each who keeps it", () => {
        assert.equal(stockKey("town-3/smithy-2/smith"), "town-3/smithy-2");
        assert.equal(stockKey("town-3/smithy-2/apprentice"), "town-3/smithy-2");
        assert.equal(stockKey("keeper"), "keeper");
    });
});

describe("haggling, as far as it goes (progress.js HAGGLE_CAP)", () => {
    it("takes no more than 35% off, however much is piled up: the Trade skill's best, the Fox on every piece that takes it, a legendary rabbit's foot", () => {
        const fox = (id) => ({ id, quality: "legendary", bonuses: { haggle: 0.06 }, affixes: ["fox"] });
        const piled = new Progress({ skills: { trade: 99999 }, gear: { mainHand: { id: "sword" }, belt: fox("belt"), amulet: fox("amulet"), ring1: fox("ring"), ring2: fox("ring") }, pack: [{ id: "rabbitsFoot", quality: "legendary" }] });
        const trader = new Progress({ skills: { trade: 99999 }, gear: { mainHand: { id: "sword" }, ring1: fox("ring") } });

        assert.ok(Math.abs(trader.bonuses().haggle - 0.31) < 1e-9, "(under it, all of it)");
        assert.equal(piled.bonuses().haggle, HAGGLE_CAP);
        assert.ok(1 - HAGGLE_CAP > SELL_SHARE * (1 + HAGGLE_CAP), "below where buying and selling back would pay");
    });

    it("so nothing any shop sells, of any make, sells back for more than it cost, at the cap, its special included; and none sells a creature's part, the guild's to buy at its worth", () => {
        const sold = new Set();

        for (const shop of Object.keys(SHOPS)) {
            for (const { id } of wares(shop, "human", { might: 8 })) {
                sold.add(id);
            }

            for (let day = 0; day < 20 && SHOPS[shop].daily; day++) {
                const { wares: today, special } = dailyStock(shop, { seed: 3, key: `${shop}-1/shop/keeper`, day, people: "human" });

                for (const { id } of [...today, ...(special ? [special] : [])]) {
                    sold.add(id);
                }
            }
        }

        assert.deepEqual([...sold].filter((id) => ITEMS[id]?.part), []);

        for (const id of sold) {
            for (const quality of Object.keys(QUALITIES)) {
                const back = priceOf({ id, quality }, { haggle: HAGGLE_CAP, selling: true });

                for (const shop of Object.keys(SHOPS)) {
                    assert.ok(back <= shopPrice({ id, quality }, shop, { haggle: HAGGLE_CAP }), `${quality} ${id} at the ${shop}'s`);
                }
            }
        }
    });
});

describe("a blacksmith, by the player's might (progress.js SMITH_MAKES)", () => {
    it("sells every weapon and piece of armour, common and fine to begin with, fine and masterwork later, masterwork for the mightiest", () => {
        const of = (might) => [...new Set(wares("smith", "human", { might }).map(({ quality }) => quality))];

        assert.deepEqual(of(0), ["common", "fine"]);
        assert.deepEqual(of(4), ["fine", "masterwork"]);
        assert.deepEqual(of(8), ["masterwork"]);
        assert.deepEqual(of(null), ["common", "fine", "masterwork"], "not told: all it has");
        assert.ok(wares("smith", "human", { might: 0 }).some(({ id }) => id === "sword") && wares("smith", "human", { might: 0 }).some(({ id }) => id === "plate"));
    });

    it("won't sell a new adventurer a masterwork sword", () => {
        const { host, keeper } = atShop("smith");

        assert.equal(host.players.get(HOST_PLAYER).progress.might(), 0);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "buy", item: { id: "sword", quality: "masterwork" }, from: keeper.id }), { ok: false, reason: "shop" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "buy", item: { id: "sword", quality: "fine" }, from: keeper.id }), { ok: true });
    });
});

describe("what each shop buys (progress.js buys)", () => {
    it("has each shop buy its own line, and the adventurers' guild everything", () => {
        const buyers = (id) => Object.keys(SHOPS).filter((shop) => buys(shop, id));

        assert.deepEqual(buyers("sword"), ["smith", "swordsmith", "masterSwordsmith", "armoury", "watch", "guild"]);
        assert.deepEqual(buyers("mail"), ["smith", "armorer", "masterArmorer", "armoury", "watch", "guild"]);
        assert.deepEqual(buyers("ring"), ["emporium", "arcane", "abbey", "guild"]);
        assert.deepEqual(buyers("scrollFireball"), ["scriptorium", "emporium", "arcane", "abbey", "guild"]);
        assert.deepEqual(buyers("luckyCoin"), ["scriptorium", "emporium", "arcane", "abbey", "guild"]);
        assert.deepEqual(buyers("elixirOfStrength"), ["alchemist", "arcane", "abbey", "temple", "guild"]);
        assert.deepEqual(buyers("ale"), ["tavern", "guild"]);
        assert.deepEqual(buyers("wolfPelt"), ["guild"]);
        assert.deepEqual(buyers("tomeFear"), ["scriptorium", "emporium", "arcane", "abbey", "guild"]);
    });

    it("sells a new adventurer's needs at the guild: the elements' tomes, the first spells' scrolls, a glowcap draught", () => {
        for (const id of ["tomeBurn", "scrollBurn", "scrollVigor", "scrollStun", "glowcapDraught", "scrollOfSafety", "staminaBoost"]) {
            assert.ok(SHOPS.guild.items.includes(id), id);
        }
    });
});

describe("buying from a daily stock (host.js stockOf)", () => {
    it("sells what's in today, as many as there are, for everyone; then no more till tomorrow, when there's another assortment", () => {
        const { host, keeper } = atShop("swordsmith");
        const { progress } = host.players.get(HOST_PLAYER);
        const stock = host.stockOf(keeper.id);
        const ware = stock.wares[0];
        const item = { id: ware.id, quality: ware.quality };
        const buy = (what = item) => host.command(HOST_PLAYER, { type: "buy", item: what, from: keeper.id });

        assert.equal(stock.day, dayOf(elapsedOf(host.war)));
        assert.equal(ware.left, ware.count);

        // (Nothing that isn't in today)
        const missing = ["sword", "axe", "bow", "staff"].flatMap((id) => makes.map((quality) => ({ id, quality }))).find(({ id, quality }) => !stock.wares.some((each) => each.id === id && each.quality === quality));

        assert.deepEqual(buy(missing), { ok: false, reason: "shop" });

        // (Each for what it's worth, less their haggling: which grows as they buy)
        for (let k = 0; k < ware.count; k++) {
            const [gold, haggle] = [progress.gold, progress.bonuses().haggle];

            assert.deepEqual(buy(), { ok: true });
            assert.equal(progress.gold, gold - shopPrice(item, "swordsmith", { haggle }));
        }

        assert.equal(host.stockOf(keeper.id).wares[0].left, 0);
        assert.deepEqual(buy(), { ok: false, reason: "soldOut" });

        // (Kept with the world, as it is)
        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        again.folk.get(keeper.id).shop = "swordsmith";
        assert.deepEqual(again.stockOf(keeper.id), host.stockOf(keeper.id));

        // The next day, another assortment, all of it there to be had
        host.war.turn += 60;
        host.advance(STEP_MS);

        const tomorrow = host.stockOf(keeper.id);

        assert.equal(tomorrow.day, stock.day + 1);
        assert.notDeepEqual(tomorrow.wares.map(({ id, quality }) => [id, quality]), stock.wares.map(({ id, quality }) => [id, quality]));
        assert.ok(tomorrow.wares.every(({ left, count }) => left === count));
    });

    it("sells its daily special once, as it is, rolls and all, for a quarter more", () => {
        const { host, keeper } = atShop("masterArmorer");
        const { progress } = host.players.get(HOST_PLAYER);
        const { special, specialLeft } = host.stockOf(keeper.id);
        const [gold, haggle] = [progress.gold, progress.bonuses().haggle];

        assert.ok(specialLeft);
        assert.equal(special.quality, "legendary");
        assert.ok(special.name, "a legendary piece's name of its own");
        assert.deepEqual(host.command(HOST_PLAYER, { type: "buy", special: true, from: keeper.id }), { ok: true });
        assert.equal(progress.gold, gold - shopPrice(special, "masterArmorer", { haggle, special: true }));
        assert.deepEqual(progress.pack.find((stack) => stack?.id === special.id && stack.quality === "legendary"), { ...special, count: 1 });
        assert.equal(host.stockOf(keeper.id).specialLeft, false);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "buy", special: true, from: keeper.id }), { ok: false, reason: "soldOut" });
    });

    it("has no special to sell at a shop without a daily stock, and won't sell it dearer than they have", () => {
        const { host, keeper } = atShop("smith");

        assert.equal(host.stockOf(keeper.id), null);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "buy", special: true, from: keeper.id }), { ok: false, reason: "shop" });

        const poor = atShop("emporium", { gold: 10 });

        assert.deepEqual(poor.host.command(HOST_PLAYER, { type: "buy", special: true, from: poor.keeper.id }), { ok: false, reason: "gold" });
        assert.ok(poor.host.stockOf(poor.keeper.id).specialLeft, "still there to be had");
    });
});
