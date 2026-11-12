import sys

p = sys.argv[1]
s = open(p).read()
a = s.index('    it("has one whose foe falls look for the next at once", () => {')
b = s.index('    it("draws a weapon within a quarter second of an enemy coming into sight')
new = '''    it("has one whose foe falls look for the next at once", () => {
        // (Five guards in turn, each with another step of the five for its own, in the same fight:
        // each on the next foe the step after its blow's done with, whoever's step that is)
        const after = ["g0", "g1", "g2", "g3", "g4"].map((id) => {
            const battle = new Battle(open(60), { seed: 5 });

            guard(battle, id, [20, 30], { armed: true, power: { melee: 50 } });
            battle.add({ id: "first", kind: "soldier", team: "b", weapon: "sword", square: [21, 30], hp: 5 });
            battle.add({ id: "second", kind: "soldier", team: "b", weapon: "sword", square: [20, 34], hp: 500 });

            let fell = false;

            for (let t = 0; t < 5000 && !fell; t += STEP_MS) {
                fell = battle.advance(STEP_MS).some((event) => event.type === "death" && event.id === "first");
            }

            assert.ok(fell, "the first falls");
            assert.equal(battle.actor(id).target, null);

            while (battle.actor(id).attack) {
                battle.advance(STEP_MS);
            }

            battle.advance(STEP_MS);
            assert.equal(battle.actor(id).target, "second", `${id} on the next, the step after`);

            return battle.time;
        });

        assert.equal(new Set(after).size, 1, "the same step for each");
    });

'''
s = s[:a] + new + s[b:]
open(p, "w").write(s)
