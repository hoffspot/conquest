// The game's heads-up display, drawn with the page (not in 3D): the player's name and health,
// a name and health bar over every other character, numbers for the damage each blow does, and
// messages across the middle of the screen. Under a health bar, an orange bar shows stamina
// while it isn't full; under that, an icon for each thing lingering on them (poison, a web...) on
// a blood-red disc, then each spell lasting on them (a ward, Reflect...) and each boon (a
// blessing) on a sapphire tile, darkening round as it wears off: in one row as wide as the bars,
// the last that won't fit an ellipsis, all of them shown while the player's card is held. A choice
// to be made (who to summon; whether to go to someone summoning them) asked in a small panel.
// Once they've registered with the adventurers' guilds, their rank shows on their card by their
// name, a chip of its metal (Copper to Mithril).

import { ICONS, useDefs } from "./icons.js";

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

/**
 * How the bars over the others shrink and fade the farther their characters are from the player's
 * own: full size within `near` metres of them, and beyond that smaller and fainter evenly with the
 * distance, gone at the edge of sight (`far` metres; less far where it's dark, as the battle sees
 * it: light.js sightAt), so how big a bar is says how near its character is.
 */
export const PLATE_SIZE = Object.freeze({ near: 12, far: 60 });

/** How long the player's card is held (ms), not moving more than HOLD_MOVE pixels, to show all that's on them. */
export const HOLD_MS = 500;
const HOLD_MOVE = 10;

/**
 * How big a bar's drawn (a share of its full size, and as faint: 0, not at all) over a character
 * `distance` metres from the player's, `sight` of the way as far as by day seen where it is
 * (light.js sightAt).
 */
export function plateScale(distance, sight = 1) {
    const far = PLATE_SIZE.far * sight;
    const near = Math.min(PLATE_SIZE.near, far);

    if (distance <= near) {
        return 1;
    }

    return distance >= far ? 0 : (far - distance) / (far - near);
}

