import type { MeshPart } from '../core/meshBuilder';
import type { MeshSnapshot } from '../core/meshSnapshot';

export type MeshRequest = { id: number; snapshot: MeshSnapshot };
export type MeshReply =
  | { id: number; type: 'mesh'; parts: MeshPart[]; buildMs: number }
  | { id: number; type: 'error'; message: string };
/** Small injectable surface for deterministic lifecycle tests. */
export type MeshWorkerLike = {
  onmessage: ((event: MessageEvent<MeshReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: MeshRequest, transfer: Transferable[]): void;
  terminate(): void;
};
