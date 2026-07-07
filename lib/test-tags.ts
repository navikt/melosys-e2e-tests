/**
 * Shared tag detection for Playwright tests — ONE semantics for all consumers
 * (fixtures and reporters), so tag matching can't drift between call sites.
 *
 * A tag can live in two places depending on how the test was authored:
 * - Plain Playwright specs put tags in the test title ("skal … @known-error #MELOSYS-123")
 * - playwright-bdd emits Gherkin @tags into testInfo.tags / TestCase.tags
 *
 * Playwright's own `tags` getter also extracts title-embedded @-words, but the
 * title fallback is kept deliberately: the extraction regex (`@[\S]+`) swallows
 * adjacent punctuation ("@known-error," would fail an exact tag compare), while
 * substring matching on the title tolerates it.
 *
 * Matching is case-insensitive in both branches (Gherkin allows any tag casing).
 */
export function hasTag(info: { title: string; tags?: string[] }, tag: string): boolean {
  const wanted = tag.toLowerCase();
  return (
    info.title.toLowerCase().includes(wanted) ||
    (info.tags ?? []).some(t => t.toLowerCase() === wanted)
  );
}
