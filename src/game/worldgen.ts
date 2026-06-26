import * as THREE from 'three';
import type { WorldGenSettings } from './types';
import type { BlockType } from './blocks';
import { pickPlant } from './blocks';

export type Creature = { root: THREE.Group; phase: number; home: THREE.Vector3 };

export interface WorldGenContext {
  blocks: Map<string, { position: THREE.Vector3; type: BlockType }>;
  worldSeed: number;
  worldRadius: number;
  waterLevel: number;
  worldBottom: number;
  scene: THREE.Scene;
  creatures: Creature[];
  addBlock: (x: number, y: number, z: number, type: BlockType, waterDistance?: number) => void;
  settleInitialFallingBlocks: () => void;
  queueInitialWater: () => void;
  rebuildAllChunks: () => void;
  rebuildDirtyWaterChunks: (limit?: number) => void;
  dirtyWaterChunks: Set<string>;
  updateChunkVisibility: (force?: boolean) => void;
  lightConfig: (type: BlockType) => { color: number; intensity: number; distance: number } | null;
  blockLights: Map<string, THREE.PointLight>;
  onProgress?: (label: string, progress: number) => void;
}

export type Biome = 'plains' | 'forest' | 'jungle' | 'desert' | 'snow' | 'taiga' | 'savanna';

export const biomeConfig: Record<Biome, {
  grassColor: number;
  treeDensity: number;
  treeTypes: ('oak' | 'jungle' | 'cherry' | 'spruce')[];
  surfaceBlock: BlockType;
  plantDensity: number;
}> = {
  plains: {
    grassColor: 0x73b84a,
    treeDensity: 0.992,
    treeTypes: ['oak'],
    surfaceBlock: 'grass',
    plantDensity: 0.78,
  },
  forest: {
    grassColor: 0x5a8f29,
    treeDensity: 0.975,
    treeTypes: ['oak', 'spruce'],
    surfaceBlock: 'grass',
    plantDensity: 0.65,
  },
  jungle: {
    grassColor: 0x3a7a1a,
    treeDensity: 0.96,
    treeTypes: ['jungle'],
    surfaceBlock: 'grass',
    plantDensity: 0.55,
  },
  desert: {
    grassColor: 0xc2a645,
    treeDensity: 0.998,
    treeTypes: [],
    surfaceBlock: 'sand',
    plantDensity: 0.95,
  },
  snow: {
    grassColor: 0x8fb8a0,
    treeDensity: 0.985,
    treeTypes: ['spruce'],
    surfaceBlock: 'snow',
    plantDensity: 0.85,
  },
  taiga: {
    grassColor: 0x6a9f4a,
    treeDensity: 0.97,
    treeTypes: ['spruce'],
    surfaceBlock: 'grass',
    plantDensity: 0.75,
  },
  savanna: {
    grassColor: 0x9ab84a,
    treeDensity: 0.988,
    treeTypes: ['oak'],
    surfaceBlock: 'grass',
    plantDensity: 0.82,
  },
};

export function seededNoise(worldSeed: number, x: number, y: number, z: number) {
  return Math.abs(Math.sin((x + worldSeed) * 12.9898 + (y - worldSeed * 0.37) * 78.233 + (z + worldSeed * 0.61) * 37.719) * 43758.5453) % 1;
}

function biomeNoise(worldSeed: number, x: number, z: number) {
  const nx = x / 80;
  const nz = z / 80;
  return (
    Math.sin(nx * 0.7 + worldSeed * 0.1) * 0.3 +
    Math.sin(nz * 0.8 + worldSeed * 0.2) * 0.3 +
    Math.sin((nx + nz) * 0.5 + worldSeed * 0.3) * 0.2 +
    Math.sin(nx * 1.3 - nz * 0.9 + worldSeed * 0.4) * 0.2
  ) * 0.5 + 0.5;
}

function moistureNoise(worldSeed: number, x: number, z: number) {
  const nx = x / 60;
  const nz = z / 60;
  return (
    Math.sin(nx * 0.9 - worldSeed * 0.15) * 0.3 +
    Math.sin(nz * 0.6 + worldSeed * 0.25) * 0.3 +
    Math.sin((nx - nz) * 0.7 + worldSeed * 0.35) * 0.2 +
    Math.sin(nx * 1.1 + nz * 1.2 - worldSeed * 0.45) * 0.2
  ) * 0.5 + 0.5;
}

