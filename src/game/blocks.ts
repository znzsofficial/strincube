import * as THREE from 'three';

// Block Type Definition
export type BlockType =
  | 'grass' | 'dirt' | 'stone' | 'wood' | 'leaves' | 'flower'
  | 'sand' | 'gravel' | 'cobblestone' | 'stoneBricks' | 'planks' | 'bricks'
  | 'whiteWool' | 'andesite' | 'diorite' | 'granite'
  | 'coalOre' | 'ironOre' | 'goldOre' | 'diamondOre' | 'emeraldOre' | 'redstoneOre' | 'lapisOre'
  | 'blackstone' | 'basalt' | 'bedrock' | 'bookshelf'
  | 'birchLog' | 'birchPlanks' | 'acaciaLog' | 'acaciaPlanks'
  | 'bambooBlock' | 'bambooPlanks' | 'amethystBlock'
  | 'blueWool' | 'blackWool' | 'water'
  | 'shortGrass' | 'fern' | 'deadBush' | 'dandelion' | 'poppy' | 'allium' | 'blueOrchid'
  | 'deepslate' | 'deepslateBricks' | 'deepslateTiles' | 'polishedDeepslate'
  | 'darkOakLog' | 'darkOakPlanks' | 'darkOakLeaves'
  | 'spruceLog' | 'sprucePlanks' | 'spruceLeaves' | 'birchLeaves'
  | 'redWool' | 'greenWool' | 'yellowWool' | 'purpleWool' | 'pinkWool'
  | 'orangeWool' | 'lightBlueWool' | 'limeWool' | 'grayWool'
  | 'cyanWool' | 'magentaWool' | 'brownWool'
  | 'glass' | 'tnt'
  | 'snow' | 'clay' | 'mossBlock' | 'mossyCobblestone' | 'mossyStoneBricks'
  | 'sandstone' | 'redSand' | 'copperOre' | 'copperBlock'
  | 'jungleLog' | 'junglePlanks' | 'jungleLeaves'
  | 'cherryLog' | 'cherryPlanks' | 'cherryLeaves'
  | 'oakLog' | 'oakPlanks'
  | 'ice' | 'packedIce' | 'blueIce'
  | 'coalBlock' | 'ironBlock' | 'goldBlock' | 'diamondBlock' | 'emeraldBlock' | 'lapisBlock' | 'redstoneBlock'
  | 'calcite' | 'dripstone' | 'tuff'
  | 'brownMushroom' | 'redMushroom' | 'cactus' | 'pumpkin' | 'melon'
  | 'hay' | 'lantern' | 'soulLantern' | 'torch'
  | 'basicString' | 'stringSeaBeacon' | 'topologicalRing' | 'crystalCore'
  | 'catTreat' | 'idealCoin' | 'purpleCatTreat' | 'dice'
  | 'itemFrame';

// Texture Imports
import acaciaLogUrl from '../../assets/minecraft/textures/block/acacia_log.png';
import acaciaLogTopUrl from '../../assets/minecraft/textures/block/acacia_log_top.png';
import acaciaPlanksUrl from '../../assets/minecraft/textures/block/acacia_planks.png';
import alliumUrl from '../../assets/minecraft/textures/block/allium.png';
import amethystBlockUrl from '../../assets/minecraft/textures/block/amethyst_block.png';
import andesiteUrl from '../../assets/minecraft/textures/block/andesite.png';
import blueOrchidUrl from '../../assets/minecraft/textures/block/blue_orchid.png';
import bambooBlockUrl from '../../assets/minecraft/textures/block/bamboo_block.png';
import bambooBlockTopUrl from '../../assets/minecraft/textures/block/bamboo_block_top.png';
import bambooPlanksUrl from '../../assets/minecraft/textures/block/bamboo_planks.png';
import basaltSideUrl from '../../assets/minecraft/textures/block/basalt_side.png';
import basaltTopUrl from '../../assets/minecraft/textures/block/basalt_top.png';
import bedrockUrl from '../../assets/minecraft/textures/block/bedrock.png';
import birchLogUrl from '../../assets/minecraft/textures/block/birch_log.png';
import birchLogTopUrl from '../../assets/minecraft/textures/block/birch_log_top.png';
import birchPlanksUrl from '../../assets/minecraft/textures/block/birch_planks.png';
import blackstoneUrl from '../../assets/minecraft/textures/block/blackstone.png';
import blackWoolUrl from '../../assets/minecraft/textures/block/black_wool.png';
import blueWoolUrl from '../../assets/minecraft/textures/block/blue_wool.png';
import bookshelfUrl from '../../assets/minecraft/textures/block/bookshelf.png';
import bricksUrl from '../../assets/minecraft/textures/block/bricks.png';
import coalOreUrl from '../../assets/minecraft/textures/block/coal_ore.png';
import cobblestoneUrl from '../../assets/minecraft/textures/block/cobblestone.png';
import cornflowerUrl from '../../assets/minecraft/textures/block/cornflower.png';
import dandelionUrl from '../../assets/minecraft/textures/block/dandelion.png';
import deadBushUrl from '../../assets/minecraft/textures/block/dead_bush.png';
import diamondOreUrl from '../../assets/minecraft/textures/block/diamond_ore.png';
import dioriteUrl from '../../assets/minecraft/textures/block/diorite.png';
import dirtUrl from '../../assets/minecraft/textures/block/dirt.png';
import emeraldOreUrl from '../../assets/minecraft/textures/block/emerald_ore.png';
import fernUrl from '../../assets/minecraft/textures/block/fern.png';
import goldOreUrl from '../../assets/minecraft/textures/block/gold_ore.png';
import graniteUrl from '../../assets/minecraft/textures/block/granite.png';
import grassSideOverlayUrl from '../../assets/minecraft/textures/block/grass_block_side_overlay.png';
import grassSideUrl from '../../assets/minecraft/textures/block/grass_block_side.png';
import grassTopUrl from '../../assets/minecraft/textures/block/grass_block_top.png';
import gravelUrl from '../../assets/minecraft/textures/block/gravel.png';
import ironOreUrl from '../../assets/minecraft/textures/block/iron_ore.png';
import lapisOreUrl from '../../assets/minecraft/textures/block/lapis_ore.png';
import oakLeavesUrl from '../../assets/minecraft/textures/block/oak_leaves.png';
import oakLogUrl from '../../assets/minecraft/textures/block/oak_log.png';
import oakLogTopUrl from '../../assets/minecraft/textures/block/oak_log_top.png';
import oakPlanksUrl from '../../assets/minecraft/textures/block/oak_planks.png';
import sandUrl from '../../assets/minecraft/textures/block/sand.png';
import poppyUrl from '../../assets/minecraft/textures/block/poppy.png';
import stoneUrl from '../../assets/minecraft/textures/block/stone.png';
import stoneBricksUrl from '../../assets/minecraft/textures/block/stone_bricks.png';
import redstoneOreUrl from '../../assets/minecraft/textures/block/redstone_ore.png';
import waterStillUrl from '../../assets/minecraft/textures/block/water_still.png';
import whiteWoolUrl from '../../assets/minecraft/textures/block/white_wool.png';
import deepslateUrl from '../../assets/minecraft/textures/block/deepslate.png';
import deepslateTopUrl from '../../assets/minecraft/textures/block/deepslate_top.png';
import deepslateBricksUrl from '../../assets/minecraft/textures/block/deepslate_bricks.png';
import deepslateTilesUrl from '../../assets/minecraft/textures/block/deepslate_tiles.png';
import polishedDeepslateUrl from '../../assets/minecraft/textures/block/polished_deepslate.png';
import darkOakLogUrl from '../../assets/minecraft/textures/block/dark_oak_log.png';
import darkOakLogTopUrl from '../../assets/minecraft/textures/block/dark_oak_log_top.png';
import darkOakPlanksUrl from '../../assets/minecraft/textures/block/dark_oak_planks.png';
import darkOakLeavesUrl from '../../assets/minecraft/textures/block/dark_oak_leaves.png';
import spruceLogUrl from '../../assets/minecraft/textures/block/spruce_log.png';
import spruceLogTopUrl from '../../assets/minecraft/textures/block/spruce_log_top.png';
import sprucePlanksUrl from '../../assets/minecraft/textures/block/spruce_planks.png';
import spruceLeavesUrl from '../../assets/minecraft/textures/block/spruce_leaves.png';
import birchLeavesUrl from '../../assets/minecraft/textures/block/birch_leaves.png';
import redWoolUrl from '../../assets/minecraft/textures/block/red_wool.png';
import greenWoolUrl from '../../assets/minecraft/textures/block/green_wool.png';
import yellowWoolUrl from '../../assets/minecraft/textures/block/yellow_wool.png';
import purpleWoolUrl from '../../assets/minecraft/textures/block/purple_wool.png';
import pinkWoolUrl from '../../assets/minecraft/textures/block/pink_wool.png';
import orangeWoolUrl from '../../assets/minecraft/textures/block/orange_wool.png';
import lightBlueWoolUrl from '../../assets/minecraft/textures/block/light_blue_wool.png';
import limeWoolUrl from '../../assets/minecraft/textures/block/lime_wool.png';
import grayWoolUrl from '../../assets/minecraft/textures/block/gray_wool.png';
import cyanWoolUrl from '../../assets/minecraft/textures/block/cyan_wool.png';
import magentaWoolUrl from '../../assets/minecraft/textures/block/magenta_wool.png';
import brownWoolUrl from '../../assets/minecraft/textures/block/brown_wool.png';
import whiteStainedGlassUrl from '../../assets/minecraft/textures/block/white_stained_glass.png';

