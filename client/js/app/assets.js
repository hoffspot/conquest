// Made by scripts/build-manifest.js (npm run build:manifest) from client/models/assets.json,
// don't edit: the models the game downloads only as they're wanted (not before it starts: that's
// manifest.js), each file with its size in bytes and a hash of its bytes, fetched as path?h=hash.
// `release` names this release's set of kept files (these and the manifest's data), which the
// page tells the service worker (client/sw.js), so it can let go of what no release in use lists.
// test/manifest.test.js checks it's up to date; generated/asset_streaming_plan.md, section 2,
// says what each field is for.

export const ASSETS = Object.freeze({
    release: "dc3fd0b757",
    models: {
        "dungeon-rock-cave": {
            "tier": "demand",
            "label": "A cave's rock (ambientCG Rock028, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/rock-cave-colour.jpg",
                    "hash": "a1b4fa146a",
                    "bytes": 80290
                },
                {
                    "path": "textures/dungeons/rock-cave-normal.jpg",
                    "hash": "ac9cc28dff",
                    "bytes": 275323
                }
            ]
        },
        "dungeon-ground-cave": {
            "tier": "demand",
            "label": "A cave's floor (ambientCG Ground022, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/ground-cave-colour.jpg",
                    "hash": "2557da5ccd",
                    "bytes": 99238
                },
                {
                    "path": "textures/dungeons/ground-cave-normal.jpg",
                    "hash": "a58a03c89b",
                    "bytes": 284952
                }
            ]
        },
        "dungeon-ground-dug": {
            "tier": "demand",
            "label": "An outlaws' hideout's trodden earth (ambientCG Ground048, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/ground-dug-colour.jpg",
                    "hash": "5f15d17297",
                    "bytes": 113313
                },
                {
                    "path": "textures/dungeons/ground-dug-normal.jpg",
                    "hash": "7d1449ec05",
                    "bytes": 225547
                }
            ]
        },
        "dungeon-rock-dug": {
            "tier": "demand",
            "label": "An outlaws' hideout's rock, dug out (Poly Haven quarry_wall, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/rock-dug-colour.jpg",
                    "hash": "609aa51187",
                    "bytes": 64615
                },
                {
                    "path": "textures/dungeons/rock-dug-normal.jpg",
                    "hash": "37450dc546",
                    "bytes": 147824
                }
            ]
        },
        "dungeon-timber": {
            "tier": "demand",
            "label": "Rough timber, its posts and beams (Poly Haven rough_wood, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/timber-colour.jpg",
                    "hash": "bb19d05572",
                    "bytes": 64708
                },
                {
                    "path": "textures/dungeons/timber-normal.jpg",
                    "hash": "30b0ff278c",
                    "bytes": 92592
                }
            ]
        },
        "dungeon-stone-temple": {
            "tier": "demand",
            "label": "An ancient temple's dressed stone (Poly Haven stone_brick_wall_001, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/stone-temple-colour.jpg",
                    "hash": "1d894bf5d5",
                    "bytes": 66804
                },
                {
                    "path": "textures/dungeons/stone-temple-normal.jpg",
                    "hash": "ac2a1753a2",
                    "bytes": 163079
                }
            ]
        },
        "dungeon-floor-temple": {
            "tier": "demand",
            "label": "An ancient temple's flagstones (Poly Haven large_grey_tiles, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/floor-temple-colour.jpg",
                    "hash": "48e15be912",
                    "bytes": 49322
                },
                {
                    "path": "textures/dungeons/floor-temple-normal.jpg",
                    "hash": "feb9a0be71",
                    "bytes": 45878
                }
            ]
        },
        "dungeon-prop-barrel": {
            "tier": "demand",
            "label": "A barrel (Poly Haven wine_barrel_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/barrel.glb",
                    "hash": "027e749579",
                    "bytes": 393008
                }
            ]
        },
        "dungeon-prop-crate": {
            "tier": "demand",
            "label": "A crate (Poly Haven wooden_crate_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/crate.glb",
                    "hash": "ff5548f51a",
                    "bytes": 206440
                }
            ]
        },
        "dungeon-prop-table": {
            "tier": "demand",
            "label": "A rough table (Poly Haven wooden_table_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/table.glb",
                    "hash": "fdfd716b35",
                    "bytes": 117828
                }
            ]
        },
        "dungeon-prop-fire-pit": {
            "tier": "demand",
            "label": "A fire pit ringed with stones (Poly Haven stone_fire_pit, CC0)",
            "files": [
                {
                    "path": "models/dungeons/fire-pit.glb",
                    "hash": "2577c9689b",
                    "bytes": 272440
                }
            ]
        },
        "dungeon-prop-boulder": {
            "tier": "demand",
            "label": "A fallen rock (Poly Haven moon_rock_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/boulder.glb",
                    "hash": "ee7e62d4f1",
                    "bytes": 145780
                }
            ]
        },
        "dungeon-prop-bust": {
            "tier": "demand",
            "label": "A marble bust on its plinth (Poly Haven marble_bust_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bust.glb",
                    "hash": "35c9adaac9",
                    "bytes": 216976
                }
            ]
        },
        "dungeon-prop-axe": {
            "tier": "demand",
            "label": "A woodsman's axe (Poly Haven wooden_axe, CC0)",
            "files": [
                {
                    "path": "models/dungeons/axe.glb",
                    "hash": "b534980394",
                    "bytes": 67180
                }
            ]
        },
        "dungeon-prop-vase": {
            "tier": "demand",
            "label": "A brass vase, an altar's (Poly Haven brass_vase_04, CC0)",
            "files": [
                {
                    "path": "models/dungeons/vase.glb",
                    "hash": "7f04fc11cf",
                    "bytes": 61056
                }
            ]
        },
        "dungeon-prop-table-plank": {
            "tier": "demand",
            "label": "A plank table (Poly Haven WoodenTable_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/table-plank.glb",
                    "hash": "29a394ec74",
                    "bytes": 174972
                }
            ]
        },
        "dungeon-prop-table-low": {
            "tier": "demand",
            "label": "A low table (Poly Haven small_wooden_table_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/table-low.glb",
                    "hash": "26952e6c73",
                    "bytes": 60180
                }
            ]
        },
        "dungeon-prop-stool": {
            "tier": "demand",
            "label": "A stool (Poly Haven wooden_stool_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/stool.glb",
                    "hash": "939fbc1b45",
                    "bytes": 83736
                }
            ]
        },
        "dungeon-prop-stool-low": {
            "tier": "demand",
            "label": "A low stool (Poly Haven wooden_stool_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/stool-low.glb",
                    "hash": "63e1ca2737",
                    "bytes": 83332
                }
            ]
        },
        "dungeon-prop-stool-folding": {
            "tier": "demand",
            "label": "A folding stool (Poly Haven folding_wooden_stool, CC0)",
            "files": [
                {
                    "path": "models/dungeons/stool-folding.glb",
                    "hash": "05607dada6",
                    "bytes": 95464
                }
            ]
        },
        "dungeon-prop-bench": {
            "tier": "demand",
            "label": "A settle (Poly Haven painted_wooden_bench, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bench.glb",
                    "hash": "2f9bc7092d",
                    "bytes": 60472
                }
            ]
        },
        "dungeon-prop-chair-gothic": {
            "tier": "demand",
            "label": "A tall carved chair (Poly Haven WoodenChair_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/chair-gothic.glb",
                    "hash": "094368065f",
                    "bytes": 301876
                }
            ]
        },
        "dungeon-prop-bookshelf": {
            "tier": "demand",
            "label": "Shelves (Poly Haven wooden_bookshelf_worn, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bookshelf.glb",
                    "hash": "94f7300597",
                    "bytes": 295968
                }
            ]
        },
        "dungeon-prop-shelf": {
            "tier": "demand",
            "label": "A narrow shelf (Poly Haven Shelf_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/shelf.glb",
                    "hash": "0ace7ac831",
                    "bytes": 49188
                }
            ]
        },
        "dungeon-prop-cabinet-gothic": {
            "tier": "demand",
            "label": "A carved cabinet (Poly Haven GothicCabinet_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/cabinet-gothic.glb",
                    "hash": "2a9b49959f",
                    "bytes": 386912
                }
            ]
        },
        "dungeon-prop-ladder": {
            "tier": "demand",
            "label": "A step ladder (Poly Haven wooden_ladder_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/ladder.glb",
                    "hash": "a271c847be",
                    "bytes": 94048
                }
            ]
        },
        "dungeon-prop-barrels": {
            "tier": "demand",
            "label": "Old barrels and a broken one's staves (Poly Haven wooden_barrels_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/barrels.glb",
                    "hash": "62d8951ab0",
                    "bytes": 438672
                }
            ],
            "pieces": {
                "barrel-old": [
                    "wooden_barrels_01_barrel01"
                ],
                "barrel-worn": [
                    "wooden_barrels_01_barrel02"
                ],
                "staves": [
                    "wooden_barrels_01_piece01",
                    "wooden_barrels_01_piece02",
                    "wooden_barrels_01_piece03",
                    "wooden_barrels_01_piece04",
                    "wooden_barrels_01_piece05",
                    "wooden_barrels_01_piece06",
                    "wooden_barrels_01_piece07",
                    "wooden_barrels_01_piece08",
                    "wooden_barrels_01_piece09",
                    "wooden_barrels_01_piece10",
                    "wooden_barrels_01_piece11",
                    "wooden_barrels_01_piece12",
                    "wooden_barrels_01_piece13",
                    "wooden_barrels_01_piece14",
                    "wooden_barrels_01_piece15",
                    "wooden_barrels_01_piece16",
                    "wooden_barrels_01_piece17"
                ]
            }
        },
        "dungeon-prop-crate-long": {
            "tier": "demand",
            "label": "A long crate with rope handles (Poly Haven wooden_crate_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/crate-long.glb",
                    "hash": "66f9c46d3e",
                    "bytes": 207224
                }
            ]
        },
        "dungeon-prop-crate-big": {
            "tier": "demand",
            "label": "An iron-bound chest (Poly Haven wooden_military_crate, CC0)",
            "files": [
                {
                    "path": "models/dungeons/crate-big.glb",
                    "hash": "3d9eb6318c",
                    "bytes": 283184
                }
            ]
        },
        "dungeon-prop-bucket": {
            "tier": "demand",
            "label": "A bucket (Poly Haven wooden_bucket_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bucket.glb",
                    "hash": "28bc58d988",
                    "bytes": 115248
                }
            ]
        },
        "dungeon-prop-bucket-wide": {
            "tier": "demand",
            "label": "A tub (Poly Haven wooden_bucket_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bucket-wide.glb",
                    "hash": "f28638bd2d",
                    "bytes": 158016
                }
            ]
        },
        "dungeon-prop-basket": {
            "tier": "demand",
            "label": "A flat basket (Poly Haven wicker_basket_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/basket.glb",
                    "hash": "de11e75997",
                    "bytes": 119024
                }
            ]
        },
        "dungeon-prop-basket-lidded": {
            "tier": "demand",
            "label": "A lidded basket (Poly Haven wicker_basket_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/basket-lidded.glb",
                    "hash": "106aca5c9a",
                    "bytes": 134784
                }
            ]
        },
        "dungeon-prop-goblets": {
            "tier": "demand",
            "label": "Brass goblets (Poly Haven brass_goblets, CC0)",
            "files": [
                {
                    "path": "models/dungeons/goblets.glb",
                    "hash": "b05600e0d5",
                    "bytes": 190748
                }
            ],
            "pieces": {
                "goblet-a": [
                    "brass_goblet_01"
                ],
                "goblet-b": [
                    "brass_goblet_02"
                ],
                "goblet-c": [
                    "brass_goblet_03"
                ]
            }
        },
        "dungeon-prop-bowl": {
            "tier": "demand",
            "label": "A carved bowl (Poly Haven wooden_bowl_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bowl.glb",
                    "hash": "393bd91ba4",
                    "bytes": 51472
                }
            ]
        },
        "dungeon-prop-bowl-small": {
            "tier": "demand",
            "label": "A small bowl (Poly Haven wooden_bowl_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bowl-small.glb",
                    "hash": "b18c1ecdd4",
                    "bytes": 45812
                }
            ]
        },
        "dungeon-prop-spoon": {
            "tier": "demand",
            "label": "A spoon (Poly Haven wooden_spoon, CC0)",
            "files": [
                {
                    "path": "models/dungeons/spoon.glb",
                    "hash": "dae5b01476",
                    "bytes": 13508
                }
            ]
        },
        "dungeon-prop-plate": {
            "tier": "demand",
            "label": "A wooden plate (Poly Haven carved_wooden_plate, CC0)",
            "files": [
                {
                    "path": "models/dungeons/plate.glb",
                    "hash": "13fbe4260f",
                    "bytes": 25080
                }
            ]
        },
        "dungeon-prop-board": {
            "tier": "demand",
            "label": "A board (Poly Haven wooden_cutting_board, CC0)",
            "files": [
                {
                    "path": "models/dungeons/board.glb",
                    "hash": "bc41deb5ad",
                    "bytes": 33224
                }
            ]
        },
        "dungeon-prop-pot": {
            "tier": "demand",
            "label": "A lidded pot (Poly Haven ceramic_pot, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pot.glb",
                    "hash": "370ead9e28",
                    "bytes": 71028
                }
            ]
        },
        "dungeon-prop-pot-brass": {
            "tier": "demand",
            "label": "A cooking pot (Poly Haven brass_pot_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pot-brass.glb",
                    "hash": "5c31abcd05",
                    "bytes": 59108
                }
            ]
        },
        "dungeon-prop-pot-flat": {
            "tier": "demand",
            "label": "A shallow pot (Poly Haven brass_pot_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pot-flat.glb",
                    "hash": "a775e57955",
                    "bytes": 57280
                }
            ]
        },
        "dungeon-prop-pot-clay": {
            "tier": "demand",
            "label": "A clay pot (Poly Haven planter_pot_clay, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pot-clay.glb",
                    "hash": "ae037bf30c",
                    "bytes": 54636
                }
            ]
        },
        "dungeon-prop-apple": {
            "tier": "demand",
            "label": "An apple (Poly Haven food_apple_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/apple.glb",
                    "hash": "309d9d6c38",
                    "bytes": 25760
                }
            ]
        },
        "dungeon-prop-onion": {
            "tier": "demand",
            "label": "An onion (Poly Haven yellow_onion, CC0)",
            "files": [
                {
                    "path": "models/dungeons/onion.glb",
                    "hash": "a5cd8d6d10",
                    "bytes": 24220
                }
            ]
        },
        "dungeon-prop-sweet-potato": {
            "tier": "demand",
            "label": "A root (Poly Haven sweet_potato, CC0)",
            "files": [
                {
                    "path": "models/dungeons/sweet-potato.glb",
                    "hash": "d0fa315917",
                    "bytes": 14452
                }
            ]
        },
        "dungeon-prop-pomegranate": {
            "tier": "demand",
            "label": "A pomegranate (Poly Haven food_pomegranate_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pomegranate.glb",
                    "hash": "511679e3f2",
                    "bytes": 25320
                }
            ]
        },
        "dungeon-prop-vase-antique": {
            "tier": "demand",
            "label": "A painted vase (Poly Haven antique_ceramic_vase_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/vase-antique.glb",
                    "hash": "d66228fafa",
                    "bytes": 76600
                }
            ]
        },
        "dungeon-prop-vase-tall": {
            "tier": "demand",
            "label": "A tall vase (Poly Haven brass_vase_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/vase-tall.glb",
                    "hash": "eaf2b79978",
                    "bytes": 80576
                }
            ]
        },
        "dungeon-prop-vase-brass": {
            "tier": "demand",
            "label": "A brass ewer (Poly Haven brass_vase_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/vase-brass.glb",
                    "hash": "83d036ed0f",
                    "bytes": 74524
                }
            ]
        },
        "dungeon-prop-vase-small": {
            "tier": "demand",
            "label": "A small vase (Poly Haven brass_vase_03, CC0)",
            "files": [
                {
                    "path": "models/dungeons/vase-small.glb",
                    "hash": "1dd1dad956",
                    "bytes": 51584
                }
            ]
        },
        "dungeon-prop-candlestick": {
            "tier": "demand",
            "label": "A candlestick (Poly Haven wooden_candlestick, CC0)",
            "files": [
                {
                    "path": "models/dungeons/candlestick.glb",
                    "hash": "2459207cd8",
                    "bytes": 80356
                }
            ]
        },
        "dungeon-prop-candleholders": {
            "tier": "demand",
            "label": "Brass candleholders (Poly Haven brass_candleholders, CC0)",
            "files": [
                {
                    "path": "models/dungeons/candleholders.glb",
                    "hash": "7b4102fb07",
                    "bytes": 516552
                }
            ],
            "pieces": {
                "candleholder-a": [
                    "brass_candleholder_01"
                ],
                "candleholder-b": [
                    "brass_candleholder_02"
                ],
                "candleholder-c": [
                    "brass_candleholder_03"
                ]
            }
        },
        "dungeon-prop-lantern": {
            "tier": "demand",
            "label": "A wooden lantern (Poly Haven wooden_lantern_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/lantern.glb",
                    "hash": "8527423a15",
                    "bytes": 124736
                }
            ]
        },
        "dungeon-prop-axe-long": {
            "tier": "demand",
            "label": "A long axe (Poly Haven wooden_axe_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/axe-long.glb",
                    "hash": "9720d92798",
                    "bytes": 49628
                }
            ]
        },
        "dungeon-prop-axe-old": {
            "tier": "demand",
            "label": "An old axe (Poly Haven wooden_axe_03, CC0)",
            "files": [
                {
                    "path": "models/dungeons/axe-old.glb",
                    "hash": "0c00ff9992",
                    "bytes": 61628
                }
            ]
        },
        "dungeon-prop-hatchet": {
            "tier": "demand",
            "label": "A hatchet (Poly Haven hatchet, CC0)",
            "files": [
                {
                    "path": "models/dungeons/hatchet.glb",
                    "hash": "88b35d0c12",
                    "bytes": 73276
                }
            ]
        },
        "dungeon-prop-pickaxe": {
            "tier": "demand",
            "label": "A pickaxe (Poly Haven picke_dirty_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pickaxe.glb",
                    "hash": "2546182cdf",
                    "bytes": 64108
                }
            ]
        },
        "dungeon-prop-spade": {
            "tier": "demand",
            "label": "A spade (Poly Haven rusted_spade_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/spade.glb",
                    "hash": "4e00ff76ae",
                    "bytes": 63256
                }
            ]
        },
        "dungeon-prop-hammer": {
            "tier": "demand",
            "label": "A hammer (Poly Haven cross_pein_hammer, CC0)",
            "files": [
                {
                    "path": "models/dungeons/hammer.glb",
                    "hash": "7ace91df8f",
                    "bytes": 26188
                }
            ]
        },
        "dungeon-prop-mallet": {
            "tier": "demand",
            "label": "A mallet (Poly Haven wooden_hammer_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/mallet.glb",
                    "hash": "f56f26c022",
                    "bytes": 29076
                }
            ]
        },
        "dungeon-prop-saw": {
            "tier": "demand",
            "label": "A saw (Poly Haven handsaw_wood, CC0)",
            "files": [
                {
                    "path": "models/dungeons/saw.glb",
                    "hash": "e8121d2f57",
                    "bytes": 84292
                }
            ]
        },
        "dungeon-prop-estoc": {
            "tier": "demand",
            "label": "A long sword (Poly Haven antique_estoc, CC0)",
            "files": [
                {
                    "path": "models/dungeons/estoc.glb",
                    "hash": "fe59da59b5",
                    "bytes": 89824
                }
            ]
        },
        "dungeon-prop-dagger": {
            "tier": "demand",
            "label": "A dagger and its sheath (Poly Haven ornate_medieval_dagger, CC0)",
            "files": [
                {
                    "path": "models/dungeons/dagger.glb",
                    "hash": "867150c6e9",
                    "bytes": 77420
                }
            ]
        },
        "dungeon-prop-mace": {
            "tier": "demand",
            "label": "A mace (Poly Haven ornate_medieval_mace, CC0)",
            "files": [
                {
                    "path": "models/dungeons/mace.glb",
                    "hash": "2ee40f64fd",
                    "bytes": 106908
                }
            ]
        },
        "dungeon-prop-war-hammer": {
            "tier": "demand",
            "label": "A war hammer (Poly Haven ornate_war_hammer, CC0)",
            "files": [
                {
                    "path": "models/dungeons/war-hammer.glb",
                    "hash": "6ee8d4c012",
                    "bytes": 79416
                }
            ]
        },
        "dungeon-prop-saber": {
            "tier": "demand",
            "label": "A sabre (Poly Haven wooden_handle_saber, CC0)",
            "files": [
                {
                    "path": "models/dungeons/saber.glb",
                    "hash": "56fa8b4384",
                    "bytes": 54584
                }
            ]
        },
        "dungeon-prop-shield-kite": {
            "tier": "demand",
            "label": "A kite shield (Poly Haven kite_shield, CC0)",
            "files": [
                {
                    "path": "models/dungeons/shield-kite.glb",
                    "hash": "59449a02a8",
                    "bytes": 338300
                }
            ]
        },
        "dungeon-prop-statue-gothic": {
            "tier": "demand",
            "label": "A crowned king's statue (Poly Haven gothic_statue, CC0)",
            "files": [
                {
                    "path": "models/dungeons/statue-gothic.glb",
                    "hash": "62bcb24a8f",
                    "bytes": 647020
                }
            ]
        },
        "dungeon-prop-lion-head": {
            "tier": "demand",
            "label": "A bronze lion's head (Poly Haven lion_head, CC0)",
            "files": [
                {
                    "path": "models/dungeons/lion-head.glb",
                    "hash": "5cf7c3abf5",
                    "bytes": 237124
                }
            ]
        },
        "dungeon-prop-bull-head": {
            "tier": "demand",
            "label": "A bronze bull's head (Poly Haven bull_head, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bull-head.glb",
                    "hash": "1c33b021ac",
                    "bytes": 166196
                }
            ]
        },
        "dungeon-prop-horse-head": {
            "tier": "demand",
            "label": "A bronze horse's head (Poly Haven horse_head, CC0)",
            "files": [
                {
                    "path": "models/dungeons/horse-head.glb",
                    "hash": "6c9560af9d",
                    "bytes": 170736
                }
            ]
        },
        "dungeon-prop-cat-statue": {
            "tier": "demand",
            "label": "A stone cat (Poly Haven concrete_cat_statue, CC0)",
            "files": [
                {
                    "path": "models/dungeons/cat-statue.glb",
                    "hash": "458f1e804b",
                    "bytes": 115236
                }
            ]
        },
        "dungeon-prop-boulder-02": {
            "tier": "demand",
            "label": "A heap of broken rock (Poly Haven namaqualand_boulder_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/boulder-02.glb",
                    "hash": "977be577df",
                    "bytes": 362964
                }
            ]
        },
        "dungeon-prop-boulder-03": {
            "tier": "demand",
            "label": "A squared boulder (Poly Haven namaqualand_boulder_03, CC0)",
            "files": [
                {
                    "path": "models/dungeons/boulder-03.glb",
                    "hash": "953a589572",
                    "bytes": 261352
                }
            ]
        },
        "dungeon-prop-boulder-04": {
            "tier": "demand",
            "label": "A lichened boulder (Poly Haven namaqualand_boulder_04, CC0)",
            "files": [
                {
                    "path": "models/dungeons/boulder-04.glb",
                    "hash": "663076bbe3",
                    "bytes": 294976
                }
            ]
        },
        "dungeon-prop-boulder-06": {
            "tier": "demand",
            "label": "A rounded boulder (Poly Haven namaqualand_boulder_06, CC0)",
            "files": [
                {
                    "path": "models/dungeons/boulder-06.glb",
                    "hash": "a45e73c076",
                    "bytes": 335892
                }
            ]
        },
        "dungeon-prop-mossy-rocks": {
            "tier": "demand",
            "label": "Mossy rocks (Poly Haven rock_moss_set_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/mossy-rocks.glb",
                    "hash": "3043e7baee",
                    "bytes": 442392
                }
            ],
            "pieces": {
                "mossrock-a": [
                    "rock_moss_set_01_rock01"
                ],
                "mossrock-b": [
                    "rock_moss_set_01_rock02"
                ],
                "mossrock-c": [
                    "rock_moss_set_01_rock03"
                ],
                "mossrock-d": [
                    "rock_moss_set_01_rock04"
                ],
                "mossrock-e": [
                    "rock_moss_set_01_rock05"
                ],
                "mossrock-f": [
                    "rock_moss_set_01_rock06"
                ]
            }
        },
        "dungeon-prop-mossy-rocks-2": {
            "tier": "demand",
            "label": "Mossy rocks (Poly Haven rock_moss_set_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/mossy-rocks-2.glb",
                    "hash": "50b63810c6",
                    "bytes": 531564
                }
            ],
            "pieces": {
                "mossrock2-a": [
                    "rock_moss_set_02_rock07"
                ],
                "mossrock2-b": [
                    "rock_moss_set_02_rock08"
                ],
                "mossrock2-c": [
                    "rock_moss_set_02_rock09"
                ],
                "mossrock2-d": [
                    "rock_moss_set_02_rock10"
                ],
                "mossrock2-e": [
                    "rock_moss_set_02_rock11"
                ],
                "mossrock2-f": [
                    "rock_moss_set_02_rock12"
                ],
                "mossrock2-g": [
                    "rock_moss_set_02_rock13"
                ]
            }
        },
        "dungeon-prop-rock-a": {
            "tier": "demand",
            "label": "A rock (Poly Haven moon_rock_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-a.glb",
                    "hash": "633f52a0f4",
                    "bytes": 268404
                }
            ]
        },
        "dungeon-prop-rock-b": {
            "tier": "demand",
            "label": "A rock (Poly Haven moon_rock_03, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-b.glb",
                    "hash": "861afab1d0",
                    "bytes": 52500
                }
            ]
        },
        "dungeon-prop-rock-c": {
            "tier": "demand",
            "label": "A rock (Poly Haven moon_rock_04, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-c.glb",
                    "hash": "2a0799d037",
                    "bytes": 53468
                }
            ]
        },
        "dungeon-prop-rock-d": {
            "tier": "demand",
            "label": "A rock (Poly Haven moon_rock_05, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-d.glb",
                    "hash": "16b613993f",
                    "bytes": 57012
                }
            ]
        },
        "dungeon-prop-rock-e": {
            "tier": "demand",
            "label": "A rock (Poly Haven moon_rock_06, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-e.glb",
                    "hash": "6a0da7cffa",
                    "bytes": 53632
                }
            ]
        },
        "dungeon-prop-rock-f": {
            "tier": "demand",
            "label": "A rock (Poly Haven moon_rock_07, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-f.glb",
                    "hash": "c221d354ef",
                    "bytes": 50276
                }
            ]
        },
        "dungeon-prop-rock-flat": {
            "tier": "demand",
            "label": "A flat rock (Poly Haven rock_07, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-flat.glb",
                    "hash": "0ac713aead",
                    "bytes": 84440
                }
            ]
        },
        "dungeon-prop-rock-shard": {
            "tier": "demand",
            "label": "A shard of rock (Poly Haven rock_09, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-shard.glb",
                    "hash": "ae43f3d00d",
                    "bytes": 73856
                }
            ]
        },
        "dungeon-prop-stone": {
            "tier": "demand",
            "label": "A stone (Poly Haven stone_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/stone.glb",
                    "hash": "e0bcdb5f80",
                    "bytes": 79116
                }
            ]
        },
        "dungeon-prop-pebbles": {
            "tier": "demand",
            "label": "Pebbles (Poly Haven namaqualand_stones_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pebbles.glb",
                    "hash": "bfa1ab2a03",
                    "bytes": 72052
                }
            ],
            "pieces": {
                "pebble-a": [
                    "namaqualand_stones_01_a"
                ],
                "pebble-b": [
                    "namaqualand_stones_01_b"
                ],
                "pebble-c": [
                    "namaqualand_stones_01_c"
                ],
                "pebble-d": [
                    "namaqualand_stones_01_d"
                ],
                "pebble-e": [
                    "namaqualand_stones_01_e"
                ]
            }
        },
        "dungeon-prop-stones": {
            "tier": "demand",
            "label": "Stones (Poly Haven namaqualand_rocks_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/stones.glb",
                    "hash": "b2a06f2dc1",
                    "bytes": 70988
                }
            ],
            "pieces": {
                "stone-a": [
                    "namaqualand_rocks_02_a"
                ],
                "stone-b": [
                    "namaqualand_rocks_02_b"
                ],
                "stone-c": [
                    "namaqualand_rocks_02_c"
                ],
                "stone-d": [
                    "namaqualand_rocks_02_d"
                ]
            }
        },
        "dungeon-prop-log": {
            "tier": "demand",
            "label": "A dead log (Poly Haven dead_tree_trunk, CC0)",
            "files": [
                {
                    "path": "models/dungeons/log.glb",
                    "hash": "5f40728594",
                    "bytes": 289828
                }
            ]
        },
        "dungeon-prop-log-big": {
            "tier": "demand",
            "label": "A fallen trunk (Poly Haven dead_tree_trunk_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/log-big.glb",
                    "hash": "0368730bc7",
                    "bytes": 387172
                }
            ]
        },
        "dungeon-prop-root-single": {
            "tier": "demand",
            "label": "An old root (Poly Haven single_root, CC0)",
            "files": [
                {
                    "path": "models/dungeons/root-single.glb",
                    "hash": "033b935154",
                    "bytes": 122344
                }
            ]
        },
        "dungeon-prop-stump": {
            "tier": "demand",
            "label": "A stump (Poly Haven tree_stump_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/stump.glb",
                    "hash": "da30f8854f",
                    "bytes": 393600
                }
            ]
        },
        "dungeon-prop-stump-2": {
            "tier": "demand",
            "label": "A stump (Poly Haven tree_stump_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/stump-2.glb",
                    "hash": "6428c2ff23",
                    "bytes": 398552
                }
            ]
        },
        "dungeon-prop-branches": {
            "tier": "demand",
            "label": "Dry branches (Poly Haven dry_branches_medium_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/branches.glb",
                    "hash": "876a6d1492",
                    "bytes": 209872
                }
            ],
            "pieces": {
                "branches-a": [
                    "dry_branches_medium_01_a"
                ],
                "branches-b": [
                    "dry_branches_medium_01_b"
                ],
                "branches-c": [
                    "dry_branches_medium_01_c"
                ]
            }
        },
        "dungeon-prop-bark": {
            "tier": "demand",
            "label": "Bark (Poly Haven bark_debris_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bark.glb",
                    "hash": "8c220bd95e",
                    "bytes": 222748
                }
            ],
            "pieces": {
                "bark-a": [
                    "bark_debris_01_a"
                ],
                "bark-b": [
                    "bark_debris_01_b"
                ],
                "bark-c": [
                    "bark_debris_01_c"
                ],
                "bark-d": [
                    "bark_debris_01_d"
                ]
            }
        },
        "dungeon-prop-skull": {
            "tier": "demand",
            "label": "A skull (CDmir on OpenGameArt, CC0)",
            "files": [
                {
                    "path": "models/dungeons/skull.glb",
                    "hash": "4586f5bc11",
                    "bytes": 86052
                }
            ]
        },
        "dungeon-prop-bones": {
            "tier": "demand",
            "label": "Skulls and bones (Paul_Wortmann on OpenGameArt, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bones.glb",
                    "hash": "959aff1153",
                    "bytes": 186696
                }
            ],
            "pieces": {
                "skull-worn": [
                    "skull-worn"
                ],
                "skull-side": [
                    "skull-side"
                ],
                "skull-crossbones": [
                    "skull-crossbones"
                ],
                "bone-heap": [
                    "bone-heap"
                ],
                "skull-pile": [
                    "skull-pile"
                ],
                "bone": [
                    "bone"
                ]
            }
        },
        "dungeon-prop-rat": {
            "tier": "demand",
            "label": "A rat (Poly Haven street_rat, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rat.glb",
                    "hash": "b74380aa7b",
                    "bytes": 73748
                }
            ]
        },
        "dungeon-prop-cart": {
            "tier": "demand",
            "label": "A handcart (\"Wooden Cart\" by filip.hans.nyberg on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/cart.glb",
                    "hash": "5d0bd16b68",
                    "bytes": 350728
                }
            ]
        },
        "dungeon-prop-wheelbarrow": {
            "tier": "demand",
            "label": "A wheelbarrow (\"Mining cart medieval\" by tijerin_art on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/wheelbarrow.glb",
                    "hash": "de96a9da1b",
                    "bytes": 150532
                }
            ]
        },
        "dungeon-prop-cauldron": {
            "tier": "demand",
            "label": "A bronze cauldron (the Hunt Museum's Ballyscullion Bronze Cauldron, CC0)",
            "files": [
                {
                    "path": "models/dungeons/cauldron.glb",
                    "hash": "afb38562de",
                    "bytes": 106912
                }
            ]
        },
        "dungeon-prop-chest-old": {
            "tier": "demand",
            "label": "An old chest (\"Old wooden chest\" by Tim0 on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/chest-old.glb",
                    "hash": "bb6a6074b0",
                    "bytes": 219968
                }
            ]
        },
        "dungeon-prop-weapon-rack": {
            "tier": "demand",
            "label": "A weapon rack (\"Medieval weapon rack\" by JosueBorghi on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/weapon-rack.glb",
                    "hash": "435081d328",
                    "bytes": 54480
                }
            ]
        },
        "dungeon-prop-sword": {
            "tier": "demand",
            "label": "A sword (\"Sæbø / Thurmuth sword\" by JohnyNawalony on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/sword.glb",
                    "hash": "5f886583ba",
                    "bytes": 69196
                }
            ]
        },
        "dungeon-prop-pelt": {
            "tier": "demand",
            "label": "A sheepskin (the Hunt Museum's Sheep Skin, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pelt.glb",
                    "hash": "ac09a63097",
                    "bytes": 71220
                }
            ]
        },
        "dungeon-prop-sarcophagus-stone": {
            "tier": "demand",
            "label": "A stone sarcophagus (Minneapolis Institute of Art's Sarcophagus of Prince Yuan Mi, CC0)",
            "files": [
                {
                    "path": "models/dungeons/sarcophagus-stone.glb",
                    "hash": "b2d50f1070",
                    "bytes": 271028
                }
            ]
        },
        "dungeon-prop-sarcophagus-painted": {
            "tier": "demand",
            "label": "A painted coffin (\"Sarcophagus of Hunefer\" by The Fitzwilliam Museum on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/sarcophagus-painted.glb",
                    "hash": "4bba0e3152",
                    "bytes": 224700
                }
            ]
        },
        "dungeon-prop-guardian": {
            "tier": "demand",
            "label": "A winged guardian (the Smithsonian's Kneeling Winged Monster, CC0)",
            "files": [
                {
                    "path": "models/dungeons/guardian.glb",
                    "hash": "92b040bbe0",
                    "bytes": 326512
                }
            ]
        },
        "dungeon-prop-urn-face": {
            "tier": "demand",
            "label": "An urn (the Archaeological Museum in Kraków's Face urn (Virtual Małopolska), CC0)",
            "files": [
                {
                    "path": "models/dungeons/urn-face.glb",
                    "hash": "4151bb9c7e",
                    "bytes": 221624
                }
            ]
        },
        "dungeon-prop-urn-carved": {
            "tier": "demand",
            "label": "A carved urn (\"Urn (cinerarium)\" by The Fitzwilliam Museum on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/urn-carved.glb",
                    "hash": "de5b9b8891",
                    "bytes": 77572
                }
            ]
        },
        "dungeon-prop-bronze-vessel": {
            "tier": "demand",
            "label": "A bronze vessel (the Smithsonian's Square lidded ritual wine container (fangyi), CC0)",
            "files": [
                {
                    "path": "models/dungeons/bronze-vessel.glb",
                    "hash": "f550d9558e",
                    "bytes": 178864
                }
            ]
        },
        "dungeon-prop-basin": {
            "tier": "demand",
            "label": "A clay basin (\"Etruscan brazier\" by GlobalDigitalHeritage on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/basin.glb",
                    "hash": "7520bdddba",
                    "bytes": 166264
                }
            ]
        },
        "dungeon-prop-mushrooms": {
            "tier": "demand",
            "label": "Mushrooms (\"Leponogi Goban Boletus calopus\" by Prirodoslovni_muzej_Slovenije on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/mushrooms.glb",
                    "hash": "6d8e827738",
                    "bytes": 254784
                }
            ]
        },
        "dungeon-prop-fungus": {
            "tier": "demand",
            "label": "Bracket fungus on a branch (\"Some kind of Fungus\" by nebulousflynn on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/fungus.glb",
                    "hash": "ed4075483a",
                    "bytes": 82688
                }
            ]
        },
        "dungeon-prop-wolf-skull": {
            "tier": "demand",
            "label": "A wolf's skull (the Virtual Museums of Małopolska's wolf skull, CC0)",
            "files": [
                {
                    "path": "models/dungeons/wolf-skull.glb",
                    "hash": "b4ba2dc1b0",
                    "bytes": 301768
                }
            ]
        },
        "dungeon-prop-bear-skull": {
            "tier": "demand",
            "label": "A cave bear's skull (\"Vertebrate: Ursus spelaeus (PRI 50009)\" by Digital Atlas of Ancient Life on Sketchfab, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bear-skull.glb",
                    "hash": "d1a4616306",
                    "bytes": 152620
                }
            ]
        },
        "dungeon-prop-cow-skull": {
            "tier": "demand",
            "label": "A cow's skull (\"Cow Skull\" by IsraelK on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/cow-skull.glb",
                    "hash": "364ddc4965",
                    "bytes": 150020
                }
            ]
        },
        "dungeon-prop-stag-skull": {
            "tier": "demand",
            "label": "A stag's skull (\"Deer Skull - Photoscan\" by Dmitry Schnein on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/stag-skull.glb",
                    "hash": "de15fd13db",
                    "bytes": 150468
                }
            ]
        },
        "dungeon-prop-sheep-skull": {
            "tier": "demand",
            "label": "A ram's skull (\"sheep skull 3D scan\" by Model Thomas (daaanin) on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/sheep-skull.glb",
                    "hash": "c316f54c34",
                    "bytes": 272412
                }
            ]
        },
        "dungeon-prop-ribcage": {
            "tier": "demand",
            "label": "A ribcage (\"Rib Cage_Human Skeleton\" (3DPX-016836) by My Segmenter on NIH 3D, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/ribcage.glb",
                    "hash": "fcf97bb837",
                    "bytes": 49292
                }
            ]
        },
        "dungeon-prop-pelvis": {
            "tier": "demand",
            "label": "A pelvis (the Human Reference Atlas's male pelvis (v1.3), CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/pelvis.glb",
                    "hash": "63f7862949",
                    "bytes": 64964
                }
            ]
        }
    },
});
