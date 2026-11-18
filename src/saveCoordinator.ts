export const AUTOSAVE_INTERVAL_MS = 60_000;

export type SaveResult<List> =
  | { status: 'committed'; list: List }
  | { status: 'committed-list-failed'; error: unknown }
  | { status: 'write-failed'; error: unknown };

function batch<Data, List>(data: Data) {
  let finish!: (result: SaveResult<List>) => void;
  const done = new Promise<SaveResult<List>>(resolve => { finish = resolve; });
  return { data, done, finish };
}
type Batch<Data, List> = ReturnType<typeof batch<Data, List>>;
type Lane<Data, List> = { active: Batch<Data, List>; next?: Batch<Data, List> };

/** One in-flight snapshot and at most one replacement per world. The caller
 * supplies detached snapshots, so finishing a request never needs a live game.
 * Requests replaced before writing share the result of the newest snapshot. */
export class SaveCoordinator<Data, List> {
  private readonly lanes = new Map<string, Lane<Data, List>>();
  private readonly write: (id: string, data: Data) => Promise<void>;
  private readonly list: () => Promise<List>;

  constructor(write: (id: string, data: Data) => Promise<void>, list: () => Promise<List>) {
    this.write = write;
    this.list = list;
  }

  busy(id: string) { return this.lanes.has(id); }

  request(id: string, data: Data): Promise<SaveResult<List>> {
    const running = this.lanes.get(id);
    if (running) {
      if (running.next) running.next.data = data;
      else running.next = batch<Data, List>(data);
      return running.next.done;
    }
    const active = batch<Data, List>(data);
    const lane = { active };
    this.lanes.set(id, lane);
    void this.drain(id, lane);
    return active.done;
  }

  async whenIdle(id: string) {
    let lane;
    while ((lane = this.lanes.get(id))) await (lane.next ?? lane.active).done;
  }

  private async drain(id: string, lane: Lane<Data, List>) {
    for (;;) {
      let result: SaveResult<List>;
      try {
        await this.write(id, lane.active.data);
        try { result = { status: 'committed', list: await this.list() }; }
        catch (error) { result = { status: 'committed-list-failed', error }; }
      } catch (error) { result = { status: 'write-failed', error }; }
      lane.active.finish(result);
      if (!lane.next) break;
      lane.active = lane.next;
      lane.next = undefined;
    }
    this.lanes.delete(id);
  }
}
