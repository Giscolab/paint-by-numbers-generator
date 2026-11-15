import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredProject } from '@/lib/projectStore';

const DB_NAME = 'paint-by-numbers-studio';
const fixture = (id: string, timestamp = 100): StoredProject => ({
  id, name: `Projet ${id}`, timestamp,
  imageFile: new File(['image bytes'], 'example.png', { type: 'image/png' }),
  sourceType: 'raster',
  settings: {
    numColors: 3, minRegionSize: 20, smoothness: 0, mergeTolerance: 0,
    enableArtisticMerge: false, smartPalette: false, paintEffect: 'none',
    paintIntensity: 0, artisticEffect: 'none', artisticIntensity: 0, profilingEnabled: false,
  },
  result: {
    contours: null, numbered: null, colorized: null,
    palette: ['#ffffff', '#000000'], zones: [], svg: '<svg/>', legend: [],
    labels: new Int32Array([0, 1, 0]), colorZoneMapping: new Map([[0, [1, 3]], [1, [2]]]),
  },
});

async function openLegacy(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => request.result.createObjectStore('legacy');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('local project persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('indexedDB', new IDBFactory());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips typed region labels, color mappings, settings and source bytes', async () => {
    const store = await import('@/lib/projectStore');
    const input = fixture('a');
    await store.saveStoredProject(input);
    const restored = await store.loadStoredProject('a');
    expect(restored?.name).toBe(input.name);
    expect(restored?.settings).toEqual(input.settings);
    expect(restored?.result.labels).toBeInstanceOf(Int32Array);
    expect(restored?.result.labels).toEqual(input.result.labels);
    expect(restored?.result.colorZoneMapping).toBeInstanceOf(Map);
    expect(restored?.result.colorZoneMapping?.get(0)).toEqual([1, 3]);
    expect(await restored?.imageFile.text()).toBe('image bytes');
  });

  it('stores a snapshot independent from subsequent in-memory edits', async () => {
    const store = await import('@/lib/projectStore');
    const input = fixture('a');
    await store.saveStoredProject(input);
    input.settings.numColors = 70;
    input.result.labels![0] = 99;
    input.result.colorZoneMapping!.get(0)!.push(99);
    const restored = await store.loadStoredProject('a');
    expect(restored?.settings.numColors).toBe(3);
    expect(restored?.result.labels?.[0]).toBe(0);
    expect(restored?.result.colorZoneMapping?.get(0)).toEqual([1, 3]);
  });

  it('lists only summaries ordered newest first', async () => {
    const store = await import('@/lib/projectStore');
    await store.saveStoredProject(fixture('old', 1));
    await store.saveStoredProject(fixture('recent', 100));
    expect(await store.listStoredProjects()).toEqual([
      { id: 'recent', name: 'Projet recent', timestamp: 100 },
      { id: 'old', name: 'Projet old', timestamp: 1 },
    ]);
  });

  it('updates an existing project atomically without duplicate rows', async () => {
    const store = await import('@/lib/projectStore');
    await store.saveStoredProject(fixture('a'));
    await store.saveStoredProject({ ...fixture('a', 200), name: 'Renommé' });
    expect(await store.listStoredProjects()).toEqual([{ id: 'a', name: 'Renommé', timestamp: 200 }]);
  });

  it('deletes only the selected project and tolerates a missing identifier', async () => {
    const store = await import('@/lib/projectStore');
    await store.saveStoredProject(fixture('a')); await store.saveStoredProject(fixture('b'));
    await store.deleteStoredProject('a'); await store.deleteStoredProject('absent');
    expect(await store.loadStoredProject('a')).toBeNull();
    expect((await store.listStoredProjects()).map(item => item.id)).toEqual(['b']);
  });

  it('opens a database newer than the original schema without a VersionError', async () => {
    const legacy = await openLegacy(7); legacy.close();
    const store = await import('@/lib/projectStore');
    await store.saveStoredProject(fixture('migrated'));
    expect((await store.loadStoredProject('migrated'))?.id).toBe('migrated');
  });

  it('adds the project store to a legacy database without deleting unrelated data', async () => {
    const legacy = await openLegacy(1);
    await new Promise<void>((resolve, reject) => {
      const tx = legacy.transaction('legacy', 'readwrite');
      tx.objectStore('legacy').put({ keep: true }, 'saved');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    legacy.close();
    const store = await import('@/lib/projectStore');
    await store.saveStoredProject(fixture('new'));
    const reopened = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const saved = await new Promise((resolve, reject) => {
      const request = reopened.transaction('legacy').objectStore('legacy').get('saved');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    expect(saved).toEqual({ keep: true });
    reopened.close();
  });

  it('rejects an uncloneable save without corrupting existing projects', async () => {
    const store = await import('@/lib/projectStore');
    await store.saveStoredProject(fixture('safe'));
    const invalid = { ...fixture('invalid'), uncloneable: () => undefined };
    await expect(store.saveStoredProject(invalid)).rejects.toThrow();
    expect((await store.listStoredProjects()).map(item => item.id)).toEqual(['safe']);
  });
});
