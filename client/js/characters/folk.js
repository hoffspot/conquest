// Folk made up as they're wanted: a look for anyone in a building (the barkeep, a serving wench, a
// drover on a bench, whoever keeps the rooms, a courtesan, the smith and the apprentice...) from
// their part, their sex and a seed of their own, so no two buildings' folk look alike. Their body
// (height, build, bust, belly, face), where their forebears came from and the skin, eyes and hair
// that go with it, how they wear their hair and beard, and what they wear and carry for their
// part, each picked from the seed. Folk of another people than humans have their people's bodies,
// skins and parts (peoples.js), built and dressed as their part has them. Wenches and Ale's folk
// keep their own looks (presets.js FOLK). Pure data, no DOM.

import { createRandom } from "../core/random.js";
import { everydayDress } from "./dress.js";
import { LIVERY_PARTS, liveryKit, soldierKit } from "./liveries.js";
import { LOOKS, peopleLook } from "./peoples.js";
import { HAIR_COLOURS, SKIN_TONES } from "./skin.js";

// Where their forebears came from ([african, asian, caucasian]), with the skin, eyes and hair
// most of them have
const LINEAGES = [
    { mix: [0.1, 0.1, 0.8], tones: ["porcelain", "fair", "light"], irises: ["#5a6f7e", "#4f6b3a", "#3b5a7a", "#6b7f8e", "#5b4a36"], hair: ["brown", "darkBrown", "auburn", "red", "blond", "platinum", "black"] },
    { mix: [0.1, 0.3, 0.6], tones: ["light", "medium", "olive"], irises: ["#533626", "#5b4a36", "#2e1f16"], hair: ["black", "darkBrown", "brown"] },
    { mix: [0.2, 0.1, 0.7], tones: ["medium", "olive", "tan"], irises: ["#533626", "#3b2a1c", "#4f6b3a"], hair: ["black", "darkBrown", "brown", "auburn"] },
    { mix: [0.6, 0.1, 0.3], tones: ["tan", "brown", "dark"], irises: ["#3b2a1c", "#2e1f16"], hair: ["black", "darkBrown"] },
    { mix: [0.85, 0.05, 0.1], tones: ["brown", "dark", "deep"], irises: ["#2e1f16", "#3b2a1c"], hair: ["black"] },
    { mix: [0.05, 0.7, 0.25], tones: ["fair", "light", "medium"], irises: ["#2e1f16", "#3b2a1c", "#533626"], hair: ["black", "darkBrown"] },
];

