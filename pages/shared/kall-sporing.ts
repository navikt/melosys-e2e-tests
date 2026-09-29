import type { Page, Request, Response } from '@playwright/test';

/** Et kall som sporingen tar med. */
export type KallFilter = (request: Request) => boolean;

export interface Kallresultat {
  /** Antall matchende kall som startet mens sporingen var på. */
  startet: number;
  /** Antall av dem som fikk svar innen svartiden. */
  besvart: number;
}

export interface KallSporing {
  /**
   * Venter på kallene handlingen faktisk startet, i stedet for en fast timeout på et kall
   * som kanskje aldri kommer.
   *
   * Har ingen kall startet ennå, venter den inntil `startvinduMs` på det første. Deretter
   * venter den inntil `svartidMs` på svar på alle kall som har startet. Stopper sporingen.
   * Kaster aldri: kallstedet avgjør hva et manglende svar betyr.
   */
  ventPåStartedeKall(opts?: { startvinduMs?: number; svartidMs?: number }): Promise<Kallresultat>;
  stopp(): void;
}

/** Matcher skrivekall (POST/PUT/PATCH/DELETE) mot melosys-api. */
export const erSkrivekallMotApi: KallFilter = request =>
  request.method() !== 'GET' && request.method() !== 'HEAD' && request.url().includes('/api/');

/**
 * Skjemaene autolagrer med debounce (ca. 500 ms), og bare når de er gyldige. Starter ingen
 * lagring innen dette vinduet, kommer den ikke. Målt på CI: PUT-en er ferdig ca. 450 ms
 * etter klikket.
 */
export const AUTOLAGRING_STARTVINDU_MS = 1500;

/**
 * Begynner å spore kall som matcher `filter`. Start sporingen FØR handlingen som kan utløse
 * kallene, slik at et raskt kall ikke glipper.
 */
export function sporKall(page: Pick<Page, 'on' | 'off'>, filter: KallFilter): KallSporing {
  const startede: Request[] = [];
  let nyttKall: (() => void) | null = null;

  const påRequest = (request: Request) => {
    if (!filter(request)) return;
    startede.push(request);
    nyttKall?.();
  };
  page.on('request', påRequest);

  let stoppet = false;
  const stopp = () => {
    if (stoppet) return;
    stoppet = true;
    page.off('request', påRequest);
  };

  const ventPåStartedeKall: KallSporing['ventPåStartedeKall'] = async ({
    startvinduMs = 0,
    svartidMs = 30_000,
  } = {}) => {
    if (startede.length === 0 && startvinduMs > 0) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, startvinduMs);
        nyttKall = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      nyttKall = null;
    }

    // Et kall som starter mens vi venter på svar, tas også med.
    const besvarte = new Set<Request>();
    const frist = Date.now() + svartidMs;
    let ventet = 0;
    while (ventet < startede.length && Date.now() < frist) {
      const ubesvarte = startede.slice(ventet);
      ventet = startede.length;
      const gjenstår = Math.max(0, frist - Date.now());
      await Promise.all(
        ubesvarte.map(request =>
          medTidsfrist(request.response(), gjenstår).then(svar => {
            if (svar) besvarte.add(request);
          }),
        ),
      );
    }

    stopp();
    return { startet: startede.length, besvart: besvarte.size };
  };

  return { ventPåStartedeKall, stopp };
}

/**
 * Venter på autolagringen `sporing` fanget, hvis den starter innen
 * AUTOLAGRING_STARTVINDU_MS, og logger utfallet.
 */
export async function ventPåAutolagringHvisDenStarter(sporing: KallSporing, hva: string): Promise<void> {
  const { startet, besvart } = await sporing.ventPåStartedeKall({
    startvinduMs: AUTOLAGRING_STARTVINDU_MS,
    svartidMs: 10_000,
  });
  if (startet === 0) {
    console.log(`ℹ️  ${hva}: ingen autolagring (skjemaet lagrer bare når det er gyldig)`);
  } else if (besvart < startet) {
    console.log(`⚠️  ${hva}: ${startet - besvart} av ${startet} lagringer uten svar etter 10 s`);
  } else {
    console.log(`✅ ${hva}: autolagring fullført`);
  }
}

function medTidsfrist(svar: Promise<Response | null>, ms: number): Promise<Response | null> {
  let timer: NodeJS.Timeout | undefined;
  const tidsavbrudd = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([svar.catch(() => null), tidsavbrudd]).finally(() => clearTimeout(timer));
}
