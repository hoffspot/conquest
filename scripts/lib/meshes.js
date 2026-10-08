// Reading the meshes some models come as (scripts/build-props.js): an OBJ's (Wavefront: points,
// pictures' places, normals, faces) or an STL's (a scan's triangles, nothing else), each as
// { positions, normals, uvs (null if it has none), indices }, its points shared by its triangles.

// A mesh from points pushed one corner at a time, the same corner (`key`) used again rather than
// repeated
function builder() {
    const [positions, normals, uvs, indices, seen] = [[], [], [], [], new Map()];

    return {
        corner(key, position, normal, uv) {
            let index = seen.get(key);

            if (index === undefined) {
                index = seen.size;
                seen.set(key, index);
                positions.push(...position);
                normals.push(...(normal ?? [0, 0, 0]));
                uvs.push(...(uv ?? [0, 0]));
            }

            indices.push(index);
        },
        done(hasUv) {
            return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: hasUv ? new Float32Array(uvs) : null, indices: new Uint32Array(indices) };
        },
    };
}

// Each point's normal as the sum of its triangles' (which weighs them by their size), made unit
function smoothNormals(mesh) {
    const { positions: p, indices } = mesh;
    const normals = new Float32Array(p.length);

    for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
        const [ux, uy, uz, vx, vy, vz] = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2], p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
        const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];

        for (const at of [a, b, c]) {
            normals[at] += n[0];
            normals[at + 1] += n[1];
            normals[at + 2] += n[2];
        }
    }

    for (let at = 0; at < normals.length; at += 3) {
        const length = Math.hypot(normals[at], normals[at + 1], normals[at + 2]) || 1;

        normals.set([normals[at] / length, normals[at + 1] / length, normals[at + 2] / length], at);
    }

    return { ...mesh, normals };
}

/** An OBJ's faces as one mesh (each face cut into triangles from its first corner). */
export function readObj(text) {
    const [v, vt, vn] = [[], [], []];
    const mesh = builder();
    let [hasUv, hasNormal] = [false, false];

    // (An OBJ's indices count from 1, or back from the last read if less than 0)
    const at = (list, index) => list[index < 0 ? list.length + index : index - 1];

    for (const line of text.split(/\r?\n/)) {
        const [word, ...rest] = line.trim().split(/\s+/);

        if (word === "v") {
            v.push(rest.slice(0, 3).map(Number));
        } else if (word === "vt") {
            vt.push(rest.slice(0, 2).map(Number));
        } else if (word === "vn") {
            vn.push(rest.slice(0, 3).map(Number));
        } else if (word === "f") {
            const corners = rest.map((corner) => corner.split("/").map((index) => (index === "" ? null : Number(index))));

            for (let k = 1; k + 1 < corners.length; k++) {
                for (const [p, t, n] of [corners[0], corners[k], corners[k + 1]]) {
                    hasUv ||= t !== null && t !== undefined;
                    hasNormal ||= n !== null && n !== undefined;
                    mesh.corner(`${p}/${t}/${n}`, at(v, p), n ? at(vn, n) : null, t ? at(vt, t) : null);
                }
            }
        }
    }

    const read = mesh.done(hasUv);

    return hasNormal ? read : smoothNormals(read);
}

/** An STL's triangles (binary or text) as one mesh, its corners in the same place made one. */
export function readStl(bytes) {
    const file = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
    const count = file.length >= 84 ? file.readUInt32LE(80) : 0;
    const corners = [];

    if (file.length === 84 + count * 50) {
        for (let t = 0; t < count; t++) {
            for (let k = 0; k < 3; k++) {
                const from = 84 + t * 50 + 12 + k * 12;

                corners.push([file.readFloatLE(from), file.readFloatLE(from + 4), file.readFloatLE(from + 8)]);
            }
        }
    } else {
        for (const [, x, y, z] of file.toString("latin1").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) {
            corners.push([Number(x), Number(y), Number(z)]);
        }
    }

    const mesh = builder();

    for (const corner of corners) {
        mesh.corner(corner.map((value) => value.toFixed(5)).join(" "), corner);
    }

    return smoothNormals(mesh.done(false));
}
