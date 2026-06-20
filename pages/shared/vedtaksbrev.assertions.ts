import { APIRequestContext, expect } from '@playwright/test';
import {
  finnVedtaksbrevForMottaker,
  VedtaksbrevJournalpost,
} from '../../helpers/mock-helper';

/**
 * Forventet vedtaksbrev for én mottakertype.
 *
 * Brevvarianten identifiseres av `brevkode` (dokgen-mal) — denne avhenger av
 * sakstype/land/person (jf. bug-klyngen 6950 / 7128 / 6759, land-/person-
 * spesifikke vedtaksbrev). `tittel` er journalføringstittelen.
 */
export interface VedtaksbrevForventning {
  /** Mottakerens fnr (avsenderMottaker.id på journalposten) */
  mottakerFnr: string;
  /** Forventet dokgen-mal (HOVEDDOKUMENT.brevkode), f.eks. 'innvilgelse_ftrl' */
  forventetBrevkode: string;
  /** Forventet journalføringstittel, f.eks. 'Vedtak om frivillig medlemskap' */
  forventetTittel: string;
}

/**
 * Verifiser at det er produsert ett korrekt vedtaksbrev for en gitt mottaker:
 * riktig brev-VARIANT (brevkode/dokgen-mal) og tittel, journalført som
 * ferdigstilt (J) UTGAAENDE journalpost til riktig person.
 *
 * Asserter brev-INNHOLD per mottakertype — ikke bare at «et brev ble laget».
 * brevkode/tittel sjekkes med eksakt likhet, slik at en regresjon der feil
 * brevmal sendes for en sakstype/land slår testen RØD.
 *
 * @returns Den funne journalposten (for kryss-assertion av distinkthet i testen).
 */
export async function verifiserVedtaksbrev(
  request: APIRequestContext,
  forventning: VedtaksbrevForventning
): Promise<VedtaksbrevJournalpost> {
  const brev = await finnVedtaksbrevForMottaker(request, forventning.mottakerFnr);

  expect(
    brev,
    `Forventet et vedtaksbrev journalført til mottaker ${forventning.mottakerFnr}`
  ).not.toBeNull();

  expect(brev!.journalposttype, 'Vedtaksbrev skal være UTGAAENDE').toBe('UTGAAENDE');
  expect(brev!.journalStatus, 'Vedtaksbrev skal være ferdigstilt (J)').toBe('J');
  expect(brev!.avsenderMottaker.id, 'Brev skal være adressert til riktig person').toBe(
    forventning.mottakerFnr
  );
  expect(brev!.avsenderMottaker.type, 'Mottaker skal være en person (FNR)').toBe('FNR');

  expect(
    brev!.hoveddokument.brevkode,
    `Brev-variant (dokgen-mal) skal være korrekt for mottakertypen`
  ).toBe(forventning.forventetBrevkode);
  expect(
    brev!.hoveddokument.tittel,
    `Journalføringstittel skal matche brev-varianten`
  ).toBe(forventning.forventetTittel);

  console.log(
    `✅ Vedtaksbrev verifisert: brevkode='${brev!.hoveddokument.brevkode}', ` +
      `tittel='${brev!.hoveddokument.tittel}', mottaker=${brev!.avsenderMottaker.id}`
  );
  return brev!;
}
