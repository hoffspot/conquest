// The party menu: a panel over the game (opened with its button, or P) listing those with the
// player (core/host.js partyOf): their hired adventurers, the creatures they've called and the dead
// they've raised, in that order. Each with their likeness, what they are (and, a creature called
// or raised, how long it has left), their health, and whether they follow or wait; and buttons to
// tell them to follow, to wait where they are, or to go (asked first: the game's dismiss dialog,
// onAskDismiss). A hired adventurer's level and wounds besides, and (More) what they've grown
// into (docs/WAR.md *Mercenaries that grow*): how far to their next level, the trust they've come
// to and the ways it's let them grow (to choose, onPick), what they wear (to take back,
// onTakeBack), what they've done, a veteran's gift, and a name of the player's for them
// (onRename). Below them, those mending at the guild. With no one, how to come by some.
//
// Playing together, above them, the players in their party (core/host.js partyFor), its leader
// crowned, each with who's with them; its leader can make another leader or put them out (asked
// twice), and ask whether they're ready ("Ready check": app/game.js readyCheck), and anyone can
// leave it; and below, the other players in the world, each to be asked to it ("Invite"), or said
// to be asked already.
//
// Playing together, it has three tabs: the party (all that, above); its chat: what's been said
// in the party (core/netplay.js: sent to those in it alone), its newest at the foot, with the
// party's comings and goings among it, and direct messages to and from the player ("To Cai",
// "From Cai": to one player and back alone); whom a line goes to (To: the party, or one player),
// quick phrases to say with a tap, and a line to type and send; and the players: everyone playing
// in the world, the player first, then their party, then the rest by name, each with what they
// are (their standing and people), how they stand (playerStatus: their party, asked to one, away,
// resting, fallen, at war with the player's people, blocked) and where they are; to be asked to
// the player's party ("Invite"), or, its leader, put out of it ("Dismiss", asked twice); sent a
// direct message ("Message": the Chat, to them; on the Party tab too, for each in the party);
// and blocked ("Block", asked twice: their direct messages and party invites let go of, unheard)
// or unblocked. The Chat tab says how many lines haven't been seen (as the Party button does:
// hud.js).
//
// In a world on a server, playing together or not, its header has the World button: the world's
// own panel (main.js openWorldPanel, as Paused › World opens it): who's here; for its owner,
// invites and keys; leaving it.
//
// It only shows and asks: what's done is the host's (core/host.js "order" and "party" commands),
// through the game.

import { QUICK_CHAT, quickShown, quickText } from "../core/quickchat.js";
import { CHAT } from "../core/netplay.js";

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

/** How long a button asked twice (Leave party, Remove) waits to be pressed again, to be sure (ms). */
export const DISMISS_SURE_MS = 3000;

/** Whom the Chat's line goes to when it's shouted (core/netplay.js SHOUT): everyone near, not a player's id. */
export const SHOUT_TO = "*shout";

/** Whom the Chat's line goes to when it's said to the area (core/netplay.js AREA_CHAT): everyone in the player's settlement, or on their stretch of land. */
export const AREA_TO = "*area";

/** Whom the Chat's line goes to when it's said to the squad (core/host.js SQUAD): the player's party and every party allied with it. */
export const SQUAD_TO = "*squad";

/** How a squad takes parties in (core/host.js SQUAD `entries`), as its leader chooses and others read it. */
export const SQUAD_ENTRIES = Object.freeze({ open: "Open to any party", ask: "By asking", closed: "Closed" });

/** Where a muster gathers (core/host.js GATHERING: { kind, name }), as it's said: "for the defence of Stonewick", "at the hell rift". */
export function musterWords({ kind, name = null }) {
    return kind === "invasion" ? `for the defence of ${name ?? "the town"}` : "at the hell rift";
}

/** The Players tab: how many players a page of it shows, and how near (m, on the player's map) counts as nearby. */
export const PLAYERS_PAGE = Object.freeze({ size: 25, near: 150 });

/**
 * The Players tab's players, as a page of it shows them: those whose name has `search` in it
 * (any case; all, with none), in the order given, a page of PLAYERS_PAGE.size, under the heading
 * each belongs to: the player and their party, their allies (`ally`: their squad's other
 * parties), those near (`near`), and everyone else. Returns
 * { found (how many matched), page (the one shown: the nearest there is to the one asked for),
 * pages, sections: [{ key, title, players }] (those with anyone on this page) }.
 */
export function playersPage(everyone, { search = "", page = 0 } = {}) {
    const wanted = search.trim().toLowerCase();
    const sectionOf = (player) => (player.me || player.party?.yours ? "party" : player.ally ? "squad" : player.near ? "near" : "world");
    const keys = ["party", "squad", "near", "world"];
    const found = everyone
        .filter(({ name }) => !wanted || name.toLowerCase().includes(wanted))
        .map((player) => ({ player, key: sectionOf(player) }))
        .sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key));
    const pages = Math.max(1, Math.ceil(found.length / PLAYERS_PAGE.size));
    const shown = Math.min(Math.max(0, Math.floor(page) || 0), pages - 1);
    const onPage = found.slice(shown * PLAYERS_PAGE.size, (shown + 1) * PLAYERS_PAGE.size);
    const partied = everyone.some((player) => !player.me && player.party?.yours);
    const titles = { party: partied ? "Your party" : "You", squad: "Your squad", near: "Nearby", world: "Everyone else" };

    return {
        found: found.length,
        page: shown,
        pages,
        sections: keys
            .map((key) => ({ key, title: `${titles[key]} (${found.filter((entry) => entry.key === key).length})`, players: onPage.filter((entry) => entry.key === key).map(({ player }) => player) }))
            .filter(({ players }) => players.length),
    };
}

/** What can be said to the party with a tap (the chat's quick phrases). */
export const QUICK_PHRASES = Object.freeze(quickShown("panel").map(({ text }) => text));

/**
 * Nanny Mode in the chat panel (generated/multiplayer_scaling_plan.md 6B-17: a player in it sends
 * and sees the quick chat's phrases and nothing typed, core/netplay.js Session `restricted`): its
 * icon's label, the chip beside a name, and what "What's this?" says of it.
 */
export const NANNY_LABEL = "Nanny Mode: quick phrases only";
export const NANNY_WHAT = "Some players see and send quick phrases only. It's set by the rules of where they connect from, or by their own choice. It says nothing else about them.";

// A country by its name in English ("GB": "United Kingdom"); its code, where there's no knowing
const countryName = (code) => {
    try {
        return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
    } catch {
        return code;
    }
};

/**
 * What a player in Nanny Mode is told at the top of the Chat tab: { notice, why (one line, or ""
 * where the world didn't say), off (how it's lifted) }, from why they're in it ({ why, code,
 * threshold }: core/netplay.js nannyWhy). No age check's set up on any server yet (the plan's
 * 6B-22), so only a player's own choice can be lifted here.
 */
