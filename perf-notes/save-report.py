# Save a reviewer's final report (its SubagentHandback call's text, else its last assistant text)
# to findings-<area>.md, without printing it.
import json,sys
src,area=sys.argv[1],sys.argv[2]
last=None; handed=None
for line in open(src, errors='replace'):
    try: o=json.loads(line)
    except Exception: continue
    m=o.get('message') or {}
    if (o.get('type')=='assistant' or m.get('role')=='assistant'):
        c=m.get('content')
        if isinstance(c,str): text=c
        else:
            text='\n'.join(p.get('text','') for p in (c or []) if isinstance(p,dict) and p.get('type')=='text')
            for p in (c or []):
                if isinstance(p,dict) and p.get('type')=='tool_use' and 'andback' in p.get('name',''):
                    inp=p.get('input') or {}
                    handed=max((v for v in inp.values() if isinstance(v,str)), key=len, default=None) or handed
        if text.strip(): last=text
body=handed or last or ''
out=f'findings-{area}.md'
open(out,'w').write(body)
print(out, len(body), 'chars;', body.count('\n'), 'lines;', 'handback' if handed else 'last text')