// New textures
import snowUrl from '../../assets/minecraft/textures/block/snow.png';
import clayUrl from '../../assets/minecraft/textures/block/clay.png';
import mossBlockUrl from '../../assets/minecraft/textures/block/moss_block.png';
import mossyCobblestoneUrl from '../../assets/minecraft/textures/block/mossy_cobblestone.png';
import mossyStoneBricksUrl from '../../assets/minecraft/textures/block/mossy_stone_bricks.png';
import sandstoneUrl from '../../assets/minecraft/textures/block/sandstone.png';
import sandstoneTopUrl from '../../assets/minecraft/textures/block/sandstone_top.png';
import redSandUrl from '../../assets/minecraft/textures/block/red_sand.png';
import copperOreUrl from '../../assets/minecraft/textures/block/copper_ore.png';
import copperBlockUrl from '../../assets/minecraft/textures/block/copper_block.png';
import jungleLogUrl from '../../assets/minecraft/textures/block/jungle_log.png';
import jungleLogTopUrl from '../../assets/minecraft/textures/block/jungle_log_top.png';
import junglePlanksUrl from '../../assets/minecraft/textures/block/jungle_planks.png';
import jungleLeavesUrl from '../../assets/minecraft/textures/block/jungle_leaves.png';
import cherryLogUrl from '../../assets/minecraft/textures/block/cherry_log.png';
import cherryLogTopUrl from '../../assets/minecraft/textures/block/cherry_log_top.png';
import cherryPlanksUrl from '../../assets/minecraft/textures/block/cherry_planks.png';
import cherryLeavesUrl from '../../assets/minecraft/textures/block/cherry_leaves.png';
import iceUrl from '../../assets/minecraft/textures/block/ice.png';
import packedIceUrl from '../../assets/minecraft/textures/block/packed_ice.png';
import blueIceUrl from '../../assets/minecraft/textures/block/blue_ice.png';
import coalBlockUrl from '../../assets/minecraft/textures/block/coal_block.png';
import ironBlockUrl from '../../assets/minecraft/textures/block/iron_block.png';
import goldBlockUrl from '../../assets/minecraft/textures/block/gold_block.png';
import diamondBlockUrl from '../../assets/minecraft/textures/block/diamond_block.png';
import emeraldBlockUrl from '../../assets/minecraft/textures/block/emerald_block.png';
import lapisBlockUrl from '../../assets/minecraft/textures/block/lapis_block.png';
import redstoneBlockUrl from '../../assets/minecraft/textures/block/redstone_block.png';
import calciteUrl from '../../assets/minecraft/textures/block/calcite.png';
import dripstoneUrl from '../../assets/minecraft/textures/block/dripstone_block.png';
import tuffUrl from '../../assets/minecraft/textures/block/tuff.png';
import brownMushroomUrl from '../../assets/minecraft/textures/block/brown_mushroom.png';
import redMushroomUrl from '../../assets/minecraft/textures/block/red_mushroom.png';
import cactusSideUrl from '../../assets/minecraft/textures/block/cactus_side.png';
import cactusTopUrl from '../../assets/minecraft/textures/block/cactus_top.png';
import pumpkinUrl from '../../assets/minecraft/textures/block/pumpkin_side.png';
import pumpkinTopUrl from '../../assets/minecraft/textures/block/pumpkin_top.png';
import melonUrl from '../../assets/minecraft/textures/block/melon_side.png';
import melonTopUrl from '../../assets/minecraft/textures/block/melon_top.png';
import hayUrl from '../../assets/minecraft/textures/block/hay_block_side.png';
import hayTopUrl from '../../assets/minecraft/textures/block/hay_block_top.png';
import tntSideUrl from '../../assets/minecraft/textures/block/tnt_side.png';
import tntTopUrl from '../../assets/minecraft/textures/block/tnt_top.png';
import tntBottomUrl from '../../assets/minecraft/textures/block/tnt_bottom.png';
import basicStringUrl from '../assets/items/基弦.png';
import stringSeaBeaconUrl from '../assets/items/弦海信标.png';
import topologicalRingUrl from '../assets/items/拓扑晶环.png';
import crystalCoreUrl from '../assets/items/晶核.png';
import catTreatUrl from '../assets/items/猫条.png';
import idealCoinUrl from '../assets/items/理想币.png';
import purpleCatTreatUrl from '../assets/items/紫猫条.png';
import diceUrl from '../assets/items/骰子.png';