export function nannyWords({ why = null, code = null } = {}) {
    return {
        notice: "You can send and see quick phrases only. Typed messages from other players don't reach you, and you can't type to them. Everything else in the game is as it was.",
        why:
            why === "country" || why === "held"
                ? `The rules where you seem to be connecting from${code ? ` (${countryName(code)})` : ""} limit typed chat with players you don't know until your age has been checked.`
                : why === "unknown"
                  ? "We couldn't tell where you're connecting from."
                  : why === "chosen"
                    ? "You switched it on."
                    : "",
        off: why === "chosen" ? "You switched Nanny Mode on in Game options, under Chat and players. Switch it off there, with the lock code if one was set." : "Age checks aren't set up on this server yet, so Nanny Mode can't be turned off here for now.",
    };
}

/**
 * The sender's note under the Chat's input: how many of those a typed line would go to (`of`) are
 * in Nanny Mode (`kept`), and so won't see it; "" when none are. `all`: counted over the whole
 * world, where there's no telling who'd hear (the area's channel).
 */
export function nannyNote({ kept = 0, of = 0, all = false } = {}) {
    if (kept <= 0) {
        return "";
    }

    return all
        ? `${kept} in this world ${kept === 1 ? "is" : "are"} in Nanny Mode: they'll see quick phrases, not typed lines`
        : `${kept} of ${Math.max(of, kept)} here ${kept === 1 ? "is" : "are"} in Nanny Mode: they'll see quick phrases, not typed lines`;
}

// Nanny Mode's icon: a speech bubble under an umbrella, with its label for those who can't see it
function nannyIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

    svg.setAttribute("class", "nanny-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", NANNY_LABEL);
    title.textContent = NANNY_LABEL;
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", "M12 1a9 9 0 0 1 9 9h-8.2v2H11v-2H3a9 9 0 0 1 9-9zM6 13h12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-6l-3 2.5V20H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z");
    svg.append(title, path);

    return svg;
}

/** How many lines haven't been seen, as a badge shows it: none, "1" to "9", or "9+". */
export function unreadLabel(count) {
    return count > 9 ? "9+" : count > 0 ? String(count) : "";
}

/**
 * How a player in the world stands, for the Players tab, as chips ([{ text, kind }], `kind` how
 * each is coloured): blocked by the player, first; their party ("party": the player's; "partied":
 * another's; "free": none), or asked to one ("asked"); away (AFK: core/host.js AFK); fallen, or
 * resting; their people at war with the player's ("war"). From { me (the player themselves),
 * party ({ yours, leads (they lead it), leader (its leader's name) }, or null), asked (who's
 * asked them to theirs: "you", a name, or null), away, resting, dead, hostile, blocked, nanny (in
 * Nanny Mode: NANNY_LABEL, the last chip) }.
 */
export function playerStatus({ me = false, party = null, asked = null, away = false, resting = false, dead = false, hostile = false, blocked = false, nanny = false }) {
    const chips = [];

    if (blocked && !me) {
        chips.push({ text: "Blocked", kind: "blocked" });
    }

    if (party?.yours) {
        chips.push({ text: party.leads ? (me ? "You lead your party" : "Leads your party") : "In your party", kind: "party" });
    } else if (party) {
        chips.push({ text: party.leads ? "Leads a party" : `In ${party.leader}'s party`, kind: "partied" });
    } else if (asked) {
        chips.push({ text: asked === "you" ? "Asked to your party" : `Asked to ${asked}'s party`, kind: "asked" });
    } else {
        chips.push({ text: "In no party", kind: "free" });
    }

    if (away) {
        chips.push({ text: "Away (AFK)", kind: "afk" });
    }

    if (dead) {
        chips.push({ text: "Fallen", kind: "fallen" });
    } else if (resting) {
        chips.push({ text: "Resting", kind: "resting" });
    }

    if (hostile && !me) {
        chips.push({ text: "At war with your people", kind: "war" });
    }

    if (nanny) {
        chips.push({ text: NANNY_LABEL, kind: "nanny" });
    }

    return chips;
}

/** How long's left of something (ms), as minutes and seconds: "4:05". */
export function timeLeft(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));

    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * What one of the party is, in words: a hired adventurer by their calling ("Hired warrior"), a
 * creature called or raised by its name and how long it has left ("Called wolf · 4:05 left").
 */
export function memberKind({ kind, calling = null, creature = null, left = null, level = null, renowned = null }) {
    const time = left === null ? "" : ` · ${timeLeft(left)} left`;

    if (kind === "adventurer") {
        return `${renowned ? `${renowned} hired` : "Hired"} ${calling ?? "adventurer"}${level ? ` · level ${level}` : ""}`;
    }

    if (kind === "summon") {
        return `Called ${creature ?? "creature"}${time}`;
    }

    if (kind === "risen") {
        return `Risen ${creature ?? "dead"}${time}`;
    }

    return "With you";
}

