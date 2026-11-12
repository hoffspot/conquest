const C = "/home/user/conquest/client/";
const { MODELS } = await import(C + "js/beasts/model.js");
const { ASSETS } = await import(C + "js/app/assets.js");
const rows = Object.entries(MODELS).filter(([, m]) => (m.skins ?? []).filter(Boolean).length).map(([id, m]) => `${id}(${m.asset.replace("beast-", "")}): ${m.skins.filter(Boolean).join("/")}`);
console.log(rows.join("\n"));
console.log("kinds:", Object.keys(MODELS).length, "with skins:", rows.length, "assets with -skins:", Object.keys(ASSETS.models).filter((k) => k.endsWith("-skins")).length);
