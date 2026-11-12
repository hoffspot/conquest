# Make a copy of battle.js that counts calls (globalThis.__c), for counts.mjs.
import re, sys
src = open(sys.argv[1]).read()
heads = {
    "    #inFight(actor) {": "inFight",
    "    #sees(mapId, from, to, range = SIGHT) {": "sees",
    "    hostile(a, b) {": "hostile",
    "    #pathTo(actor, goal, point = [goal[0] + 0.5, goal[1] + 0.5]) {": "pathTo",
    "    #clear(mapId, [x, y], from = null, { walking = false } = {}) {": "clear",
    "    #provoke(attacker, target, { turn = true, enmity = ENMITY.seed } = {}) {": "provoke",
    "    #nearestEnemy(actor, test, within = Infinity, enemy = (other) => this.hostile(other, actor)) {": "nearestEnemy",
    "    #chosen(actor, test, { hold = false } = {}) {": "chosen",
    "    #emit(type, details) {": "emit",
    "    #bumps(actor, [x, y]) {": "bumps",
    "    #aside(actor, [ux, uy], step, blocker) {": "aside",
    "    #alarmed(actor) {": "alarmed",
    "    #mend(actor, first = null) {": "mend",
    "    #ringsNear(actor, reach) {": "ringsNear",
    "    #drawnTo(actor) {": "drawnTo",
    "    #hit(attacker, target, attack, projectile = null, { damage: given = null, spell = null, ground = false, sure = false } = {}) {": "hit",
    "    canSee(a, b, range = SIGHT) {": "canSee",
    "    #mended(healer, target, amount) {": "mended",
    "    #step() {": "step",
    "    #blocked(actor, blocker) {": "blocked",
    "    #travel(actor, budget) {": "travel",
    "    #patrol(actor) {": "patrol",
}
for head, name in heads.items():
    assert src.count(head) == 1, (head, src.count(head))
    src = src.replace(head, head + f"\n        __c.{name} = (__c.{name} ?? 0) + 1;")
# The index: how often it's made again, and how many come back from #within
a = "        const cells = new Map();\n        const at = new Float64Array(this.actors.length * 2);"
assert src.count(a) == 1
src = src.replace(a, "        __c.indexed = (__c.indexed ?? 0) + 1;\n" + a)
a = "        return found;\n    }\n\n    // The same as #nearSquare"
assert src.count(a) == 1
src = src.replace(a, "        __c.within = (__c.within ?? 0) + 1; __c.withinFound = (__c.withinFound ?? 0) + found.length;\n" + a)
# #provoke's grudges: each of its own looked at, and each asked whether it saw
a = "                if (other === target || (own && !target.lone && !other.neutral && !other.dead && other.map === target.map && !spares(other) && (this.canSee(other, target) || this.canSee(other, attacker)))) {"
assert src.count(a) == 1
src = src.replace(a, "                __c.provokeLooked = (__c.provokeLooked ?? 0) + 1; if (own && other !== target && !target.lone && !other.neutral && !other.dead && other.map === target.map) { __c.provokeSaw = (__c.provokeSaw ?? 0) + 1; if (other.foes[attacker.id] === until) { __c.provokeAlready = (__c.provokeAlready ?? 0) + 1; } }\n" + a)
src = src.replace("export class Battle {", "const __c = (globalThis.__c ??= {});\n\nexport class Battle {")
open(sys.argv[2], "w").write(src)
