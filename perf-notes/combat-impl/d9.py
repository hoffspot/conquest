import sys

root = sys.argv[1]


def edit(path, pairs):
    s = open(f"{root}/{path}").read()
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:80], s.count(old))
        s = s.replace(old, new)
    open(f"{root}/{path}", "w").write(s)


edit("docs/GAME.md", [
    ("""  3 seconds it can't move, attack, cast or think, and whatever it was starting is called off;
  the orc then turns on whoever stunned it.""", """  3 seconds it can't move, attack, cast or think, and whatever it was starting is called off;
  the orc then turns on whoever stunned it. **On a boss a stun wears thin** (`STUNS`; whatever
  resists taunts: a dungeon's boss, a hell level's own, one of a kind, an elite, the Behemoth):
  any stun (a spell's, a shield bash's, a legendary weapon's) lasts half as long on one, and each
  one within 20 seconds of the last half as long again, till it would last less than a step and
  is shrugged off ("Resisted"; it still counts as one). Hold's 6 seconds are 3, then 1.5, 0.75...
  on a boss; left alone for 20 seconds, it's 3 again. Before, Hold alone, cast again as it came
  ready, kept a tier-10 boss stunned 99.5% of two minutes, never beginning a blow; now 6% (10%
  with the Hexes skill at its last level), and it begins 42. What's kept of it is on the boss
  (`stunned`: how many in the run, and when the last was), in the snapshot with it."""),
    ("""| Stun | an enemy | 18 m, in sight | 400 ms | can't act for 3000 ms | 5000 ms |""", """| Stun | an enemy | 18 m, in sight | 400 ms | can't act for 3000 ms (a boss half as long, and less each time) | 5000 ms |"""),
])

edit("docs/MAGIC.md", [
    ("""cooldown: it can't move, fight, cast or think for 3 seconds, and turns on whoever did it) and,
once the skill brings it, **Hold** (600 ms, 6 s cooldown, 6 seconds).""", """cooldown: it can't move, fight, cast or think for 3 seconds, and turns on whoever did it) and,
once the skill brings it, **Hold** (600 ms, 6 s cooldown, 6 seconds).

**A boss isn't held for long** (battle.js `STUNS`; the owner: "For hold, halve stuns on bosses and
shorten each repeat, as Fear already wears thin"). On whatever resists taunts (a dungeon's boss,
a hell level's own, one of a kind, an elite, the Behemoth), any stun lasts half as long, and each
one within 20 seconds of the last half as long again: Hold 3 seconds, then 1.5, 0.75, 0.375...
till it would last less than a twentieth of a second and is shrugged off ("Resisted"). Twenty
seconds with none, and the next lasts its half again. A stronger stunner's stuns (the Hexes
skill) are halved from their own length, and a shield bash's and a legendary weapon's count in
the same run. So Hold on a boss is a breathing space (to heal, to get away, to cut a blow
short), not a lock: cast again as it came ready, it used to keep a boss stunned through the
whole fight. Both spells say so where they're described."""),
])

edit("docs/WILDS.md", [
    ("""  seconds, shrugs taunts off for 10 (as in Elder Scrolls Online): held, not chain-locked. Their""", """  seconds, shrugs taunts off for 10 (as in Elder Scrolls Online): held, not chain-locked. Stuns
  wear thin on the same ones (`STUNS`: half as long, and each within 20 seconds of the last half
  as long again; docs/MAGIC.md *Hexes*). Their"""),
])

edit("docs/DUNGEONS.md", [
    ("""  with its weight in its enmity and a taunt now and then, but four warriors can't chain-lock it.""", """  with its weight in its enmity and a taunt now and then, but four warriors can't chain-lock it.
- **Stuns wear thin on them** (battle.js `STUNS`; docs/MAGIC.md *Hexes*): on the same ones, a
  stun of any kind lasts half as long, and each one within 20 seconds of the last half as long
  again, till it's shrugged off. Hold cast again as it came ready no longer keeps a boss out of
  its own fight."""),
])
print("ok")
