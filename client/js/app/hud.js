// The game's heads-up display, drawn with the page (not in 3D): the player's name and health,
// a name and health bar over every other character, numbers for the damage each blow does, and
// messages across the middle of the screen. Under a health bar, an orange bar shows stamina
// while it isn't full.

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

export class Hud {
    /** @param {HTMLElement} root - The #hud screen (index.html). */
    constructor(root) {
        this.root = root;
        this.plate = root.querySelector("#playerplate");
        this.floaters = root.querySelector("#floaters");
        this.banner = root.querySelector("#banner");
        this.tracked = new Map();
        this.bannerTimer = null;
    }

    /** Show the player's name, health and stamina. */
    setPlayer({ name, hp, maxHp, stamina = maxHp, maxStamina = maxHp }) {
        this.plate.querySelector(".name").textContent = name;
        this.#setBar(this.plate, hp, maxHp);
        this.#setStamina(this.plate, stamina, maxStamina);
    }

    /** Show a bar over another character (hostile ones in red). */
    track(id, { name, hp, maxHp, stamina = maxHp, maxStamina = maxHp, hostile = true }) {
        const plate = element("div", `floater plate${hostile ? " hostile" : ""}`);
        const bar = element("div", "bar");
        const breath = element("div", "bar stamina");

        bar.append(element("div", "fill"), element("span", "value"));
        breath.append(element("div", "fill"), element("span", "value"));
        breath.hidden = true;
        plate.append(element("span", "name", name), bar, breath);
        plate.dataset.id = id;
        this.floaters.append(plate);
        this.tracked.set(id, plate);
        this.setHealth(id, hp, maxHp);
        this.setStamina(id, stamina, maxStamina);
    }

    /** Change a character's health (the player's plate, or its bar). */
    setHealth(id, hp, maxHp) {
        const plate = this.#plateOf(id);

        if (plate) {
            this.#setBar(plate, hp, maxHp);
        }
    }

    /** Change a character's stamina: its orange bar, shown while it isn't full. */
    setStamina(id, stamina, maxStamina) {
        const plate = this.#plateOf(id);

        if (plate) {
            this.#setStamina(plate, stamina, maxStamina);
        }
    }

    /** Move a character's bar to a point on the screen (client pixels), or hide it (null). */
    place(id, point) {
        const plate = this.tracked.get(id);

        if (!plate) {
            return;
        }

        plate.hidden = !point;

        if (point) {
            plate.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
        }
    }

    /** A number rising from a point on the screen: the damage a blow did (or "Miss"). */
    damage(point, text, { toPlayer = false } = {}) {
        if (!point) {
            return;
        }

        const number = element("div", `damage${toPlayer ? " to-player" : ""}`, String(text));

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

        if (text && seconds) {
            this.bannerTimer = setTimeout(() => (this.banner.hidden = true), seconds * 1000);
        }
    }

    /** Remove every floating bar and number. */
    clear() {
        this.floaters.replaceChildren();
        this.tracked.clear();
        this.message("");
    }

    #plateOf(id) {
        return this.tracked.get(id) ?? (id === "player" ? this.plate : null);
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
