// Rumours of places nearby (docs/GAME.md *Rumours of places*): what's said in a town of the places
// out round it still to be found, the town's crier telling them (dialogue.js crier). Each says
// which way it is from the town, always true, and what stands by it: a farm, with its farmer
// named, or a hamlet or a village; or how far it is on foot; with a hook to bring the player out
// to it, and something wild said of it ("Livestock keeps going missing south-east of town, out
// by old Kemp's farm at Keldale. Someone swears they saw a bug as big as a wagon!"). Never false
// as to where; only the tales are tall.
//
// Which places, and whether found: the plan's places worth finding (its dungeons, but the hells'
// (core/cultword.js tells of those); its ruins, caves, lairs, shrines and stones; the wild's
// watchtowers and camps), the nearest first, those the player hasn't found yet (Explored
// sighted: the maps' rule, so a rumour's place and its icon on the maps can never disagree).
// Heard, each is kept with the character (app/game.js: memory.heard), written in the journal
// ("Heard tell"), and drawn on the world map as a faint circle round about where it is
// (circleOf), till the place is found.
//
// Pure and exact (core/exact.js), the same on every machine: the plan's sites and camps only.

import { cos, hypot, sin, TAU } from "./exact.js";
import { namePeople } from "./names.js";
import { compass } from "./ways.js";

/**
 * How rumours are told: of places within `reach` metres of the town; what stands within
 * `landmark` metres of one named as what it's by; within `walk` metres of the town, under an
 * hour's walk; a crier telling `first` the first time he's asked, then one at a time, and none
 * more while `open` of those he's told are still to be found; and the circles on the world map,
 * `radius` metres, each one's middle off the place's by a share of its radius (`off`: from and
 * to), at most `kept` of them (the newest), the hells' besides.
 */
export const RUMOURS = Object.freeze({ reach: 2000, landmark: 900, walk: 1200, first: 2, open: 3, radius: 200, off: Object.freeze([0.3, 0.7]), kept: 8 });

