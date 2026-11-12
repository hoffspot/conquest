const root = "/home/user/conquest/";
const cpu = (since) => { const u = process.cpuUsage(since); return (u.user + u.system) / 1000; };
let s = process.cpuUsage();
const { readHumanData } = await import(root + "scripts/lib/human-data.js");
console.log("import human-data.js (and what it imports):", cpu(s).toFixed(0), "ms CPU");
for (let k = 0; k < 3; k++) { s = process.cpuUsage(); const human = readHumanData(); console.log("readHumanData():", cpu(s).toFixed(0), "ms CPU", k === 0 ? Object.keys(human).slice(0, 12).join(",") : ""); }
s = process.cpuUsage();
const { dress } = await import(root + "client/js/characters/motioncheck.js");
const { soldierLook } = await import(root + "client/js/characters/soldiers.js");
console.log("import motioncheck.js + soldiers.js:", cpu(s).toFixed(0), "ms CPU");
const human = readHumanData();
for (let k = 0; k < 4; k++) { s = process.cpuUsage(); dress(human, soldierLook({ people: "human", weapon: "sword", sex: k % 2 ? "m" : "f", seed: 11, captain: false })); console.log("dress(a soldier):", cpu(s).toFixed(0), "ms CPU"); }
