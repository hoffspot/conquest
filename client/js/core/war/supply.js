// The armies' supply (docs/WAR.md *Supply*, M19), as the war reckons it: the wagons that carry an
// army in the field what it eats, from its people's seat or a depot nearer it; what becomes of an
// army whose wagons don't get through; and the depots built in another people's lands to supply it
// from nearer. The war (war.js) moves them a turn at a time; near a player they come to life later
// (M20).
//
// Pure numbers, as the war is.

/**
 * An army in the field (not mustering at its seat: its seat feeds it there) is sent a wagon every
 * `every` turns, `cost` gold from its people's treasury if it comes from their seat (a depot's loads
 * are paid for already). A wagon goes `speed` metres a turn with `guards` beside it, straight for
 * its army wherever it is, and gets there within `reach` metres. One at a time: the next once it's
 * there, or lost. A reserve needs none.
 */
export const SUPPLY = Object.freeze({ every: 5, cost: 6, speed: 250, guards: 2, reach: 60 });

/**
 * What becomes of an army as its wagons fail to get through, one after another (lost on the way, or
 * none sent, there being no gold to pay for it): the share of it that deserts at each. The first is
 * only an alert; at the fourth, the rest go too, and the army's broken up. A wagon that gets through
 * ends it.
 */
export const HUNGER = Object.freeze([0, 0.1, 0.5, 1]);

/**
 * A supply depot, built in another people's lands (the nearest town to it not its people's, nor a
 * friend's): `cost` gold and `build` turns going up, with `guard` raised to hold it. It holds
 * `most` loads at most (`start` once it's up), and sends one of them as a wagon to each of its
 * people's armies (and their liege's and fellow vassals') within `reach` metres of it that it's
 * nearer than their seat. A wagon from the nearest seat of its people's, or of a friend's, brings it
 * another load while it's short (SUPPLY.cost each, its people's). Its people's rulers build one for
 * an army campaigning further than `far` metres from their seat with none in reach, `back` metres
 * behind its camp, and no other for `again` turns after; a people keeps `per` at most, and strikes
 * one no army's drawn on for `idle` turns. Skirmishers falling on it carry off a load; an enemy
 * army or reserve upon it puts its guard down and razes it.
 */
export const DEPOT = Object.freeze({ cost: 40, build: 2, guard: 6, most: 6, start: 2, reach: 1500, far: 2000, back: 300, again: 10, per: 2, idle: 40 });
