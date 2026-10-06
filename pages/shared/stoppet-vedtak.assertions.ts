import { Page, expect } from '@playwright/test';
import { withDatabase } from '../../helpers/db-helper';
import { KallSporing, sporKall } from './kall-sporing';

interface Behandlingstilstand {
  behandlingId: number;
  status: string;
  resultattype: string;
  antallVedtakMetadata: number;
}

/**
 * Leser nyeste behandling (cleanup-fixturen tømmer DB per test, så den er testens).
 * Resultattypen og vedtaksmetadata er det MELOSYS-8307 handler om: et stoppet vedtak
 * skal ikke etterlate en resultattype uten vedtak.
 */
export async function hentBehandlingstilstand(): Promise<Behandlingstilstand> {
  return await withDatabase(async (db) => {
    const rad = await db.queryOne<{ ID: number; STATUS: string; RESULTAT_TYPE: string; ANTALL_VM: number }>(
      `SELECT b.ID, b.STATUS, br.RESULTAT_TYPE,
              (SELECT COUNT(*) FROM VEDTAK_METADATA vm WHERE vm.BEHANDLINGSRESULTAT_ID = b.ID) AS ANTALL_VM
       FROM BEHANDLING b
       JOIN BEHANDLINGSRESULTAT br ON br.BEHANDLING_ID = b.ID
       ORDER BY b.ID DESC FETCH FIRST 1 ROWS ONLY`
    );
    expect(rad, 'Forventet en behandling med behandlingsresultat i DB').not.toBeNull();
    return {
      behandlingId: rad!.ID,
      status: rad!.STATUS,
      resultattype: rad!.RESULTAT_TYPE,
      antallVedtakMetadata: Number(rad!.ANTALL_VM),
    };
  });
}

/**
 * Sporer forhåndskontrollen vedtakssteget kjører (POST /api/kontroll/ferdigbehandling).
 * Start sporingen før vedtakssteget åpnes. Kontrollen kjøres med 500 ms debounce og kan
 * kjøres flere ganger mens skjemaet fylles ut. Et brevutkast lagret før siste kontroll har
 * svart, blir fanget av den, og da deaktiveres «Fatt vedtak».
 */
export function sporForhåndskontroll(page: Page): KallSporing {
  return sporKall(page, request => request.url().includes('/api/kontroll/ferdigbehandling'));
}

/** Venter til forhåndskontrollen har svart og ingen ny kontroll har startet på 1,5 s. */
export async function ventPåForhåndskontroll(sporing: KallSporing): Promise<void> {
  const { startet, besvart } = await sporing.ventPåStartedeKall({
    startvinduMs: 5000,
    stilleMs: 1500,
    svartidMs: 30000,
  });
  expect(startet, 'Vedtakssteget skal ha kjørt forhåndskontrollen').toBeGreaterThan(0);
  expect(besvart, 'Alle forhåndskontrollene skal ha svart').toBe(startet);
  console.log(`✅ Forhåndskontrollen ferdig (${besvart} kall)`);
}

/**
 * Klikker «Fatt vedtak» og krever at vedtakskontrollen i /fatt stopper vedtaket.
 * Forhåndskontrollen på vedtakssteget deaktiverer knappen når den finner feil, så
 * knappen er aktiv bare når tilstanden har endret seg etter forhåndskontrollen.
 *
 * @param forventetKode - Kontrollbegrunnelsen /fatt skal svare med, f.eks. «ÅPENT_UTKAST»
 */
export async function fattVedtakOgForventKontrollfeil(page: Page, forventetKode: string): Promise<void> {
  const fattVedtakButton = page.getByRole('button', { name: 'Fatt vedtak' });
  await expect(
    fattVedtakButton,
    '«Fatt vedtak» skal være aktiv: forhåndskontrollen kjørte før tilstanden endret seg'
  ).toBeEnabled({ timeout: 10000 });

  const svar = page.waitForResponse(
    r => r.url().includes('/api/saksflyt/vedtak/') && r.url().includes('/fatt') && r.request().method() === 'POST',
    { timeout: 60000 }
  );
  await fattVedtakButton.click();
  const respons = await svar;
  const body = await respons.json().catch(() => ({}));
  const koder: string[] = (body.feilkoder ?? []).map((f: { kode: string }) => f.kode);

  expect(respons.status(), `/fatt skal avvises av vedtakskontrollen. Svar: ${JSON.stringify(body)}`).toBe(400);
  expect(koder, `/fatt skal svare med kontrollbegrunnelsen ${forventetKode}`).toContain(forventetKode);
  console.log(`✅ /fatt avvist av vedtakskontrollen: ${koder.join(', ')}`);
}

/**
 * Et vedtak som stoppes av en kontroll, skal la behandlingen stå som før forsøket:
 * samme resultattype, fortsatt under behandling, og ingen vedtaksmetadata.
 * Før MELOSYS-8307 ble resultattypen fra forespørselen (f.eks. FASTSATT_LOVVALGSLAND)
 * committet selv om vedtaket ble stoppet.
 *
 * @param før - Tilstanden lest før «Fatt vedtak» ble klikket
 * @param forespurtResultattype - Resultattypen web sender i /fatt, f.eks. FASTSATT_LOVVALGSLAND
 */
export async function verifiserVedtakIkkeFattet(
  før: Behandlingstilstand,
  forespurtResultattype: string
): Promise<void> {
  expect(
    før.resultattype,
    'Resultattypen før forsøket må være en annen enn den forespurte, ellers beviser ikke testen noe'
  ).not.toBe(forespurtResultattype);
  const etter = await hentBehandlingstilstand();
  expect(etter.behandlingId, 'Samme behandling før og etter fatteforsøket').toBe(før.behandlingId);
  expect(
    etter.resultattype,
    `Resultattypen skal være uendret etter et stoppet vedtak (var ${før.resultattype} før forsøket)`
  ).toBe(før.resultattype);
  expect(etter.status, 'Behandlingen skal fortsatt være under behandling').toBe(før.status);
  expect(etter.antallVedtakMetadata, 'Et stoppet vedtak skal ikke ha vedtaksmetadata').toBe(0);
  console.log(
    `✅ Behandling ${etter.behandlingId}: resultattype ${etter.resultattype}, status ${etter.status}, ingen vedtaksmetadata`
  );
}