export function getBiome(worldSeed: number, x: number, z: number): Biome {
  const temp = biomeNoise(worldSeed, x, z);
  const moisture = moistureNoise(worldSeed, x, z);

  if (temp > 0.65) {
    return moisture > 0.55 ? 'jungle' : 'desert';
  }
  if (temp > 0.5) {
    return moisture > 0.6 ? 'forest' : moisture > 0.4 ? 'savanna' : 'plains';
  }
  if (temp > 0.35) {
    return moisture > 0.5 ? 'taiga' : 'plains';
  }
  return 'snow';
}

function riverCenterX(worldSeed: number, z: number) {
  return Math.sin((z + worldSeed) * 0.15) * 7 + Math.sin((z - worldSeed * 0.52) * 0.045 + 1.8) * 10;
}

export function riverProfile(worldSeed: number, x: number, z: number) {
  const center = riverCenterX(worldSeed, z);
  const bend = riverCenterX(worldSeed, z + 1) - riverCenterX(worldSeed, z - 1);
  const distance = Math.abs(x - center) / Math.max(1, Math.hypot(1, bend * 0.5));
  const width = 3.2 + seededNoise(worldSeed, Math.floor(z / 7), 0, 3) * 1.7;
  const bankWidth = width + 3.4 + seededNoise(worldSeed, Math.floor(z / 9), 0, 11) * 1.4;
  const bed = distance < width;
  const bank = distance < bankWidth;
  const depth = bed ? 1 + Math.floor((1 - distance / width) * 2.6) : 0;
  return { bed, bank, depth, bankBlend: THREE.MathUtils.clamp((bankWidth - distance) / Math.max(bankWidth - width, 0.1), 0, 1) };
}

export function terrainHeight(worldSeed: number, x: number, z: number) {
  return Math.floor(
    1.5
    + Math.sin((x + worldSeed) * 0.45) * 1.2
    + Math.cos((z - worldSeed * 0.41) * 0.36) * 1.1
    + Math.sin((x + z + worldSeed * 0.29) * 0.18) * 0.8,
  );
}

export function buildTree(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const trunkHeight = 4 + Math.floor(seededNoise(worldSeed, x, y, z) * 3);
  for (let dy = 1; dy <= trunkHeight - 2; dy += 1) ctx.addBlock(x, y + dy, z, 'wood');

  for (let layer = -1; layer <= 2; layer += 1) {
    const leafY = y + trunkHeight + layer;
    const baseRadius = layer < 1 ? 2 : 1;

    for (let dx = -baseRadius; dx <= baseRadius; dx += 1) {
      for (let dz = -baseRadius; dz <= baseRadius; dz += 1) {
        const distance = Math.abs(dx) + Math.abs(dz);
        const cornerNoise = seededNoise(worldSeed, x + dx, leafY, z + dz);
        const edgeLimit = baseRadius + (cornerNoise > 0.76 ? 1 : 0);
        if (distance > edgeLimit || (distance === 0 && layer < 0)) continue;
        if (distance >= baseRadius + 1 && cornerNoise < 0.9) continue;
        ctx.addBlock(x + dx, leafY, z + dz, 'leaves');
      }
    }
  }

  ctx.addBlock(x, y + trunkHeight + 2, z, 'leaves');
}

export function buildJungleTree(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const trunkHeight = 6 + Math.floor(seededNoise(worldSeed, x, y, z) * 5);
  for (let dy = 1; dy <= trunkHeight - 2; dy += 1) ctx.addBlock(x, y + dy, z, 'jungleLog');

  for (let layer = -2; layer <= 2; layer += 1) {
    const leafY = y + trunkHeight + layer;
    const baseRadius = layer < 0 ? 3 : 2;

    for (let dx = -baseRadius; dx <= baseRadius; dx += 1) {
      for (let dz = -baseRadius; dz <= baseRadius; dz += 1) {
        const distance = Math.abs(dx) + Math.abs(dz);
        const cornerNoise = seededNoise(worldSeed, x + dx, leafY, z + dz);
        if (distance > baseRadius + (cornerNoise > 0.7 ? 1 : 0)) continue;
        if (distance === 0 && layer < 0) continue;
        ctx.addBlock(x + dx, leafY, z + dz, 'jungleLeaves');
      }
    }
  }
}

export function buildCherryTree(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const trunkHeight = 4 + Math.floor(seededNoise(worldSeed, x, y, z) * 2);
  for (let dy = 1; dy <= trunkHeight - 2; dy += 1) ctx.addBlock(x, y + dy, z, 'cherryLog');

  for (let layer = -1; layer <= 2; layer += 1) {
    const leafY = y + trunkHeight + layer;
    const baseRadius = layer < 1 ? 2 : 1;

    for (let dx = -baseRadius; dx <= baseRadius; dx += 1) {
      for (let dz = -baseRadius; dz <= baseRadius; dz += 1) {
        const distance = Math.abs(dx) + Math.abs(dz);
        if (distance > baseRadius + 1) continue;
        if (distance === 0 && layer < 0) continue;
        ctx.addBlock(x + dx, leafY, z + dz, 'cherryLeaves');
      }
    }
  }
}

