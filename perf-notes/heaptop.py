import re,sys
f=sys.argv[1]; maxlvl=int(sys.argv[2]) if len(sys.argv)>2 else 8; minmb=float(sys.argv[3]) if len(sys.argv)>3 else 3
on=False
for line in open(f):
    if line.startswith('Who holds it'): on=True; continue
    if line.startswith('Biggest single'): break
    if not on: continue
    m=re.match(r'^\s*([0-9.]+)  (\s*)\.(.*)$', line.rstrip('\n'))
    if not m: continue
    mb=float(m.group(1)); lvl=len(m.group(2))//2; rest=m.group(3)
    if lvl<=maxlvl and mb>=minmb and not rest.startswith(('table →','buffer →','backing_store')):
        print(f'{mb:7.1f} {"  "*lvl}{rest[:110]}')
