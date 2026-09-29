/**
 * Enhetstester for sporingen i UnleashHelper: fixturen skal bare sette tilbake toggles
 * testen endret, og full reset bare første gang i en worker-prosess.
 *
 * Kjør: npm run test:unit
 */

import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert';
import type { APIRequestContext } from '@playwright/test';
import { UnleashHelper, _nullstillSporingForTest } from '../helpers/unleash-helper';

const IKKE_TIDLIGERE = 'melosys.faktureringskomponenten.ikke-tidligere-perioder';
const UTEN_FLYT = 'melosys.arsavregning.uten.flyt';

/** Falsk Unleash + melosys-api: admin-API og /featuretoggle svarer med samme tilstand. */
function falskUnleash(opts: { feilPåPost?: Set<string>; forsinkelseMs?: number } = {}) {
  const tilstand = new Map<string, boolean>();
  const poster: string[] = [];
  let samtidige = 0;
  let maksSamtidige = 0;
  const svar = (ok: boolean, body: unknown = {}) => ({
    ok: () => ok,
    status: () => (ok ? 200 : 500),
    text: async () => JSON.stringify(body),
    json: async () => body,
  });

  const request = {
    post: async (url: string) => {
      const m = url.match(/features\/([^/]+)\/environments\/[^/]+\/(on|off)$/);
      if (!m) return svar(true); // opprettelse av toggle
      const navn = decodeURIComponent(m[1]);
      samtidige++;
      maksSamtidige = Math.max(maksSamtidige, samtidige);
      await new Promise(r => setTimeout(r, opts.forsinkelseMs ?? 0));
      samtidige--;
      poster.push(`${navn}=${m[2]}`);
      if (opts.feilPåPost?.has(navn)) throw new Error(`POST feilet for ${navn}`);
      tilstand.set(navn, m[2] === 'on');
      return svar(true);
    },
    get: async (url: string) => {
      const ft = url.match(/featuretoggle\?features=([^&]+)/);
      if (ft) {
        const navn = decodeURIComponent(ft[1]);
        return svar(true, { [navn]: tilstand.get(navn) ?? true });
      }
      const navn = decodeURIComponent(url.split('/features/')[1]);
      return svar(true, { environments: [{ name: 'development', enabled: tilstand.get(navn) ?? false }] });
    },
  } as unknown as APIRequestContext;

  return { request, tilstand, poster, maksSamtidige: () => maksSamtidige };
}

describe('UnleashHelper — reset av endrede toggles', () => {
  beforeEach(() => {
    _nullstillSporingForTest();
    delete process.env.UNLEASH_FORCE_ENABLE;
    delete process.env.UNLEASH_FORCE_DISABLE;
  });

  test('første reset i en worker setter alle standardtoggles', async () => {
    const f = falskUnleash();
    const antall = await new UnleashHelper(f.request).resetChangedToggles(true);
    assert.ok(antall >= 19, `forventet full reset, fikk ${antall}`);
    assert.strictEqual(f.tilstand.get(UTEN_FLYT), false);
    assert.strictEqual(f.tilstand.get('melosys.cdm-4-4'), true);
  });

  test('uten endringer gjør neste reset ingen kall', async () => {
    const f = falskUnleash();
    const unleash = new UnleashHelper(f.request);
    await unleash.resetChangedToggles(true);
    f.poster.length = 0;
    assert.strictEqual(await unleash.resetChangedToggles(true), 0);
    assert.deepStrictEqual(f.poster, []);
  });

  test('setter bare tilbake toggles testen endret, også via en annen instans', async () => {
    const f = falskUnleash();
    await new UnleashHelper(f.request).resetChangedToggles(true);
    await new UnleashHelper(f.request).disableFeature(IKKE_TIDLIGERE, true);
    f.poster.length = 0;

    assert.strictEqual(await new UnleashHelper(f.request).resetChangedToggles(true), 1);
    assert.deepStrictEqual(f.poster, [`${IKKE_TIDLIGERE}=on`]);
    assert.strictEqual(f.tilstand.get(IKKE_TIDLIGERE), true);
  });

  test('toggle uten standardverdi settes ikke og slutter å spores', async () => {
    const f = falskUnleash();
    const unleash = new UnleashHelper(f.request);
    await unleash.resetChangedToggles(true);
    await unleash.enableFeature('melosys.ukjent', true);
    f.poster.length = 0;

    const logg: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => { logg.push(args.join(' ')); };
    try {
      assert.strictEqual(await unleash.resetChangedToggles(true), 0);
      assert.strictEqual(await unleash.resetChangedToggles(true), 0);
    } finally {
      console.log = original;
    }
    assert.deepStrictEqual(f.poster, []);
    assert.strictEqual(logg.filter(l => l.includes("'melosys.ukjent'")).length, 1);
  });

  test('en feilet reset kaster og prøves igjen neste gang', async () => {
    const feil = new Set([IKKE_TIDLIGERE]);
    const f = falskUnleash({ feilPåPost: feil });
    const unleash = new UnleashHelper(f.request);
    await assert.rejects(unleash.resetChangedToggles(true), /Unleash-reset feilet for 1 av/);

    feil.clear();
    f.poster.length = 0;
    // Full reset feilet, så neste kall gjør full reset på nytt.
    assert.ok((await unleash.resetChangedToggles(true)) >= 19);
    assert.strictEqual(f.tilstand.get(IKKE_TIDLIGERE), true);
  });

  test('UNLEASH_FORCE_DISABLE gjelder også når en endret toggle settes tilbake', async () => {
    process.env.UNLEASH_FORCE_DISABLE = IKKE_TIDLIGERE;
    const f = falskUnleash();
    const unleash = new UnleashHelper(f.request);
    await unleash.resetChangedToggles(true);
    assert.strictEqual(f.tilstand.get(IKKE_TIDLIGERE), false);

    await unleash.enableFeature(IKKE_TIDLIGERE, true);
    await unleash.resetChangedToggles(true);
    assert.strictEqual(f.tilstand.get(IKKE_TIDLIGERE), false);
  });

  test('toggles settes parallelt', async () => {
    const f = falskUnleash({ forsinkelseMs: 20 });
    await new UnleashHelper(f.request).resetChangedToggles(true);
    assert.ok(f.maksSamtidige() > 1, `maks samtidige POST-er: ${f.maksSamtidige()}`);
  });
});