export class PartyPanel {
    /** @param {HTMLElement} root - The #hud screen (index.html). */
    constructor(root) {
        this.panel = element("section", "journal party-panel");
        this.panel.hidden = true;
        this.panel.setAttribute("role", "dialog");
        this.panel.setAttribute("aria-labelledby", "partytitle");

        const header = element("header", "journal-header");

        this.title = element("h2", "journal-title", "Party");
        this.title.id = "partytitle";
        this.count = element("p", "journal-rank");
        this.close = element("button", "journal-close");
        this.close.type = "button";
        this.close.setAttribute("aria-label", "Close");
        this.close.title = "Close (Esc)";
        this.close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        this.close.addEventListener("click", () => this.onClose());
        this.worldButton = element("button", "journal-button party-world", "World");
        this.worldButton.type = "button";
        this.worldButton.title = "Who's here; for its owner, invites and keys (as Paused › World)";
        this.worldButton.hidden = true;
        this.worldButton.addEventListener("click", () => this.onWorld());
        header.append(this.title, this.count, this.worldButton, this.close);

        // (Playing together: the party, its chat, or everyone playing in the world)
        this.tabs = element("div", "party-tabs");
        this.tabs.setAttribute("role", "tablist");
        this.tabs.hidden = true;
        this.partyTab = this.#tab("Party", "party");
        this.chatTab = this.#tab("Chat", "chat");
        this.chatBadge = element("span", "party-tab-badge");
        this.chatBadge.hidden = true;
        this.chatTab.append(this.chatBadge);
        this.playersTab = this.#tab("Players", "players");
        this.tabs.append(this.partyTab, this.chatTab, this.playersTab);
        this.tab = "party";

        this.body = element("div", "journal-body");

        // (Playing together: the party's players, and the others to ask; each shown only then)
        this.playersHeading = element("h3", "journal-heading", "Your party");
        this.players = element("ul", "journal-list party-players");
        this.othersHeading = element("h3", "journal-heading", "Ask to your party");
        this.others = element("ul", "journal-list party-others");
        // (The squad, core/host.js SQUAD: the parties allied with the player's, or those there
        // are to join)
        this.squadHeading = element("h3", "journal-heading", "Squad");
        this.squadBox = element("ul", "journal-list party-squad");
        this.squadShown = null;
        this.unitsHeading = element("h3", "journal-heading", "With you");
        this.list = element("ul", "journal-list party-list");
        this.empty = element("p", "journal-note party-empty");
        // (Those mending at the guild: core/host.js mendingOf)
        this.mendingHeading = element("h3", "journal-heading", "Mending at the guild");
        this.mendingList = element("ul", "journal-list party-mending");
        this.body.append(this.playersHeading, this.players, this.othersHeading, this.others, this.squadHeading, this.squadBox, this.unitsHeading, this.list, this.empty, this.mendingHeading, this.mendingList);
        this.together = null;

        // The chat: what's been said, the quick phrases, and a line to send
        this.chatBody = element("div", "journal-body party-chat");
        this.chatBody.hidden = true;
        this.chatLog = element("ol", "chat-log");
        this.chatLog.setAttribute("aria-live", "polite");
        this.chatLog.setAttribute("aria-label", "What's been said in your party");
        this.chatNote = element("p", "journal-note chat-note");
        this.quick = element("div", "chat-quick");

        // (Each a phrase of the quick chat's table, said by its id: core/quickchat.js)
        for (const { id, text: phrase } of quickShown("panel")) {
            const button = element("button", "chat-phrase", phrase);

            button.type = "button";
            button.dataset.quick = String(id);
            button.addEventListener("click", () => this.onSay(phrase, { quick: id }));
            this.quick.append(button);
        }

        this.form = element("form", "chat-form");

        // (Whom a line goes to: the party, or one player, a direct message)
        this.toPicker = element("select", "chat-to");
        this.toPicker.setAttribute("aria-label", "Who to say it to");
        this.toPicker.addEventListener("change", () => this.onChatTo(this.toPicker.value || null));
        this.targetsShown = null;
        this.input = element("input", "chat-input");
        Object.assign(this.input, { type: "text", maxLength: CHAT.most, autocomplete: "off", placeholder: "Say something to your party" });
        this.input.setAttribute("enterkeyhint", "send");
        this.input.setAttribute("aria-label", "Something to say to your party");
        this.sendButton = element("button", "journal-button chat-send", "Send");
        this.sendButton.type = "submit";
        this.form.append(this.toPicker, this.input, this.sendButton);
        this.form.addEventListener("submit", (event) => {
            event.preventDefault();

            // (A line chosen over a controller's keyboard, app/padkeys.js: the field holds a
            // phrase's words and its id, and it's said as that phrase; anything typed isn't)
            const quick = Number(this.input.dataset.quick);

            delete this.input.dataset.quick;

            if (this.input.value.trim()) {
                this.onSay(this.input.value, quickText(quick) === this.input.value ? { quick } : {});
                this.input.value = "";
            }
        });
        // (Shouts heard, or turned off: the lines of anyone near, in the player's party or not,
        // core/netplay.js SHOUT. Off, none is sent them, and they can't shout)
        this.shoutsSwitch = element("label", "chat-shouts");
        this.shoutsBox = Object.assign(document.createElement("input"), { type: "checkbox", checked: true });
        this.shoutsBox.addEventListener("change", () => this.onShouts(this.shoutsBox.checked));
        this.shoutsSwitch.append(this.shoutsBox, element("span", "chat-shouts-text", "Hear shouts from players nearby"));
        // (Nanny Mode, the plan's 6B-17: the notice of a player in it, with why and how it's
        // lifted; every phrase to choose from where nothing can be typed; the sender's note; and
        // what the icon means. None of it drawn while nobody in the world's in it)
        this.nannyNotice = element("div", "chat-nanny");
        this.nannyNotice.hidden = true;
        this.nannyShown = null;
        this.phrasesHead = element("p", "journal-note chat-phrases-head");
        this.phrasesHead.append(nannyIcon(), element("span", "", NANNY_LABEL));
        this.phrases = element("div", "chat-quick chat-phrases");
        this.phrasesHead.hidden = this.phrases.hidden = true;

        for (const { id, text: phrase, retired = false } of QUICK_CHAT) {
            if (retired) {
                continue;
            }

            const button = element("button", "chat-phrase", phrase);

            button.type = "button";
            button.dataset.quick = String(id);
            button.addEventListener("click", () => this.onSay(phrase, { quick: id }));
            this.phrases.append(button);
        }

        this.nannyNote = element("p", "journal-note chat-nanny-note");
        this.nannyNote.hidden = true;
        this.nannyWhat = element("details", "chat-nanny-what");
        this.nannyWhat.hidden = true;

        const what = element("summary", "");

        what.append(nannyIcon(), element("span", "", "What's this?"));
        this.nannyWhat.append(what, element("p", "journal-note", NANNY_WHAT));
        this.chatBody.append(this.nannyNotice, this.chatLog, this.chatNote, this.quick, this.phrasesHead, this.phrases, this.form, this.nannyNote, this.nannyWhat, this.shoutsSwitch);
        this.shownLine = null;

        // Everyone playing in the world, and what can be done about them here
        this.everyoneBody = element("div", "journal-body party-everyone");
        this.everyoneBody.hidden = true;
        this.everyoneHeading = element("h3", "journal-heading", "In this world");
        this.everyoneList = element("ul", "journal-list party-everyone-list");
        this.everyoneNote = element("p", "journal-note party-everyone-note");
        // (Found by name, and a page of them at a time: PLAYERS_PAGE)
        this.everyoneSearch = element("input", "party-search");
        Object.assign(this.everyoneSearch, { type: "search", maxLength: 40, autocomplete: "off", placeholder: "Find a player by name" });
        this.everyoneSearch.setAttribute("aria-label", "Find a player by name");
        this.everyoneSearch.setAttribute("enterkeyhint", "search");
        this.everyoneSearch.addEventListener("input", () => {
            this.everyonePage = 0;
            this.#everyone(this.everyoneGiven);
        });
        this.everyonePager = element("div", "party-pager");
        this.everyonePrevious = element("button", "journal-button party-previous", "Previous");
        this.everyoneNext = element("button", "journal-button party-next", "Next");
        this.everyonePageOf = element("span", "party-page");
        this.everyonePageOf.setAttribute("aria-live", "polite");

        for (const [button, by] of [[this.everyonePrevious, -1], [this.everyoneNext, 1]]) {
            button.type = "button";
            button.addEventListener("click", () => {
                this.everyonePage += by;
                this.#everyone(this.everyoneGiven);
                this.everyoneBody.scrollTop = 0;
            });
        }

        this.everyonePager.append(this.everyonePrevious, this.everyonePageOf, this.everyoneNext);
        this.everyoneBody.append(this.everyoneHeading, this.everyoneSearch, this.everyoneList, this.everyonePager, this.everyoneNote);
        this.everyoneShown = null;
        this.everyoneGiven = { everyone: [], leads: false, full: false, partied: false };
        this.everyonePage = 0;

        this.panel.append(header, this.tabs, this.body, this.chatBody, this.everyoneBody);
        root.append(this.panel);

        // Each member's row, kept from one showing to the next (by id): { root, canvas, kind,
        // fill, state, follow, wait, dismiss, painted }
        this.rows = new Map();

        /**
         * What the player asks (the game does it): (id, "follow", "wait" or "dismiss"); (id): to
         * help them; and of their party of players (what: "invite", "leave", "remove" or
         * "promote", who: a player's id).
         */
        this.onOrder = () => {};
        this.onChoose = () => {};
        this.onParty = () => {};
        this.onDuel = () => {};
        this.onClose = () => {};

        /**
         * Of a hired adventurer (by id): a way they've grown chosen (a TRUST_PICKS id), what they
         * wear in a slot taken back ("mainHand", "body"), and a name of the player's for them (none:
         * their own again).
         */
        this.onPick = () => {};
        this.onTakeBack = () => {};
        this.onRename = () => {};

        // Whose More is open (their id), kept as the menu's shown again
        this.more = null;

        /** Something said to the party (a line typed, or a quick phrase), and a tab chosen ("party", "chat", "players"). */
        this.onSay = () => {};
        this.onTab = () => {};

        /** The World button pressed (a world on a server): its panel. */
        this.onWorld = () => {};

        /**
         * A direct message begun to a player (Message: their id); whom the Chat's line goes to
         * chosen (null, the party; or a player's id); and a player blocked or unblocked (id, on).
         */
        this.onMessage = () => {};
        this.onChatTo = () => {};
        this.onShouts = () => {};
        /** A squad command chosen (core/host.js the "squad" command): what, and what of ({ squad, party, entry }). */
        this.onSquad = () => {};
        this.onBlock = () => {};
    }

