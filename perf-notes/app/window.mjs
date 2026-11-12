// A prototype of the change proposed for governor.js / throng.js / budget.js: the window of frames
// kept in typed rings, and its middle found only when it's looked at (every `every` ms), sorted in
// a scratch typed array (no comparator, nothing allocated). Against the median as they find it now.
class Window {
    #at; #value; #head = 0; #size = 0; #scratch;
    constructor(capacity = 2048) { this.#at = new Float64Array(capacity); this.#value = new Float32Array(capacity); this.#scratch = new Float32Array(capacity); }
    push(now, value, span) {
        const cap = this.#at.length;
        if (this.#size === cap) { this.#head = (this.#head + 1) % cap; this.#size--; }
        const slot = (this.#head + this.#size) % cap;
        this.#at[slot] = now; this.#value[slot] = value; this.#size++;
        while (this.#size && this.#at[this.#head] < now - span) { this.#head = (this.#head + 1) % cap; this.#size--; }
    }
    get length() { return this.#size; }
    get first() { return this.#at[this.#head]; }
    median() {
        const cap = this.#at.length, n = this.#size, scratch = this.#scratch;
        for (let k = 0; k < n; k++) scratch[k] = this.#value[(this.#head + k) % cap];
        const part = scratch.subarray(0, n); part.sort();
        return part[Math.floor(n / 2)];
    }
    clear() { this.#head = 0; this.#size = 0; }
}
const oldMedian = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
// Same answer?
{
    const win = new Window(); const frames = []; let now = 0, same = 0, checked = 0;
    for (let i = 0; i < 5000; i++) { const interval = 14 + Math.random() * 30; now += interval; win.push(now, interval, 10000); frames.push({ now, interval }); while (frames[0].now < now - 10000) frames.shift(); if (i % 7 === 0) { checked++; same += Math.fround(oldMedian(frames.map((f) => f.interval))) === win.median() && frames.length === win.length ? 1 : 0; } }
    console.log(`same median (to float32) and same count in ${same} of ${checked} looks`);
}
const jitter = (now) => 16.667 + ((now * 7919) % 10) / 10 - 0.5;
const spans = [3000, 1500, 10000];
const measure = (name, calls, fn) => { for (let i = 0; i < 2000; i++) fn(); console.log(`BEGIN ${name}`); const s = performance.now(); for (let i = 0; i < calls; i++) fn(); const ms = performance.now() - s; console.log(`END ${name} ${calls}`); console.log(`   ${name}: ${(ms / calls * 1000).toFixed(1)} us a frame`); };
{
    const olds = spans.map(() => []); let now = 0;
    measure("as now: three windows, a median each frame", 6000, () => { now += 16.667; for (let k = 0; k < 3; k++) { const frames = olds[k]; frames.push({ now, interval: jitter(now) }); while (frames[0].now < now - spans[k]) frames.shift(); oldMedian(frames.map(({ interval }) => interval)); } });
}
{
    const wins = spans.map(() => new Window()); let now = 0; let looked = 0; let sink = 0;
    measure("proposed: typed rings, looked at 4 times a second", 6000, () => { now += 16.667; for (let k = 0; k < 3; k++) wins[k].push(now, jitter(now), spans[k]); if (now - looked >= 250) { looked = now; for (let k = 0; k < 3; k++) sink += wins[k].median(); } });
}
{
    const wins = spans.map(() => new Window()); let now = 0; let sink = 0;
    measure("proposed: typed rings, a median each frame", 6000, () => { now += 16.667; for (let k = 0; k < 3; k++) { wins[k].push(now, jitter(now), spans[k]); sink += wins[k].median(); } });
}
