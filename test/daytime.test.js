// Day and night (the terrain plan's M7e): the world's clock (client/js/core/daytime.js: a day an
// hour of play, kept by the war's own clock), and the day as it's seen (client/js/world/daytime.js:
// the sun's way across the sky, the moon, the sky's colours and the light through the day), the sky
// drawn at a time of day (sky.js), and what's lit by the sky alone dark at night
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { DAY, dayOf, daylight, elapsedOf, MOON_DAYS, moonPhase, timeOfDay } from "../client/js/core/daytime.js";
import { TURN_MS } from "../client/js/core/war/war.js";
import { MOONLIGHT, moonLit, SKY_GLOW, SKY_TIMES, skyAt, SUN_PATH, sunTowards } from "../client/js/world/daytime.js";
import { MOON, Sky, STARS } from "../client/js/world/sky.js";
import { smokeMaterial } from "../client/js/world/smoke.js";
import { MOTES, Motes } from "../client/js/world/motes.js";

const MINUTE = 60000;

// A land's look (look.js's form): a fair day's
const LAND = { zenith: [0.31, 0.53, 0.76], horizon: [0.66, 0.78, 0.87], sun: [1, 0.94, 0.85], strength: 3.5, mist: [0, 0, 20], grade: [0.01, 0, -0.01, 0.05] };

const near = (a, b, within = 1e-9) => Math.abs(a - b) <= within;

describe("the world's clock (core/daytime.js)", () => {
    it("has a day of an hour: night, dawn (the sun rising halfway through), day, dusk (setting halfway through), night again", () => {
        assert.equal(DAY.length, 60 * MINUTE);
        assert.ok(0 < DAY.dawn && DAY.dawn < DAY.rises && DAY.rises < DAY.day && DAY.day < DAY.dusk && DAY.dusk < DAY.sets && DAY.sets < DAY.night && DAY.night < DAY.length);
        assert.equal(DAY.rises, (DAY.dawn + DAY.day) / 2);
        assert.equal(DAY.sets, (DAY.dusk + DAY.night) / 2);
        // (Most of the hour is day: a night of a quarter of it or so)
        assert.ok(DAY.length - DAY.night + DAY.dawn <= DAY.length / 4);
    });

    it("goes by the war's clock (a turn a minute, and the time into the next): a new world at mid-morning", () => {
        assert.equal(TURN_MS, MINUTE);
        assert.equal(elapsedOf(null), 0);
        assert.equal(elapsedOf({ turn: 3, clock: 2500 }), 3 * TURN_MS + 2500);
        assert.equal(timeOfDay(0), DAY.start);
        assert.ok(DAY.start > DAY.day && DAY.start < (DAY.day + DAY.dusk) / 2, "mid-morning");
        assert.equal(daylight(timeOfDay(0)), 1);
        assert.equal(dayOf(0), 0);

        // (Round the clock: the same time of day the next day, and the day after it)
        for (const elapsed of [0, 7 * MINUTE + 13, 41 * MINUTE, 59 * MINUTE + 999]) {
            assert.equal(timeOfDay(elapsed + DAY.length), timeOfDay(elapsed));
            assert.equal(dayOf(elapsed + DAY.length), dayOf(elapsed) + 1);
            assert.ok(timeOfDay(elapsed) >= 0 && timeOfDay(elapsed) < DAY.length);
        }

        assert.equal(dayOf(DAY.length - DAY.start - 1), 0);
        assert.equal(dayOf(DAY.length - DAY.start), 1);
    });

    it("has daylight 1 by day and 0 by night, rising evenly through the dawn and falling through the dusk", () => {
        assert.equal(daylight(0), 0);
        assert.equal(daylight(DAY.dawn), 0);
        assert.equal(daylight(DAY.rises), 0.5);
        assert.equal(daylight(DAY.day), 1);
        assert.equal(daylight(30 * MINUTE), 1);
        assert.equal(daylight(DAY.dusk), 1);
        assert.equal(daylight(DAY.sets), 0.5);
        assert.equal(daylight(DAY.night), 0);
        assert.equal(daylight(DAY.length - 1), 0);

        for (let time = DAY.dawn; time < DAY.day; time += MINUTE / 4) {
            assert.ok(daylight(time + MINUTE / 4) >= daylight(time));
        }
    });

    it("turns the moon through its phases over eight days: a quarter full and waxing in a new world", () => {
        const start = moonPhase(0);

        assert.ok(near(start, 0.25 + DAY.start / (DAY.length * MOON_DAYS)));
        assert.ok(near(moonPhase(DAY.length * MOON_DAYS), start));
        assert.ok(near(moonPhase(DAY.length * 2), start + 0.25));

        for (let day = 0; day < 20; day++) {
            const phase = moonPhase(day * DAY.length + 17 * MINUTE);

            assert.ok(phase >= 0 && phase < 1, `${day}: ${phase}`);
        }
    });
});