// Texture Loading Helpers
export function loadBlockTexture(url: string) {
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  return texture;
}

export function createGrassPlantTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 16, 16);
  ctx.fillStyle = '#6fbd45';
  ctx.fillRect(7, 6, 2, 10);
  ctx.fillRect(4, 9, 2, 7);
  ctx.fillRect(10, 8, 2, 8);
  ctx.fillStyle = '#4f9b38';
  ctx.fillRect(6, 10, 1, 6);
  ctx.fillRect(9, 11, 1, 5);
  ctx.fillStyle = '#8edc5e';
  ctx.fillRect(8, 5, 1, 5);
  ctx.fillRect(3, 10, 1, 5);
  ctx.fillRect(12, 10, 1, 5);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

export function createTorchTextures(): THREE.CanvasTexture[] {
  const make = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    draw(ctx);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
  };

  const px = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };

  const side = make(2, 10, ctx => {
    const wood = [
      ['#1a0e04', '#6a4020'],
      ['#4a2a16', '#1a0e04'],
      ['#8a5530', '#2a1608'],
      ['#3a2010', '#7a4828'],
      ['#1a0e04', '#5a3418'],
      ['#6a4020', '#1a0e04'],
      ['#2a1608', '#8a5530'],
      ['#4a2a16', '#3a2010'],
    ];
    for (let row = 2; row < 10; row++) {
      const c = wood[row - 2];
      px(ctx, 0, row, c[0]);
      px(ctx, 1, row, c[1]);
    }
    px(ctx, 0, 0, '#ff8800'); px(ctx, 1, 0, '#cc4400');
    px(ctx, 0, 1, '#ffaa00'); px(ctx, 1, 1, '#dd5500');
  });

  const top = make(2, 2, ctx => {
    px(ctx, 0, 0, '#ff8800'); px(ctx, 1, 0, '#cc4400');
    px(ctx, 0, 1, '#ffaa00'); px(ctx, 1, 1, '#dd5500');
  });

  const bottom = make(2, 2, ctx => {
    px(ctx, 0, 0, '#1a0e04'); px(ctx, 1, 0, '#5a3418');
    px(ctx, 0, 1, '#5a3418'); px(ctx, 1, 1, '#1a0e04');
  });

  return [side, side, top, bottom, side, side];
}

export function createLanternTextures(): THREE.CanvasTexture[] {
  const make = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    draw(ctx);
    const t = new THREE.CanvasTexture(ctx.getImageData(0, 0, w, h).data.length ? c : c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
  };

  const side = make(6, 7, ctx => {
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, 0, 6, 7);
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(1, 1, 4, 5);
    ctx.fillStyle = '#ffcc33';
    ctx.fillRect(1, 1, 4, 5);
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(2, 2, 2, 3);
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(2, 2, 2, 2);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, 3, 1, 1);
    ctx.fillRect(5, 3, 1, 1);
  });

  const top = make(6, 6, ctx => {
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, 0, 6, 6);
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(1, 1, 4, 4);
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(2, 2, 2, 2);
  });

  const bottom = make(6, 6, ctx => {
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, 0, 6, 6);
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(1, 1, 4, 4);
    ctx.fillStyle = '#ffcc33';
    ctx.fillRect(2, 2, 2, 2);
  });

  return [side, side, top, bottom, side, side];
}

export function createSoulLanternTextures(): THREE.CanvasTexture[] {
  const make = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    draw(ctx);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
  };

  const side = make(6, 7, ctx => {
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, 0, 6, 7);
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(1, 1, 4, 5);
    ctx.fillStyle = '#33aacc';
    ctx.fillRect(1, 1, 4, 5);
    ctx.fillStyle = '#2288aa';
    ctx.fillRect(2, 2, 2, 3);
    ctx.fillStyle = '#55ccee';
    ctx.fillRect(2, 2, 2, 2);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, 3, 1, 1);
    ctx.fillRect(5, 3, 1, 1);
  });

  const top = make(6, 6, ctx => {
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, 0, 6, 6);
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(1, 1, 4, 4);
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(2, 2, 2, 2);
  });

  const bottom = make(6, 6, ctx => {
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, 0, 6, 6);
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(1, 1, 4, 4);
    ctx.fillStyle = '#33aacc';
    ctx.fillRect(2, 2, 2, 2);
  });

  return [side, side, top, bottom, side, side];
}

function makeCoinTexture(draw: (ctx: CanvasRenderingContext2D) => void, size = 16): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

