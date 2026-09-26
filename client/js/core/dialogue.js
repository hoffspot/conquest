// Talking to people: conversations as trees of what they say and what the player can say back.
//
// A tree is nodes, each with what the person says (`say`) and the player's choices of reply
// (`choices`), each leading to another node (`next`), or ending the talk (`next: null`). A node's
// words can be one line, a few to pick from (at random, never the same twice running), or groups
// of lines for different moments ({ if, lines }: the first whose condition holds). Its choices can
// be another node's (`choices: "more"`), so a talk comes back round to what can be asked.
//
// Conditions (`if`) show a choice, or pick lines, only when they hold: whether they've met the
// player before (`met`), something they remember of the player (`flag`, `notFlag`), something
// the player knows, learnt from anyone (`knows`, `notKnows`), or `all`, `any`, `not` of others.
// Several in one hold only together. Anything else is asked of the game (`check`: gold, a quest's
// state...), and holds until the game knows better.
//
// A choice can do things (`do`: a list): `remember` or `forget` a flag (theirs about the player),
// `learn` something (the player's, known to everyone's conversations after). Anything else is
// something done in the world, handed to the game (`onEffect`): buying (`buy`, `price`), paying
// (`pay`), renting a room (`rent`), a quest moving on (`quest`, `step`), hiring (`hire`)... The
// game decides what each does; for now none changes the world, and the talk just goes on.
//
// Words are filled in: {player} (the player's name), {name} (the speaker's given name),
// {fullName}, {title}, {place}, and any of the folk by id ({madam}, {barkeep}, {greybeard}...: their
// given names).
//
// Everyone of a role (roles.js) talks as the role's tree (TREES) says, unless they have their own
// (OWN_TREES, by id). Pure data and a little bookkeeping, no DOM.

import { Variety } from "./variety.js";

/** Where the talking's done, for {place}. */
export const PLACE = "Wenches and Ale";

// Ending a talk
const FAREWELL = { say: "Farewell.", next: null };