describe("the day as it's seen (world/daytime.js)", () => {
    it("has the sun rise in the east, high in the south at noon, set in the west, and under the north at midnight", () => {
        const at = (time) => sunTowards(time).toArray();
        const noon = (DAY.rises + DAY.sets) / 2;
        const [ex, ey, ez] = at(DAY.rises);
        const [nx, ny, nz] = at(noon);
        const [wx, wy, wz] = at(DAY.sets);
        // (Lowest halfway through the night)
        const [mx, my, mz] = at((DAY.sets + DAY.length + DAY.rises) / 2 - DAY.length);

        assert.ok(near(ex, 1) && near(ey, 0) && near(ez, 0), "east, on the horizon");
        assert.ok(near(nx, 0) && near(ny, Math.sin(SUN_PATH.high)) && near(nz, Math.cos(SUN_PATH.high)), "south, high");
        assert.ok(near(wx, -1) && near(wy, 0) && near(wz, 0), "west, on the horizon");
        assert.ok(near(my, -Math.sin(SUN_PATH.high)) && near(mz, -Math.cos(SUN_PATH.high)) && near(mx, 0), "under the north");

        // (Above the horizon all day, under it all night)
        for (let time = 0; time < DAY.length; time += MINUTE / 2) {
            const up = sunTowards(time).y;

            assert.equal(up > 1e-9, time > DAY.rises && time < DAY.sets, `${time / MINUTE}: ${up}`);
            assert.ok(near(sunTowards(time).length(), 1));
        }
    });

    it("lights the day by the sun, as the land has it, and the night by the moon, faint and cold, the stars out", () => {
        const noon = skyAt((DAY.rises + DAY.sets) / 2, 0.5, LAND);

        assert.deepEqual(noon.key.toArray(), noon.sun.toArray());
        assert.ok(near(noon.keyStrength, LAND.strength));
        assert.deepEqual(noon.keyColour, LAND.sun);
        assert.deepEqual(noon.zenith, LAND.zenith);
        assert.deepEqual(noon.horizon, LAND.horizon);
        assert.deepEqual(noon.grade, LAND.grade);
        assert.deepEqual([noon.stars, noon.light], [0, 1]);
        assert.deepEqual(noon.glow, [1, 1, 1]);

        const midnight = skyAt(0, 0.5, LAND);

        assert.deepEqual(midnight.key.toArray(), midnight.moon.toArray());
        assert.ok(midnight.moon.y > 0.8, "the moon high");
        assert.deepEqual(midnight.keyColour, MOONLIGHT.colour);
        assert.ok(midnight.keyStrength > 0 && midnight.keyStrength <= MOONLIGHT.strength);
        assert.equal(midnight.stars, 1);
        assert.ok(midnight.light < 0.4);
        assert.ok(midnight.glow.every((each) => each < 0.4));
        assert.ok(midnight.zenith.every((each, c) => each < LAND.zenith[c] / 4));
        assert.ok(midnight.horizon[2] > midnight.horizon[0], "deep blue");
        assert.deepEqual(
            midnight.grade.map((each) => Number(each.toFixed(9))),
            LAND.grade.map((each, k) => Number((each + SKY_TIMES.grade[k]).toFixed(9))),
        );

        // (A new moon's night darker than a full moon's, but for the stars)
        const dark = skyAt(0, 0, LAND);

        assert.ok(near(moonLit(0), 0) && near(moonLit(0.5), 1));
        assert.ok(dark.keyStrength < midnight.keyStrength && dark.keyStrength > 0);
        assert.ok(dark.light < midnight.light);
        assert.equal(dark.moonShine, MOONLIGHT.starlight);
    });

    it("has dawn's pinks and dusk's golds at the horizon, the sun low and warm, and its light handed to the moon unseen", () => {
        for (const [time, horizon] of [
            [DAY.rises, SKY_TIMES.dawn.horizon],
            [DAY.sets, SKY_TIMES.dusk.horizon],
        ]) {
            const sky = skyAt(time, 0.5, LAND);

            assert.ok(sky.horizon[0] > sky.horizon[2], `${time / MINUTE}: warm`);
            assert.ok(sky.horizon.every((each, c) => Math.abs(each - horizon[c]) < Math.abs(LAND.horizon[c] - horizon[c]) + 1e-9));
            assert.ok(sky.keyStrength < 0.05, "no light from either at the horizon");
            assert.equal(sky.stars, 0, "the stars gone");
        }

        // (The stars all out till the dawn comes, fading through it)
        const dawn = skyAt(DAY.dawn, 0.5, LAND);

        assert.equal(skyAt(DAY.dawn - 2 * MINUTE, 0.5, LAND).stars, 1);
        assert.ok(dawn.stars > 0.2 && dawn.stars < 1);

        const low = skyAt(DAY.rises + 2 * MINUTE, 0.5, LAND);

        assert.ok(low.sun.y > 0 && low.keyStrength > 0 && low.keyStrength < LAND.strength);
        assert.ok(low.keyColour[2] < LAND.sun[2] - 0.2, "warm");

        // (Round the clock, nothing jumps from one ten seconds to the next: the sun's light coming on
        // over a few minutes, the dawn's colours over two or so)
        let before = skyAt(0, 0.5, LAND);

        for (let time = MINUTE / 6; time <= DAY.length; time += MINUTE / 6) {
            const sky = skyAt(time % DAY.length, 0.5, LAND);

            assert.ok(Math.abs(sky.keyStrength - before.keyStrength) < 0.25, `${time / MINUTE}`);
            assert.ok(Math.abs(sky.light - before.light) < 0.08, `${time / MINUTE}`);
            assert.ok(sky.horizon.every((each, c) => Math.abs(each - before.horizon[c]) < 0.12), `${time / MINUTE}`);
            before = sky;
        }
    });
});

