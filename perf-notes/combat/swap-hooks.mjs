import { pathToFileURL } from "node:url";

let swaps = {};

export function initialize(data) {
    swaps = Object.fromEntries(Object.entries(data.swaps).map(([name, path]) => [`/conquest/client/js/core/${name}`, pathToFileURL(path).href]));
}

export async function resolve(specifier, context, next) {
    const resolved = await next(specifier, context);

    for (const [ending, url] of Object.entries(swaps)) {
        if (resolved.url.endsWith(ending)) {
            return { ...resolved, url };
        }
    }

    return resolved;
}
