import { APIRequestContext } from '@playwright/test';
import { extractText, getDocumentProxy } from 'unpdf';

export interface Brev {
  journalpostId: string;
  mottakerId: string | undefined;
  /** PDF-teksten med all whitespace slått sammen til ett mellomrom. */
  tekst: string;
}

interface JournalpostMedDokumenter {
  journalpostId: string;
  avsenderMottaker: { id?: string } | null;
  dokumentModellList: Array<{
    brevkode: string | null;
    dokumentVarianter: Array<{ variantFormat: string; dokumentInnhold: string }>;
  }>;
}

/**
 * Henter brevene med en gitt brevkode som melosys-mock har arkivert på saken, og leser teksten
 * ut av PDF-en. Brukes når innholdet i et brev skal verifiseres, ikke bare at det ble sendt.
 *
 * @param saksnummer - f.eks. `MEL-697`
 * @param brevkode - f.eks. `innhenting_av_inntektsopplysninger`
 */
export async function hentBrevForSak(
  request: APIRequestContext,
  saksnummer: string,
  brevkode: string
): Promise<Brev[]> {
  const response = await request.get(
    `http://localhost:8083/testdata/verification/journalpost/sak/${saksnummer}`
  );
  if (!response.ok()) {
    throw new Error(`Klarte ikke å hente journalposter for ${saksnummer}: ${response.status()}`);
  }
  const journalposter: JournalpostMedDokumenter[] = await response.json();

  const brev: Brev[] = [];
  for (const journalpost of journalposter) {
    for (const dokument of journalpost.dokumentModellList ?? []) {
      if (dokument.brevkode !== brevkode) continue;
      const arkiv = dokument.dokumentVarianter.find((v) => v.variantFormat === 'ARKIV');
      if (!arkiv) continue;
      const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(arkiv.dokumentInnhold, 'base64')));
      const { text } = await extractText(pdf, { mergePages: true });
      brev.push({
        journalpostId: journalpost.journalpostId,
        mottakerId: journalpost.avsenderMottaker?.id,
        tekst: text.replace(/\s+/g, ' '),
      });
    }
  }
  return brev;
}