export class Hud {
    /** @param {HTMLElement} root - The #hud screen (index.html). */
    constructor(root) {
        this.root = root;
        this.plate = root.querySelector("#playerplate");
        this.floaters = root.querySelector("#floaters");
        this.banner = root.querySelector("#banner");
        this.netStatus = root.querySelector("#netstatus");

        /** The minimap's canvas (app/minimap.js draws it). */
        this.map = root.querySelector("#minimap");
        this.tracked = new Map();

        /** The id of the player the plate's for (this game's own: app/game.js me). */
        this.playerId = "player";
        this.bannerTimer = null;
        this.targeted = null;

        /** Hears each message told across the screen (text, seconds): the game's, to keep the last (journal.js). */
        this.onMessage = () => {};

        // Held, the player's card grows to show all that's on them (not one row of it, the rest
        // an ellipsis); a tap, or held again, and it's back
        let held = null;
        const letGo = () => {
            clearTimeout(held?.timer);
            held = null;
        };

        this.plate.addEventListener("pointerdown", (event) => {
            letGo();

            const opened = this.plate.classList.contains("all");

            held = { x: event.clientX, y: event.clientY, timer: setTimeout(() => this.showAll(!opened), HOLD_MS) };

            if (opened) {
                // (Open: a tap shuts it)
                held.tap = true;
            }
        });
        this.plate.addEventListener("pointermove", (event) => {
            if (held && Math.hypot(event.clientX - held.x, event.clientY - held.y) > HOLD_MOVE) {
                letGo();
            }
        });
        this.plate.addEventListener("pointerup", () => {
            if (held?.tap) {
                this.showAll(false);
            }

            letGo();
        });
        this.plate.addEventListener("pointercancel", letGo);
        this.plate.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    /** Show all that's on the player on their card (`all`), or one row of it, the rest an ellipsis. */
    showAll(all = true) {
        this.plate.classList.toggle("all", all);

        const row = this.plate.querySelector(".ails");

        if (row) {
            this.#fit(row);
        }
    }

    /** Show the player's name, health and stamina (their id: what's said of them after). */
    setPlayer({ id = "player", name, hp, maxHp, stamina = maxHp, maxStamina = maxHp }) {
        this.playerId = id;
        this.plate.querySelector(".name").textContent = name;
        this.#setBar(this.plate, hp, maxHp);
        this.#setStamina(this.plate, stamina, maxStamina);
    }

    /**
     * Show a bar over another character (hostile ones in red; a fortification's, `kind` "fort",
     * or a camp's stakes hacked at, "stakes", broader and heavier, as strong as it stands; one of
     * the wild's elites', core/creatures.js ELITES, edged and named in gold).
     */
    track(id, { name, hp, maxHp, stamina = maxHp, maxStamina = maxHp, hostile = true, wild = null, kind = null }) {
        const level = wild?.tier ?? null;
        const plate = element("div", `floater plate${hostile ? " hostile" : ""}${kind === "fort" || kind === "stakes" ? " fort" : ""}${wild?.elite ? " elite" : ""}`);
        const bar = element("div", "bar");
        const breath = element("div", "bar stamina");

        bar.append(element("div", "fill"), element("span", "value"));
        breath.append(element("div", "fill"), element("span", "value"));
        breath.hidden = true;
        plate.append(element("span", "name", name), bar, breath);
        plate.dataset.id = id;

        // (A creature of the wild's: its level, by its name)
        if (level) {
            plate.querySelector(".name").append(element("span", "level", String(level)));
        }
        this.floaters.append(plate);
        this.tracked.set(id, plate);
        this.setHealth(id, hp, maxHp);
        this.setStamina(id, stamina, maxStamina);
    }

    /**
     * Show the player's rank in the adventurers' guilds on their card, by their name: a chip of
     * its metal (`card`: game.js guildCard, { title, merit, to, next }), or none till they register.
     */
    setGuild(card) {
        const chip = this.plate.querySelector(".guild");

        if (!chip) {
            return;
        }

        chip.hidden = !card;
        this.plate.classList.toggle("guilded", Boolean(card));

        if (card) {
            const told = `Adventurers' Guild: ${card.title} rank${card.next ? `, ${card.to - card.merit} merit to ${card.next.title}` : ""}`;

            chip.textContent = card.title;
            chip.dataset.rank = card.title.toLowerCase();
            chip.title = told;
            chip.setAttribute("aria-label", told);
        }
    }

    /** Show how much gold the player has, under their name. */
    setGold(gold) {
        const coins = this.plate.querySelector(".coins");

        if (coins) {
            coins.textContent = `${gold} gold`;
        }
    }

    /** Take away the bar over a character (gone from the world). */
    untrack(id) {
        this.tracked.get(id)?.remove();
        this.tracked.delete(id);

        if (this.targeted === id) {
            this.targeted = null;
        }
    }

    /** Change a character's health (the player's plate, or its bar). */
    setHealth(id, hp, maxHp) {
        const plate = this.#plateOf(id);

        if (plate) {
            this.#setBar(plate, hp, maxHp);
        }
    }

    /**
     * Show what's lingering on a character (the player's plate, or over another's bar): an icon
     * for each ([{ kind, icon (an ICONS key), label, left (the share of its time still to go),
     * buff (what does them good: a spell lasting on them, a boon; not an affliction) }]), or
     * none.
     */
    setAfflictions(id, ailments) {
        const plate = this.#plateOf(id);

        if (!plate) {
            return;
        }

        let row = plate.querySelector(".ails");

        if (!ailments.length) {
            row?.remove();

            return;
        }

        if (!row) {
            row = element("div", "ails");
            plate.append(row);
        }

        // (Made again only when what's on them, or its order, changes; how long each has to go,
        // every time)
        const key = ailments.map(({ kind, icon }) => `${kind}:${icon}`).join(",");

        if (row.dataset.key !== key) {
            const more = element("span", "ail more", "…");

            // (The icons' gradients and glows in the page, as the wheels and the pack put them:
            // the plate may show one before either's been opened)
            useDefs(this.root.ownerDocument);

            more.setAttribute("role", "img");
            row.dataset.key = key;
            row.replaceChildren(
                ...ailments.map(({ kind, icon, label, buff = false }) => {
                    const each = element("span", `ail ail-${kind}${buff ? " buff" : ""}`);

                    each.title = label;
                    each.setAttribute("role", "img");
                    each.setAttribute("aria-label", label);
                    each.innerHTML = `<svg viewBox="-24 -24 48 48" aria-hidden="true">${ICONS[icon] ?? ""}</svg>`;

                    return each;
                }),
                more,
            );
            this.#fit(row);
        }

        ailments.forEach(({ left }, index) => row.children[index]?.style.setProperty("--left", Math.max(0, Math.min(1, left)).toFixed(3)));
    }

    // One row of what's on someone, as wide as their bars: as many as fit, the last of them an
    // ellipsis if not all do (all of them on the player's card while it's held open)
    #fit(row) {
        const icons = [...row.children].filter((each) => !each.classList.contains("more"));
        const more = row.querySelector(".more");

        for (const each of icons) {
            each.hidden = false;
        }

        more.hidden = true;

        if (row.closest(".plate")?.classList.contains("all") || row.scrollWidth <= row.clientWidth + 1) {
            return;
        }

        more.hidden = false;

        let shown = icons.length;

        while (shown > 1 && row.scrollWidth > row.clientWidth + 1) {
            icons[--shown].hidden = true;
        }

        const hidden = icons.length - shown;

        more.title = `${hidden} more: hold your card to see them all`;
        more.setAttribute("aria-label", more.title);
    }

