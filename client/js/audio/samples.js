// Made by scripts/build-music.js (npm run build:music): don't edit it by hand.
//
// The music's samples, in client/music: recordings of real instruments from the Versilian
// Community Sample Library by Versilian Studios (CC0), https://github.com/sgossner/VCSL, and
// FreePats' Spanish classical guitar (CC0), https://github.com/freepats/spanish-classical-guitar.
// Each pitched instrument has recordings at a few notes (`key`, MIDI); drums one for each kind
// of hit.

/** Each instrument's samples: [{ key, file }], or [{ kind, file }] for drums. */
export const SAMPLES = Object.freeze({
    recorder: [
        { key: 65, file: "recorder-65.29877203.mp3" },
        { key: 70, file: "recorder-70.896ccaa4.mp3" },
        { key: 74, file: "recorder-74.7fc59049.mp3" },
        { key: 78, file: "recorder-78.0d4f30a1.mp3" },
        { key: 82, file: "recorder-82.d5609a25.mp3" },
    ],
    ocarina: [
        { key: 69, file: "ocarina-69.ab15da38.mp3" },
        { key: 73, file: "ocarina-73.e7cc0cc4.mp3" },
        { key: 78, file: "ocarina-78.bf8d3a30.mp3" },
        { key: 82, file: "ocarina-82.696acfa3.mp3" },
    ],
    harp: [
        { key: 46, file: "harp-46.ff3ae0be.mp3" },
        { key: 50, file: "harp-50.80491620.mp3" },
        { key: 54, file: "harp-54.24333488.mp3" },
        { key: 58, file: "harp-58.51b6a91c.mp3" },
        { key: 62, file: "harp-62.5a658803.mp3" },
        { key: 66, file: "harp-66.606a2166.mp3" },
        { key: 70, file: "harp-70.53070121.mp3" },
        { key: 74, file: "harp-74.0122e300.mp3" },
        { key: 78, file: "harp-78.1c158a22.mp3" },
    ],
    strumstick: [
        { key: 52, file: "strumstick-52.67fe651c.mp3" },
        { key: 57, file: "strumstick-57.32e037f4.mp3" },
        { key: 62, file: "strumstick-62.f99bc63c.mp3" },
        { key: 67, file: "strumstick-67.e121fc3f.mp3" },
        { key: 71, file: "strumstick-71.1b402cae.mp3" },
        { key: 76, file: "strumstick-76.e6db8f5d.mp3" },
    ],
    harpsichord: [
        { key: 64, file: "harpsichord-64.5aa3e165.mp3" },
        { key: 68, file: "harpsichord-68.d40ec130.mp3" },
        { key: 72, file: "harpsichord-72.5d8e7144.mp3" },
        { key: 76, file: "harpsichord-76.08353c61.mp3" },
        { key: 80, file: "harpsichord-80.b565a82b.mp3" },
        { key: 84, file: "harpsichord-84.a525c3cb.mp3" },
    ],
    organ: [
        { key: 38, file: "organ-38.c7579920.mp3" },
        { key: 42, file: "organ-42.295d2155.mp3" },
        { key: 46, file: "organ-46.4fe178d2.mp3" },
        { key: 50, file: "organ-50.8efc511b.mp3" },
        { key: 54, file: "organ-54.787f4e20.mp3" },
        { key: 58, file: "organ-58.78c24b23.mp3" },
        { key: 62, file: "organ-62.6b6e09ba.mp3" },
        { key: 66, file: "organ-66.b93e7e00.mp3" },
        { key: 70, file: "organ-70.94917a72.mp3" },
    ],
    chimes: [
        { key: 78, file: "chimes-78.b4e12e31.mp3" },
        { key: 81, file: "chimes-81.17be1d8e.mp3" },
        { key: 86, file: "chimes-86.6d64ae66.mp3" },
        { key: 90, file: "chimes-90.e2dc9438.mp3" },
    ],
    drum: [
        { kind: "low", file: "drum-low.bf5d510d.mp3" },
        { kind: "high", file: "drum-high.f5c7b831.mp3" },
    ],
    tambourine: [
        { kind: "hit", file: "tambourine-hit.70eb7951.mp3" },
    ],
    guitar: [
        { key: 41, file: "guitar-41.6ea722db.mp3" },
        { key: 45, file: "guitar-45.e7af1e3c.mp3" },
        { key: 50, file: "guitar-50.fef51653.mp3" },
        { key: 55, file: "guitar-55.7aec7959.mp3" },
        { key: 60, file: "guitar-60.4332ef41.mp3" },
        { key: 65, file: "guitar-65.61012c69.mp3" },
        { key: 70, file: "guitar-70.c3905ef2.mp3" },
        { key: 75, file: "guitar-75.7b380077.mp3" },
        { key: 80, file: "guitar-80.745e0905.mp3" },
        { key: 84, file: "guitar-84.fc2d92a3.mp3" },
    ],
});
