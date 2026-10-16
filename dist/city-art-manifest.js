// Native, reusable city sprites. Source rectangles isolate complete objects in
// unchanged transparent atlases; foot anchors are in pixels within each cell.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const CITY_ART_ASSETS=freeze({
  "grassGround": {
    "path": "./assets/city/grass-ground-8f3e373bcbbd9486.png",
    "width": 1254,
    "height": 1254,
    "sha256": "8f3e373bcbbd9486db276b7a396fb0c5f960a307d4fdbb4e52b7f5f2ac63ae78"
  },
  "architecture": {
    "path": "./assets/city/architecture-fe9b0894a6a0508c.png",
    "width": 1086,
    "height": 1448,
    "sha256": "fe9b0894a6a0508c936c0c6655214182365441808e53a70229c314f496a4d31c"
  },
  "props": {
    "path": "./assets/city/props-a3e6e64adeeda1dc.png",
    "width": 1254,
    "height": 1254,
    "sha256": "a3e6e64adeeda1dc233ae9ede0dff25533ac30856e544011e9691aa869cc0393"
  },
  "vegetation": {
    "path": "./assets/city/vegetation-370544bd42a6596b.png",
    "width": 1254,
    "height": 1254,
    "sha256": "370544bd42a6596b658ed2e1dfbf34b495eecc0dc3503ea218af59d75a3632d9"
  },
  "keepLarge": {
    "path": "./assets/city/keep-62aab9b7778e9aeb.png",
    "width": 1796,
    "height": 876,
    "sha256": "62aab9b7778e9aeb7415c2ae3de242ce256b88c353684ce9a0474e29ece7e358"
  },
  "churchLarge": {
    "path": "./assets/city/church-644b41601a777c15.png",
    "width": 1024,
    "height": 1536,
    "sha256": "644b41601a777c15ae75b783ad19b8b69372ea6164588b4f659daa303eb81d80"
  }
});
export const CITY_ART_SPRITES=freeze({
  "house": {
    "asset": "house",
    "sx": 0,
    "sy": 0,
    "sw": 1254,
    "sh": 1254,
    "footX": 636,
    "footY": 1186,
    "footprintWidth": 997.5,
    "footprintDepth": 475,
    "projectionHeightFactor": 1.025
  },
  "wall": {
    "asset": "wall",
    "sx": 0,
    "sy": 0,
    "sw": 1774,
    "sh": 887,
    "footX": 887,
    "footY": 806,
    "footprintWidth": 1705,
    "footprintDepth": 273,
    "projectionHeightFactor": 1.15
  },
  "keep": {
    "asset": "keepLarge",
    "sx": 0,
    "sy": 0,
    "sw": 1796,
    "sh": 876,
    "footX": 898,
    "footY": 850,
    "footprintWidth": 1760,
    "footprintDepth": 350,
    "projectionHeightFactor": 1.2
  },
  "church": {
    "asset": "churchLarge",
    "sx": 0,
    "sy": 0,
    "sw": 1024,
    "sh": 1536,
    "footX": 552,
    "footY": 1438,
    "footprintWidth": 960,
    "footprintDepth": 350,
    "projectionHeightFactor": 1.2
  },
  "belltower": {
    "asset": "architecture",
    "sx": 196,
    "sy": 484,
    "sw": 211,
    "sh": 502,
    "footX": 106,
    "footY": 490,
    "footprintWidth": 168,
    "footprintDepth": 70,
    "projectionHeightFactor": 1.15
  },
  "wall-vertical": {
    "asset": "architecture",
    "sx": 708,
    "sy": 503,
    "sw": 230,
    "sh": 501,
    "footX": 115,
    "footY": 482,
    "footprintWidth": 155,
    "footprintDepth": 390,
    "projectionHeightFactor": 1.15
  },
  "tower": {
    "asset": "architecture",
    "sx": 150,
    "sy": 982,
    "sw": 250,
    "sh": 466,
    "footX": 124,
    "footY": 445,
    "footprintWidth": 192,
    "footprintDepth": 125,
    "projectionHeightFactor": 1.15
  },
  "ruin": {
    "asset": "architecture",
    "sx": 548,
    "sy": 1048,
    "sw": 538,
    "sh": 390,
    "footX": 272,
    "footY": 359,
    "footprintWidth": 485,
    "footprintDepth": 80,
    "projectionHeightFactor": 1.15
  },
  "fountain": {
    "asset": "props",
    "sx": 130,
    "sy": 2,
    "sw": 487,
    "sh": 466,
    "footX": 243,
    "footY": 458,
    "footprintWidth": 465,
    "footprintDepth": 220,
    "projectionHeightFactor": 1.05
  },
  "statue": {
    "asset": "props",
    "sx": 827,
    "sy": 6,
    "sw": 214,
    "sh": 483,
    "footX": 107,
    "footY": 476,
    "footprintWidth": 197,
    "footprintDepth": 80,
    "projectionHeightFactor": 1.05
  },
  "market": {
    "asset": "props",
    "sx": 114,
    "sy": 484,
    "sw": 535,
    "sh": 405,
    "footX": 267,
    "footY": 381,
    "footprintWidth": 500,
    "footprintDepth": 160,
    "projectionHeightFactor": 1.05
  },
  "lamp": {
    "asset": "props",
    "sx": 865,
    "sy": 487,
    "sw": 174,
    "sh": 415,
    "footX": 86,
    "footY": 411,
    "footprintWidth": 160,
    "footprintDepth": 65,
    "projectionHeightFactor": 1.05
  },
  "cart": {
    "asset": "props",
    "sx": 72,
    "sy": 914,
    "sw": 554,
    "sh": 309,
    "footX": 331,
    "footY": 303,
    "footprintWidth": 485,
    "footprintDepth": 140,
    "projectionHeightFactor": 1.05
  },
  "sewer": {
    "asset": "props",
    "sx": 713,
    "sy": 900,
    "sw": 481,
    "sh": 328,
    "footX": 241,
    "footY": 322,
    "footprintWidth": 460,
    "footprintDepth": 100,
    "projectionHeightFactor": 1.05
  },
  "oak": {
    "asset": "vegetation",
    "sx": 168,
    "sy": 148,
    "sw": 332,
    "sh": 289,
    "footX": 168,
    "footY": 279,
    "footprintWidth": 80,
    "footprintDepth": 40,
    "projectionHeightFactor": 1.05
  },
  "cypress": {
    "asset": "vegetation",
    "sx": 856,
    "sy": 122,
    "sw": 147,
    "sh": 322,
    "footX": 75,
    "footY": 312,
    "footprintWidth": 54,
    "footprintDepth": 35,
    "projectionHeightFactor": 1.05
  },
  "apple": {
    "asset": "vegetation",
    "sx": 161,
    "sy": 533,
    "sw": 365,
    "sh": 280,
    "footX": 188,
    "footY": 271,
    "footprintWidth": 95,
    "footprintDepth": 40,
    "projectionHeightFactor": 1.05
  },
  "shrub": {
    "asset": "vegetation",
    "sx": 753,
    "sy": 545,
    "sw": 362,
    "sh": 289,
    "footX": 185,
    "footY": 277,
    "footprintWidth": 310,
    "footprintDepth": 140,
    "projectionHeightFactor": 1.05
  },
  "ivy": {
    "asset": "vegetation",
    "sx": 189,
    "sy": 892,
    "sw": 315,
    "sh": 287,
    "footX": 158,
    "footY": 278,
    "footprintWidth": 285,
    "footprintDepth": 60,
    "projectionHeightFactor": 1.05
  },
  "rubble": {
    "asset": "vegetation",
    "sx": 735,
    "sy": 973,
    "sw": 415,
    "sh": 199,
    "footX": 212,
    "footY": 192,
    "footprintWidth": 380,
    "footprintDepth": 145,
    "projectionHeightFactor": 1.05
  }
});
