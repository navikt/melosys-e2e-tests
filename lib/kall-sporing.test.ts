/**
 * Enhetstester for sporKall: POM-ene skal vente på kall som faktisk startet, ikke på en fast
 * timeout for et kall som kanskje aldri kommer.
 *
 * Kjør: npm run test:unit
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import type { Request } from '@playwright/test';
import { erSkrivekallMotApi, sporKall, utførOgVentPåApi } from '../pages/shared/kall-sporing';

function falskSide() {
  const side = new EventEmitter();
  return {
    on: (e: string, f: (...a: any[]) => void) => side.on(e, f),
    off: (e: string, f: (...a: any[]) => void) => side.off(e, f),
    lyttere: () => side.listenerCount('request'),
    send: (r: Request) => side.emit('request', r),
  };
}

/** Et kall som svarer etter `svarEtterMs` (null = svarer aldri). */
function falsktKall(method: string, url: string, svarEtterMs: number | null = 0): Request {
  return {
    method: () => method,
    url: () => url,
    response: () =>
      new Promise(resolve => {
        if (svarEtterMs !== null) setTimeout(() => resolve({} as any), svarEtterMs);
      }),
  } as unknown as Request;
}

const PUT = (svarEtterMs: number | null = 0) =>
  falsktKall('PUT', 'http://localhost:3000/melosys/api/trygdeavgift/beregning', svarEtterMs);

describe('sporKall', () => {
  test('uten startet kall venter den bare startvinduet', async () => {
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    const start = Date.now();
    const res = await sporing.ventPåStartedeKall({ startvinduMs: 100 });
    const brukt = Date.now() - start;
    assert.deepStrictEqual(res, { startet: 0, besvart: 0 });
    assert.ok(brukt >= 95 && brukt < 400, `brukte ${brukt} ms`);
  });

  test('startvindu 0 og ingen kall returnerer med en gang', async () => {
    const side = falskSide();
    const start = Date.now();
    const res = await sporKall(side as any, erSkrivekallMotApi).ventPåStartedeKall();
    assert.deepStrictEqual(res, { startet: 0, besvart: 0 });
    assert.ok(Date.now() - start < 50);
  });

  test('et kall som starter i vinduet avslutter ventingen tidlig og ventes på', async () => {
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    setTimeout(() => side.send(PUT(150)), 30);
    const start = Date.now();
    const res = await sporing.ventPåStartedeKall({ startvinduMs: 5_000 });
    const brukt = Date.now() - start;
    assert.deepStrictEqual(res, { startet: 1, besvart: 1 });
    assert.ok(brukt >= 170 && brukt < 1_000, `brukte ${brukt} ms`);
  });

  test('kall startet før ventingen ventes på selv med startvindu 0', async () => {
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    side.send(PUT(120));
    const start = Date.now();
    const res = await sporing.ventPåStartedeKall();
    assert.deepStrictEqual(res, { startet: 1, besvart: 1 });
    assert.ok(Date.now() - start >= 110);
  });

  test('har et kall alt startet, venter den ikke ut startvinduet', async () => {
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    side.send(PUT(20));
    const start = Date.now();
    const res = await sporing.ventPåStartedeKall({ startvinduMs: 5_000 });
    assert.deepStrictEqual(res, { startet: 1, besvart: 1 });
    assert.ok(Date.now() - start < 1_000, `brukte ${Date.now() - start} ms`);
  });

  test('kall som starter mens den venter på svar, ventes også på', async () => {
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    side.send(PUT(100));
    setTimeout(() => side.send(PUT(200)), 50);
    const start = Date.now();
    const res = await sporing.ventPåStartedeKall();
    assert.deepStrictEqual(res, { startet: 2, besvart: 2 });
    assert.ok(Date.now() - start >= 240, `brukte ${Date.now() - start} ms`);
  });

  test('med stillevindu ventes en kjede av kall som starter etter hverandre', async () => {
    // Som tilSteg i melosys-web: neste lagring starter først når forrige har svart.
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    const kjede = (igjen: number) => {
      const kall = PUT(30);
      side.send(kall);
      if (igjen > 1) kall.response().then(() => setTimeout(() => kjede(igjen - 1), 5));
    };
    kjede(3);
    const res = await sporing.ventPåStartedeKall({ stilleMs: 100 });
    assert.deepStrictEqual(res, { startet: 3, besvart: 3 });
  });

  test('stillevinduet koster bare stilleMs når ingen nye kall kommer', async () => {
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    side.send(PUT(20));
    const start = Date.now();
    const res = await sporing.ventPåStartedeKall({ stilleMs: 100 });
    const brukt = Date.now() - start;
    assert.deepStrictEqual(res, { startet: 1, besvart: 1 });
    assert.ok(brukt >= 110 && brukt < 500, `brukte ${brukt} ms`);
  });

  test('uten kall koster start- og stillevindu bare startvinduet', async () => {
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    const start = Date.now();
    const res = await sporing.ventPåStartedeKall({ startvinduMs: 100, stilleMs: 300 });
    const brukt = Date.now() - start;
    assert.deepStrictEqual(res, { startet: 0, besvart: 0 });
    assert.ok(brukt >= 95 && brukt < 300, `brukte ${brukt} ms`);
  });

  test('uten stilleMs returnerer den straks etter siste svar', async () => {
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    side.send(PUT(20));
    const start = Date.now();
    await sporing.ventPåStartedeKall();
    assert.ok(Date.now() - start < 80, `brukte ${Date.now() - start} ms`);
  });

  test('stillevinduet går ikke forbi svartiden', async () => {
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    side.send(PUT(20));
    const start = Date.now();
    await sporing.ventPåStartedeKall({ stilleMs: 1_000, svartidMs: 100 });
    const brukt = Date.now() - start;
    assert.ok(brukt < 300, `brukte ${brukt} ms`);
  });

  test('et kall som feiler, telles ikke som besvart og kaster ikke', async () => {
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    side.send({
      method: () => 'POST',
      url: () => 'http://localhost:3000/melosys/api/vilkaar/1',
      response: () => Promise.reject(new Error('Target closed')),
    } as unknown as Request);
    const res = await sporing.ventPåStartedeKall();
    assert.deepStrictEqual(res, { startet: 1, besvart: 0 });
  });

  test('svartiden begrenser ventingen og kaster ikke', async () => {
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    side.send(PUT(null));
    const start = Date.now();
    const res = await sporing.ventPåStartedeKall({ svartidMs: 100 });
    assert.deepStrictEqual(res, { startet: 1, besvart: 0 });
    assert.ok(Date.now() - start < 400);
  });

  test('kall som ikke matcher filteret ignoreres', async () => {
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    side.send(falsktKall('GET', 'http://localhost:3000/melosys/api/saker', null));
    side.send(falsktKall('HEAD', 'http://localhost:3000/melosys/api/saker', null));
    side.send(falsktKall('POST', 'http://localhost:3000/melosys/static/x', null));
    const res = await sporing.ventPåStartedeKall({ startvinduMs: 50 });
    assert.deepStrictEqual(res, { startet: 0, besvart: 0 });
  });

  test('ventingen fjerner lytteren, og stopp er idempotent', async () => {
    const side = falskSide();
    const sporing = sporKall(side as any, erSkrivekallMotApi);
    assert.strictEqual(side.lyttere(), 1);
    await sporing.ventPåStartedeKall();
    assert.strictEqual(side.lyttere(), 0);
    sporing.stopp();
    assert.strictEqual(side.lyttere(), 0);
  });
});

