import { chunkKey, toChunkCoord } from './chunk';

export type ChunkRequest = {
  chunkX: number;
  chunkZ: number;
  distanceSq: number;
};

export type ChunkManager = {
  loadRadius: number;
  unloadRadius: number;
  requestedChunks: Set<string>;
  pendingRequests: ChunkRequest[];
  getChunksInRadius: (worldX: number, worldZ: number, radius?: number) => ChunkRequest[];
  enqueueRadius: (worldX: number, worldZ: number, radius?: number) => number;
  takeNextRequest: () => ChunkRequest | null;
  markRequested: (chunkX: number, chunkZ: number) => boolean;
  hasRequested: (chunkX: number, chunkZ: number) => boolean;
  unmarkRequested: (chunkX: number, chunkZ: number) => void;
  isOutsideUnloadRadius: (worldX: number, worldZ: number, chunkX: number, chunkZ: number) => boolean;
  clear: () => void;
};

export function createChunkManager(loadRadius = 3, unloadRadius = loadRadius + 2): ChunkManager {
  const requestedChunks = new Set<string>();
  const pendingRequests: ChunkRequest[] = [];

  function getChunksInRadius(worldX: number, worldZ: number, radius = loadRadius): ChunkRequest[] {
    const { chunkX: centerChunkX, chunkZ: centerChunkZ } = toChunkCoord(worldX, worldZ);
    const requests: ChunkRequest[] = [];

    for (let chunkX = centerChunkX - radius; chunkX <= centerChunkX + radius; chunkX += 1) {
      for (let chunkZ = centerChunkZ - radius; chunkZ <= centerChunkZ + radius; chunkZ += 1) {
        const dx = chunkX - centerChunkX;
        const dz = chunkZ - centerChunkZ;
        requests.push({ chunkX, chunkZ, distanceSq: dx * dx + dz * dz });
      }
    }

    return requests.sort((a, b) => a.distanceSq - b.distanceSq);
  }

  function markRequested(chunkX: number, chunkZ: number) {
    const key = chunkKey(chunkX, chunkZ);
    if (requestedChunks.has(key)) return false;
    requestedChunks.add(key);
    return true;
  }

  function hasRequested(chunkX: number, chunkZ: number) {
    return requestedChunks.has(chunkKey(chunkX, chunkZ));
  }

  function unmarkRequested(chunkX: number, chunkZ: number) {
    requestedChunks.delete(chunkKey(chunkX, chunkZ));
  }

  function isOutsideUnloadRadius(worldX: number, worldZ: number, chunkX: number, chunkZ: number) {
    const center = toChunkCoord(worldX, worldZ);
    return Math.abs(chunkX - center.chunkX) > unloadRadius || Math.abs(chunkZ - center.chunkZ) > unloadRadius;
  }

  function enqueueRadius(worldX: number, worldZ: number, radius = loadRadius) {
    let added = 0;
    for (const request of getChunksInRadius(worldX, worldZ, radius)) {
      if (hasRequested(request.chunkX, request.chunkZ)) continue;
      pendingRequests.push(request);
      added += 1;
    }
    return added;
  }

  function takeNextRequest() {
    while (pendingRequests.length > 0) {
      const next = pendingRequests.shift()!;
      if (hasRequested(next.chunkX, next.chunkZ)) continue;
      return next;
    }
    return null;
  }

  function clear() {
    requestedChunks.clear();
    pendingRequests.length = 0;
  }

  return {
    loadRadius,
    unloadRadius,
    requestedChunks,
    pendingRequests,
    getChunksInRadius,
    enqueueRadius,
    takeNextRequest,
    markRequested,
    hasRequested,
    unmarkRequested,
    isOutsideUnloadRadius,
    clear,
  };
}