export function createGoldCoinTexture() {
  return makeCoinTexture(ctx => {
    ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.arc(8, 8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#daa520'; ctx.beginPath(); ctx.arc(8, 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(7, 7, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b8860b'; ctx.fillRect(7, 4, 2, 8);
  });
}

export function createSilverCoinTexture() {
  return makeCoinTexture(ctx => {
    ctx.fillStyle = '#6e6e6e'; ctx.beginPath(); ctx.arc(8, 8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a0a0a0'; ctx.beginPath(); ctx.arc(8, 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d0d0d0'; ctx.beginPath(); ctx.arc(7, 7, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6e6e6e'; ctx.fillRect(7, 4, 2, 8);
  });
}

export function createCopperCoinTexture() {
  return makeCoinTexture(ctx => {
    ctx.fillStyle = '#8b4513'; ctx.beginPath(); ctx.arc(8, 8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b87333'; ctx.beginPath(); ctx.arc(8, 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#da8a67'; ctx.beginPath(); ctx.arc(7, 7, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8b4513'; ctx.fillRect(7, 4, 2, 8);
  });
}

export function createEmeraldCoinTexture() {
  return makeCoinTexture(ctx => {
    ctx.fillStyle = '#04630c'; ctx.beginPath(); ctx.arc(8, 8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a8c1a'; ctx.beginPath(); ctx.arc(8, 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#50c878'; ctx.beginPath(); ctx.arc(7, 7, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#04630c'; ctx.fillRect(7, 4, 2, 8);
  });
}

export function createItemFrameTexture() {
  return makeCoinTexture(ctx => {
    ctx.fillStyle = '#8b6914';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#6b4c12';
    ctx.fillRect(0, 0, 64, 8);
    ctx.fillRect(0, 56, 64, 8);
    ctx.fillRect(0, 0, 8, 64);
    ctx.fillRect(56, 0, 8, 64);
    ctx.fillStyle = '#a07818';
    ctx.fillRect(2, 2, 2, 60);
    ctx.fillRect(2, 2, 60, 2);
    ctx.fillStyle = '#f5deb3';
    ctx.fillRect(10, 10, 44, 44);
    ctx.fillStyle = '#e8d09a';
    ctx.fillRect(12, 12, 40, 40);
  }, 64);
}

export function createItemFrameWithItemTexture(itemUrl: string): THREE.CanvasTexture {
  const frame = createItemFrameTexture();
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(frame.image as HTMLCanvasElement, 0, 0);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.drawImage(frame.image as HTMLCanvasElement, 0, 0);
    ctx.drawImage(img, 10, 10, 44, 44);
    texture.needsUpdate = true;
  };
  img.src = itemUrl;
  return texture;
}

// Block Materials
export const blockMaterials = [
  new THREE.MeshLambertMaterial({ color: 0x73b84a, map: loadBlockTexture(grassTopUrl), emissive: 0x14350d, emissiveIntensity: 0.04 }), // 0
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(grassSideUrl), emissive: 0x14350d, emissiveIntensity: 0.02 }), // 1
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(dirtUrl) }), // 2
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(stoneUrl) }), // 3
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(oakLogUrl) }), // 4
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(oakLogTopUrl) }), // 5
  new THREE.MeshLambertMaterial({ color: 0x6fbd55, map: loadBlockTexture(oakLeavesUrl), alphaTest: 0.45, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), // 6
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(cornflowerUrl), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, emissive: 0x5d1530, emissiveIntensity: 0.08 }), // 7
  new THREE.MeshLambertMaterial({ color: 0x73b84a, map: loadBlockTexture(grassSideOverlayUrl), transparent: true, alphaTest: 0.35, emissive: 0x14350d, emissiveIntensity: 0.03 }), // 8
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(sandUrl) }), // 9
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(gravelUrl) }), // 10
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(cobblestoneUrl) }), // 11
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(stoneBricksUrl) }), // 12
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(oakPlanksUrl) }), // 13
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(bricksUrl) }), // 14
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(whiteWoolUrl) }), // 15
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(andesiteUrl) }), // 16
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(dioriteUrl) }), // 17
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(graniteUrl) }), // 18
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(coalOreUrl) }), // 19
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(ironOreUrl) }), // 20
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(goldOreUrl) }), // 21
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(diamondOreUrl) }), // 22
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(emeraldOreUrl) }), // 23
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(redstoneOreUrl) }), // 24
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(lapisOreUrl) }), // 25
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(blackstoneUrl) }), // 26
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(bedrockUrl) }), // 27
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(bookshelfUrl) }), // 28
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(birchLogUrl) }), // 29
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(birchLogTopUrl) }), // 30
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(birchPlanksUrl) }), // 31
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(acaciaLogUrl) }), // 32
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(acaciaLogTopUrl) }), // 33
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(acaciaPlanksUrl) }), // 34
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(bambooBlockUrl) }), // 35
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(bambooBlockTopUrl) }), // 36
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(bambooPlanksUrl) }), // 37
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(amethystBlockUrl) }), // 38
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(blueWoolUrl) }), // 39
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(blackWoolUrl) }), // 40
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(basaltSideUrl) }), // 41
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(basaltTopUrl) }), // 42
  new THREE.MeshLambertMaterial({ color: 0x7dbbff, map: loadBlockTexture(waterStillUrl), transparent: true, opacity: 0.72, depthWrite: false }), // 43
  new THREE.MeshLambertMaterial({ color: 0x74b94f, map: createGrassPlantTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }), // 44
  new THREE.MeshLambertMaterial({ color: 0x4f9d4b, map: loadBlockTexture(fernUrl), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }), // 45
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(deadBushUrl), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }), // 46
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(dandelionUrl), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, emissive: 0x352900, emissiveIntensity: 0.05 }), // 47
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(poppyUrl), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, emissive: 0x3a0705, emissiveIntensity: 0.05 }), // 48
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(alliumUrl), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, emissive: 0x25103c, emissiveIntensity: 0.05 }), // 49
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(blueOrchidUrl), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, emissive: 0x092d3a, emissiveIntensity: 0.05 }), // 50
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(deepslateUrl) }), // 51
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(deepslateTopUrl) }), // 52
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(deepslateBricksUrl) }), // 53
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(deepslateTilesUrl) }), // 54
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(polishedDeepslateUrl) }), // 55
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(darkOakLogUrl) }), // 56
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(darkOakLogTopUrl) }), // 57
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(darkOakPlanksUrl) }), // 58
  new THREE.MeshLambertMaterial({ color: 0x4a7a3a, map: loadBlockTexture(darkOakLeavesUrl), alphaTest: 0.45, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), // 59
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(spruceLogUrl) }), // 60
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(spruceLogTopUrl) }), // 61
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(sprucePlanksUrl) }), // 62
  new THREE.MeshLambertMaterial({ color: 0x3a5c2a, map: loadBlockTexture(spruceLeavesUrl), alphaTest: 0.45, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), // 63
  new THREE.MeshLambertMaterial({ color: 0x6b8f4a, map: loadBlockTexture(birchLeavesUrl), alphaTest: 0.45, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), // 64
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(redWoolUrl) }), // 65
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(greenWoolUrl) }), // 66
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(yellowWoolUrl) }), // 67
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(purpleWoolUrl) }), // 68
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(pinkWoolUrl) }), // 69
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(orangeWoolUrl) }), // 70
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(lightBlueWoolUrl) }), // 71
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(limeWoolUrl) }), // 72
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(grayWoolUrl) }), // 73
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(cyanWoolUrl) }), // 74
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(magentaWoolUrl) }), // 75
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(brownWoolUrl) }), // 76
  new THREE.MeshLambertMaterial({ color: 0xd8f5ff, map: loadBlockTexture(whiteStainedGlassUrl), transparent: true, opacity: 0.42, depthWrite: true, alphaTest: 0.05 }), // 77
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(tntSideUrl) }), // 78 - TNT side
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(tntTopUrl) }), // 79 - TNT top
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(tntBottomUrl) }), // 80 - TNT bottom
  // New blocks
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(snowUrl) }), // 81
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(clayUrl) }), // 82
  new THREE.MeshLambertMaterial({ color: 0x5a8f29, map: loadBlockTexture(mossBlockUrl) }), // 83
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(mossyCobblestoneUrl) }), // 84
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(mossyStoneBricksUrl) }), // 85
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(sandstoneUrl) }), // 86
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(sandstoneTopUrl) }), // 87
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(redSandUrl) }), // 88
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(copperOreUrl) }), // 89
  new THREE.MeshLambertMaterial({ color: 0xd47a5c, map: loadBlockTexture(copperBlockUrl) }), // 90
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(jungleLogUrl) }), // 91
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(jungleLogTopUrl) }), // 92
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(junglePlanksUrl) }), // 93
  new THREE.MeshLambertMaterial({ color: 0x5a8f29, map: loadBlockTexture(jungleLeavesUrl), alphaTest: 0.45, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), // 94
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(cherryLogUrl) }), // 95
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(cherryLogTopUrl) }), // 96
  new THREE.MeshLambertMaterial({ color: 0xe8b4c8, map: loadBlockTexture(cherryPlanksUrl) }), // 97
  new THREE.MeshLambertMaterial({ color: 0xf0c8d8, map: loadBlockTexture(cherryLeavesUrl), alphaTest: 0.45, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), // 98
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(iceUrl), transparent: true, opacity: 0.6 }), // 99
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(packedIceUrl) }), // 100
  new THREE.MeshLambertMaterial({ color: 0x74a8ff, map: loadBlockTexture(blueIceUrl) }), // 101
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(coalBlockUrl) }), // 102
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(ironBlockUrl) }), // 103
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(goldBlockUrl) }), // 104
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(diamondBlockUrl) }), // 105
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(emeraldBlockUrl) }), // 106
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(lapisBlockUrl) }), // 107
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(redstoneBlockUrl) }), // 108
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(calciteUrl) }), // 109
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(dripstoneUrl) }), // 110
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(tuffUrl) }), // 111
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(brownMushroomUrl), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }), // 112
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(redMushroomUrl), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }), // 113
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(cactusSideUrl) }), // 114
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(cactusTopUrl) }), // 115
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(pumpkinUrl) }), // 116
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(pumpkinTopUrl) }), // 117
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(melonUrl) }), // 118
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(melonTopUrl) }), // 119
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(hayUrl) }), // 120
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(hayTopUrl) }), // 121
  ...createLanternTextures().map((tex) => new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffaa00, emissiveIntensity: 0.3 })), // 122-127
  ...createSoulLanternTextures().map((tex) => new THREE.MeshLambertMaterial({ map: tex, emissive: 0x4488aa, emissiveIntensity: 0.3 })), // 128-133
  ...createTorchTextures().map((tex) => new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffaa00, emissiveIntensity: 0.4 })), // 134-139
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(basicStringUrl) }), // 140
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(stringSeaBeaconUrl) }), // 141
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(topologicalRingUrl) }), // 142
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(crystalCoreUrl) }), // 143
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(catTreatUrl) }), // 144
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(idealCoinUrl) }), // 145
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(purpleCatTreatUrl) }), // 146
  new THREE.MeshLambertMaterial({ map: loadBlockTexture(diceUrl) }), // 147
  new THREE.MeshLambertMaterial({ map: createItemFrameTexture() }), // 148
  new THREE.MeshLambertMaterial({ map: createItemFrameTexture() }), // 148
  new THREE.MeshLambertMaterial({ map: createItemFrameWithItemTexture(basicStringUrl) }), // 149
  new THREE.MeshLambertMaterial({ map: createItemFrameWithItemTexture(stringSeaBeaconUrl) }), // 150
  new THREE.MeshLambertMaterial({ map: createItemFrameWithItemTexture(topologicalRingUrl) }), // 151
  new THREE.MeshLambertMaterial({ map: createItemFrameWithItemTexture(crystalCoreUrl) }), // 152
  new THREE.MeshLambertMaterial({ map: createItemFrameWithItemTexture(catTreatUrl) }), // 153
  new THREE.MeshLambertMaterial({ map: createItemFrameWithItemTexture(idealCoinUrl) }), // 154
  new THREE.MeshLambertMaterial({ map: createItemFrameWithItemTexture(purpleCatTreatUrl) }), // 155
  new THREE.MeshLambertMaterial({ map: createItemFrameWithItemTexture(diceUrl) }), // 156
];

