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
// {fullName}, {title}, {place} (where they are: the tavern's name), and any of the folk by their
// part ({madam}, {barkeep}, {greybeard}..., and {keeper}, whoever keeps the rooms upstairs, the
// madam if no one else: their given names). What's upstairs, if anything (`upstairs`: true,
// false, or which: "bordello", "mixed", "inn"), is asked of the game.
//
// Everyone of a role (roles.js) talks as the role's tree (TREES) says, unless they have their own
// (OWN_TREES, by id). Pure data and a little bookkeeping, no DOM.

import { Variety } from "./variety.js";

/** Where the talking's done, for {place}. */
export const PLACE = "Wenches and Ale";

// Ending a talk
const FAREWELL = { say: "Farewell.", next: null };

/**
 * A specialist's or a master's shopkeeper's talk (docs/WAR.md *Shops*): greeted (`first`, the first
 * time; `again`, after), their wares to buy (`shop`: their shop's kind), today's special asked
 * after ({special} and {specialPrice}, or that it's gone: `{ special }` in a condition), and one
 * thing to ask them about (`ask`, and what they say: `answer`).
 */
function keeperTree({ shop, first, again, ask, answer, special, gone }) {
    const buy = { say: "Show me what you have for sale.", next: null, do: [{ shop }] };

    return {
        start: "greet",
        nodes: {
            greet: { say: [{ if: { met: false }, lines: first }, { lines: again }], choices: "more" },
            more: {
                say: ["What else?", "Anything more?", "Ask away."],
                choices: [buy, { say: "What's today's special?", next: "special" }, { say: ask, next: "ask" }, FAREWELL],
            },
            special: {
                say: [{ if: { special: true }, lines: special }, { lines: gone }],
                choices: [{ if: { special: true }, say: "Let me see it.", next: null, do: [{ shop }] }, { say: "Something else.", next: "more" }, FAREWELL],
            },
            ask: { say: answer, choices: [{ say: "I see.", next: "more" }, FAREWELL] },
        },
    };
}

/**
 * Whether what's upstairs in a tavern (`upstairs`: "bordello", "mixed", "inn", or null for no
 * floor above) is as a condition wants (`want`: true for anything, false for nothing, or which).
 */
