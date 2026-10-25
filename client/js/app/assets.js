// Made by scripts/build-manifest.js (npm run build:manifest) from client/models/assets.json,
// don't edit: the models the game downloads only as they're wanted (not before it starts: that's
// manifest.js), each file with its size in bytes and a hash of its bytes, fetched as path?h=hash.
// `release` names this release's set of kept files (these and the manifest's data), which the
// page tells the service worker (client/sw.js), so it can let go of what no release in use lists.
// test/manifest.test.js checks it's up to date; generated/asset_streaming_plan.md, section 2,
// says what each field is for.

export const ASSETS = Object.freeze({
    release: "fe786012ab",
    models: {
        "dungeon-rock-cave": {
            "tier": "demand",
            "label": "A cave's rock (ambientCG Rock028, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/rock-cave-colour.ktx2",
                    "hash": "e40e48d9ba",
                    "bytes": 73932
                },
                {
                    "path": "textures/dungeons/rock-cave-normal.ktx2",
                    "hash": "bd0c2e356e",
                    "bytes": 341588
                }
            ]
        },
        "dungeon-ground-cave": {
            "tier": "demand",
            "label": "A cave's floor (ambientCG Ground022, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/ground-cave-colour.ktx2",
                    "hash": "a8bcf0ec18",
                    "bytes": 77853
                },
                {
                    "path": "textures/dungeons/ground-cave-normal.ktx2",
                    "hash": "c076b4faf1",
                    "bytes": 337974
                }
            ]
        },
        "dungeon-ground-dug": {
            "tier": "demand",
            "label": "An outlaws' hideout's trodden earth (ambientCG Ground048, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/ground-dug-colour.ktx2",
                    "hash": "148ac69cef",
                    "bytes": 75189
                },
                {
                    "path": "textures/dungeons/ground-dug-normal.ktx2",
                    "hash": "9cfc0fdf84",
                    "bytes": 330692
                }
            ]
        },
        "dungeon-rock-dug": {
            "tier": "demand",
            "label": "An outlaws' hideout's rock, dug out (Poly Haven quarry_wall, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/rock-dug-colour.ktx2",
                    "hash": "d855a98de4",
                    "bytes": 70235
                },
                {
                    "path": "textures/dungeons/rock-dug-normal.ktx2",
                    "hash": "b2cf005f01",
                    "bytes": 330119
                }
            ]
        },
        "dungeon-timber": {
            "tier": "demand",
            "label": "Rough timber, its posts and beams (Poly Haven rough_wood, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/timber-colour.ktx2",
                    "hash": "43c19d50a3",
                    "bytes": 70776
                },
                {
                    "path": "textures/dungeons/timber-normal.ktx2",
                    "hash": "dfc1005f28",
                    "bytes": 292993
                }
            ]
        },
        "dungeon-stone-temple": {
            "tier": "demand",
            "label": "An ancient temple's dressed stone (Poly Haven stone_brick_wall_001, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/stone-temple-colour.ktx2",
                    "hash": "d2f5b31d4f",
                    "bytes": 71067
                },
                {
                    "path": "textures/dungeons/stone-temple-normal.ktx2",
                    "hash": "a8113370f4",
                    "bytes": 331851
                }
            ]
        },
        "dungeon-floor-temple": {
            "tier": "demand",
            "label": "An ancient temple's flagstones (Poly Haven large_grey_tiles, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/floor-temple-colour.ktx2",
                    "hash": "fc8f0a3df1",
                    "bytes": 68164
                },
                {
                    "path": "textures/dungeons/floor-temple-normal.ktx2",
                    "hash": "f54249fcd4",
                    "bytes": 164892
                }
            ]
        },
        "dungeon-prop-barrel": {
            "tier": "demand",
            "label": "A barrel (Poly Haven wine_barrel_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/barrel.glb",
                    "hash": "7f31f6850e",
                    "bytes": 336240
                }
            ]
        },
        "dungeon-prop-crate": {
            "tier": "demand",
            "label": "A crate (Poly Haven wooden_crate_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/crate.glb",
                    "hash": "64859d5ea0",
                    "bytes": 171856
                }
            ]
        },
        "dungeon-prop-table": {
            "tier": "demand",
            "label": "A rough table (Poly Haven wooden_table_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/table.glb",
                    "hash": "ef90ea52e4",
                    "bytes": 88372
                }
            ]
        },
        "dungeon-prop-fire-pit": {
            "tier": "demand",
            "label": "A fire pit ringed with stones (Poly Haven stone_fire_pit, CC0)",
            "files": [
                {
                    "path": "models/dungeons/fire-pit.glb",
                    "hash": "c4bf5d7e55",
                    "bytes": 181832
                }
            ]
        },
        "dungeon-prop-boulder": {
            "tier": "demand",
            "label": "A fallen rock (Poly Haven moon_rock_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/boulder.glb",
                    "hash": "cd4ce0964a",
                    "bytes": 125108
                }
            ]
        },
        "dungeon-prop-bust": {
            "tier": "demand",
            "label": "A marble bust on its plinth (Poly Haven marble_bust_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bust.glb",
                    "hash": "6e26603511",
                    "bytes": 196328
                }
            ]
        },
        "dungeon-prop-axe": {
            "tier": "demand",
            "label": "A woodsman's axe (Poly Haven wooden_axe, CC0)",
            "files": [
                {
                    "path": "models/dungeons/axe.glb",
                    "hash": "ec9bf30477",
                    "bytes": 63124
                }
            ]
        },
        "dungeon-prop-vase": {
            "tier": "demand",
            "label": "A brass vase, an altar's (Poly Haven brass_vase_04, CC0)",
            "files": [
                {
                    "path": "models/dungeons/vase.glb",
                    "hash": "9624444604",
                    "bytes": 60480
                }
            ]
        },
        "dungeon-prop-table-plank": {
            "tier": "demand",
            "label": "A plank table (Poly Haven WoodenTable_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/table-plank.glb",
                    "hash": "31779a2ce4",
                    "bytes": 126824
                }
            ]
        },
        "dungeon-prop-table-low": {
            "tier": "demand",
            "label": "A low table (Poly Haven small_wooden_table_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/table-low.glb",
                    "hash": "9463e4796f",
                    "bytes": 60932
                }
            ]
        },
        "dungeon-prop-stool": {
            "tier": "demand",
            "label": "A stool (Poly Haven wooden_stool_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/stool.glb",
                    "hash": "835d17ca86",
                    "bytes": 71400
                }
            ]
        },
        "dungeon-prop-stool-low": {
            "tier": "demand",
            "label": "A low stool (Poly Haven wooden_stool_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/stool-low.glb",
                    "hash": "8efd52b629",
                    "bytes": 66772
                }
            ]
        },
        "dungeon-prop-stool-folding": {
            "tier": "demand",
            "label": "A folding stool (Poly Haven folding_wooden_stool, CC0)",
            "files": [
                {
                    "path": "models/dungeons/stool-folding.glb",
                    "hash": "f094aaa4a0",
                    "bytes": 86720
                }
            ]
        },
        "dungeon-prop-bench": {
            "tier": "demand",
            "label": "A settle (Poly Haven painted_wooden_bench, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bench.glb",
                    "hash": "c35507a598",
                    "bytes": 53576
                }
            ]
        },
        "dungeon-prop-chair-gothic": {
            "tier": "demand",
            "label": "A tall carved chair (Poly Haven WoodenChair_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/chair-gothic.glb",
                    "hash": "7e9f008967",
                    "bytes": 240728
                }
            ]
        },
        "dungeon-prop-bookshelf": {
            "tier": "demand",
            "label": "Shelves (Poly Haven wooden_bookshelf_worn, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bookshelf.glb",
                    "hash": "071e350762",
                    "bytes": 210464
                }
            ]
        },
        "dungeon-prop-shelf": {
            "tier": "demand",
            "label": "A narrow shelf (Poly Haven Shelf_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/shelf.glb",
                    "hash": "63dcf334eb",
                    "bytes": 40340
                }
            ]
        },
        "dungeon-prop-cabinet-gothic": {
            "tier": "demand",
            "label": "A carved cabinet (Poly Haven GothicCabinet_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/cabinet-gothic.glb",
                    "hash": "9ca3da8a12",
                    "bytes": 337880
                }
            ]
        },
        "dungeon-prop-ladder": {
            "tier": "demand",
            "label": "A step ladder (Poly Haven wooden_ladder_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/ladder.glb",
                    "hash": "e6cc098fc4",
                    "bytes": 89968
                }
            ]
        },
        "dungeon-prop-barrels": {
            "tier": "demand",
            "label": "Old barrels and a broken one's staves (Poly Haven wooden_barrels_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/barrels.glb",
                    "hash": "dc0fe4dabd",
                    "bytes": 426784
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
                    "hash": "42f564dbfd",
                    "bytes": 177448
                }
            ]
        },
        "dungeon-prop-crate-big": {
            "tier": "demand",
            "label": "An iron-bound chest (Poly Haven wooden_military_crate, CC0)",
            "files": [
                {
                    "path": "models/dungeons/crate-big.glb",
                    "hash": "86b05942c7",
                    "bytes": 239848
                }
            ]
        },
        "dungeon-prop-bucket": {
            "tier": "demand",
            "label": "A bucket (Poly Haven wooden_bucket_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bucket.glb",
                    "hash": "f1ac46bcc0",
                    "bytes": 103080
                }
            ]
        },
        "dungeon-prop-bucket-wide": {
            "tier": "demand",
            "label": "A tub (Poly Haven wooden_bucket_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bucket-wide.glb",
                    "hash": "191e44f12c",
                    "bytes": 143608
                }
            ]
        },
        "dungeon-prop-basket": {
            "tier": "demand",
            "label": "A flat basket (Poly Haven wicker_basket_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/basket.glb",
                    "hash": "0bfac29109",
                    "bytes": 116156
                }
            ]
        },
        "dungeon-prop-basket-lidded": {
            "tier": "demand",
            "label": "A lidded basket (Poly Haven wicker_basket_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/basket-lidded.glb",
                    "hash": "de6c3618e4",
                    "bytes": 103856
                }
            ]
        },
        "dungeon-prop-goblets": {
            "tier": "demand",
            "label": "Brass goblets (Poly Haven brass_goblets, CC0)",
            "files": [
                {
                    "path": "models/dungeons/goblets.glb",
                    "hash": "9076db45fd",
                    "bytes": 147632
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
                    "hash": "465513df9e",
                    "bytes": 46464
                }
            ]
        },
        "dungeon-prop-bowl-small": {
            "tier": "demand",
            "label": "A small bowl (Poly Haven wooden_bowl_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bowl-small.glb",
                    "hash": "d11248f810",
                    "bytes": 37912
                }
            ]
        },
        "dungeon-prop-spoon": {
            "tier": "demand",
            "label": "A spoon (Poly Haven wooden_spoon, CC0)",
            "files": [
                {
                    "path": "models/dungeons/spoon.glb",
                    "hash": "38d94fe2f6",
                    "bytes": 14208
                }
            ]
        },
        "dungeon-prop-plate": {
            "tier": "demand",
            "label": "A wooden plate (Poly Haven carved_wooden_plate, CC0)",
            "files": [
                {
                    "path": "models/dungeons/plate.glb",
                    "hash": "843fc9554e",
                    "bytes": 27256
                }
            ]
        },
        "dungeon-prop-board": {
            "tier": "demand",
            "label": "A board (Poly Haven wooden_cutting_board, CC0)",
            "files": [
                {
                    "path": "models/dungeons/board.glb",
                    "hash": "292d2ef07d",
                    "bytes": 31172
                }
            ]
        },
        "dungeon-prop-pot": {
            "tier": "demand",
            "label": "A lidded pot (Poly Haven ceramic_pot, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pot.glb",
                    "hash": "8ecde0854b",
                    "bytes": 65308
                }
            ]
        },
        "dungeon-prop-pot-brass": {
            "tier": "demand",
            "label": "A cooking pot (Poly Haven brass_pot_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pot-brass.glb",
                    "hash": "d7dc6a6d1f",
                    "bytes": 56796
                }
            ]
        },
        "dungeon-prop-pot-flat": {
            "tier": "demand",
            "label": "A shallow pot (Poly Haven brass_pot_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pot-flat.glb",
                    "hash": "6401cac5d8",
                    "bytes": 55184
                }
            ]
        },
        "dungeon-prop-pot-clay": {
            "tier": "demand",
            "label": "A clay pot (Poly Haven planter_pot_clay, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pot-clay.glb",
                    "hash": "187a3b2219",
                    "bytes": 52228
                }
            ]
        },
        "dungeon-prop-apple": {
            "tier": "demand",
            "label": "An apple (Poly Haven food_apple_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/apple.glb",
                    "hash": "476bfaf9fc",
                    "bytes": 23452
                }
            ]
        },
        "dungeon-prop-onion": {
            "tier": "demand",
            "label": "An onion (Poly Haven yellow_onion, CC0)",
            "files": [
                {
                    "path": "models/dungeons/onion.glb",
                    "hash": "48cb7ae584",
                    "bytes": 24656
                }
            ]
        },
        "dungeon-prop-sweet-potato": {
            "tier": "demand",
            "label": "A root (Poly Haven sweet_potato, CC0)",
            "files": [
                {
                    "path": "models/dungeons/sweet-potato.glb",
                    "hash": "e673a5ec82",
                    "bytes": 14368
                }
            ]
        },
        "dungeon-prop-pomegranate": {
            "tier": "demand",
            "label": "A pomegranate (Poly Haven food_pomegranate_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pomegranate.glb",
                    "hash": "8068b71013",
                    "bytes": 23528
                }
            ]
        },
        "dungeon-prop-vase-antique": {
            "tier": "demand",
            "label": "A painted vase (Poly Haven antique_ceramic_vase_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/vase-antique.glb",
                    "hash": "f40d544c0c",
                    "bytes": 67912
                }
            ]
        },
        "dungeon-prop-vase-tall": {
            "tier": "demand",
            "label": "A tall vase (Poly Haven brass_vase_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/vase-tall.glb",
                    "hash": "128e0a3a6d",
                    "bytes": 79504
                }
            ]
        },
        "dungeon-prop-vase-brass": {
            "tier": "demand",
            "label": "A brass ewer (Poly Haven brass_vase_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/vase-brass.glb",
                    "hash": "1d2b8d9a94",
                    "bytes": 67540
                }
            ]
        },
        "dungeon-prop-vase-small": {
            "tier": "demand",
            "label": "A small vase (Poly Haven brass_vase_03, CC0)",
            "files": [
                {
                    "path": "models/dungeons/vase-small.glb",
                    "hash": "0e4e00e2f9",
                    "bytes": 48272
                }
            ]
        },
        "dungeon-prop-candlestick": {
            "tier": "demand",
            "label": "A candlestick (Poly Haven wooden_candlestick, CC0)",
            "files": [
                {
                    "path": "models/dungeons/candlestick.glb",
                    "hash": "86bca99b8a",
                    "bytes": 75796
                }
            ]
        },
        "dungeon-prop-candleholders": {
            "tier": "demand",
            "label": "Brass candleholders (Poly Haven brass_candleholders, CC0)",
            "files": [
                {
                    "path": "models/dungeons/candleholders.glb",
                    "hash": "22d54405b8",
                    "bytes": 257060
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
                    "hash": "65dfbcc337",
                    "bytes": 113396
                }
            ]
        },
        "dungeon-prop-axe-long": {
            "tier": "demand",
            "label": "A long axe (Poly Haven wooden_axe_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/axe-long.glb",
                    "hash": "1e4605f297",
                    "bytes": 47532
                }
            ]
        },
        "dungeon-prop-axe-old": {
            "tier": "demand",
            "label": "An old axe (Poly Haven wooden_axe_03, CC0)",
            "files": [
                {
                    "path": "models/dungeons/axe-old.glb",
                    "hash": "486ef96324",
                    "bytes": 54652
                }
            ]
        },
        "dungeon-prop-hatchet": {
            "tier": "demand",
            "label": "A hatchet (Poly Haven hatchet, CC0)",
            "files": [
                {
                    "path": "models/dungeons/hatchet.glb",
                    "hash": "49ec39bd1b",
                    "bytes": 65852
                }
            ]
        },
        "dungeon-prop-pickaxe": {
            "tier": "demand",
            "label": "A pickaxe (Poly Haven picke_dirty_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pickaxe.glb",
                    "hash": "b0c94519d0",
                    "bytes": 56804
                }
            ]
        },
        "dungeon-prop-spade": {
            "tier": "demand",
            "label": "A spade (Poly Haven rusted_spade_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/spade.glb",
                    "hash": "0ec7499fcd",
                    "bytes": 58288
                }
            ]
        },
        "dungeon-prop-hammer": {
            "tier": "demand",
            "label": "A hammer (Poly Haven cross_pein_hammer, CC0)",
            "files": [
                {
                    "path": "models/dungeons/hammer.glb",
                    "hash": "22ed81c31a",
                    "bytes": 26396
                }
            ]
        },
        "dungeon-prop-mallet": {
            "tier": "demand",
            "label": "A mallet (Poly Haven wooden_hammer_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/mallet.glb",
                    "hash": "f86abb3e36",
                    "bytes": 28956
                }
            ]
        },
        "dungeon-prop-saw": {
            "tier": "demand",
            "label": "A saw (Poly Haven handsaw_wood, CC0)",
            "files": [
                {
                    "path": "models/dungeons/saw.glb",
                    "hash": "64e156546f",
                    "bytes": 69140
                }
            ]
        },
        "dungeon-prop-estoc": {
            "tier": "demand",
            "label": "A long sword (Poly Haven antique_estoc, CC0)",
            "files": [
                {
                    "path": "models/dungeons/estoc.glb",
                    "hash": "634cfd0a17",
                    "bytes": 75552
                }
            ]
        },
        "dungeon-prop-dagger": {
            "tier": "demand",
            "label": "A dagger and its sheath (Poly Haven ornate_medieval_dagger, CC0)",
            "files": [
                {
                    "path": "models/dungeons/dagger.glb",
                    "hash": "02e7c2e586",
                    "bytes": 61508
                }
            ]
        },
        "dungeon-prop-mace": {
            "tier": "demand",
            "label": "A mace (Poly Haven ornate_medieval_mace, CC0)",
            "files": [
                {
                    "path": "models/dungeons/mace.glb",
                    "hash": "c736561d52",
                    "bytes": 90988
                }
            ]
        },
        "dungeon-prop-war-hammer": {
            "tier": "demand",
            "label": "A war hammer (Poly Haven ornate_war_hammer, CC0)",
            "files": [
                {
                    "path": "models/dungeons/war-hammer.glb",
                    "hash": "70e9c70a04",
                    "bytes": 68688
                }
            ]
        },
        "dungeon-prop-saber": {
            "tier": "demand",
            "label": "A sabre (Poly Haven wooden_handle_saber, CC0)",
            "files": [
                {
                    "path": "models/dungeons/saber.glb",
                    "hash": "927feb4b5d",
                    "bytes": 49960
                }
            ]
        },
        "dungeon-prop-shield-kite": {
            "tier": "demand",
            "label": "A kite shield (Poly Haven kite_shield, CC0)",
            "files": [
                {
                    "path": "models/dungeons/shield-kite.glb",
                    "hash": "461388a9d8",
                    "bytes": 238800
                }
            ]
        },
        "dungeon-prop-statue-gothic": {
            "tier": "demand",
            "label": "A crowned king's statue (Poly Haven gothic_statue, CC0)",
            "files": [
                {
                    "path": "models/dungeons/statue-gothic.glb",
                    "hash": "f4cb79f4e6",
                    "bytes": 455296
                }
            ]
        },
        "dungeon-prop-lion-head": {
            "tier": "demand",
            "label": "A bronze lion's head (Poly Haven lion_head, CC0)",
            "files": [
                {
                    "path": "models/dungeons/lion-head.glb",
                    "hash": "cc99a30f87",
                    "bytes": 185592
                }
            ]
        },
        "dungeon-prop-bull-head": {
            "tier": "demand",
            "label": "A bronze bull's head (Poly Haven bull_head, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bull-head.glb",
                    "hash": "e586d52d0e",
                    "bytes": 149172
                }
            ]
        },
        "dungeon-prop-horse-head": {
            "tier": "demand",
            "label": "A bronze horse's head (Poly Haven horse_head, CC0)",
            "files": [
                {
                    "path": "models/dungeons/horse-head.glb",
                    "hash": "aa50a9823d",
                    "bytes": 152904
                }
            ]
        },
        "dungeon-prop-cat-statue": {
            "tier": "demand",
            "label": "A stone cat (Poly Haven concrete_cat_statue, CC0)",
            "files": [
                {
                    "path": "models/dungeons/cat-statue.glb",
                    "hash": "5e21b1dff6",
                    "bytes": 90636
                }
            ]
        },
        "dungeon-prop-boulder-02": {
            "tier": "demand",
            "label": "A heap of broken rock (Poly Haven namaqualand_boulder_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/boulder-02.glb",
                    "hash": "95a964d76c",
                    "bytes": 247844
                }
            ]
        },
        "dungeon-prop-boulder-03": {
            "tier": "demand",
            "label": "A squared boulder (Poly Haven namaqualand_boulder_03, CC0)",
            "files": [
                {
                    "path": "models/dungeons/boulder-03.glb",
                    "hash": "698dae56df",
                    "bytes": 180604
                }
            ]
        },
        "dungeon-prop-boulder-04": {
            "tier": "demand",
            "label": "A lichened boulder (Poly Haven namaqualand_boulder_04, CC0)",
            "files": [
                {
                    "path": "models/dungeons/boulder-04.glb",
                    "hash": "2000146953",
                    "bytes": 193496
                }
            ]
        },
        "dungeon-prop-boulder-06": {
            "tier": "demand",
            "label": "A rounded boulder (Poly Haven namaqualand_boulder_06, CC0)",
            "files": [
                {
                    "path": "models/dungeons/boulder-06.glb",
                    "hash": "59c1afb148",
                    "bytes": 216364
                }
            ]
        },
        "dungeon-prop-mossy-rocks": {
            "tier": "demand",
            "label": "Mossy rocks (Poly Haven rock_moss_set_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/mossy-rocks.glb",
                    "hash": "32e919dd65",
                    "bytes": 391952
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
                    "hash": "0a6ad08773",
                    "bytes": 442212
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
                    "hash": "51f6caf41a",
                    "bytes": 266804
                }
            ]
        },
        "dungeon-prop-rock-b": {
            "tier": "demand",
            "label": "A rock (Poly Haven moon_rock_03, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-b.glb",
                    "hash": "16c4bab31d",
                    "bytes": 48596
                }
            ]
        },
        "dungeon-prop-rock-c": {
            "tier": "demand",
            "label": "A rock (Poly Haven moon_rock_04, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-c.glb",
                    "hash": "0d1c4a480f",
                    "bytes": 48508
                }
            ]
        },
        "dungeon-prop-rock-d": {
            "tier": "demand",
            "label": "A rock (Poly Haven moon_rock_05, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-d.glb",
                    "hash": "d560896a49",
                    "bytes": 53900
                }
            ]
        },
        "dungeon-prop-rock-e": {
            "tier": "demand",
            "label": "A rock (Poly Haven moon_rock_06, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-e.glb",
                    "hash": "557fbe5d49",
                    "bytes": 51576
                }
            ]
        },
        "dungeon-prop-rock-f": {
            "tier": "demand",
            "label": "A rock (Poly Haven moon_rock_07, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-f.glb",
                    "hash": "de0b1f668e",
                    "bytes": 49684
                }
            ]
        },
        "dungeon-prop-rock-flat": {
            "tier": "demand",
            "label": "A flat rock (Poly Haven rock_07, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-flat.glb",
                    "hash": "0f507e4e0e",
                    "bytes": 71032
                }
            ]
        },
        "dungeon-prop-rock-shard": {
            "tier": "demand",
            "label": "A shard of rock (Poly Haven rock_09, CC0)",
            "files": [
                {
                    "path": "models/dungeons/rock-shard.glb",
                    "hash": "d72afb4587",
                    "bytes": 57832
                }
            ]
        },
        "dungeon-prop-stone": {
            "tier": "demand",
            "label": "A stone (Poly Haven stone_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/stone.glb",
                    "hash": "b44591134d",
                    "bytes": 58004
                }
            ]
        },
        "dungeon-prop-pebbles": {
            "tier": "demand",
            "label": "Pebbles (Poly Haven namaqualand_stones_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pebbles.glb",
                    "hash": "e699f14738",
                    "bytes": 71320
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
                    "hash": "8b9301a211",
                    "bytes": 69112
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
                    "hash": "9dc362ad42",
                    "bytes": 189176
                }
            ]
        },
        "dungeon-prop-log-big": {
            "tier": "demand",
            "label": "A fallen trunk (Poly Haven dead_tree_trunk_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/log-big.glb",
                    "hash": "942926a04a",
                    "bytes": 243200
                }
            ]
        },
        "dungeon-prop-root-single": {
            "tier": "demand",
            "label": "An old root (Poly Haven single_root, CC0)",
            "files": [
                {
                    "path": "models/dungeons/root-single.glb",
                    "hash": "87fe94a316",
                    "bytes": 115592
                }
            ]
        },
        "dungeon-prop-stump": {
            "tier": "demand",
            "label": "A stump (Poly Haven tree_stump_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/stump.glb",
                    "hash": "2c8688cc56",
                    "bytes": 213536
                }
            ]
        },
        "dungeon-prop-stump-2": {
            "tier": "demand",
            "label": "A stump (Poly Haven tree_stump_02, CC0)",
            "files": [
                {
                    "path": "models/dungeons/stump-2.glb",
                    "hash": "76492c0130",
                    "bytes": 208392
                }
            ]
        },
        "dungeon-prop-branches": {
            "tier": "demand",
            "label": "Dry branches (Poly Haven dry_branches_medium_01, CC0)",
            "files": [
                {
                    "path": "models/dungeons/branches.glb",
                    "hash": "ab6ae458a7",
                    "bytes": 176936
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
                    "hash": "8ffc0ae848",
                    "bytes": 220280
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
                    "hash": "e6acd8d4b2",
                    "bytes": 72956
                }
            ]
        },
        "dungeon-prop-bones": {
            "tier": "demand",
            "label": "Skulls and bones (Paul_Wortmann on OpenGameArt, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bones.glb",
                    "hash": "08203b9aa6",
                    "bytes": 176008
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
                    "hash": "922a6588c3",
                    "bytes": 69292
                }
            ]
        },
        "dungeon-prop-cart": {
            "tier": "demand",
            "label": "A handcart (\"Wooden Cart\" by filip.hans.nyberg on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/cart.glb",
                    "hash": "5075f6df8d",
                    "bytes": 348000
                }
            ]
        },
        "dungeon-prop-wheelbarrow": {
            "tier": "demand",
            "label": "A wheelbarrow (\"Mining cart medieval\" by tijerin_art on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/wheelbarrow.glb",
                    "hash": "c59b676a15",
                    "bytes": 146804
                }
            ]
        },
        "dungeon-prop-cauldron": {
            "tier": "demand",
            "label": "A bronze cauldron (the Hunt Museum's Ballyscullion Bronze Cauldron, CC0)",
            "files": [
                {
                    "path": "models/dungeons/cauldron.glb",
                    "hash": "db532e3d57",
                    "bytes": 103404
                }
            ]
        },
        "dungeon-prop-chest-old": {
            "tier": "demand",
            "label": "An old chest (\"Old wooden chest\" by Tim0 on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/chest-old.glb",
                    "hash": "4ceadb0870",
                    "bytes": 193152
                }
            ]
        },
        "dungeon-prop-weapon-rack": {
            "tier": "demand",
            "label": "A weapon rack (\"Medieval weapon rack\" by JosueBorghi on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/weapon-rack.glb",
                    "hash": "a4c795b183",
                    "bytes": 55744
                }
            ]
        },
        "dungeon-prop-sword": {
            "tier": "demand",
            "label": "A sword (\"Sæbø / Thurmuth sword\" by JohnyNawalony on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/sword.glb",
                    "hash": "b9fab965ba",
                    "bytes": 63800
                }
            ]
        },
        "dungeon-prop-pelt": {
            "tier": "demand",
            "label": "A sheepskin (the Hunt Museum's Sheep Skin, CC0)",
            "files": [
                {
                    "path": "models/dungeons/pelt.glb",
                    "hash": "b1b288d862",
                    "bytes": 72528
                }
            ]
        },
        "dungeon-prop-sarcophagus-stone": {
            "tier": "demand",
            "label": "A stone sarcophagus (Minneapolis Institute of Art's Sarcophagus of Prince Yuan Mi, CC0)",
            "files": [
                {
                    "path": "models/dungeons/sarcophagus-stone.glb",
                    "hash": "ad34edf877",
                    "bytes": 273172
                }
            ]
        },
        "dungeon-prop-sarcophagus-painted": {
            "tier": "demand",
            "label": "A painted coffin (\"Sarcophagus of Hunefer\" by The Fitzwilliam Museum on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/sarcophagus-painted.glb",
                    "hash": "a0eab7c00a",
                    "bytes": 217476
                }
            ]
        },
        "dungeon-prop-guardian": {
            "tier": "demand",
            "label": "A winged guardian (the Smithsonian's Kneeling Winged Monster, CC0)",
            "files": [
                {
                    "path": "models/dungeons/guardian.glb",
                    "hash": "a51fbe1d5d",
                    "bytes": 260288
                }
            ]
        },
        "dungeon-prop-urn-face": {
            "tier": "demand",
            "label": "An urn (the Archaeological Museum in Kraków's Face urn (Virtual Małopolska), CC0)",
            "files": [
                {
                    "path": "models/dungeons/urn-face.glb",
                    "hash": "a00ff74bb0",
                    "bytes": 224628
                }
            ]
        },
        "dungeon-prop-urn-carved": {
            "tier": "demand",
            "label": "A carved urn (\"Urn (cinerarium)\" by The Fitzwilliam Museum on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/urn-carved.glb",
                    "hash": "9bba57731c",
                    "bytes": 77300
                }
            ]
        },
        "dungeon-prop-bronze-vessel": {
            "tier": "demand",
            "label": "A bronze vessel (the Smithsonian's Square lidded ritual wine container (fangyi), CC0)",
            "files": [
                {
                    "path": "models/dungeons/bronze-vessel.glb",
                    "hash": "cd0b858f83",
                    "bytes": 166532
                }
            ]
        },
        "dungeon-prop-basin": {
            "tier": "demand",
            "label": "A clay basin (\"Etruscan brazier\" by GlobalDigitalHeritage on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/basin.glb",
                    "hash": "8ffaa3fe4e",
                    "bytes": 168440
                }
            ]
        },
        "dungeon-prop-mushrooms": {
            "tier": "demand",
            "label": "Mushrooms (\"Leponogi Goban Boletus calopus\" by Prirodoslovni_muzej_Slovenije on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/mushrooms.glb",
                    "hash": "cb758f07c0",
                    "bytes": 229612
                }
            ]
        },
        "dungeon-prop-fungus": {
            "tier": "demand",
            "label": "Bracket fungus on a branch (\"Some kind of Fungus\" by nebulousflynn on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/fungus.glb",
                    "hash": "62ce8c1a58",
                    "bytes": 78548
                }
            ]
        },
        "dungeon-prop-wolf-skull": {
            "tier": "demand",
            "label": "A wolf's skull (the Virtual Museums of Małopolska's wolf skull, CC0)",
            "files": [
                {
                    "path": "models/dungeons/wolf-skull.glb",
                    "hash": "26a8003ad8",
                    "bytes": 252788
                }
            ]
        },
        "dungeon-prop-bear-skull": {
            "tier": "demand",
            "label": "A cave bear's skull (\"Vertebrate: Ursus spelaeus (PRI 50009)\" by Digital Atlas of Ancient Life on Sketchfab, CC0)",
            "files": [
                {
                    "path": "models/dungeons/bear-skull.glb",
                    "hash": "c48a45cd6d",
                    "bytes": 149968
                }
            ]
        },
        "dungeon-prop-cow-skull": {
            "tier": "demand",
            "label": "A cow's skull (\"Cow Skull\" by IsraelK on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/cow-skull.glb",
                    "hash": "7d3667b6e8",
                    "bytes": 130004
                }
            ]
        },
        "dungeon-prop-stag-skull": {
            "tier": "demand",
            "label": "A stag's skull (\"Deer Skull - Photoscan\" by Dmitry Schnein on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/stag-skull.glb",
                    "hash": "55dbb5a11f",
                    "bytes": 136772
                }
            ]
        },
        "dungeon-prop-sheep-skull": {
            "tier": "demand",
            "label": "A ram's skull (\"sheep skull 3D scan\" by Model Thomas (daaanin) on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/sheep-skull.glb",
                    "hash": "d644ee69bd",
                    "bytes": 267388
                }
            ]
        },
        "dungeon-prop-ribcage": {
            "tier": "demand",
            "label": "A ribcage (\"Rib Cage_Human Skeleton\" (3DPX-016836) by My Segmenter on NIH 3D, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/ribcage.glb",
                    "hash": "74ccc89661",
                    "bytes": 49484
                }
            ]
        },
        "dungeon-prop-pelvis": {
            "tier": "demand",
            "label": "A pelvis (the Human Reference Atlas's male pelvis (v1.3), CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/pelvis.glb",
                    "hash": "98edeec2e7",
                    "bytes": 65008
                }
            ]
        },
        "dungeon-prop-sword-arming": {
            "tier": "demand",
            "label": "An arming sword (\"Arming Sword\" by FlukierJupiter on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/sword-arming.glb",
                    "hash": "0e69768d29",
                    "bytes": 74488
                }
            ]
        },
        "dungeon-prop-sword-long": {
            "tier": "demand",
            "label": "A long sword (\"Long Sword\" by FlukierJupiter on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/sword-long.glb",
                    "hash": "e8cce20d4d",
                    "bytes": 55916
                }
            ]
        },
        "dungeon-prop-claymore": {
            "tier": "demand",
            "label": "A claymore (\"Claymore\" by FlukierJupiter on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/claymore.glb",
                    "hash": "12e5427bdf",
                    "bytes": 102132
                }
            ]
        },
        "dungeon-prop-zweihander": {
            "tier": "demand",
            "label": "A two-handed sword (\"Zweihänder\" by FlukierJupiter on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/zweihander.glb",
                    "hash": "ea8e247f2e",
                    "bytes": 96840
                }
            ]
        },
        "dungeon-prop-sword-chevalier": {
            "tier": "demand",
            "label": "A knight's sword (\"Chevalier Sword\" by rubenve on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/sword-chevalier.glb",
                    "hash": "0eb1c0b6df",
                    "bytes": 153200
                }
            ]
        },
        "dungeon-prop-sword-rack": {
            "tier": "demand",
            "label": "A rack of long swords (\"Long Sword Rack\" by Multipainkiller Studio on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/sword-rack.glb",
                    "hash": "bf260dd4e8",
                    "bytes": 147384
                }
            ]
        },
        "dungeon-prop-grindstone": {
            "tier": "demand",
            "label": "A grindstone (\"Asset03 Medieval Grindstone\" by Margot D. on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/grindstone.glb",
                    "hash": "a0040c7c88",
                    "bytes": 119516
                }
            ]
        },
        "dungeon-prop-barbuta": {
            "tier": "demand",
            "label": "A barbute (\"Barbuta Helmet\" by Multipainkiller Studio on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/barbuta.glb",
                    "hash": "1745fe6fd4",
                    "bytes": 76572
                }
            ]
        },
        "dungeon-prop-barbuta-visored": {
            "tier": "demand",
            "label": "A visored barbute (\"Visored Barbuta Helmet\" by Multipainkiller Studio on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/barbuta-visored.glb",
                    "hash": "4da3f04b82",
                    "bytes": 109492
                }
            ]
        },
        "dungeon-prop-great-helm": {
            "tier": "demand",
            "label": "A great helm (\"Great Helm\" by Ole Gunnar Isager on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/great-helm.glb",
                    "hash": "40ae866129",
                    "bytes": 125092
                }
            ]
        },
        "dungeon-prop-shield-heater": {
            "tier": "demand",
            "label": "A heater shield (\"Heater Shield\" by FlukierJupiter on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/shield-heater.glb",
                    "hash": "89c7e432b8",
                    "bytes": 69824
                }
            ]
        },
        "dungeon-prop-book-open": {
            "tier": "demand",
            "label": "An open book (\"Medieval Open Book 1\" by J0Y on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/book-open.glb",
                    "hash": "1aff107711",
                    "bytes": 68992
                }
            ]
        },
        "dungeon-prop-books": {
            "tier": "demand",
            "label": "A stack of books (\"Medieval Book Stack\" by GetDeadEntertainment on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/books.glb",
                    "hash": "bea8eeca08",
                    "bytes": 212236
                }
            ]
        },
        "dungeon-prop-quill": {
            "tier": "demand",
            "label": "A quill and inkpot (\"Quill\" by FlukierJupiter on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/quill.glb",
                    "hash": "e262cc528b",
                    "bytes": 42568
                }
            ]
        },
        "dungeon-prop-scroll": {
            "tier": "demand",
            "label": "A scroll (\"Scroll\" by FlukierJupiter on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/scroll.glb",
                    "hash": "369b8cbf60",
                    "bytes": 54408
                }
            ]
        },
        "dungeon-prop-hourglass": {
            "tier": "demand",
            "label": "An hourglass (\"Hour Glass\" by FlukierJupiter on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/hourglass.glb",
                    "hash": "9727003f35",
                    "bytes": 110216
                }
            ]
        },
        "dungeon-prop-crystal-ball": {
            "tier": "demand",
            "label": "A crystal ball on its stand (\"Magic crystal ball\" by terpsichore on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/crystal-ball.glb",
                    "hash": "da238e588a",
                    "bytes": 87800
                }
            ]
        },
        "dungeon-prop-globe-celestial": {
            "tier": "demand",
            "label": "A celestial globe (the Virtual Museums of Małopolska's celestial globe, CC0)",
            "files": [
                {
                    "path": "models/dungeons/globe-celestial.glb",
                    "hash": "d5658cec1d",
                    "bytes": 294592
                }
            ]
        },
        "dungeon-prop-alembic": {
            "tier": "demand",
            "label": "An alembic (\"Alembic\" by FlukierJupiter on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/alembic.glb",
                    "hash": "2108da29bb",
                    "bytes": 113628
                }
            ]
        },
        "dungeon-prop-bottle-magic": {
            "tier": "demand",
            "label": "A stoppered flask (\"Magic Bottle 01\" by Multipainkiller Studio on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/bottle-magic.glb",
                    "hash": "71736fe871",
                    "bytes": 101916
                }
            ]
        },
        "dungeon-prop-bottle-magic-2": {
            "tier": "demand",
            "label": "A round flask (\"Magic Bottle 02\" by Multipainkiller Studio on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/bottle-magic-2.glb",
                    "hash": "1dfbf2f726",
                    "bytes": 101552
                }
            ]
        },
        "dungeon-prop-mortar": {
            "tier": "demand",
            "label": "A bronze mortar (the Virtual Museums of Małopolska's pharmaceutical mortar (Wawel Royal Castle), CC0)",
            "files": [
                {
                    "path": "models/dungeons/mortar.glb",
                    "hash": "2a7ad80053",
                    "bytes": 60020
                }
            ]
        },
        "dungeon-prop-albarello": {
            "tier": "demand",
            "label": "An apothecary's jar (the Virtual Museums of Małopolska's apothecary albarello (the Museum of Pharmacy, Kraków), CC0)",
            "files": [
                {
                    "path": "models/dungeons/albarello.glb",
                    "hash": "cc22332d0e",
                    "bytes": 52844
                }
            ]
        },
        "dungeon-prop-hauberk": {
            "tier": "demand",
            "label": "A mail shirt (\"Hauberk\" by askei on Sketchfab, CC BY 4.0)",
            "files": [
                {
                    "path": "models/dungeons/hauberk.glb",
                    "hash": "c76c60fdd1",
                    "bytes": 58576
                }
            ]
        },
        "chest": {
            "tier": "near",
            "label": "A treasure chest, thrown open on a place's spoils (the JMI 3D Toolkit's, MIT)",
            "files": [
                {
                    "path": "models/jmi/chest.glb",
                    "hash": "7bdf812b68",
                    "bytes": 178404
                }
            ]
        },
        "siege-catapult": {
            "tier": "demand",
            "label": "A town's catapult, rolled out against the Behemoth (Kenney's Castle Kit, CC0)",
            "files": [
                {
                    "path": "models/kenney/siege-catapult.glb",
                    "hash": "cc2bc65ade",
                    "bytes": 93716
                }
            ]
        },
        "siege-catapult-wrecked": {
            "tier": "demand",
            "label": "A catapult wrecked (Kenney's Castle Kit, CC0)",
            "files": [
                {
                    "path": "models/kenney/siege-catapult-demolished.glb",
                    "hash": "3da1c1b282",
                    "bytes": 78836
                }
            ]
        },
        "siege-ballista": {
            "tier": "demand",
            "label": "A town's ballista, rolled out against the Behemoth (Kenney's Castle Kit, CC0)",
            "files": [
                {
                    "path": "models/kenney/siege-ballista.glb",
                    "hash": "d3b3c9d481",
                    "bytes": 72164
                }
            ]
        },
        "siege-ballista-wrecked": {
            "tier": "demand",
            "label": "A ballista wrecked (Kenney's Castle Kit, CC0)",
            "files": [
                {
                    "path": "models/kenney/siege-ballista-demolished.glb",
                    "hash": "d7a4ff61b0",
                    "bytes": 62160
                }
            ]
        },
        "basis-transcoder": {
            "tier": "demand",
            "label": "The Basis Universal transcoder, which models' KTX2 textures are read with (Binomial, Apache 2.0)",
            "files": [
                {
                    "path": "vendor/three-r186/addons/libs/basis/basis_transcoder.js",
                    "hash": "8478b5b6d6",
                    "bytes": 57529
                },
                {
                    "path": "vendor/three-r186/addons/libs/basis/basis_transcoder.wasm",
                    "hash": "6cf17dc889",
                    "bytes": 527333
                }
            ]
        },
        "beast-dreadthorn": {
            "tier": "demand",
            "label": "The Dreadthorn (HuyKhoi2407's Dreadthorn Dragon, from Superhive: used with permission; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/dreadthorn.bin",
                    "hash": "84f164271a",
                    "bytes": 5064728
                }
            ]
        },
        "beast-werewolf": {
            "tier": "demand",
            "label": "The werewolf (Werewolf - Mythical Creature, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/werewolf-2.bin",
                    "hash": "22a687b80e",
                    "bytes": 3396100
                }
            ]
        },
        "beast-werewolf-skins": {
            "tier": "demand",
            "label": "The werewolf's other skins: dusk, ash, russet, moonfang and rotten (Werewolf - Mythical Creature, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/werewolf.dusk.bin",
                    "hash": "9a800655fc",
                    "bytes": 222760
                },
                {
                    "path": "models/beasts/werewolf.ash.bin",
                    "hash": "dc97f32a56",
                    "bytes": 253528
                },
                {
                    "path": "models/beasts/werewolf.russet.bin",
                    "hash": "575135eab7",
                    "bytes": 244672
                },
                {
                    "path": "models/beasts/werewolf.moonfang.bin",
                    "hash": "fd74f86d34",
                    "bytes": 380432
                },
                {
                    "path": "models/beasts/werewolf.rotten.bin",
                    "hash": "ce58a9f771",
                    "bytes": 1565632
                }
            ]
        },
        "beast-centipede": {
            "tier": "demand",
            "label": "The centipede (Centipede Monster-V2, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/centipede.bin",
                    "hash": "410241ea10",
                    "bytes": 4492948
                }
            ]
        },
        "beast-ant-monster": {
            "tier": "demand",
            "label": "The Ant Monster (Ant Monster V1b, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/ant-monster.bin",
                    "hash": "2fa9870381",
                    "bytes": 4234780
                }
            ]
        },
        "beast-ant": {
            "tier": "demand",
            "label": "The ant (Ant V2, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/ant.bin",
                    "hash": "39b3992aea",
                    "bytes": 2254056
                }
            ]
        },
        "beast-dungeon-spider": {
            "tier": "demand",
            "label": "The Dungeon Spider (Spider V3, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/dungeon-spider.bin",
                    "hash": "42cdb2e324",
                    "bytes": 3032976
                }
            ]
        },
        "beast-elite-dungeon-spider": {
            "tier": "demand",
            "label": "The Elite Dungeon Spider (Spider V6a, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/elite-dungeon-spider.bin",
                    "hash": "ea51414227",
                    "bytes": 2971936
                }
            ]
        },
        "beast-dungeon-scorpion": {
            "tier": "demand",
            "label": "The Dungeon Scorpion (Scorpion V5d, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/dungeon-scorpion.bin",
                    "hash": "89e5ec6908",
                    "bytes": 3484652
                }
            ]
        },
        "beast-giant-cockroach": {
            "tier": "demand",
            "label": "The Giant Cockroach (Medhue's Cockroach, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/giant-cockroach.bin",
                    "hash": "cf34697680",
                    "bytes": 1659400
                }
            ]
        },
        "beast-dungeon-wasp": {
            "tier": "demand",
            "label": "The Dungeon Wasp (Vespa Titanus Giant Wasp, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/dungeon-wasp.bin",
                    "hash": "800f9e071f",
                    "bytes": 2518248
                }
            ]
        },
        "beast-black-widow": {
            "tier": "demand",
            "label": "The Black Widow (Medhue's Black Widow, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/black-widow.bin",
                    "hash": "061449defd",
                    "bytes": 2743012
                }
            ]
        },
        "beast-greater-demon": {
            "tier": "demand",
            "label": "The Greater Demon (Gloomy Demon, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/greater-demon.bin",
                    "hash": "aeeec643c3",
                    "bytes": 2365312
                }
            ]
        },
        "beast-fiend": {
            "tier": "demand",
            "label": "The Fiend (Monster4, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/fiend.bin",
                    "hash": "a576200042",
                    "bytes": 3821552
                }
            ]
        },
        "beast-fiend-skins": {
            "tier": "demand",
            "label": "The Fiend's other skins: pale and ash (Monster4, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/fiend.pale.bin",
                    "hash": "0355d9921b",
                    "bytes": 175724
                },
                {
                    "path": "models/beasts/fiend.ash.bin",
                    "hash": "25f4cc4790",
                    "bytes": 174108
                }
            ]
        },
        "beast-flayling": {
            "tier": "demand",
            "label": "The Flayling (Monster1, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/flayling.bin",
                    "hash": "28d7bef4d5",
                    "bytes": 1407500
                }
            ]
        },
        "beast-cinder-husk": {
            "tier": "demand",
            "label": "The Cinder Husk (Monster1, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/cinder-husk.bin",
                    "hash": "fa9aa7b74e",
                    "bytes": 1515380
                }
            ]
        },
        "beast-pyre-acolyte": {
            "tier": "demand",
            "label": "The Pyre Acolyte (Monster1, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/pyre-acolyte.bin",
                    "hash": "e857114009",
                    "bytes": 2612428
                }
            ]
        },
        "beast-ossuary-priest": {
            "tier": "demand",
            "label": "The Ossuary Priest (Monster1, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/ossuary-priest.bin",
                    "hash": "fb6f75d80a",
                    "bytes": 2726372
                }
            ]
        },
        "beast-dirge-warden": {
            "tier": "demand",
            "label": "The Dirge Warden (Monster1, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/dirge-warden.bin",
                    "hash": "bb542886ed",
                    "bytes": 2720960
                }
            ]
        },
        "beast-flayed-hierarch": {
            "tier": "demand",
            "label": "The Flayed Hierarch (Monster1, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/flayed-hierarch.bin",
                    "hash": "0378b4ee40",
                    "bytes": 3003804
                }
            ]
        },
        "beast-slag-gorger": {
            "tier": "demand",
            "label": "The Slag Gorger (Monster2, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/slag-gorger.bin",
                    "hash": "ee6d0886f0",
                    "bytes": 2071096
                }
            ]
        },
        "beast-forge-brute": {
            "tier": "demand",
            "label": "The Forge Brute (Monster2, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/forge-brute.bin",
                    "hash": "1512947d94",
                    "bytes": 2206040
                }
            ]
        },
        "beast-chained-glutton": {
            "tier": "demand",
            "label": "The Chained Glutton (Monster2, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/chained-glutton.bin",
                    "hash": "d77306d751",
                    "bytes": 2501552
                }
            ]
        },
        "beast-bloat-gorger": {
            "tier": "demand",
            "label": "The Bloat Gorger (Monster2, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/bloat-gorger.bin",
                    "hash": "b7dfa9c5de",
                    "bytes": 2072488
                }
            ]
        },
        "beast-pit-ravager": {
            "tier": "demand",
            "label": "The Pit Ravager (Monster2, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/pit-ravager.bin",
                    "hash": "ef5d1e2174",
                    "bytes": 2208240
                }
            ]
        },
        "beast-gorger-warlord": {
            "tier": "demand",
            "label": "The Gorger Warlord (Monster2, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/gorger-warlord.bin",
                    "hash": "b7d4a362fb",
                    "bytes": 2854240
                }
            ]
        },
        "beast-kaiju": {
            "tier": "demand",
            "label": "The Kaiju (HuyKhoi2407's Kaiju, bought on Fab: used with the permission its Standard License gives; client/models/beasts/LICENSE.md)",
            "licensed": true,
            "files": [
                {
                    "path": "models/beasts/kaiju.bin",
                    "hash": "d1ca11cfe4",
                    "bytes": 3859268
                }
            ]
        },
        "dungeon-earth-nest": {
            "tier": "demand",
            "label": "An ants' nest's dug earth, scored by their digging (Poly Haven excavated_soil_wall, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/earth-nest-colour.ktx2",
                    "hash": "453f9e1be4",
                    "bytes": 65912
                },
                {
                    "path": "textures/dungeons/earth-nest-normal.ktx2",
                    "hash": "61cbe1e87d",
                    "bytes": 338556
                }
            ]
        },
        "dungeon-ground-nest": {
            "tier": "demand",
            "label": "An ants' nest's trodden red earth, cracked and stony (Poly Haven red_mud_stones, CC0)",
            "files": [
                {
                    "path": "textures/dungeons/ground-nest-colour.ktx2",
                    "hash": "ea189a1f9e",
                    "bytes": 71155
                },
                {
                    "path": "textures/dungeons/ground-nest-normal.ktx2",
                    "hash": "4a6c49cef2",
                    "bytes": 334198
                }
            ]
        }
    },
});