/** Each role's conversation, by role (roles.js). */
export const TREES = Object.freeze({
    barkeep: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    {
                        if: { met: false },
                        lines: [
                            "Welcome to {place}, stranger. {name}'s the name; I keep the bar. What'll it be?",
                            "Wipe your boots, traveller, the floor's only just been swept. I'm {name}. What can I get you?",
                        ],
                    },
                    { lines: ["{player}! Back again. The usual?", "Ah, {player}. Still in one piece, I see. What'll it be?", "Good to see you, {player}. Thirsty?"] },
                ],
                choices: "more",
            },
            more: {
                say: ["Anything else?", "What else can I do for you?", "Something else?"],
                choices: [
                    { say: "An ale, if you please. (2 coppers)", next: "ale", do: [{ buy: "ale", price: 2 }] },
                    { say: "Heard any news?", next: "news" },
                    { if: { notFlag: "askedPlace" }, say: "Tell me about this place.", next: "place", do: [{ remember: "askedPlace" }] },
                    { say: "I'm after a bed for the night.", next: "room", do: [{ learn: "sentByBarkeep" }] },
                    FAREWELL,
                ],
            },
            ale: {
                say: [
                    "There you are. Brewed out back, so mind what you say about the taste.",
                    "One ale, foaming. Best in town, and the only one in town, so there's no arguing.",
                    "Here. Drink it before it gets ideas.",
                ],
                choices: "more",
            },
            news: {
                say: [
                    "There's an orc prowling the fields north-west of town. Came down from the hills after the harvest, they say.",
                    "A merchant came through asking after the old ruins east of here. Paid in gold, too, which is always a bad sign.",
                    "{greybeard} swears the well in the square whispers at night. Mind you, he swears a lot of things after his fourth.",
                    "The miller's put his prices up again. Bread's dearer than ale now, and that's not natural.",
                ],
                choices: [
                    { if: { notKnows: "orc" }, say: "An orc, you say?", next: "orc", do: [{ learn: "orc" }] },
                    { say: "Anything else going on?", next: "news" },
                    { say: "Thanks for that.", next: "more" },
                ],
            },
            orc: {
                say: "Big brute, with a cleaver the size of a door. Took two of {farmer}'s sheep last week. Kill it, and your drinks are on the house for a month.",
                choices: [
                    { say: "Consider it done.", next: "more", do: [{ quest: "orc", step: "accepted" }] },
                    { say: "I'll think about it.", next: "more" },
                ],
            },
            place: {
                say: "This is {place}: ale down here, and other comforts up the stairs. For those you'll want {madam}. Tell her I sent you.",
                choices: "more",
            },
            room: {
                say: "Beds are {madam}'s business, upstairs. Tell her {name} sent you and she'll not charge you double.",
                choices: "more",
            },
        },
    },

    barmaid: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    {
                        if: { met: false },
                        lines: [
                            "Hello, love! I'm {name}. You look like you could use a drink, and a sit down.",
                            "Mind the tray! Oh, hello there. {name}, at your service. What can I bring you?",
                        ],
                    },
                    { lines: ["{player}! Sit anywhere you like, I'll be round.", "Back for more, are you? Can't keep away.", "There's my favourite customer. Don't tell the others."] },
                ],
                choices: "more",
            },
            more: {
                say: ["Anything else, love?", "What else?", "Something more?"],
                choices: [
                    { say: "Something to eat? (4 coppers)", next: "food", do: [{ buy: "stew", price: 4 }] },
                    { say: "How's the work?", next: "work" },
                    { if: { notFlag: "tipped" }, say: "Here, for your trouble. (1 copper)", next: "tip", do: [{ pay: 1 }, { remember: "tipped" }] },
                    { if: { flag: "tipped" }, say: "Another copper for your trouble. (1 copper)", next: "tipAgain", do: [{ pay: 1 }] },
                    FAREWELL,
                ],
            },
            food: {
                say: [
                    "Stew's rabbit today. Or it was rabbit this morning. Best not ask.",
                    "There's bread, cheese and a bit of the boar, if {barkeep}'s not looking.",
                ],
                choices: "more",
            },
            work: {
                say: [
                    "Run off my feet! {barkeep} counts every drop, and that lot by the hearth never tip.",
                    "Oh, it's all right. The fire's warm and the company's mostly harmless.",
                ],
                choices: [
                    { say: "Tell me about the regulars.", next: "regulars" },
                    { say: "Sounds hard.", next: "more" },
                ],
            },
            regulars: {
                say: [
                    "That's {drinker}. Drinks like a fish and sings like a crow, usually at the same time.",
                    "{alewife} brewed for the whole town before {barkeep} came. She's never forgiven him.",
                    "{farmer}'s in every night since the orc took his sheep. Drowning his sorrows, he says. They're very good swimmers, his sorrows.",
                    "Old {greybeard}? Fought in some war or other. Ask him about it, and bring a pillow.",
                ],
                choices: [
                    { say: "And the others?", next: "regulars" },
                    { say: "I see.", next: "more" },
                ],
            },
            tip: { say: "Ooh, generous! Your tankard'll never be empty while I'm about, see if it is.", choices: "more" },
            tipAgain: { say: "Again? You'll spoil me, {player}!", choices: "more" },
        },
    },

    patron: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    {
                        if: { met: false },
                        lines: [
                            "Eh? Oh, hello. I'm {name}. Pull up a bench, if you can find one.",
                            "You're not from round here, I can tell. It's the boots. {name}, pleased to meet you.",
                            "Shh, I'm drinking. ...Oh, all right. {name}. What is it?",
                        ],
                    },
                    { lines: ["{player}! Sit, sit.", "You again! Good. Buy me a drink.", "Ah, {player}. Pull up a bench."] },
                ],
                choices: "more",
            },
            more: {
                say: ["What else?", "Go on, then.", "Anything else? I'm very busy. Drinking."],
                choices: [
                    { say: "Buy you a drink? (2 coppers)", next: "drink", do: [{ buy: "ale", price: 2, for: "them" }, { remember: "boughtDrink" }] },
                    { say: "What's the news?", next: "news" },
                    { say: "Seen the orc about?", next: "orc", do: [{ learn: "orc" }] },
                    FAREWELL,
                ],
            },
            drink: { say: ["Now there's a friend! Your health!", "Bless you. Bless your boots, even."], choices: "more" },
            news: {
                say: [
                    "{barkeep} waters the ale on market days. Don't tell him I said so.",
                    "They say {madam} upstairs was a lady once. A real one, with a castle and everything.",
                    "My cousin saw lights in the old mill at night. Ghosts, or smugglers. Either way, I'm not going.",
                    "There's a blacksmith by the square who'll put an edge on anything, if you can stand his singing.",
                ],
                choices: [
                    { say: "Go on.", next: "news" },
                    { say: "Fascinating.", next: "more" },
                ],
            },
            orc: {
                say: [
                    "Came out of the woods by the north-west road. Took three sheep and a cart. Keep off the fields at dusk, if you've any sense.",
                    "Seen it? I've smelled it. Keep to the streets, friend.",
                ],
                choices: "more",
            },
        },
    },

    madam: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false, knows: "sentByBarkeep" }, lines: ["{barkeep} sent you, did he? Then you'll be no trouble. I'm {name}, and this is my house."] },
                    { if: { met: false }, lines: ["Well, now. A new face at my counter. I'm {name}, and this is my house. What brings you upstairs, darling?"] },
                    { lines: ["{player}, darling. Back so soon?", "Ah, {player}. I wondered when we'd see you again."] },
                ],
                choices: "more",
            },
            more: {
                say: ["What else can I do for you, darling?", "Anything else?", "Well?"],
                choices: [
                    { say: "A room for the night. (10 coppers)", next: "room", do: [{ rent: "room", price: 10 }] },
                    { say: "What sort of house is this?", next: "house" },
                    { say: "Just looking.", next: "looking" },
                    FAREWELL,
                ],
            },
            room: {
                say: "The end room's yours. Clean sheets, a lock on the door, and breakfast if you're up before noon.",
                choices: [{ say: "Thank you.", next: "more" }, FAREWELL],
            },
            house: {
                say: "The respectable sort, darling. Warm rooms, good company and better discretion. Mostly the discretion.",
                choices: [{ say: "I see.", next: "more" }, FAREWELL],
            },
            looking: {
                say: "Looking's free, darling. Everything else has a price.",
                choices: [{ say: "Fair enough.", next: "more" }, FAREWELL],
            },
        },
    },
});

