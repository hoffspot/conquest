"""Bellhaven's plain back walls dressed (dress.py's placements), in the game's coordinates (its
far model's: y up, its back facing -z), from where its broad plain faces are (faces.mjs):

- its low block's back (z -211, x -93 to 93, y 56 to 79) and sides (x +-93, z -211 to -98);
- its two towers' backs (z -212, x 12 to 37 and -37 to -12, y 79 to 145) and outer sides (x +-37,
  z -212 to -161);
- the recess between them (z -192, x -12 to 12, y 79 to 176).

    python3 backwalls.py > placements.json
"""

import json

BUTTRESS = "SM_Det_WCArchElemContrforce_1"  # 1.79 wide, 6.64 tall, 2.19 out: a buttress with its pinnacle
PILASTER = "SM_Gat_WCArchElemContrforce3_Full_2"  # 1.68 wide, 18.21 tall: a pilaster on its stepped foot
LANCET = "SM_Gat_WCArchElemWindow1_Full"  # 1.07 wide, 7.04 tall: a lancet's tracery
WIDE = "SM_Gat_WCArchElemWindow2_Full"  # 1.45 wide, 6.70 tall
TALL = "SM_Gat_WCArchElemWindow3_Full"  # 1.24 wide, 8.62 tall
CORNICE = "SM_Gat_WCArchElemCornice_2_Full2"  # 9.15 long, 1.41 tall, 0.68 out

places = []


def put(part, face, along, up, plane, scale, pane=False):
    places.append({"part": part, "face": face, "at": [round(along, 3), round(up, 3), plane], "scale": [round(s, 3) for s in scale], "pane": pane})


def cornice(face, start, end, up, plane, size):
    # (A run of cornice from `start` to `end` along the face, at `up`, in as few lengths as fit)
    count = max(1, round((end - start) / (9.15 * size)))
    length = (end - start) / count

    for k in range(count):
        put(CORNICE, face, start + length * (k + 0.5), up, plane, [length / 9.15, size, size])


# The low block's back: buttresses every 22.5 m, a wide lancet between each two, a cornice under
# its top
for k in range(9):
    put(BUTTRESS, "-z", -90 + k * 22.5, 56, -211, [3.6, 3.0, 3.1])

for k in range(8):
    put(WIDE, "-z", -78.75 + k * 22.5, 59.5, -211, [2.4, 2.4, 2.4], pane=True)

cornice("-z", -93, 93, 77.2, -211, 1.3)

# Its sides: buttresses, lancets between
for side, face in ((93, "+x"), (-93, "-x")):
    for k in range(5):
        put(BUTTRESS, face, -205 + k * 25.5, 56, side, [3.6, 3.0, 3.1])

    for k in range(4):
        put(WIDE, face, -192.25 + k * 25.5, 59.5, side, [2.4, 2.4, 2.4], pane=True)

    cornice(face, -211, -98, 77.2, side, 1.3)

# The towers' backs: a pilaster at each edge, two tiers of two lancets, a cornice between the
# tiers and under the top
for sign in (1, -1):
    for edge in (13.85, 35.15):
        put(PILASTER, "-z", sign * edge, 79, -212, [2.2, 2.2, 3.6])

    for x in (20.5, 28.5):
        for foot in (84, 114):
            put(LANCET, "-z", sign * x, foot, -212, [3.3, 3.3, 3.3], pane=True)

    for up in (110.5, 142.6):
        cornice("-z", sign * 15.7 if sign > 0 else -33.3, 33.3 if sign > 0 else -15.7, up, -212, 1.6)

# The towers' outer sides: a pilaster at each end, two tiers of two lancets between
for sign, face in ((1, "+x"), (-1, "-x")):
    for z in (-209.5, -163.5):
        put(PILASTER, face, z, 79, sign * 37, [2.2, 2.2, 3.6])

    for z in (-193, -180):
        for foot in (84, 114):
            put(LANCET, face, z, foot, sign * 37, [3.3, 3.3, 3.3], pane=True)

    for up in (110.5, 142.6):
        cornice(face, -207, -166, up, sign * 37, 1.6)

# The recess between them: a tall lancet low down, three above the towers' tops, a cornice under
# its top
put(TALL, "-z", 0, 92, -192, [3.2, 3.2, 3.2], pane=True)

for x in (-6.5, 0, 6.5):
    put(LANCET, "-z", x, 150, -192, [2.4, 2.4, 2.4], pane=True)

cornice("-z", -12, 12, 172.5, -192, 1.4)

print(json.dumps(places, indent=1))