// What each part wears, by sex (a list of choices for each slot: one picked from each; null for
// nothing there), how they wear their hair, and their build
const PARTS = {
    barkeep: {
        m: { wear: [["shirt"], ["trousers", "breeches"], ["boots"], ["belt"], ["apron"]], hair: ["bald", "buzz", "short", "swept"], beard: ["full", "short", "stubble", "goatee"], build: { weight: [0.6, 0.9], muscle: [0.45, 0.65], belly: [0.3, 0.9] } },
        f: { wear: [["chemise"], ["bodice"], ["kirtle", "skirt"], ["boots"], ["apron"]], hair: ["bob", "ponytail", "topknot"], build: { weight: [0.55, 0.8], muscle: [0.45, 0.6] } },
    },
    wench: { f: { wear: [["chemise"], ["bodice"], ["skirt", "greenSkirt", "kirtle"], ["boots"], ["tankard"]], hair: ["ponytail", "bob", "long", "topknot"], build: { weight: [0.38, 0.6], muscle: [0.38, 0.5], bust: [0.55, 0.9] } } },
    patron: {
        m: { wear: [["tunic", "greenTunic", "blueTunic", "shirt"], [null, null, "jerkin"], ["trousers", "breeches"], ["boots"], ["belt"], ["tankard"]], hair: ["short", "swept", "buzz", "bald", "short"], beard: ["short", "full", "stubble", "none", "goatee"], build: { weight: [0.4, 0.85], muscle: [0.4, 0.75], belly: [0, 0.7] } },
        f: { wear: [["chemise"], [null, "bodice"], ["kirtle", "skirt", "greenSkirt"], ["boots"], ["tankard"]], hair: ["long", "bob", "ponytail", "topknot"], build: { weight: [0.4, 0.75], muscle: [0.4, 0.55], bust: [0.45, 0.85] } },
    },
    innkeeper: {
        m: { wear: [["shirt"], ["jerkin"], ["trousers", "breeches"], ["boots"], ["belt"]], hair: ["short", "swept", "bald"], beard: ["short", "stubble", "goatee", "none"], build: { weight: [0.45, 0.8], muscle: [0.4, 0.6], belly: [0, 0.6] } },
        f: { wear: [["chemise"], ["bodice", "velvetBodice"], ["kirtle", "skirt"], ["boots"]], hair: ["topknot", "bob", "ponytail"], build: { weight: [0.45, 0.75], muscle: [0.4, 0.5], bust: [0.5, 0.85] } },
    },
    smith: {
        m: { wear: [["shirt"], ["breeches", "trousers"], ["boots"], ["belt"], ["leatherApron"], ["smithHammer"], ["tongs"]], hair: ["bald", "buzz", "short"], beard: ["full", "short", "stubble"], build: { weight: [0.6, 0.9], muscle: [0.72, 0.95], belly: [0.1, 0.6] } },
        f: { wear: [["shirt"], ["breeches"], ["boots"], ["leatherApron"], ["smithHammer"], ["tongs"]], hair: ["ponytail", "topknot", "bob"], build: { weight: [0.5, 0.7], muscle: [0.6, 0.8], bust: [0.4, 0.7] } },
    },
    apprentice: {
        m: { wear: [["tunic", "shirt", "blueTunic"], ["trousers"], ["boots"], ["leatherApron"]], hair: ["short", "buzz", "swept"], beard: ["none", "none", "stubble"], build: { weight: [0.35, 0.6], muscle: [0.45, 0.65], belly: [0, 0.1] } },
        f: { wear: [["shirt", "chemise"], ["breeches", "trousers"], ["boots"], ["leatherApron"]], hair: ["ponytail", "bob"], build: { weight: [0.38, 0.55], muscle: [0.45, 0.6], bust: [0.35, 0.6] } },
    },
    priest: {
        m: { wear: [["alb"], ["chasuble"], ["albSkirt"], ["boots"]], hair: ["short", "bald", "swept", "buzz"], beard: ["full", "short", "none", "goatee"], build: { weight: [0.45, 0.75], muscle: [0.35, 0.55], belly: [0, 0.5] } },
        f: { wear: [["alb"], ["chasuble"], ["albSkirt"], ["boots"]], hair: ["topknot", "long", "bob"], build: { weight: [0.4, 0.65], muscle: [0.35, 0.5], bust: [0.4, 0.7] } },
    },
    acolyte: {
        m: { wear: [["alb"], ["albSkirt"], ["belt"], ["boots"]], hair: ["short", "buzz"], beard: ["none"], build: { weight: [0.35, 0.55], muscle: [0.4, 0.55], belly: [0, 0.1] } },
        f: { wear: [["alb"], ["albSkirt"], ["belt"], ["boots"]], hair: ["ponytail", "bob", "topknot"], build: { weight: [0.35, 0.55], muscle: [0.38, 0.5], bust: [0.35, 0.6] } },
    },
    worshipper: {
        m: { wear: [["tunic", "greenTunic", "blueTunic", "shirt"], [null, "jerkin"], ["trousers", "breeches"], ["boots"], ["belt"]], hair: ["short", "swept", "buzz", "bald"], beard: ["short", "full", "stubble", "none"], build: { weight: [0.4, 0.85], muscle: [0.4, 0.7], belly: [0, 0.7] } },
        f: { wear: [["chemise"], [null, "bodice"], ["kirtle", "skirt", "greenSkirt"], ["boots"]], hair: ["long", "bob", "ponytail", "topknot"], build: { weight: [0.4, 0.75], muscle: [0.4, 0.55], bust: [0.45, 0.85] } },
    },
    // An adventurers' guild's receptionist: a young woman drawn as a hero of an adventure story
    // would have her: big bright eyes in a small, soft face, her hair in twin tails or a bob with
    // bangs, in the guild's uniform
    receptionist: { f: { wear: [["guildBlouse"], ["guildVest"], ["guildSkirt"], ["boots"]], hair: ["twintails", "twintails", "bob"], build: { weight: [0.36, 0.46], muscle: [0.36, 0.44], bust: [0.55, 0.75] }, youthful: true } },
    // Adventurers, by their calling (sheathing what they carry; a warrior always a shield, which
    // a hired one blocks with: core/host.js HIRES)
    warrior: {
        m: { wear: [["gambeson", "mail"], ["tunic", "blueTunic"], ["breeches", "trousers"], ["boots"], ["belt"], ["bracers", null], ["sword"], ["roundShield", "kiteShield"]], hair: ["short", "buzz", "swept", "mohawk"], beard: ["short", "full", "stubble", "none"], build: { weight: [0.5, 0.8], muscle: [0.65, 0.95], belly: [0, 0.3] }, armed: true },
        f: { wear: [["gambeson", "mail"], ["tunic", "blueTunic"], ["breeches"], ["boots"], ["belt"], ["bracers", null], ["sword"], ["roundShield", "kiteShield"]], hair: ["ponytail", "bob", "topknot"], build: { weight: [0.45, 0.65], muscle: [0.55, 0.75], bust: [0.45, 0.75] }, armed: true },
    },
    ranger: {
        m: { wear: [["greenTunic"], ["jerkin"], ["breeches"], ["boots"], ["belt"], ["bracers"], ["bow"], ["quiver"]], hair: ["short", "swept", "long"], beard: ["short", "stubble", "none"], build: { weight: [0.4, 0.6], muscle: [0.5, 0.75], belly: [0, 0.1] }, armed: true },
        f: { wear: [["greenTunic"], ["jerkin"], ["breeches"], ["boots"], ["belt"], ["bracers"], ["bow"], ["quiver"]], hair: ["ponytail", "long", "bob"], build: { weight: [0.4, 0.55], muscle: [0.45, 0.65], bust: [0.4, 0.7] }, armed: true },
    },
    mage: {
        m: { wear: [["blueTunic", "shirt"], ["mageRobe"], ["boots"], ["belt"], ["wizardHat", null], ["staff"]], hair: ["long", "swept", "bald"], beard: ["full", "goatee", "short"], build: { weight: [0.35, 0.6], muscle: [0.3, 0.45], belly: [0, 0.3] }, armed: true },
        f: { wear: [["chemise", "blueTunic"], ["mageRobe"], ["boots"], ["belt"], ["wizardHat", null], ["staff"]], hair: ["long", "topknot", "bob"], build: { weight: [0.35, 0.55], muscle: [0.3, 0.42], bust: [0.5, 0.85] }, armed: true },
    },
    rogue: {
        m: { wear: [["shirt"], ["jerkin"], ["breeches"], ["boots"], ["belt"], ["gloves"], ["sword"]], hair: ["short", "swept", "buzz"], beard: ["stubble", "goatee", "none"], build: { weight: [0.35, 0.55], muscle: [0.5, 0.7], belly: [0, 0.1] }, armed: true },
        f: { wear: [["shirt", "chemise"], ["jerkin"], ["breeches"], ["boots"], ["belt"], ["gloves"], ["sword"]], hair: ["bob", "ponytail", "long"], build: { weight: [0.35, 0.5], muscle: [0.45, 0.6], bust: [0.45, 0.75] }, armed: true },
    },
    cleric: {
        m: { wear: [["alb"], ["mail"], ["albSkirt"], ["boots"], ["belt"], ["warHammer"]], hair: ["short", "bald", "buzz"], beard: ["full", "short", "none"], build: { weight: [0.5, 0.75], muscle: [0.5, 0.75], belly: [0, 0.4] }, armed: true },
        f: { wear: [["alb"], ["mail"], ["albSkirt"], ["boots"], ["belt"], ["warHammer"]], hair: ["topknot", "bob", "ponytail"], build: { weight: [0.45, 0.65], muscle: [0.45, 0.65], bust: [0.45, 0.75] }, armed: true },
    },
    madam: { f: { wear: [["chemise"], ["velvetBodice"], ["gown"], ["boots"]], hair: ["topknot", "long"], build: { weight: [0.5, 0.7], muscle: [0.32, 0.42], bust: [0.7, 1] } } },
    // A town hall's reeve, in good cloth; their clerk, plainer; petitioners as any townsfolk
    reeve: {
        m: { wear: [["shirt"], ["jerkin"], ["breeches", "trousers"], ["boots"], ["belt"], ["gloves", null]], hair: ["short", "swept", "bald"], beard: ["short", "full", "goatee"], build: { weight: [0.5, 0.85], muscle: [0.4, 0.6], belly: [0.2, 0.8] } },
        f: { wear: [["chemise"], ["velvetBodice"], ["gown", "kirtle"], ["boots"]], hair: ["topknot", "bob", "long"], build: { weight: [0.45, 0.75], muscle: [0.38, 0.5], bust: [0.45, 0.85] } },
    },
    clerk: {
        m: { wear: [["shirt", "blueTunic"], ["trousers", "breeches"], ["boots"], ["belt"]], hair: ["short", "swept", "buzz"], beard: ["none", "stubble", "none"], build: { weight: [0.3, 0.5], muscle: [0.3, 0.45], belly: [0, 0.2] } },
        f: { wear: [["chemise"], ["bodice"], ["kirtle", "skirt"], ["boots"]], hair: ["bob", "ponytail", "topknot"], build: { weight: [0.35, 0.55], muscle: [0.35, 0.45], bust: [0.35, 0.7] } },
    },
    // A keep's: the ruler crowned, in velvet and a gown, or in mail with a sword; their steward;
    // the councillors in robes; the sentries in mail with sword and shield
    ruler: {
        m: { wear: [["shirt"], ["gambeson", "mail"], ["breeches"], ["boots"], ["belt"], ["gloves"], ["crown"], ["sword"]], hair: ["long", "swept", "short"], beard: ["full", "short", "goatee"], build: { weight: [0.5, 0.8], muscle: [0.5, 0.8], belly: [0, 0.5] }, armed: true },
        f: { wear: [["chemise"], ["velvetBodice"], ["gown"], ["boots"], ["crown"]], hair: ["long", "topknot"], build: { weight: [0.42, 0.65], muscle: [0.36, 0.5], bust: [0.5, 0.85] } },
    },
    steward: {
        m: { wear: [["shirt"], ["jerkin"], ["breeches"], ["boots"], ["belt"]], hair: ["short", "swept", "bald"], beard: ["short", "goatee", "none"], build: { weight: [0.4, 0.7], muscle: [0.35, 0.55], belly: [0, 0.5] } },
        f: { wear: [["chemise"], ["velvetBodice"], ["kirtle", "gown"], ["boots"]], hair: ["topknot", "bob"], build: { weight: [0.4, 0.65], muscle: [0.35, 0.5], bust: [0.45, 0.8] } },
    },
    councillor: {
        m: { wear: [["blueTunic", "shirt"], ["mageRobe"], ["boots"], ["belt"]], hair: ["bald", "short", "long"], beard: ["full", "goatee", "short"], build: { weight: [0.45, 0.85], muscle: [0.3, 0.5], belly: [0.2, 0.8] } },
        f: { wear: [["chemise"], ["velvetBodice"], ["gown"], ["boots"]], hair: ["topknot", "long"], build: { weight: [0.45, 0.7], muscle: [0.32, 0.45], bust: [0.45, 0.8] } },
    },
    sentry: {
        m: { wear: [["shirt"], ["mail", "gambeson"], ["breeches"], ["boots"], ["belt"], ["nasalHelm"], ["sword"], ["kiteShield"]], hair: ["short", "buzz"], beard: ["short", "stubble", "none"], build: { weight: [0.5, 0.8], muscle: [0.65, 0.9], belly: [0, 0.2] }, armed: true },
        f: { wear: [["shirt"], ["mail", "gambeson"], ["breeches"], ["boots"], ["belt"], ["nasalHelm"], ["sword"], ["kiteShield"]], hair: ["ponytail", "bob"], build: { weight: [0.45, 0.65], muscle: [0.55, 0.75], bust: [0.35, 0.65] }, armed: true },
    },
    // A castle's undercroft's traders: its quartermaster an old soldier in a padded coat, its
    // arcanist in a robe (and, now and then, a wizard's hat)
    quartermaster: {
        m: { wear: [["shirt"], ["gambeson"], ["breeches", "trousers"], ["boots"], ["belt"], ["bracers", "gloves"]], hair: ["short", "buzz", "bald"], beard: ["full", "short", "stubble"], build: { weight: [0.55, 0.85], muscle: [0.6, 0.85], belly: [0.2, 0.7] } },
        f: { wear: [["shirt"], ["gambeson"], ["breeches"], ["boots"], ["belt"], ["bracers", "gloves"]], hair: ["ponytail", "topknot", "bob"], build: { weight: [0.5, 0.7], muscle: [0.55, 0.75], bust: [0.4, 0.7] } },
    },
    arcanist: {
        m: { wear: [["blueTunic", "shirt"], ["mageRobe"], ["boots"], ["belt"], ["wizardHat", null, null]], hair: ["long", "swept", "bald", "short"], beard: ["full", "goatee", "short"], build: { weight: [0.3, 0.6], muscle: [0.3, 0.45], belly: [0, 0.4] } },
        f: { wear: [["chemise", "blueTunic"], ["mageRobe"], ["boots"], ["belt"], ["wizardHat", null, null]], hair: ["long", "topknot", "bob"], build: { weight: [0.35, 0.55], muscle: [0.3, 0.42], bust: [0.45, 0.8] } },
    },
    // An abbey's herbalist: a brother or sister of its order in a plain habit, a belt of leather
    herbalist: {
        m: { wear: [["alb"], ["albSkirt"], ["belt"], ["boots"]], hair: ["bald", "short", "buzz"], beard: ["full", "short", "none"], build: { weight: [0.4, 0.75], muscle: [0.35, 0.5], belly: [0.1, 0.6] } },
        f: { wear: [["alb"], ["albSkirt"], ["belt"], ["boots"]], hair: ["topknot", "bob"], build: { weight: [0.38, 0.6], muscle: [0.35, 0.48], bust: [0.35, 0.65] } },
    },
    courtesan: { f: { wear: "lingerie", hair: ["long", "long", "bob", "ponytail", "topknot"], build: { weight: [0.4, 0.55], muscle: [0.38, 0.46], bust: [0.6, 1] } } },

    // The townsfolk out about their business (core/townsfolk.js), by their calling: those out to
    // market with a pannier on the back, a basket on the arm or a jug in the hand; porters under
    // a sack or a bundle of firewood; field hands in straw hats with their hoes over the shoulder
    // or their hay forks; merchants in good cloth; sweepers with their brooms; friars in brown
    // habits with their walking staffs or ledgers. And a castle's: its servants, its grooms with
    // their forks, its scribes with their ledgers. No man in a skirt: a friar's habit over
    // trousers, a scribe in a tunic. (As humans dress: each other people in its own everyday
    // dress, dress.js)
    shopper: {
        m: { wear: [["tunic", "brownTunic", "russetTunic", "greenTunic", "blueTunic"], ["trousers", "breeches"], ["boots"], ["belt"], ["hood", null, "leatherCap", null], ["pannier", "sack", "basket", null]], hair: ["short", "swept", "buzz", "bald"], beard: ["short", "full", "stubble", "none"], build: { weight: [0.4, 0.85], muscle: [0.4, 0.7], belly: [0, 0.7] } },
        f: { wear: [["chemise"], [null, "bodice"], ["kirtle", "blueKirtle", "brownSkirt", "skirt"], ["apron", null], ["boots"], ["coif", null], ["pannier", "jug", "basket", "basket"]], hair: ["long", "bob", "ponytail", "topknot"], build: { weight: [0.4, 0.75], muscle: [0.4, 0.55], bust: [0.45, 0.85] } },
    },
    porter: {
        m: { wear: [["smock", "brownTunic", "shirt"], ["breeches", "trousers"], ["boots"], ["belt"], ["hood", null], ["sack", "firewood"]], hair: ["short", "buzz", "bald"], beard: ["full", "short", "stubble"], build: { weight: [0.55, 0.85], muscle: [0.6, 0.9], belly: [0, 0.4] } },
        f: { wear: [["chemise"], ["brownSkirt", "skirt"], ["apron"], ["boots"], ["coif", null], ["sack", "firewood"]], hair: ["ponytail", "topknot", "bob"], build: { weight: [0.5, 0.75], muscle: [0.5, 0.7], bust: [0.4, 0.75] } },
    },
    fieldhand: {
        m: { wear: [["smock", "shirt"], ["trousers", "breeches"], ["boots"], ["belt"], ["strawHat"], ["hoe", "hoe", "pitchfork"]], hair: ["short", "buzz", "swept"], beard: ["stubble", "short", "none"], build: { weight: [0.45, 0.7], muscle: [0.6, 0.85], belly: [0, 0.2] } },
        f: { wear: [["chemise"], [null, "bodice"], ["brownSkirt", "skirt"], ["apron"], ["boots"], ["strawHat"], ["hoe", "hoe", "pitchfork"]], hair: ["ponytail", "long", "topknot"], build: { weight: [0.42, 0.65], muscle: [0.5, 0.7], bust: [0.4, 0.75] } },
    },
    merchant: {
        m: { wear: [["blueTunic", "russetTunic", "shirt"], ["jerkin"], ["breeches", "trousers"], ["boots"], ["belt"], ["gloves", null], ["leatherCap", null, null]], hair: ["short", "swept", "bald"], beard: ["short", "goatee", "full", "none"], build: { weight: [0.5, 0.85], muscle: [0.38, 0.6], belly: [0.2, 0.8] } },
        f: { wear: [["chemise"], ["velvetBodice", "bodice"], ["gown", "blueKirtle", "kirtle"], ["boots"]], hair: ["topknot", "long", "bob"], build: { weight: [0.45, 0.75], muscle: [0.36, 0.5], bust: [0.45, 0.85] } },
    },
    sweeper: {
        m: { wear: [["smock", "brownTunic"], ["trousers"], ["boots"], ["belt"], ["hood", null], ["broom"]], hair: ["short", "buzz", "bald"], beard: ["stubble", "none", "short"], build: { weight: [0.35, 0.65], muscle: [0.4, 0.6], belly: [0, 0.3] } },
        f: { wear: [["chemise"], [null, "bodice"], ["skirt", "brownSkirt"], ["apron"], ["boots"], ["coif"], ["broom"]], hair: ["bob", "ponytail", "topknot"], build: { weight: [0.38, 0.65], muscle: [0.4, 0.55], bust: [0.4, 0.75] } },
    },
    friar: {
        m: { wear: [["habit"], ["trousers"], ["belt"], ["boots"], ["hood", null], ["walkingStaff", "ledger"]], hair: ["bald", "short", "buzz"], beard: ["full", "short", "none"], build: { weight: [0.4, 0.8], muscle: [0.35, 0.5], belly: [0.1, 0.7] } },
        f: { wear: [["habit"], ["habitSkirt"], ["belt"], ["boots"], ["coif", "hood"], ["walkingStaff", "ledger"]], hair: ["topknot", "bob"], build: { weight: [0.38, 0.6], muscle: [0.35, 0.48], bust: [0.35, 0.65] } },
    },
    servant: {
        m: { wear: [["shirt", "brownTunic"], ["trousers", "breeches"], ["boots"], ["belt"], ["apron", null], ["jug", "firewood"]], hair: ["short", "buzz", "swept"], beard: ["none", "stubble", "short"], build: { weight: [0.4, 0.7], muscle: [0.45, 0.7], belly: [0, 0.3] } },
        f: { wear: [["chemise"], ["bodice"], ["kirtle", "skirt"], ["apron"], ["boots"], ["coif"], ["jug", "pannier", "basket"]], hair: ["bob", "ponytail", "topknot"], build: { weight: [0.38, 0.65], muscle: [0.4, 0.55], bust: [0.4, 0.8] } },
    },
    groom: {
        m: { wear: [["shirt"], ["jerkin"], ["breeches"], ["boots"], ["belt"], ["pitchfork"]], hair: ["short", "buzz", "swept"], beard: ["stubble", "short", "none"], build: { weight: [0.45, 0.7], muscle: [0.6, 0.85], belly: [0, 0.2] } },
        f: { wear: [["shirt"], ["jerkin"], ["breeches"], ["boots"], ["belt"], ["pitchfork"]], hair: ["ponytail", "bob"], build: { weight: [0.4, 0.6], muscle: [0.5, 0.7], bust: [0.35, 0.65] } },
    },
    scribe: {
        m: { wear: [["blueTunic", "shirt"], ["jerkin", null], ["trousers", "breeches"], ["boots"], ["belt"], ["ledger"]], hair: ["short", "swept", "bald"], beard: ["none", "goatee", "short"], build: { weight: [0.3, 0.55], muscle: [0.3, 0.45], belly: [0, 0.3] } },
        f: { wear: [["chemise"], ["velvetBodice"], ["kirtle", "gown"], ["boots"], ["ledger"]], hair: ["topknot", "bob", "long"], build: { weight: [0.35, 0.55], muscle: [0.32, 0.45], bust: [0.4, 0.75] } },
    },
};

