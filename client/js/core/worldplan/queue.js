// A queue that gives back the lowest first (ties: the one put in first, so the same every time),
// for flooding the land and spreading outwards over it (terrain.js), and finding ways over it
// (settle.js).

export class Queue {
    #keys = [];
    #items = [];
    #order = [];
    #count = 0;

    get size() {
        return this.#items.length;
    }

    push(item, key) {
        const keys = this.#keys;
        const items = this.#items;
        const order = this.#order;
        let k = items.length;

        keys.push(key);
        items.push(item);
        order.push(this.#count++);

        while (k > 0) {
            const parent = (k - 1) >> 1;

            if (keys[parent] < keys[k] || (keys[parent] === keys[k] && order[parent] < order[k])) {
                break;
            }

            this.#swap(k, parent);
            k = parent;
        }
    }

    pop() {
        const keys = this.#keys;
        const items = this.#items;
        const order = this.#order;
        const top = items[0];
        const key = keys[0];
        const last = items.length - 1;

        this.#swap(0, last);
        keys.pop();
        items.pop();
        order.pop();

        let k = 0;

        for (;;) {
            const left = 2 * k + 1;
            const right = left + 1;
            let least = k;

            for (const child of [left, right]) {
                if (child < items.length && (keys[child] < keys[least] || (keys[child] === keys[least] && order[child] < order[least]))) {
                    least = child;
                }
            }

            if (least === k) {
                break;
            }

            this.#swap(k, least);
            k = least;
        }

        return { item: top, key };
    }

    #swap(a, b) {
        for (const list of [this.#keys, this.#items, this.#order]) {
            [list[a], list[b]] = [list[b], list[a]];
        }
    }
}
