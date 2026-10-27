// node --test tests/trainingRules.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { certificateRule, courseFinished, allFinished } from '../src/services/trainingRules.js';

test('certificate rule follows the course settings', () => {
  assert.equal(certificateRule({ certificateEnabled: false }), 'none');
  assert.equal(certificateRule({ certificateEnabled: true, certificateRequiresApproval: false }), 'auto');
  assert.equal(certificateRule({ certificateEnabled: true, certificateRequiresApproval: true }), 'approval');
});
test('a course without approval is finished when lessons and quizzes are done', () => {
  const at = new Date('2026-10-20');
  assert.deepEqual(courseFinished({ rule: 'auto', completedAt: null }), { finished: false, finishedAt: null, waitingFor: 'lessons' });
  assert.equal(courseFinished({ rule: 'auto', completedAt: at }).finished, true);
  assert.equal(courseFinished({ rule: 'none', completedAt: at }).finishedAt, at);
});
test('a course with approval waits for the certificate', () => {
  const at = new Date('2026-10-20'); const ok = new Date('2026-10-22');
  assert.equal(courseFinished({ rule: 'approval', completedAt: at, certificate: { status: 'pending' } }).waitingFor, 'approval');
  assert.equal(courseFinished({ rule: 'approval', completedAt: at, certificate: null }).finished, false);
  assert.equal(courseFinished({ rule: 'approval', completedAt: at, certificate: { status: 'revoked' } }).waitingFor, 'revoked');
  const done = courseFinished({ rule: 'approval', completedAt: at, certificate: { status: 'issued', authorizedAt: ok } });
  assert.equal(done.finished, true); assert.equal(done.finishedAt, ok);
  assert.equal(courseFinished({ rule: 'approval', completedAt: at, certificate: { code: 'old' } }).finished, true, 'older certificates without a status count as issued');
});
test('training is finished only when every course is', () => {
  assert.equal(allFinished([]), false);
  assert.equal(allFinished([{ finished: true }, { finished: false }]), false);
  assert.equal(allFinished([{ finished: true }, { finished: true }]), true);
});