    /** Change a character's stamina: its orange bar, shown while it isn't full. */
    setStamina(id, stamina, maxStamina) {
        const plate = this.#plateOf(id);

        if (plate) {
            this.#setStamina(plate, stamina, maxStamina);
        }
    }

    /** Mark the character the player is set to fight (its bar lit up), or no one (null). */
    setTarget(id) {
        if (id === this.targeted) {
            return;
        }

        this.tracked.get(this.targeted)?.classList.remove("targeted");
        this.targeted = id;
        this.tracked.get(id)?.classList.add("targeted");
    }

    /**
     * Move a character's bar to a point on the screen (client pixels), or hide it (null): drawn at
     * `scale` of its size and as faint (plateScale; hidden at none), standing on the point; the
     * nearer (`depth`: metres from the camera) over the farther, the one the player's set to fight
     * over them all.
     */
    place(id, point, { scale = 1, depth = 0 } = {}) {
        const plate = this.tracked.get(id);

        if (!plate) {
            return;
        }

        plate.hidden = !point || scale <= 0;

        if (!plate.hidden) {
            const faint = scale.toFixed(2);

            plate.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;

            if (plate.faint !== faint) {
                plate.faint = faint;
                plate.style.opacity = faint;
            }

            const layer = id === this.targeted ? 10000 : Math.max(1, 9999 - Math.round(depth));

            if (plate.layer !== layer) {
                plate.layer = layer;
                plate.style.zIndex = String(layer);
            }
        }
    }

    /**
     * Arrows at the screen's edge for those attacking the player out of view, each pointing the
     * way to them: [{ x, y (client pixels), angle (radians, clockwise from pointing up) }]; the
     * rest hidden.
     */
    threats(arrows) {
        this.arrows ??= [];

        // (Their own layer, over the buttons and the quick actions: styles.css #threats)
        if (!this.threatLayer) {
            this.threatLayer = element("div", "");
            this.threatLayer.id = "threats";
            this.threatLayer.setAttribute("aria-hidden", "true");
            this.root.append(this.threatLayer);
        }

        while (this.arrows.length < arrows.length) {
            const arrow = element("div", "threat");

            this.threatLayer.append(arrow);
            this.arrows.push(arrow);
        }

        this.arrows.forEach((arrow, k) => {
            const at = arrows[k];

            arrow.hidden = !at;

            if (at) {
                arrow.style.transform = `translate3d(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${at.angle.toFixed(3)}rad)`;
            }
        });
    }

    /**
     * A number rising from a point on the screen: the damage a blow did (or "Miss"), or `kind`
     * "heal" (green: hit points back) or "stun" (the word, in gold).
     */
    damage(point, text, { toPlayer = false, kind = "" } = {}) {
        if (!point) {
            return;
        }

        const number = element("div", `damage${toPlayer ? " to-player" : ""}${kind ? ` ${kind}` : ""}`, String(text));

        number.style.left = `${point.x.toFixed(1)}px`;
        number.style.top = `${point.y.toFixed(1)}px`;
        number.style.setProperty("--drift", `${(Math.random() * 40 - 20).toFixed(0)}px`);
        number.addEventListener("animationend", () => number.remove());
        this.floaters.append(number);
    }

    /** A message across the middle of the screen, for `seconds` (or until the next one). */
    message(text, seconds = 3) {
        clearTimeout(this.bannerTimer);
        this.banner.textContent = text;
        this.banner.hidden = !text;

        if (text) {
            this.onMessage(text, seconds);
        }

        if (text && seconds) {
            this.bannerTimer = setTimeout(() => (this.banner.hidden = true), seconds * 1000);
        }
    }

    /** How playing together's going, while it isn't as it should (text), or nothing (null). */
    status(text) {
        this.netStatus.textContent = text ?? "";
        this.netStatus.hidden = !text;
    }

    /**
     * A message with something to be done about it (a button, `action`: "Undo"), for a while:
     * the button tapped, `onAction` is heard and the message goes.
     */
    offer(text, action, onAction, seconds = 6) {
        const act = document.createElement("button");

        this.message(text, seconds);
        act.type = "button";
        act.className = "banner-action";
        act.textContent = action;
        act.addEventListener("click", () => {
            this.message("");
            onAction();
        });
        this.banner.append(" ", act);
    }