/** Conversations of their own, by id, for folk who don't talk just as their role does. */
export const OWN_TREES = Object.freeze({
    greybeard: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false }, lines: ["Sit down, sit down. {name}'s the name. Did I ever tell you about the siege of Harrowmere?"] },
                    { lines: ["Ah, it's you. Where was I? The siege, yes."] },
                ],
                choices: [
                    { say: "The siege of Harrowmere?", next: "siege" },
                    { say: "Buy you a drink? (2 coppers)", next: "drink", do: [{ buy: "ale", price: 2, for: "them" }] },
                    { say: "Another time, old-timer.", next: null },
                ],
            },
            siege: {
                say: "Forty days we held the wall. Forty! We were eating our boots by the end. Good boots, too.",
                choices: [
                    { say: "What happened then?", next: "gate" },
                    { say: "I really must be going.", next: null },
                ],
            },
            gate: {
                say: "Then the orcs came over the wall, and I held the gate with nothing but a spoon and some very bad language. Orcs can't abide bad language.",
                choices: [
                    { say: "Orcs? Like the one in the fields?", next: "advice", do: [{ learn: "orc" }] },
                    { say: "A spoon?", next: "spoon" },
                ],
            },
            spoon: {
                say: "A big spoon. Don't laugh. It's on the wall at home.",
                choices: [
                    { say: "Of course it is.", next: "advice" },
                    FAREWELL,
                ],
            },
            advice: {
                say: "Just the same sort. Big, slow to turn, quick to swing. Get round behind it, and don't stand where it's looking. That's all the wisdom I've got. That, and never eat your boots.",
                choices: [{ say: "Thanks, old-timer.", next: null, do: [{ remember: "gaveAdvice" }] }],
            },
            drink: {
                say: "You're a good sort. Now, where was I?",
                choices: [
                    { say: "The siege.", next: "siege" },
                    FAREWELL,
                ],
            },
        },
    },
});

/** The conversation someone has: their own, or their role's (null for none). */
export function treeFor({ id, role }) {
    return OWN_TREES[id] ?? TREES[role] ?? null;
}

/**
 * A talk under way with someone: what they're saying (`line`), what the player can say back
 * (`choices`), and choosing one (`choose`), until it ends (`ended`).
 */