describe('utførOgVentPåApi', () => {
  const GET = (svarEtterMs: number | null = 0) =>
    falsktKall('GET', 'http://localhost:3000/melosys/api/behandlinger/1', svarEtterMs);

  test('venter på GET-er og på kjeden handlingen startet', async () => {
    const side = falskSide();
    const start = Date.now();
    const res = await utførOgVentPåApi(
      side as any,
      async () => {
        side.send(PUT(40));
        // Neste ledd starter etter at lagringen har svart, slik oppfriskingen gjør.
        setTimeout(() => side.send(GET(40)), 80);
      },
      { startvinduMs: 300, stilleMs: 100 },
    );
    const brukt = Date.now() - start;
    assert.deepStrictEqual(res, { startet: 2, besvart: 2 });
    assert.ok(brukt >= 115 && brukt < 600, `brukte ${brukt} ms`);
    assert.strictEqual(side.lyttere(), 0);
  });

  test('uten kall koster den bare startvinduet', async () => {
    const side = falskSide();
    const start = Date.now();
    const res = await utførOgVentPåApi(side as any, async () => {}, { startvinduMs: 80, stilleMs: 200 });
    const brukt = Date.now() - start;
    assert.deepStrictEqual(res, { startet: 0, besvart: 0 });
    assert.ok(brukt >= 75 && brukt < 250, `brukte ${brukt} ms`);
  });

  test('med minstMs ventes også på en lagring som starter etter handlingen', async () => {
    const side = falskSide();
    const start = Date.now();
    const res = await utførOgVentPåApi(
      side as any,
      async () => {
        side.send(GET(10));
        // Debouncet lagring på forrige steg starter etter at klikket er ferdig.
        setTimeout(() => side.send(PUT(100)), 250);
      },
      { minstMs: 300, stilleMs: 50 },
    );
    const brukt = Date.now() - start;
    assert.deepStrictEqual(res, { startet: 2, besvart: 2 });
    assert.ok(brukt >= 345 && brukt < 800, `brukte ${brukt} ms`);
  });

  test('med minstMs og ingen kall koster den minstMs', async () => {
    const side = falskSide();
    const start = Date.now();
    const res = await utførOgVentPåApi(side as any, async () => {}, { minstMs: 120, stilleMs: 200 });
    const brukt = Date.now() - start;
    assert.deepStrictEqual(res, { startet: 0, besvart: 0 });
    assert.ok(brukt >= 115 && brukt < 300, `brukte ${brukt} ms`);
  });

  test('kaster handlingen, fjernes lytteren og feilen kastes videre', async () => {
    const side = falskSide();
    await assert.rejects(
      utførOgVentPåApi(side as any, async () => { throw new Error('klikk feilet'); }, {
        startvinduMs: 100,
        stilleMs: 100,
      }),
      /klikk feilet/,
    );
    assert.strictEqual(side.lyttere(), 0);
  });
});
