// The world view (generated/multiplayer_scaling_plan.md 3-3 to 3-8): what a game reads of the
// world's rules that isn't in its battle, asked for in one place, so that a game with no Host of
// its own (a replicated world's: the plan's Stage 3) can be told the same by its server. Its
// first supplier, LocalView, wraps the Host a solo, hosting or lockstep game has, and is there
// for good: such a game reads its own world through it.
//
// Its second group (3-4), war and news, is read at once, as the world has it or as it was last
// told: the war whole (its towns, realms, turn and news are small, and a mirror of it is kept
// as the war itself is), the invasions, what's burnt, and who's out on the war's business.
//
// Its first group (3-3): shops, talk, hires and trades. A talk's facts and a shop's are *asked
// for* as the talk or the shop opens, and may come later (a promise: a server's answer); what
// comes is a handle whose reads are then at once, each as the world has it now (the local
// supplier's read the Host; a server's would be kept up by what it sends). `after` takes either:
// LocalView answers at once, so a solo game's talk opens in the tap that asked, as it always did.
// DeferredView answers the same a moment later, as a server's would: the tests' second supplier.

/** What the view's asked, by name, with what each is for (the first group's). */
export const VIEW = Object.freeze({
    talk: "What a talk needs of the world, asked as it opens (may come later): who they are to the director, their hire, their shop's special, what a messenger says; and, read at once whenever asked, those of the player's mending, a stable's offer and who's hired.",
    shop: "A shop's stock, asked as it opens (may come later): read at once whenever its wares are drawn, as they stand.",
    trade: "The trade the player's in with another player, if any: read at once, as last known.",
});

/** Do `then` with a value once it's there: at once, or when its promise settles. */
export function after(value, then) {
    if (typeof value?.then === "function") {
        value.then(then);
    } else {
        then(value);
    }
}

/** The first supplier: a game's own Host (core/host.js), read as it stands. */
export class LocalView {
    constructor(host) {
        this.host = host;
    }

    /**
     * A talk with one of the folk (`id`), for a player (`me`): { stranger (the director's, or
     * null), hire (their offer as the talk opens, or null: asked only of one who might be hired,
     * `hirable`), messenger (what they say as a messenger or commander, or null), stock (their
     * shop's daily stock, or null), times (its prices' factor), and, read whenever asked:
     * hired(folkId), menders() (the offers to send for each of the player's mending), stable()
     * (a stablemaster's offer) }.
     */
    talk(me, id, { hirable = false } = {}) {
        const host = this.host;

        return {
            stranger: host.strangerOf(id),
            hire: hirable ? host.hireOffer(me, id) : null,
            messenger: host.messengerSaysOf(id) ?? null,
            stock: host.stockOf(id),
            times: host.shopTimes(id),
            hired: (folkId) => Boolean(host.hired?.has(folkId)),
            menders: () => host.mendingOf(me).map((mending) => host.recallOffer(me, mending)).filter(Boolean),
            stable: () => host.stableOffer(me),
        };
    }

    /** A shop (its keeper's id): read whenever asked, { stock() (its daily stock, or null), times() (its prices' factor), threadWares() (what a thread adds to its wares) }. */
    shop(keeper) {
        const host = this.host;

        return { stock: () => host.stockOf(keeper), times: () => host.shopTimes(keeper), threadWares: () => host.threadWaresOf(keeper) };
    }

    /** The open trade a player's in (core/host.js trades), or null. */
    trade(me) {
        return [...(this.host.trades?.values() ?? [])].find((trade) => trade.open && (trade.from === me || trade.to === me)) ?? null;
    }
}

/**
 * What's read at once of a view, as the world has it or as it was last told, by the plan's
 * groups (3-4 to 3-8): `state` is read as it is (the war whole, a map by id, a set), `asks` are
 * asked with what they're about and answered at once. Each is the Host's own of the same name
 * (core/host.js says what it holds): a server's supplier keeps a mirror of each.
 */
export const READS = Object.freeze({
    war: { words: "War and news: who holds each town and works, the realms, the invasions, what's burnt, and who's out on the war's business.", state: ["war", "invasions", "burnt", "soldiers", "fortsOut", "envoys", "convoys", "supplies", "wagons", "quartered"], asks: ["invader", "engagements"] },
    party: { words: "Party and roster: the players wherever they are, their parties, invitations and ready checks.", state: ["players", "pausable"], asks: ["partyFor", "partyOf", "fellows", "invitation", "waiting"] },
    company: { words: "Followers, companions and the hero's own: who follows whom, those mending, and what each may do.", state: ["followers", "companions", "mending"], asks: ["mendingOf", "mostFollowers", "unitAbility", "stance", "recallOffer", "vitalsOf", "capFor", "mightFor", "fightFor", "canFight", "characterOf"] },
    props: { words: "The director's props: caches, finds, strangers, obstacles, trails, what's dropped, campfires, treasures and what's open or shut.", state: ["caches", "finds", "strangers", "obstacles", "ground", "campfires", "ambushes", "treasures", "open", "fresh", "wild", "slain"], asks: ["trailCreatureOf", "treasuresOf", "campRefusal", "shutOf"] },
    rest: { words: "The rest: legends and their threads, the dungeons, hell's rifts, the world's rules, its folk out of doors, and where and when.", state: ["legends", "dungeons", "hellRifts", "rules", "done", "folk", "world"], asks: ["placeOf", "dueTo"] },
});

const STATE = Object.values(READS).flatMap(({ state }) => state);
const ASKS = Object.values(READS).flatMap(({ asks }) => asks);

for (const name of STATE) {
    Object.defineProperty(LocalView.prototype, name, {
        get() {
            return this.host[name];
        },
    });
}

// (Asked as the game asks them: one the Host hasn't, an older world's, is undefined, so
// `view.shutOf?.(...)` reads as it did on the Host)
for (const name of ASKS) {
    Object.defineProperty(LocalView.prototype, name, {
        get() {
            return typeof this.host[name] === "function" ? (...asked) => this.host[name](...asked) : undefined;
        },
    });
}

/**
 * A view whose answers come a moment later, as a server's would: what's asked for (talk, shop) is
 * a promise of the view's own; what's read at once (trade) is its own. For the tests: every talk
 * and shop must open as well this way.
 */
export class DeferredView {
    constructor(view) {
        this.view = view;
    }

    talk(...asked) {
        return Promise.resolve().then(() => this.view.talk(...asked));
    }

    shop(...asked) {
        return Promise.resolve().then(() => this.view.shop(...asked));
    }

    trade(me) {
        return this.view.trade(me);
    }
}

for (const name of [...STATE, ...ASKS]) {
    Object.defineProperty(DeferredView.prototype, name, {
        get() {
            return this.view[name];
        },
    });
}
