// The game's heads-up display, drawn with the page (not in 3D): the player's name and health, a
// name and health bar over every other character, numbers for the damage each blow does, and
// messages across the middle of the screen (in a fight, moved up under the buttons or down over the
// quick actions where they'd cover those fighting). Down the right side, an icon for each of those
// attacking the player: a likeness of them in a red frame, a thin line of their health along its
// foot, whoever the player's set on glowing and pulsing; tapped or held, the game's told. Under a
// health bar, an orange bar shows stamina while it isn't full; under that, an icon for each thing
// lingering on them (poison, a web...) on a blood-red disc, then each spell lasting on them (a
// ward, Reflect...) and each boon (a blessing) on a sapphire tile, darkening round as it wears off:
// in one row as wide as the bars, the last that won't fit an ellipsis, all of them shown while the
// player's card is held. A choice to be made (who to summon; whether to go to someone summoning
// them) asked in a small panel. Once they've registered with the adventurers' guilds, their rank
// shows on their card by their name, a chip of its metal (Copper to Mithril). Down the left side,
// under the minimap, an icon for each of the player's party (their hired adventurers, the creatures
// they've called, the dead they've raised), a likeness in a green frame, the one they've chosen to
// help glowing; tapped or held, the game's told.

import { ICONS, useDefs } from "./icons.js";

// How far a message is kept from the buttons along the top and the quick actions (pixels); and
// with no quick actions up, how far from the bottom it can come
const MESSAGE_GAP = 10;
const MESSAGE_LOW = 150;

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
 * The party's icons down the left side (pixels): as big as `most` while they fit between the
 * minimap and the thumb stick (or the bottom of the screen, `margin` from it), shrunk to fit as
 * small as `least`, `gap` between them; and more than fit at that, the last a "+N" chip for the rest.
 */
export const PARTY_ICON = Object.freeze({ most: 44, least: 30, gap: 6, margin: 16 });

/**
 * How the party's icons fit `count` of them into `room` pixels down the side (PARTY_ICON): how
 * big each is, how many are shown, and how many are left for the "+N" chip (0: none).
 */
export function partyFit(count, room) {
    const { most, least, gap } = PARTY_ICON;
    const size = Math.min(most, Math.floor((room - (count - 1) * gap) / Math.max(1, count)));

    if (size >= least || count === 0) {
        return { size: Math.max(least, size), shown: count, more: 0 };
    }

    // (At their least, as many as fit with the chip under them)
    const shown = Math.max(0, Math.floor((room + gap) / (least + gap)) - 1);

    return { size: least, shown, more: count - shown };
}

// Taps and holds on an icon (an attacker's, one of the party's), each told `onPress` (gesture "tap"
// or "hold", { time: ms, as performance.now(), x, y: where the finger is, pixels, pointerId }):
// held HOLD_MS, not moving off it (HOLD_MOVE), a hold; let go before then, a tap; pressed from the
// keyboard, a tap
function pressable(root, onPress) {
    let held = null;
    const letGo = () => {
        clearTimeout(held?.timer);
        held = null;
    };

    root.addEventListener("pointerdown", (event) => {
        letGo();

        const press = { x: event.clientX, y: event.clientY, at: [event.clientX, event.clientY], done: false };

        press.timer = setTimeout(() => {
            press.done = true;
            onPress("hold", { time: performance.now(), x: press.at[0], y: press.at[1], pointerId: event.pointerId });
        }, HOLD_MS);
        held = press;
    });
    root.addEventListener("pointermove", (event) => {
        if (held && !held.done) {
            held.at = [event.clientX, event.clientY];

            if (Math.hypot(event.clientX - held.x, event.clientY - held.y) > HOLD_MOVE) {
                letGo();
            }
        }
    });
    root.addEventListener("pointerup", (event) => {
        if (held && !held.done) {
            onPress("tap", { time: event.timeStamp, x: event.clientX, y: event.clientY, pointerId: event.pointerId });
        }

        letGo();
    });
    root.addEventListener("pointercancel", letGo);
    root.addEventListener("contextmenu", (event) => event.preventDefault());

    // (Pressed from the keyboard, as a tap)
    root.addEventListener("click", (event) => {
        if (event.detail === 0) {
            const { left, top, width, height } = root.getBoundingClientRect();

            onPress("tap", { time: performance.now(), x: left + width / 2, y: top + height / 2, pointerId: null });
        }
    });
}

