import { buildMesh, meshResultTransfers } from '../core/meshBuilder';
import type { MeshReply, MeshRequest } from './meshProtocol';

const worker = self as unknown as {
  onmessage: (event: MessageEvent<MeshRequest>) => void;
  postMessage(message: MeshReply, transfer?: Transferable[]): void;
};
worker.onmessage = ({ data }) => {
  try {
    const start = performance.now();
    const parts = buildMesh(data.snapshot);
    worker.postMessage(
      { type: 'mesh', id: data.id, parts, buildMs: performance.now() - start },
      meshResultTransfers(parts),
    );
  } catch (error) {
    worker.postMessage({ type: 'error', id: data.id, message: String(error) });
  }
};
