import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Conversation, OWN_TREES, PLACE, treeFor, TREES } from "../client/js/core/dialogue.js";
import { ROLES } from "../client/js/core/roles.js";
import { generateWorld } from "../client/js/core/world.js";
import { BYNAMES, GIVEN_NAMES, namePeople } from "../client/js/core/names.js";

const world = generateWorld({ seed: 1 });
const names = Object.fromEntries(world.folk.map(({ id, name }) => [id, name.split(" ")[0]]));
const speakerOf = (id) => {
    const one = world.folk.find((each) => each.id === id);

    return { id, name: one.name, title: one.title };
};

// A talk with one of the tavern's folk, remembering into `memory` and `knowledge`
function talk(id, { memory = { talks: 0, flags: [] }, knowledge = new Set(), onEffect = () => {}, check } = {}) {
    const one = world.folk.find((each) => each.id === id);

    return new Conversation(treeFor(one), { speaker: speakerOf(id), player: { name: "Nessa" }, names, memory, knowledge, onEffect, check });
}

// Choose the reply saying something (a part of its words)
const reply = (conversation, words) => {
    const index = conversation.choices.findIndex(({ text }) => text.includes(words));

    assert.ok(index >= 0, `"${words}" in ${JSON.stringify(conversation.choices.map(({ text }) => text))}`);

    return conversation.choose(index);
};

describe("names (names.js)", () => {
    it("gives each of the folk a given name for their sex and a byname, none twice, the same for the same world", () => {
        for (const one of world.folk) {
            const [given, byname] = one.name.split(" ");

            assert.ok(GIVEN_NAMES[one.sex].includes(given), `${one.id}: ${one.name}`);
            assert.ok(BYNAMES.includes(byname), one.name);
        }

        assert.equal(new Set(world.folk.map(({ name }) => name.split(" ")[0])).size, world.folk.length);
        assert.equal(new Set(world.folk.map(({ name }) => name.split(" ")[1])).size, world.folk.length);
        assert.deepEqual(generateWorld({ seed: 1 }).folk.map(({ name }) => name), world.folk.map(({ name }) => name));
        assert.notDeepEqual(generateWorld({ seed: 2 }).folk.map(({ name }) => name), world.folk.map(({ name }) => name));
        assert.deepEqual(namePeople([], 1), []);
    });
});

