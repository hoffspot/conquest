import sys
root = sys.argv[1]


def edit(path, swaps):
    p = root + '/' + path
    s = open(p).read()
    for a, b in swaps:
        assert s.count(a) == 1, (path, a)
        s = s.replace(a, b)
    open(p, 'w').write(s)


edit('client/js/world/chunks3d.js', [
    ('''import { builderOf, cutAway, drawFar, grounded, joined, partsOf, PIXEL, placed, standOn } from "./town3d.js";''',
     '''import { builderOf, cutAway, drawFar, grounded, joined, partsOf, PIXEL, placed, standOn } from "./town3d.js";
import { sendSoon } from "./sending.js";'''),
    # the rocks drawn again
    ('''        if (stones) {
            drawn.object.add(stones);
        }

        drawn.stones = stones;
        drawn.rocks = rocks;
        this.version++;
    }
''', '''        if (stones) {
            drawn.object.add(sendSoon(stones));
        }

        drawn.stones = stones;
        drawn.rocks = rocks;
        this.version++;
    }
'''),
    # the ground drawn coarser or finer
    ('''            if (ground && respaceGround(this.overworld, this.overworld.chunk(drawn.cx, drawn.cy), ground, this.#spacingOf(drawn.cx, drawn.cy))) {
                this.groundVersion++;
            }
''', '''            if (ground && respaceGround(this.overworld, this.overworld.chunk(drawn.cx, drawn.cy), ground, this.#spacingOf(drawn.cx, drawn.cy))) {
                sendSoon(ground);
                this.groundVersion++;
            }
'''),
    # a sign painted again
    ('''        holdSign(picture);
        sign.mesh.material.map = picture;
        releaseSign(sign.texture);
        sign.texture = picture;
    }
''', '''        holdSign(picture);
        sign.mesh.material.map = picture;
        releaseSign(sign.texture);
        sign.texture = picture;
        // (And sent in the next frame or so, not all those painted again in the frame the camera
        // next turns to them)
        sendSoon(sign.mesh);
    }
'''),
    # a tile of undergrowth
    ('''            if (mesh) {
                mesh.visible = this.#seen(mesh);
                drawn.undergrowth.push(mesh);
                drawn.object.add(mesh);
                this.version++;
            }
''', '''            if (mesh) {
                mesh.visible = this.#seen(mesh);
                drawn.undergrowth.push(mesh);
                drawn.object.add(sendSoon(mesh));
                this.version++;
            }
'''),
    # buildings merged
    ('''        drawn.object.add(merged);

        // (Smoke rising from their chimneys: smoke.js; their banners and flags in the breeze:''', '''        drawn.object.add(sendSoon(merged));

        // (Smoke rising from their chimneys: smoke.js; their banners and flags in the breeze:'''),
    ('''        for (const made of [lit, pools, cloth, smoke]) {
            if (made) {
                drawn.object.add(made);
                drawn.made.push(made);
            }
        }
''', '''        for (const made of [lit, pools, cloth, smoke]) {
            if (made) {
                drawn.object.add(sendSoon(made));
                drawn.made.push(made);
            }
        }
'''),
    ('''            drawn.object.add(drawn.grown.object);

            for (const box of drawn.grown.boxes) {''', '''            drawn.object.add(sendSoon(drawn.grown.object));

            for (const box of drawn.grown.boxes) {'''),
    # a chunk all drawn
    ('''        // The buildings and props of any settlement in it, to be built a few at a time
        this.#queue(drawn);
        drawn.drawing = false;
        object.visible = true;
''', '''        // The buildings and props of any settlement in it, to be built a few at a time
        this.#queue(drawn);
        drawn.drawing = false;
        object.visible = true;
        // (All of it given to the graphics card over the next frames, wherever the camera looks:
        // not in the frame it first turns this way, sending.js)
        sendSoon(object);
'''),
])

edit('client/js/world/town3d.js', [
    ('''import { releaseGeometry } from "./release.js";''', '''import { releaseGeometry } from "./release.js";
import { sendSoon } from "./sending.js";'''),
    ('''        for (const made of town.extras) {
            object.add(made);
        }
    };
''', '''        for (const made of town.extras) {
            object.add(sendSoon(made));
        }
    };
'''),
    ('''    object.add(trees.object);

    const town = { object, heights, buildings, props, lights: [], extras: [] };''', '''    object.add(sendSoon(trees.object));

    const town = { object, heights, buildings, props, lights: [], extras: [] };'''),
    ('''    for (const mesh of block.meshes) {
        mesh.name = `${mesh.name} ${key}`;
        cutAway(mesh.material);
        object.add(mesh);
    }
''', '''    // (Each given to the graphics card over the next frames it's shown in, wherever the camera
    // looks: sending.js)
    for (const mesh of block.meshes) {
        mesh.name = `${mesh.name} ${key}`;
        cutAway(mesh.material);
        object.add(sendSoon(mesh));
    }
'''),
])

edit('client/js/world/view.js', [
    ('''import { setShadowView, watchShadows } from "./shadowpasses.js";''', '''import { sendSome } from "./sending.js";
import { setShadowView, watchShadows } from "./shadowpasses.js";'''),
    ('''        if (scene === this.scene) {
            this.#cutAway(dt);
            this.sky.update(camera, now / 1000);
            WINDOW_LIGHT.value.z = (now / 1000) % 1000;
            this.#updateShown();
            lampShadowsDrawn(this);
        }
''', '''        if (scene === this.scene) {
            this.#cutAway(dt);
            this.sky.update(camera, now / 1000);
            WINDOW_LIGHT.value.z = (now / 1000) % 1000;
            // (The next of what's newly built let through to the graphics card, wherever the
            // camera looks: sending.js)
            sendSome();
            this.#updateShown();
            lampShadowsDrawn(this);
        }
'''),
])