describe("the sky at a time of day (sky.js)", () => {
    it("draws the stars and the moon, its phase and its seas, the sun gone under the horizon", () => {
        const sky = new Sky(new THREE.Vector3(-0.55, 1, 0.65));
        const shader = sky.object.material.fragmentShader;

        for (const word of ["moonDirection", "moonPhase", "moonShine", "stars", "cloudLight", "terminator", "seas", "twinkle"]) {
            assert.ok(shader.includes(word), word);
        }

        assert.ok(STARS.share > 0 && STARS.share < 0.5 && STARS.cells > 100);
        assert.ok(MOON.radius > 0.009 && MOON.radius < 0.03);

        const midnight = skyAt(0, 0.3, LAND);

        sky.setTime(midnight);
        assert.deepEqual(sky.uniforms.sunDirection.value.toArray(), midnight.sun.toArray());
        assert.deepEqual(sky.uniforms.moonDirection.value.toArray(), midnight.moon.toArray());
        assert.deepEqual([sky.uniforms.moonPhase.value, sky.uniforms.stars.value], [0.3, 1]);
        assert.deepEqual(sky.uniforms.zenith.value.toArray(), midnight.zenith);
        assert.deepEqual(sky.uniforms.cloudLight.value.toArray(), midnight.glow);

        // (None: the fair day's, no stars, the moon under the horizon)
        sky.setTime(null);
        assert.equal(sky.uniforms.stars.value, 0);
        assert.deepEqual(sky.uniforms.cloudLight.value.toArray(), [1, 1, 1]);
        assert.ok(sky.uniforms.moonDirection.value.y < 0);
        sky.dispose();
    });

    it("has what's lit by the sky alone (smoke, motes, the falls' mist, the far trees) as dark as the sky's light; fireflies and embers glowing still", async () => {
        assert.equal(smokeMaterial().uniforms.skyGlow, SKY_GLOW);
        assert.ok(smokeMaterial().fragmentShader.includes("* skyGlow"));

        const motes = new Motes();

        assert.equal(motes.uniforms.skyGlow, SKY_GLOW);
        assert.ok(motes.material.fragmentShader.includes("mix(vec3(1.0), skyGlow, moteLit)"));

        for (const [kind, lit] of Object.entries({ pollen: true, dust: true, snow: true, fireflies: false, wisps: false, embers: false })) {
            assert.equal(MOTES[kind].lit, lit, kind);
        }

        motes.dispose();

        for (const file of ["falls.js", "far/silhouettes.js", "far/volcano.js"]) {
            const source = await import("node:fs").then(({ readFileSync }) => readFileSync(new URL(`../client/js/world/${file}`, import.meta.url), "utf8"));

            assert.ok(source.includes("skyGlow: SKY_GLOW") && /\* skyGlow/.test(source), file);
        }
    });
});
