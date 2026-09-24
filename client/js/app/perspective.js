// The angle the game is seen from, shared by the 3D models (units3d.js) and the effects
// (effects.js). The book's artwork looks down at the map from 60° above the horizon.

export const CAMERA_PITCH = Math.PI / 3;

/** How many world pixels up the screen a point at the given height appears. */
export function heightOnScreen(height) {
    return height * Math.cos(CAMERA_PITCH);
}