// What each kind of the party's called, said with their name
const PARTY_KINDS = { player: "player", adventurer: "hired adventurer", summon: "called to your side", risen: "raised from the dead", unit: "with you" };

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

/**
 * Where a message goes to keep clear of those fighting (`rects`: { left, top, right, bottom }
 * each, pixels), as big as it is (`size`: { width, height }): of the places it can go (`places`:
 * { x, top } each, pixels, `x` its middle across; the first where it goes as a rule), the one
 * it's at (`now`: an index) while that's clear of them all, else the first that is, else the one
 * over least of them. Returns an index into `places`.
 */
export function messagePlace(places, rects, { width, height }, now = null) {
    const over = ({ x, top }) => rects.reduce((sum, rect) => sum + Math.max(0, Math.min(x + width / 2, rect.right) - Math.max(x - width / 2, rect.left)) * Math.max(0, Math.min(top + height, rect.bottom) - Math.max(top, rect.top)), 0);

    if (now !== null && now < places.length && over(places[now]) === 0) {
        return now;
    }

    let best = 0;
    let least = Infinity;

    for (const [k, place] of places.entries()) {
        const covered = over(place);

        if (covered === 0) {
            return k;
        }

        if (covered < least - 1e-6) {
            [best, least] = [k, covered];
        }
    }

    return best;
}