    /**
     * Ask the player to choose (`title`; `options`: [{ label, value }]), in a small panel over
     * the middle of the screen: `onChoose` hears the value chosen, or nothing (`cancel`'s label, if
     * there's a way out: null for none), or `lapse` (a value) if `seconds` go by first. Asked
     * again, the last is forgotten (heard as cancelled). Returns a way to withdraw it.
     */
    choose(title, options, onChoose, { cancel = "Cancel", seconds = null, lapse = undefined } = {}) {
        this.choice?.withdraw();

        const panel = element("div", "choice");
        const heading = element("p", "choice-title", title);
        const buttons = element("div", "choice-options");
        let timer = null;
        const done = (value) => {
            clearTimeout(timer);
            panel.remove();

            if (this.choice === asked) {
                this.choice = null;
            }

            onChoose(value);
        };
        const asked = { withdraw: () => done(undefined), panel };

        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", title);

        for (const { label, value } of options) {
            const button = element("button", "button choice-option", label);

            button.type = "button";
            button.addEventListener("click", () => done(value));
            buttons.append(button);
        }

        if (cancel) {
            const button = element("button", "button choice-cancel", cancel);

            button.type = "button";
            button.addEventListener("click", () => done(undefined));
            buttons.append(button);
        }

        panel.append(heading, buttons);
        this.root.append(panel);
        this.choice = asked;

        if (seconds) {
            timer = setTimeout(() => done(lapse), seconds * 1000);
        }

        return asked;
    }

    /**
     * Ask how long to camp, in a panel as `choose` asks: so many of the world's hours (− and +,
     * `least` to `most`, starting at `hours`), till sundown, or till the morning (each with how
     * many hours off it is: `sundown`, `morning`). `onChoose` hears { hours }, "sundown" or
     * "morning", or nothing (cancelled). Returns a way to withdraw it.
     */
    chooseCamp({ hours = 8, least = 1, most = 24, sundown, morning }, onChoose) {
        const off = (wait) => (wait < 1 ? "within the hour" : `about ${Math.round(wait)} h`);
        const asked = this.choose("Make camp", [{ label: `Until sundown (${off(sundown)})`, value: "sundown" }, { label: `Until morning (${off(morning)})`, value: "morning" }], onChoose);
        const buttons = asked.panel.querySelector(".choice-options");
        const row = element("div", "camp-hours");
        const less = element("button", "button camp-step", "−");
        const more = element("button", "button camp-step", "+");
        const count = element("span", "camp-count");
        const sleep = element("button", "button choice-option camp-sleep");
        let chosen = Math.max(least, Math.min(most, hours));
        const show = () => {
            count.textContent = `${chosen} hour${chosen === 1 ? "" : "s"}`;
            sleep.textContent = `Sleep ${chosen} hour${chosen === 1 ? "" : "s"}`;
            less.disabled = chosen <= least;
            more.disabled = chosen >= most;
        };

        for (const [button, by, label] of [
            [less, -1, "An hour less"],
            [more, 1, "An hour more"],
        ]) {
            button.type = "button";
            button.setAttribute("aria-label", label);
            button.addEventListener("click", () => {
                chosen = Math.max(least, Math.min(most, chosen + by));
                show();
            });
        }

        sleep.type = "button";
        sleep.addEventListener("click", () => {
            asked.panel.remove();

            if (this.choice === asked) {
                this.choice = null;
            }

            onChoose({ hours: chosen });
        });
        row.append(less, count, more);
        buttons.prepend(row, sleep);
        show();

        return asked;
    }

    /** Remove every floating bar and number. */
    clear() {
        this.floaters.replaceChildren();
        this.tracked.clear();
        this.targeted = null;
        this.message("");
        this.choice?.withdraw();
    }

    #plateOf(id) {
        return this.tracked.get(id) ?? (id === this.playerId ? this.plate : null);
    }

    #setBar(plate, hp, maxHp) {
        const share = maxHp ? Math.max(0, hp / maxHp) : 0;
        const bar = plate.querySelector(".bar:not(.stamina)");

        bar.querySelector(".fill").style.transform = `scaleX(${share.toFixed(3)})`;
        bar.querySelector(".value").textContent = `${hp} / ${maxHp}`;
        plate.classList.toggle("low", share <= 0.3);
        plate.setAttribute("aria-label", `${hp} of ${maxHp} hit points`);
    }

    // (Every frame, so it changes the page only when what it shows changes)
    #setStamina(plate, stamina, maxStamina) {
        const bar = plate.querySelector(".bar.stamina");
        const shown = stamina >= maxStamina ? "full" : `${stamina.toFixed(2)} / ${maxStamina}`;

        if (!bar || bar.dataset.shown === shown) {
            return;
        }

        bar.dataset.shown = shown;
        bar.hidden = stamina >= maxStamina;

        if (!bar.hidden) {
            bar.querySelector(".fill").style.transform = `scaleX(${Math.max(0, stamina / maxStamina).toFixed(3)})`;
            bar.querySelector(".value").textContent = `${Math.floor(stamina)} / ${maxStamina}`;
            bar.setAttribute("aria-label", `${Math.floor(stamina)} of ${maxStamina} stamina`);
        }
    }
}
