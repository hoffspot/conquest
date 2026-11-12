import sys
p = sys.argv[1] + '/test/chunks.test.js'
s = open(p).read()
a = s.index('    it("has all of a chunk it\'s drawn given to the graphics card over the frames after')
b = s.index('    it("paints each sign only as finely as it\'s seen')
new = '''    it("has all of a chunk it's drawn given to the graphics card over the frames after, wherever the camera looks (sending.js): each mesh drawn once in a pass of its own though it's out of view, and left culled as it was; and its ground again, drawn coarser", () => {
        const overworld = world.maps.town;
        const [sx, sy] = world.spawns.player.map((v) => Math.floor(v / CHUNK));
        const wild = [-2, -1, 0, 1, 2].flatMap((dy) => [-2, -1, 0, 1, 2].map((dx) => overworld.chunk(sx + dx, sy + dy))).find(({ trees, features }) => trees.length > 2 && features.some(({ kind }) => kind !== "arch" && kind !== "aqueduct"));
        const chunks = new Chunks(world, { undergrowth: 0 });
        const scene = new THREE.Scene().add(chunks.object);
        // (A renderer as three.js's is to it: what's shown that the camera's layers see and isn't
        // culled away drawn, none of it in view, and told so; what each drawing drew kept)
        const passes = [];
        const renderer = {
            autoClear: true,
            shadowMap: { autoUpdate: true, needsUpdate: false },
            getPixelRatio: () => 1,
            getViewport: (target) => target.set(0, 0, 800, 600),
            getScissor: (target) => target.set(0, 0, 800, 600),
            getScissorTest: () => false,
            setViewport: noop,
            setScissor: noop,
            setScissorTest: noop,
            render(given, camera) {
                const drawn = [];

                given.traverseVisible((node) => node.isMesh && node.layers.test(camera.layers) && !node.frustumCulled && drawn.push(node));
                passes.push(drawn);
                drawn.forEach((node) => node.onAfterRender(this, given, camera, node.geometry, node.material, null));
            },
        };

        // (None of another test's left waiting: those are in no scene, and wait there)
        sendSome(renderer, scene, [], Infinity);
        assert.equal(passes.length, 0);
        chunks.fill(wild.x0 + CHUNK / 2, wild.y0 + CHUNK / 2, 0);

        const [drawn] = chunks.drawn.values();
        const meshes = [];

        drawn.object.traverse((node) => node.isMesh && meshes.push(node));

        const names = new Set(meshes.map(({ name }) => name));
        const waiting = () => meshes.filter((mesh) => Object.hasOwn(mesh, "onAfterRender")).length;

        assert.ok(["ground", "wilds", "crown shadows", "litter"].every((name) => names.has(name)), [...names].join());
        assert.equal(waiting(), meshes.length, "every mesh of it waiting its turn");
        assert.ok(meshes.every((mesh) => mesh.frustumCulled));

        for (let frames = 0; waiting() > 0 && frames < 100; frames++) {
            const now = sendSome(renderer, scene);

            assert.ok(now >= 1 && now <= 8, `${now} in a frame`);
            assert.equal(passes.at(-1).length, now, "each drawn, out of view as it is");
            assert.ok(meshes.every((mesh) => mesh.frustumCulled && mesh.layers.mask === 1), "culled again, each as it was");
        }

        assert.deepEqual(new Set(passes.flat()), new Set(meshes), "every one");
        assert.equal(passes.flat().length, meshes.length, "once");
        assert.equal(sendSome(renderer, scene), 0);

        // (Its ground drawn with its corners further apart: made again, and sent again)
        const ground = meshes.find(({ name }) => name === "ground");

        chunks.setSpacing([2]);
        assert.equal(waiting(), 1);
        assert.equal(sendSome(renderer, scene), 1);
        assert.deepEqual(passes.at(-1), [ground]);
        chunks.dispose();
    });

'''
s = s[:a] + new + s[b:]
open(p, 'w').write(s)
