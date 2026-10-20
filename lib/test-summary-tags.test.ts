import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageTagsFromEnv, pinsFromEnv } from '../reporters/test-summary';

/**
 * Plan-jobben i e2e-tests.yml pinner taggene til «<tag>@sha256:…» for docker compose. I
 * test-summary.json skal `tags` fortsatt være taggen alene: summary-generator skjuler `latest`,
 * og melosys-console viser verdien som «Testet image».
 */
const DIGEST = 'sha256:' + 'a'.repeat(64);

test('pinnet tag skrives uten digest', () => {
  const tags = imageTagsFromEnv({ MELOSYS_API_TAG: `latest@${DIGEST}`, MELOSYS_WEB_TAG: `abc123@${DIGEST}` });
  assert.deepEqual(tags, { 'melosys-api': 'latest', 'melosys-web': 'abc123' });
});

test('tag uten digest skrives uendret, og tomme variabler utelates', () => {
  const tags = imageTagsFromEnv({ MELOSYS_API_TAG: 'min-tag', MELOSYS_WEB_TAG: '' });
  assert.deepEqual(tags, { 'melosys-api': 'min-tag' });
});

test('skjema-api og skjema-web er med i tags, som i resolvedTags', () => {
  const tags = imageTagsFromEnv({ MELOSYS_SKJEMA_API_TAG: `latest@${DIGEST}`, MELOSYS_SKJEMA_WEB_TAG: 'abc' });
  assert.deepEqual(tags, { 'melosys-skjema-api': 'latest', 'melosys-skjema-web': 'abc' });
});

test('pinnene fra plan-jobben leses fra E2E_PINS', () => {
  const pin = { tag: 'a'.repeat(40), jira: 'MELOSYS-9000', utloper: '2026-11-03' };
  assert.deepEqual(pinsFromEnv({ E2E_PINS: JSON.stringify({ 'melosys-web': pin }) }), { 'melosys-web': pin });
  assert.equal(pinsFromEnv({ E2E_PINS: '' }), undefined);
  assert.equal(pinsFromEnv({ E2E_PINS: '{}' }), undefined);
  assert.equal(pinsFromEnv({ E2E_PINS: '{ikke json' }), undefined);
});
