import sys
p = sys.argv[1] + '/client/js/world/view.js'
s = open(p).read()


def swap(a, b, count=1):
    global s
    assert s.count(a) == count, (a, s.count(a))
    s = s.replace(a, b)


swap('''// This device, as its browser tells of it: whether it's pointed at with a finger, its memory (GB:''', '''/**
 * A scene's lights, kept from one asking to the next: `kept` (what this gave before, if anything)
 * again while the scene has as many things of its own in it as it had then; else found by walking
 * all of it, what's hidden too, and kept anew ({ lights, children }). (None is added or taken
 * away in play: three.js makes every lit shader again when one is. A likeness walked a town's
 * two thousand nodes for them twice, and the picture behind the pack once more.)
 */
export function sceneLights(scene, kept = null) {
    if (kept?.children === scene.children.length) {
        return kept;
    }

    const lights = [];

    scene.traverse((node) => node.isLight && lights.push(node));

    return { lights, children: scene.children.length };
}

// This device, as its browser tells of it: whether it's pointed at with a finger, its memory (GB:''')

# the portrait's two walks
swap('''        subject.traverse((node) => node.layers.enable(layer));
        this.scene.traverse((node) => node.isLight && node.layers.enable(layer));
        renderer.setRenderTarget(target);
''', '''        subject.traverse((node) => node.layers.enable(layer));
        this.#lights().forEach((light) => light.layers.enable(layer));
        renderer.setRenderTarget(target);
''')
swap('''        subject.traverse((node) => node.layers.enable(layer));
        this.scene.traverse((node) => node.isLight && node.layers.enable(layer));

        const background = this.scene.background;''', '''        subject.traverse((node) => node.layers.enable(layer));
        this.#lights().forEach((light) => light.layers.enable(layer));

        const background = this.scene.background;''')

# the picture behind the pack
swap('''        const scene = new THREE.Scene();
        const lights = [];

        this.#cutAway(0);''', '''        const scene = new THREE.Scene();

        this.#cutAway(0);''')
swap('''        scene.add(quad);
        this.scene.traverse((node) => node.isLight && lights.push(node));
        this.frozen = { picture, scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), width: size.x, height: size.y, lights };
    }
''', '''        scene.add(quad);
        this.frozen = { picture, scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), width: size.x, height: size.y, lights: this.#lights() };
    }

    // The scene's lights (the sun, the lamps, any another hand's put in it), kept: sceneLights
    #lights() {
        this.lightsKept = sceneLights(this.scene, this.lightsKept);

        return this.lightsKept.lights;
    }
''')

open(p, 'w').write(s)
