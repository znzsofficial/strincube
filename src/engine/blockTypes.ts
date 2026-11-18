/** Save/terrain vocabulary. Importing these keys never loads textures or Three.js. */
const keys = [
  'grass', 'dirt', 'stone', 'wood', 'leaves', 'flower',
  'sand', 'gravel', 'cobblestone', 'stoneBricks', 'planks', 'bricks',
  'whiteWool', 'andesite', 'diorite', 'granite',
  'coalOre', 'ironOre', 'goldOre', 'diamondOre', 'emeraldOre', 'redstoneOre', 'lapisOre',
  'blackstone', 'basalt', 'bedrock', 'bookshelf',
  'birchLog', 'birchPlanks', 'acaciaLog', 'acaciaPlanks',
  'bambooBlock', 'bambooPlanks', 'amethystBlock', 'blueWool', 'blackWool', 'water',
  'shortGrass', 'fern', 'deadBush', 'dandelion', 'poppy', 'allium', 'blueOrchid',
  'deepslate', 'deepslateBricks', 'deepslateTiles', 'polishedDeepslate',
  'darkOakLog', 'darkOakPlanks', 'darkOakLeaves', 'spruceLog', 'sprucePlanks', 'spruceLeaves', 'birchLeaves',
  'redWool', 'greenWool', 'yellowWool', 'purpleWool', 'pinkWool', 'orangeWool', 'lightBlueWool',
  'limeWool', 'grayWool', 'cyanWool', 'magentaWool', 'brownWool', 'glass', 'tnt',
  'snow', 'clay', 'mossBlock', 'mossyCobblestone', 'mossyStoneBricks', 'sandstone', 'redSand', 'copperOre', 'copperBlock',
  'jungleLog', 'junglePlanks', 'jungleLeaves', 'cherryLog', 'cherryPlanks', 'cherryLeaves', 'oakLog', 'oakPlanks',
  'ice', 'packedIce', 'blueIce', 'coalBlock', 'ironBlock', 'goldBlock', 'diamondBlock', 'emeraldBlock', 'lapisBlock', 'redstoneBlock',
  'calcite', 'dripstone', 'tuff', 'brownMushroom', 'redMushroom', 'cactus', 'pumpkin', 'melon',
  'hay', 'lantern', 'soulLantern', 'torch', 'basicString', 'stringSeaBeacon', 'topologicalRing', 'crystalCore',
  'catTreat', 'idealCoin', 'purpleCatTreat', 'dice', 'itemFrame', 'riverPebbles',
] as const;

export type BlockType = typeof keys[number];
const known = new Set<string>(keys);
export const isBlockType = (v: unknown): v is BlockType => typeof v === 'string' && known.has(v);