export class Hud {
    /** @param {HTMLElement} root - The #hud screen (index.html). */
    constructor(root) {
        this.root = root;
        this.plate = root.querySelector("#playerplate");
        this.floaters = root.querySelector("#floaters");
        this.banner = root.querySelector("#banner");
        this.top = root.querySelector(".hud-top");
        this.quick = root.querySelector(".quickbar");

        // (Which of the places a message can go it's at in a fight, or null: where it goes as a rule)
        this.bannerAt = null;
        this.netStatus = root.querySelector("#netstatus");

        /** The minimap's canvas (app/minimap.js draws it). */
        this.map = root.querySelector("#minimap");

        /** The column down the left for the player's party (party), headed by the Party button. */
        this.partyColumn = root.querySelector("#party");
        this.partyButton = root.querySelector("#partybutton");
        this.tracked = new Map();

        /** The id of the player the plate's for (this game's own: app/game.js me). */
        this.playerId = "player";
        this.bannerTimer = null;
        this.targeted = null;

        /** Hears each message told across the screen (text, seconds): the game's, to keep the last (journal.js). */
        this.onMessage = () => {};

        /**
         * Hears an attacker's icon (attackers) tapped or held: (id, "tap" or "hold", when: ms, as
         * performance.now()).
         */
        this.onAttacker = () => {};

        /**
         * Hears one of the party's icons (party) tapped or held: (id, "tap" or "hold", { time: ms,
         * as performance.now(), x, y: where the finger is, pixels, pointerId: the finger still
         * down, held, or null }); and the "+N" chip for the rest of them tapped.
         */
        this.onPartyMember = () => {};
        this.onPartyMore = () => {};

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
    track(id, { name, hp, maxHp, stamina = maxHp, maxStamina = maxHp, hostile = true, wild = null, kind = null, ally = false }) {
        const level = wild?.tier ?? null;
        const plate = element("div", `floater plate${hostile ? " hostile" : ""}${ally ? " ally" : ""}${kind === "fort" || kind === "stakes" ? " fort" : ""}${wild?.elite ? " elite" : ""}`);
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

    /** Mark another character as one of the player's party (its name in green), or not. */
    setAlly(id, ally) {
        this.tracked.get(id)?.classList.toggle("ally", ally);
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

    /**
     * Keep a message clear of those fighting (`rects`: where each is on the page, { left, top,
     * right, bottom }, pixels, their name and bar over them too): where it goes as a rule (28% of
     * the way down) if that's clear of them, else just under the buttons along the top (and the
     * minimap, on a screen so narrow it would reach under it), else just over the quick actions
     * (or the bottom), else at the left of the screen or its right (left of the attackers' icons),
     * a little up from half way; the one over least of them if none is, never over the icons where
     * it can help it. None fighting, back where it goes as a rule.
     */
    keepClear(rects) {
        if (this.banner.hidden || !rects.length) {
            if (this.bannerAt !== null) {
                this.bannerAt = null;
                this.banner.style.translate = "";
            }

            return;
        }

        const screen = this.root.getBoundingClientRect();
        const { offsetWidth: width, offsetHeight: height } = this.banner;
        // (Under the buttons, and the minimap too where it reaches under the message: a narrow screen)
        const map = !this.map.hidden && this.map.getBoundingClientRect();
        const reaches = map && map.right > screen.left + (screen.width - width) / 2;
        const under = Math.max(this.top?.getBoundingClientRect().bottom ?? screen.top, reaches ? map.bottom : screen.top) - screen.top + MESSAGE_GAP;
        const quick = this.quick?.classList.contains("up") ? this.quick.getBoundingClientRect().top : screen.bottom - MESSAGE_LOW;
        // (Clear of the attackers' icons down the right side, too)
        const icons = this.attackerColumn && !this.attackerColumn.hidden ? this.attackerColumn.getBoundingClientRect() : null;
        const [middle, usual, aside, low] = [screen.width / 2, screen.height * 0.28, MESSAGE_GAP + width / 2, screen.height * 0.45 - height / 2];
        const places = [
            { x: middle, top: usual },
            { x: middle, top: under },
            { x: middle, top: quick - screen.top - MESSAGE_GAP - height },
            { x: Math.min(middle, aside), top: low },
            { x: Math.max(middle, (icons ? icons.left - screen.left : screen.width) - aside), top: low },
        ];
        const at = messagePlace(
            places,
            [...rects, ...(icons ? [icons] : [])].map(({ left, top, right, bottom }) => ({ left: left - screen.left, top: top - screen.top, right: right - screen.left, bottom: bottom - screen.top })),
            { width, height },
            this.bannerAt,
        );

        if (at !== this.bannerAt) {
            this.bannerAt = at;
            // (Moved from where it goes as a rule, as wide as it is there)
            this.banner.style.translate = `${(places[at].x - middle).toFixed(0)}px ${(places[at].top - usual).toFixed(0)}px`;
        }
    }

    /**
     * The icons down the right side of the screen for those attacking the player, in order (none:
     * gone): [{ id, name, hp, maxHp, target, picture }] (`target`: whoever the player's set on, its
     * frame glowing and pulsing; `picture`: an ImageData, their likeness, or null till it's drawn,
     * their name's first letter shown till then).
     * Tapped, or held (HOLD_MS, not moving off it), each tells onAttacker.
     */
    attackers(list) {
        if (!this.attackerColumn) {
            this.attackerColumn = element("div", "");
            this.attackerColumn.id = "attackers";
            this.attackerColumn.setAttribute("role", "group");
            this.attackerColumn.setAttribute("aria-label", "Attacking you");
            this.root.append(this.attackerColumn);
            this.attackerIcons = new Map();
        }

        const shown = new Set(list.map(({ id }) => id));

        for (const [id, icon] of this.attackerIcons) {
            if (!shown.has(id)) {
                icon.root.remove();
                this.attackerIcons.delete(id);
            }
        }

        list.forEach(({ id, name, hp, maxHp, target, picture }, k) => {
            const icon = this.attackerIcons.get(id) ?? this.#attackerIcon(id);
            const health = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));

            if (this.attackerColumn.children[k] !== icon.root) {
                this.attackerColumn.insertBefore(icon.root, this.attackerColumn.children[k] ?? null);
            }

            icon.initial.textContent = name.slice(0, 1).toUpperCase();
            icon.root.classList.toggle("target", Boolean(target));
            icon.root.setAttribute("aria-label", target ? `${name}, set on` : name);
            icon.root.setAttribute("aria-pressed", String(Boolean(target)));
            icon.health.style.transform = `scaleX(${health.toFixed(3)})`;

            if (picture && !icon.painted) {
                icon.canvas.width = picture.width;
                icon.canvas.height = picture.height;
                icon.canvas.getContext("2d").putImageData(picture, 0, 0);
                icon.painted = true;
                icon.root.classList.add("painted");
            }
        });

        this.attackerColumn.hidden = list.length === 0;
    }

    // An attacker's icon (attackers): a button with their likeness and a line of their health; a
    // tap or a hold on it heard
    #attackerIcon(id) {
        const root = element("button", "attacker");
        const canvas = element("canvas", "attacker-likeness");
        const initial = element("span", "attacker-initial");
        const line = element("span", "attacker-health");
        const health = element("span", "attacker-health-fill");

        root.type = "button";
        root.dataset.id = id;
        line.append(health);
        initial.setAttribute("aria-hidden", "true");
        root.append(initial, canvas, line);
        pressable(root, (gesture, { time }) => this.onAttacker(id, gesture, time));

        const icon = { root, canvas, initial, health, painted: false };

        this.attackerIcons.set(id, icon);

        return icon;
    }