// Material Index Mapping
export function materialIndexFor(type: BlockType, normal: THREE.Vector3) {
  if (type === 'grass') return normal.y > 0 ? 0 : normal.y < 0 ? 2 : 1;
  if (type === 'dirt') return 2;
  if (type === 'stone') return 3;
  if (type === 'wood' || type === 'oakLog') return Math.abs(normal.y) > 0 ? 5 : 4;
  if (type === 'leaves') return 6;
  if (type === 'sand') return 9;
  if (type === 'gravel') return 10;
  if (type === 'cobblestone') return 11;
  if (type === 'stoneBricks') return 12;
  if (type === 'planks' || type === 'oakPlanks') return 13;
  if (type === 'bricks') return 14;
  if (type === 'whiteWool') return 15;
  if (type === 'andesite') return 16;
  if (type === 'diorite') return 17;
  if (type === 'granite') return 18;
  if (type === 'coalOre') return 19;
  if (type === 'ironOre') return 20;
  if (type === 'goldOre') return 21;
  if (type === 'diamondOre') return 22;
  if (type === 'emeraldOre') return 23;
  if (type === 'redstoneOre') return 24;
  if (type === 'lapisOre') return 25;
  if (type === 'blackstone') return 26;
  if (type === 'bedrock') return 27;
  if (type === 'bookshelf') return 28;
  if (type === 'birchLog') return Math.abs(normal.y) > 0 ? 30 : 29;
  if (type === 'birchPlanks') return 31;
  if (type === 'acaciaLog') return Math.abs(normal.y) > 0 ? 33 : 32;
  if (type === 'acaciaPlanks') return 34;
  if (type === 'bambooBlock') return Math.abs(normal.y) > 0 ? 36 : 35;
  if (type === 'bambooPlanks') return 37;
  if (type === 'amethystBlock') return 38;
  if (type === 'blueWool') return 39;
  if (type === 'blackWool') return 40;
  if (type === 'basalt') return Math.abs(normal.y) > 0 ? 42 : 41;
  if (type === 'water') return 43;
  if (type === 'shortGrass') return 44;
  if (type === 'fern') return 45;
  if (type === 'deadBush') return 46;
  if (type === 'dandelion') return 47;
  if (type === 'poppy') return 48;
  if (type === 'allium') return 49;
  if (type === 'blueOrchid') return 50;
  if (type === 'deepslate') return Math.abs(normal.y) > 0 ? 52 : 51;
  if (type === 'deepslateBricks') return 53;
  if (type === 'deepslateTiles') return 54;
  if (type === 'polishedDeepslate') return 55;
  if (type === 'darkOakLog') return Math.abs(normal.y) > 0 ? 57 : 56;
  if (type === 'darkOakPlanks') return 58;
  if (type === 'darkOakLeaves') return 59;
  if (type === 'spruceLog') return Math.abs(normal.y) > 0 ? 61 : 60;
  if (type === 'sprucePlanks') return 62;
  if (type === 'spruceLeaves') return 63;
  if (type === 'birchLeaves') return 64;
  if (type === 'redWool') return 65;
  if (type === 'greenWool') return 66;
  if (type === 'yellowWool') return 67;
  if (type === 'purpleWool') return 68;
  if (type === 'pinkWool') return 69;
  if (type === 'orangeWool') return 70;
  if (type === 'lightBlueWool') return 71;
  if (type === 'limeWool') return 72;
  if (type === 'grayWool') return 73;
  if (type === 'cyanWool') return 74;
  if (type === 'magentaWool') return 75;
  if (type === 'brownWool') return 76;
  if (type === 'glass') return 77;
  if (type === 'tnt') return normal.y > 0 ? 79 : normal.y < 0 ? 80 : 78;
  // New blocks
  if (type === 'snow') return 81;
  if (type === 'clay') return 82;
  if (type === 'mossBlock') return 83;
  if (type === 'mossyCobblestone') return 84;
  if (type === 'mossyStoneBricks') return 85;
  if (type === 'sandstone') return Math.abs(normal.y) > 0 ? 87 : 86;
  if (type === 'redSand') return 88;
  if (type === 'copperOre') return 89;
  if (type === 'copperBlock') return 90;
  if (type === 'jungleLog') return Math.abs(normal.y) > 0 ? 92 : 91;
  if (type === 'junglePlanks') return 93;
  if (type === 'jungleLeaves') return 94;
  if (type === 'cherryLog') return Math.abs(normal.y) > 0 ? 96 : 95;
  if (type === 'cherryPlanks') return 97;
  if (type === 'cherryLeaves') return 98;
  if (type === 'ice') return 99;
  if (type === 'packedIce') return 100;
  if (type === 'blueIce') return 101;
  if (type === 'coalBlock') return 102;
  if (type === 'ironBlock') return 103;
  if (type === 'goldBlock') return 104;
  if (type === 'diamondBlock') return 105;
  if (type === 'emeraldBlock') return 106;
  if (type === 'lapisBlock') return 107;
  if (type === 'redstoneBlock') return 108;
  if (type === 'calcite') return 109;
  if (type === 'dripstone') return 110;
  if (type === 'tuff') return 111;
  if (type === 'brownMushroom') return 112;
  if (type === 'redMushroom') return 113;
  if (type === 'cactus') return Math.abs(normal.y) > 0 ? 115 : 114;
  if (type === 'pumpkin') return Math.abs(normal.y) > 0 ? 117 : 116;
  if (type === 'melon') return Math.abs(normal.y) > 0 ? 119 : 118;
  if (type === 'hay') return Math.abs(normal.y) > 0 ? 121 : 120;
  if (type === 'lantern') {
    if (normal.y > 0.5) return 124;
    if (normal.y < -0.5) return 125;
    if (normal.x > 0.5) return 122;
    if (normal.x < -0.5) return 123;
    if (normal.z > 0.5) return 126;
    return 127;
  }
  if (type === 'soulLantern') {
    if (normal.y > 0.5) return 130;
    if (normal.y < -0.5) return 131;
    if (normal.x > 0.5) return 128;
    if (normal.x < -0.5) return 129;
    if (normal.z > 0.5) return 132;
    return 133;
  }
  if (type === 'torch') {
    if (normal.y > 0.5) return 136;
    if (normal.y < -0.5) return 137;
    if (normal.x > 0.5) return 134;
    if (normal.x < -0.5) return 135;
    if (normal.z > 0.5) return 138;
    return 139;
  }
  if (type === 'basicString') return 140;
  if (type === 'stringSeaBeacon') return 141;
  if (type === 'topologicalRing') return 142;
  if (type === 'crystalCore') return 143;
  if (type === 'catTreat') return 144;
  if (type === 'idealCoin') return 145;
  if (type === 'purpleCatTreat') return 146;
  if (type === 'dice') return 147;
  if (type === 'itemFrame') return 148;
  return 7;
}

