// The wait at a place's door while the models of the creatures in it are got ready (beasts/model.js
// readyModels): a card over the game with the place's name, how much of what it needs is here (a
// bar, and so many MB of so many), and each creature ticked once it's read; Go in now once the
// player's waited a while (READYING.patience: those not ready yet drawn as their stand-ins, as
// they'd be met anywhere), and Not now to stay out. Only what's on the screen: the game says when
// it opens, and what's done when it closes (app/game.js #readyAtDoor).

/**
 * How long a wait is before the card shows (ms: what's kept already is read in less, and nothing's
 * shown); before Go in now's offered; and how often the card's brought up to date.
 */
export const READYING = Object.freeze({ grace: 250, patience: 5000, every: 200 });

// Bytes as megabytes, a decimal place
const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

/** What the card says of how far it's got: "3.1 of 9.2 MB". A pure function. */
export function amountOf({ received, bytes }) {
    return `${mb(Math.min(received, bytes))} of ${mb(bytes)} MB`;
}

export class Readying {
    /** The card: the page's #readying (index.html). */
    constructor(root = document) {
        this.card = root.querySelector("#readying");
        this.timers = [];
        this.open = false;
        this.card.querySelector("#readyinggo").addEventListener("click", () => this.#close("go"));
        this.card.querySelector("#readyingback").addEventListener("click", () => this.#close("back"));
        this.card.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                this.#close("back");
            }
        });
    }

    /**
     * Shows the wait for `name` (the place), for its creatures (`kinds`: [{ id, name }]), how far
     * it's got asked of `progress()` ({ received, bytes, read: the kinds read }) every so often; a
     * moment after it's asked (READYING.grace), so a quick one's never seen. `onClose(how)` once
     * it's closed: "go" (Go in now), "back" (Not now, or Escape), or "ready" (all of it ready:
     * ready()).
     */
    show({ name, kinds, progress, onClose }) {
        this.#clear();
        this.open = true;
        this.onClose = onClose;
        this.progress = progress;
        this.card.querySelector("#readyingname").textContent = name;
        this.card.querySelector("#readyinglist").replaceChildren(
            ...kinds.map(({ id, name: label }) => {
                const item = document.createElement("li");

                item.dataset.kind = id;
                item.append(Object.assign(document.createElement("span"), { textContent: label }), Object.assign(document.createElement("span"), { className: "size", textContent: "…" }));

                return item;
            }),
        );
        this.card.querySelector("#readyinggo").hidden = true;
        this.#update();
        this.timers.push(
            setTimeout(() => {
                if (this.open) {
                    this.card.hidden = false;
                    this.card.querySelector("#readyingback").focus({ preventScroll: true });
                }
            }, READYING.grace),
            setTimeout(() => {
                this.card.querySelector("#readyinggo").hidden = false;
            }, READYING.patience),
            setInterval(() => this.#update(), READYING.every),
        );
    }

    /** All of it ready: closed, and the game told ("ready"). */
    ready() {
        if (this.open) {
            this.#update();
            this.#close("ready");
        }
    }

    // How far it's got: the bar, the amount, each creature ticked once read
    #update() {
        const now = this.progress();
        const share = now.bytes > 0 ? Math.min(1, now.received / now.bytes) : 1;
        const bar = this.card.querySelector("#readyingbar");

        bar.querySelector(".fill").style.transform = `scaleX(${share})`;
        bar.setAttribute("aria-valuenow", String(Math.round(share * 100)));
        this.card.querySelector("#readyingamount").textContent = amountOf(now);

        for (const item of this.card.querySelectorAll("#readyinglist li")) {
            const done = now.read.includes(item.dataset.kind);

            item.classList.toggle("done", done);
            item.querySelector(".size").textContent = done ? "Ready" : "…";
        }
    }

    #close(how) {
        if (!this.open) {
            return;
        }

        this.#clear();
        this.open = false;
        this.card.hidden = true;
        this.onClose?.(how);
    }

    #clear() {
        for (const timer of this.timers) {
            clearTimeout(timer);
            clearInterval(timer);
        }

        this.timers = [];
    }
}
