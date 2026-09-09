import { test, expect } from '@playwright/test';
import * as path from 'path';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { SoknadArbeidsgiverPage } from '../../pages/skjema/soknad-arbeidsgiver.page';
import { SkjemaMottakAssertions } from '../../pages/skjema/skjema-mottak.assertions';

/**
 * T1b — full happy-path innsending av digital «Utsendt arbeidstaker»-søknad, variant ARBEIDSGIVER
 * MED fullmakt (fyller ut BEGGE deler). Dette er den dominerende produksjonsflyten.
 *
 * Arbeidsgiver KARAFFEL logger inn, velger organisasjonen Ståles Stål (via Altinn-tilgang), velger
 * arbeidstaker LANSEN fra fullmakt-lista, fyller ut alle 11 stegene — inkludert de fire
 * arbeidsgiver-stegene som DEG SELV-flyten ikke har (arbeidsgiverens-virksomhet-i-norge,
 * utenlandsoppdraget, arbeidssted-i-utlandet, arbeidstakerens-lonn) — laster opp et vedlegg, og
 * sender inn. Verifiserer at innsendingen gir kvittering med referansenummer.
 *
 * Ren @playwright/test (ingen Oracle/Unleash-fixture — frontend-flyt). Krever skjema-stacken oppe:
 *   cd ../melosys-docker-compose && make dev-skjema
 *   SKIP_EESSI_GATE=true npx playwright test tests/skjema/ --project=chromium
 *
 * Testbruker (TESTBRUKERE.md scenario 1): KARAFFEL 30056928150 (daglig leder) → Ståles Stål
 * 999999999 → på vegne av LANSEN 12928056706 (arbeidstaker NOR → Frankrike).
 */
test.describe('skjema-web innsending (arbeidsgiver)', () => {
  test('arbeidsgiver fyller ut og sender inn «Utsendt arbeidstaker»-søknad for begge deler', async ({
    page,
  }) => {
    test.setTimeout(120000); // 11 steg + vedlegg-opplasting (ClamAV) + drain (Kafka-konsum)

    const auth = new SkjemaAuthHelper(page);
    await auth.login('30056928150'); // KARAFFEL TRIVIELL, daglig leder

    const soknad = new SoknadArbeidsgiverPage(page);
    const { skjemaId, referanse } = await soknad.fyllUtOgSendInnBeggeDeler({
      arbeidsgiverOrgnr: '999999999', // Ståles Stål AS
      arbeidstakerFnr: '12928056706', // LANSEN LANSANSEN
      land: 'Frankrike',
      vedleggFilsti: path.resolve(__dirname, 'fixtures/vedlegg-test.pdf'),
    });

    // Kvitteringen viser et referansenummer (alfanumerisk kode) — beviser at hele
    // arbeidsgiver-flyten (begge deler + vedlegg) ble persistert i skjema-api.
    expect(skjemaId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(referanse).toMatch(/^[A-Z0-9]{5,6}$/);
    console.log('✅ Arbeidsgiver-søknad (begge deler) sendt inn, referanse:', referanse);

    // Drain-at-source: vent til melosys-api har kjørt HELE mottakssagaen (sak + journalføring i
    // Oracle) FØR testen avslutter. Uten dette lever Kafka-meldingen videre og konsumeres først
    // etter at NESTE tests cleanup har tømt Oracle. To skadevarianter: (1) sak opprettes etter
    // clean → stray fagsak velter tellinger i etterfølgende tester (f.eks. skjema-begge-deler
    // «kun én fagsak», CI run 28596547580); (2) journalførings-halen krysser grensen → naboens
    // clean sletter sak/behandling midt i sagaen → melosys-api logger ERROR → docker-logs-fixturen
    // feller en urelatert nabotest. Å draine helt til JOURNALPOST_ID er satt dekker begge.
    await new SkjemaMottakAssertions().ventPaaJournalpostForSkjema(skjemaId);
    console.log('✅ Mottakssaga ferdig i melosys-api (sak + journalpost, drain OK)');
  });
});
