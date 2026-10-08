// The building screen (docs/WAR.md *Fortifications*): what a people's council would build, laid
// out on the world map for a player to look over (main.js openWorldMap's `build`). Each of the
// council's plans (core/war/forts.js plansFor), best first: where it would stand, what it guards
// and faces, what it costs and what it takes to keep up, whether the stores hold it now; the
// people's fortifications already standing, as strong as they stand; and their stores. Opened by
// a player of rank at their ruler's (dialogue.js ruler's `build`), whose counsel is which plan to
// build first; built, as all the war's are, when the stores allow (war.js #fortify).
//
// Pure: what's shown is worked out here from the war, so a player might one day build from the
// same screen (war.build) as well as counsel.

import { affords, FORTS, plansFor } from "../core/war/forts.js";
import { FORT_NAMES, peopleOf } from "../core/war/news.js";

/** The most of the council's plans shown (its best). */
export const BUILD_SHOWN = 6;

// The goods, in the order they're told
const GOODS = ["wood", "stone", "metal"];

/** So much of each good, told: "40 wood, 40 stone and 10 metal". */
export function goodsText(goods) {
    const parts = GOODS.filter((good) => (goods?.[good] ?? 0) > 0).map((good) => `${Math.round(goods[good] * 10) / 10} ${good}`);

    return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "nothing");
}

/**
 * What the building screen shows a player of `realmId`'s people: { realm, stores ({ wood, stone,
 * metal }), plans ([{ key, kind, name ("A guard tower before Calbury"), x, z (metres), about, toward
 * (what it guards, and the enemy town it faces: names, or null), facing ("facing the Orcs'
 * Grimhold"), cost, upkeep (a turn), affordable (the stores hold it now), place (1 the council's
 * first), counselled (it's what a player's counselled) }]), forts ([{ id, kind, x, z, hp, maxHp }]:
 * theirs standing), counselled (the key a player's counselled, or null) }. Null for a people that's
 * gone.
 */
export function buildingView(war, realmId) {
    const realm = war.realm(realmId);

    if (!realm?.alive) {
        return null;
    }

    const counselled = realm.build?.key ?? null;
    const nameOf = (id) => war.town(id)?.name ?? null;
    const works = (id) => war.workAt(id);
    const plans = plansFor(war, realmId)
        .slice(0, BUILD_SHOWN)
        .map((plan, k) => {
            const site = works(plan.about);
            const toward = war.town(plan.toward);
            const about = site ? `the ${site.name} ${site.kind}` : nameOf(plan.about);
            const people = toward ? peopleOf(toward.owner) : null;

            return {
                key: plan.key,
                kind: plan.kind,
                name: `A ${FORT_NAMES[plan.kind]} ${site ? "by" : "before"} ${about}`,
                x: plan.at[0],
                z: plan.at[1],
                about,
                toward: toward?.name ?? null,
                facing: toward ? `facing the ${people}${people.endsWith("s") ? "'" : "'s"} ${toward.name}` : "",
                cost: { ...plan.cost },
                upkeep: { ...FORTS[plan.kind].upkeep },
                affordable: affords(realm.stores, plan.cost),
                place: k + 1,
                counselled: plan.key === counselled,
            };
        });
    const forts = war.forts.filter((fort) => fort.realm === realmId).map(({ id, kind, at: [x, z], hp }) => ({ id, kind, x, z, hp, maxHp: FORTS[kind].hp }));

    return { realm: realmId, stores: Object.fromEntries(GOODS.map((good) => [good, Math.floor(realm.stores?.[good] ?? 0)])), plans, forts, counselled };
}
