import sys

root = sys.argv[1]


def edit(path, pairs):
    s = open(f"{root}/{path}").read()
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:80], s.count(old))
        s = s.replace(old, new)
    open(f"{root}/{path}", "w").write(s)


edit("docs/GAME.md", [
    ("""who's on each player as the step begins, `#mustered`, and anyone newly set on them since). The
same holds for the nearest enemy and an alarm raised, but not for one the player's struck (or
stunned, or cast at): set on, an enemy always turns on whoever did it (`#turnOn`), however many
are on them already (the user: "make sure any unit that is attacked attempts to defend itself").
The rest fight whoever else is near: a player in a battle of hundreds has a fight, not a crowd,
on them.""", """who's on each player as the step begins, `#mustered`, and anyone newly set on them since). The
same holds for the nearest enemy and an alarm raised.

**The cap holds back only those the player hasn't struck** (the owner: "If a player strikes an
enemy, it can be hostile beyond the cap"; the user before: "make sure any unit that is attacked
attempts to defend itself"). Anyone a player strikes, stuns, casts at or taunts may come for
them, however many are on them already:

- set on no one, it turns on them at the blow (`#turnOn`), room or no;
- on someone else, it leaves them for the player as its enmity has it (the harm the player's
  done it past what the other has, docs/WILDS.md *Whom they go for*), room or no: for 10
  seconds after each blow there's always room on a player for one they've struck (`#roomOn`,
  its `struckBy`, `DEFEND_MS`). Before, such a one was kept on whoever it was fighting while the
  cap was full;
- once on the player, it stays on them as anyone does: the cap never takes off one that's on.

So an archer who puts an arrow into each of twenty has twenty on them, and a bomb among those
standing by brings every one it catches. Those of the struck one's own who only saw it are the
player's enemies from then, but are held back by the cap like any other. It's the guards' and
soldiers' cap (`ai` "patrol"): the wild's creatures have none, a pack of ten all come.
The rest fight whoever else is near: a player in a battle of hundreds has a fight, not a crowd,
on them (`test/battle-rules.test.js`: six of ten up close, four of ten shooting)."""),
])

edit("docs/WAR.md", [
    ("""it's there. A player in among them has at
  most 6 enemies on them up close and 4 shooting or casting (`AGGRO`); the rest fight the
  player's own.""", """it's there. A player in among them has at
  most 6 enemies on them up close and 4 shooting or casting (`AGGRO`), and whoever they've
  struck besides: the cap holds back only those they haven't (docs/GAME.md *The player first*);
  the rest fight the player's own."""),
])

edit("docs/WILDS.md", [
    ("""- **Whom it goes for.** The one with the most that it can see and go for (within its leash, and
  for a guard, AGGRO's room on a player).""", """- **Whom it goes for.** The one with the most that it can see and go for (within its leash, and
  for a guard, AGGRO's room on a player: there's always room on a player for one they've struck
  in the last 10 seconds, docs/GAME.md *The player first*)."""),
])
print("ok")
