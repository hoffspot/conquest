import sys

root = sys.argv[1]


def edit(path, pairs):
    s = open(f"{root}/{path}").read()
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:80], s.count(old))
        s = s.replace(old, new)
    open(f"{root}/{path}", "w").write(s)


edit("docs/GAME.md", [
    ("""- **Thinking less often.** One in a line looks again for whom to fight only every quarter second
  (`RETHINK_MS`), meanwhile set on whoever it was set on (at once if they fall): hundreds looking
  every step was most of what a field battle cost.
""", """- **Thinking less often.** One in a line looks again for whom to fight only every quarter second
  (`RETHINK_MS`), meanwhile set on whoever it was set on (at once if they fall): hundreds looking
  every step was most of what a field battle cost.

**Looking round four times a second** (`RETHINK_MS`, `turnOf`). Anyone set on no one does the
same: a guard at its post, a soldier in camp, a beast in the wild looks for an enemy every
quarter second, not every step, and asks as often whether it's in a fight at all (to draw its
weapon, or put it away: `#arm`). With no enemy near, nothing ends such a search early, so a crowd
at peace cost more than one fighting: a hundred soldiers standing in camp took 1.28 ms of every
step, three times what the same hundred took fighting, and four hundred 9.3 ms. Now 0.23 and 1.5
(Node, the review's `idle.mjs`). What it changes in play:

- A guard or a beast notices an enemy who isn't a player up to a fifth of a second after they
  come into sight, and an alarm raised by one of its own as late.
- **A player's noticed in the step they come into sight**, as before: between its looks, one set
  on no one still asks whether a player's near with room on them (`#drawnTo`), and one that sees
  further than most, or one of the wild's, whether a player's anywhere in its sight
  (`#playerSeen`). Its weapon's drawn the step after.
- Whoever's set on someone looks every step, as before, and one whose foe falls or is lost looks
  for the next at once: only a look that finds no one puts the next one off.
- Anyone someone's already after (set on them, striking at them, told to fight them) is in its
  fight at once, as before (`#chasers`); so is anyone told to fight.
- A weapon's put away up to a quarter second later than its ten seconds.

Each looks in a step of its own of the five, by its id (the sum of its letters' codes, the
remainder by five: `turnOf`), so a camp's looks are spread evenly over the steps, the same in
every copy of the world, and nothing's kept of it: a snapshot holds no more. Those in a line
look in their own step too (they all looked in the same one, every fifth step twice the
others'), and the folk look about them for danger in their own step of the eight. A healer still
looks for whom to mend every step its spell's ready.
"""),
    ("""  It can strike 700 ms later (`DRAW_MS`), and an attack waits for it. With no enemy in sight or
  after it for 10 seconds (`SHEATHE_AFTER_MS`), and not attacking, it puts the weapon away
  (`on`: false, taking `SHEATHE_MS`). Coming back to life, it's put away.""", """  It can strike 700 ms later (`DRAW_MS`), and an attack waits for it. With no enemy in sight or
  after it for 10 seconds (`SHEATHE_AFTER_MS`), and not attacking, it puts the weapon away
  (`on`: false, taking `SHEATHE_MS`). Coming back to life, it's put away. One set on no one,
  with no one after it, asks whether an enemy's in sight four times a second, not every step
  (*Looking round four times a second*, above): its weapon's drawn up to a fifth of a second
  after one comes into sight."""),
    ("""- **The folk in danger** (`#afraid`, `FLEE`). Every 0.4 seconds each of the folk looks about them
  for whoever frightens them, within 12 squares and in sight:""", """- **The folk in danger** (`#afraid`, `FLEE`). Every 0.4 seconds each of the folk looks about them
  (each in its own step of the eight, not all in the same one: `turnOf`) for whoever frightens
  them, within 12 squares and in sight:"""),
])

edit("client/js/core/battle.js", [
    ("""//    GIVE_UP_MS. Struck, it (and a creature's whole pack) goes after whoever did it, beyond its
//    leash and unseen, till DEFEND_MS after the last blow (#provoke).
//""", """//    GIVE_UP_MS. Struck, it (and a creature's whole pack) goes after whoever did it, beyond its
//    leash and unseen, till DEFEND_MS after the last blow (#provoke). Set on no one, it looks
//    round for an enemy four times a second, in a step of its own (RETHINK_MS, turnOf), not
//    every step; a player it notices in the step they come into sight all the same.
//"""),
    ("""// takes a moment (DRAW_MS) before the weapon can be used; once no enemy has been in sight or
// after them for SHEATHE_AFTER_MS, they put it away again, which takes a while too (SHEATHE_MS).
// (A "draw" event: { id, on }.)""", """// takes a moment (DRAW_MS) before the weapon can be used; once no enemy has been in sight or
// after them for SHEATHE_AFTER_MS, they put it away again, which takes a while too (SHEATHE_MS).
// (A "draw" event: { id, on }.) Set on no one and with no one after them, they ask whether an
// enemy's in sight four times a second (#arm, RETHINK_MS)."""),
])
print("ok")
