import { TtlCache } from './ttl-cache.js';

describe('TtlCache', () => {
  let now = 0;
  const clock = () => now;
  beforeEach(() => {
    now = 1_000;
  });

  it('keeps a value for the TTL, then builds again', async () => {
    const cache = new TtlCache<number>(30_000, 10, clock);
    let builds = 0;
    const build = async () => ++builds;
    expect(await cache.get('a', build)).toBe(1);
    now += 29_999;
    expect(await cache.get('a', build)).toBe(1);
    now += 1;
    expect(await cache.get('a', build)).toBe(2);
    expect(await cache.get('b', build)).toBe(3);
  });

  it('shares one build between callers that ask at once', async () => {
    const cache = new TtlCache<string>(30_000, 10, clock);
    const build = vi.fn(async () => 'x');
    await Promise.all([cache.get('a', build), cache.get('a', build)]);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed build', async () => {
    const cache = new TtlCache<string>(30_000, 10, clock);
    await expect(cache.get('a', () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    await Promise.resolve();
    expect(await cache.get('a', async () => 'ok')).toBe('ok');
  });

  it('builds every time with a TTL of 0', async () => {
    const cache = new TtlCache<number>(0, 10, clock);
    let builds = 0;
    await cache.get('a', async () => ++builds);
    await cache.get('a', async () => ++builds);
    expect(builds).toBe(2);
    expect(cache.size).toBe(0);
  });

  it('never grows past its limit: expired entries go first, then the oldest', async () => {
    const cache = new TtlCache<string>(30_000, 2, clock);
    await cache.get('a', async () => 'a');
    now += 20_000;
    await cache.get('b', async () => 'b');
    now += 15_000; // 'a' has expired
    await cache.get('c', async () => 'c');
    expect(cache.size).toBe(2);
    await cache.get('d', async () => 'd'); // 'b' is the oldest
    expect(cache.size).toBe(2);
    expect(await cache.get('c', async () => 'rebuilt')).toBe('c');
    expect(await cache.get('b', async () => 'rebuilt')).toBe('rebuilt');
  });
});
