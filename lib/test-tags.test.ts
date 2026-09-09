/**
 * Unit tests for the shared tag-detection helper.
 *
 * Run tests:
 *   npm run test:unit
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { hasTag } from './test-tags';

describe('hasTag', () => {

  test('finds tag embedded in the title (plain Playwright specs)', () => {
    assert(hasTag({ title: 'skal håndtere kjent feil @known-error #MELOSYS-123' }, '@known-error'));
  });

  test('finds tag in the tags array (playwright-bdd Gherkin @tags)', () => {
    assert(hasTag({ title: 'Innvilget vedtak', tags: ['@known-error'] }, '@known-error'));
  });

  test('is case-insensitive in both title and tags', () => {
    assert(hasTag({ title: 'skal feile @Known-Error' }, '@known-error'));
    assert(hasTag({ title: 'Innvilget vedtak', tags: ['@Expect-Docker-Errors'] }, '@expect-docker-errors'));
  });

  test('tolerates punctuation adjacent to a title tag', () => {
    assert(hasTag({ title: 'skal feile (@known-error, se MELOSYS-123)' }, '@known-error'));
  });

  test('does not match a different tag', () => {
    assert(!hasTag({ title: 'vanlig test', tags: ['@manual'] }, '@known-error'));
  });

  test('handles missing tags array', () => {
    assert(!hasTag({ title: 'vanlig test' }, '@known-error'));
  });

});
