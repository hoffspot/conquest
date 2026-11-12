import re
import sys

b = open(sys.argv[1]).read()
start = b.index("        const actor = {\n            id,")
end = b.index("        };\n\n        this.actors.push(actor);")
lit = b[start:end]
keys = set(re.findall(r"^            (?:\.\.\.\(\w+ \? \{ )?(\w+)[,:]", lit, re.M))
keys |= {"wards", "tactic", "keep", "lone", "sight"}
names = "actor|target|other|attacker|one|foe|leader|player|by|caster|holder|healer|member|beast|prey|enemy|sought|chased|ally|victim|rider|boss|each|first|on|top|held|taunter|partner|locked|coming|killer|me|a|b|from|last|start|next|follower|hero|unit|soldier|creature|them|whom|owner|mate|fellow|seen|best|nearest|chosen|struck|subject|someone|who"
found = {}
for path in sys.argv[1:]:
    text = open(path).read()
    for m in re.finditer(r"\b(%s)\??\.(\w+)\b(?!\()" % names, text):
        k = m.group(2)
        if k not in keys:
            found.setdefault(k, set()).add(m.group(1))
for k in sorted(found):
    print(k, sorted(found[k])[:6])
print(len(keys), sorted(keys))
