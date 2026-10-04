import { AIRequestScheduler } from '../services/aiRequestScheduler';

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('permits two overlapping requests but never a third, with paced starts', async () => {
  const scheduler = new AIRequestScheduler();
  const releaseFirst = await scheduler.acquire(1000);
  let second = false;
  let third = false;
  const p2 = scheduler.acquire(1000).then(release => { second = true; return release; });
  const p3 = scheduler.acquire(1000).then(release => { third = true; return release; });
  jest.advanceTimersByTime(5999);
  await flush();
  expect(second).toBe(false);
  jest.advanceTimersByTime(1);
  const releaseSecond = await p2;
  expect(second).toBe(true);
  jest.advanceTimersByTime(6000);
  await flush();
  expect(third).toBe(false);
  releaseFirst();
  const releaseThird = await p3;
  expect(third).toBe(true);
  releaseSecond(); releaseThird();
});

it('holds a request until enough estimated tokens expire and reports countdowns', async () => {
  const scheduler = new AIRequestScheduler();
  (await scheduler.acquire(7000))();
  const progress = jest.fn();
  let started = false;
  const pending = scheduler.acquire(4000, progress).then(release => { started = true; return release; });
  jest.advanceTimersByTime(59000);
  await flush();
  expect(started).toBe(false);
  expect(progress).toHaveBeenLastCalledWith({ phase: 'quota', waitMs: 1000 });
  jest.advanceTimersByTime(1000);
  (await pending)();
  expect(started).toBe(true);
});

it('extends a shared cooldown for queued requests without releasing a retry storm', async () => {
  const scheduler = new AIRequestScheduler();
  (await scheduler.acquire(1000))();
  const progress = jest.fn();
  let started = false;
  const pending = scheduler.acquire(1000, progress).then(release => { started = true; return release; });
  scheduler.defer(60000);
  jest.advanceTimersByTime(30000);
  scheduler.defer(60000);
  jest.advanceTimersByTime(59999);
  await flush();
  expect(started).toBe(false);
  expect(progress).toHaveBeenCalledWith({ phase: 'cooldown', waitMs: 60000 });
  jest.advanceTimersByTime(1);
  (await pending)();
});

it('enforces request-per-minute limits even for tiny prompts', async () => {
  const scheduler = new AIRequestScheduler();
  const starts: number[] = [];
  const operations = Array.from({ length: 11 }, () => scheduler.acquire(1).then(release => {
    starts.push(Date.now()); release();
  }));
  await flush();
  for (let i = 0; i < 10; i++) { jest.advanceTimersByTime(6000); await flush(); }
  await Promise.all(operations);
  expect(starts[10] - starts[0]).toBeGreaterThanOrEqual(60000);
});

it('rejects already queued requests when Azure asks for a cooldown beyond the automatic wait limit', async () => {
  const scheduler = new AIRequestScheduler();
  (await scheduler.acquire(1000))();
  const pending = scheduler.acquire(1000);
  const rejected = expect(pending).rejects.toMatchObject({ code: 'rate_limit', retryAfterMs: 180000 });
  scheduler.defer(180000);
  await rejected;
  expect(jest.getTimerCount()).toBe(0);
});
