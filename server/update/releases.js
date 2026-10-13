// The server's new versions, as the project releases them (generated/world_server_plan.md §11,
// "Updating"): a GitHub release tagged server-v<version>, with the server's archive
// (pellagos-server-<version>.tar.gz, scripts/build-mac-app.js) and its signature
// (pellagos-server-<version>.tar.gz.sig: Ed25519, base64, over the archive's bytes, made with the
// project's private key, scripts/release-key.js). The public half ships with the server, in
// release-key.pem beside this file; until the project has made one, nothing can be updated (a new
// version is still shown). Checking costs nothing: GitHub's API, asked once a day.

import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";

/** Where the project's releases are listed. */
export const RELEASES = "https://api.github.com/repos/hoffspot/conquest/releases?per_page=30";

/** A server release's tag, and its version in it. */
export const RELEASE_TAG = /^server-v(\d+\.\d+\.\d+)$/;

/** A release's archive and signature, by version. */
export const archiveName = (version) => `pellagos-server-${version}.tar.gz`;
export const signatureName = (version) => `${archiveName(version)}.sig`;

/** The most an archive may be (bytes) before it's refused unread. */
export const ARCHIVE_LIMIT = 256 * 1024 * 1024;

/** The release notes shown, at most (characters). */
const NOTES = 4000;

/** The project's public key (release-key.pem, PEM), or null if it hasn't made one. */
export function readReleaseKey(file = new URL("./release-key.pem", import.meta.url)) {
    try {
        const pem = readFileSync(file, "utf8");

        createPublicKey(pem);

        return pem;
    } catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }

        throw new Error(`The release key (${file}) isn't one: ${error.message}`);
    }
}

/** -1, 0 or 1 as version `a` (x.y.z) is older than, the same as, or newer than `b`. */
export function compareVersions(a, b) {
    const parts = (version) => String(version).split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
    const [x, y] = [parts(a), parts(b)];

    for (let k = 0; k < 3; k++) {
        if (x[k] !== y[k]) {
            return x[k] < y[k] ? -1 : 1;
        }
    }

    return 0;
}

/**
 * The newest server release in GitHub's list of releases (not a draft, nor a pre-release, with
 * its archive and signature), or null: { version, notes, published, page, archive, signature }
 * (archive and signature: where they're downloaded from).
 */
export function latestRelease(releases) {
    let latest = null;

    for (const release of Array.isArray(releases) ? releases : []) {
        const version = RELEASE_TAG.exec(release?.tag_name ?? "")?.[1];

        if (!version || release.draft || release.prerelease) {
            continue;
        }

        const asset = (name) => (release.assets ?? []).find((one) => one?.name === name)?.browser_download_url ?? null;
        const archive = asset(archiveName(version));
        const signature = asset(signatureName(version));

        if (!archive || !signature || (latest && compareVersions(version, latest.version) <= 0)) {
            continue;
        }

        latest = {
            version,
            notes: String(release.body ?? "").slice(0, NOTES),
            published: release.published_at ?? null,
            page: release.html_url ?? null,
            archive,
            signature,
        };
    }

    return latest;
}

/** The newest server release (latestRelease), asked of `url` with `fetch`. Throws, saying why, if it can't be asked. */
export async function fetchLatest({ url = RELEASES, fetch = globalThis.fetch, timeout = 20000 } = {}) {
    let response;

    try {
        response = await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "pellagos-server" }, signal: AbortSignal.timeout(timeout) });
    } catch (error) {
        throw new Error(`The releases couldn't be asked for (${error.cause?.code ?? error.message}).`);
    }

    if (!response.ok) {
        throw new Error(`The releases couldn't be asked for (${response.status}).`);
    }

    return latestRelease(await response.json());
}

/** A file downloaded (`url`, with `fetch`), refused if it's more than `limit` bytes. Returns a Buffer. */
export async function fetchBytes(url, { fetch = globalThis.fetch, limit = ARCHIVE_LIMIT, timeout = 600000 } = {}) {
    let response;

    try {
        response = await fetch(url, { headers: { "User-Agent": "pellagos-server" }, signal: AbortSignal.timeout(timeout) });
    } catch (error) {
        throw new Error(`${url} couldn't be downloaded (${error.cause?.code ?? error.message}).`);
    }

    if (!response.ok) {
        throw new Error(`${url} couldn't be downloaded (${response.status}).`);
    }

    const chunks = [];
    let size = 0;

    for await (const chunk of response.body) {
        size += chunk.length;

        if (size > limit) {
            throw new Error(`${url} is more than ${Math.round(limit / 1048576)} MB.`);
        }

        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

/** Whether `signature` (base64 text) is the project's (`key`, PEM) over `bytes`. */
export function verifySignature(bytes, signature, key) {
    try {
        return verify(null, bytes, createPublicKey(key), Buffer.from(String(signature).trim(), "base64"));
    } catch {
        return false;
    }
}
