// Helpers for levels to put things at named places ("sites") on the map, so that the same mission
// works on the book's map and on generated maps. A site is a rectangle of tiles:
//   { name, x, y, width, height, cx, cy, corner, side, mapWidth, mapHeight }
// corner is the corner of the map it is in or nearest ("nw", "ne", "se" or "sw"), and side is the
// map edge it touches, if any ("north", "south", "east" or "west").

import { makeSite } from "./mapgen.js";

/** A site at a fixed place on a map (for the book's map). */
export function fixedSite(name, [x, y, width = 1, height = 1], map, side = undefined) {
    return makeSite(name, x, y, width, height, map.mapGridWidth, map.mapGridHeight, undefined, side);
}

/** An area around a site, `margin` tiles bigger on every side (for triggers that check where units are). */
export function around(site, margin) {
    return { name: `around ${site.name}`, x: site.x - margin, y: site.y - margin, width: site.width + margin * 2, height: site.height + margin * 2 };
}

/** Is an item inside an area? (Strictly inside, as the book's triggers compared positions.) */
export function isInside(item, area) {
    return Boolean(item) && item.x > area.x && item.x < area.x + area.width && item.y > area.y && item.y < area.y + area.height;
}

/** The part of the map a site is in, for messages: "North West", "South East"... */
export function sector(site) {
    const [northSouth, eastWest] = site.corner;

    return `${northSouth === "n" ? "North" : "South"} ${eastWest === "w" ? "West" : "East"}`;
}

/**
 * Place things in a site the way a layout was designed for one corner of the map, mirrored to
 * suit the corner the site is actually in (so that a base's defences face the rest of the map).
 * Returns place(dx, dy, width, height) giving the map position of something `dx`, `dy` tiles from
 * the site's top left in the design, and place.direction(direction) for which way to face.
 */
export function layout(site, designedFor) {
    const flipX = site.corner[1] !== designedFor[1];
    const flipY = site.corner[0] !== designedFor[0];

    const place = (dx, dy, width = 1, height = 1) => ({
        x: flipX ? site.x + site.width - dx - width : site.x + dx,
        y: flipY ? site.y + site.height - dy - height : site.y + dy,
    });

    // Directions run clockwise from 0 (north) to 7 (north west)
    place.direction = (direction) => {
        let result = direction;

        if (flipX) {
            result = (8 - result) % 8;
        }

        if (flipY) {
            result = (12 - result) % 8;
        }

        return result;
    };

    return place;
}

/**
 * A position just off the map, beyond the edge a site touches (for units arriving from outside),
 * `along` tiles along the edge from the site's top left, and the direction facing into the map.
 */
export function offMap(site, distance, along = 0) {
    switch (site.side) {
        case "west":
            return { x: -distance, y: site.y + along, direction: 2 };
        case "east":
            return { x: site.mapWidth - 1 + distance, y: site.y + along, direction: 6 };
        case "north":
            return { x: site.x + along, y: -distance, direction: 4 };
        default:
            return { x: site.x + along, y: site.mapHeight - 1 + distance, direction: 0 };
    }
}
