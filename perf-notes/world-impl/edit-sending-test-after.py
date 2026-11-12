import sys
p = sys.argv[1] + '/test/sending.test.js'
s = open(p).read()

def swap(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)

swap('''// first turns to it (client/js/world/sending.js): the next of it drawn once each frame in a pass
// of its own, wherever the camera looks, so much a frame, the renderer and the meshes left as
// they were
''', '''// first turns to it (client/js/world/sending.js): the next of it drawn once each frame in a pass
// of its own, wherever the camera looks, into no pixel, so much a frame, the renderer and the
// meshes left as they were
''')
swap('''// it was drawn. Each drawing kept, as it was drawn (`passes`)
const renderer = ({ ratio = 2 } = {}) => {
    const [viewport, scissor] = [new THREE.Vector4(0, 0, 800, 600), new THREE.Vector4(0, 0, 800, 600)];
    let scissored = false;
    const set = (into) => (x, y, w, h) => (x.isVector4 ? into.copy(x) : into.set(x, y, w, h));

    return {
        autoClear: true,
        shadowMap: { autoUpdate: true, needsUpdate: true },
        passes: [],
        getPixelRatio: () => ratio,
        getViewport''', '''// it was drawn, counting what it drew and the frame it's on. Each drawing kept, as it was drawn
// (`passes`)
const renderer = () => {
    const [viewport, scissor] = [new THREE.Vector4(0, 0, 800, 600), new THREE.Vector4(0, 0, 800, 600)];
    let scissored = false;
    const set = (into) => (x, y, w, h) => (x.isVector4 ? into.copy(x) : into.set(x, y, w, h));

    return {
        autoClear: true,
        shadowMap: { autoUpdate: true, needsUpdate: true },
        info: { render: { frame: 7, calls: 229, triangles: 1283162, points: 40, lines: 2 } },
        passes: [],
        getViewport''')
swap('''            this.passes.push({ drawn, lights, background: scene.background, ...this.state() });
''', '''            this.passes.push({ drawn, lights, background: scene.background, ...this.state() });
            this.info.render.frame++;
            this.info.render.calls += drawn.length;
            this.info.render.triangles += drawn.length * 1000;
''')
swap('''    it("draws what's newly built once, SEND_SOON.bytes of it a frame in the order it was built, in a pass of its own: nothing culled, alone with the lights, into a pixel, the shadows and the picture left be; then all as it was", () => {''',
     '''    it("draws what's newly built once, SEND_SOON.bytes of it a frame in the order it was built, in a pass of its own: nothing culled, alone with the lights the frame has, into no pixel, the shadows and the picture left be; then all as it was, what the frame drew still counted alone", () => {''')
swap('''        const lights = [new THREE.DirectionalLight(), new THREE.PointLight()];
        const other = mesh(1200);
        const gl = renderer();
        const before = gl.state();

        scene.background = new THREE.Color(0x336699);
        scene.add(group.add(...meshes), other, ...lights);
''', '''        const lights = [new THREE.DirectionalLight(), new THREE.PointLight()];
        // (A light no frame's camera sees, so no part of what its shaders are made for)
        const apart = new THREE.PointLight();
        const other = mesh(1200);
        const gl = renderer();
        const before = gl.state();

        apart.layers.set(3);
        scene.background = new THREE.Color(0x336699);
        scene.add(group.add(...meshes), other, ...lights, apart);
''')
swap('''        assert.equal(sendSome(gl, scene, () => lights), 2);

        const [pass] = gl.passes;

        assert.deepEqual(pass.drawn, meshes.slice(0, 2), "those, and nothing else of the scene");
        assert.deepEqual(pass.lights, lights, "lit by every light, as the frame is: the same shaders");
        // (A pixel of the picture: half a CSS pixel across is none, so one, which is two here)
        assert.deepEqual([pass.viewport, pass.scissor, pass.scissored], [[0, 0, 1, 1], [0, 0, 1, 1], true]);
        assert.deepEqual([pass.cleared, pass.shadows, pass.background], [false, { autoUpdate: false, needsUpdate: false }, null]);

        // (And all as it was: the frame's drawn as ever, and draws none of them again)
        assert.deepEqual(gl.state(), before);
        assert.equal(scene.background.getHex(), 0x336699);
''', '''        assert.equal(sendSome(gl, scene, () => [...lights, apart]), 2);

        const [pass] = gl.passes;

        assert.deepEqual(pass.drawn, meshes.slice(0, 2), "those, and nothing else of the scene");
        assert.deepEqual(pass.lights, lights, "lit by every light the frame is, and no other: the same shaders");
        // (Every pixel cut away: a scissor round none of them)
        assert.deepEqual([pass.viewport, pass.scissor, pass.scissored], [[0, 0, 1, 1], [0, 0, 0, 0], true]);
        assert.deepEqual([pass.cleared, pass.shadows, pass.background], [false, { autoUpdate: false, needsUpdate: false }, null]);

        // (And all as it was: the frame's drawn as ever, and draws none of them again; what it
        // drew counted as it was, three.js a frame on)
        assert.deepEqual(gl.state(), before);
        assert.equal(scene.background.getHex(), 0x336699);
        assert.deepEqual(gl.info.render, { frame: 8, calls: 229, triangles: 1283162, points: 40, lines: 2 });
        assert.equal(apart.layers.mask, 8);
''')
a = s.index('''    it("draws a pixel of the picture however coarsely the picture's drawn"''')
b = s.index('''    it("counts a mesh with few corners''')
s = s[:a] + s[b:]
swap('''        const before = gl.state();

        scene.add(sendSoon(one));
        gl.render = () => {
            throw new Error("lost");
        };
        assert.throws(() => sendSome(gl, scene), /lost/);
        assert.deepEqual(gl.state(), before);
''', '''        const before = [gl.state(), { ...gl.info.render }];

        scene.add(sendSoon(one));
        gl.render = () => {
            gl.info.render.calls++;

            throw new Error("lost");
        };
        assert.throws(() => sendSome(gl, scene), /lost/);
        assert.deepEqual([gl.state(), gl.info.render], before);
''')
open(p, 'w').write(s)

p = sys.argv[1] + '/test/chunks.test.js'
s = open(p).read()
swap('''            shadowMap: { autoUpdate: true, needsUpdate: false },
            getPixelRatio: () => 1,
''', '''            shadowMap: { autoUpdate: true, needsUpdate: false },
            info: { render: { frame: 0, calls: 0, triangles: 0, points: 0, lines: 0 } },
''')
open(p, 'w').write(s)