/** The townsfolk's callings that have looks of their own (core/townsfolk.js CALLINGS'). */
export const TOWNSFOLK_PARTS = Object.freeze(["shopper", "porter", "fieldhand", "merchant", "sweeper", "friar", "servant", "groom", "scribe"]);

// A courtesan's lingerie: one colour, and what goes with it
const LINGERIE = ["Black", "Crimson", "Emerald", "Ivory"];

// What's carried in the right hand (put away for a tankard, at a table)
const WEAPONS_IN_HAND = new Set(["sword", "staff", "warHammer"]);

// A youthful look's bright eyes and hair
const BRIGHT = Object.freeze({ irises: ["#3fa6e8", "#56c48a", "#9a6ae0", "#e0a03a"], hair: ["platinum", "blond", "rose", "auburn", "black", "red"] });

// Grey with age (the greybeard), or now and then
const GREY = ["grey", "white"];

// What won't go on over a cat's ears (a crown sits between them; a helm opens round them: items.js)
const OVER_EARS = new Set(["wizardHat", "strawHat", "coif", "hood", "darkHood", "circletElf", "circletDark", "featherBand"]);

// Those dressed in their people's everyday dress, if not human (dress.js): the townsfolk, and the
// folk of the taverns and churches about their own business
const EVERYDAY_PARTS = new Set([...TOWNSFOLK_PARTS, "patron", "worshipper"]);

