import sys
p = sys.argv[1] + '/docs/GAME.md'
s = open(p).read()
a = '''blocks, trees' shells and smoke, banners and lights), in a pass of its own before the frame's
(`sendSome`, which the view calls each frame): the next of what's waiting put on a layer of its
own with the scene's lights (all of them, so three.js draws each with the shader it has for it
and makes no other), culled by nothing, and drawn into one pixel of the screen's corner, which
the frame then clears; the shadows aren't drawn again for it, and the renderer, the scene and
the meshes are left as they were. It's a pass of its own, and not a frame in which they're
simply not culled, so that none of it counts among what the frame draws (`renderer.info`, which
the view resets after: the labs' and the browser tests' counts of draw calls and triangles are
the frame's alone) and none of it is drawn into the sun's shadows. No more than 2 MB of corners
go a frame (`SEND_SOON`, a mesh with fewer counted a quarter of a megabyte for its pictures), so
'''
b = '''blocks, trees' shells and smoke, banners and lights), in a pass of its own after the frame's
(`sendSome`, which the view calls each frame once it's drawn): the next of what's waiting put on
a layer of its own with the lights the frame's camera sees (all of them, so three.js draws each
with the shader it has for it and makes no other), culled by nothing, and drawn into no pixel at
all (a scissor round none of them), so the picture's as the frame left it; the shadows aren't
drawn again for it, and the renderer, the scene and the meshes are left as they were. It's a
pass of its own, and not a frame in which they're simply not culled, so that none of it counts
among what the frame draws (`renderer.info.render`, put back as the frame left it: the labs' and
the browser tests' counts of draw calls and triangles are the frame's alone) and none of it is
drawn into the sun's shadows. And it comes after the frame, not before: the frame has drawn the
shadow maps its lit shaders read, and a map just made (the first frame's, a lamp's just set to
cast) has nothing in it till then, which the graphics card refuses to draw with
(`GL_INVALID_OPERATION`, the sampler's kind and the picture's at odds). No more than 2 MB of
corners go a frame (`SEND_SOON`, a mesh with fewer counted a quarter of a megabyte for its
pictures), so
'''
assert s.count(a) == 1
s = s.replace(a, b)
a = '''- `test/sending.test.js`: what's newly built drawn once in a pass of its own, 2 MB of it a frame
  in the order it was built: nothing culled, alone with every light, into a pixel (however
  coarsely the picture's drawn), nothing cleared and the shadows not drawn again; the renderer,
  the scene and the meshes as they were after, if the drawing throws too; a mesh with few corners,
'''
b = '''- `test/sending.test.js`: what's newly built drawn once in a pass of its own, 2 MB of it a frame
  in the order it was built: nothing culled, alone with every light the frame's camera sees, into
  no pixel, nothing cleared and the shadows not drawn again; the renderer, its count of what the
  frame drew, the scene and the meshes as they were after, if the drawing throws too; a mesh with
  few corners,
'''
assert s.count(a) == 1
s = s.replace(a, b)
open(p, 'w').write(s)