    get open() {
        return !this.panel.hidden;
    }

    /**
     * Show (or show again, as things change) those with the player: { members: [{ id, name, kind
     * ("adventurer", "summon", "risen"), calling, creature, hp, maxHp, waiting, guarding,
     * holdFire (as they were told: core/host.js stance), away, left (ms, or null), ally (the one
     * chosen to help), picture (an ImageData, or null) }], most (how many
     * adventurers they can lead); playing together, `players` (those in their party, they among
     * them, the longest in it first: [{ id, name, leader, me, away, with: [names] }]), `others`
     * (the other players in the world not in it: [{ id, name, asked }]), `leads` (whether they
     * lead it) and `full` (whether it's as many as it can be); its chat: { lines: [{ id, name,
     * text, mine, system, dm (a direct message: "party" or "world", `name` whom it's to or from) }]
     * (the oldest first), unread (how many haven't been seen), canSay (someone to hear: a party of
     * players, or a player chosen), to (whom a line goes to: null, the party; or a player's id),
     * targets (the players a line can go to alone: [{ id, name, party }]) }; and `everyone` playing in the world, in
     * the order shown: [{ id, name, me, title (their standing and people), where, party, asked,
     * away, resting, dead, hostile, blocked (playerStatus), can ("invite", "asked", "full",
     * "dismiss", or null: what of their party can be done about them here) }], with `partied`
     * (whether the player's in a party);
     * and `world`, whether there's the World button (a world on a server).
     */
    show({ members = [], most = 1, players = [], others = [], leads = false, full = false, together = false, chat = null, everyone = [], partied = false, world = false, mending = [], squad = null } = {}) {
        this.#together({ players, others, leads, full, together });
        this.#squad({ squad, together });
        this.#everyone({ everyone, leads, full, partied });
        this.tabs.hidden = !together;
        this.worldButton.hidden = !world;

        if (!together && this.tab !== "party") {
            this.showTab("party");
        }

        this.#chat(chat ?? { lines: [], unread: 0, canSay: false });

        const ids = new Set(members.map(({ id }) => id));

        for (const [id, row] of this.rows) {
            if (!ids.has(id)) {
                row.root.remove();
                this.rows.delete(id);
            }
        }

        members.forEach((member, k) => {
            const row = this.rows.get(member.id) ?? this.#row(member.id);

            if (this.list.children[k] !== row.root) {
                this.list.insertBefore(row.root, this.list.children[k] ?? null);
            }

            this.#fill(row, { ...member, id: member.id });
        });

        const hired = members.filter(({ kind }) => kind === "adventurer").length + mending.length;

        // (Those mending at the guild: each by name, and what it costs to send for them)
        this.mendingHeading.hidden = this.mendingList.hidden = !mending.length;
        this.mendingList.replaceChildren(
            ...mending.map(({ name, calling, level, price }) => {
                const row = element("li", "party-mending-row");

                row.append(element("span", "party-name", name), element("span", "party-kind", `${memberKind({ kind: "adventurer", calling, level })} · Send for them at any guild's desk (${price} gold)`));

                return row;
            }),
        );

        this.count.textContent = members.length + Math.max(0, players.length - 1) ? `${members.length + Math.max(0, players.length - 1)} with you` : "";
        this.empty.textContent = members.length
            ? `You can lead ${most} adventurer${most === 1 ? "" : "s"} (${hired} now). Tap one's icon to help them; hold it for more.`
            : mending.length
              ? `No one's with you now. Those mending at the guild still count among the ${most} you can lead: send for them, or let them go, at any guild's desk.`
              : `No one's with you. Adventurers at the guilds will follow you for gold (you can lead ${most}); Summon calls a creature to your side, and Zombify raises the fallen.`;
        this.panel.hidden = false;
    }

    hide() {
        this.panel.hidden = true;
    }

    /** Show one of its tabs ("party"; "chat", its newest line in view, ready to type; or "players"). */
    showTab(tab) {
        this.tab = tab === "chat" || tab === "players" ? tab : "party";
        this.body.hidden = this.tab !== "party";
        this.chatBody.hidden = this.tab !== "chat";
        this.everyoneBody.hidden = this.tab !== "players";
        this.partyTab.setAttribute("aria-selected", String(this.tab === "party"));
        this.chatTab.setAttribute("aria-selected", String(this.tab === "chat"));
        this.playersTab.setAttribute("aria-selected", String(this.tab === "players"));

        if (this.tab === "chat") {
            this.chatLog.scrollTop = this.chatLog.scrollHeight;
        }
    }

