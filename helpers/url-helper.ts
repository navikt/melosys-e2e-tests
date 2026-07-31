/**
 * Hjelpere for å lese ut identifikatorer fra melosys-web-URL-er.
 */

/**
 * Hent saksnummeret ut av en saksbehandlings-URL.
 *
 * Saksnummer er i praksis alltid «MEL-<n>» – melosys-api setter FAGSAKID_PREFIX = "MEL-"
 * for alle fagsaker, i både EU/EØS-flyten (/melosys/EU_EOS/pensjonist/MEL-40/) og
 * FTRL-flyten (/FTRL/saksbehandling/MEL-146/). Den rent numeriske grenen under er en
 * arvet fallback for eldre saksnummer uten prefiks; den er ikke observert i dagens data.
 * MEL- prioriteres siden den er entydig og aldri kan forveksles med fødselsnummeret
 * (11 siffer). Det rene tallet ankres derfor på «saksbehandling/» og krever minst ti
 * siffer, for ikke å plukke opp fnr.
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