// What's said of each kind of place: a hook, ending with where it is ({where}: which way from the
// town, and what stands by it), then something wild of it. A dungeon's by its theme
// (dungeons/themes.js); a wild camp's by its faction (worldplan/races.js FACTIONS)
const LINES = Object.freeze({
    nest: {
        hooks: ["Livestock keeps going missing {where}.", "There's holes opened up in the fields, wide as a cart, {where}.", "The dogs won't go near the fields {where}."],
        tales: ["Someone swears they saw a bug as big as a wagon!", "There's a clicking in the ground there at night, like a thousand knitting needles.", "A farmhand went down a hole there with a lantern. They found the lantern."],
    },
    caves: {
        hooks: ["There's a cave in the hills {where}.", "The hunters have stopped taking their dogs {where}.", "Something's been taking the deer {where}."],
        tales: ["There's a cave there that goes down further than anyone's followed it. You can hear something breathing in it.", "There's bones round the mouth of a cave there, and not all of them sheep's.", "Something big lives out there. A troll, the hunters reckon. Or worse."],
    },
    hideout: {
        hooks: ["Travellers keep getting robbed {where}.", "Carts go missing on the road, drivers and all, {where}."],
        tales: ["The outlaws vanish after, like the ground swallows them. There's a hideout, mark me.", "The reeve's men went looking and came back with nothing but bruises."],
    },
    ancient: {
        hooks: ["There's a barrow older than anyone remembers {where}.", "Diggers found a stone door in a hillside {where}."],
        tales: ["Lights move in it at night, and the dead don't stay down.", "Diggers opened it once, and shut it again quick. They won't say what they heard.", "Grave goods in it, they say. And whoever was buried with them."],
    },
    ruins: {
        hooks: ["There's old ruins {where}.", "A shepherd lost a ewe in the old ruins {where}.", "Folk give the old ruins a wide berth {where}."],
        tales: ["Bones walk there by moonlight, they say.", "Whoever goes in comes out white as milk, saying something called their name.", "There's treasure in them still, they say, if you can get past what guards it."],
    },
    "ruined castle": {
        hooks: ["There's a castle gone to ruin {where}.", "Nobody living keeps the old castle {where}."],
        tales: ["Its old lord never left, they say. Not even dying stopped him.", "You can see lights on its walls some nights, going round as if on watch."],
    },
    cave: {
        hooks: ["Outlaws have holed up in a cave {where}.", "Folk on the road keep getting robbed {where}.", "Rough-looking men come and go from the rocks {where}."],
        tales: ["They rob whoever comes by, and they're back in their cave before the reeve's out of bed.", "The robbers keep to a cave in the rocks, they say, and come out after dark."],
    },
    "dragon's lair": {
        hooks: ["Sheep are being taken whole {where}.", "There's a mountain that smokes {where}."],
        tales: ["The hillsides are scorched black. A drake, they say, big as a barn, sleeping on a pile of gold.", "A wing went over the town at dusk last spring. Blotted out the sun."],
    },
    "dreadthorn's lair": {
        hooks: ["Something with wings nests in the crags {where}.", "Cattle are being found with their backs broken {where}."],
        tales: ["Its cry curdles the milk in the pail, they say.", "A thorn-backed thing, the shepherds say, bigger than any eagle."],
    },
    "werewolf's den": {
        hooks: ["Every full moon, wolves howl {where}.", "Something's killing sheep {where}."],
        tales: ["There's a wolf there that walks on two legs, they say.", "The tracks there start out a wolf's, and end up a man's."],
    },
    shrine: {
        hooks: ["There's an old shrine {where}.", "Pilgrims come through on their way to a shrine {where}.", "There's a shrine to the old gods {where}."],
        tales: ["Pray there, and you'll walk away lighter, they say.", "My gran swore it healed her bad leg."],
    },
    "standing stones": {
        hooks: ["There's a ring of standing stones {where}.", "There's old stones stood in a ring {where}."],
        tales: ["They hum on still nights. My gran wouldn't go near them.", "Nobody knows who raised them. Not men, I'd wager."],
    },
    watchtower: {
        hooks: ["Outlaws hold the old watchtower {where}.", "The old watchtower's gone to outlaws {where}."],
        tales: ["They see you coming a mile off.", "They light a fire on top at night, to show they're there."],
    },
    bandits: {
        hooks: ["Bandits have made camp {where}.", "A carter was set upon, and his cart taken, {where}."],
        tales: ["They took a whole cart of wool last week, and the carter with it.", "Bold as you like, with a fire you can see from the road."],
    },
    wolves: {
        hooks: ["A wolf pack's denned up {where}.", "The shepherds are losing sheep every night {where}."],
        tales: ["Big as ponies, the leader is. Took three ewes in one night.", "You can hear them howling from the walls."],
    },
    goblins: {
        hooks: ["Goblins have camped {where}.", "Hen-houses are being raided {where}.", "Something's been at the grain stores {where}."],
        tales: ["They came for the chickens, and took the hen-house too.", "Little green devils, bold as you like, cackling all night."],
    },
    spiders: {
        hooks: ["There's giant spiders in the trees {where}.", "Folk have stopped going into the trees {where}."],
        tales: ["Webs strung between the trees as thick as rope.", "A woodcutter came back wrapped head to foot, and he's not said a word since."],
    },
    undead: {
        hooks: ["The dead walk {where}.", "Graves are turning up empty {where}.", "There's lights over the old graves at night {where}."],
        tales: ["My cousin saw the dead there, digging themselves out of their graves.", "They shamble about by night, and you can smell them on the wind."],
    },
    trolls: {
        hooks: ["There's trolls {where}.", "Something's been throwing boulders at carts {where}."],
        tales: ["There's footprints there you could bathe in.", "Something there ate a whole ox, horns and all, they say."],
    },
    raiders: {
        hooks: ["Raiders have camped {where}.", "Smoke's been rising every night {where}."],
        tales: ["They burn what they can't carry off.", "Riders with painted faces, come down from the wastes."],
    },
    cultists: {
        hooks: ["Robed folk have camped {where}.", "There's been chanting every night {where}."],
        tales: ["Fires burning odd colours, and the chanting never stops.", "Folk who go to look come back... changed."],
    },
});

/** The kinds of place told of (LINES' keys: a dungeon's theme, a site's kind, a wild camp's faction). */
export const RUMOURED = Object.freeze(Object.keys(LINES));

// What's named as standing by a place: the settlements, of these kinds
const LANDMARKS = new Set(["farmstead", "hamlet", "village"]);

// (A whole number for an id: the same every time, FNV-1a)
function hashOf(text) {
    let hash = 2166136261;

    for (let k = 0; k < text.length; k++) {
        hash = Math.imul(hash ^ text.charCodeAt(k), 16777619) >>> 0;
    }

    return hash;
}

// (Each plan's places told of, worked out once)
const TOLD = new WeakMap();

/**
 * Every place in a world's plan a rumour can be of: [{ id, kind (RUMOURED's), at ([x, y] metres),
 * name (or null) }], its sites, then its wild camps.
 */
