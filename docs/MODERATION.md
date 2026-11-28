# Moderating a Pellagos server

What the owner of a world server does to keep its players safe, and when. This is the runbook the
scaling plan asks for (`generated/multiplayer_scaling_plan.md`, 6B-13 and 6B-23). It covers Nanny
Mode today. Reports, mutes, bans and the rest are added here as they are built (6B-5 to 6B-10).

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

Reports from players aren't built yet (the plan's 6B-6). When they are, **May be under age** is
one of the reasons a player can give, and it comes to the owner like any other report. Until
then, if you have reason to think a player who is out of Nanny Mode should be in it:

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
