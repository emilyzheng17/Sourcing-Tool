import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createEnrichListJob,
  enrichListEmit,
  enrichListSubscribe,
  deriveEnrichListSnapshot,
  runEnrichListJobTracked,
} from "../enrichListJobs.js";

test("enrichListEmit buffers events for replay", () => {
  const job = createEnrichListJob([{ Company: "Acme" }]);
  enrichListEmit(job, { type: "progress", processed: 0, total: 1 });
  enrichListEmit(job, { type: "row", index: 0, status: "ok", enriched: { Company: "Acme" } });

  assert.equal(job.events.length, 2);
  assert.equal(job.events[0].type, "progress");
  assert.equal(job.events[1].type, "row");
});

test("enrichListSubscribe replays buffered events to late subscriber", () => {
  const job = createEnrichListJob([{ Company: "Acme" }, { Company: "Beta" }]);
  enrichListEmit(job, { type: "progress", processed: 0, total: 2 });
  enrichListEmit(job, { type: "row", index: 0, status: "ok", enriched: { Company: "Acme" } });
  enrichListEmit(job, { type: "progress", processed: 1, total: 2 });
  enrichListEmit(job, { type: "done", total: 2, processed: 2 });

  const received = [];
  const unsubscribe = enrichListSubscribe(job, (evt) => received.push(evt));

  assert.equal(received.length, 4);
  assert.deepEqual(
    received.map((e) => e.type),
    ["progress", "row", "progress", "done"],
  );

  enrichListEmit(job, { type: "progress", processed: 2, total: 2 });
  assert.equal(received.length, 5);
  assert.equal(received[4].processed, 2);

  unsubscribe();
  enrichListEmit(job, { type: "progress", processed: 2, total: 2 });
  assert.equal(received.length, 5);
});

test("runEnrichListJobTracked emits error and done on failure", async () => {
  const job = createEnrichListJob([{ Company: "FailCo" }]);
  const received = [];
  enrichListSubscribe(job, (evt) => received.push(evt));

  await runEnrichListJobTracked(job, {}, async (_rows, _env, emit) => {
    emit({ type: "progress", processed: 0, total: 1 });
    throw new Error("boom");
  });

  assert.equal(job.status, "error");
  assert.deepEqual(
    received.map((e) => e.type),
    ["progress", "error", "done"],
  );
  assert.equal(received[1].message, "boom");
  assert.equal(received[2].failed, true);
});

test("deriveEnrichListSnapshot reflects latest progress", () => {
  const job = createEnrichListJob([{ Company: "A" }, { Company: "B" }]);
  enrichListEmit(job, { type: "progress", processed: 0, total: 2 });
  job.status = "running";

  assert.deepEqual(deriveEnrichListSnapshot(job), {
    status: "running",
    processed: 0,
    total: 2,
  });

  enrichListEmit(job, { type: "progress", processed: 2, total: 2 });
  job.status = "done";

  assert.deepEqual(deriveEnrichListSnapshot(job), {
    status: "done",
    processed: 2,
    total: 2,
  });
});

test("runEnrichListJobTracked starts only once", async () => {
  const job = createEnrichListJob([{ Company: "Once" }]);
  let runs = 0;

  const fakeRun = async (_rows, _env, emit) => {
    runs += 1;
    emit({ type: "done", total: 1, processed: 1 });
  };

  await Promise.all([
    runEnrichListJobTracked(job, {}, fakeRun),
    runEnrichListJobTracked(job, {}, fakeRun),
  ]);

  assert.equal(runs, 1);
  assert.equal(job.status, "done");
});