export function itemFrameMaterialIndex(contents: number): number {
  return 148 + contents;
}

// Block Category Helpers
export function isPlantBlock(type: BlockType) {
  return type === 'flower' || type === 'shortGrass' || type === 'fern' || type === 'deadBush' 
    || type === 'dandelion' || type === 'poppy' || type === 'allium' || type === 'blueOrchid'
    || type === 'brownMushroom' || type === 'redMushroom';
}

export function isSolidBlock(type: BlockType) {
  return type !== 'water' && !isPlantBlock(type);
}

export function isTransparentBlock(type: BlockType) {
  return type === 'glass' || type === 'leaves' || type === 'darkOakLeaves' || type === 'spruceLeaves' 
    || type === 'birchLeaves' || type === 'jungleLeaves' || type === 'cherryLeaves' || type === 'ice';
}

export function isFallingBlock(type: BlockType) {
  return type === 'sand' || type === 'gravel' || type === 'redSand';
}

export function isReplaceableBlock(type: BlockType) {
  return isPlantBlock(type);
}

// UI Labels (Chinese)
export const blockLabels: Record<BlockType, string> = {
  grass: '草方块',
  dirt: '泥土',
  stone: '石头',
  wood: '木头',
  leaves: '树叶',
  flower: '花',
  sand: '沙子',
  gravel: '砂砾',
  cobblestone: '圆石',
  stoneBricks: '石砖',
  planks: '橡木板',
  bricks: '砖块',
  whiteWool: '白羊毛',
  andesite: '安山岩',
  diorite: '闪长岩',
  granite: '花岗岩',
  coalOre: '煤矿石',
  ironOre: '铁矿石',
  goldOre: '金矿石',
  diamondOre: '钻石矿石',
  emeraldOre: '绿宝石矿石',
  redstoneOre: '红石矿石',
  lapisOre: '青金石矿石',
  blackstone: '黑石',
  basalt: '玄武岩',
  bedrock: '基岩',
  bookshelf: '书架',
  birchLog: '白桦原木',
  birchPlanks: '白桦木板',
  acaciaLog: '金合欢原木',
  acaciaPlanks: '金合欢木板',
  bambooBlock: '竹块',
  bambooPlanks: '竹板',
  amethystBlock: '紫水晶块',
  blueWool: '蓝色羊毛',
  blackWool: '黑色羊毛',
  water: '水',
  shortGrass: '草',
  fern: '蕨',
  deadBush: '枯灌木',
  dandelion: '蒲公英',
  poppy: '虞美人',
  allium: '绒球葱',
  blueOrchid: '兰花',
  deepslate: '深板岩',
  deepslateBricks: '深板岩砖',
  deepslateTiles: '深板岩瓦',
  polishedDeepslate: '磨制深板岩',
  darkOakLog: '深色橡木原木',
  darkOakPlanks: '深色橡木木板',
  darkOakLeaves: '深色橡木树叶',
  spruceLog: '云杉原木',
  sprucePlanks: '云杉木板',
  spruceLeaves: '云杉树叶',
  birchLeaves: '白桦树叶',
  redWool: '红色羊毛',
  greenWool: '绿色羊毛',
  yellowWool: '黄色羊毛',
  purpleWool: '紫色羊毛',
  pinkWool: '粉色羊毛',
  orangeWool: '橙色羊毛',
  lightBlueWool: '淡蓝色羊毛',
  limeWool: '黄绿色羊毛',
  grayWool: '灰色羊毛',
  cyanWool: '青色羊毛',
  magentaWool: '品红色羊毛',
  brownWool: '棕色羊毛',
  glass: '玻璃',
  tnt: 'TNT',
  // New blocks
  snow: '雪',
  clay: '粘土',
  mossBlock: '苔藓块',
  mossyCobblestone: '苔石',
  mossyStoneBricks: '苔石砖',
  sandstone: '沙岩',
  redSand: '红沙',
  copperOre: '铜矿石',
  copperBlock: '铜块',
  jungleLog: '丛林原木',
  junglePlanks: '丛林木板',
  jungleLeaves: '丛林树叶',
  cherryLog: '樱花原木',
  cherryPlanks: '樱花木板',
  cherryLeaves: '樱花树叶',
  oakLog: '橡木原木',
  oakPlanks: '橡木板',
  ice: '冰',
  packedIce: '浮冰',
  blueIce: '蓝冰',
  coalBlock: '煤炭块',
  ironBlock: '铁块',
  goldBlock: '金块',
  diamondBlock: '钻石块',
  emeraldBlock: '绿宝石块',
  lapisBlock: '青金石块',
  redstoneBlock: '红石块',
  calcite: '方解石',
  dripstone: '滴水石',
  tuff: '凝灰岩',
  brownMushroom: '棕色蘑菇',
  redMushroom: '红色蘑菇',
  cactus: '仙人掌',
  pumpkin: '南瓜',
  melon: '西瓜',
  hay: '干草块',
  lantern: '灯笼',
  soulLantern: '灵魂灯笼',
  torch: '火把',
  basicString: '基弦',
  stringSeaBeacon: '弦海信标',
  topologicalRing: '拓扑晶环',
  crystalCore: '晶核',
  catTreat: '猫条',
  idealCoin: '理想币',
  purpleCatTreat: '紫猫条',
  dice: '骰子',
  itemFrame: '物品展示框',
};

