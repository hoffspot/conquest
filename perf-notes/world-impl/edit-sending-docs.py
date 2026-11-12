import sys
p = sys.argv[1] + '/docs/GAME.md'
s = open(p).read()
a = '''sent it kept till then. Now what's newly built is drawn once wherever the camera looks
(`sendSoon`: each chunk's meshes as it's shown, each tile of its undergrowth, its buildings as
they're merged, its rocks and its ground drawn again, a sign painted again; the start town's
blocks, trees' shells and smoke, banners and lights): not culled for a frame, the graphics card
throwing away what's out of view for the cost of its corners, once, then culled again as it was.
No more than 2 MB of corners are let through a frame (`SEND_SOON`, a mesh with fewer counted a
quarter of a megabyte for its pictures; `sendSome`, each frame before the view draws), so the
land round the start, all built before the first frame, goes over the first second or so of
play; what the camera does see meanwhile is sent as it always was.
'''
b = '''sent it kept till then. Now what's newly built is drawn once wherever the camera looks
(`sendSoon`: each chunk's meshes as it's shown, each tile of its undergrowth, its buildings as
they're merged, its rocks and its ground drawn again, a sign painted again; the start town's
blocks, trees' shells and smoke, banners and lights), in a pass of its own before the frame's
(`sendSome`, which the view calls each frame): the next of what's waiting put on a layer of its
own with the scene's lights (all of them, so three.js draws each with the shader it has for it
and makes no other), culled by nothing, and drawn into one pixel of the screen's corner, which
the frame then clears; the shadows aren't drawn again for it, and the renderer, the scene and
the meshes are left as they were. It's a pass of its own, and not a frame in which they're
simply not culled, so that none of it counts among what the frame draws (`renderer.info`, which
the view resets after: the labs' and the browser tests' counts of draw calls and triangles are
the frame's alone) and none of it is drawn into the sun's shadows. No more than 2 MB of corners
go a frame (`SEND_SOON`, a mesh with fewer counted a quarter of a megabyte for its pictures), so
the land round the start, all built before the first frame, goes over the first second or so of
play; what the camera does see meanwhile is sent as it always was and takes no turn, what's
hidden (a tile of undergrowth not yet near, a chunk still being drawn) waits till it's shown,
and `view.sentAhead` counts what's gone this way.
'''
assert s.count(a) == 1
s = s.replace(a, b)
a = '''- `test/sending.test.js`: what's newly built let through to the graphics card 2 MB a frame, in
  the order it was built, each drawn once wherever the camera looks and culled again as it was; a
  mesh with few corners, or none left on the page, counted a quarter of a megabyte; no turn for
  one the camera saw meanwhile, one told what it was told before, one that's hidden waited for;
  what's never culled, or seen by no ordinary camera, left alone. `test/chunks.test.js` also: all
  of a chunk it's drawn sent over the frames after, and its ground again, drawn coarser.
'''
b = '''- `test/sending.test.js`: what's newly built drawn once in a pass of its own, 2 MB of it a frame
  in the order it was built: nothing culled, alone with every light, into a pixel (however
  coarsely the picture's drawn), nothing cleared and the shadows not drawn again; the renderer,
  the scene and the meshes as they were after, if the drawing throws too; a mesh with few corners,
  or none left on the page, counted a quarter of a megabyte; no turn for one the camera saw
  meanwhile, one told what it was told before, one that's hidden or in no scene yet waited for,
  one in another scene left to it; what's never culled, or seen by no ordinary camera, left
  alone. `test/chunks.test.js` also: all of a chunk it's drawn sent over the frames after, each
  mesh once, and its ground again, drawn coarser.
'''
assert s.count(a) == 1
s = s.replace(a, b)
open(p, 'w').write(s)
