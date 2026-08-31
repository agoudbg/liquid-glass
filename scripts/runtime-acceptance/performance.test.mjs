import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateRelativePerformanceRuns,
} from './performance.mjs';

function createRun({
  captureLongTaskCount = 0,
  captureLongTaskP95Ms = 0,
  captureP95Ms,
  captureSampleCount = 100,
  frameLongTaskCount = 0,
  frameLongTaskP95Ms = 0,
  frameP95Ms,
  frameSampleCount = 100,
}) {
  return {
    capture: {
      longTaskCount: captureLongTaskCount,
      longTaskDurationP95Ms: captureLongTaskP95Ms,
      p95Ms: captureP95Ms,
      sampleCount: captureSampleCount,
    },
    frame: {
      longTaskCount: frameLongTaskCount,
      longTaskDurationP95Ms: frameLongTaskP95Ms,
      p95Ms: frameP95Ms,
      sampleCount: frameSampleCount,
    },
    longTaskCount: captureLongTaskCount + frameLongTaskCount,
  };
}

function repeatRun(run) {
  return [run, run, run];
}

test('accepts more short long tasks when every latency severity improves', () => {
  const evaluation = evaluateRelativePerformanceRuns({
    candidate: repeatRun(createRun({
      captureLongTaskCount: 120,
      captureLongTaskP95Ms: 70,
      captureP95Ms: 20,
      frameLongTaskCount: 170,
      frameLongTaskP95Ms: 80,
      frameP95Ms: 80,
    })),
    legacy: repeatRun(createRun({
      captureLongTaskCount: 60,
      captureLongTaskP95Ms: 170,
      captureP95Ms: 170,
      frameLongTaskCount: 10,
      frameLongTaskP95Ms: 130,
      frameP95Ms: 130,
    })),
  });

  assert.equal(evaluation.passed, true);
  assert.deepEqual(evaluation.failures, []);
  assert.equal(evaluation.summary.candidate.longTaskCountMedian, 290);
  assert.equal(evaluation.summary.legacy.longTaskCountMedian, 70);
});

test('rejects worse long-task duration even when the candidate has fewer tasks', () => {
  const evaluation = evaluateRelativePerformanceRuns({
    candidate: repeatRun(createRun({
      captureLongTaskCount: 1,
      captureLongTaskP95Ms: 100,
      captureP95Ms: 20,
      frameP95Ms: 20,
    })),
    legacy: repeatRun(createRun({
      captureLongTaskCount: 20,
      captureLongTaskP95Ms: 60,
      captureP95Ms: 30,
      frameP95Ms: 30,
    })),
  });

  assert.equal(evaluation.passed, false);
  assert.deepEqual(evaluation.failures, [
    'Candidate P95 long-task duration 100ms exceeds 66ms.',
  ]);
});

test('rejects candidate frame and capture P95 latency regressions', () => {
  const evaluation = evaluateRelativePerformanceRuns({
    candidate: repeatRun(createRun({
      captureP95Ms: 120,
      frameP95Ms: 120,
    })),
    legacy: repeatRun(createRun({
      captureP95Ms: 100,
      frameP95Ms: 100,
    })),
  });

  assert.equal(evaluation.passed, false);
  assert.deepEqual(evaluation.failures, [
    'Candidate P95 frame time 120ms exceeds 110ms.',
    'Candidate P95 capture latency 120ms exceeds 115ms.',
  ]);
});
