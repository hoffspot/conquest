# Mesh2Motion's source art (CC0)

Test assets for the Blender pipeline: unchanged copies of files from Mesh2Motion's source art,
<https://github.com/Mesh2Motion/mesh2motion-assets>, at commit
`c5b0b6c821dbf2fa1dfe49590a6f431fd9f707ce`, in the same folders, so the animation files still
find the rigs they link to. CC0 1.0 (public domain): see `LICENSE` here.

- `rigs/rig-dragon.blend`, and four of its animations in `rigs/dragon/` (idle, walk, fly-flap,
  fly-glide).
- `rigs/rig-horse.blend`, and all thirteen of its animations in `rigs/horse/` (all but its rest
  pose).
- `3d-models/model-dragon.blend` and `DragonTexture.png`, the dragon unrigged;
  `3d-models/color-palette.png`, the horse's texture.

Mesh2Motion's `3d-models/CC-SA/` folder holds models under another licence (CC BY-SA): none of
them are here.

They're saved by Blender 5.1. Each animation file holds one action, and links its rig in from
`../rig-*.blend`.
