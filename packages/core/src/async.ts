/**
 * Runs `task` over `inputs` with at most `concurrency` tasks in flight and
 * yields the results in input order. Stops early when `signal` aborts.
 */
export async function* mapOrdered<I, O>(
  inputs: readonly I[],
  concurrency: number,
  task: (input: I, index: number) => Promise<O>,
  signal?: AbortSignal,
): AsyncGenerator<O> {
  const limit = Math.max(1, Math.floor(concurrency));
  const pending = new Map<number, Promise<O>>();
  let next = 0;

  const launch = () => {
    while (pending.size < limit && next < inputs.length && !signal?.aborted) {
      const index = next++;
      const promise = task(inputs[index]!, index);
      // Avoid unhandled rejections for results not awaited yet.
      promise.catch(() => undefined);
      pending.set(index, promise);
    }
  };

  for (let index = 0; index < inputs.length; index++) {
    if (signal?.aborted) return;
    launch();
    const current = pending.get(index);
    if (!current) return;
    try {
      yield await current;
    } finally {
      pending.delete(index);
    }
  }
}
