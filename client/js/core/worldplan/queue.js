// A queue that gives back the lowest first (ties: the one put in first, so the same every time),
// for flooding the land and spreading outwards over it (terrain.js), and finding ways over it
// (settle.js). A binary heap, kept as three lists side by side (each item's key, the item, and
// when it was put in); what's put in or taken out moves into its place past the others, rather
// than being swapped with each in turn.

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
        const at = this.#count++;
        let k = items.length;

        // (Each above it that comes after it moved down, till it's where it goes)
        while (k > 0) {
            const parent = (k - 1) >> 1;

            if (keys[parent] < key || (keys[parent] === key && order[parent] < at)) {
                break;
            }

            keys[k] = keys[parent];
            items[k] = items[parent];
            order[k] = order[parent];
            k = parent;
        }

        keys[k] = key;
        items[k] = item;
        order[k] = at;
    }

    pop() {
        const keys = this.#keys;
        const items = this.#items;
        const order = this.#order;
        const top = { item: items[0], key: keys[0] };

        // (The last put where the first was, and each below it that comes before it moved up,
        // till it's where it goes)
        const key = keys.pop();
        const item = items.pop();
        const at = order.pop();
        const size = items.length;

        if (size > 0) {
            let k = 0;

            for (;;) {
                let child = 2 * k + 1;

                if (child >= size) {
                    break;
                }

                const right = child + 1;

                if (right < size && (keys[right] < keys[child] || (keys[right] === keys[child] && order[right] < order[child]))) {
                    child = right;
                }

                if (key < keys[child] || (key === keys[child] && at < order[child])) {
                    break;
                }

                keys[k] = keys[child];
                items[k] = items[child];
                order[k] = order[child];
                k = child;
            }

            keys[k] = key;
            items[k] = item;
            order[k] = at;
        }

        return top;
    }
}
