// The items', the interface's and the cues' recorded sounds (scripts/build-sounds.js): coins, picking
// up, dropping and throwing away, putting on cloth, leather, mail and plate, a potion uncorked and
// drunk, scrolls, books and maps, the pack, chests, a lock, a quill, a trade, eating; the wheel's
// ticks, a tap, talk, a quick action, no; and the cues, each in D Dorian as the music is (a foe
// slain, a friend fallen, waking, rising a rank, a quest done, news, a pin set, too dear). All CC0,
// each source's page saying so (checked 2026-10-07). Each a cut of one recording, or layers of
// several, at the gain it was auditioned at (−20 dBFS by its loudest 30 ms, less where its peak
// would pass −1); a cue's notes tuned a semitone or two as a sampler would, faded before they're
// tuned.

import { RATE } from "./dsp.js";

/** The recordings, by key: where each is (its file, or the archive it's in), what it is, who made it, its licence. */
export const SOURCES = {
    "artisticdude-rpg-sound-pack-inventory-chainmail1": { url: "https://opengameart.org/sites/default/files/rpg_sound_pack.zip", member: "RPG Sound Pack/inventory/chainmail1.wav", title: "chainmail1", by: "artisticdude", page: "https://opengameart.org/content/rpg-sound-pack", licence: "CC0" },
    "artisticdude-rpg-sound-pack-inventory-chainmail2": { url: "https://opengameart.org/sites/default/files/rpg_sound_pack.zip", member: "RPG Sound Pack/inventory/chainmail2.wav", title: "chainmail2", by: "artisticdude", page: "https://opengameart.org/content/rpg-sound-pack", licence: "CC0" },
    "freesound-202107": { url: "https://cdn.freesound.org/previews/202/202107_3756348-hq.mp3", title: "Unrolling Scroll.wav", by: "spookymodem", page: "https://freesound.org/people/spookymodem/sounds/202107/", licence: "CC0" },
    "freesound-435534": { url: "https://cdn.freesound.org/previews/435/435534_4807538-hq.mp3", title: "Leather bag being dropped and picked up", by: "vintage2005", page: "https://freesound.org/people/vintage2005/sounds/435534/", licence: "CC0" },
    "freesound-447931": { url: "https://cdn.freesound.org/previews/447/447931_9159316-hq.mp3", title: "Unfold a map", by: "Breviceps", page: "https://freesound.org/people/Breviceps/sounds/447931/", licence: "CC0" },
    "freesound-485766": { url: "https://cdn.freesound.org/previews/485/485766_6150892-hq.mp3", title: "Coins Shake - 1", by: "SpaceJoe", page: "https://freesound.org/people/SpaceJoe/sounds/485766/", licence: "CC0" },
    "freesound-485767": { url: "https://cdn.freesound.org/previews/485/485767_6150892-hq.mp3", title: "Coins Shake - 2", by: "SpaceJoe", page: "https://freesound.org/people/SpaceJoe/sounds/485767/", licence: "CC0" },
    "freesound-485771": { url: "https://cdn.freesound.org/previews/485/485771_6150892-hq.mp3", title: "Few Coins Move - 1", by: "SpaceJoe", page: "https://freesound.org/people/SpaceJoe/sounds/485771/", licence: "CC0" },
    "freesound-485772": { url: "https://cdn.freesound.org/previews/485/485772_6150892-hq.mp3", title: "Few Coins Move - 2", by: "SpaceJoe", page: "https://freesound.org/people/SpaceJoe/sounds/485772/", licence: "CC0" },
    "freesound-573069": { url: "https://cdn.freesound.org/previews/573/573069_367313-hq.mp3", title: "book_open_close.wav", by: "j1987", page: "https://freesound.org/people/j1987/sounds/573069/", licence: "CC0" },
    "freesound-573648": { url: "https://cdn.freesound.org/previews/573/573648_6614920-hq.mp3", title: "Wooden Chest Lid Close.wav", by: "The_Frisbee_of_Peace", page: "https://freesound.org/people/The_Frisbee_of_Peace/sounds/573648/", licence: "CC0" },
    "freesound-573654": { url: "https://cdn.freesound.org/previews/573/573654_6614920-hq.mp3", title: "Wooden Chest Open.wav", by: "The_Frisbee_of_Peace", page: "https://freesound.org/people/The_Frisbee_of_Peace/sounds/573654/", licence: "CC0" },
    "freesound-722038": { url: "https://cdn.freesound.org/previews/722/722038_8329993-hq.mp3", title: "Coin Pouch Drop on surface", by: "Canakinsound", page: "https://freesound.org/people/Canakinsound/sounds/722038/", licence: "CC0" },
    "freesound-734645": { url: "https://cdn.freesound.org/previews/734/734645_13973196-hq.mp3", title: "Wood box - accesories", by: "Vrymaa", page: "https://freesound.org/people/Vrymaa/sounds/734645/", licence: "CC0" },
    "freesound-734929": { url: "https://cdn.freesound.org/previews/734/734929_13973196-hq.mp3", title: "Cupboard - Open & close", by: "Vrymaa", page: "https://freesound.org/people/Vrymaa/sounds/734929/", licence: "CC0" },
    "freesound-753202": { url: "https://cdn.freesound.org/previews/753/753202_13973196-hq.mp3", title: "Write - Old parchment or papyrus", by: "Vrymaa", page: "https://freesound.org/people/Vrymaa/sounds/753202/", licence: "CC0" },
    "freesound-753282": { url: "https://cdn.freesound.org/previews/753/753282_13973196-hq.mp3", title: "Parchment - Unroll", by: "Vrymaa", page: "https://freesound.org/people/Vrymaa/sounds/753282/", licence: "CC0" },
    "freesound-770050": { url: "https://cdn.freesound.org/previews/770/770050_13973196-hq.mp3", title: "Leather jacket - Dress undress", by: "Vrymaa", page: "https://freesound.org/people/Vrymaa/sounds/770050/", licence: "CC0" },
    "freesound-775016": { url: "https://cdn.freesound.org/previews/775/775016_13973196-hq.mp3", title: "Cooking pot - Roll & place", by: "Vrymaa", page: "https://freesound.org/people/Vrymaa/sounds/775016/", licence: "CC0" },
    "freesound-805468": { url: "https://cdn.freesound.org/previews/805/805468_13973196-hq.mp3", title: "Drinking from bottle", by: "Vrymaa", page: "https://freesound.org/people/Vrymaa/sounds/805468/", licence: "CC0" },
    "freesound-807389": { url: "https://cdn.freesound.org/previews/807/807389_13973196-hq.mp3", title: "Weapon - Fall on carpet", by: "Vrymaa", page: "https://freesound.org/people/Vrymaa/sounds/807389/", licence: "CC0" },
    "freesound-807393": { url: "https://cdn.freesound.org/previews/807/807393_13973196-hq.mp3", title: "Food - Eating a fruit", by: "Vrymaa", page: "https://freesound.org/people/Vrymaa/sounds/807393/", licence: "CC0" },
    "kenney-audio-card-slide-1": { url: "https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip", member: "Audio/card-slide-1.ogg", title: "card-slide-1", by: "Kenney (kenney.nl)", page: "https://kenney.nl/assets/casino-audio", licence: "CC0" },
    "kenney-audio-card-slide-2": { url: "https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip", member: "Audio/card-slide-2.ogg", title: "card-slide-2", by: "Kenney (kenney.nl)", page: "https://kenney.nl/assets/casino-audio", licence: "CC0" },
    "kenney-audio-card-slide-3": { url: "https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip", member: "Audio/card-slide-3.ogg", title: "card-slide-3", by: "Kenney (kenney.nl)", page: "https://kenney.nl/assets/casino-audio", licence: "CC0" },
    "kenney-audio-card-slide-4": { url: "https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip", member: "Audio/card-slide-4.ogg", title: "card-slide-4", by: "Kenney (kenney.nl)", page: "https://kenney.nl/assets/casino-audio", licence: "CC0" },
    "kenney-audio-cloth1": { url: "https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip", member: "Audio/cloth1.ogg", title: "cloth1", by: "Kenney (kenney.nl)", page: "https://kenney.nl/assets/rpg-audio", licence: "CC0" },
    "kenney-audio-cloth2": { url: "https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip", member: "Audio/cloth2.ogg", title: "cloth2", by: "Kenney (kenney.nl)", page: "https://kenney.nl/assets/rpg-audio", licence: "CC0" },
    "kenney-audio-cloth3": { url: "https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip", member: "Audio/cloth3.ogg", title: "cloth3", by: "Kenney (kenney.nl)", page: "https://kenney.nl/assets/rpg-audio", licence: "CC0" },
    "kenney-audio-impactwood-light-000": { url: "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip", member: "Audio/impactWood_light_000.ogg", title: "impactWood_light_000", by: "Kenney (kenney.nl)", page: "https://kenney.nl/assets/impact-sounds", licence: "CC0" },
    "kenney-audio-impactwood-light-001": { url: "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip", member: "Audio/impactWood_light_001.ogg", title: "impactWood_light_001", by: "Kenney (kenney.nl)", page: "https://kenney.nl/assets/impact-sounds", licence: "CC0" },
    "kenney-audio-impactwood-light-002": { url: "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip", member: "Audio/impactWood_light_002.ogg", title: "impactWood_light_002", by: "Kenney (kenney.nl)", page: "https://kenney.nl/assets/impact-sounds", licence: "CC0" },
    "kenney-audio-impactwood-light-003": { url: "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip", member: "Audio/impactWood_light_003.ogg", title: "impactWood_light_003", by: "Kenney (kenney.nl)", page: "https://kenney.nl/assets/impact-sounds", licence: "CC0" },
    "kenney-audio-impactwood-light-004": { url: "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip", member: "Audio/impactWood_light_004.ogg", title: "impactWood_light_004", by: "Kenney (kenney.nl)", page: "https://kenney.nl/assets/impact-sounds", licence: "CC0" },
    "rubberduck-book-01": { url: "https://opengameart.org/sites/default/files/80-CC0-RPG-SFX_0.zip", member: "book_01.ogg", title: "book_01", by: "rubberduck", page: "https://opengameart.org/content/80-cc0-rpg-sfx", licence: "CC0" },
    "rubberduck-book-02": { url: "https://opengameart.org/sites/default/files/80-CC0-RPG-SFX_0.zip", member: "book_02.ogg", title: "book_02", by: "rubberduck", page: "https://opengameart.org/content/80-cc0-rpg-sfx", licence: "CC0" },
    "rubberduck-book-03": { url: "https://opengameart.org/sites/default/files/80-CC0-RPG-SFX_0.zip", member: "book_03.ogg", title: "book_03", by: "rubberduck", page: "https://opengameart.org/content/80-cc0-rpg-sfx", licence: "CC0" },
    "rubberduck-book-04": { url: "https://opengameart.org/sites/default/files/80-CC0-RPG-SFX_0.zip", member: "book_04.ogg", title: "book_04", by: "rubberduck", page: "https://opengameart.org/content/80-cc0-rpg-sfx", licence: "CC0" },
    "schupke-sfx-arrow-grab-from-quiver-01": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/arrow-grab-from-quiver-01.wav", title: "arrow-grab-from-quiver-01", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-arrow-grab-from-quiver-03": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/arrow-grab-from-quiver-03.wav", title: "arrow-grab-from-quiver-03", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-arrow-grab-from-quiver-05": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/arrow-grab-from-quiver-05.wav", title: "arrow-grab-from-quiver-05", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-arrow-grab-from-quiver-06": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/arrow-grab-from-quiver-06.wav", title: "arrow-grab-from-quiver-06", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-keyhole-lockbox-turn-02": { url: "https://opengameart.org/sites/default/files/accessory.zip", member: "sfx/keyhole-lockbox-turn-02.wav", title: "keyhole-lockbox-turn-02", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-accessory-sfx-library", licence: "CC0" },
    "schupke-sfx-keyhole-lockbox-turn-04": { url: "https://opengameart.org/sites/default/files/accessory.zip", member: "sfx/keyhole-lockbox-turn-04.wav", title: "keyhole-lockbox-turn-04", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-accessory-sfx-library", licence: "CC0" },
    "schupke-sfx-keyhole-lockbox-turn-05": { url: "https://opengameart.org/sites/default/files/accessory.zip", member: "sfx/keyhole-lockbox-turn-05.wav", title: "keyhole-lockbox-turn-05", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-accessory-sfx-library", licence: "CC0" },
    "schupke-sfx-keyhole-lockbox-turn-06": { url: "https://opengameart.org/sites/default/files/accessory.zip", member: "sfx/keyhole-lockbox-turn-06.wav", title: "keyhole-lockbox-turn-06", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-accessory-sfx-library", licence: "CC0" },
    "schupke-sfx-keyhole-lockbox-unlock-01": { url: "https://opengameart.org/sites/default/files/accessory.zip", member: "sfx/keyhole-lockbox-unlock-01.wav", title: "keyhole-lockbox-unlock-01", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-accessory-sfx-library", licence: "CC0" },
    "schupke-sfx-keyhole-lockbox-unlock-04": { url: "https://opengameart.org/sites/default/files/accessory.zip", member: "sfx/keyhole-lockbox-unlock-04.wav", title: "keyhole-lockbox-unlock-04", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-accessory-sfx-library", licence: "CC0" },
    "schupke-sfx-keyhole-lockbox-unlock-05": { url: "https://opengameart.org/sites/default/files/accessory.zip", member: "sfx/keyhole-lockbox-unlock-05.wav", title: "keyhole-lockbox-unlock-05", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-accessory-sfx-library", licence: "CC0" },
    "schupke-sfx-quiver-leather-squeeze-05": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/quiver-leather-squeeze-05.wav", title: "quiver-leather-squeeze-05", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-quiver-leather-squeeze-07": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/quiver-leather-squeeze-07.wav", title: "quiver-leather-squeeze-07", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-quiver-leather-squeeze-08": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/quiver-leather-squeeze-08.wav", title: "quiver-leather-squeeze-08", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-quiver-leather-squeeze-11": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/quiver-leather-squeeze-11.wav", title: "quiver-leather-squeeze-11", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-quiver-leather-squeeze-12": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/quiver-leather-squeeze-12.wav", title: "quiver-leather-squeeze-12", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-quiver-leather-squeeze-13": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/quiver-leather-squeeze-13.wav", title: "quiver-leather-squeeze-13", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-sheath-buckle-01": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/sheath-buckle-01.wav", title: "sheath-buckle-01", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-sheath-unbuckle-01": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/sheath-unbuckle-01.wav", title: "sheath-unbuckle-01", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-sheath-unbuckle-02": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/sheath-unbuckle-02.wav", title: "sheath-unbuckle-02", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-sheath-unbuckle-03": { url: "https://opengameart.org/sites/default/files/weapons-apparel.zip", member: "sfx/sheath-unbuckle-03.wav", title: "sheath-unbuckle-03", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library", licence: "CC0" },
    "schupke-sfx-vial-glass-round-uncork-01": { url: "https://opengameart.org/sites/default/files/accessory.zip", member: "sfx/vial-glass-round-uncork-01.wav", title: "vial-glass-round-uncork-01", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-accessory-sfx-library", licence: "CC0" },
    "schupke-sfx-vial-glass-round-uncork-02": { url: "https://opengameart.org/sites/default/files/accessory.zip", member: "sfx/vial-glass-round-uncork-02.wav", title: "vial-glass-round-uncork-02", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-accessory-sfx-library", licence: "CC0" },
    "schupke-sfx-vial-glass-round-uncork-03": { url: "https://opengameart.org/sites/default/files/accessory.zip", member: "sfx/vial-glass-round-uncork-03.wav", title: "vial-glass-round-uncork-03", by: "Jan Schupke ('Vehicle', vehiclemusic.eu)", page: "https://opengameart.org/content/fantasy-accessory-sfx-library", licence: "CC0" },
    "vcsl-ewharp-normal-d3-v2-rr1": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Composite%20Chordophones/Folk%20Harp/EWHarp_Normal_D3_v2_RR1.wav", title: "Chordophones/Composite Chordophones/Folk Harp/EWHarp_Normal_D3_v2_RR1.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-ewharp-normal-d4-v2-rr1": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Composite%20Chordophones/Folk%20Harp/EWHarp_Normal_D4_v2_RR1.wav", title: "Chordophones/Composite Chordophones/Folk Harp/EWHarp_Normal_D4_v2_RR1.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-ewharp-normal-d5-v2-rr1": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Composite%20Chordophones/Folk%20Harp/EWHarp_Normal_D5_v2_RR1.wav", title: "Chordophones/Composite Chordophones/Folk Harp/EWHarp_Normal_D5_v2_RR1.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-ewharp-normal-f-3-v2-rr1": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Composite%20Chordophones/Folk%20Harp/EWHarp_Normal_F%233_v2_RR1.wav", title: "Chordophones/Composite Chordophones/Folk Harp/EWHarp_Normal_F#3_v2_RR1.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-ewharp-normal-f-4-v2-rr1": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Composite%20Chordophones/Folk%20Harp/EWHarp_Normal_F%234_v2_RR1.wav", title: "Chordophones/Composite Chordophones/Folk Harp/EWHarp_Normal_F#4_v2_RR1.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-ewharp-normal-g-3-v2-rr1": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Composite%20Chordophones/Folk%20Harp/EWHarp_Normal_G%233_v2_RR1.wav", title: "Chordophones/Composite Chordophones/Folk Harp/EWHarp_Normal_G#3_v2_RR1.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-ewharp-normal-g-4-v2-rr1": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Composite%20Chordophones/Folk%20Harp/EWHarp_Normal_G%234_v2_RR1.wav", title: "Chordophones/Composite Chordophones/Folk Harp/EWHarp_Normal_G#4_v2_RR1.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-glock-medium-c5-01": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Glockenspiel/glock_medium_C5_01.wav", title: "Idiophones/Struck Idiophones/Glockenspiel/glock_medium_C5_01.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-glock-medium-g4-01": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Glockenspiel/glock_medium_G4_01.wav", title: "Idiophones/Struck Idiophones/Glockenspiel/glock_medium_G4_01.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-hb-1": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hand%20Bells%2C%20Nepalese/HB_1.wav", title: "Idiophones/Struck Idiophones/Hand Bells, Nepalese/HB_1.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-hb-2": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hand%20Bells%2C%20Nepalese/HB_2.wav", title: "Idiophones/Struck Idiophones/Hand Bells, Nepalese/HB_2.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-sus-a-3-r01-main": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hand%20Chimes/sus_A%233_r01_main.wav", title: "Idiophones/Struck Idiophones/Hand Chimes/sus_A#3_r01_main.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-sus-a4-r01-main": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hand%20Chimes/sus_A4_r01_main.wav", title: "Idiophones/Struck Idiophones/Hand Chimes/sus_A4_r01_main.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-sus-c4-r01-main": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hand%20Chimes/sus_C4_r01_main.wav", title: "Idiophones/Struck Idiophones/Hand Chimes/sus_C4_r01_main.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-sus-d4-r01-main": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hand%20Chimes/sus_D4_r01_main.wav", title: "Idiophones/Struck Idiophones/Hand Chimes/sus_D4_r01_main.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-sus-d5-r01-main": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hand%20Chimes/sus_D5_r01_main.wav", title: "Idiophones/Struck Idiophones/Hand Chimes/sus_D5_r01_main.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-sus-e3-r01-main": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hand%20Chimes/sus_E3_r01_main.wav", title: "Idiophones/Struck Idiophones/Hand Chimes/sus_E3_r01_main.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-sus-e4-r01-main": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hand%20Chimes/sus_E4_r01_main.wav", title: "Idiophones/Struck Idiophones/Hand Chimes/sus_E4_r01_main.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-sus-f-3-r01-main": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hand%20Chimes/sus_F%233_r01_main.wav", title: "Idiophones/Struck Idiophones/Hand Chimes/sus_F#3_r01_main.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-sus-f-4-r01-main": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hand%20Chimes/sus_F%234_r01_main.wav", title: "Idiophones/Struck Idiophones/Hand Chimes/sus_F#4_r01_main.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-wood-click-mp": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Woodblock/wood_click_mp.wav", title: "Idiophones/Struck Idiophones/Woodblock/wood_click_mp.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-wood-click-pp-rr1": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Woodblock/wood_click_pp_rr1.wav", title: "Idiophones/Struck Idiophones/Woodblock/wood_click_pp_rr1.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-wood-click-pp-rr2": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Woodblock/wood_click_pp_rr2.wav", title: "Idiophones/Struck Idiophones/Woodblock/wood_click_pp_rr2.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
    "vcsl-wood-click-pp-rr3": { url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Woodblock/wood_click_pp_rr3.wav", title: "Idiophones/Struck Idiophones/Woodblock/wood_click_pp_rr3.wav", by: "Versilian Studios (Sam Gossner)", page: "https://github.com/sgossner/VCSL", licence: "CC0" },
};

/** Each sound's recipes take their gains as they are, not levelled, and no fade but their layer's own. */
export const RECIPE = Object.freeze({ level: null, fadeIn: 0, fadeOut: 0 });

/**
 * Those downloaded only once they're wanted (as the game starts: sound.js want), not at the start:
 * the items'. The interface's, the cues' and the coins' are there from the first tap.
 */
export const ON_DEMAND = Object.freeze(["coinPickup", "pickup", "drop", "discard", "equipCloth", "equipLeather", "equipMail", "equipPlate", "potionCork", "potionDrink", "scroll", "bookOpen", "pageTurn", "mapUnfold", "packOpen", "packClose", "chestOpen", "chestClose", "lockpick", "quill", "tradeDone", "eat"]);

/**
 * Each sound's variants: a cut of one recording, or layers (each `at` its place in, a cue's notes
 * tuned by `rate`, faded before they're tuned), cut to `cap` after `trim`, at its exact gain
 * (scripts/sounds/render.js).
 */
export const SOUNDS = {
    coins: [
        { layers: [{ from: "freesound-485766", cut: [28848, 38964], gain: -6.728374 }] },
        { layers: [{ from: "freesound-485766", cut: [38976, 48420], gain: -7.219265 }] },
        { layers: [{ from: "freesound-485766", cut: [49320, 58872], gain: -2.501881 }] },
        { layers: [{ from: "freesound-485767", cut: [12936, 29592], gain: -7.71845 }] },
        { layers: [{ from: "freesound-485767", cut: [47568, 59508], gain: -7.294514 }] },
    ],
    coinPickup: [
        { layers: [{ from: "freesound-485772", cut: [345408, 351456], gain: 14.211103 }] },
        { layers: [{ from: "freesound-485772", cut: [359412, 367668], gain: 13.278316 }] },
        { layers: [{ from: "freesound-485772", cut: [246216, 252216], fadeOut: 37.5, gain: 15.201726 }] },
        { layers: [{ from: "freesound-485772", cut: [136596, 144660], gain: 11.971406 }] },
        { layers: [{ from: "freesound-485771", cut: [222816, 227448], fadeOut: 28.95, gain: 17.317898 }] },
    ],
    pickup: [
        { layers: [{ from: "schupke-sfx-quiver-leather-squeeze-05", cut: [240, 21826], gain: -2.046742 }] },
        { layers: [{ from: "schupke-sfx-quiver-leather-squeeze-07", cut: [0, 17208], gain: -2.961043 }] },
        { layers: [{ from: "schupke-sfx-quiver-leather-squeeze-08", cut: [396, 17598], gain: -2.536331 }] },
        { layers: [{ from: "schupke-sfx-quiver-leather-squeeze-11", cut: [84, 21618], gain: -0.5701 }] },
        { layers: [{ from: "schupke-sfx-quiver-leather-squeeze-12", cut: [72, 21672], fadeOut: 135, gain: -10.858094 }] },
        { layers: [{ from: "schupke-sfx-quiver-leather-squeeze-13", cut: [516, 22116], fadeOut: 135, gain: -0.968168 }] },
    ],
    drop: [
        { layers: [{ from: "freesound-435534", cut: [41268, 61428], fadeOut: 126, gain: 25.770918 }] },
        { layers: [{ from: "freesound-435534", cut: [320112, 340272], fadeOut: 126, gain: 23.628177 }] },
        { layers: [{ from: "freesound-435534", cut: [576384, 591120], gain: 25.655457 }] },
    ],
    discard: [
        { layers: [{ from: "freesound-807389", cut: [92712, 106824], fadeOut: 88.2, gain: -7.681968 }] },
        { layers: [{ from: "freesound-807389", cut: [168168, 182556], gain: -8.268742 }] },
        { layers: [{ from: "freesound-807389", cut: [350784, 367392], gain: -6.928647 }] },
    ],
    equipCloth: [
        { layers: [{ from: "kenney-audio-cloth1", cut: [1224, 31730], gain: -0.46628 }] },
        { layers: [{ from: "kenney-audio-cloth2", cut: [2424, 19923], gain: 1.751596 }] },
        { layers: [{ from: "kenney-audio-cloth3", cut: [540, 22875], gain: 4.760558 }] },
    ],
    equipLeather: [
        { layers: [{ from: "freesound-770050", cut: [724704, 747600], fadeOut: 143.1, gain: -1.212007 }] },
        { layers: [{ from: "freesound-770050", cut: [486000, 502032], fadeOut: 100.2, gain: 3.969075 }] },
        { layers: [{ from: "freesound-770050", cut: [799212, 837612], fadeOut: 150, gain: -1.570743 }] },
    ],
    equipMail: [
        { layers: [{ from: "artisticdude-rpg-sound-pack-inventory-chainmail1", cut: [396, 27840], gain: -5.10041 }] },
        { layers: [{ from: "artisticdude-rpg-sound-pack-inventory-chainmail2", cut: [612, 36000], gain: -9.23993 }] },
    ],
    equipPlate: [
        { layers: [{ from: "freesound-775016", cut: [45576, 62424], gain: -2.939469 }] },
        { layers: [{ from: "freesound-775016", cut: [260568, 273756], gain: -5.264691 }] },
        { layers: [{ from: "freesound-775016", cut: [790212, 812232], gain: -5.60093 }] },
    ],
    potionCork: [
        { layers: [{ from: "schupke-sfx-vial-glass-round-uncork-01", cut: [24, 19224], gain: -10.493825 }] },
        { layers: [{ from: "schupke-sfx-vial-glass-round-uncork-02", cut: [3984, 19300], gain: -6.686779 }] },
        { layers: [{ from: "schupke-sfx-vial-glass-round-uncork-03", cut: [4476, 23676], gain: -6.485675 }] },
    ],
    potionDrink: [
        { layers: [{ from: "schupke-sfx-vial-glass-round-uncork-01", cut: [444, 14844], fadeOut: 10, gain: -10.493825 }, { from: "freesound-805468", cut: [30720, 68160], fadeOut: 10, at: 16320 / RATE, gain: -0.493825 }], trim: 24 / RATE, cap: 53736 / RATE, fadeIn: 2, fadeOut: 60 },
        { layers: [{ from: "schupke-sfx-vial-glass-round-uncork-02", cut: [4404, 18804], fadeOut: 10, gain: -6.686779 }, { from: "freesound-805468", cut: [300960, 339360], fadeOut: 10, at: 16320 / RATE, gain: 3.313221 }], cap: 54720 / RATE, fadeIn: 2, fadeOut: 60 },
        { layers: [{ from: "schupke-sfx-vial-glass-round-uncork-03", cut: [4524, 18924], fadeOut: 10, gain: -6.485675 }, { from: "freesound-805468", cut: [53760, 91200], fadeOut: 10, at: 16320 / RATE, gain: 3.514325 }], cap: 53760 / RATE, fadeIn: 2, fadeOut: 60 },
    ],
    scroll: [
        { layers: [{ from: "freesound-202107", cut: [23112, 94560], fadeOut: 150, gain: 16.118675 }] },
        { layers: [{ from: "freesound-202107", cut: [84960, 156960], fadeOut: 60, gain: 16.118675 }] },
    ],
    bookOpen: [
        { layers: [{ from: "freesound-573069", cut: [71148, 99996], gain: 15.263719 }] },
        { layers: [{ from: "freesound-573069", cut: [191712, 226128], gain: 17.196191 }] },
        { layers: [{ from: "freesound-573069", cut: [433440, 463440], gain: 14.550996 }] },
    ],
    pageTurn: [
        { layers: [{ from: "rubberduck-book-01", cut: [5760, 34560], fadeOut: 60, gain: -1.458687 }] },
        { layers: [{ from: "rubberduck-book-02", cut: [6720, 35520], fadeOut: 60, gain: -1.821931 }] },
        { layers: [{ from: "rubberduck-book-03", cut: [1704, 30504], fadeOut: 60, gain: 4.274172 }] },
        { layers: [{ from: "rubberduck-book-04", cut: [0, 28800], fadeOut: 60, gain: 1.727672 }] },
    ],
    mapUnfold: [
        { layers: [{ from: "freesound-447931", cut: [588, 68160], fadeOut: 60, gain: -5.488311 }] },
        { layers: [{ from: "freesound-753282", cut: [638208, 706560], fadeOut: 150, gain: -3.854117 }] },
    ],
    packOpen: [
        { layers: [{ from: "schupke-sfx-sheath-unbuckle-02", cut: [30000, 38400], fadeOut: 40, gain: -0.960361 }] },
        { layers: [{ from: "schupke-sfx-sheath-unbuckle-03", cut: [30960, 48000], fadeOut: 40, gain: 0.125209 }] },
        { layers: [{ from: "schupke-sfx-sheath-unbuckle-01", cut: [58320, 76800], fadeOut: 40, gain: -1.26213 }] },
    ],
    packClose: [
        { layers: [{ from: "schupke-sfx-sheath-buckle-01", cut: [16572, 38400], fadeOut: 40, gain: -4.675255 }] },
        { layers: [{ from: "schupke-sfx-sheath-buckle-01", cut: [44160, 59040], fadeOut: 40, gain: 18.819593 }] },
    ],
    chestOpen: [
        { layers: [{ from: "freesound-573654", cut: [3840, 75840], fadeOut: 60, gain: 12.13615 }] },
        { layers: [{ from: "freesound-734929", cut: [21312, 72000], fadeOut: 40, gain: 7.087131 }] },
    ],
    chestClose: [
        { layers: [{ from: "freesound-573648", cut: [28800, 60480], fadeOut: 60, gain: -4.699842 }] },
        { layers: [{ from: "freesound-734929", cut: [74400, 110400], fadeOut: 40, gain: -6.783716 }] },
    ],
    lockpick: [
        { layers: [{ from: "schupke-sfx-keyhole-lockbox-unlock-01", cut: [1380, 35520], gain: -7.116626 }] },
        { layers: [{ from: "schupke-sfx-keyhole-lockbox-unlock-05", cut: [672, 45120], gain: -6.268604 }] },
        { layers: [{ from: "schupke-sfx-keyhole-lockbox-unlock-04", cut: [14400, 59781], gain: -5.640633 }] },
    ],
    quill: [
        { layers: [{ from: "freesound-753202", cut: [115200, 156000], fadeOut: 120, gain: 7.513557 }] },
        { layers: [{ from: "freesound-753202", cut: [206400, 244800], fadeOut: 120, gain: -0.367758 }] },
        { layers: [{ from: "freesound-753202", cut: [300000, 338400], fadeOut: 120, gain: -0.642991 }] },
    ],
    tradeDone: [
        { layers: [{ from: "freesound-485766", cut: [38976, 48432], fadeOut: 10, gain: -7.219265 }, { from: "vcsl-sus-a4-r01-main", cut: [0, 48480], fadeOut: 0, at: 4800 / RATE, gain: 1.780735 }], cap: 52800 / RATE, fadeIn: 2, fadeOut: 500 },
        { layers: [{ from: "freesound-485767", cut: [47568, 59520], fadeOut: 10, gain: -8.737935 }, { from: "vcsl-sus-d4-r01-main", cut: [0, 48480], fadeOut: 0, at: 4800 / RATE, gain: 0.262065 }], cap: 52800 / RATE, fadeIn: 2, fadeOut: 500 },
    ],
    eat: [
        { layers: [{ from: "freesound-807393", cut: [51984, 65760], gain: 4.46744 }] },
        { layers: [{ from: "freesound-807393", cut: [484068, 499548], gain: 3.71496 }] },
        { layers: [{ from: "freesound-807393", cut: [128460, 144576], gain: 15.863004 }] },
    ],
    wheel: [
        { layers: [{ from: "vcsl-wood-click-pp-rr1", cut: [84, 9684], fadeOut: 40, gain: 24.756772 }] },
        { layers: [{ from: "vcsl-wood-click-pp-rr2", cut: [1392, 10992], fadeOut: 40, gain: 26.168096 }] },
        { layers: [{ from: "vcsl-wood-click-pp-rr3", cut: [480, 10080], fadeOut: 40, gain: 23.506675 }] },
        { layers: [{ from: "vcsl-wood-click-mp", cut: [900, 10500], fadeOut: 40, gain: 18.530677 }] },
    ],
    wheelSelect: [
        { layers: [{ from: "freesound-734645", cut: [231180, 239388], gain: 5.271315 }] },
        { layers: [{ from: "freesound-734645", cut: [269928, 278808], gain: 5.021753 }] },
        { layers: [{ from: "freesound-734645", cut: [589752, 597480], gain: 6.317693 }] },
        { layers: [{ from: "freesound-734645", cut: [911940, 922404], gain: 9.650195 }] },
    ],
    denied: [
        { layers: [{ from: "kenney-audio-impactwood-light-000", cut: [0, 12960], fadeOut: 10, gain: -4.572932 }, { from: "kenney-audio-impactwood-light-001", cut: [0, 12960], fadeOut: 10, at: 5280 / RATE, gain: -7.572932 }], cap: 16320 / RATE, fadeIn: 2, fadeOut: 40 },
        { layers: [{ from: "kenney-audio-impactwood-light-002", cut: [0, 12960], fadeOut: 10, gain: -4.763035 }, { from: "kenney-audio-impactwood-light-003", cut: [0, 12960], fadeOut: 10, at: 5280 / RATE, gain: -7.763035 }], cap: 16320 / RATE, fadeIn: 2, fadeOut: 40 },
        { layers: [{ from: "kenney-audio-impactwood-light-004", cut: [0, 12960], fadeOut: 10, gain: -2.086135 }, { from: "kenney-audio-impactwood-light-000", cut: [0, 12960], fadeOut: 10, at: 5280 / RATE, gain: -5.086135 }], cap: 16320 / RATE, fadeIn: 2, fadeOut: 40 },
        { layers: [{ from: "kenney-audio-impactwood-light-003", cut: [0, 12960], fadeOut: 10, gain: -2.508443 }, { from: "kenney-audio-impactwood-light-002", cut: [0, 12960], fadeOut: 10, at: 5280 / RATE, gain: -5.508443 }], cap: 16320 / RATE, fadeIn: 2, fadeOut: 40 },
    ],
    lock: [
        { layers: [{ from: "schupke-sfx-keyhole-lockbox-turn-04", cut: [1080, 11640], fadeOut: 30, gain: -5.966479 }] },
        { layers: [{ from: "schupke-sfx-keyhole-lockbox-turn-06", cut: [1116, 11676], fadeOut: 30, gain: -5.168632 }] },
        { layers: [{ from: "schupke-sfx-keyhole-lockbox-turn-06", cut: [13932, 24492], fadeOut: 30, gain: -8.001154 }] },
        { layers: [{ from: "schupke-sfx-keyhole-lockbox-turn-05", cut: [624, 11184], fadeOut: 30, gain: -7.099384 }] },
        { layers: [{ from: "schupke-sfx-keyhole-lockbox-turn-02", cut: [19680, 30240], fadeOut: 30, gain: -6.997817 }] },
    ],
    tap: [
        { layers: [{ from: "freesound-734645", cut: [138864, 143808], gain: -3.824761 }] },
        { layers: [{ from: "freesound-734645", cut: [405528, 411816], gain: 1.127852 }] },
        { layers: [{ from: "freesound-734645", cut: [661260, 668268], gain: 9.05898 }] },
        { layers: [{ from: "freesound-734645", cut: [674532, 682596], gain: 14.001718 }] },
        { layers: [{ from: "freesound-734645", cut: [877716, 882168], gain: 0.245521 }] },
        { layers: [{ from: "freesound-734645", cut: [580224, 587472], gain: 9.558752 }] },
    ],
    talk: [
        { layers: [{ from: "kenney-audio-card-slide-1", cut: [4920, 18360], fadeOut: 40, gain: -4.962213 }] },
        { layers: [{ from: "kenney-audio-card-slide-2", cut: [0, 13440], fadeOut: 40, gain: -5.831724 }] },
        { layers: [{ from: "kenney-audio-card-slide-3", cut: [0, 13440], fadeOut: 40, gain: -5.480196 }] },
        { layers: [{ from: "kenney-audio-card-slide-4", cut: [0, 13440], fadeOut: 40, gain: -3.454652 }] },
    ],
    quickAction: [
        { layers: [{ from: "schupke-sfx-arrow-grab-from-quiver-01", cut: [48, 13488], fadeOut: 40, gain: -8.616277 }] },
        { layers: [{ from: "schupke-sfx-arrow-grab-from-quiver-06", cut: [180, 13620], fadeOut: 40, gain: -7.528983 }] },
        { layers: [{ from: "schupke-sfx-arrow-grab-from-quiver-03", cut: [21600, 34080], fadeOut: 40, gain: -8.184242 }] },
        { layers: [{ from: "schupke-sfx-arrow-grab-from-quiver-05", cut: [13440, 26880], fadeOut: 40, gain: -5.552982 }] },
    ],
    slain: [
        { layers: [{ from: "vcsl-sus-e3-r01-main", cut: [0, 38967], rate: 988 / 1109, fadedFirst: true, fadeOut: 0, gain: -0.497977 }, { from: "vcsl-sus-a-3-r01-main", cut: [0, 41255], rate: 824 / 873, fadedFirst: true, fadeOut: 0, gain: -5.497977 }], cap: 43200 / RATE, fadeIn: 2, fadeOut: 700 },
        { layers: [{ from: "vcsl-sus-e3-r01-main", cut: [0, 38967], rate: 988 / 1109, fadedFirst: true, fadeOut: 0, gain: 0.330809 }, { from: "vcsl-sus-f-3-r01-main", cut: [0, 41255], rate: 824 / 873, fadedFirst: true, fadeOut: 0, gain: -4.669191 }], cap: 43200 / RATE, fadeIn: 2, fadeOut: 700 },
        { layers: [{ from: "vcsl-sus-e3-r01-main", cut: [0, 38967], rate: 988 / 1109, fadedFirst: true, fadeOut: 0, gain: 0.406548 }, { from: "vcsl-sus-d4-r01-main", cut: [0, 43680], fadeOut: 0, gain: -7.593452 }], cap: 43200 / RATE, fadeIn: 2, fadeOut: 700 },
    ],
    fallen: [
        { layers: [{ from: "vcsl-sus-a-3-r01-main", cut: [0, 68439], rate: 824 / 873, fadedFirst: true, fadeOut: 0, gain: -1.182173 }, { from: "vcsl-sus-f-3-r01-main", cut: [0, 54847], rate: 824 / 873, fadedFirst: true, fadeOut: 0, at: 14400 / RATE, gain: -1.182173 }, { from: "vcsl-sus-e3-r01-main", cut: [0, 38967], rate: 988 / 1109, fadedFirst: true, fadeOut: 0, at: 28800 / RATE, gain: -1.182173 }], cap: 72000 / RATE, fadeIn: 2, fadeOut: 850 },
        { layers: [{ from: "vcsl-sus-c4-r01-main", cut: [0, 72480], fadeOut: 0, gain: -3.73745 }, { from: "vcsl-sus-a-3-r01-main", cut: [0, 54847], rate: 824 / 873, fadedFirst: true, fadeOut: 0, at: 14400 / RATE, gain: -3.73745 }, { from: "vcsl-sus-e3-r01-main", cut: [0, 38967], rate: 988 / 1109, fadedFirst: true, fadeOut: 0, at: 28800 / RATE, gain: -3.73745 }], cap: 72000 / RATE, fadeIn: 2, fadeOut: 850 },
    ],
    wake: [
        { layers: [{ from: "vcsl-sus-d4-r01-main", cut: [0, 62880], fadeOut: 0, gain: 0.271814 }, { from: "vcsl-sus-a4-r01-main", cut: [0, 56160], fadeOut: 0, at: 6720 / RATE, gain: 2.271814 }], cap: 62400 / RATE, fadeIn: 2, fadeOut: 850 },
        { layers: [{ from: "vcsl-sus-a-3-r01-main", cut: [0, 59378], rate: 824 / 873, fadedFirst: true, fadeOut: 0, gain: -4.274233 }, { from: "vcsl-sus-e4-r01-main", cut: [0, 56160], fadeOut: 0, at: 6720 / RATE, gain: -2.274233 }], cap: 62400 / RATE, fadeIn: 2, fadeOut: 850 },
    ],
    levelUp: [
        { layers: [{ from: "vcsl-ewharp-normal-d4-v2-rr1", cut: [0, 62880], fadeOut: 0, gain: 14.009162 }, { from: "vcsl-ewharp-normal-f-4-v2-rr1", cut: [0, 56206], rate: 824 / 873, fadedFirst: true, fadeOut: 0, at: 3360 / RATE, gain: 14.009162 }, { from: "vcsl-ewharp-normal-g-4-v2-rr1", cut: [0, 59471], rate: 873 / 824, fadedFirst: true, fadeOut: 0, at: 6720 / RATE, gain: 14.009162 }, { from: "vcsl-ewharp-normal-d5-v2-rr1", cut: [0, 52800], fadeOut: 0, at: 10080 / RATE, gain: 14.009162 }, { from: "vcsl-sus-d5-r01-main", cut: [48, 52848], fadeOut: 0, at: 10080 / RATE, gain: 5.009162 }], cap: 62400 / RATE, fadeIn: 2, fadeOut: 900 },
        { layers: [{ from: "vcsl-ewharp-normal-g-3-v2-rr1", cut: [0, 66590], rate: 873 / 824, fadedFirst: true, fadeOut: 0, gain: 12.323316 }, { from: "vcsl-ewharp-normal-d4-v2-rr1", cut: [0, 59520], fadeOut: 0, at: 3360 / RATE, gain: 12.323316 }, { from: "vcsl-ewharp-normal-f-4-v2-rr1", cut: [0, 53035], rate: 824 / 873, fadedFirst: true, fadeOut: 0, at: 6720 / RATE, gain: 12.323316 }, { from: "vcsl-ewharp-normal-g-4-v2-rr1", cut: [0, 55911], rate: 873 / 824, fadedFirst: true, fadeOut: 0, at: 10080 / RATE, gain: 12.323316 }, { from: "vcsl-sus-a4-r01-main", cut: [0, 52800], fadeOut: 0, at: 10080 / RATE, gain: 3.323316 }], cap: 62400 / RATE, fadeIn: 2, fadeOut: 900 },
    ],
    questDone: [
        { layers: [{ from: "vcsl-ewharp-normal-d3-v2-rr1", cut: [0, 72480], fadeOut: 0, gain: 3.389939 }, { from: "vcsl-ewharp-normal-g-3-v2-rr1", cut: [0, 73710], rate: 873 / 824, fadedFirst: true, fadeOut: 0, at: 2880 / RATE, gain: 3.389939 }, { from: "vcsl-ewharp-normal-d4-v2-rr1", cut: [0, 66720], fadeOut: 0, at: 5760 / RATE, gain: 3.389939 }, { from: "vcsl-ewharp-normal-f-4-v2-rr1", cut: [0, 60284], rate: 824 / 873, fadedFirst: true, fadeOut: 0, at: 8640 / RATE, gain: 3.389939 }, { from: "vcsl-sus-d4-r01-main", cut: [0, 60000], fadeOut: 0, at: 12480 / RATE, gain: 0.389939 }, { from: "vcsl-sus-a4-r01-main", cut: [0, 60000], fadeOut: 0, at: 12480 / RATE, gain: -2.610061 }], cap: 72000 / RATE, fadeIn: 2, fadeOut: 1000 },
        { layers: [{ from: "vcsl-ewharp-normal-d3-v2-rr1", cut: [0, 72480], fadeOut: 0, gain: 0.634702 }, { from: "vcsl-ewharp-normal-f-3-v2-rr1", cut: [0, 65721], rate: 824 / 873, fadedFirst: true, fadeOut: 0, at: 2880 / RATE, gain: 0.634702 }, { from: "vcsl-ewharp-normal-g-3-v2-rr1", cut: [0, 70659], rate: 873 / 824, fadedFirst: true, fadeOut: 0, at: 5760 / RATE, gain: 0.634702 }, { from: "vcsl-ewharp-normal-d4-v2-rr1", cut: [0, 63840], fadeOut: 0, at: 8640 / RATE, gain: 0.634702 }, { from: "vcsl-sus-f-4-r01-main", cut: [24, 56683], rate: 824 / 873, fadedFirst: true, fadeOut: 0, at: 12480 / RATE, gain: -3.365298 }, { from: "vcsl-sus-d4-r01-main", cut: [0, 60000], fadeOut: 0, at: 12480 / RATE, gain: -2.365298 }], cap: 72000 / RATE, fadeIn: 2, fadeOut: 1000 },
    ],
    newsHeard: [
        { layers: [{ from: "vcsl-hb-1", cut: [0, 51334], rate: 873 / 824, fadedFirst: true, fadeOut: 0, gain: 12.137891 }], cap: 48000 / RATE, fadeIn: 2, fadeOut: 400 },
        { layers: [{ from: "vcsl-hb-2", cut: [0, 45786], rate: 824 / 873, fadedFirst: true, fadeOut: 0, gain: 13.12281 }], cap: 48000 / RATE, fadeIn: 2, fadeOut: 400 },
    ],
    pinSet: [
        { layers: [{ from: "vcsl-glock-medium-g4-01", cut: [0, 29280], fadeOut: 0, gain: 17.470135 }], cap: 28800 / RATE, fadeIn: 2, fadeOut: 300 },
        { layers: [{ from: "vcsl-glock-medium-c5-01", cut: [0, 29280], fadeOut: 0, gain: 17.807068 }], cap: 28800 / RATE, fadeIn: 2, fadeOut: 300 },
    ],
    buyDenied: [
        { layers: [{ from: "freesound-722038", cut: [52260, 69192], gain: -1.089611 }] },
        { layers: [{ from: "freesound-722038", cut: [154680, 167916], gain: 0.524607 }] },
        { layers: [{ from: "freesound-722038", cut: [1468692, 1481880], gain: 3.640184 }] },
    ],
};