describe("conversations (dialogue.js)", () => {
    it("has a conversation for everyone in the tavern: their role's, or their own", () => {
        for (const one of world.folk) {
            assert.ok(treeFor(one), one.id);
            assert.ok(ROLES[one.role], one.id);
        }

        assert.equal(treeFor({ id: "greybeard", role: "patron" }), OWN_TREES.greybeard);
        assert.equal(treeFor({ id: "drinker", role: "patron" }), TREES.patron);
        assert.equal(treeFor({ id: "someone", role: "nobody" }), null);
    });

    it("hangs together: every choice leads somewhere there is, every node can be got to, and every talk can end", () => {
        for (const [key, tree] of [...Object.entries(TREES), ...Object.entries(OWN_TREES)]) {
            const { nodes, start = "greet" } = tree;
            const choicesOf = (node) => (typeof node.choices === "string" ? nodes[node.choices]?.choices : node.choices) ?? [];

            assert.ok(nodes[start], `${key}: starts somewhere`);

            for (const [id, node] of Object.entries(nodes)) {
                assert.ok(typeof node.choices !== "string" || nodes[node.choices], `${key}.${id}: its choices are somewhere`);

                for (const choice of choicesOf(node)) {
                    assert.ok(choice.say, `${key}.${id}: every choice says something`);
                    assert.ok(choice.next === null || nodes[choice.next], `${key}.${id} -> ${choice.next}`);
                }
            }

            // Every node reachable from the start, and from each an end
            const reached = new Set([start]);
            const queue = [start];

            while (queue.length) {
                for (const { next } of choicesOf(nodes[queue.shift()])) {
                    if (next !== null && !reached.has(next)) {
                        reached.add(next);
                        queue.push(next);
                    }
                }
            }

            const talked = Object.entries(nodes).filter(([, node]) => node.say).map(([id]) => id);

            assert.deepEqual(talked.filter((id) => !reached.has(id)), [], `${key}: nodes no talk gets to`);

            const ends = (id, seen = new Set()) => {
                if (seen.has(id)) {
                    return false;
                }

                seen.add(id);

                return choicesOf(nodes[id]).some(({ next }) => next === null || ends(next, seen));
            };

            assert.ok(talked.every((id) => ends(id)), `${key}: every talk can end`);
        }
    });

    it("fills in every name it uses: the player's, the speaker's, the place's and the folk's", () => {
        for (const one of world.folk) {
            const conversation = talk(one.id);

            for (const node of Object.values(treeFor(one).nodes)) {
                const say = typeof node.say === "string" ? [node.say] : node.say ?? [];
                const lines = say.flatMap((each) => (typeof each === "string" ? [each] : each.lines));
                const choices = Array.isArray(node.choices) ? node.choices.map(({ say: words }) => words) : [];

                for (const text of [...lines, ...choices]) {
                    assert.doesNotMatch(conversation.fill(text), /[{}]/, `${one.id}: ${text}`);
                }
            }
        }

        assert.equal(talk("barkeep").fill("{player} at {place}, {madam} upstairs, {title} {fullName}"), `Nessa at ${PLACE}, ${names.madam} upstairs, Barkeep ${speakerOf("barkeep").name}`);
    });

    it("greets a stranger, then someone it's met; remembers what's been asked, and hands what's done in the world to the game", () => {
        const memory = { talks: 0, flags: [] };
        const done = [];
        const first = talk("barkeep", { memory, onEffect: (effect, speaker) => done.push({ ...effect, by: speaker.id }) });

        assert.match(first.line, new RegExp(`${names.barkeep}|stranger`));
        assert.equal(first.met, false);
        assert.ok(first.choices.at(-1).ends, "farewell last");

        // An ale: bought (the game's to act on), and back to what else there is
        reply(first, "An ale");
        assert.deepEqual(done, [{ buy: "ale", price: 2, by: "barkeep" }]);
        assert.ok(first.choices.some(({ text }) => text.includes("news")));

        // Asking about the place: not offered again
        reply(first, "this place");
        assert.match(first.line, /madam|upstairs|Wenches/i);
        assert.ok(!first.choices.some(({ text }) => text.includes("this place")));
        assert.deepEqual(memory.flags, ["askedPlace"]);
        reply(first, "Farewell");
        assert.equal(first.ended, true);
        assert.equal(first.choose(0), null);

        // Next time: greeted by name
        const again = talk("barkeep", { memory });

        assert.equal(again.met, true);
        assert.match(again.line, /Nessa/);
        assert.equal(memory.talks, 2);
    });

    it("carries what the player learns from one to another: the madam knows the barkeep sent them", () => {
        const knowledge = new Set();
        const barkeep = talk("barkeep", { knowledge });

        reply(barkeep, "bed for the night");
        assert.ok(knowledge.has("sentByBarkeep"));
        assert.match(barkeep.line, new RegExp(names.madam));

        const madam = talk("madam", { knowledge });

        assert.match(madam.line, new RegExp(`${names.barkeep} sent you`));
        assert.doesNotMatch(talk("madam").line, /sent you/);
    });

    it("says its lines a different way each time, and asks the game about what it doesn't know", () => {
        const conversation = talk("drinker");
        const said = [];

        reply(conversation, "news");

        for (let k = 0; k < 12; k++) {
            said.push(conversation.line);
            reply(conversation, "Go on");
        }

        assert.ok(said.every((line, k) => k === 0 || line !== said[k - 1]));
        assert.ok(new Set(said).size >= 3);

        // A condition about the world: the game says
        const asked = [];
        const gated = new Conversation({ nodes: { greet: { say: "Hello.", choices: [{ if: { gold: 5 }, say: "Pay", next: null }, { say: "Leave", next: null }] } } }, { speaker: { id: "x", name: "X Y", title: "" }, check: (condition) => (asked.push(condition), false) });

        assert.deepEqual(gated.choices.map(({ text }) => text), ["Leave"]);
        assert.deepEqual(asked, [{ gold: 5 }]);
    });

    it("tells the greybeard's own story, and the serving wenches remember a tip", () => {
        const greybeard = talk("greybeard");

        assert.match(greybeard.line, /siege/);
        reply(greybeard, "siege");
        reply(greybeard, "What happened");
        reply(greybeard, "Orcs?");
        assert.match(greybeard.line, /behind/);

        const memory = { talks: 0, flags: [] };
        const wench = talk("wench", { memory });

        reply(wench, "for your trouble");
        assert.match(wench.line, /generous/);
        assert.ok(wench.choices.some(({ text }) => text.includes("Another copper")));
        assert.deepEqual(memory.flags, ["tipped"]);
    });
});