/**
 * A look for one of the folk: { shape, look, equipment, walk, sheathed } (as presets.js FOLK's),
 * from `one`: { role (roles.js: barkeep, barmaid, patron, innkeeper, madam, courtesan, smith,
 * apprentice, priest, acolyte, worshipper, receptionist), local (their part: wench, greybeard...),
 * look (their look, if not their role's: an adventurer's calling, warrior, ranger, mage, rogue or
 * cleric), sex ("f" or "m"), seed, people (a RACES id: humans if not given) }.
 */
export function folkLook({ role, local = role, look: calling = null, sex = "m", seed = 1, people = "human" }) {
    const random = createRandom(seed * 2654435761 + 97);
    const part = calling ?? ({ barmaid: "wench", petitioner: "worshipper" }[role] ?? role);
    const spec = PARTS[part]?.[sex] ?? PARTS.patron[sex] ?? PARTS.patron.m;
    const lineage = random.pick(LINEAGES);
    const [african, asian, caucasian] = lineage.mix.map((share) => Math.max(0, share + random.range(-0.08, 0.08)));
    const total = african + asian + caucasian;
    const between = ([least, most]) => random.range(least, most);
    const { build } = spec;
    const old = local === "greybeard" || (!spec.youthful && random.chance(0.08));

    // The body: a man or a woman, as tall and heavy and strong as their part has them
    const macro = {
        gender: sex === "f" ? 0 : 1,
        muscle: between(build.muscle),
        weight: between(build.weight),
        height: random.range(0.4, 0.62),
        african: african / total,
        asian: asian / total,
        caucasian: caucasian / total,
    };
    const details = { jawWidth: random.range(-0.2, 0.5), cheekbones: random.range(-0.1, 0.5), lips: random.range(0, 0.5), noseWidth: random.range(-0.3, 0.3), eyeSize: random.range(-0.1, 0.25) };

    if (sex === "f") {
        macro.bust = between(build.bust);
    } else {
        details.belly = build.belly ? between(build.belly) : 0;
        details.shoulders = random.range(0, 0.4);
    }

    // (Youthful, as a hero of an adventure story would draw a young woman: big eyes, a small nose
    // and mouth, a soft jaw, on a grown woman's body)
    if (spec.youthful) {
        macro.height = random.range(0.4, 0.5);
        Object.assign(details, { eyeSize: random.range(0.9, 1), noseLength: random.range(-0.7, -0.5), noseWidth: random.range(-0.6, -0.4), noseTip: random.range(0.3, 0.5), mouthWidth: random.range(-0.5, -0.3), lips: random.range(0.1, 0.3), jawWidth: random.range(-0.7, -0.5), chin: random.range(-0.5, -0.3), cheekbones: random.range(0, 0.2), headSquare: random.range(-0.5, -0.3), headSize: random.range(0.05, 0.12), browAngle: 0.3 });
    }

    if (part === "courtesan") {
        Object.assign(details, { waist: random.range(-0.9, -0.6), hips: random.range(0.14, 0.28), buttocks: random.range(0.4, 0.55), thighs: random.range(0, 0.1) });
    }

    // Skin, eyes and hair as their forebears had them
    const colour = old ? random.pick(GREY) : random.pick(spec.youthful ? BRIGHT.hair : lineage.hair);
    const look = {
        skin: { tone: SKIN_TONES[random.pick(lineage.tones)], blush: random.range(0.3, 0.75), brows: random.range(0.5, 0.9), freckles: lineage.tones.includes("fair") && random.chance(0.3) ? random.range(0.2, 0.5) : 0 },
        eyes: { iris: random.pick(spec.youthful ? BRIGHT.irises : lineage.irises) },
        hair: { style: random.pick(spec.hair), beard: sex === "m" ? random.pick(spec.beard ?? ["none"]) : "none", colour: HAIR_COLOURS[colour] },
    };

    if (old) {
        look.skin.browColour = HAIR_COLOURS.grey;
    }

    // What they wear
    let equipment;

    if (spec.wear === "lingerie") {
        const shade = random.pick(LINGERIE);
        const legs = shade === "Black" && random.chance(0.4) ? "fishnets" : `stockings${shade}`;

        equipment = [`laceBra${shade}`, `laceBriefs${shade}`, random.chance(0.3) ? "corset" : `suspenders${shade}`, legs];

        if (random.chance(0.4)) {
            equipment.push("choker");
        }
    } else {
        equipment = spec.wear.map((choices) => random.pick(choices)).filter(Boolean);
    }

    // (Another people's in their own everyday dress, rather than the humans' homespun)
    if (people !== "human" && EVERYDAY_PARTS.has(part)) {
        equipment = everydayDress(equipment, people, seed, sex);
    }

    // (Their people's officials in its livery, a keep's sentries in its uniform: liveries.js; a
    // ruler in mail with their sword keeps them)
    if (LIVERY_PARTS.includes(part)) {
        equipment = [...liveryKit(people, part, sex), ...equipment.filter((id) => id === "sword")];
    } else if (part === "sentry") {
        equipment = soldierKit(people, "sword");
    }

    // (Drinking at a table: a tankard in the hand their weapon would be in)
    if (role === "patron" && calling) {
        equipment = [...equipment.filter((id) => !WEAPONS_IN_HAND.has(id)), "tankard"];
    }

    // (What they carry put away, as they're not fighting: `sheathed`)
    const human = { label: local, shape: { macro, details }, look, equipment, walk: "natural", sheathed: Boolean(spec.armed) };

    return people === "human" ? human : ofPeople(human, { people, part, sex, seed });
}

