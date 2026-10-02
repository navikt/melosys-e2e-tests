import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import TestSummaryReporter from '../reporters/test-summary';

/**
 * Et forsøk som timer ut eller blir avbrutt, er et feilet forsøk. Uten det ble timeout og så grønt
 * stående som «passed» i stedet for «flaky», og en @known-error-test som timet ut gjorde kjøringen rød.
 */
type Status = 'passed' | 'failed' | 'timedOut' | 'interrupted' | 'skipped';

type Forsøk = Status | { status: Status; feil?: string; dockerFeil?: object };

function kjør(tester: { title: string; knownError?: boolean; forsøk: Forsøk[] }[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-summary-'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const reporter = new TestSummaryReporter();
    for (const t of tester) {
      const testCase = {
        title: t.title,
        location: { file: '/repo/tests/a.spec.ts', line: 1, column: 1 },
        annotations: t.knownError ? [{ type: 'known-error' }] : [],
        tags: [],
      };
      for (const f of t.forsøk) {
        const { status, feil, dockerFeil } = typeof f === 'string' ? { status: f, feil: undefined, dockerFeil: undefined } : f;
        const attachments = dockerFeil
          ? [{ name: 'docker-logs-errors', contentType: 'application/json', body: Buffer.from(JSON.stringify(dockerFeil)) }]
          : [];
        reporter.onTestEnd(testCase as any, { status, duration: 10, attachments, error: feil ? { message: feil } : undefined } as any);
      }
    }
    reporter.onEnd({ status: 'passed', startTime: new Date(), duration: 100 } as any);
    const summary = JSON.parse(fs.readFileSync(path.join(dir, 'playwright-report', 'test-summary.json'), 'utf-8'));
    const perTest = Object.fromEntries(summary.tests.map((t: any) => [t.title, t]));
    return { status: summary.status, perTest };
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('timeout og så grønt er flaky', () => {
  const { status, perTest } = kjør([{ title: 'tp', forsøk: ['timedOut', 'passed'] }]);
  assert.equal(perTest.tp.status, 'flaky');
  assert.equal(perTest.tp.failedAttempts, 1);
  assert.equal(status, 'passed');
});

test('avbrutt og så grønt er flaky', () => {
  const { perTest } = kjør([{ title: 'ip', forsøk: ['interrupted', 'passed'] }]);
  assert.equal(perTest.ip.status, 'flaky');
});

test('@known-error som timer ut, er known-error-failed og gjør ikke kjøringen rød', () => {
  const { status, perTest } = kjør([{ title: 'kt', knownError: true, forsøk: ['timedOut'] }]);
  assert.equal(perTest.kt.status, 'known-error-failed');
  assert.equal(perTest.kt.failedAttempts, 1);
  assert.equal(status, 'passed');
});

test('timeout på alle forsøk er failed og teller hvert forsøk', () => {
  const { status, perTest } = kjør([{ title: 'tt', forsøk: ['failed', 'timedOut'] }]);
  assert.equal(perTest.tt.status, 'failed');
  assert.equal(perTest.tt.failedAttempts, 2);
  assert.equal(status, 'failed');
});

test('docker-feil fra et forsøk som timer ut, tas med', () => {
  const dockerFeil = [{ service: 'melosys-api', errors: [{ timestamp: '2026-10-02T12:00:00Z', message: 'ERROR noe gikk galt' }] }];
  const { perTest } = kjør([{ title: 'td', forsøk: [{ status: 'timedOut', feil: 'Test timeout of 1500ms exceeded.', dockerFeil }] }]);
  assert.deepEqual(perTest.td.dockerErrors, dockerFeil);
});

test('feilene fra et tidligere forsøk overlever at neste forsøk timer ut', () => {
  const prosessfeil = 'Timed out waiting for process instance OPPRETT_SAK';
  const dockerFeil = [{ service: 'melosys-api', errors: [{ timestamp: '2026-10-02T12:00:00Z', message: 'ERROR noe gikk galt' }] }];
  const { perTest } = kjør([
    {
      title: 'pt',
      forsøk: [
        { status: 'failed', feil: prosessfeil, dockerFeil },
        { status: 'timedOut', feil: 'Test timeout of 1500ms exceeded.' },
      ],
    },
  ]);
  assert.equal(perTest.pt.processErrors, prosessfeil);
  assert.deepEqual(perTest.pt.dockerErrors, dockerFeil);
});