    /**
     * The icons down the left side of the screen, under the minimap and the Party button (over the
     * thumb stick, if it's shown), for the player's party, in order (none: gone): [{ id, name, hp, maxHp, kind, ally,
     * waiting, away, left, picture }] (`kind`: "player", "adventurer", "summon", "risen" or "unit";
     * `ally`: the one the player's chosen to help, its frame glowing green; `waiting`: told to wait
     * where they are; `away`: not where the player is; `left`: a called creature's time, the share
     * of it left, or null; `picture` as attackers'). As many as fit (partyFit), shrunk to, then a
     * "+N" chip for the rest. Tapped or held, each tells onPartyMember; the chip, onPartyMore.
     */
    party(list) {
        if (!this.partyIcons) {
            this.partyMore = element("button", "member-more", "+0");
            this.partyMore.type = "button";
            this.partyMore.hidden = true;
            this.partyMore.addEventListener("click", () => this.onPartyMore());
            this.partyColumn.append(this.partyMore);
            this.partyIcons = new Map();
        }

        const column = this.partyColumn;
        const { size, shown, more } = list.length ? this.#partyFit(list.length) : { size: PARTY_ICON.most, shown: 0, more: 0 };
        const showing = list.slice(0, shown);
        const ids = new Set(showing.map(({ id }) => id));

        for (const [id, icon] of this.partyIcons) {
            if (!ids.has(id)) {
                icon.root.remove();
                this.partyIcons.delete(id);
            }
        }

        if (column.dataset.size !== String(size)) {
            column.dataset.size = String(size);
            column.style.setProperty("--member-size", `${size}px`);
        }

        showing.forEach(({ id, name, hp, maxHp, kind, ally = false, waiting = false, away = false, left = null, picture = null }, k) => {
            const icon = this.partyIcons.get(id) ?? this.#memberIcon(id);
            const health = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
            const look = `${kind}|${ally}|${waiting}|${away}|${name}`;

            // (Under the Party button)
            if (column.children[k + 1] !== icon.root) {
                column.insertBefore(icon.root, column.children[k + 1] ?? null);
            }

            // (What doesn't change from frame to frame, set only when it does)
            if (icon.look !== look) {
                icon.look = look;
                icon.root.className = `member ${kind}${ally ? " ally" : ""}${waiting ? " waiting" : ""}${away ? " away" : ""}${icon.painted ? " painted" : ""}`;
                icon.initial.textContent = name.slice(0, 1).toUpperCase();
                icon.root.setAttribute("aria-label", `${name}, ${PARTY_KINDS[kind] ?? PARTY_KINDS.unit}${waiting ? ", waiting" : ""}${ally ? ", chosen to help" : ""}`);
                icon.root.setAttribute("aria-pressed", String(ally));
            }

            icon.health.style.transform = `scaleX(${health.toFixed(3)})`;
            icon.time.hidden = left === null;

            if (left !== null) {
                icon.time.firstChild.style.transform = `scaleX(${Math.max(0, Math.min(1, left)).toFixed(3)})`;
            }

            if (picture && !icon.painted) {
                icon.canvas.width = picture.width;
                icon.canvas.height = picture.height;
                icon.canvas.getContext("2d").putImageData(picture, 0, 0);
                icon.painted = true;
                icon.root.classList.add("painted");
            }
        });

        if (this.partyMore.textContent !== `+${more}`) {
            this.partyMore.hidden = more === 0;
            this.partyMore.textContent = `+${more}`;
            this.partyMore.setAttribute("aria-label", `${more} more of your party`);
        }
    }