// One of the folk of another people: their people's body, skin, eyes and hair (peoples.js), as
// heavy and strong as their part has them (halfway between), with their part's belly (a man's)
// and figure (a courtesan's), their hair worn as their part has it if their people wear it so,
// dressed for their part, with the parts of their own (a cat's ears and tail...)
function ofPeople(human, { people, part, sex, seed }) {
    const own = peopleLook({ people, sex, seed });

    if (!own) {
        return human;
    }

    const { macro, details } = own.shape;
    const theirs = human.shape;

    macro.weight = (macro.weight + theirs.macro.weight) / 2;
    macro.muscle = (macro.muscle + theirs.macro.muscle) / 2;

    if (sex === "f" && theirs.macro.bust !== undefined) {
        macro.bust = ((macro.bust ?? theirs.macro.bust) + theirs.macro.bust) / 2;
    }

    if (sex === "m" && theirs.details.belly) {
        details.belly = Math.max(details.belly ?? 0, theirs.details.belly);
    }

    if (part === "courtesan") {
        Object.assign(details, { waist: theirs.details.waist, hips: theirs.details.hips, buttocks: theirs.details.buttocks, thighs: theirs.details.thighs });
    }

    const styles = LOOKS[people]?.styles;

    if (styles && (styles[sex] ?? styles.m).includes(human.look.hair.style)) {
        own.look.hair.style = human.look.hair.style;
    }

    const ears = own.parts.includes("catEars");
    const equipment = [...human.equipment.filter((id) => !(ears && OVER_EARS.has(id))), ...own.parts];

    return { ...human, shape: own.shape, look: own.look, equipment, walk: own.walk };
}
