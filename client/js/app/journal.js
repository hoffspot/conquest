// The journal: a panel over the game (opened with its button, or J) telling the player where they
// stand with their people (core/standing.js):
// - their rank, how far to the next, and what each opens;
// - the requests they carry: who asked, what, how far it's come, where to go and how long's left
//   (each can be given up);
// - their people: who rules, whom they're at war with and allied to, how many towns they hold,
//   and how the other peoples regard them (grudges and favours: docs/WAR.md M7);
// - the requests lately done, failed or given up.
//
// It only shows and asks: what's done is the host's (core/host.js commands), through the game.

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

// "north-east", from a step [dx, dy] (y south)
const COMPASS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];

/** Which way, and how far, somewhere is from a point: "1.2 km north-east", "here". */
export function bearing(from, to) {
    if (!from || !to) {
        return "";
    }

    const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
    const distance = Math.hypot(dx, dy);

    if (distance < 60) {
        return "here";
    }

    const way = COMPASS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];

    return `${distance < 1000 ? `${Math.round(distance / 10) * 10} m` : `${(distance / 1000).toFixed(1)} km`} ${way}`;
}

const STATES = Object.freeze({ done: "Done", failed: "Failed", abandoned: "Given up", void: "Came to nothing" });

/**
 * How a people regards the player's, in words, from what it thinks of them (the war's standing:
 * grudges below 0, favours above): { words, tone ("grudge", "favour" or "none") }.
 */
export function regardOf(standing) {
    if (standing <= -30) {
        return { words: "bear you a deep grudge", tone: "grudge" };
    }

    if (standing < -5) {
        return { words: "bear you a grudge", tone: "grudge" };
    }

    if (standing >= 30) {
        return { words: "are much in your debt", tone: "favour" };
    }

    if (standing > 5) {
        return { words: "owe you a favour", tone: "favour" };
    }

    return { words: "think little of you either way", tone: "none" };
}

export class JournalPanel {
    /** @param {HTMLElement} root - The #hud screen (index.html). */
    constructor(root) {
        this.panel = element("section", "journal");
        this.panel.hidden = true;
        this.panel.setAttribute("role", "dialog");
        this.panel.setAttribute("aria-labelledby", "journaltitle");

        const header = element("header", "journal-header");

        this.title = element("h2", "journal-title", "Journal");
        this.title.id = "journaltitle";
        this.rank = element("p", "journal-rank");
        this.close = element("button", "journal-close");
        this.close.type = "button";
        this.close.setAttribute("aria-label", "Close");
        this.close.title = "Close (Esc)";
        this.close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        this.close.addEventListener("click", () => this.onClose());
        header.append(this.title, this.rank, this.close);

        this.body = element("div", "journal-body");
        this.panel.append(header, this.body);
        root.append(this.panel);

        /** What the player asks (the game does it). */
        this.onAbandon = () => {};
        this.onClose = () => {};
    }

    get open() {
        return !this.panel.hidden;
    }

    /**
     * Show (or show again) where the player stands: { standing: { title, points, from, to, opens,
     * next }, requests: [{ id, title, from, text, progress, where, left }], people: { name,
     * ruler, war: [names], allies: [names], towns, regard: [{ name, words, tone }] }, done: [{
     * title, from, state }] }.
     */
    show({ standing, requests, people, done }) {
        this.rank.textContent = `${standing.title}${people ? ` of ${people.name}` : ""}`;
        this.panel.hidden = false;

        const sections = [];

        // Their rank, and the next
        const rank = element("div", "journal-standing");
        const bar = element("div", "journal-bar");
        const fill = element("div", "journal-fill");

        fill.style.width = `${standing.to === null ? 100 : Math.round(((standing.points - standing.from) / (standing.to - standing.from)) * 100)}%`;
        bar.append(fill);
        rank.append(
            element("p", "journal-line", `${standing.title}: ${standing.opens}`),
            bar,
            element("p", "journal-note", standing.next ? `${standing.to - standing.points} more standing to ${standing.next.title}: ${standing.next.opens}` : "There's no higher to rise."),
        );
        sections.push(this.#section("Standing", rank));

        // What they've been asked
        const list = element("ul", "journal-list requests");

        list.append(
            ...requests.map(({ id, title, from, text, progress, where, left }) => {
                const row = element("li", "journal-request");
                const head = element("div", "journal-request-head");

                head.append(element("span", "journal-request-title", title), element("span", "journal-request-from", from));

                const give = element("button", "journal-button", "Give up");

                give.type = "button";
                give.setAttribute("aria-label", `Give up ${title}`);
                give.addEventListener("click", () => this.onAbandon(id));
                row.append(head, element("p", "journal-request-text", text), element("p", "journal-request-progress", [progress, where, left].filter(Boolean).join(" · ")), give);

                return row;
            }),
        );

        if (!requests.length) {
            list.append(element("li", "journal-empty", "Nothing asked of you. The reeves at the town halls have work for those who want it."));
        }

        sections.push(this.#section("Requests", list));

        // Their people
        if (people) {
            const about = element("div", "journal-people");

            about.append(
                element("p", "journal-line", `Ruled by ${people.ruler}, from ${people.seat}.`),
                element("p", "journal-line", people.war.length ? `At war with ${people.war.join(", ")}.` : "At peace."),
                element("p", "journal-line", people.allies.length ? `Allied with ${people.allies.join(", ")}.` : "Allied with no one."),
                element("p", "journal-note", `${people.towns} ${people.towns === 1 ? "town" : "towns"} held.`),
            );

            // (How the peoples they've met regard them)
            if (people.regard?.length) {
                const regard = element("ul", "journal-list regard");

                regard.append(...people.regard.map(({ name, words, tone }) => element("li", `journal-regard ${tone}`, `${name[0].toUpperCase()}${name.slice(1)} ${words}.`)));
                about.append(regard);
            }
            sections.push(this.#section("Your people", about));
        }

        // What's been done
        if (done.length) {
            const past = element("ul", "journal-list done");

            past.append(
                ...done.map(({ title, from, state }) => {
                    const row = element("li", `journal-done ${state}`);

                    row.append(element("span", "journal-done-title", title), element("span", "journal-done-state", `${STATES[state] ?? state}${from ? ` (${from})` : ""}`));

                    return row;
                }),
            );
            sections.push(this.#section("Lately", past));
        }

        this.body.replaceChildren(...sections);
    }

    hide() {
        this.panel.hidden = true;
    }

    #section(heading, content) {
        const section = element("section", "journal-section");

        section.append(element("h3", "journal-heading", heading), content);

        return section;
    }
}
