// Makes the sounds (synth.js) away from the page, so playing never waits for them. Asked for those
// made as the game starts ({ ahead: names }: sound.js MADE_AHEAD), each is posted back as it's
// made, the sounds heard most first, then the wind, then { done: true }; asked for another the
// first time it's wanted ({ make: name }), each of its variants, then { made: name }. Or, asked
// for a made bed alone ({ bed }: synth.js BEDS, made only once it's wanted), that.

import { BEDS, render, SOUNDS, wind } from "./synth.js";

// Footsteps, blows and hits first; cues and the environment after
const FIRST = /^(step|swing)|^(slash|hack|cleave|chop|strike|crush|pierce|punch|arcane|fire|arrow|bolt|fireball)$/;

// Each of a sound's variants, made and posted back
function make(name) {
    for (let variant = 0; variant < SOUNDS[name].variants; variant++) {
        const samples = render(name, variant);

        self.postMessage({ name, variant, samples }, [samples.buffer]);
    }
}

self.addEventListener("message", ({ data }) => {
    if (data?.bed) {
        const samples = BEDS[data.bed].make();

        self.postMessage({ name: data.bed, variant: 0, samples }, [samples.buffer]);

        return;
    }

    if (data?.make) {
        make(data.make);
        self.postMessage({ made: data.make });

        return;
    }

    for (const name of [...(data?.ahead ?? [])].filter((name) => SOUNDS[name]).sort((a, b) => Number(FIRST.test(b)) - Number(FIRST.test(a)))) {
        make(name);
    }

    const samples = wind();

    self.postMessage({ name: "wind", variant: 0, samples }, [samples.buffer]);
    self.postMessage({ done: true });
});
