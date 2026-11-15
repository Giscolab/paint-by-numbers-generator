import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageProcessingWorker } from '@/lib/imageProcessingWorker';
import { IMAGE_PROCESSING } from '@/config/constants';

class TestWorker {
  static current: TestWorker | undefined;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { TestWorker.current = this; }
  emit(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
}

describe('image generation worker lifecycle', () => {
  let processor: ImageProcessingWorker;
  beforeEach(() => {
    vi.useFakeTimers();
    TestWorker.current = undefined;
    vi.stubGlobal('Worker', TestWorker);
    vi.stubGlobal('createImageBitmap', undefined);
    processor = new ImageProcessingWorker();
  });
  afterEach(() => { processor.terminate(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  const process = (instance: ImageProcessingWorker) => instance.processImage(
    new File(['pixels'], 'photo.png', { type: 'image/png' }), 8, 20, 0, 0, false,
  );
  async function start() {
    const promise = process(processor);
    for (let i = 0; i < 10 && !TestWorker.current; i++) await Promise.resolve();
    expect(TestWorker.current).toBeDefined();
    return { promise, worker: TestWorker.current! };
  }

  it('waits for completion after receiving a success payload', async () => {
    const { promise, worker } = await start();
    const result = { palette: ['#ffffff'], zones: [] };
    const settled = vi.fn();
    void promise.then(settled);
    worker.emit({ type: 'success', payload: result });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    worker.emit({ type: 'done' });
    expect(await promise).toEqual(result);
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(IMAGE_PROCESSING.WORKER_IDLE_TIMEOUT_MS);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects a result that never receives its final done message instead of hanging forever', async () => {
    const { promise, worker } = await start();
    const assertion = expect(promise).rejects.toThrow('Timeout');
    worker.emit({ type: 'success', payload: { palette: [], zones: [] } });
    await vi.advanceTimersByTimeAsync(IMAGE_PROCESSING.WORKER_TIMEOUT_MS);
    await assertion;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles an active request with AbortError when explicitly terminated', async () => {
    const { promise, worker } = await start();
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    processor.terminate();
    await assertion;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can start a new request after cancellation without retaining the canceled result', async () => {
    const first = await start();
    const canceled = expect(first.promise).rejects.toMatchObject({ name: 'AbortError' });
    processor.terminate(); await canceled;
    TestWorker.current = undefined;
    const second = await start();
    second.worker.emit({ type: 'done' });
    await expect(second.promise).rejects.toThrow('sans résultat');
  });

  it('rejects a simultaneous generation while leaving the first request intact', async () => {
    const first = await start();
    await expect(process(processor)).rejects.toThrow('déjà en cours');
    first.worker.emit({ type: 'success', payload: { palette: ['#000000'] } });
    first.worker.emit({ type: 'done' });
    expect(await first.promise).toEqual({ palette: ['#000000'] });
  });

  it('reports a worker crash, releases resources and ignores subsequent stale messages', async () => {
    const { promise, worker } = await start();
    const assertion = expect(promise).rejects.toThrow('decoder crashed');
    worker.onerror?.({ message: 'decoder crashed' } as ErrorEvent);
    worker.emit({ type: 'success', payload: { palette: ['#ffffff'] } });
    worker.emit({ type: 'done' });
    await assertion;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('validates input before allocating a worker', async () => {
    await expect(processor.processImage(new File([], 'empty.png', { type: 'image/png' }), 8, 20, 0, 0, false)).rejects.toThrow('vide');
    expect(TestWorker.current).toBeUndefined();
  });
});
