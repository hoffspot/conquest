// The talk: a panel across the bottom of the screen while the player talks to someone
// (core/dialogue.js): who they are (their name, and what they are under it), what they're
// saying, and what the player can say back, one button each (or its number on a keyboard).
// Choosing one says it; the last of a talk, or the cross, ends it.

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

export class TalkPanel {
    /** @param {HTMLElement} root - The #hud screen (index.html). */
    constructor(root) {
        this.panel = element("section", "talk");
        this.panel.hidden = true;
        this.panel.setAttribute("role", "dialog");
        this.panel.setAttribute("aria-labelledby", "talkname");
        this.panel.setAttribute("aria-describedby", "talkline");

        const header = element("header", "talk-header");
        const who = element("div", "talk-who");

        this.name = element("h2", "talk-name");
        this.name.id = "talkname";
        this.title = element("p", "talk-title");
        this.close = element("button", "talk-close");
        this.close.type = "button";
        this.close.setAttribute("aria-label", "Stop talking");
        this.close.title = "Stop talking (Esc)";
        this.close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        this.close.addEventListener("click", () => this.onClose());
        who.append(this.name, this.title);
        header.append(who, this.close);

        this.line = element("p", "talk-line");
        this.line.id = "talkline";
        this.line.setAttribute("aria-live", "polite");
        this.choices = element("ol", "talk-choices");
        this.panel.append(header, this.line, this.choices);
        root.append(this.panel);

        /** Called with the index of the choice made, and when the cross is pressed. */
        this.onChoose = () => {};
        this.onClose = () => {};
    }

    /** Is it showing? */
    get open() {
        return !this.panel.hidden;
    }

    /** Show a talk with someone ({ name, title }), at what they're saying now. */
    show({ name, title }, said) {
        this.name.textContent = name;
        this.title.textContent = title;
        this.panel.hidden = false;
        this.update(said);
    }

    /** What they're saying now ({ line, choices: [{ text, ends }] }), and the replies to it. */
    update({ line, choices }) {
        this.line.textContent = line;

        // (Played again for each line: the words fade in)
        this.line.classList.remove("said");
        void this.line.offsetWidth;
        this.line.classList.add("said");

        this.choices.replaceChildren(...choices.map(({ text, ends }, index) => {
            const item = element("li");
            const button = element("button", `talk-choice${ends ? " ends" : ""}`);

            button.type = "button";
            button.append(element("span", "talk-key", String(index + 1)), element("span", "talk-text", text));
            button.addEventListener("click", () => this.onChoose(index));
            item.append(button);

            return item;
        }));
    }

    hide() {
        this.panel.hidden = true;
        this.choices.replaceChildren();
    }

    /** The replies' buttons (for keyboards and tests). */
    get buttons() {
        return [...this.choices.querySelectorAll("button")];
    }
}
