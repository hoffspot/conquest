// Registry of every entity type in the game, keyed by category ("buildings", "vehicles", ...).
import { Aircraft, aircraftSpecs } from "./aircraft.js";
import { Building, buildingClasses, buildingSpecs } from "./buildings.js";
import { Bullet, bulletSpecs } from "./bullets.js";
import { Terrain, terrainSpecs } from "./terrain.js";
import { Vehicle, vehicleSpecs } from "./vehicles.js";

const categories = {
    buildings: { specs: buildingSpecs, classFor: (name) => buildingClasses[name] ?? Building },
    vehicles: { specs: vehicleSpecs, classFor: () => Vehicle },
    aircraft: { specs: aircraftSpecs, classFor: () => Aircraft },
    terrain: { specs: terrainSpecs, classFor: () => Terrain },
    bullets: { specs: bulletSpecs, classFor: () => Bullet },
};

/** Look up the definition of an entity, e.g. getSpec("vehicles", "heavy-tank"). */
export function getSpec(type, name) {
    if (!Object.hasOwn(categories, type)) {
        return undefined;
    }

    const specs = categories[type].specs;

    return Object.hasOwn(specs, name) ? specs[name] : undefined;
}

/** All entity specs of one category. */
export function getSpecs(type) {
    return Object.hasOwn(categories, type) ? Object.values(categories[type].specs) : [];
}

/** Every {type, name} pair in the game, e.g. to preload all sprite sheets. */
export function allEntityNames() {
    return Object.entries(categories).flatMap(([type, { specs }]) => Object.keys(specs).map((name) => ({ type, name })));
}

/** Create a new entity instance for the given game from its details ({ type, name, x, y, ... }). */
export function createEntity(game, details) {
    const spec = getSpec(details.type, details.name);

    if (!spec) {
        throw new Error(`Unknown entity: ${details.type}/${details.name}`);
    }

    const EntityClass = categories[details.type].classFor(details.name);

    return new EntityClass(game, spec, details);
}
