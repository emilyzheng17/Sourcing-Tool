/**
 * In-memory enrich-list job state with buffered SSE events for replay.
 */

export function createEnrichListJob(rows, options = {}) {
  return {
    status: "pending",
    rows,
    options,
    events: [],
    subscribers: new Set(),
    started: false,
  };
}

export function enrichListEmit(job, evt) {
  job.events.push(evt);
  for (const fn of job.subscribers) {
    try {
      fn(evt);
    } catch {
      /* ignore */
    }
  }
}

/** Replay buffered events, then subscribe for live updates. Returns unsubscribe fn. */
export function enrichListSubscribe(job, send) {
  for (const evt of job.events) {
    send(evt);
  }
  const listener = (evt) => send(evt);
  job.subscribers.add(listener);
  return () => job.subscribers.delete(listener);
}

export function deriveEnrichListSnapshot(job) {
  if (!job) return null;
  let processed = 0;
  let total = job.rows?.length ?? 0;
  for (const evt of job.events) {
    if (evt.type === "progress") {
      processed = evt.processed ?? processed;
      total = evt.total ?? total;
    }
    if (evt.type === "done") {
      processed = evt.processed ?? processed;
      total = evt.total ?? total;
    }
  }
  return { status: job.status, processed, total };
}

export async function runEnrichListJobTracked(job, env, runEnrichListJob) {
  if (job.started) return;
  job.started = true;
  job.status = "running";

  const emit = (evt) => enrichListEmit(job, evt);

  try {
    await runEnrichListJob(job.rows, env, emit, job.options);
    job.status = "done";
  } catch (e) {
    emit({ type: "error", message: e.message || String(e) });
    emit({ type: "done", total: job.rows.length, processed: 0, failed: true });
    job.status = "error";
  }
}
