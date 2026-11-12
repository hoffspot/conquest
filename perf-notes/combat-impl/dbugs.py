import sys

root = sys.argv[1]


def edit(path, pairs):
    s = open(f"{root}/{path}").read()
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:80], s.count(old))
        s = s.replace(old, new)
    open(f"{root}/{path}", "w").write(s)


edit("docs/GAME.md", [
    ("""  repeated for `interval`. A melee blow hits if the target is still within reach. A ranged attack
  lets go of a projectile (an arrow at 22 m/s, a bolt at 14, a fireball at 9) that homes in on its
  target and hits when it arrives.""", """  repeated for `interval`. A melee blow hits if the target is still within reach. A ranged attack
  lets go of a projectile (an arrow at 22 m/s, a bolt at 14, a fireball at 9) that homes in on its
  target and hits when it arrives. It doesn't follow for ever: once it's flown one and a half
  times as far as its attack reaches without coming up with them (`SHOT_FLIES`: an arrow 20 m, a
  grimoire's fireball as far as half again its reach), it gives up, and hits no one (a `fizzle`
  event, `spent`). Whoever stands, or walks, is hit as before; only one who outruns a shot gets
  away from it. Before, a fireball let go at a rider who galloped off followed them 344 m, for 38
  seconds, and landed when they stopped."""),
    ("""  **Stun** (the Hexes') is cast on an enemy within 9 metres that the caster can see (0.4 s): for
  3 seconds it can't move, attack, cast or think, and whatever it was starting is called off;""", """  **Stun** (the Hexes') is cast on an enemy within 18 metres that the caster can see (0.4 s): for
  3 seconds it can't move, attack, cast or think, and whatever it was starting is called off;"""),
    ("""| Stun | an enemy | 18 m, in sight | 400 ms | can't act for 3000 ms | 3000 ms |""", """| Stun | an enemy | 18 m, in sight | 400 ms | can't act for 3000 ms | 5000 ms |"""),
    ("""- **Closing its ranks** (`#closeRanks`). Once a second (`CLOSE_MS`), if any of it have fallen
  (or joined), its line's laid out again for those left:""", """- **Closing its ranks** (`#closeRanks`). Once a second (`CLOSE_MS`), if any of it have fallen
  (or joined: also when one's fallen and another's joined in the same second, as many as before,
  `#regroup`), its line's laid out again for those left:"""),
])

edit("docs/MAGIC.md", [
    ("""Each on an enemy within 8 metres (9 from the third tier, 10 from the sixth) and in sight.""", """Each on an enemy within 16 metres (18 from the third tier, 20 from the sixth) and in sight."""),
    ("""The Hexes skill's (core/progress.js): **Stun** (an enemy within 9 metres, 400 ms, a 5 s""", """The Hexes skill's (core/progress.js): **Stun** (an enemy within 18 metres, 400 ms, a 5 s"""),
    ("""acid poisoning, rot sickening); still only the enemies of the side the caster was on once they've
gone (a player who's left the game), never their friends or allies.""", """acid poisoning, rot sickening); still only the enemies of the side the caster was on once they've
gone (a player who's left the game), never their friends or allies. Once its caster's fallen, what
it does is no one's blow (as a bomb's burst is, its thrower fallen): no one turns on the fallen
for it or holds it against them, and what it fells isn't counted theirs."""),
])

edit("client/js/core/spells.js", [
    ("""    // Wards: on oneself or a friend, five minutes""", """    // Wards: on oneself or a friend, an hour (WARDING)"""),
])
print("ok")
