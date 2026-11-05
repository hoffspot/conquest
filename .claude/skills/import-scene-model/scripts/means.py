# Each texture's mean colour in linear light (0 to 1), from its sRGB pixels: what a material drawn
# with it averages to, for a stand-in's colour or a tint (world/keepkit.js KIT_PICTURES' `mean`).
# With the pipeline's Blender Python, from the repository's root:
#   utilities/blenderpipeline/.venv/bin/python -I .claude/skills/import-scene-model/scripts/means.py -- texture.tga [...]
import bpy, sys
import numpy as np
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
for path in args:
    image = bpy.data.images.load(path)
    image.colorspace_settings.name = "Non-Color"
    px = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)[:, :3]
    lin = np.where(px <= 0.04045, px / 12.92, ((px + 0.055) / 1.055) ** 2.4)
    print(path.split("/")[-1], image.size[:], [round(float(v), 4) for v in lin.mean(axis=0)])