// UI Icon URLs
export const blockIconUrls: Record<BlockType, string> = {
  grass: grassTopUrl,
  dirt: dirtUrl,
  stone: stoneUrl,
  wood: oakLogUrl,
  leaves: oakLeavesUrl,
  flower: cornflowerUrl,
  sand: sandUrl,
  gravel: gravelUrl,
  cobblestone: cobblestoneUrl,
  stoneBricks: stoneBricksUrl,
  planks: oakPlanksUrl,
  bricks: bricksUrl,
  whiteWool: whiteWoolUrl,
  andesite: andesiteUrl,
  diorite: dioriteUrl,
  granite: graniteUrl,
  coalOre: coalOreUrl,
  ironOre: ironOreUrl,
  goldOre: goldOreUrl,
  diamondOre: diamondOreUrl,
  emeraldOre: emeraldOreUrl,
  redstoneOre: redstoneOreUrl,
  lapisOre: lapisOreUrl,
  blackstone: blackstoneUrl,
  basalt: basaltSideUrl,
  bedrock: bedrockUrl,
  bookshelf: bookshelfUrl,
  birchLog: birchLogUrl,
  birchPlanks: birchPlanksUrl,
  acaciaLog: acaciaLogUrl,
  acaciaPlanks: acaciaPlanksUrl,
  bambooBlock: bambooBlockUrl,
  bambooPlanks: bambooPlanksUrl,
  amethystBlock: amethystBlockUrl,
  blueWool: blueWoolUrl,
  blackWool: blackWoolUrl,
  water: waterStillUrl,
  shortGrass: '',
  fern: fernUrl,
  deadBush: deadBushUrl,
  dandelion: dandelionUrl,
  poppy: poppyUrl,
  allium: alliumUrl,
  blueOrchid: blueOrchidUrl,
  deepslate: deepslateUrl,
  deepslateBricks: deepslateBricksUrl,
  deepslateTiles: deepslateTilesUrl,
  polishedDeepslate: polishedDeepslateUrl,
  darkOakLog: darkOakLogUrl,
  darkOakPlanks: darkOakPlanksUrl,
  darkOakLeaves: darkOakLeavesUrl,
  spruceLog: spruceLogUrl,
  sprucePlanks: sprucePlanksUrl,
  spruceLeaves: spruceLeavesUrl,
  birchLeaves: birchLeavesUrl,
  redWool: redWoolUrl,
  greenWool: greenWoolUrl,
  yellowWool: yellowWoolUrl,
  purpleWool: purpleWoolUrl,
  pinkWool: pinkWoolUrl,
  orangeWool: orangeWoolUrl,
  lightBlueWool: lightBlueWoolUrl,
  limeWool: limeWoolUrl,
  grayWool: grayWoolUrl,
  cyanWool: cyanWoolUrl,
  magentaWool: magentaWoolUrl,
  brownWool: brownWoolUrl,
  glass: whiteStainedGlassUrl,
  tnt: '',
  // New blocks
  snow: snowUrl,
  clay: clayUrl,
  mossBlock: mossBlockUrl,
  mossyCobblestone: mossyCobblestoneUrl,
  mossyStoneBricks: mossyStoneBricksUrl,
  sandstone: sandstoneUrl,
  redSand: redSandUrl,
  copperOre: copperOreUrl,
  copperBlock: copperBlockUrl,
  jungleLog: jungleLogUrl,
  junglePlanks: junglePlanksUrl,
  jungleLeaves: jungleLeavesUrl,
  cherryLog: cherryLogUrl,
  cherryPlanks: cherryPlanksUrl,
  cherryLeaves: cherryLeavesUrl,
  oakLog: oakLogUrl,
  oakPlanks: oakPlanksUrl,
  ice: iceUrl,
  packedIce: packedIceUrl,
  blueIce: blueIceUrl,
  coalBlock: coalBlockUrl,
  ironBlock: ironBlockUrl,
  goldBlock: goldBlockUrl,
  diamondBlock: diamondBlockUrl,
  emeraldBlock: emeraldBlockUrl,
  lapisBlock: lapisBlockUrl,
  redstoneBlock: redstoneBlockUrl,
  calcite: calciteUrl,
  dripstone: dripstoneUrl,
  tuff: tuffUrl,
  brownMushroom: brownMushroomUrl,
  redMushroom: redMushroomUrl,
  cactus: cactusTopUrl,
  pumpkin: pumpkinUrl,
  melon: melonUrl,
  hay: hayUrl,
  torch: (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, 16, 16);
    x.fillStyle = '#2a1608'; x.fillRect(7, 5, 2, 11);
    x.fillStyle = '#3a2010'; x.fillRect(7, 5, 1, 11);
    x.fillStyle = '#ff8800'; x.fillRect(7, 2, 1, 3);
    x.fillStyle = '#cc4400'; x.fillRect(8, 2, 1, 3);
    x.fillStyle = '#ffaa00'; x.fillRect(7, 4, 1, 1);
    x.fillStyle = '#dd5500'; x.fillRect(8, 4, 1, 1);
    return c.toDataURL();
  })(),
  lantern: (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, 16, 16);
    x.fillStyle = '#5a5a5a'; x.fillRect(3, 0, 10, 16); x.fillRect(2, 1, 12, 14);
    x.fillStyle = '#4a4a4a'; x.fillRect(3, 0, 10, 1); x.fillRect(3, 15, 10, 1); x.fillRect(2, 1, 1, 14); x.fillRect(13, 1, 1, 14);
    x.fillStyle = '#ffcc33'; x.fillRect(4, 2, 8, 12);
    x.fillStyle = '#ffaa00'; x.fillRect(5, 3, 6, 10);
    x.fillStyle = '#ffe066'; x.fillRect(6, 4, 4, 8);
    x.fillStyle = '#fff4b0'; x.fillRect(7, 5, 2, 6);
    x.fillStyle = '#6a6a6a'; x.fillRect(6, 0, 4, 1); x.fillRect(6, 15, 4, 1); x.fillRect(2, 7, 1, 2); x.fillRect(13, 7, 1, 2);
    return c.toDataURL();
  })(),
  soulLantern: (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, 16, 16);
    x.fillStyle = '#5a5a5a'; x.fillRect(3, 0, 10, 16); x.fillRect(2, 1, 12, 14);
    x.fillStyle = '#4a4a4a'; x.fillRect(3, 0, 10, 1); x.fillRect(3, 15, 10, 1); x.fillRect(2, 1, 1, 14); x.fillRect(13, 1, 1, 14);
    x.fillStyle = '#33aacc'; x.fillRect(4, 2, 8, 12);
    x.fillStyle = '#2288aa'; x.fillRect(5, 3, 6, 10);
    x.fillStyle = '#55ccee'; x.fillRect(6, 4, 4, 8);
    x.fillStyle = '#a0eeff'; x.fillRect(7, 5, 2, 6);
    x.fillStyle = '#6a6a6a'; x.fillRect(6, 0, 4, 1); x.fillRect(6, 15, 4, 1); x.fillRect(2, 7, 1, 2); x.fillRect(13, 7, 1, 2);
    return c.toDataURL();
  })(),
  basicString: basicStringUrl,
  stringSeaBeacon: stringSeaBeaconUrl,
  topologicalRing: topologicalRingUrl,
  crystalCore: crystalCoreUrl,
  catTreat: catTreatUrl,
  idealCoin: idealCoinUrl,
  purpleCatTreat: purpleCatTreatUrl,
  dice: diceUrl,
  itemFrame: (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const x = c.getContext('2d')!;
    x.fillStyle = '#8b6914'; x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#6b4c12'; x.fillRect(0, 0, 16, 2); x.fillRect(0, 14, 16, 2); x.fillRect(0, 0, 2, 16); x.fillRect(14, 0, 2, 16);
    x.fillStyle = '#a07818'; x.fillRect(1, 1, 1, 14); x.fillRect(1, 1, 14, 1);
    x.fillStyle = '#f5deb3'; x.fillRect(3, 3, 10, 10);
    return c.toDataURL();
  })(),
};

