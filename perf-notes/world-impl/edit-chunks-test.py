import sys
p = sys.argv[1] + '/test/chunks.test.js'
s = open(p).read()
start = s.index('''    it("paints a chunk's signs only as finely as they're seen: a quarter each way while it's far off''')
end = s.index('''    it("draws the yards behind a settlement's houses that are there''')
new = '''    it("paints each sign only as finely as it's seen: a quarter each way while it's far from the player, from the start, as the quality has them once it's near, kept so till it's well off again; one painted again a frame", async () => {
        const place = world.maps.town.settlements.places.find(({ kind, id }) => kind === "village" && id !== world.start.id);
        const [cx, cy] = place.at.map((v) => Math.floor(v / CHUNK));
        // (The player in the chunk east of the village's, well past its edge)
        const outside = [(cx + 1) * CHUNK + DETAIL_NEAR + SIGNS_KEPT + 4, place.at[1]];
        const built = async (chunks) => {
            const drawn = chunks.drawn.get(cy * CHUNKS + cx);

            for (let frames = 0; (drawn.job || !drawn.buildings) && frames < 20000; frames++) {
                chunks.update(...outside, { budget: 1 });
                await new Promise((resolve) => setImmediate(resolve));
            }

            return drawn;
        };
        const chunks = new Chunks(world, { undergrowth: 0 });
        const every = () => [...chunks.drawn.values()].flatMap(({ signs }) => signs ?? []);
        const painted = ({ texture }) => texture.userData.detail;
        const off = ({ at }, [x, z]) => Math.hypot(at.x - x, at.z - z) - at.radius;
        // (Those painted more coarsely than they're seen from somewhere, and those more finely than
        // they need be, well off: [near, far] how finely near ones and far ones are painted)
        const lacking = (where, [near, far] = [1, 0.25]) => every().filter((sign) => painted(sign) < (off(sign, where) <= DETAIL_NEAR ? near : far)).length;
        const spare = (where, [, far] = [1, 0.25]) => every().filter((sign) => off(sign, where) > DETAIL_NEAR + SIGNS_KEPT && painted(sign) > far).length;
        // (Frames with no time to build in: each paints one sign again at most)
        const frames = (where, count) => {
            for (let k = 0; k < count; k++) {
                chunks.update(...where, { budget: 0 });
            }
        };

        signDetail(1);
        SIGN_SCREEN.value = 0;
        chunks.fill(...outside, 1);

        const drawn = await built(chunks);
        const signs = drawn.signs.length;

        assert.ok(signs >= 3, `${signs} signs`);
        assert.deepEqual(drawn.signs.map(painted), drawn.signs.map(() => 0.25), "painted small as they were built");
        assert.ok(drawn.signs.every((sign) => off(sign, outside) > DETAIL_NEAR + SIGNS_KEPT && sign.mesh.material.map === sign.texture));

        // (The tavern's board: a name no other has)
        const board = drawn.signs.find(({ mesh }) => mesh.material.name.startsWith("board ") && mesh.material.name !== "board guild");
        const small = board.texture;
        let gone = 0;

        assert.deepEqual([small.image.width, small.image.height], [512, 83]);
        small.addEventListener("dispose", () => gone++);

        // (Walked up to it: every sign within DETAIL_NEAR painted again as the quality has them,
        // one a frame, what it showed let go of; then, one a frame, those now well off made small)
        const here = [board.at.x, board.at.z];
        const near = lacking(here);
        const far = spare(here);

        assert.ok(near >= 1 && near <= every().length);

        for (let frame = 1; frame <= near; frame++) {
            frames(here, 1);
            assert.equal(lacking(here), near - frame, `frame ${frame}`);
            assert.equal(spare(here), far, "the coarse ones first");
        }

        assert.equal(painted(board), 1);
        assert.deepEqual([board.texture.image.width, board.texture.image.height], [2048, 330]);
        assert.ok(board.mesh.material.map === board.texture && board.texture !== small);
        assert.equal(gone, 1);

        for (let frame = 1; frame <= far; frame++) {
            frames(here, 1);
            assert.equal(spare(here), far - frame);
        }

        // (A little way off again, kept as it is; well off, painted small again)
        const fine = board.texture;

        frames([board.at.x + board.at.radius + DETAIL_NEAR + SIGNS_KEPT - 2, board.at.z], every().length);
        assert.equal(board.texture, fine);
        frames([board.at.x + board.at.radius + DETAIL_NEAR + SIGNS_KEPT + 2, board.at.z], every().length);
        assert.equal(painted(board), 0.25);
        frames(outside, every().length);
        assert.deepEqual([lacking(outside), spare(outside)], [0, 0]);
        assert.deepEqual(drawn.signs.map(painted), drawn.signs.map(() => 0.25));

        // (On a taller screen a quarter's coarser than they're seen from there: a half, those well
        // off painted again; and on Low, where near ones are a half, none finer near)
        SIGN_SCREEN.value = pixelsAcross(2160, 36, 16 / 9);
        assert.equal(lacking(outside, [1, 0.5]), every().length - every().filter((sign) => painted(sign) === 1).length);
        frames(outside, every().length);
        assert.deepEqual(drawn.signs.map(painted), drawn.signs.map(() => 0.5));
        signDetail(QUALITY.low.signs);
        frames(here, every().length);
        assert.deepEqual(drawn.signs.map(painted), drawn.signs.map(() => 0.5), "as they are: no finer on Low");
        signDetail(1);
        SIGN_SCREEN.value = 0;
        chunks.dispose();

        // (A lab's, whose camera goes where it likes: all as the quality has them)
        const lab = new Chunks(world, { undergrowth: 0, farSigns: false });

        lab.fill(...outside, 1);
        assert.deepEqual((await built(lab)).signs.map(painted), drawn.signs.map(() => 1));
        lab.dispose();
    });

'''
s = s[:start] + new + s[end:]
open(p, 'w').write(s)