export class Conversation {
    /**
     * @param {object} tree - A tree (TREES, OWN_TREES).
     * @param {object} options
     * @param {object} options.speaker - Who's talking: { id, name, title } (name as "Given Byname").
     * @param {object} [options.player] - { name }.
     * @param {object} [options.names] - The folk's given names, by id, for {madam} and the like.
     * @param {object} [options.memory] - What they remember of the player: { talks, flags }
     *     (changed as the talk goes: kept by the game).
     * @param {Set<string>} [options.knowledge] - What the player knows (added to as they learn).
     * @param {Variety} [options.variety] - Their lines said last (never the same twice running).
     * @param {Function} [options.onEffect] - Called with each thing done in the world (a choice's
     *     `do` that isn't remembering or learning) and the speaker.
     * @param {Function} [options.check] - Asked whether a condition this doesn't know holds.
     */
    constructor(tree, { speaker, player = { name: "stranger" }, names = {}, memory = { talks: 0, flags: [] }, knowledge = new Set(), variety = new Variety(), onEffect = () => {}, check = () => true }) {
        this.tree = tree;
        this.speaker = speaker;
        this.player = player;
        this.names = names;
        this.memory = memory;
        this.knowledge = knowledge;
        this.variety = variety;
        this.onEffect = onEffect;
        this.check = check;

        /** Whether they'd met the player before this talk. */
        this.met = memory.talks > 0;
        memory.talks += 1;
        memory.flags ??= [];

        this.node = null;
        this.line = "";
        this.choices = [];
        this.#go(tree.start ?? "greet");
    }

    /** Has the talk ended? */
    get ended() {
        return this.node === null;
    }

    /**
     * Say one of the choices back (an index into `choices`): do what it does, and go on to what
     * comes next (or end). Returns the choice, or null (no such choice, or already ended).
     */
    choose(index) {
        const choice = this.choices[index];

        if (!choice || this.ended) {
            return null;
        }

        for (const effect of choice.effects) {
            this.#do(effect);
        }

        this.#go(choice.next);

        return choice;
    }

    /** Does a condition hold now? */
    holds(condition) {
        if (!condition) {
            return true;
        }

        const flags = this.memory.flags;

        return Object.entries(condition).every(([key, value]) => {
            switch (key) {
                case "met":
                    return this.met === value;
                case "flag":
                    return flags.includes(value);
                case "notFlag":
                    return !flags.includes(value);
                case "knows":
                    return this.knowledge.has(value);
                case "notKnows":
                    return !this.knowledge.has(value);
                case "all":
                    return value.every((each) => this.holds(each));
                case "any":
                    return value.some((each) => this.holds(each));
                case "not":
                    return !this.holds(value);
                default:
                    return this.check({ [key]: value }, this.speaker) !== false;
            }
        });
    }

    /** Fill in a line's words ({player}, {name}, {madam}...). */
    fill(text) {
        const given = this.speaker.name.split(" ")[0];
        const words = { player: this.player.name, name: given, fullName: this.speaker.name, title: this.speaker.title, place: PLACE };

        return text.replace(/\{(\w+)\}/g, (whole, word) => words[word] ?? this.names[word] ?? whole);
    }

    // Go to a node (null: the end), saying one of its lines and offering its choices
    #go(id) {
        const node = id === null ? null : this.tree.nodes[id];

        if (!node) {
            this.node = null;
            this.line = "";
            this.choices = [];

            return;
        }

        this.node = id;

        // Its lines: the first group whose condition holds, or all of them
        const say = typeof node.say === "string" ? [node.say] : node.say ?? [];
        const lines = typeof say[0] === "object" ? say.find((group) => this.holds(group.if))?.lines ?? [] : say;
        const pick = lines.length ? this.variety.next(`${this.speaker.id}:${id}`, lines.length) : 0;

        this.line = lines.length ? this.fill(lines[pick]) : "";

        // Its choices (or another node's), those that hold now; with none, just goodbye
        const choices = typeof node.choices === "string" ? this.tree.nodes[node.choices]?.choices ?? [] : node.choices ?? [];
        const open = choices.filter((choice) => this.holds(choice.if));

        this.choices = (open.length ? open : [FAREWELL]).map((choice) => ({
            text: this.fill(choice.say),
            next: choice.next ?? null,
            ends: (choice.next ?? null) === null,
            effects: choice.do ?? [],
        }));
    }

    // Do what a choice does: remember, forget or learn something here; anything else in the world
    #do(effect) {
        const flags = this.memory.flags;

        if (effect.remember) {
            if (!flags.includes(effect.remember)) {
                flags.push(effect.remember);
            }
        } else if (effect.forget) {
            this.memory.flags = flags.filter((flag) => flag !== effect.forget);
        } else if (effect.learn) {
            this.knowledge.add(effect.learn);
        } else {
            this.onEffect(effect, this.speaker);
        }
    }
}