export function buildSpruceTree(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const trunkHeight = 5 + Math.floor(seededNoise(worldSeed, x, y, z) * 3);
  for (let dy = 1; dy <= trunkHeight - 2; dy += 1) ctx.addBlock(x, y + dy, z, 'spruceLog');

  for (let layer = -1; layer <= trunkHeight; layer += 1) {
    const leafY = y + trunkHeight + 2 - layer;
    const radius = Math.max(0, Math.floor(layer / 2));

    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        if (Math.abs(dx) + Math.abs(dz) > radius) continue;
        if (dx === 0 && dz === 0 && layer < trunkHeight) continue;
        ctx.addBlock(x + dx, leafY, z + dz, 'spruceLeaves');
      }
    }
  }
}

export function buildCactus(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const height = 2 + Math.floor(seededNoise(worldSeed, x, y, z) * 3);
  for (let dy = 1; dy <= height; dy += 1) ctx.addBlock(x, y + dy, z, 'cactus');
}

export function buildPumpkinPatch(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const count = 1 + Math.floor(seededNoise(worldSeed, x, y, z) * 3);
  for (let i = 0; i < count; i += 1) {
    const dx = Math.floor(seededNoise(worldSeed, x + i, y, z) * 3) - 1;
    const dz = Math.floor(seededNoise(worldSeed, x, y, z + i) * 3) - 1;
    ctx.addBlock(x + dx, y + 1, z + dz, 'pumpkin');
  }
}

export function buildMushroomCluster(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const count = 2 + Math.floor(seededNoise(worldSeed, x, y, z) * 4);
  for (let i = 0; i < count; i += 1) {
    const dx = Math.floor(seededNoise(worldSeed, x + i, y, z) * 5) - 2;
    const dz = Math.floor(seededNoise(worldSeed, x, y, z + i) * 5) - 2;
    const type = seededNoise(worldSeed, x + i, y + 1, z + i) > 0.5 ? 'brownMushroom' : 'redMushroom';
    ctx.addBlock(x + dx, y + 1, z + dz, type);
  }
}

export function buildRockFormation(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const radius = 1 + Math.floor(seededNoise(worldSeed, x, y, z) * 2);
  const height = 1 + Math.floor(seededNoise(worldSeed, x, y + 1, z) * 2);

  for (let dy = 0; dy <= height; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        const distance = Math.abs(dx) + Math.abs(dz);
        if (distance > radius + (seededNoise(worldSeed, x + dx, y + dy, z + dz) > 0.6 ? 1 : 0)) continue;
        const type = dy === height ? 'cobblestone' : 'mossyCobblestone';
        ctx.addBlock(x + dx, y + dy, z + dz, type);
      }
    }
  }
}

export function buildPond(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const radius = 2 + Math.floor(seededNoise(worldSeed, x, y, z) * 2);
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      const distance = Math.hypot(dx, dz);
      if (distance > radius) continue;
      if (distance > radius - 1.5) {
        ctx.addBlock(x + dx, y, z + dz, 'clay');
      } else {
        ctx.addBlock(x + dx, y, z + dz, 'water', 0);
      }
    }
  }
}

export function buildSnowPile(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const radius = 1 + Math.floor(seededNoise(worldSeed, x, y, z) * 2);
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      if (Math.abs(dx) + Math.abs(dz) > radius) continue;
      ctx.addBlock(x + dx, y + 1, z + dz, 'snow');
    }
  }
}

export function buildMineralVein(ctx: WorldGenContext, x: number, y: number, z: number, type: BlockType, worldSeed: number) {
  const size = 2 + Math.floor(seededNoise(worldSeed, x, y, z) * 3);
  for (let dx = 0; dx < size; dx += 1) {
    for (let dy = 0; dy < size; dy += 1) {
      for (let dz = 0; dz < size; dz += 1) {
        if (seededNoise(worldSeed, x + dx, y + dy, z + dz) > 0.6) {
          ctx.addBlock(x + dx, y + dy, z + dz, type);
        }
      }
    }
  }
}

