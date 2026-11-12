import sys
p = sys.argv[1] + '/client/js/world/sending.js'
s = open(p).read()

def swap(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)

swap('''// So what's newly built waits here (sendSoon), and each frame the view has the next of it drawn
// once, wherever the camera looks, in a pass of its own before the frame's (sendSome): into a
// pixel in a corner of the screen, which the frame then clears. Not in the frame itself, culled
// by nothing: there it would count among what the frame draws, and be drawn into the sun's
// shadows too. No more than SEND_SOON.bytes go a frame, the rest waiting their turn (the land
// round the start, all built before the first frame, is sent over the first second or so of
// play); what the camera does see meanwhile is sent as it always was, and takes no turn.
''', '''// So what's newly built waits here (sendSoon), and each frame the view has the next of it drawn
// once, wherever the camera looks, in a pass of its own after the frame's (sendSome): into no
// pixel at all, every one cut away, so the picture's as the frame left it. Not in the frame
// itself, culled by nothing: there it would count among what the frame draws, and be drawn into
// the sun's shadows too. And after the frame, not before it: the frame's drawn the shadow maps
// the lit shaders read, which a map just made has nothing in till then (three.js gives a shader
// that reads one a picture it can't read, and the graphics card refuses the drawing). No more
// than SEND_SOON.bytes go a frame, the rest waiting their turn (the land round the start, all
// built before the first frame, is sent over the first second or so of play); what the camera
// does see meanwhile is sent as it always was, and takes no turn.
''')

swap(''' * Each frame, before it's drawn: the next of those waiting (sendSoon) that are shown in `scene`,
 * as many as have `bytes` to send between them (one at least), drawn once with `renderer`,
 * wherever they are: alone with the scene's lights (all of them, so three.js draws each with the
 * shader it has for it: `lights` gives them, asked only if there's anything to draw), nothing
 * culled, into a pixel of the screen's corner that the frame clears, the shadows not drawn again
 * and nothing cleared for it. The renderer and the scene are left as they were. How many were
 * drawn (0: none, and nothing done).
 *
 * What it draws counts in the renderer's `info` till that's next reset: the view resets it after.
 */''', ''' * Each frame, once it's drawn: the next of those waiting (sendSoon) that are shown in `scene`, as
 * many as have `bytes` to send between them (one at least), drawn once with `renderer`, wherever
 * they are: alone with the scene's lights (all the frame's camera sees, so three.js draws each
 * with the shader it has for it: `lights` gives the scene's, asked only if there's anything to
 * draw), nothing culled, every pixel cut away (a scissor round none), the shadows not drawn again
 * and nothing cleared for it. The renderer, its count of what the frame drew (`info.render`) and
 * the scene are left as they were. How many were drawn (0: none, and nothing done).
 */''')

swap('''        shadows: renderer.shadowMap.autoUpdate,
        shadowed: renderer.shadowMap.needsUpdate,
        background: scene.background
    };
    // (A pixel of the picture, however coarsely it's drawn)
    const pixel = Math.max(1, 1 / renderer.getPixelRatio());

    for (const mesh of meshes) {
        mesh.layers.enable(layer);
        mesh.frustumCulled = false;
    }

    for (const light of lights()) {
        light.layers.enable(layer);
    }
''', '''        shadows: renderer.shadowMap.autoUpdate,
        shadowed: renderer.shadowMap.needsUpdate,
        background: scene.background,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        lines: renderer.info.render.lines
    };

    for (const mesh of meshes) {
        mesh.layers.enable(layer);
        mesh.frustumCulled = false;
    }

    // (The lights the frame's camera sees, and no other: the same lights, the same shaders)
    for (const light of lights()) {
        if (light.layers.mask & 1) {
            light.layers.enable(layer);
        }
    }
''')

swap('''    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, pixel, pixel);
    renderer.setViewport(0, 0, pixel, pixel);
''', '''    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, 0, 0);
    renderer.setViewport(0, 0, 1, 1);
''')

swap('''        renderer.shadowMap.needsUpdate = was.shadowed;
        scene.background = was.background;
''', '''        renderer.shadowMap.needsUpdate = was.shadowed;
        scene.background = was.background;
        // (But which frame three.js is on: it's sent a mesh's corners once a frame by that)
        Object.assign(renderer.info.render, { calls: was.calls, triangles: was.triangles, points: was.points, lines: was.lines });
''')
open(p, 'w').write(s)

p = sys.argv[1] + '/client/js/world/view.js'
s = open(p).read()
swap('''        if (timing) {
            this.gpuTimer.begin();
        }

        // (The next of what's newly built given to the graphics card, wherever the camera looks:
        // drawn once in a pass of its own, sending.js, which is none of what the frame draws)
        if (scene === this.scene) {
            this.sentAhead += sendSome(this.renderer, scene, () => this.#lights());
        }

        this.renderer.info.reset();

        if (scene === this.scene) {
            this.#draw(camera);
''', '''        this.renderer.info.reset();

        if (timing) {
            this.gpuTimer.begin();
        }

        if (scene === this.scene) {
            this.#draw(camera);
            // (The next of what's newly built given to the graphics card, wherever the camera
            // looks: drawn once in a pass of its own, sending.js, which is none of what the frame
            // draws and no pixel of its picture)
            this.sentAhead += sendSome(this.renderer, scene, () => this.#lights());
''')
open(p, 'w').write(s)
