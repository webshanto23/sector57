/**
 * A small in-memory cache of promises for `ttlMs`. Callers asking for the same key while a
 * value is being built share that one promise; a failed build is forgotten at once. A TTL of
 * 0 turns caching off. Expired entries are swept when the cache is full, and if it is still
 * full the oldest entry goes.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { expires: number; value: Promise<T> }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string, build: () => Promise<T>): Promise<T> {
    if (this.ttlMs <= 0) return build();
    const at = this.now();
    const hit = this.entries.get(key);
    if (hit && hit.expires > at) return hit.value;
    if (hit) this.entries.delete(key);

    this.makeRoom(at);
    const value = build();
    this.entries.set(key, { expires: at + this.ttlMs, value });
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    return value;
  }

  get size(): number {
    return this.entries.size;
  }

  private makeRoom(at: number) {
    if (this.entries.size < this.maxEntries) return;
    for (const [key, entry] of this.entries) if (entry.expires <= at) this.entries.delete(key);
    // Maps keep insertion order: the first key is the oldest.
    while (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
  }
}