export function addVegetation(ctx: WorldGenContext, x: number, y: number, z: number, worldSeed: number) {
  const isRiverBed = (wx: number, wz: number) => riverProfile(worldSeed, wx, wz).bed;
  const isRiverBank = (wx: number, wz: number) => riverProfile(worldSeed, wx, wz).bank;
  if (isRiverBed(x, z) || seededNoise(worldSeed, x, y, z) < 0.58) return;
  const plant = isRiverBank(x, z) && seededNoise(worldSeed, x, y, z + 23) > 0.72 ? 'fern' : pickPlant(x, y, z, (nx, ny, nz) => seededNoise(worldSeed, nx, ny, nz));
  ctx.addBlock(x, y + 1, z, plant);
}

export function createCreature(ctx: WorldGenContext, x: number, z: number, worldSeed: number) {
  const h = terrainHeight(worldSeed, x, z) + 1;
  const root = new THREE.Group();
  root.position.set(x, h, z);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.5, 0.9), new THREE.MeshLambertMaterial({ color: 0xffd56f }));
  body.position.y = 0.38;
  body.castShadow = true;
  root.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.48, 0.52), new THREE.MeshLambertMaterial({ color: 0xffe29a }));
  head.position.set(0, 0.77, -0.28);
  head.castShadow = true;
  root.add(head);

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x392d38 });
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.03), eyeMaterial);
  leftEye.position.set(-0.13, 0.82, -0.55);
  root.add(leftEye);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.13;
  root.add(rightEye);

  ctx.scene.add(root);
  ctx.creatures.push({ root, phase: Math.random() * Math.PI * 2, home: root.position.clone() });
}

export function spawnCreatures(ctx: WorldGenContext, worldSeed: number) {
  createCreature(ctx, -6, -5, worldSeed);
  createCreature(ctx, 5, -8, worldSeed);
  createCreature(ctx, 8, 4, worldSeed);
  createCreature(ctx, -9, 6, worldSeed);
}