export function upstairsIs(want, upstairs) {
    return typeof want === "boolean" ? Boolean(upstairs) === want : upstairs === want;
}

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
                    { say: "What have you got for sale?", next: null, do: [{ shop: "tavern" }] },
                    { say: "An ale, if you please. (2 gold)", next: "ale", do: [{ buy: "ale", price: 2 }] },
                    { say: "Heard any news?", next: "news" },
                    { if: { rumour: true }, say: "What's the word on the war?", next: "war" },
                    { if: { notFlag: "askedPlace" }, say: "Tell me about this place.", next: "place", do: [{ remember: "askedPlace" }] },
                    { if: { upstairs: true }, say: "I'm after a bed for the night.", next: "room", do: [{ learn: "sentByBarkeep" }] },
                    FAREWELL,
                ],
            },
            war: {
                say: ["{rumour1}", "Word from the road: {rumour2}", "You'll have heard? {rumour3}", "{rumourRuler}", "A carter swore to it: {rumour1}"],
                choices: [
                    { say: "What else is being said?", next: "war" },
                    { say: "Thanks for that.", next: "more" },
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
                    "A merchant came through asking after the old ruins east of here. Paid in foreign coin, too, which is always a bad sign.",
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
                say: [
                    { if: { upstairs: "bordello" }, lines: ["This is {place}: ale down here, and other comforts up the stairs. For those you'll want {madam}. Tell her I sent you."] },
                    { if: { upstairs: true }, lines: ["This is {place}: ale down here, and clean beds up the stairs. {keeper} keeps the rooms. Tell them I sent you."] },
                    { lines: ["This is {place}: ale, a fire, a bench to sit on, and no questions asked. What more does anyone need?"] },
                ],
                choices: "more",
            },
            room: {
                say: [
                    { if: { upstairs: "bordello" }, lines: ["Beds are {madam}'s business, upstairs. Tell her {name} sent you and she'll not charge you double."] },
                    { lines: ["Rooms are upstairs, and {keeper}'s the one to ask. Tell them {name} sent you."] },
                ],
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
                    { say: "Something to eat? (4 gold)", next: "food", do: [{ buy: "stew", price: 4 }] },
                    { say: "How's the work?", next: "work" },
                    { if: { rumour: true }, say: "What's the word on the war?", next: "war" },
                    { if: { notFlag: "tipped" }, say: "Here, for your trouble. (1 gold)", next: "tip", do: [{ pay: 1 }, { remember: "tipped" }] },
                    { if: { flag: "tipped" }, say: "Another coin for your trouble. (1 gold)", next: "tipAgain", do: [{ pay: 1 }] },
                    FAREWELL,
                ],
            },
            war: {
                say: ["You hear everything, carrying trays. {rumour1}", "The soldiers were saying: {rumour2}", "{rumour3} That's what they're all on about.", "{rumourRuler}"],
                choices: [
                    { say: "What else is being said?", next: "war" },
                    { say: "Thanks for that.", next: "more" },
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
                    { say: "Buy you a drink? (2 gold)", next: "drink", do: [{ buy: "ale", price: 2, for: "them" }, { remember: "boughtDrink" }] },
                    { say: "What's the news?", next: "news" },
                    { if: { rumour: true }, say: "What's the word on the war?", next: "war" },
                    { say: "Seen the orc about?", next: "orc", do: [{ learn: "orc" }] },
                    FAREWELL,
                ],
            },
            war: {
                say: ["Well, since you ask. {rumour1}", "Heard it from a soldier, so it must be true: {rumour2}", "{rumour3} Or so they say.", "{rumourRuler} Makes you think.", "Keep this to yourself. {rumour1}"],
                choices: [
                    { say: "What else is being said?", next: "war" },
                    { say: "Thanks for that.", next: "more" },
                ],
            },
            drink: { say: ["Now there's a friend! Your health!", "Bless you. Bless your boots, even."], choices: "more" },
            news: {
                say: [
                    {
                        if: { upstairs: "bordello" },
                        lines: [
                            "{barkeep} waters the ale on market days. Don't tell him I said so.",
                            "They say {madam} upstairs was a lady once. A real one, with a castle and everything.",
                            "My cousin saw lights in the old mill at night. Ghosts, or smugglers. Either way, I'm not going.",
                            "There's a blacksmith by the square who'll put an edge on anything, if you can stand his singing.",
                        ],
                    },
                    {
                        lines: [
                            "{barkeep} waters the ale on market days. Don't tell him I said so.",
                            "My cousin saw lights in the old mill at night. Ghosts, or smugglers. Either way, I'm not going.",
                            "There's a blacksmith by the square who'll put an edge on anything, if you can stand his singing.",
                            "The guild's put up a notice for wolves again. There's always wolves.",
                        ],
                    },
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
                    { say: "A room for the night. (10 gold)", next: "room", do: [{ rent: "room", price: 10 }] },
                    { say: "What sort of house is this?", next: "house" },
                    { say: "What do your ladies offer?", next: "ladies" },
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
            // (What a courtesan's company does for a caller: hinted at, host.js COMPANY)
            ladies: {
                say: [
                    "Company, darling, the best this side of the river. Twenty gold, and you'll go down my stairs with a spring in your step: my regulars swear they get their wind back twice as fast for an hour after. Pick a door; any of my girls will see to you.",
                    "A warm fire, a warm bed and warmer company. Ask the soldiers who come up here before a long march: an hour with one of my girls, and they say they could run to the next town and not stop for breath.",
                ],
                choices: [
                    { say: "Is it safe?", next: "safe" },
                    { say: "I'll think about it.", next: "more" },
                    FAREWELL,
                ],
            },
            safe: {
                say: "I keep a clean house, darling. Mostly. And if a caller should go home with more than they came for, the adventurers' guild sells a draught for that.",
                choices: "more",
            },
            looking: {
                say: "Looking's free, darling. Everything else has a price.",
                choices: [{ say: "Fair enough.", next: "more" }, FAREWELL],
            },
        },
    },
    // Whoever keeps the rooms upstairs at an inn: brisk and kindly
    innkeeper: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    {
                        if: { met: false, knows: "sentByBarkeep" },
                        lines: ["{barkeep} sent you up? Then you're welcome. I'm {name}; I keep the rooms at {place}. Clean sheets, a lock on every door, and no questions."],
                    },
                    {
                        if: { met: false },
                        lines: ["Evening. I'm {name}; I keep the rooms at {place}. Clean sheets, a lock on every door, and no questions.", "A room? You've come to the right door. {name}, at your service."],
                    },
                    { lines: ["Back again, {player}? Your old room's free.", "{player}. A bed, or just a chat?"] },
                ],
                choices: "more",
            },
            more: {
                say: ["Anything else?", "What can I do for you?", "Yes?"],
                choices: [
                    { say: "What have you got for sale?", next: null, do: [{ shop: "tavern" }] },
                    { say: "A room for the night. (8 gold)", next: "room", do: [{ rent: "room", price: 8 }] },
                    { if: { upstairs: "mixed" }, say: "And the ladies down the hall?", next: "ladies" },
                    { say: "Who stays here?", next: "guests" },
                    { if: { rumour: true }, say: "What's the word on the war?", next: "war" },
                    FAREWELL,
                ],
            },
            war: {
                say: ["The guests bring it in with the mud on their boots. {rumour1}", "A merchant stayed last night. {rumour2}", "{rumour3} Bad for trade, all of it.", "{rumourRuler}"],
                choices: [
                    { say: "What else is being said?", next: "war" },
                    { say: "Thanks for that.", next: "more" },
                ],
            },
            room: {
                say: ["The room at the end on the left. Breakfast's at dawn and not a moment after.", "Here's your key. Mind the third stair; it talks."],
                choices: "more",
            },
            ladies: {
                say: "They pay for their rooms like anyone, and what they do in them is their business. Be polite, or be gone.",
                choices: "more",
            },
            guests: {
                say: [
                    "Drovers, mostly, and a merchant now and then. And adventurers, lately, since the guild's been busy.",
                    "Whoever pays. A knight stayed here once. He snored like a bear and tipped like a king.",
                ],
                choices: [{ say: "Sounds lively.", next: "more" }, FAREWELL],
            },
        },
    },
    // The smith: gruff, proud of the work, fond of the apprentice underneath it
    smith: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false }, lines: ["Mind the sparks. {name}; I'm the smith. What d'you need?", "Hah! Stand back from the forge, friend. {name}'s the name. Blades, shoes, hinges: if it's iron, I'll make it."] },
                    { lines: ["{player}. Blade holding up?", "Back again, {player}? Let's see what you've done to that edge."] },
                ],
                choices: "more",
            },
            more: {
                say: ["What else?", "Speak up, the fire's loud.", "Anything more?"],
                choices: [
                    { say: "Show me what you have for sale.", next: null, do: [{ shop: "smith" }] },
                    { say: "Could you put an edge on my blade? (3 gold)", next: "sharpen", do: [{ buy: "sharpening", price: 3 }] },
                    { say: "What are you working on?", next: "work" },
                    { if: { notFlag: "askedApprentice" }, say: "Who's that at the bellows?", next: "apprentice", do: [{ remember: "askedApprentice" }] },
                    FAREWELL,
                ],
            },
            sharpen: { say: ["There. You could shave a cat with that. Don't.", "Good steel, that. Treat it better and it'll outlive you."], choices: "more" },
            work: {
                say: ["Ploughshares for the farms up the road. Not glorious, but folk have to eat.", "A gate for the temple. Dunmar's own work, if I say so myself, and I do.", "Horseshoes. Always horseshoes. The drovers go through them like bread."],
                choices: [{ say: "Honest work.", next: "more" }, FAREWELL],
            },
            apprentice: { say: "That's {apprentice}. Two years with me and still pumps like they're milking a goat. Good heart, though. Don't tell them I said so.", choices: "more" },
        },
    },
    // The smith's apprentice: eager, a little overawed, full of plans
    apprentice: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false }, lines: ["Oh! Hello. I'm {name}. I'm the apprentice. Well, one day I'll be the smith, but for now I'm the apprentice.", "Can't stop, sorry, the fire drops if I do. I'm {name}."] },
                    { lines: ["Hello again! I'm still pumping.", "Ask {smith}, not me. I only know about bellows."] },
                ],
                choices: [
                    { say: "How long have you been at it?", next: "long" },
                    { say: "Carry on.", next: null },
                ],
            },
            long: {
                say: "Two years. Two more and I swear my oath to Dunmar, and then I'm a journeyman, and then I go to the city and make swords for knights. That's the plan.",
                choices: [{ say: "Good luck with it.", next: null }],
            },
        },
    },
    // A castle's smith, at the forge in its undercroft: the garrison's mail and the lord's horses
    // keep them busy, and they'll say so
    castleSmith: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false }, lines: ["Mind the sparks. {name}; I keep {place}'s forge. What d'you need?", "Hah! Stand clear of the coals, friend. {name}'s the name. If the garrison wears it or swings it, I made it or mended it."] },
                    { lines: ["{player}. Blade holding up?", "Back down here, {player}? Let's see what you've done to that edge."] },
                ],
                choices: "more",
            },
            more: {
                say: ["What else?", "Speak up, the fire's loud.", "Anything more?"],
                choices: [
                    { say: "Show me what you have for sale.", next: null, do: [{ shop: "smith" }] },
                    { say: "Could you put an edge on my blade? (3 gold)", next: "sharpen", do: [{ buy: "sharpening", price: 3 }] },
                    { say: "What are you working on?", next: "work" },
                    { if: { notFlag: "askedApprentice" }, say: "Who's that at the bellows?", next: "apprentice", do: [{ remember: "askedApprentice" }] },
                    FAREWELL,
                ],
            },
            sharpen: { say: ["There. You could shave with that. Don't.", "Good steel, that. Treat it better and it'll outlive you."], choices: "more" },
            work: {
                say: [
                    "Mail for the garrison. Rings, rings and more rings: they split them on the practice yard faster than I close them.",
                    "Shoes for the stables. The lord's horses go through iron like a drover's.",
                    "Hinges for the postern gate. Not glorious, but a gate that sticks is a gate that kills you.",
                ],
                choices: [{ say: "Honest work.", next: "more" }, FAREWELL],
            },
            apprentice: { say: "That's {apprentice}. Keeps the fire up, mostly. Ask the quartermaster for anything fancy; I make, they keep.", choices: "more" },
        },
    },
    // A castle's quartermaster, keeping its armoury in the undercroft: an old soldier, blunt, who
    // knows the worth of good steel and won't hear it haggled cheap
    quartermaster: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false }, lines: ["You've found the armoury. {name}, quartermaster. What's issued to the garrison is the garrison's; what's on the racks behind me is for sale.", "Stop there. {name}, quartermaster of {place}. You want steel? You've come to the right cellar."] },
                    { lines: ["{player}. Still in one piece, I see. Something on the racks for you?", "Back, {player}? Mind the counter. What'll it be?"] },
                ],
                choices: "more",
            },
            more: {
                say: ["What else?", "Well?", "Anything more?"],
                choices: [
                    { say: "Show me what's on the racks.", next: null, do: [{ shop: "armoury" }] },
                    { say: "Where does it all come from?", next: "makers" },
                    { if: { notFlag: "askedLegendary" }, say: "Is any of it really the best there is?", next: "best", do: [{ remember: "askedLegendary" }] },
                    FAREWELL,
                ],
            },
            makers: {
                say: [
                    "Most of it from the forge behind you. The best of it from the old masters, paid for in blood or gold, and the treasury prefers gold.",
                    "From the forge, from the towns, and now and then off a dead lord's back. Steel doesn't care who wore it last.",
                ],
                choices: [{ say: "I see.", next: "more" }, FAREWELL],
            },
            best: {
                say: "There's a blade or a coat on these racks you'll find nowhere else this side of the war, and you'll pay for it like it. A {town} smith couldn't make it in a lifetime.",
                choices: "more",
            },
        },
    },
    // A people's watchtower's quartermaster, by the guardroom's racks: what the garrison doesn't
    // need it sells, and it doesn't pretend it's more than it is
    watchQuartermaster: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false }, lines: ["Quartermaster. {name}. If you're buying, the racks are behind me; if you're not, the stairs are behind you.", "{name}, quartermaster of the watch. We've steel to spare, a little. Plain stuff, but it holds an edge."] },
                    { lines: ["{player}. Back for more?", "Ah, {player}. The racks haven't changed much."] },
                ],
                choices: "more",
            },
            more: {
                say: ["Well?", "What else?"],
                choices: [
                    { say: "Show me what's on the racks.", next: null, do: [{ shop: "watch" }] },
                    { say: "Anything better than this?", next: "better" },
                    FAREWELL,
                ],
            },
            better: {
                say: "Better? Go to a castle and ask its quartermaster, and bring a fat purse. This is a watchtower. We keep watch.",
                choices: [{ say: "Fair enough.", next: "more" }, FAREWELL],
            },
        },
    },
    // An abbey's herbalist (or a sun temple's or a ziggurat's), a brother or sister of its order:
    // gentle, practical, fond of their garden
    herbalist: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false }, lines: ["Peace be with you. I'm {name}; I keep the garden here and the stillroom. You look as if you could use something from either.", "Welcome. {name}, herbalist. The brothers and sisters pray; I brew. Both help, I'm told."] },
                    { lines: ["{player}. Bruised again?", "Back, {player}? The draughts are fresh."] },
                ],
                choices: "more",
            },
            more: {
                say: ["What do you need?", "Anything more?"],
                choices: [
                    { say: "What do you sell?", next: null, do: [{ shop: "abbey" }] },
                    { say: "What grows in your garden?", next: "garden" },
                    FAREWELL,
                ],
            },
            garden: {
                say: [
                    "Feverfew, comfrey, bitterroot for the marsh fever, and a rose the elders won't let me cut. The draughts are mostly the comfrey.",
                    "Whatever the deer leave. And a little nightshade, for the rats, kept well away from the rest.",
                ],
                choices: [{ say: "Thank you.", next: "more" }, FAREWELL],
            },
        },
    },
    // A castle's arcanist, among their jars in the undercroft: learned, dry, a little vain of it
    arcanist: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false }, lines: ["Careful. That jar is older than you are, and less forgiving. I'm {name}; I serve {place} in matters arcane. And I sell.", "Ah. A visitor who isn't the quartermaster. {name}, arcanist. Wands, draughts, a ring or two: what's your need?"] },
                    { lines: ["{player}. Back for more of what keeps you breathing?", "Ah, {player}. Something for the wand hand, or for the wounds?"] },
                ],
                choices: "more",
            },
            more: {
                say: ["What else?", "Ask, then.", "Anything more?"],
                choices: [
                    { say: "What have you for sale?", next: null, do: [{ shop: "arcane" }] },
                    { say: "What are you brewing?", next: "brewing" },
                    { say: "Do you sell tomes?", next: "tomes" },
                    FAREWELL,
                ],
            },
            brewing: {
                say: [
                    "Healing draughts, mostly. The garrison bleeds, I mend. It's dull, and it pays.",
                    "A cure for the marsh fever. Two parts bitterroot, one part patience. I'm out of patience.",
                    "Something I'd rather not name in case it hears me. Don't touch the green one.",
                ],
                choices: [{ say: "I'll leave you to it.", next: "more" }, FAREWELL],
            },
            tomes: {
                say: "Tomes? Go to the adventurers' guild for those; they pay the libraries. What I sell you can use the day you buy it.",
                choices: "more",
            },
        },
    },
    // The specialists' shopkeepers (docs/WAR.md *Shops*): a swordsmith, proud of their steel
    swordsmith: keeperTree({
        shop: "swordsmith",
        first: ["Mind your elbows: everything in here's sharp. {name}. I make blades, and only blades.", "Looking for steel? {name}'s the name, and blades are the trade. Have a look along the racks."],
        again: ["{player}. That edge of yours still keen?", "Back for steel, {player}? There's new on the racks today."],
        ask: "What makes a good blade?",
        answer: ["Folding, quenching, and a smith who won't sell what isn't ready. The blacksmith down the street makes horseshoes too. I don't.", "Balance first, edge second, looks last. Pick one up: if it wants to move, it's good."],
        special: ["Today's the one on the wall behind me: {special}. {specialPrice} gold, and it won't be there tomorrow.", "{special}. Took me a month. {specialPrice} gold, and I'd ask more if I didn't want it gone to a fighter."],
        gone: ["Sold this morning, to someone with a heavier purse than yours, I'd wager. Come back tomorrow.", "Gone already. There'll be another tomorrow: there always is."],
    }),
    // An armorer: practical, measuring everyone who comes in by eye
    armorer: keeperTree({
        shop: "armorer",
        first: ["Stand still a moment. Hm. Broad in the shoulder, short in the arm. {name}, armorer. What are you after?", "Mail, plate, a good shield: {name} has it. Let's see what fits."],
        again: ["{player}. Took a knock or two since, by the look of you.", "Back again, {player}? Let's see what needs mending."],
        ask: "Mail or plate?",
        answer: ["Mail if you'd rather run, plate if you'd rather not have to. Either beats a shirt.", "Depends what's hitting you. Arrows, plate. Claws, mail. Spells, neither: try the scriptorium."],
        special: ["The one on the stand by the counter: {special}. {specialPrice} gold. Fits like it was made for you, near enough.", "Today it's {special}: {specialPrice} gold, and I'll fit it myself."],
        gone: ["Gone already. A knight came in with a full purse and an empty back. Tomorrow.", "Sold. I'll have something finer on the stand by tomorrow."],
    }),
    // An occult scriptorium's scribe: soft-spoken, ink to the elbows, a little uncanny
    scriptorium: keeperTree({
        shop: "scriptorium",
        first: ["Quietly, please: some of the books are sleeping. I'm {name}. Tomes, scrolls, a charm or two. What do you seek?", "Ah. Someone who reads. Or wishes to. {name}, scribe of this house. Welcome."],
        again: ["{player}. The ink's still wet on today's scrolls.", "You've come back, {player}. They always do."],
        ask: "What's a spell scroll?",
        answer: ["A spell written out by someone who knows it, folded up and waiting. Read it, and it's cast, once. You needn't know it yourself.", "Every word of a spell, in order, inked by a careful hand. Read it aloud and it does the rest. Then it's only paper."],
        special: ["Today: {special}. {specialPrice} gold. It came to us, as such things do; it won't stay long.", "Behind the counter, under the cloth: {special}. {specialPrice} gold, for whoever it chooses."],
        gone: ["It's found its reader already. Tomorrow there'll be another.", "Gone, I'm afraid. Come back tomorrow; I'll have copied something worth your while."],
    }),
    // An alchemist: brisk, a little singed, forever mid-experiment
    alchemist: keeperTree({
        shop: "alchemist",
        first: ["Don't touch the green ones. Or the blue. Actually, don't touch anything. {name}, alchemist. What ails you?", "Ah, a customer! {name}. Draughts, elixirs, oils for your blade: if it's in a bottle, I made it."],
        again: ["{player}! Still alive, I see. My draughts work, then.", "Back for more, {player}? I've a new batch cooling."],
        ask: "What's an oil for?",
        answer: ["Rub it on your blade, or your arrowheads. For a while after, what you hit might burn, or freeze, or sicken. One at a time, mind.", "It clings to steel and bites whatever it's put into. Fire oil burns, frost oil slows, venom oil poisons. Don't lick your sword."],
        special: ["Today's special, cooling on the back shelf: {special}. {specialPrice} gold. I'll not make another for a while.", "{special}. Took me three tries and an eyebrow. {specialPrice} gold."],
        gone: ["Sold already. Someone wanted it more than you. Tomorrow I'll brew something else.", "Gone! Come back tomorrow. Bring gold."],
    }),
    // The masters (one of each in each people's lands): a Master Swordsmith, grave and exacting
    masterSwordsmith: keeperTree({
        shop: "masterSwordsmith",
        first: ["You stand in the house of {name}, Master Swordsmith. Kings have waited at that door. What is your need?", "{name}. Every blade here has a name, and some have histories. Look, but carefully."],
        again: ["{player}. You return. Good: a blade should find its hand.", "Welcome back, {player}. The forge has been busy."],
        ask: "Why are your blades so dear?",
        answer: ["Because they're the last blade you'll buy. Rare steel, folded a hundred times, and a year of my life in each.", "Anyone can make a sword. I make the swords that are spoken of after."],
        special: ["Today, on the stand of honour: {special}. {specialPrice} gold. I'll make no other like it.", "{special}. {specialPrice} gold. It will outlive us both."],
        gone: ["It has found its bearer. Return tomorrow, and I'll show you another.", "Gone, to a worthy hand, I hope. Tomorrow, another."],
    }),
    // A Master Armorer: proud, deliberate, a craftsman of legend
    masterArmorer: keeperTree({
        shop: "masterArmorer",
        first: ["Welcome to the house of {name}, Master Armorer. What's made here has turned dragonfire. What do you need?", "{name}. My harness has stood in every war of this age. Few can afford it. Fewer deserve it."],
        again: ["{player}. Still in one piece; my armour, I hope?", "Welcome back, {player}. The anvils have been singing."],
        ask: "What sets your armour apart?",
        answer: ["Every plate shaped to its wearer, every ring riveted by hand. It'll stop what would have killed you, and look well doing it.", "Rare steel, old secrets, and patience. Mostly patience."],
        special: ["Today: {special}. {specialPrice} gold. There's none finer in these lands.", "On the great stand: {special}, {specialPrice} gold. Try it on, if you can afford to."],
        gone: ["It's spoken for, already gone. Tomorrow I'll set out another.", "Sold. Come back tomorrow."],
    }),
    // The Mystic Emporium's proprietor: smooth, knowing, never quite saying where things came from
    emporium: keeperTree({
        shop: "emporium",
        first: ["Welcome, welcome, to the Mystic Emporium. I am {name}. Wonders, curios, things that shouldn't exist: all for sale, for the right price.", "Ah, a seeker. {name}, at your service. Tomes, jewels, charms that hum in the dark. Look, but don't touch the mirror."],
        again: ["{player}! I'd hoped you'd return. I've new wonders today.", "Back again, {player}? The orb said you'd come."],
        ask: "Where do your wares come from?",
        answer: ["Here and there. Tombs, mostly. Don't ask whose.", "Collectors die, and their heirs need gold. I'm happy to help. Everyone's happy."],
        special: ["Today's marvel: {special}. {specialPrice} gold, and cheap at that.", "Under the glass, there: {special}. {specialPrice} gold. One of a kind, I assure you."],
        gone: ["Gone already, I'm afraid. Wonders go quickly. Tomorrow, another.", "Sold, to a discerning buyer. Come back tomorrow: there's always another marvel."],
    }),
    // A temple's priest: kindly and unhurried, glad to tell of the Six to anyone who asks
    priest: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false }, lines: ["Peace of the Hearth be on you, traveller. I'm {name}, and I keep this temple in {patron}'s name, and the other five's.", "Welcome, child of the Hearth. I am {name}. Come in out of the world a while."] },
                    { lines: ["{player}. The Six have kept you, I see. Come.", "Welcome back, {player}. The candles are lit; they always are."] },
                ],
                choices: "more",
            },
            more: {
                say: ["What would you ask of the temple?", "Speak, and be easy.", "Is there more on your heart?"],
                choices: [
                    { say: "Have you healing draughts to sell?", next: null, do: [{ shop: "temple" }] },
                    { say: "Tell me of the Six.", next: "six" },
                    { if: { notFlag: "askedPatron" }, say: "Whose temple is this?", next: "patron", do: [{ remember: "askedPatron" }] },
                    { say: "I'd have a blessing. (5 gold to the alms box)", next: "blessing", do: [{ buy: "blessing", price: 5 }] },
                    { say: "What is the Hollow One?", next: "hollow", do: [{ learn: "hollowOne" }] },
                    FAREWELL,
                ],
            },
            six: {
                say: "In the beginning was the Silence, and one ember in it: the Hearth. It burned alone an age of ages, and in its loneliness it broke into six sparks, and each spark woke. Ask me of any of them.",
                choices: [
                    { say: "Aurelia?", next: "aurelia" },
                    { say: "Brannoc?", next: "brannoc" },
                    { say: "Ithriel?", next: "ithriel" },
                    { say: "Morvaine?", next: "morvaine" },
                    { say: "Seliane?", next: "seliane" },
                    { say: "Dunmar?", next: "dunmar" },
                    { say: "That's enough for one day.", next: "more" },
                ],
            },
            aurelia: { say: "Aurelia, the Dawnmother, woke first and breathed on the cold world till it greened. Every heartbeat is a spark of her dawn; the sick are healed in her name.", choices: "six" },
            brannoc: { say: "Brannoc, the Red Horn, woke hungry and ran the whole world in a night. He taught the first people to hunt, and stood at the Hearth's door when the Hollow One came. Soldiers swear by his horn.", choices: "six" },
            ithriel: { say: "Ithriel, the Veiled Star, read in the stars how the world was made, and hid its laws in a veil. Those who find a thread of it are mages. Mind the thread you pull.", choices: "six" },
            morvaine: { say: "Morvaine keeps the Last Gate at the edge of the world, with his lantern, so no soul need cross in the dark. He is gentle, and patient, and never late.", choices: "six" },
            seliane: { say: "Seliane, the Rose of Evening, laughed, and the laugh made the others turn and see each other. Lovers leave roses at her shrine. So do some who only wish they were.", choices: "six" },
            dunmar: { say: "Dunmar Anvilhand woke with his hands already moving. He built the hills and taught every craft there is. Apprentices swear their oaths to him, and every guild keeps his mark.", choices: "six" },
            patron: {
                say: "This is {patron}'s house, {patronTitle}, though all six are honoured here: see the shrines along the walls. {patron} keeps this town, and it keeps {patron}'s days.",
                choices: "more",
            },
            blessing: {
                say: ["Kneel, then. May the Dawnmother warm your blood, the Red Horn guide your aim, and the Keeper keep his lantern lit for you a long while yet. Go in peace.", "The Six see you, {player}. Go lightly, and come back whole."],
                choices: "more",
            },
            hollow: {
                say: "The seventh spark, that never woke. It only wanted, and fed on the others' light. The Six drove it under the world, but its hunger seeps up still. The orcs are what it made of the first hunters it caught.",
                choices: "more",
            },
        },
    },
    // The acolyte: young, earnest, a little in awe of it all
    acolyte: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false }, lines: ["Oh! Welcome to the temple. I'm {name}; I look after the candles. Mostly the candles.", "Be welcome. I'm {name}, an acolyte of {patron}. Can I help you find a shrine?"] },
                    { lines: ["Hello again, {player}! The candles are all lit today.", "{player}! Have you come for a blessing? {priest} is just there."] },
                ],
                choices: [
                    { say: "Which shrine is which?", next: "shrines" },
                    { say: "Carry on.", next: null },
                ],
            },
            shrines: {
                say: "{patron}'s is the great altar. Then along the walls: gold for the Dawnmother, red for the Red Horn, violet for the Veiled Star, grey for the Keeper, rose for the Rose of Evening, blue for Anvilhand. Well, all but {patron}'s own.",
                choices: [{ say: "Thank you.", next: null }],
            },
        },
    },
    // A worshipper in the pews: shushing, or glad of company
    worshipper: {
        start: "greet",
        nodes: {
            greet: {
                say: ["Shh. {patron} listens best in quiet.", "I come every day. It helps. What brings you?", "Sit a while, friend. The Six don't mind company."],
                choices: [
                    { say: "What do you pray for?", next: "pray" },
                    { say: "Sorry to disturb you.", next: null },
                ],
            },
            pray: {
                say: ["My son. He went east with the drovers, and there's been no word.", "A good harvest, and the orcs to stay in their hills.", "That's between me and {patron}."],
                choices: [{ say: "I hope you're heard.", next: null }],
            },
        },
    },
    // An adventurers' guild's receptionist: bright, eager, a little flustered, very proud of her
    // guild. Whether the player's registered (`member`), and their rank ({guildRank}: Copper to
    // Mithril, standing.js GUILD_RANKS) and how near the next ({guildNext}), are the game's: one
    // card, good at every branch
    receptionist: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false, member: true }, lines: ["Oh! A card from another branch! {guildRank} rank, {player}. Welcome to the {town} branch! I'm {name}, and the counter's mine.", "Welcome to the {town} branch of the Adventurers' Guild! I'm {name}. And you're... {player}, {guildRank} rank. Your card's good here too, of course!"] },
                    { if: { met: false }, lines: ["Welcome to the Adventurers' Guild! I'm {name}, and I look after the counter. Oh! Are you new? You look new. Not in a bad way!", "Hello, hello! Welcome to the {town} branch of the Adventurers' Guild! I'm {name}. How can I help you today?"] },
                    { if: { member: true }, lines: ["{player}! You're back! And all your fingers still on, too. What can I do for you?", "Welcome back, {player}! {guildRank} rank, and the board's got new notices, if you're looking."] },
                    { lines: ["Oh, it's you again! Have you thought about registering?", "Hello again! The counter's all yours."] },
                ],
                choices: "more",
            },
            more: {
                say: ["Anything else?", "What else can I help with?", "Yes? I'm listening!"],
                choices: [
                    { say: "I'd like to buy or sell something.", next: null, do: [{ shop: "guild" }] },
                    { say: "What does the guild buy?", next: "buys" },
                    { if: { member: false }, say: "I'd like to register as an adventurer.", next: "register" },
                    { if: { due: true }, say: "I've finished a job from the board.", next: "reported", do: [{ report: true }] },
                    { if: { all: [{ member: true }, { room: true }] }, say: "Anything on the board for me?", next: "offer", do: [{ work: "ask" }] },
                    { if: { member: true }, say: "How's my card looking?", next: "card" },
                    { say: "What's the quest board?", next: "board" },
                    { say: "How do the ranks work?", next: "ranks" },
                    { say: "Are there other branches?", next: "branches" },
                    { say: "What's that archway by the hearth?", next: "portal" },
                    FAREWELL,
                ],
            },
            register: {
                say: "Wonderful! Name: {player}. Rank: Copper. Everyone starts at Copper, don't pout! Here's your card. Don't lose it; the replacement fee is terrible, and I have to fill in the form.",
                choices: [{ say: "Thank you!", next: "more", do: [{ remember: "registered" }, { learn: "guildMember" }, { guild: "register" }] }],
            },
            // (Their rank, and how near the next: the game's words)
            card: {
                say: ["Let me see... {player}, {guildRank} rank! {guildNext}", "Ooh, give it here. {guildRank}! {guildNext}"],
                choices: "more",
            },
            board: {
                say: "That's where the jobs go up! Beasts on the roads, camps outside the walls, bounties from whoever's paying. Register, ask me what's up, and bring me word when it's done. Gold on the counter, straight away!",
                choices: "more",
            },
            buys: {
                say: "Anything you drag back from the wild! Pelts, fangs, scales, stings, a beast's bits and pieces. Nobody else in town will take those, and we pay what they're worth. And anything else you've found: the shops only buy their own trade, but we'll take it all. We sell what a new adventurer needs, too: draughts, cures, a wand, scrolls of the first spells, and the tomes that open the elements' schools.",
                choices: [
                    { say: "Let's trade, then.", next: null, do: [{ shop: "guild" }] },
                    { say: "Good to know.", next: "more" },
                ],
            },
            // (The notices on the board, up to four (standing.js BOARD_SIZE), each read in full and
            // taken, or not)
            offer: {
                say: [
                    { if: { offer1: true }, lines: ["Ooh, here's what's up on the board! All fresh. Which one?", "Let me see... these just went up. See anything you like?"] },
                    { lines: ["Oh! The board's bare right now. Someone took the last one this morning. Try again later?", "Nothing for you just now, sorry! Check back in a little while."] },
                ],
                choices: [
                    { if: { offer1: true }, say: "{brief1}, for {reward1}.", next: "notice1" },
                    { if: { offer2: true }, say: "{brief2}, for {reward2}.", next: "notice2" },
                    { if: { offer3: true }, say: "{brief3}, for {reward3}.", next: "notice3" },
                    { if: { offer4: true }, say: "{brief4}, for {reward4}.", next: "notice4" },
                    { if: { offer1: true }, say: "None of them, thanks.", next: "more" },
                    { if: { offer1: false }, say: "I'll come back.", next: "more" },
                ],
            },
            ...Object.fromEntries(
                [1, 2, 3, 4].map((k) => [
                    `notice${k}`,
                    {
                        say: [`{offer${k}} It pays {reward${k}}.`, `{offer${k}} {reward${k}}, when it's done. Don't die!`],
                        choices: [
                            { say: "I'll take it.", next: "accepted", do: [{ work: "accept", which: k }] },
                            { say: "Let me look at the others.", next: "offer" },
                        ],
                    },
                ]),
            ),
            accepted: {
                say: ["It's yours! I've stamped it. Come back and tell me when it's done.", "Wonderful! Off you go, then. Carefully!"],
                choices: "more",
            },
            reported: {
                say: [{ if: { reported: true }, lines: ["{reported}"] }, { lines: ["Hmm, the board says it's not done yet. Come back when it is!"] }],
                choices: "more",
            },
            ranks: {
                say: "Copper, Iron, Bronze, Silver, Gold, and then Mithril, which only three people have: one of them's a legend and the other two won't stop talking about it. Every job off the board puts merit on your card, and enough merit's the next rank: harder jobs, better pay! Fail one and it's marked against you, but a rank you've earned is yours to keep.",
                choices: "more",
            },
            branches: {
                say: "There's a branch in every village and town, and in the cities too. The same card works at all of them. And they all have a counter, and someone like me behind it. Though not quite like me. And a portal, so once you've been to one, you can pop back any time!",
                choices: "more",
            },
            // (The guild's portal: where it goes, what it costs, and what their rank takes off:
            // core/portals.js, the game's words)
            portal: {
                say: "Oh, the portal! Every branch has one. Step up to it and you can go through to any other branch you've been inside. Only those, mind: the veil won't open on a hall you've never stood in. Something about knowing where you're going.",
                choices: [
                    { say: "What does it cost?", next: "fare" },
                    { say: "Can anyone use it?", next: "members" },
                    { say: "Good to know.", next: "more" },
                ],
            },
            fare: {
                say: "Five gold to step through, and seven more for every kilometre to the other branch, as the crow flies. But the higher your rank, the less you pay: a fifth off at Iron, two fifths at Bronze, and so on up. Mithril go free! {portalShare}",
                choices: [
                    { say: "Can anyone use it?", next: "members" },
                    { say: "Good to know.", next: "more" },
                ],
            },
            members: {
                say: "Members only! It's the guild's, after all. Show your card at the arch, and it opens. Bring your companions along too; they don't pay a thing. {portalShare}",
                choices: [
                    { say: "What does it cost?", next: "fare" },
                    { say: "Good to know.", next: "more" },
                ],
            },
        },
    },
    // One of the player's followers (docs/WAR.md M9): told to wait, to follow, or to go
    follower: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { waiting: true }, lines: ["Still here, {player}, like you said.", "Holding this spot. Are we moving?"] },
                    { lines: ["Orders, {player}?", "What is it?", "Right behind you. What do you need?"] },
                ],
                choices: [
                    { if: { waiting: false }, say: "Wait here.", next: "waiting", do: [{ follower: "wait" }] },
                    { if: { waiting: true }, say: "Come on, with me.", next: "following", do: [{ follower: "follow" }] },
                    { say: "We part here. Go your own way.", next: "parted", do: [{ follower: "dismiss" }] },
                    { say: "Nothing. Carry on.", next: null },
                ],
            },
            waiting: { say: ["I'll be here.", "Right. I'll hold here till you're back."], choices: [{ say: "Good.", next: null }] },
            following: { say: ["About time. Lead on.", "With you."], choices: [{ say: "Good.", next: null }] },
            parted: { say: ["Fair enough. It was good work while it lasted.", "Then I'll be off. Look me up if you need a blade again."], choices: [{ say: "Farewell.", next: null }] },
        },
    },
    // The townsfolk out about their business in the streets (core/townsfolk.js): busy, but glad
    // enough of a word; they tell of their town, and of the war as it's heard there
    townsfolk: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false }, lines: ["Mind yourself! Oh, a stranger. Welcome to {town}, then.", "Good day to you. Don't mind me, I'm off before the best of it's gone.", "Can't stop long, there's work wants doing. What is it?", "Morning! Or is it afternoon already? The day runs off with you."] },
                    { lines: ["You again! Still about, then?", "Busy day. What can I do for you?", "{player}, isn't it? Good day to you.", "Back in {town}? It suits you."] },
                ],
                choices: [
                    { if: { rumour: true }, say: "What's the news?", next: "news" },
                    { say: "What's this place like?", next: "place" },
                    { say: "Don't let me keep you.", next: null },
                ],
            },
            news: {
                say: ["{rumour1}", "They were saying at the well: {rumour2}", "{rumour3} That's what I heard, anyway.", "{rumourRuler}"],
                choices: [
                    { say: "What else?", next: "news" },
                    { say: "What's this place like?", next: "place" },
                    { say: "Thank you. Good day.", next: null },
                ],
            },
            place: {
                say: ["{town}? Quiet, mostly. The market's busy of a morning, and the tavern of an evening.", "Honest folk here, mostly. Keep an eye on your purse at the market all the same.", "The guild's always after someone to see off the beasts on the roads. If you're handy, ask there.", "Bread's dear and the well's deep, but it's home."],
                choices: [
                    { if: { rumour: true }, say: "What's the news?", next: "news" },
                    { say: "Thank you. Good day.", next: null },
                ],
            },
        },
    },
    // An adventurer at the guild: seasoned, a little wry, glad to give advice
    adventurer: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { met: false }, lines: ["New blood, eh? Name's {name}. Word of advice: read the notice twice before you take it.", "Hm? {name}. Don't mind me, I'm waiting for a better job to go up.", "You look like you can handle yourself. {name}, Iron rank. Almost Bronze."] },
                    { lines: ["{player}. Still breathing? Good.", "Oh, you again. Seen anything worth the walk?"] },
                ],
                choices: [
                    { say: "Any advice?", next: "advice" },
                    { if: { rumour: true }, say: "Heard anything on the road?", next: "war" },
                    { if: { hire: true, purse: true }, say: "Would you ride with me? ({hirePrice} gold)", next: "hired", do: [{ hire: true }] },
                    { if: { hire: true, purse: false }, say: "Would you ride with me? ({hirePrice} gold)", next: "short" },
                    { say: "Good hunting.", next: null },
                ],
            },
            hired: {
                say: ["Gold up front, and I'm yours. Lead on, {player}.", "Done. I've waited long enough for a job worth taking. Where to?", "{hirePrice} gold? You've a deal. Try not to get us both killed."],
                choices: [{ say: "Let's go.", next: null }],
            },
            short: {
                say: ["{hirePrice} gold, and I see you've not got it. Come back when you have.", "I don't ride for promises. {hirePrice} gold, up front."],
                choices: [{ say: "Another time, then.", next: null }],
            },
            war: {
                say: ["On the road, you hear things. {rumour1}", "Came past it myself: {rumour2}", "{rumour3} Good for business, war.", "{rumourRuler} I'd not want to cross them."],
                choices: [
                    { say: "What else?", next: "war" },
                    { say: "Any advice?", next: "advice" },
                    { say: "Good hunting.", next: null },
                ],
            },
            advice: {
                say: ["Wolves come in threes. If you see one, look for the other two.", "Never take a job from a man who won't say what's in the box.", "The camps get meaner the further you go from home. Start close.", "Be nice to {receptionist}. She decides who gets the good notices."],
                choices: [{ say: "I'll remember that.", next: null }],
            },
        },
    },
    // A soldier of a town's guard, or on its patrols: what they say depends on how their people
    // stand with the player's (`stance`: their own, allies, or neither), and they tell of the town,
    // who holds it and rules them, and the war
    guard: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { stance: "own" }, lines: ["Keep your wits about you out there, {player}.", "All quiet at {town}. For now.", "Good to see one of our own. The roads aren't what they were."] },
                    { if: { stance: "allied" }, lines: ["Friend of {holder}? Then pass, and welcome to {town}.", "Our peoples stand together. Mind you don't make me regret it."] },
                    { lines: ["State your business in {town}, stranger.", "{holder} keep the peace here. See that you keep it too.", "No trouble now. We're watching you."] },
                ],
                choices: [
                    { say: "Who holds this place?", next: "holder" },
                    { say: "How goes the war?", next: "war" },
                    { say: "Farewell.", next: null },
                ],
            },
            holder: {
                say: [
                    { if: { stance: "own" }, lines: ["{town} is ours: {holder} hold it, and {ruler} rules us all. Long may it last."] },
                    { lines: ["{town} is held by {holder}, under {ruler}. Remember it."] },
                ],
                choices: [
                    { say: "How goes the war?", next: "war" },
                    { say: "Farewell.", next: null },
                ],
            },
            war: {
                say: ["These are days of {age}. We stand against {foes}.", "{age}, they're calling it. {holder} are at war with {foes}.", "Ask the taverns for the news. All I know is {age}, and we've {foes} to watch for."],
                choices: [
                    { say: "Who holds this place?", next: "holder" },
                    { say: "Stay safe.", next: null },
                ],
            },
        },
    },
    // The officials of their people's rule (docs/WAR.md M4): what they say is asked of the game
    // (core/host.js postOf, dueTo; app/game.js fills their words): whether the player's their own
    // people's (`own`), whether they've room for more work (`room`), what's offered (`offer`),
    // whether they've something to tell of (`due`), how it went (`reported`), whether they've the
    // rank for the keep (`keep`), an armoury gift due (`armoury`), counsel they can give
    // (`counselMarch`, `counselPeace`, `counselWar`) and its choices (`march1`... `war3`), and where
    // to build (`counselBuild`, whether the council has `plans`: the building screen); serving
    // another people, whether it's time to rise (`counselRise`, `ready`: docs/WAR.md M10)
    reeve: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { own: false }, lines: ["You're not of {holder}, stranger. The hall's no business of yours.", "{town} answers to {holder}. You don't. Say what you want and be on your way."] },
                    { if: { met: false }, lines: ["Reeve of {town}. I keep its rolls, its taxes and its peace, for {ruler}. And you'd be {player}.", "{name}, reeve here. {town} runs on its rolls, and I keep them. What brings you, {player}?"] },
                    { lines: ["{player}. Back again. What is it?", "Ah, {player}. The rolls never end. Speak.", "{player}. I hope you've come with good news."] },
                ],
                choices: "more",
            },
            more: {
                say: ["What else?", "Anything more?", "Well?", "Go on."],
                choices: [
                    { if: { due: true }, say: "It's done, what was asked.", next: "reported", do: [{ report: true }] },
                    { if: { all: [{ own: true }, { room: true }] }, say: "Is there work for me?", next: "offer", do: [{ work: "ask" }] },
                    { if: { own: true }, say: "Where do I stand with our people?", next: "standing" },
                    { say: "How goes the war?", next: "war" },
                    FAREWELL,
                ],
            },
            offer: {
                say: [
                    { if: { offer: true }, lines: ["{offer} There's {reward} in it for you.", "Here's one for you. {offer} {reward}, when it's done."] },
                    { lines: ["Nothing just now. Come back in a while: there's always something.", "The rolls are quiet today. Try me again later."] },
                ],
                choices: [
                    { if: { offer: true }, say: "I'll do it.", next: "accepted", do: [{ work: "accept" }] },
                    { if: { offer: true }, say: "Not this time.", next: "more" },
                    { if: { offer: false }, say: "I'll come back.", next: "more" },
                ],
            },
            accepted: {
                say: ["Good. It's in the rolls now: don't make me strike it out.", "Then go. Come back to me when it's done.", "I'll hold you to it, {player}."],
                choices: "more",
            },
            reported: {
                say: [{ if: { reported: true }, lines: ["{reported}"] }, { lines: ["Not yet, it isn't. Come back when it is."] }],
                choices: "more",
            },
            standing: {
                say: ["The rolls have you down as {rank}. {standingNext}", "{rank}, by the rolls. {standingNext}"],
                choices: "more",
            },
            war: {
                say: ["These are days of {age}. {holder} stand against {foes}.", "{age}, they're calling it. We've {foes} to reckon with.", "Taxes up, men gone to the camps. That's {age} for you. We're against {foes}."],
                choices: "more",
            },
        },
    },
    clerk: {
        start: "greet",
        nodes: {
            greet: {
                say: ["It's the reeve you'll want, not me. I only keep the rolls.", "Mind the ink. Are you here for the reeve?", "{player}, isn't it? You're in the rolls."],
                choices: [
                    { if: { due: true }, say: "I've word for the rolls: it's done.", next: "reported", do: [{ report: true }] },
                    { say: "What's the talk of the hall?", next: "news" },
                    FAREWELL,
                ],
            },
            reported: {
                say: [{ if: { reported: true }, lines: ["{reported}"] }, { lines: ["The rolls don't say so. See the reeve."] }],
                choices: [
                    { say: "What's the talk of the hall?", next: "news" },
                    FAREWELL,
                ],
            },
            news: {
                say: ["Days of {age}. Every other letter's about {foes}.", "More soldiers wanted, more taxes wanted. {age}, the reeve calls it.", "Letters from {ruler}'s steward every week. It's {foes} they're worried about."],
                choices: [FAREWELL],
            },
        },
    },
    petitioner: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    "I've waited since dawn to see the reeve about my neighbour's goats. Since dawn!",
                    "They've doubled the tithe again. For the war, they say. What war? I've a roof to mend.",
                    "My son went to the camps a month ago. I've come to ask if there's word.",
                    "A boundary stone, moved in the night. I know who did it. I'll have it in the rolls.",
                ],
                choices: [
                    { say: "I hope you're heard soon.", next: "thanks" },
                    FAREWELL,
                ],
            },
            thanks: {
                say: ["So do I. Or I'll be sleeping on this bench.", "Kind of you. Nobody else here's said as much."],
                choices: [FAREWELL],
            },
        },
    },
    ruler: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { own: false }, lines: ["You stand before {ruler} of {holder}. Say what you came to say, stranger, then go.", "One not of {holder}, in my hall? Speak quickly."] },
                    { if: { keep: false }, lines: ["And who might you be? My steward sees to petitioners. Make a name for yourself, {player}, and then we'll talk.", "The throne's time is for those who've earned it. You've not, {player}. Not yet."] },
                    { lines: ["{player}. You've served us well. What would you have of us?", "Our {rank}. Come, speak.", "{player}. We were speaking of you. Well, what is it?"] },
                ],
                choices: "more",
            },
            more: {
                say: ["Well?", "What more?", "Go on.", "We're listening."],
                choices: [
                    { if: { due: true }, say: "It's done, as you asked.", next: "reported", do: [{ report: true }] },
                    { if: { all: [{ own: true }, { keep: true }, { room: true }] }, say: "How may I serve?", next: "offer", do: [{ work: "ask" }] },
                    { if: { counselMarch: true }, say: "Where will we strike next?", next: "march" },
                    { if: { counselPeace: true }, say: "Have you thought of peace?", next: "peace" },
                    { if: { counselWar: true }, say: "There are others we could bring to heel.", next: "warOn" },
                    { if: { counselBuild: true }, say: "Where should we build our defences?", next: "build" },
                    { if: { counselRise: true }, say: "Is it time we rose against {oppressor}?", next: "rise" },
                    { say: "How goes the war?", next: "war" },
                    { say: "By your leave.", next: null },
                ],
            },
            offer: {
                say: [
                    { if: { offer: true }, lines: ["{offer} Do it, and there's {reward}.", "There's a thing. {offer} {reward}, and our thanks."] },
                    { lines: ["Nothing needs you just now. We'll send for you.", "Rest a while. There'll be need of you soon enough."] },
                ],
                choices: [
                    { if: { offer: true }, say: "It will be done.", next: "accepted", do: [{ work: "accept" }] },
                    { if: { offer: true }, say: "Not this, I think.", next: "more" },
                    { if: { offer: false }, say: "As you wish.", next: "more" },
                ],
            },
            accepted: {
                say: ["Good. Go.", "We'll hear of it, one way or the other.", "Then don't keep us waiting."],
                choices: "more",
            },
            reported: {
                say: [{ if: { reported: true }, lines: ["{reported}"] }, { lines: ["Is it? We've heard nothing of it."] }],
                choices: "more",
            },
            march: {
                say: "Speak, then. Where would you have us march?",
                choices: [
                    { if: { march1: true }, say: "On {march1}.", next: "heeded", do: [{ counsel: { march: 1 } }] },
                    { if: { march2: true }, say: "On {march2}.", next: "heeded", do: [{ counsel: { march: 2 } }] },
                    { if: { march3: true }, say: "On {march3}.", next: "heeded", do: [{ counsel: { march: 3 } }] },
                    { say: "I'll think on it.", next: "more" },
                ],
            },
            peace: {
                say: "Peace. With whom?",
                choices: [
                    { if: { peace1: true }, say: "With {peace1}.", next: "heeded", do: [{ counsel: { peace: 1 } }] },
                    { if: { peace2: true }, say: "With {peace2}.", next: "heeded", do: [{ counsel: { peace: 2 } }] },
                    { if: { peace3: true }, say: "With {peace3}.", next: "heeded", do: [{ counsel: { peace: 3 } }] },
                    { say: "Forget I spoke.", next: "more" },
                ],
            },
            warOn: {
                say: "Bring whom to heel?",
                choices: [
                    { if: { war1: true }, say: "{war1}.", next: "heeded", do: [{ counsel: { war: 1 } }] },
                    { if: { war2: true }, say: "{war2}.", next: "heeded", do: [{ counsel: { war: 2 } }] },
                    { if: { war3: true }, say: "{war3}.", next: "heeded", do: [{ counsel: { war: 3 } }] },
                    { say: "Forget I spoke.", next: "more" },
                ],
            },
            // (The building screen: app/building.js, its words filled in once a plan's chosen)
            build: {
                say: [
                    { if: { plans: true }, lines: ["The council's walked the borders. Here's where they'd raise towers and garrisons, and what each would cost us. Which first?", "Towers, garrisons... the council has its plans, and the stores are never deep enough. Look them over. Which would you have first?"] },
                    { lines: ["The council sees nowhere we need build just now. Ask again when the borders shift.", "Nowhere, for now. We've what we need, or nothing to build it with."] },
                ],
                choices: [
                    { if: { plans: true }, say: "Show me the plans.", next: "planning", do: [{ plans: "open" }] },
                    { say: "Another time.", next: "more" },
                ],
            },
            planning: {
                say: ["{planned}"],
                choices: "more",
            },
            rise: {
                say: [
                    { if: { ready: true }, lines: ["Softly. The people are ready, near enough: {unrest}. Say the word, and we rise.", "{unrest}. It's enough, if you're with us. Is it now?"] },
                    { lines: ["Not yet. {unrest}: rise now and they'd crush us. Do what you can for us, and ask me again.", "Softly! No. {unrest}. We'd be hanged by the week's end."] },
                ],
                choices: [
                    { if: { ready: true }, say: "Now. We rise!", next: "heeded", do: [{ counsel: { rise: true } }] },
                    { say: "Then we wait.", next: "more" },
                ],
            },
            heeded: {
                say: ["{counsel}"],
                choices: "more",
            },
            war: {
                say: [
                    { if: { serving: true }, lines: ["We answer to {oppressor} now. We stand against {foes}, because they tell us to.", "These are days of {age}, and we serve {oppressor} in them. For now."] },
                    { lines: ["These are days of {age}. We stand against {foes}.", "{age}. We've {foes} to answer, and answer them we will."] },
                ],
                choices: "more",
            },
        },
    },
    steward: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { own: false }, lines: ["The keep's business is with {holder}, stranger. State yours."] },
                    { if: { keep: false }, lines: ["{ruler} isn't receiving, not for the likes of you. Not yet. But letters and tithes come to me. What have you?", "Steward of the keep. Letters, tithes, petitions: through me. What is it, {player}?"] },
                    { lines: ["{player}. The keep has use for you, if you want it.", "Ah, our {rank}. What can the keep do for you?"] },
                ],
                choices: "more",
            },
            more: {
                say: ["What else?", "Anything more?", "Well?"],
                choices: [
                    { if: { due: true }, say: "I've brought what was asked.", next: "reported", do: [{ report: true }] },
                    { if: { all: [{ own: true }, { keep: true }, { room: true }] }, say: "Is there work from the keep?", next: "offer", do: [{ work: "ask" }] },
                    { if: { armoury: true }, say: "I'm told the armoury has something for me.", next: "gift", do: [{ armoury: true }] },
                    { if: { own: true }, say: "Where do I stand?", next: "standing" },
                    { say: "How goes the war?", next: "war" },
                    FAREWELL,
                ],
            },
            offer: {
                say: [
                    { if: { offer: true }, lines: ["{offer} The keep pays {reward}.", "This, from the keep: {offer} {reward}, on your return."] },
                    { lines: ["Nothing for you just now. Come back tomorrow.", "The keep's needs are met, for now."] },
                ],
                choices: [
                    { if: { offer: true }, say: "I'll do it.", next: "accepted", do: [{ work: "accept" }] },
                    { if: { offer: true }, say: "Not this time.", next: "more" },
                    { if: { offer: false }, say: "Tomorrow, then.", next: "more" },
                ],
            },
            accepted: {
                say: ["Good. I'll note it.", "It's written. Go."],
                choices: "more",
            },
            reported: {
                say: [{ if: { reported: true }, lines: ["{reported}"] }, { lines: ["I've nothing that says so."] }],
                choices: "more",
            },
            gift: {
                say: ["{gift}"],
                choices: "more",
            },
            standing: {
                say: ["You're {rank}, by the keep's reckoning. {standingNext}"],
                choices: "more",
            },
            war: {
                say: ["Days of {age}. {foes}, and the treasury none the fuller for it.", "{age}. We stand against {foes}, and the grain stores are counted twice a day."],
                choices: "more",
            },
        },
    },
    councillor: {
        start: "greet",
        nodes: {
            greet: {
                say: ["Hm? Oh. Yes? The council's sitting, you know. More or less.", "You'll forgive me: we've been at it since the bells.", "Another petitioner? No? Well, then."],
                choices: [
                    { say: "Tell me of {ruler}.", next: "ruler" },
                    { say: "What does the council say of the war?", next: "war" },
                    FAREWELL,
                ],
            },
            ruler: {
                say: ["Between us? {traits}", "{traits} But you didn't hear it from me."],
                choices: [
                    { say: "What does the council say of the war?", next: "war" },
                    FAREWELL,
                ],
            },
            war: {
                say: ["Days of {age}, and {foes} to think of. The council's divided, as ever.", "{foes}. Some want more war, some want less. I want my supper."],
                choices: [
                    { say: "Tell me of {ruler}.", next: "ruler" },
                    FAREWELL,
                ],
            },
        },
    },
    sentry: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    { if: { own: false }, lines: ["Keep your hands where I can see them.", "One wrong move, stranger."] },
                    { lines: ["Move along.", "Nothing to see. Move along.", "The throne's that way, if you've business there."] },
                ],
                choices: [
                    { say: "Who rules here?", next: "ruler" },
                    FAREWELL,
                ],
            },
            ruler: {
                say: ["{ruler}. Long may they reign.", "{ruler}, of {holder}. Mind your manners in there."],
                choices: [FAREWELL],
            },
        },
    },
    // A courtesan: warm, teasing, and never quite saying it. What she offers (her company, a
    // dance, what she hears from her callers, a favour to be done) is handed to the game to do;
    // her company's afterglow (host.js COMPANY) is hinted at, as it is by the madam
    courtesan: {
        start: "greet",
        nodes: {
            greet: {
                say: [
                    {
                        if: { met: false },
                        lines: [
                            "Well, look what's wandered up the stairs. I'm {name}. Come in, sweetling, I don't bite. Not unless I'm asked nicely.",
                            "There you are. I saw you in the hall and hoped you'd find my door. {name}, at your service. Any service at all.",
                            "Don't hover in the doorway, it lets the warm out. I'm {name}. Sit, if you like. The bed's softer than the chair.",
                        ],
                    },
                    { if: { flag: "company" }, lines: ["{player}! Back for more? Still got your wind from last time?", "There's my favourite caller. Did you run all the way here, {player}? You're hardly out of breath."] },
                    { if: { flag: "danced" }, lines: ["{player}! Come to tread on my toes again?", "Back for another dance, {player}? My feet have only just forgiven you."] },
                    { lines: ["{player}, I was hoping you'd come back.", "Back again, {player}? I'll start to think you like me.", "Ah, my favourite face. Come in, {player}, come in."] },
                ],
                choices: "more",
            },
            more: {
                say: ["So, what'll it be?", "What else can I do for you, sweetling?", "Well? Don't be shy.", "I'm all yours. For now."],
                choices: [
                    { if: { notFlag: "toldOfHerself" }, say: "Tell me about yourself.", next: "herself", do: [{ remember: "toldOfHerself" }] },
                    { say: "What is it you offer?", next: "offer" },
                    { say: "Heard anything interesting lately?", next: "secretsPrice" },
                    { if: { all: [{ notFlag: "favourAsked" }, { flag: "toldOfHerself" }] }, say: "You look troubled.", next: "troubled" },
                    { if: { flag: "favourAsked", notFlag: "locketReturned" }, say: "About your locket...", next: "locket" },
                    { say: "Another time.", next: "leaving" },
                ],
            },
            herself: {
                say: [
                    "A fisherman's daughter from the coast, with a laugh too loud for chapel and legs too long for mending nets. {madam} found me singing for pennies on the quay. Now I sing for gold, and only when I feel like it.",
                    "I was a lady's maid at the keep, once. The lady's husband liked me better than she did, so here I am. The pay's better, and nobody makes me curtsy.",
                    "A miller's girl, run off with a travelling player. He left; I stayed. {madam} says I've a gift for making men forget their troubles. And their purses.",
                ],
                choices: [
                    { say: "You've done well for yourself.", next: "flattered" },
                    { say: "Do you miss home?", next: "home" },
                    { say: "I see.", next: "more" },
                ],
            },
            home: {
                say: "Every morning. Then I remember why I left, roll over, and go back to sleep.",
                choices: "more",
            },
            flattered: {
                say: ["Flattery will get you everywhere, {player}. Well. Almost everywhere.", "Keep talking like that and I'll forget to charge you.", "Oh, you're a sweet one. I like sweet ones. They blush."],
                choices: "more",
            },
            offer: {
                say: [
                    "Company, sweetling. A fire, a glass of something red, a pair of warm hands for your aching shoulders, and a listening ear. My callers swear they have the wind of a boy of sixteen for an hour after. Whatever happens after that, {madam} doesn't ask and I don't tell.",
                    "Company, sweetling, and a little of my magic. A captain told me he ran up the keep's stairs after an hour with me, and had his breath back before the top. Whatever happens after that, {madam} doesn't ask and I don't tell.",
                ],
                choices: [
                    { say: "Your company for the evening. (20 gold)", next: "company", do: [{ company: true, price: 20 }, { remember: "company" }] },
                    { say: "Just a dance, then.", next: "dance", do: [{ remember: "danced" }] },
                    { say: "Just talk.", next: "more" },
                ],
            },
            company: {
                say: [
                    "Then close the door behind you, sweetling, and let me take care of the rest. You'll go down those stairs lighter than you came up.",
                    "Good choice. Mind the bedpost. And your manners. You'll thank me the next time you've a hill to run up.",
                ],
                choices: [{ say: "(Close the door.)", next: null }],
            },
            dance: {
                say: ["No music? Then I'll hum. There. One, two, three... you're lighter on your feet than you look.", "Hands where I can see them. Lower. Not that low. There, now we're dancing."],
                choices: [
                    { say: "You're a fine dancer yourself.", next: "flattered" },
                    { say: "That'll do for me.", next: "more" },
                ],
            },
            secretsPrice: {
                say: "Men tell me all sorts, lying back with their eyes closed. But secrets aren't free, sweetling.",
                choices: [
                    { say: "For your trouble. (5 gold)", next: "secrets", do: [{ pay: 5 }, { learn: "courtesanRumours" }] },
                    { say: "Keep them, then.", next: "more" },
                ],
            },
            secrets: {
                say: [
                    "A captain of the watch told me, between sighs, that the east gate's left unbarred on market nights. For a price.",
                    "One of the miller's men swears there's a purse of gold under the millstone. Men swear a great many things up here.",
                    "{greybeard} isn't half the fool he plays. He was a sergeant once, and he still has friends up at the keep.",
                    "A merchant cried in his sleep about the ruins east of town. Something down there frightened him more than his wife does.",
                ],
                choices: [
                    { if: { notKnows: "orc" }, say: "Anything about an orc?", next: "orc", do: [{ learn: "orc" }] },
                    { say: "Tell me another. (5 gold)", next: "secrets", do: [{ pay: 5 }] },
                    { say: "Thank you.", next: "more" },
                ],
            },
            orc: {
                say: "The farmers won't stop talking about it. Out in the fields north-west, big as a barn door and twice as ugly. Stay out of its sight, sweetling. I'd hate to see that face spoiled.",
                choices: "more",
            },
            troubled: {
                say: "Am I? It's nothing. Only... a merchant took my mother's locket as surety against a debt I paid him twice over, and he won't give it back. Silver, with a shell on the lid. It's all I have of her.",
                choices: [
                    { say: "I'll get it back for you.", next: "promise", do: [{ remember: "favourAsked" }, { quest: "locket", step: "accepted" }] },
                    { say: "Who is this merchant?", next: "merchant" },
                    { say: "That's not my business.", next: "unkind" },
                ],
            },
            merchant: {
                say: "Fat as a Michaelmas goose, rings on every finger, lodges by the market square. He'll say he's never heard of me. He's heard of me.",
                choices: [
                    { say: "I'll get it back for you.", next: "promise", do: [{ remember: "favourAsked" }, { quest: "locket", step: "accepted" }] },
                    { say: "I'll think about it.", next: "more" },
                ],
            },
            promise: {
                say: "You would? Oh, you sweet thing. Bring it back to me and I'll show you just how grateful a girl can be. With a song. To start with.",
                choices: "more",
            },
            unkind: {
                say: "No. No, I suppose it isn't. Forget I said anything.",
                choices: "more",
            },
            locket: {
                say: [
                    // (The game lets the player know it once they have it: for now, never)
                    { if: { knows: "locketFound" }, lines: ["You found it! Come here, you. No, closer."] },
                    { lines: ["Any luck with that merchant? Silver, with a shell on the lid. Don't let him fob you off with tin.", "He's still got it, hasn't he? Men like him never let go of anything shiny."] },
                ],
                choices: [
                    { if: { knows: "locketFound" }, say: "Here it is.", next: "returned", do: [{ remember: "locketReturned" }, { quest: "locket", step: "returned" }] },
                    { say: "I'm working on it.", next: "more" },
                ],
            },
            returned: {
                say: "My mother's locket. I never thought I'd hold it again. Whatever you want tonight, sweetling, it's on the house.",
                choices: "more",
            },
            leaving: {
                say: ["Don't keep me waiting too long.", "You know where to find me.", "Leaving so soon? Pity."],
                choices: [{ say: "Farewell.", next: null }],
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
                    { say: "Buy you a drink? (2 gold)", next: "drink", do: [{ buy: "ale", price: 2, for: "them" }] },
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
export function treeFor({ id, role, talk = null }) {
    return OWN_TREES[id] ?? TREES[talk] ?? TREES[role] ?? null;
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
     * @param {string} [options.place] - Where they're talking (the tavern's name), for {place}.
     * @param {object} [options.names] - The folk's given names, by id, for {madam} and the like.
     * @param {object} [options.memory] - What they remember of the player: { talks, flags }
     *     (changed as the talk goes: kept by the game).
     * @param {Set<string>} [options.knowledge] - What the player knows (added to as they learn).
     * @param {Variety} [options.variety] - Their lines said last (never the same twice running).
     * @param {Function} [options.onEffect] - Called with each thing done in the world (a choice's
     *     `do` that isn't remembering or learning) and the speaker.
     * @param {Function} [options.check] - Asked whether a condition this doesn't know holds.
     */
    constructor(tree, { speaker, player = { name: "stranger" }, place = PLACE, names = {}, memory = { talks: 0, flags: [] }, knowledge = new Set(), variety = new Variety(), onEffect = () => {}, check = () => true }) {
        this.tree = tree;
        this.place = place;
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

    /**
     * Say what it's at again, as things now are (what came of something done, heard a moment
     * later: docs/WAR.md M11): the same line, filled in afresh, if its lines still hold (else one
     * of those that do), and its choices as they now hold.
     */
    retell() {
        if (!this.ended) {
            this.#go(this.node, { again: true });
        }
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
        const words = { player: this.player.name, name: given, fullName: this.speaker.name, title: this.speaker.title, place: this.place, keeper: this.names.keeper ?? this.names.madam };

        return text.replace(/\{(\w+)\}/g, (whole, word) => words[word] ?? this.names[word] ?? whole);
    }

    // Go to a node (null: the end), saying one of its lines and offering its choices
    #go(id, { again = false } = {}) {
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
        const pick = again && lines === this.said?.lines ? this.said.pick : lines.length ? this.variety.next(`${this.speaker.id}:${id}`, lines.length) : 0;

        this.said = { lines, pick };
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
