import sys
p = sys.argv[1] + '/test/light.test.js'
s = open(p).read()
a = '''import { skyAt } from "../client/js/world/daytime.js";
'''
b = '''import { skyAt } from "../client/js/world/daytime.js";
import { sceneLights } from "../client/js/world/view.js";
'''
assert s.count(a) == 1
s = s.replace(a, b)
s = s.rstrip('\n') + '''

describe("the scene's lights, kept (view.js sceneLights)", () => {
    it("are found by walking the scene once, what's hidden too, and kept; walked for again only once the scene's been given or lost something of its own", () => {
        const scene = new THREE.Scene();
        const [sun, lamp, hidden] = [new THREE.DirectionalLight(), new THREE.PointLight(), new THREE.Group()];
        let walks = 0;
        const walk = scene.traverse;

        scene.traverse = function (...given) {
            walks++;

            return walk.apply(this, given);
        };
        // (A lamp in a floor put away till it's gone into; and a town's worth of other things)
        hidden.visible = false;
        hidden.add(new THREE.Group().add(lamp));
        scene.add(sun, sun.target, hidden, ...Array.from({ length: 50 }, () => new THREE.Mesh()));

        const kept = sceneLights(scene);

        assert.deepEqual(kept.lights, [sun, lamp]);
        assert.equal(walks, 1);

        // (A likeness asks twice, and the picture behind the pack once: none walks it again)
        assert.equal(sceneLights(scene, kept), kept);
        assert.equal(sceneLights(scene, sceneLights(scene, kept)), kept);
        assert.equal(walks, 1);

        // (Something put in the scene, a light with it; and taken out again)
        const flash = new THREE.PointLight();
        const more = sceneLights(scene.add(new THREE.Group().add(flash)), kept);

        assert.deepEqual(more.lights, [sun, lamp, flash]);
        assert.equal(walks, 2);
        assert.equal(sceneLights(scene, more), more);
        scene.remove(flash.parent);
        assert.deepEqual(sceneLights(scene, more).lights, [sun, lamp]);
        assert.equal(walks, 3);
    });
});
'''
open(p, 'w').write(s)