export function rumouredOf(plan) {
    if (!TOLD.has(plan)) {
        const sites = plan.sites
            .map((site) => ({ ...site, told: site.kind === "dungeon" ? site.theme : site.kind === "watchtower" && site.race ? null : site.kind }))
            .filter(({ told }) => told && LINES[told])
            .map(({ id, told, at, name }) => ({ id, kind: told, at, name: name ?? null }));
        const camps = (plan.camps ?? []).filter(({ faction }) => LINES[faction]).map(({ id, faction, at }) => ({ id, kind: faction, at, name: null }));
        const all = [...sites, ...camps];

        TOLD.set(plan, { all, by: new Map(all.map((one) => [one.id, one])) });
    }

    return TOLD.get(plan).all;
}

/** A place a rumour's of, by its id (rumouredOf's), or null. */
export function rumouredBy(plan, id) {
    rumouredOf(plan);

    return TOLD.get(plan).by.get(id) ?? null;
}

/**
 * The places round `at` ([x, y] metres: a town's) still to be found by the player (`explored`:
 * core/explored.js, its `sighted`), within `reach` metres: rumouredOf's, each with how far it is
 * (`far`, metres), the nearest first (then by id).
 */
export function rumoursNear(plan, at, explored, { reach = RUMOURS.reach } = {}) {
    return rumouredOf(plan)
        .map((place) => ({ ...place, far: hypot(place.at[0] - at[0], place.at[1] - at[1]) }))
        .filter(({ far, at: [x, y] }) => far <= reach && !explored.sighted(x, y))
        .sort((a, b) => a.far - b.far || (a.id < b.id ? -1 : 1));
}

/**
 * What stands by a place (`place`: rumouredOf's) to say it's by: the nearest farmstead, hamlet or
 * village within RUMOURS.landmark of it, and nearer it than the town it's said in is (`town`: {
 * id, at }): { name, kind, farmer (a farmstead's: his byname, "Kemp", named from its id as the
 * world's people are: names.js namePeople; otherwise null) }; or null with none.
 */
export function landmarkOf(plan, place, town) {
    const near = (one) => hypot(one.at[0] - place.at[0], one.at[1] - place.at[1]);
    const within = Math.min(RUMOURS.landmark, near(town));
    const by = plan.places
        .filter((one) => one.id !== town.id && LANDMARKS.has(one.kind) && near(one) < within)
        .sort((a, b) => near(a) - near(b) || (a.id < b.id ? -1 : 1))[0];

    if (!by) {
        return null;
    }

    const farmer = by.kind === "farmstead" ? namePeople([{ sex: "m" }], hashOf(by.id), by.race ?? "human")[0].name.split(" ").at(-1) : null;

    return { name: by.name, kind: by.kind, farmer };
}

/**
 * What's said of a place (`place`: rumouredOf's) in a town (`town`: { id, at }): which way it is
 * from the town, what stands by it (landmarkOf's) or else how far it is on foot, a hook, and
 * something wild of it, each picked by the place and the town (so the same said every time).
 */
export function rumourWord(plan, place, town) {
    const lines = LINES[place.kind];
    const which = hashOf(`${place.id}:${town.id}`);
    const far = hypot(place.at[0] - town.at[0], place.at[1] - town.at[1]);
    const by = landmarkOf(plan, place, town);
    const near = by ? (by.farmer ? `, out by old ${by.farmer}'s farm at ${by.name}` : `, out by ${by.name}`) : far <= RUMOURS.walk ? ", not an hour's walk" : ", an hour or two on foot";
    const where = `${compass(town.at, place.at)} of town${near}`;

    return `${lines.hooks[which % lines.hooks.length].replace("{where}", where)} ${lines.tales[Math.floor(which / 7) % lines.tales.length]}`;
}

/**
 * The circle a rumour of a place (`id`, at `at`: [x, y] metres) draws on the world map: round
 * about where it is, never on it, RUMOURS.radius across, its middle off the place's by a share of
 * that (RUMOURS.off), which way by the place's id: { at: [x, y], radius } (metres). The same for
 * everyone in a world, and inside it the place always is.
 */
export function circleOf(id, [x, y]) {
    const hash = hashOf(id);
    const [from, to] = RUMOURS.off;
    const off = RUMOURS.radius * (from + (((hash >>> 8) % 1000) / 1000) * (to - from));
    const angle = ((hash % 360) / 360) * TAU;

    return { at: [x + cos(angle) * off, y + sin(angle) * off], radius: RUMOURS.radius };
}
