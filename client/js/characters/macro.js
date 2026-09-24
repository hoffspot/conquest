// Body shape sliders, as in MakeHuman: which of its precomputed body shapes ("targets") to blend,
// and how much of each, for a given gender, muscle, weight, height and heritage.
//
// This follows MPFB2's TargetService.calculate_target_stack_from_macro_info_dict
// (github.com/makehumancommunity/mpfb2), for adults only: every body is a young adult, so the
// age sliders' targets reduce to "young". MakeHuman's subtle "proportions" slider is left out: its
// 36 shapes would double the download for little visible change. Each slider picks the two
// nearest precomputed shapes
// and blends between them; sliders multiply together, so a strong, heavy man is mostly
// "male-maxmuscle-maxweight".
//
// Pure data, no DOM: used by the character engine and by the build script that prepares the
// targets.

/** The sliders and their default values (0 to 1; heritage values are shares that add up to 1). */
export const MACRO_DEFAULTS = Object.freeze({
    gender: 0.5,
    muscle: 0.5,
    weight: 0.5,
    height: 0.5,
    african: 1 / 3,
    asian: 1 / 3,
    caucasian: 1 / 3,
});

// Each slider's segments: between `lowest` and `highest`, blend from `low` to `high` ("" means
// the base shape, which has no target). From MPFB2's macrodetails/macro.json.
const SEGMENTS = {
    gender: [{ lowest: -0.01, highest: 1.01, low: "female", high: "male" }],
    muscle: [
        { lowest: -0.01, highest: 0.49998, low: "minmuscle", high: "averagemuscle" },
        { lowest: 0.49999, highest: 1.01, low: "averagemuscle", high: "maxmuscle" },
    ],
    weight: [
        { lowest: -0.01, highest: 0.49998, low: "minweight", high: "averageweight" },
        { lowest: 0.49999, highest: 1.01, low: "averageweight", high: "maxweight" },
    ],
    height: [
        { lowest: -0.01, highest: 0.49, low: "minheight", high: "" },
        { lowest: 0.51, highest: 1.01, low: "", high: "maxheight" },
    ],
};

export const HERITAGES = Object.freeze(["african", "asian", "caucasian"]);

// Targets weighing less than this are left out
const CUTOFF = 0.01;

const round = (value) => Math.round(value * 10000) / 10000;

/** A slider's components at a value: [[name, weight], ...] ("" is the base shape). */
export function components(slider, value) {
    const result = [];

    for (const { lowest, highest, low, high } of SEGMENTS[slider]) {
        if (value > lowest && value < highest) {
            const position = (value - lowest) / (highest - lowest);

            result.push([low, round(1 - position)], [high, round(position)]);
        }
    }

    return result.filter(([name]) => name !== "");
}

/**
 * The targets to blend for these slider settings: [{ name, weight }], names as in MakeHuman's
 * data folder (for example "macrodetails/universal-male-young-maxmuscle-averageweight").
 */
export function macroTargets(settings = {}) {
    const values = { ...MACRO_DEFAULTS, ...settings };
    const gender = components("gender", values.gender);
    const muscle = components("muscle", values.muscle);
    const weight = components("weight", values.weight);
    const height = components("height", values.height);
    const targets = [];
    const add = (name, amount) => {
        if (amount > CUTOFF) {
            targets.push({ name, weight: round(amount) });
        }
    };

    const total = HERITAGES.reduce((sum, heritage) => sum + Math.max(0, values[heritage]), 0) || 1;

    for (const heritage of HERITAGES) {
        for (const [sex, sexWeight] of gender) {
            add(`macrodetails/${heritage}-${sex}-young`, (Math.max(0, values[heritage]) / total) * sexWeight);
        }
    }

    for (const [sex, sexWeight] of gender) {
        for (const [muscles, muscleWeight] of muscle) {
            for (const [build, buildWeight] of weight) {
                const shape = `${sex}-young-${muscles}-${build}`;
                const base = sexWeight * muscleWeight * buildWeight;

                add(`macrodetails/universal-${shape}`, base);

                for (const [tall, tallWeight] of height) {
                    add(`macrodetails/height/${shape}-${tall}`, base * tallWeight);
                }
            }
        }
    }

    return targets;
}

/** Every target any adult slider setting can use (for preparing them at build time). */
export function allMacroTargetNames() {
    const names = [];

    for (const heritage of HERITAGES) {
        for (const sex of ["female", "male"]) {
            names.push(`macrodetails/${heritage}-${sex}-young`);
        }
    }

    for (const sex of ["female", "male"]) {
        for (const muscles of ["minmuscle", "averagemuscle", "maxmuscle"]) {
            for (const build of ["minweight", "averageweight", "maxweight"]) {
                const shape = `${sex}-young-${muscles}-${build}`;

                names.push(`macrodetails/universal-${shape}`);
                names.push(`macrodetails/height/${shape}-minheight`, `macrodetails/height/${shape}-maxheight`);
            }
        }
    }

    return names;
}
