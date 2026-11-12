import json
import re
import sys

b = open(sys.argv[1]).read()
start = b.index("        const actor = {\n            id,")
end = b.index("        };\n\n        this.actors.push(actor);")
lit = b[start:end]
keys = set(re.findall(r"^            (?:\.\.\.\(\w+ \? \{ )?(\w+)[,:]", lit, re.M))
seen = {}
for line in open(sys.argv[2]):
    for k, n in json.loads(line).items():
        seen[k] = seen.get(k, 0) + n
extra = {k: n for k, n in seen.items() if k not in keys}
print(len(keys), "in the literal;", len(extra), "more seen:")
print(" ".join(f"{k}:{n}" for k, n in sorted(extra.items(), key=lambda kv: -kv[1])))
