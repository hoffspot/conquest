// Joining.held is two things (netplay.js:1106 the steps in hand lately, a number; :1123 whether
// the player's menu holds the world, a boolean): what that does.
const { Joining, PLAYOUT } = await import("/home/user/conquest/client/js/core/netplay.js");
const sent = [];
const joining = new Joining({ send: (text) => sent.push(text), clock: () => 0 });

console.log(`new: held = ${JSON.stringify(joining.held)} (${typeof joining.held})`);
// (Three steps in hand, steadily, a frame at a time for 3 s: as game.js #tick asks the pace)
Object.defineProperty(joining, "behind", { get: () => 3 });
joining.delay = 3;
for (let k = 0; k < 180; k++) joining.pace(1000 / 60);
console.log(`after 3 s of frames with 3 steps in hand: held = ${joining.held.toFixed(2)}, pace ${joining.pace(16.7).toFixed(3)}`);
// (The menu shut, as game.js start() says every time it starts: nothing's changed, so nothing should be sent)
joining.hold(false);
console.log(`hold(false), unchanged: sent ${JSON.stringify(sent)}; held = ${JSON.stringify(joining.held)}`);
const paces = [];
for (let k = 0; k < 90; k++) { const pace = joining.pace(1000 / 60); if (k % 15 === 0) paces.push(pace.toFixed(3)); }
console.log(`  the pace over the next 1.5 s (every quarter second): ${paces.join(", ")} (slowest allowed ${1 - PLAYOUT.slower})`);
// (The menu opened; then the link drops and comes back while it's open)
sent.length = 0;
joining.hold(true);
for (let k = 0; k < 60; k++) joining.pace(1000 / 60);
joining.resync();
console.log(`menu open, then resync: ${sent.filter((text) => text.includes('"hold"')).join("  ")}`);
