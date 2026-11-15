import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LRUCache } from '@/lib/lruCache';

describe('LRU processing cache contracts', () => {
  let cache: LRUCache<number>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    cache = new LRUCache<number>(2, 1000);
  });
  afterEach(() => { cache.destroy(); vi.useRealTimers(); });

  it('evicts the least recently read entry rather than the oldest inserted entry', () => {
    cache.set('a', 1); cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.get('b')).toBeNull();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size()).toBe(2);
  });

  it('keeps capacity bounded when the oldest key is the empty string', () => {
    cache.set('', 0); cache.set('b', 2); cache.set('c', 3);
    expect(cache.size()).toBe(2);
    expect(cache.get('')).toBeNull();
  });

  it('updates an entry without evicting an unrelated entry and refreshes its lifetime', () => {
    cache.set('a', 1); cache.set('b', 2);
    vi.advanceTimersByTime(800);
    cache.set('a', 3);
    vi.advanceTimersByTime(300);
    expect(cache.get('a')).toBe(3);
    expect(cache.get('b')).toBeNull();
    expect(cache.size()).toBe(1);
  });

  it('does not renew expiration merely by reading an entry', () => {
    cache.set('a', 1);
    vi.advanceTimersByTime(900);
    expect(cache.get('a')).toBe(1);
    vi.advanceTimersByTime(101);
    expect(cache.get('a')).toBeNull();
  });

  it('reports the oldest age even after access changes recency ordering', () => {
    cache.set('old', 1);
    vi.advanceTimersByTime(400);
    cache.set('new', 2);
    cache.get('old');
    vi.advanceTimersByTime(100);
    expect(cache.getStats()).toEqual({ size: 2, maxSize: 2, oldestAge: 500 });
  });

  it('periodically cleans expired entries without a read', () => {
    cache.set('a', 1);
    vi.advanceTimersByTime(30000);
    expect(cache.size()).toBe(0);
    expect(cache.getStats().oldestAge).toBeNull();
  });

  it('supports falsy values and explicit deletion', () => {
    cache.set('zero', 0);
    expect(cache.get('zero')).toBe(0);
    expect(cache.delete('zero')).toBe(true);
    expect(cache.delete('missing')).toBe(false);
  });

  it('releases its timer and all entries on destroy', () => {
    cache.set('a', 1);
    expect(vi.getTimerCount()).toBe(1);
    cache.destroy();
    expect(cache.size()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
