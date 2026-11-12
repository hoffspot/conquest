import sys

p = sys.argv[1]
s = open(p).read()
a = s.index("        // (Each still finds its way about twice a second)")
b = s.index('describe("every character of one shape')
new = '''        // (Each still finds its way about twice a second)
        const all = ways.reduce((sum, each) => sum + each, 0);
        const out = ways.indexOf(40);

        assert.ok(all >= 40 * 6 && all <= 40 * 10, `${all} ways in 4 s`);
        // (All of them in the step they set out; from then on each in its own step of the ten,
        // four of the forty a step, where every tenth step had them all)
        assert.ok(out >= 0 && out < 10, "all set out in one step");
        assert.ok(Math.max(...ways.slice(out + 1)) <= 12, `the most in a step after they set out: ${Math.max(...ways.slice(out + 1))}`);
        assert.ok(ways.slice(out + 10).every((each) => each >= 1 && each <= 6), `${ways.slice(out + 10)}`);
    });
});

'''
s = s[:a] + new + s[b:]
open(p, "w").write(s)
