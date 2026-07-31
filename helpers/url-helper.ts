/**
 * Hjelpere for å lese ut identifikatorer fra melosys-web-URL-er.
 */

/**
 * Hent saksnummeret ut av en saksbehandlings-URL.
 *
 * Saksnummer er enten «MEL-<n>» (EU/EØS-flyten, f.eks. /melosys/EU_EOS/pensjonist/MEL-40/,
 * og også FTRL: /FTRL/saksbehandling/MEL-146/) eller et rent tall (FTRL-flyten, f.eks.
 * /FTRL/saksbehandling/2024000001). MEL- prioriteres siden det er entydig og aldri kan
 * forveksles med fødselsnummeret (11 siffer). Det rene tallet ankres derfor på
 * «saksbehandling/» for å unngå å plukke opp fnr.
 *
 * @throws når URL-en ikke inneholder et gjenkjennbart saksnummer – å returnere undefined
 *   her ville bare flyttet feilen til et kallsted som er vanskeligere å tolke.
 */
export function hentSaksnummerFraUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const saksnummer =
    pathname.match(/\b(MEL-\d+)\b/)?.[1] ??
    pathname.match(/saksbehandling\/(\d{10,})/)?.[1];

  if (!saksnummer) {
    throw new Error(`Fant ikke saksnummer i URL-en: ${url}`);
  }

  return decodeURIComponent(saksnummer);
}