    // One of the tabs
    #tab(label, tab) {
        const button = element("button", "party-tab", label);

        button.type = "button";
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(tab === "party"));
        button.addEventListener("click", () => {
            this.showTab(tab);
            this.onTab(tab);
        });

        return button;
    }

    // The chat as it is: its lines made again only when there's a new one (the newest kept in view,
    // if it was), how many haven't been seen on its tab, and whether there's anyone to say anything to
    // (Nanny Mode: `nanny`, why the player's in it, or null; `note`, the sender's note; `anyNanny`,
    // whether anyone in the world is; a target's or a line's `nanny`, its speaker in it)
    #chat({ lines, unread, canSay, to = null, targets = [], shouts = null, squad = false, nanny = null, note = "", anyNanny = false }) {
        const unseen = unreadLabel(unread);
        // (Phrases only: the player's in Nanny Mode, or the one they'd message alone is)
        const phrasesOnly = Boolean(nanny) || Boolean(targets.find(({ id }) => id === to)?.nanny);
        const nannyShown = JSON.stringify(nanny);

        if (nannyShown !== this.nannyShown) {
            const words = nanny ? nannyWords(nanny) : null;
            const first = element("p", "journal-note");

            this.nannyShown = nannyShown;
            this.nannyNotice.hidden = !nanny;

            if (words) {
                first.append(nannyIcon(), element("strong", "", "Nanny Mode is on."), ` ${words.notice}`);
                this.nannyNotice.replaceChildren(first, ...(words.why ? [element("p", "journal-note chat-nanny-why", words.why)] : []), element("p", "journal-note chat-nanny-off", words.off));
            } else {
                this.nannyNotice.replaceChildren();
            }
        }

        this.input.hidden = this.sendButton.hidden = this.quick.hidden = phrasesOnly;
        this.phrasesHead.hidden = this.phrases.hidden = !phrasesOnly;
        this.nannyNote.textContent = nanny ? "" : note;
        this.nannyNote.hidden = Boolean(nanny) || !note;
        this.nannyWhat.hidden = !anyNanny;

        for (const button of this.phrases.children) {
            button.disabled = !canSay;
        }

        const shouting = to === SHOUT_TO && shouts === true;
        const toArea = to === AREA_TO && shouts === true;
        const toSquad = to === SQUAD_TO && squad === true;
        const toName = targets.find(({ id }) => id === to)?.name ?? null;

        this.chatBadge.textContent = unseen;
        this.chatBadge.hidden = !unseen;
        this.chatTab.setAttribute("aria-label", unseen ? `Chat, ${unread} unread` : "Chat");
        this.chatNote.textContent = canSay ? "" : shouts ? "Ask another player to your party to talk with them here, choose one in To to message them, or choose Shout to be heard by everyone near you." : "Ask another player to your party to talk with them here, or choose one in To to message them.";
        this.chatNote.hidden = canSay;
        this.input.disabled = !canSay;
        this.sendButton.disabled = !canSay;
        this.input.placeholder = shouting ? "Shout to everyone nearby" : toSquad ? "Say something to your squad" : toArea ? "Say something to everyone in this area" : toName ? `Say something to ${toName}` : "Say something to your party";
        this.input.setAttribute("aria-label", shouting ? "Something to shout to everyone nearby" : toSquad ? "Something to say to your squad" : toArea ? "Something to say to everyone in this town, or on this stretch of land" : toName ? `Something to say to ${toName}` : "Something to say to your party");
        this.shoutsSwitch.hidden = shouts === null;
        this.shoutsBox.checked = shouts !== false;

        // (Whom to: the party, then each player, made again only as they change)
        const shown = JSON.stringify([targets, shouts, squad]);

        if (shown !== this.targetsShown) {
            this.targetsShown = shown;
            this.toPicker.replaceChildren(
                Object.assign(document.createElement("option"), { value: "", textContent: "Party" }),
                ...(squad ? [Object.assign(document.createElement("option"), { value: SQUAD_TO, textContent: "Squad" })] : []),
                ...(shouts ? [Object.assign(document.createElement("option"), { value: SHOUT_TO, textContent: "Shout (nearby)" }), Object.assign(document.createElement("option"), { value: AREA_TO, textContent: "Area (this town, or this stretch of land)" })] : []),
                ...targets.map(({ id, name, party, nanny: theirs = false }) => {
                    // (One in Nanny Mode: an umbrella by their name, and its label read out)
                    const option = Object.assign(document.createElement("option"), { value: id, textContent: `${party ? `${name} (party)` : name}${theirs ? " ☂" : ""}` });

                    if (theirs) {
                        option.title = NANNY_LABEL;
                        option.setAttribute("aria-label", `${name}, ${NANNY_LABEL}`);
                    }

                    return option;
                }),
            );
        }

        this.toPicker.value = shouting ? SHOUT_TO : toSquad ? SQUAD_TO : toArea ? AREA_TO : toName ? to : "";
        this.toPicker.hidden = !targets.length && !shouts && !squad;

        for (const button of this.quick.children) {
            button.disabled = !canSay;
        }

        const newest = lines.at(-1)?.id ?? null;

        if (newest === this.shownLine) {
            return;
        }

        const log = this.chatLog;
        const atFoot = log.scrollHeight - log.scrollTop - log.clientHeight < 24;

        this.shownLine = newest;
        log.replaceChildren(
            ...(lines.length
                ? lines.map(({ name, text, mine = false, system = false, dm = null, shout = false, area = false, squad: toTheSquad = false, nanny: theirs = false }) => {
                      const line = element("li", `chat-line${mine ? " mine" : ""}${system ? " system" : ""}${dm ? " dm" : ""}${shout ? " shout" : ""}${area ? " area" : ""}${toTheSquad ? " squad" : ""}`);

                      if (!system) {
                          line.append(element("span", "chat-name", dm ? `${mine ? "To" : "From"} ${name}` : shout ? (mine ? "You shout" : `${name} shouts`) : area ? (mine ? "You, to the area" : `${name}, to the area`) : toTheSquad ? (mine ? "You, to the squad" : `${name}, to the squad`) : name), ...(theirs ? [nannyIcon()] : []), ": ");
                      }

                      line.append(element("span", "chat-text", text));

                      return line;
                  })
                : [element("li", "chat-line system", "Nothing's been said yet.")]),
        );

        if (atFoot || this.tab !== "chat") {
            log.scrollTop = log.scrollHeight;
        }
    }

    // The party's players and the others to ask, made again only when what's shown of them
    // changes (not their buttons under the finger every time it's shown)
    #together({ players, others, leads, full, together }) {
        const shown = JSON.stringify({ players, others, leads, full, together });

        for (const part of [this.playersHeading, this.players, this.othersHeading, this.others, this.unitsHeading]) {
            part.hidden = !together;
        }

        if (shown === this.together) {
            return;
        }

        this.together = shown;
        this.players.replaceChildren(
            ...(players.length
                ? players.map(({ id, name, leader, me, away, colour = null, with: theirs = [] }) => {
                      const row = element("li", `party-player${leader ? " leader" : ""}${away ? " away" : ""}`);
                      const text = element("div", "party-text");
                      const actions = element("div", "party-actions");
                      // (Their own colour in the party, as on the maps and their icon)
                      const swatch = element("span", "party-swatch");

                      swatch.style.background = colour ?? "transparent";
                      swatch.setAttribute("aria-hidden", "true");
                      row.dataset.id = id;
                      row.append(swatch);
                      text.append(element("span", "party-name", `${leader ? "♛ " : ""}${me ? `${name} (you)` : name}`), element("span", "party-kind", [leader ? "Leads the party" : "In the party", away ? "Not here" : "", theirs.length ? `With them: ${theirs.join(", ")}` : ""].filter(Boolean).join(" · ")));

                      if (!me) {
                          actions.append(this.#messageButton(id));
                      }

                      if (me) {
                          // (Its leader's ready check: whether the rest are ready, app/game.js readyCheck)
                          if (leads && players.length > 1) {
                              const ready = element("button", "journal-button party-ready", "Ready check");

                              ready.type = "button";
                              ready.addEventListener("click", () => this.onParty("readyCheck", id));
                              actions.append(ready);
                          }

                          actions.append(this.#sure("Leave party", "Leave?", () => this.onParty("leave", id)));
                      } else if (leads) {
                          const promote = element("button", "journal-button party-promote", "Make leader");

                          promote.type = "button";
                          promote.addEventListener("click", () => this.onParty("promote", id));
                          actions.append(promote, this.#sure("Remove", "Remove?", () => this.onParty("remove", id)));
                      }

                      row.append(text, actions);

                      return row;
                  })
                : [element("li", "journal-empty", "You're in no party. Ask another player to yours below; up to four play together in one.")]),
        );
        this.others.replaceChildren(
            ...(others.length
                ? others.map(({ id, name, asked }) => {
                      const row = element("li", "party-player");
                      const invite = element("button", "journal-button party-invite", asked ? "Asked" : "Invite");

                      row.dataset.id = id;
                      invite.type = "button";
                      invite.disabled = asked || full;
                      invite.addEventListener("click", () => this.onParty("invite", id));
                      row.append(element("span", "party-name", name), invite);

                      return row;
                  })
                : [element("li", "journal-empty", full ? "Your party's full." : players.length ? "Everyone else playing here is in your party." : "No one else is playing in this world.")]),
        );
    }

    // The squad (core/host.js SQUAD), made again only when what's shown of it changes: the parties
    // allied with the player's, the party that leads it marked, and what its leader may do (who's
    // asked let in or not, how parties come in, a party put out, the squad disbanded; a party's
    // own leader leaving it); or, in none, the squads there are, for a party's leader to join or
    // ask of, and one of their own to form. `squad`: { mine: { id, entry, leads, parties: [{ id,
    // name, size, own, leader }], asks: [{ party, name }] } or null, others: [{ id, name, size,
    // entry, asked, full }], captain (the player leads their party) }
    #squad({ squad, together }) {
        const shown = JSON.stringify({ squad, together });

        this.squadHeading.hidden = this.squadBox.hidden = !together || !squad;

        if (shown === this.squadShown) {
            return;
        }

        this.squadShown = shown;

        if (!together || !squad) {
            this.squadBox.replaceChildren();

            return;
        }

        const act = (label, what, rest = {}, className = "party-squad-act") => {
            const button = element("button", `journal-button ${className}`, label);

            button.type = "button";
            button.addEventListener("click", () => this.onSquad(what, rest));

            return button;
        };
        const rows = [];
        const { mine, others = [], captain = false, muster = null } = squad;

        if (mine) {
            for (const { id, name, size, own, leader } of mine.parties) {
                const row = element("li", `party-player party-squad-party${leader ? " leader" : ""}`);
                const text = element("div", "party-text");
                const actions = element("div", "party-actions");

                row.dataset.party = id;
                text.append(element("span", "party-name", `${leader ? "♛ " : ""}${name}'s party${own ? " (yours)" : ""}`), element("span", "party-kind", [`${size} in it`, leader ? "Leads the squad" : "Allied"].join(" · ")));

                if (own && captain) {
                    actions.append(this.#sure("Leave squad", "Leave?", () => this.onSquad("leave")));
                } else if (!own && mine.leads && !mine.muster) {
                    actions.append(this.#sure("Remove", "Remove?", () => this.onSquad("remove", { party: id })));
                }

                row.append(text, actions);
                rows.push(row);
            }

            for (const { party, name } of mine.leads ? mine.asks : []) {
                const row = element("li", "party-player party-squad-ask");
                const actions = element("div", "party-actions");

                row.dataset.party = party;
                actions.append(act("Let in", "admit", { party }), act("Refuse", "refuse", { party }));
                row.append(element("span", "party-name", `${name}'s party asks to join`), actions);
                rows.push(row);
            }

            if (mine.muster) {
                rows.push(element("li", "journal-empty party-squad-mustered", "A muster: open to every party there, and over when the fight is. Allies see each other on the maps and share pings and the squad's chat; what each party finds and its loot stay its own."));
            } else if (mine.leads) {
                const row = element("li", "party-player party-squad-lead");
                const picker = Object.assign(document.createElement("select"), { className: "party-squad-entry" });
                const actions = element("div", "party-actions");

                picker.setAttribute("aria-label", "How parties join the squad");
                picker.append(...Object.entries(SQUAD_ENTRIES).map(([value, textContent]) => Object.assign(document.createElement("option"), { value, textContent })));
                picker.value = mine.entry;
                picker.addEventListener("change", () => this.onSquad("entry", { entry: picker.value }));
                actions.append(this.#sure("Disband squad", "Disband?", () => this.onSquad("disband")));
                row.append(picker, actions);
                rows.push(row);
            } else {
                rows.push(element("li", "journal-empty", `${SQUAD_ENTRIES[mine.entry] ?? ""}. Allies see each other on the maps and share pings and the squad's chat; what each party finds, its dungeon runs and its loot stay its own.`));
            }
        } else {
            // (A muster where they stand: its leader joins it; anyone's told of it)
            if (muster) {
                const row = element("li", "party-player party-squad-muster");

                row.dataset.muster = muster.at;
                row.append(element("span", "party-name", `A muster gathers ${muster.words}`), element("span", "party-kind", "Open to every party there till the fight's over."));

                if (captain) {
                    row.append(act("Join the muster", "gather", {}, "party-squad-gather"));
                }

                rows.push(row);
            }

            for (const { id, name, size, entry, asked, full } of others) {
                const row = element("li", "party-player party-squad-other");
                const join = act(asked ? "Asked" : entry === "open" ? "Join" : entry === "ask" ? "Ask to join" : "Closed", "join", { squad: id }, "party-squad-join");

                row.dataset.squad = id;
                join.disabled = !captain || asked || full || entry === "closed";
                row.append(element("span", "party-name", `${name}'s squad`), element("span", "party-kind", [`${size} of 5 parties`, SQUAD_ENTRIES[entry] ?? ""].join(" · ")), join);
                rows.push(row);
            }

            if (captain) {
                const row = element("li", "party-player party-squad-form");

                row.append(element("span", "party-kind", "Ally your party with others: up to five parties in a squad."), act("Form a squad", "form", {}, "party-squad-new"));
                rows.push(row);
            } else {
                rows.push(element("li", "journal-empty", others.length ? "Only a party's leader can join a squad." : "A party's leader can form a squad: up to five parties allied."));
            }
        }

        this.squadBox.replaceChildren(...rows);
    }

    // Everyone playing in the world, made again only when what's shown of them changes (as the
    // party's players are): each with what they are, how they stand, where they are, and the one
    // thing that can be done about them here: asked to the player's party, or put out of it
    #everyone({ everyone, leads, full, partied }) {
        const search = this.everyoneSearch.value;
        const shown = JSON.stringify({ everyone, leads, full, partied, search, page: this.everyonePage });

        this.everyoneGiven = { everyone, leads, full, partied };

        if (shown === this.everyoneShown) {
            return;
        }

        const { found, page, pages, sections } = playersPage(everyone, { search, page: this.everyonePage });

        this.everyoneShown = shown;
        this.everyonePage = page;
        this.everyoneHeading.textContent = `In this world (${everyone.length})`;
        this.everyonePager.hidden = pages < 2;
        this.everyonePrevious.disabled = page === 0;
        this.everyoneNext.disabled = page >= pages - 1;
        this.everyonePageOf.textContent = `Page ${page + 1} of ${pages}`;
        this.everyoneList.replaceChildren(
            ...(found ? [] : [element("li", "party-section party-none", `No one here is called "${search.trim()}".`)]),
            ...sections.flatMap(({ key, title, players }) => [element("li", `party-section ${key}`, title), ...players.map((player) => {
                const { id, name, me, title = "", where = "", can = null } = player;
                const leads = Boolean(player.party?.leads);
                const row = element("li", `party-player everyone${leads ? " leader" : ""}${player.away ? " away" : ""}${me ? " me" : ""}`);
                const text = element("div", "party-text");
                const chips = element("div", "player-chips");
                const actions = element("div", "party-actions");

                row.dataset.id = id;

                for (const chip of playerStatus(player)) {
                    chips.append(element("span", `player-chip ${chip.kind}`, chip.text));
                }

                const called = element("span", "party-name", `${leads ? "♛ " : ""}${me ? `${name} (you)` : name}`);

                // (In Nanny Mode: its icon beside their name)
                if (player.nanny) {
                    called.append(nannyIcon());
                }

                text.append(called, element("span", "party-kind", title), chips, element("span", "party-where", where));

                if (can === "invite" || can === "asked" || can === "full") {
                    const invite = element("button", "journal-button party-invite", can === "asked" ? "Asked" : "Invite");

                    invite.type = "button";
                    invite.disabled = can !== "invite";
                    invite.title = can === "full" ? "Your party's full" : "";
                    invite.addEventListener("click", () => this.onParty("invite", id));
                    actions.append(invite);
                } else if (can === "dismiss") {
                    const dismiss = this.#sure("Dismiss", "Dismiss?", () => this.onParty("remove", id));

                    dismiss.classList.add("party-remove");
                    actions.append(dismiss);
                }

                // (A duel asked of them, or yielded to them: core/host.js DUEL)
                if (player.duel) {
                    const duel = element("button", "journal-button party-duel", { ask: "Duel", asked: "Challenged", yield: "Yield" }[player.duel]);

                    duel.type = "button";
                    duel.disabled = player.duel === "asked";
                    duel.addEventListener("click", () => this.onDuel(player.duel === "yield" ? "yield" : "ask", id));
                    actions.append(duel);
                }

                // (Messaged, unless blocked; blocked, asked twice, or unblocked)
                if (!me && !player.blocked) {
                    actions.append(this.#messageButton(id));
                }

                if (!me && player.blocked) {
                    const unblock = element("button", "journal-button party-unblock", "Unblock");

                    unblock.type = "button";
                    unblock.addEventListener("click", () => this.onBlock(id, false));
                    actions.append(unblock);
                } else if (!me) {
                    const block = this.#sure("Block", "Block?", () => this.onBlock(id, true));

                    block.classList.add("party-block");
                    actions.append(block);
                }

                row.append(text, actions);

                return row;
            })]),
        );
        this.everyoneNote.textContent = full
            ? "Your party's full: four play together in one at most."
            : leads
              ? "Invite anyone in no party to yours; Dismiss puts someone out of it."
              : partied
                ? "Only your party's leader can dismiss anyone from it."
                : "Invite anyone in no party: you'll lead the party you make together, up to four in it.";
    }

    // A player's Message button: a direct message to them, from the Chat
    #messageButton(id) {
        const button = element("button", "journal-button party-message", "Message");

        button.type = "button";
        button.addEventListener("click", () => this.onMessage(id));

        return button;
    }

    // A button pressed twice to be sure: the first press turns it to `sure` a moment
    #sure(label, sure, onSure) {
        const button = element("button", "journal-button party-sure", label);
        let timer = null;

        button.type = "button";
        button.addEventListener("click", () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
                onSure();

                return;
            }

            button.textContent = sure;
            button.classList.add("sure");
            timer = setTimeout(() => {
                timer = null;
                button.textContent = label;
                button.classList.remove("sure");
            }, DISMISS_SURE_MS);
        });

        return button;
    }

    // A member's row: their likeness (their name's first letter till it's drawn), name, what they
    // are, health, whether they follow; Follow or Wait, and Dismiss
    #row(id) {
        const root = element("li", "party-row");
        const face = element("button", "party-face");
        const canvas = element("canvas", "party-likeness");
        const initial = element("span", "party-initial");
        const text = element("div", "party-text");
        const name = element("span", "party-name");
        const kind = element("span", "party-kind");
        const bar = element("div", "party-bar");
        const fill = element("div", "party-fill");
        const state = element("span", "party-state");
        const actions = element("div", "party-actions");
        const follow = element("button", "journal-button party-follow", "Follow");
        const wait = element("button", "journal-button party-wait", "Wait");
        const dismiss = element("button", "journal-button party-dismiss", "Dismiss");
        // (A hired adventurer's: what they've grown into, shown beneath them on More)
        const moreButton = element("button", "journal-button party-more-button", "More");
        const more = element("div", "party-more");
        const row = { root, canvas, initial, name, kind, fill, state, follow, wait, dismiss, face, moreButton, more, painted: false, shown: null };

        root.dataset.id = id;
        face.type = "button";
        face.title = "Help them (your heals and wards go to them)";
        face.append(initial, canvas);
        face.addEventListener("click", () => this.onChoose(id));
        bar.append(fill);
        text.append(name, kind, bar, state);

        for (const button of [follow, wait, dismiss, moreButton]) {
            button.type = "button";
        }

        more.hidden = true;
        moreButton.addEventListener("click", () => {
            this.more = this.more === id ? null : id;
            more.hidden = this.more !== id;
            moreButton.textContent = more.hidden ? "More" : "Less";
        });

        follow.addEventListener("click", () => this.onOrder(id, "follow"));
        wait.addEventListener("click", () => this.onOrder(id, "wait"));
        // (Asked first, by the game: its dismiss dialog)
        dismiss.addEventListener("click", () => this.onOrder(id, "dismiss"));

        actions.append(moreButton, follow, wait, dismiss);
        root.append(face, text, actions, more);
        this.rows.set(id, row);

        return row;
    }

    // What a hired adventurer's grown into, beneath them (More: the member's `merc`, as the game
    // tells it): their level and how far to the next, their trust and the ways it's let them grow
    // (each rank's two, the one chosen pressed; to choose), what they wear (to take back), what
    // they've done, their gift, knack and mastery; and a name of the player's for them. Made again only
    // when it's changed
    #grown(row, id, merc) {
        const key = JSON.stringify(merc);

        if (row.shown === key) {
            return;
        }

        row.shown = key;

        const line = (text) => element("p", "party-more-line", text);
        const button = (label, done, { pressed = null, title = "" } = {}) => {
            const each = element("button", "journal-button party-more-pick", label);

            each.type = "button";
            each.title = title;
            each.addEventListener("click", done);

            if (pressed !== null) {
                each.setAttribute("aria-pressed", String(pressed));
            }

            return each;
        };
        const parts = [];

        parts.push(line(merc.next === null ? `Level ${merc.level}: as far as they go.` : merc.held ? `Level ${merc.level}: as far as you can lead them now. They'll grow as you do (${merc.xp} experience).` : `Level ${merc.level}: ${merc.xp} of ${merc.next} experience to the next.`));

        if (merc.wounds) {
            parts.push(line(`${merc.wounds} wound${merc.wounds === 1 ? "" : "s"}: a healing draught given them mends one. Another ${3 - merc.wounds === 1 ? "fall" : `${3 - merc.wounds} falls`} and they'll go home to mend.`));
        }

        parts.push(line(merc.trust ? `They trust you (${merc.trust} of 3: ${merc.together} foes brought down together).` : `Bring down foes together for them to trust you (${merc.together} so far).`));

        for (const { rank, picks } of merc.picks) {
            const pair = element("div", "party-more-picks");

            pair.append(...picks.map(({ id: pick, label, about, chosen }) => button(label, () => this.onPick(id, pick), { pressed: chosen, title: about })));
            parts.push(line(`Trust, rank ${rank + 1}: ${picks.find(({ chosen }) => chosen)?.about ?? "choose how they grow."}`), pair);
        }

        for (const { slot, label, piece } of merc.gear) {
            const worn = element("div", "party-more-gear");

            worn.append(element("span", "party-more-line", `${label}: ${piece ?? "nothing of yours (give them gear from your pack)"}`));

            if (piece) {
                worn.append(button("Take back", () => this.onTakeBack(id, slot)));
            }

            parts.push(worn);
        }

        parts.push(line(merc.record));

        for (const each of [merc.gift, merc.knack, merc.mastery, merc.renowned].filter(Boolean)) {
            parts.push(line(each));
        }

        // (A name of the player's for them)
        const form = element("form", "party-more-rename");
        const input = element("input", "chat-input");

        input.value = merc.called ?? "";
        input.placeholder = merc.name;
        input.maxLength = 20;
        input.setAttribute("aria-label", "Their name");
        form.append(input, button("Rename", () => {}));
        form.lastChild.type = "submit";
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            this.onRename(id, input.value.trim() || null);
        });
        parts.push(form);
        row.more.replaceChildren(...parts);
    }

    // A member's row as they are now
    #fill(row, { id, name, kind, calling = null, creature = null, hp, maxHp, waiting = false, guarding = false, holdFire = false, away = false, left = null, ally = false, picture = null, merc = null }) {
        const health = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));

        row.root.className = `party-row ${kind}${ally ? " ally" : ""}${away ? " away" : ""}`;
        row.initial.textContent = name.slice(0, 1).toUpperCase();
        row.name.textContent = name;
        row.kind.textContent = memberKind({ kind, calling, creature, left, level: merc?.level ?? null, renowned: merc?.renownedName ?? null });
        row.fill.style.width = `${Math.round(health * 100)}%`;
        row.state.textContent = `${merc?.down ? "Down" : `${hp} / ${maxHp}`}${merc?.wounds ? ` · ${merc.wounds} wound${merc.wounds === 1 ? "" : "s"}` : ""}${waiting ? " · Waiting" : guarding ? " · Guarding you" : " · Following"}${holdFire ? " · Holding fire" : ""}${away ? (waiting ? " · Not here: Follow calls them to you" : " · Not here") : ""}${ally ? " · Chosen to help" : ""}${merc?.choose ? " · Trusts you more: choose how they grow (More)" : ""}`;
        row.moreButton.hidden = !merc;

        if (merc) {
            this.#grown(row, id, merc);
        }

        row.more.hidden = !merc || this.more !== id;
        row.moreButton.textContent = row.more.hidden ? "More" : "Less";
        row.follow.hidden = !waiting;
        row.wait.hidden = waiting;
        row.face.setAttribute("aria-label", `Help ${name}`);
        row.face.setAttribute("aria-pressed", String(ally));

        if (picture && !row.painted) {
            row.canvas.width = picture.width;
            row.canvas.height = picture.height;
            row.canvas.getContext("2d").putImageData(picture, 0, 0);
            row.painted = true;
            row.face.classList.add("painted");
        }
    }
}
