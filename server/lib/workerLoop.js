/**
 * Generic worker loop with pause/resume/stop support.
 * Wakes immediately when a new job is enqueued via queueSignal,
 * falling back to pollIntervalMs when no signal arrives.
 * Shared by the enrichment and classification workers.
 */

import { getBuildJob } from "../db.js";
import queueSignal from "./queueSignal.js";

/**
 * @param {object} opts
 * @param {string}   opts.jobId
 * @param {number}   [opts.pollIntervalMs=2000]
 * @param {() => Promise<boolean>} opts.processBatch - return true if work was done
 * @param {() => boolean} opts.isStopped - external stop signal
 * @param {() => number | undefined} [opts.getDeadline]
 * @param {() => void} [opts.onDeadline]
 */
export function startWorkerLoop({
  jobId,
  pollIntervalMs = 2000,
  processBatch,
  isStopped,
  getDeadline,
  onDeadline,
}) {
  let running = true;
  let deadlineHandled = false;
  let wakeResolve = null;

  function wakeUp() {
    if (wakeResolve) {
      const r = wakeResolve;
      wakeResolve = null;
      r();
    }
  }

  async function waitForWork() {
    await new Promise((resolve) => {
      wakeResolve = resolve;
      const onEnqueued = () => {
        clearTimeout(fallback);
        wakeResolve = null;
        resolve();
      };
      const fallback = setTimeout(() => {
        queueSignal.removeListener("enqueued", onEnqueued);
        wakeResolve = null;
        resolve();
      }, pollIntervalMs);
      queueSignal.once("enqueued", onEnqueued);
    });
  }

  async function loop() {
    while (running) {
      const deadline = getDeadline?.();
      if (typeof deadline === "number" && Date.now() > deadline) {
        running = false;
        if (!deadlineHandled) {
          deadlineHandled = true;
          try { onDeadline?.(); } catch { /* noop */ }
        }
        return;
      }

      if (isStopped?.()) {
        running = false;
        return;
      }

      const job = getBuildJob(jobId);
      if (!job || job.status === "STOPPED" || job.status === "DONE" || job.status === "ERROR") {
        running = false;
        return;
      }

      if (job.status === "PAUSED") {
        await waitForWork();
        continue;
      }

      try {
        const didWork = await processBatch();
        if (!didWork) {
          await waitForWork();
        }
      } catch (e) {
        console.error(`[workerLoop/${jobId}] error:`, e.message);
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs * 3));
      }
    }
  }

  loop();

  return {
    stop() {
      running = false;
      wakeUp();
    },
  };
}
