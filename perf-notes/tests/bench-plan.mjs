import v8 from "node:v8";
const root = "/home/user/conquest/";
const { planWorld, layOutWorld } = await import(root + "client/js/core/worldplan/plan.js");
const cpu = (since) => { const u = process.cpuUsage(since); return (u.user + u.system) / 1000; };
for (const seed of [2, 3, 1, 5, 4242]) { const s = process.cpuUsage(); const plan = planWorld(seed); const c = cpu(s); let size = 0, ser = 0, de = 0; try { const a = process.cpuUsage(); const buf = v8.serialize(plan); ser = cpu(a); size = buf.length; const b = process.cpuUsage(); v8.deserialize(buf); de = cpu(b); } catch (e) { size = -1; console.log("not serialisable:", e.message); } console.log("planWorld(" + seed + ") first call:", c.toFixed(0), "ms CPU; v8.serialize", (size / 1e6).toFixed(1), "MB in", ser.toFixed(0), "ms; deserialize", de.toFixed(0), "ms; keys:", seed === 2 ? Object.keys(plan).join(",") : ""); }
const s = process.cpuUsage(); layOutWorld(2); console.log("layOutWorld(2) again, warm JIT:", cpu(s).toFixed(0), "ms CPU");
