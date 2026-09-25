// Makes every sound (synth.js) away from the page, so playing never waits for them: each is
// posted back as it's made, the sounds heard most first, then the wind, then { done: true }.

import { render, SOUNDS, wind } from "./synth.js";

// Footsteps, blows and hits first; cues and the environment after
const FIRST = /^(step|swing)|^(slash|hack|strike|crush|pierce|punch|arcane|fire|arrow|bolt|fireball)$/;

self.addEventListener("message", () => {
    const names = Object.keys(SOUNDS).sort((a, b) => Number(FIRST.test(b)) - Number(FIRST.test(a)));

    for (const name of names) {
        for (let variant = 0; variant < SOUNDS[name].variants; variant++) {
            const samples = render(name, variant);

            self.postMessage({ name, variant, samples }, [samples.buffer]);
        }
    }

    const samples = wind();

    self.postMessage({ name: "wind", variant: 0, samples }, [samples.buffer]);
    self.postMessage({ done: true });
});
