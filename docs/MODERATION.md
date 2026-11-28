# Moderating a Pellagos server

What the owner of a world server does to keep its players safe, and when. This is the runbook the
scaling plan asks for (`generated/multiplayer_scaling_plan.md`, 6B-13 and 6B-23). It covers Nanny
Mode and reports from players today. Mutes by hand, bans and the rest are added here as they are
built (6B-5 to 6B-10).

How each thing works is in [SERVER.md](SERVER.md) (*Nanny Mode*); this says what to do.

## Nanny Mode

A player in Nanny Mode sends and sees quick phrases only. A server puts a player in it by the
country they connect from; a player, or a parent, can also choose it. It ships **off**.

### Before turning it on

1. Read the country list in Settings (*Nanny Mode's countries*). It ships with the
   United Kingdom (16), Brazil (18) and Indonesia (16). These are readings of each country's
   rules from summaries, not legal advice.
2. Choose where it applies: **public worlds** or **every world**. A world entered with a key from
   someone the player knows is arguably not "strangers"; the rules' own words don't say so.
3. Decide about **unknown countries** (on, as shipped). On, a connection whose country can't be
   told is in Nanny Mode. That includes anyone on the server's own Wi-Fi, which has no country.
4. Know that **nothing lifts it yet** for a player a country's rules put in it: no age-check
   provider ships. The chat panel tells such a player so.
5. Turning it on downloads DB-IP's country file (about 31 MB, once a month), under its licence
   (CC BY 4.0): the credit is in the game and on the management page. Behind Cloudflare Tunnel,
   Cloudflare's own word for the country is used instead.

### Every 90 days: review the country list

The rules change. The management page lists what Nanny Mode lacks under its countries, and says
when the list is due a review: 90 days after the oldest entry's `reviewed` date.

1. For each entry, read its `source` again and look for news of that country's rules: has the
   age changed, has the rule come into force, been delayed or struck down?
2. Look for countries to add: a rule that limits children's chat with strangers in online games,
   with an age.
3. In the settings file (`server.json`, in the data folder), change `nannyCountries`: each entry
   has `code`, `threshold`, `reason`, `source` and `reviewed`. Set `reviewed` to today's date
   (as 2026-11-28) on every entry you checked, changed or not.
4. Start the server again, or save any setting from the management page, and check that the
   page no longer says the list is due.

The list that ships with the game is reviewed with each release; a server that has changed its
own list keeps its own.

### When the country file is old

The page says so when the file is more than 62 days old. From then every connection's country is
unknown, so (as shipped) everyone is in Nanny Mode.

1. Settings shows why the last download failed, if it did.
2. Check the server can reach `download.db-ip.com`. It tries again each day while Nanny Mode is
   on.
3. If DB-IP's file is gone for good, put the server behind Cloudflare Tunnel (which says the
   country itself) or turn Nanny Mode for unknown countries off, knowing what that lets through.

### When someone may be under age

**May be under age** is one of the reasons a player can give when they report another (see
*Reports from players*, below), and it comes to you like any other report. If a report, or
anything else, gives you reason to think a player who is out of Nanny Mode should be in it:

- A player who **passed an age check** can be made to pass it again:
  `POST /api/v1/server/players/<their player id>/agecheck/again`, with the admin key. Their key
  can be carried to another device, and so to another person. They are back in Nanny Mode where
  they stand.
- Never ask a player their age, for a photo, or for a document yourself. An age someone says
  they are lifts nothing, and what they send you is yours to keep safe.

### What a player can do themselves

A player can switch Nanny Mode on for themselves in Game options, under Chat and players, and
lock it with a code. That lock is kept on their device: clearing the browser's data forgets it.
It is a parent's tool, and it doesn't replace the server's.

## Reports from players

In a **public** world, each player's row in the Players tab has a **Report** button. The player
picks a reason: Abuse or harassment, Spam or adverts, Cheating, **May be under age**, or
Something else. The other player isn't told who reported them. No other kind of world takes
reports or keeps what's said.

### What a report holds

- Who reported whom: each one's player id in that world, their own identity if they came in by
  one, and their hero's name.
- The reason, the world and the time.
- The last 20 lines said between the two (one said it and the other was sent it), from the
  server's chat log.
- Where each of them stood.

### What the server does by itself

- **Five reports an hour** from one player; a sixth is refused.
- **Three different players** reporting the same one **within ten minutes** mutes them: their
  shouts and what they say to the area channel are refused, in every world of the server. Their
  party and their direct messages still work. They stay muted until you lift it.
- Nobody is banned or sent out of a world by a report. That is yours to decide.

### Reading them

The management page shows **Reports from players** on its first tab while any wait or anyone is
muted. Reading and answering them is through the server's API for now, with the admin key, from
the server's computer or its Wi-Fi (a page for it is the plan's 6B-7):

1. `GET /api/v1/server/reports` lists every report, newest first, and who is muted.
2. Read the lines. A report is one player's word; the lines are what was said.
3. `POST /api/v1/server/reports/<report id>/review` marks it looked at. Send `{ "lift": true }`
   to lift the mute on the player it is about. Without it the mute stays, and you can lift it
   later the same way.
4. If more is needed, send them out or ban them from the world's Players table.

### What is kept, and how long

- **The chat log** (`chat/` in the data folder): what's said in public worlds, with who said it
  and who it went to. Each day's file is deleted when it is 30 days old. It is left out of the
  server's archives.
- **Reports** (`reports.json`): kept 12 months. A mute stays until it's lifted.
- Anything in a line that looks like a key, a token or a whole address is taken out before it's
  written.
