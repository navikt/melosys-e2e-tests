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
   * venter den inntil `svartidMs` på svar på alle kall som har startet. Med `stilleMs` venter
   * den etter siste svar så lenge på et nytt kall, for kjeder der neste lagring starter når
   * forrige har svart. Stopper sporingen. Kaster aldri: kallstedet avgjør hva et manglende
   * svar betyr.
   */
  ventPåStartedeKall(opts?: {
    startvinduMs?: number;
    stilleMs?: number;
    svartidMs?: number;
  }): Promise<Kallresultat>;
  stopp(): void;
}

/** Matcher POST/PUT/PATCH/DELETE mot melosys-api, også POST-er som bare leser. */
export const erSkrivekallMotApi: KallFilter = request =>
  request.method() !== 'GET' && request.method() !== 'HEAD' && request.url().includes('/api/');

/** Matcher alle kall mot melosys-api, også GET-ene som laster neste steg. */
export const erKallMotApi: KallFilter = request => request.url().includes('/api/');

/**
 * Utfører handlingen og venter på API-kallene den startet, i stedet for en fast søvn.
 * Starter ingen kall innen `startvinduMs`, går den videre. Med `stilleMs` venter den
 * også på kall som starter kort etter at de forrige har svart (lagring → oppfrisking →
 * lasting av neste steg).
 */
export async function utførOgVentPåApi(
  page: Pick<Page, 'on' | 'off'>,
  handling: () => Promise<unknown>,
  opts: { startvinduMs: number; stilleMs: number; svartidMs?: number },
): Promise<Kallresultat> {
  const sporing = sporKall(page, erKallMotApi);
  try {
    await handling();
  } catch (feil) {
    sporing.stopp();
    throw feil;
  }
  return sporing.ventPåStartedeKall({ svartidMs: 30_000, ...opts });
}

/**
 * Skjemaene disse POM-ene fyller i melosys-web, autolagrer med en debounce på inntil
 * 600 ms, og bare når de er gyldige. Starter ingen lagring innen dette vinduet, kommer den
 * ikke. Målt på CI: lagringen var ferdig ca. 230 ms etter at avkryssingen var bekreftet.
 */
export const AUTOLAGRING_STARTVINDU_MS = 1500;

/**
 * Én endring kan starte flere lagringer med hver sin debounce (årsavregningen: innbetalt
 * beløp etter 350 ms, beregningen etter 600 ms).
 */
const AUTOLAGRING_STILLE_MS = 1000;

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

  const ventPåNyttKall = (ms: number) =>
    new Promise<void>(resolve => {
      const timer = setTimeout(resolve, ms);
      nyttKall = () => {
        clearTimeout(timer);
        resolve();
      };
    }).finally(() => {
      nyttKall = null;
    });

  const ventPåStartedeKall: KallSporing['ventPåStartedeKall'] = async ({
    startvinduMs = 0,
    stilleMs = 0,
    svartidMs = 30_000,
  } = {}) => {
    if (startede.length === 0 && startvinduMs > 0) {
      await ventPåNyttKall(startvinduMs);
    }

    // Kall som starter mens vi venter på svar, eller innen stilleMs etter siste svar,
    // tas også med.
    const besvarte = new Set<Request>();
    const frist = Date.now() + svartidMs;
    let ventet = 0;
    while (Date.now() < frist) {
      if (ventet < startede.length) {
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
        continue;
      }
      if (ventet === 0 || stilleMs <= 0) break;
      await ventPåNyttKall(Math.min(stilleMs, Math.max(0, frist - Date.now())));
      if (ventet === startede.length) break;
    }

    stopp();
    return { startet: startede.length, besvart: besvarte.size };
  };

  return { ventPåStartedeKall, stopp };
}

/**
 * Venter på lagringen `sporing` fanget, hvis den starter innen AUTOLAGRING_STARTVINDU_MS,
 * og på lagringer som følger etter den. Logger utfallet.
 */
export async function ventPåAutolagringHvisDenStarter(sporing: KallSporing, hva: string): Promise<void> {
  const { startet, besvart } = await sporing.ventPåStartedeKall({
    startvinduMs: AUTOLAGRING_STARTVINDU_MS,
    stilleMs: AUTOLAGRING_STILLE_MS,
    svartidMs: 10_000,
  });
  if (startet === 0) {
    console.log(`ℹ️  ${hva}: ingen lagring startet innen ${AUTOLAGRING_STARTVINDU_MS} ms`);
  } else if (besvart < startet) {
    console.log(`⚠️  ${hva}: ${startet - besvart} av ${startet} kall uten svar etter 10 s`);
  } else {
    console.log(`✅ ${hva}: ${startet} kall fullført`);
  }
}

function medTidsfrist(svar: Promise<Response | null>, ms: number): Promise<Response | null> {
  let timer: NodeJS.Timeout | undefined;
  const tidsavbrudd = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([svar.catch(() => null), tidsavbrudd]).finally(() => clearTimeout(timer));
}
