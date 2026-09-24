// The 3D models that replace the sprites (drawn by units3d.js). Credits: client/models/CREDITS.md
//
// For each model:
//   file        the model in client/models (or files: one per team, for team-coloured textures)
//   footprint   how big it is drawn, in world pixels: a number is the length of a unit's longest
//               side; [width, depth] fits a building to its base area
//   facing      which way the model's front points in its file ("-x", "+x", "-z" or "+z"), so it
//               can be turned to face north (direction 0)
//   recolour    materials drawn in the team colour (keeping each material's own lightness)
//   tint        tint the whole model with the team colour (for models with one shared texture)
//   altitude    aircraft fly this many pixels above their shadow, as their sprites did
//   spin        parts that spin, such as rotors: [{ node, axis, turnsPerSecond }]
//   aim         a part that turns on its own towards the unit's direction (the turret's gun)
//
// Units and buildings without a model (such as the oil field) keep their sprites.

export const MODELS = {
    "vehicles/heavy-tank": { file: "heavy-tank.glb", footprint: 28, facing: "-x", recolour: ["Main", "Main_Light", "Main_Dark"] },
    "vehicles/scout-tank": { file: "scout-tank.glb", footprint: 22, facing: "-x", recolour: ["Main", "Main_Light", "Main_Dark"] },
    "vehicles/harvester": { file: "harvester.glb", footprint: 22, facing: "+z", tint: true },
    "vehicles/transport": { file: "transport.glb", footprint: 30, facing: "+z", tint: true },
    "aircraft/chopper": {
        file: "chopper.glb",
        footprint: 34,
        facing: "+z",
        tint: true,
        altitude: 40,
        spin: [{ node: "Circle_1", axis: "y", turnsPerSecond: 4 }, { node: "Circle.002_7", axis: "x", turnsPerSecond: 6 }],
    },
    "aircraft/wraith": { files: { blue: "wraith-blue.glb", green: "wraith-green.glb" }, footprint: 30, facing: "+z", altitude: 40 },
    "buildings/base": { file: "base.glb", footprint: [40, 40], recolour: ["metalRed"] },
    "buildings/starport": { file: "starport.glb", footprint: [40, 55], recolour: ["metalRed"] },
    "buildings/harvester": { file: "harvester-rig.glb", footprint: [40, 20], recolour: ["metalRed"] },
    "buildings/ground-turret": { file: "ground-turret.glb", footprint: [20, 18], facing: "+z", recolour: ["Orange"], aim: "Turret_Gun_Top" },
};

/** The model for an item, or undefined if it is drawn as a sprite. */
export function modelFor(item) {
    return MODELS[`${item.type}/${item.name}`];
}

/** Every model file, for loading them all up front. */
export function modelFiles() {
    return [...new Set(Object.values(MODELS).flatMap((model) => model.files ? Object.values(model.files) : [model.file]))];
}
