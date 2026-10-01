import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageTagsFromEnv } from '../reporters/test-summary';

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