    // How the party's icons fit (partyFit) between where they start, under the minimap, and the
    // thumb stick (if it's shown), the quick actions (if they're up, under them) or the bottom:
    // measured again only when what decides it changes (how many, the screen, the stick, the
    // minimap, the quick actions), and for a moment after, while things slide into place
    #partyFit(count) {
        const body = document.body.dataset;
        const quickUp = this.root.classList.contains("quick-up");
        const key = `${count} ${innerWidth}x${innerHeight} ${body.stick} ${body.stickFloat} ${body.minimap} ${quickUp}`;
        const now = performance.now();

        if (key !== this.partyKey) {
            this.partyKey = key;
            this.partySettle = now + 400;
        } else if (now > this.partySettle && this.partyFitted) {
            return this.partyFitted;
        }

        const screen = this.root.getBoundingClientRect();
        const top = this.partyButton.getBoundingClientRect().bottom + PARTY_ICON.gap;
        const stick = body.stick === "on" ? this.root.querySelector("#stick")?.getBoundingClientRect() : null;
        const quick = quickUp && this.quick ? this.quick.getBoundingClientRect() : null;
        const floor = Math.min(stick?.height ? stick.top - PARTY_ICON.gap * 2 : Infinity, quick && quick.left < screen.left + PARTY_ICON.most * 2 ? quick.top - PARTY_ICON.gap * 2 : Infinity, screen.bottom - PARTY_ICON.margin);

        this.partyFitted = partyFit(count, floor - top);

        return this.partyFitted;
    }

    // One of the party's icons (party): a button with their likeness, a line of their health along
    // its foot and, a called creature's, a line of its time along its head; a tap or a hold on it heard
    #memberIcon(id) {
        const root = element("button", "member");
        const canvas = element("canvas", "member-likeness");
        const initial = element("span", "member-initial");
        const line = element("span", "member-health");
        const health = element("span", "member-health-fill");
        const time = element("span", "member-time");
        const wait = element("span", "member-wait");

        root.type = "button";
        root.dataset.id = id;
        line.append(health);
        time.append(element("span", "member-time-fill"));
        time.hidden = true;
        initial.setAttribute("aria-hidden", "true");
        wait.setAttribute("aria-hidden", "true");
        root.append(initial, canvas, line, time, wait);
        pressable(root, (gesture, press) => this.onPartyMember(id, gesture, press));

        const icon = { root, canvas, initial, health, time, painted: false, look: null };

        this.partyIcons.set(id, icon);

        return icon;
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

        if (this.attackerColumn) {
            this.attackers([]);
        }

        if (this.partyIcons) {
            this.party([]);
        }
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
