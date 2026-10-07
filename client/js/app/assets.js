// Made by scripts/build-manifest.js (npm run build:manifest) from client/models/assets.json,
// don't edit: the models the game downloads only as they're wanted (not before it starts: that's
// manifest.js), each file with its size in bytes and a hash of its bytes, fetched as path?h=hash.
// `release` names this release's set of kept files (these and the manifest's data), which the
// page tells the service worker (client/sw.js), so it can let go of what no release in use lists.
// test/manifest.test.js checks it's up to date; generated/asset_streaming_plan.md, section 2,
// says what each field is for.

export const ASSETS = Object.freeze({
    release: "8c7097de2f",
    models: {},
});
