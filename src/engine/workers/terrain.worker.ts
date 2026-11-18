import { TerrainGenerator } from '../core/generator';
import { packChunk } from '../core/chunkTransfer';
import type { TerrainRequest, TerrainReply } from './protocol';

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<TerrainRequest>) => void;
  postMessage(message: TerrainReply, transfer?: Transferable[]): void;
};
let generator: TerrainGenerator | undefined;
scope.onmessage = ({ data }) => {
  if (data.type === 'init') {
    generator = new TerrainGenerator(data.seed, data.settings, data.version);
    return;
  }
  try {
    if (!generator) throw new Error('地形 Worker 未初始化');
    const start = performance.now();
    const terrain = generator.generate(data.x, data.z);
    const generated = performance.now();
    const chunk = packChunk(terrain);
    scope.postMessage(
      {
        type: 'chunk',
        id: data.id,
        chunk,
        generationMs: generated - start,
        packingMs: performance.now() - generated,
      },
      [chunk.indices.buffer, chunk.values.buffer],
    );
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id: data.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