export function generateWorld(ctx: WorldGenContext, worldGen: WorldGenSettings, worldSeed: number) {
  return new Promise<void>((resolve) => {
    ctx.onProgress?.('生成地形', 0);

    const batchSize = 20;
    const xCoords: number[] = [];
    const zCoords: number[] = [];

    for (let x = -ctx.worldRadius; x <= ctx.worldRadius; x += 1) {
      for (let z = -ctx.worldRadius; z <= ctx.worldRadius; z += 1) {
        xCoords.push(x);
        zCoords.push(z);
      }
    }

    let index = 0;
    const totalBlocks = xCoords.length;

    const treeDensityMultiplier = worldGen.treeDensity === 'none' ? 0
      : worldGen.treeDensity === 'sparse' ? 1.5
      : worldGen.treeDensity === 'dense' ? 0.7
      : 1;

    const structureDensityOffset = worldGen.structureDensity === 'none' ? 1
      : worldGen.structureDensity === 'sparse' ? 0.05
      : worldGen.structureDensity === 'dense' ? -0.05
      : 0;

    const oreDensityMultiplier = worldGen.oreDensity === 'none' ? 0
      : worldGen.oreDensity === 'sparse' ? 1.5
      : worldGen.oreDensity === 'rich' ? 0.7
      : 1;

    function processBatch() {
      const endIndex = Math.min(index + batchSize, totalBlocks);

      for (let i = index; i < endIndex; i += 1) {
        const x = xCoords[i];
        const z = zCoords[i];
        const distance = Math.hypot(x, z);
        if (distance > ctx.worldRadius + Math.sin(x * z) * 0.8) continue;

        const biome = getBiome(worldSeed, x, z);
        const config = biomeConfig[biome];
        const river = worldGen.flatWorld ? { bed: false, bank: false, bankBlend: 0, depth: 0 } : riverProfile(worldSeed, x, z);

        let h: number;
        if (worldGen.flatWorld) {
          h = ctx.waterLevel;
        } else {
          h = terrainHeight(worldSeed, x, z);
          if (river.bed) h = Math.min(h - river.depth, ctx.waterLevel - river.depth);
          if (!river.bed && river.bank && river.bankBlend > 0.5 && h > ctx.waterLevel + 1) h -= 1;
          if (!river.bed && river.bank) h = Math.max(h, ctx.waterLevel);
        }

        for (let y = ctx.worldBottom; y <= h; y += 1) {
          const bankRoll = seededNoise(worldSeed, x, y, z);
          let surfaceType: BlockType;
          if (river.bed) {
            surfaceType = bankRoll > 0.38 ? 'sand' : 'gravel';
          } else if (river.bank && bankRoll < river.bankBlend * 0.58) {
            surfaceType = 'sand';
          } else if (biome === 'desert') {
            surfaceType = 'sand';
          } else if (biome === 'snow') {
            surfaceType = y === h ? 'snow' : 'grass';
          } else {
            surfaceType = config.surfaceBlock;
          }
          const type = y === ctx.worldBottom ? 'bedrock' : y === h ? surfaceType : biome === 'desert' ? (y > h - 4 ? 'sand' : 'stone') : y > h - 3 ? 'dirt' : 'stone';
          ctx.addBlock(x, y, z, type);
        }

        if (oreDensityMultiplier > 0 && h > ctx.waterLevel + 3) {
          const mineralNoise = seededNoise(worldSeed, x * 3, h * 3, z * 3);
          const oreThreshold = 0.96 * oreDensityMultiplier;
          if (mineralNoise > oreThreshold) buildMineralVein(ctx, x, h - 5, z, 'coalOre', worldSeed);
          if (mineralNoise > oreThreshold + 0.01) buildMineralVein(ctx, x, h - 8, z, 'ironOre', worldSeed);
          if (mineralNoise > oreThreshold + 0.02) buildMineralVein(ctx, x, h - 11, z, 'copperOre', worldSeed);
          if (mineralNoise > oreThreshold + 0.03) buildMineralVein(ctx, x, h - 14, z, 'goldOre', worldSeed);
          if (mineralNoise > oreThreshold + 0.035) buildMineralVein(ctx, x, h - 17, z, 'diamondOre', worldSeed);
        }

        if (river.bed) {
          for (let y = h + 1; y <= ctx.waterLevel; y += 1) ctx.addBlock(x, y, z, 'water', 0);
          continue;
        }

        if (treeDensityMultiplier > 0 && distance > 8 && !river.bank && config.treeTypes.length > 0) {
          const treeNoise = seededNoise(worldSeed, x, h, z);
          const treeThreshold = config.treeDensity * treeDensityMultiplier;
          if (treeNoise > treeThreshold) {
            const treeType = config.treeTypes[Math.floor(seededNoise(worldSeed, x, h + 1, z) * config.treeTypes.length)];
            if (treeType === 'oak') buildTree(ctx, x, h, z, worldSeed);
            else if (treeType === 'jungle') buildJungleTree(ctx, x, h, z, worldSeed);
            else if (treeType === 'cherry') buildCherryTree(ctx, x, h, z, worldSeed);
            else if (treeType === 'spruce') buildSpruceTree(ctx, x, h, z, worldSeed);
          }
        }

        if (h >= ctx.waterLevel && worldGen.structureDensity !== 'none') {
          const structNoise = seededNoise(worldSeed, x + 11, h, z - 7);
          const structThreshold = config.plantDensity + structureDensityOffset;
          if (structNoise > structThreshold) addVegetation(ctx, x, h, z, worldSeed);
          else if (biome === 'desert' && structNoise > 0.92 - structureDensityOffset) buildCactus(ctx, x, h, z, worldSeed);
          else if (biome !== 'desert' && biome !== 'snow' && structNoise > 0.93 - structureDensityOffset) buildPumpkinPatch(ctx, x, h, z, worldSeed);
          else if (biome === 'forest' && structNoise > 0.91 - structureDensityOffset) buildMushroomCluster(ctx, x, h, z, worldSeed);
          else if (biome !== 'desert' && structNoise > 0.89 - structureDensityOffset) buildRockFormation(ctx, x, h, z, worldSeed);
          else if (biome !== 'desert' && structNoise > 0.87 - structureDensityOffset) buildPond(ctx, x, h, z, worldSeed);
          else if (biome === 'snow' && structNoise > 0.85 - structureDensityOffset) buildSnowPile(ctx, x, h, z, worldSeed);
        }
      }

      index = endIndex;
      ctx.onProgress?.('生成地形', index / totalBlocks);

      if (index < totalBlocks) {
        setTimeout(processBatch, 0);
      } else {
        ctx.onProgress?.('处理物理', 0);
        ctx.settleInitialFallingBlocks();
        ctx.queueInitialWater();
        ctx.onProgress?.('构建网格', 0);
        ctx.rebuildAllChunks();
        while (ctx.dirtyWaterChunks.size > 0) ctx.rebuildDirtyWaterChunks(64);
        ctx.updateChunkVisibility(true);
        for (const [key, block] of ctx.blocks) {
          const cfg = ctx.lightConfig(block.type);
          if (cfg) {
            const light = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance);
            light.position.set(block.position.x, block.position.y + 0.2, block.position.z);
            ctx.scene.add(light);
            ctx.blockLights.set(key, light);
          }
        }
        spawnCreatures(ctx, worldSeed);
        ctx.onProgress?.('完成', 1);
        resolve();
      }
    }

    setTimeout(processBatch, 0);
  });
}
