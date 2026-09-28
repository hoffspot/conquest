// The war's great turns for the player's people (docs/WAR.md M10): their victory; brought under
// another people, or fallen; risen again; their rule over the continent undone. Told in a panel
// over the game, which plays on once it's been read ("Play on").
//
// It only shows: what's happened is the war's (core/war/war.js), told by the host (core/host.js,
// its "fate" events).

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

const capital = (text) => `${text[0].toUpperCase()}${text.slice(1)}`;

/**
 * What's told of each turn of the war for the player's people: { title, text, tone ("won",
 * "lost" or "hope") }, from the fate (host.js #fate), their people (`own`: "the Humans"), the
 * people it's to do with (`by`), and the town, if there's one (`town`: its name). Null for a
 * fate that isn't told in the panel (restless: told in a word).
 */
export function fateWords({ fate, own, by, town = null }) {
    const Own = capital(own);

    switch (fate) {
        case "victory":
            return {
                title: "Victory",
                text: `Every people bows to ${own}. The continent is yours, and your rulers raise you up for your part in it. Those brought under you may yet rise: hold what's won.`,
                tone: "won",
            };
        case "serving":
            return {
                title: "The continent is theirs",
                text: `Every people bows to ${by}, and ${own} serve them. Serve, and stir your people while you do: one day they'll rise.`,
                tone: "lost",
            };
        case "defeat":
            return {
                title: "Defeat",
                text: `Every people bows to ${by}. ${Own} hold nothing, but they're not gone: the towns that were theirs remember. Stir them, and they'll rise.`,
                tone: "lost",
            };
        case "subjugated":
            return {
                title: "Brought under",
                text: `${Own}' seat has fallen, and they bend the knee to ${by}. You serve them now: their enemies are yours, and their halls have work for you. But not forever. Do what your own rulers ask, and your people will stir, until they're ready to rise.`,
                tone: "lost",
            };
        case "fallen":
            return {
                title: "Fallen",
                text: `${Own} hold no town any more. But they're still out there, in the towns that were theirs. Bring down those who hold them, take the guilds' work, and your people will stir, until they rise again.`,
                tone: "lost",
            };
        case "risen":
            return {
                title: "Risen!",
                text: `${Own} have risen against ${by}${town ? `, and taken back ${town}` : ""}! Now hold what you've won back.`,
                tone: "hope",
            };
        case "undone":
            return {
                title: "Rule broken",
                text: `${Own} no longer rule the whole continent: those brought under them have risen. The war goes on.`,
                tone: "lost",
            };
        default:
            return null;
    }
}

export class FatePanel {
    /** @param {HTMLElement} root - The #hud screen (index.html). */
    constructor(root) {
        this.panel = element("section", "fate");
        this.panel.hidden = true;
        this.panel.setAttribute("role", "alertdialog");
        this.panel.setAttribute("aria-labelledby", "fatetitle");
        this.panel.setAttribute("aria-describedby", "fatetext");

        this.title = element("h2", "fate-title");
        this.title.id = "fatetitle";
        this.text = element("p", "fate-text");
        this.text.id = "fatetext";
        this.button = element("button", "fate-button", "Play on");
        this.button.type = "button";
        this.button.addEventListener("click", () => this.hide());
        this.panel.append(this.title, this.text, this.button);
        root.append(this.panel);

        /** Told when it's closed. */
        this.onClose = () => {};
    }

    get open() {
        return !this.panel.hidden;
    }

    /** Tell of a turn of the war: { title, text, tone } (fateWords). */
    show({ title, text, tone }) {
        this.title.textContent = title;
        this.text.textContent = text;
        this.panel.dataset.tone = tone;
        this.panel.hidden = false;
        this.button.focus({ preventScroll: true });
    }

    hide() {
        if (this.open) {
            this.panel.hidden = true;
            this.onClose();
        }
    }
}
