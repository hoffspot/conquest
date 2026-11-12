const { prepareAtlas, atlasMaterial, LAYERS } = await import(process.argv[2] + "/client/js/world/art/engine/atlas.js");
const t = performance.now();
const waited = prepareAtlas(8);
const texture = atlasMaterial().userData.atlas;
console.log("before", texture.image.data);
console.log("resolved with", await waited, prepareAtlas(8) === waited);
console.log("after", texture.image.data?.byteLength, 8 * 8 * 4 * LAYERS.length, (performance.now() - t).toFixed(0), "ms");
texture.onUpdate(texture);
console.log("sent", texture.image.data, await prepareAtlas());