export const blockIconTints: Partial<Record<BlockType, string>> = {
  grass: '#73b84a',
  leaves: '#6fbd55',
  darkOakLeaves: '#4a7a3a',
  spruceLeaves: '#3a5c2a',
  birchLeaves: '#6b8f4a',
  jungleLeaves: '#5a8f29',
  cherryLeaves: '#f0c8d8',
  mossBlock: '#5a8f29',
  shortGrass: '#74b94f',
  fern: '#4f9d4b',
  water: '#7dbbff',
};

// Plant picking helper
export function pickPlant(x: number, y: number, z: number, seededNoise: (x: number, y: number, z: number) => number): BlockType {
  const roll = seededNoise(x, y + 17, z);
  if (roll < 0.35) return 'shortGrass';
  if (roll < 0.45) return 'fern';
  if (roll < 0.52) return 'dandelion';
  if (roll < 0.59) return 'poppy';
  if (roll < 0.65) return 'blueOrchid';
  if (roll < 0.71) return 'allium';
  if (roll < 0.78) return 'flower';
  if (roll < 0.84) return 'brownMushroom';
  if (roll < 0.90) return 'redMushroom';
  return 'deadBush';
}

// Water material (exported separately for special use)
export const waterMaterial = new THREE.MeshLambertMaterial({ color: 0x7dbbff, map: loadBlockTexture(waterStillUrl), transparent: true, opacity: 0.72, depthWrite: false });
