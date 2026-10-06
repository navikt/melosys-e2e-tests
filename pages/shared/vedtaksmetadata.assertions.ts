import { expect } from '@playwright/test';
import { withDatabase } from '../../helpers/db-helper';

/**
 * Krever at et fattet vedtak har nøyaktig én rad i VEDTAK_METADATA med vedtaksdato,
 * riktig vedtakstype og klagefrist seks uker etter vedtaksdatoen.
 *
 * api-et setter klagefristen som LocalDate fra sin klokke og vedtaksdatoen som Instant,
 * så de kan ligge på hver sin side av midnatt. Derfor godtar vi 41–43 dager.
 *
 * @param behandlingId - BEHANDLING.ID (= BEHANDLINGSRESULTAT_ID)
 * @param forventet.vedtakstype - f.eks. 'FØRSTEGANGSVEDTAK'
 */
export async function verifiserVedtaksmetadata(
  behandlingId: string | number,
  forventet: { vedtakstype: string }
): Promise<void> {
  await withDatabase(async (db) => {
    const rader = await db.query<{ VEDTAK_DATO: Date | null; VEDTAK_TYPE: string; DAGER: number | null }>(
      `SELECT VEDTAK_DATO, VEDTAK_TYPE, VEDTAK_KLAGEFRIST - TRUNC(VEDTAK_DATO) AS DAGER
         FROM VEDTAK_METADATA WHERE BEHANDLINGSRESULTAT_ID = :id`,
      { id: behandlingId }
    );
    expect(rader, 'Ett vedtak skal ha én rad i VEDTAK_METADATA').toHaveLength(1);

    const [rad] = rader;
    expect(rad.VEDTAK_DATO, 'VEDTAK_DATO skal være satt').not.toBeNull();
    expect(rad.VEDTAK_TYPE, `VEDTAK_TYPE skal være ${forventet.vedtakstype}`).toBe(forventet.vedtakstype);
    expect(rad.DAGER, 'VEDTAK_KLAGEFRIST skal være satt').not.toBeNull();
    expect(Number(rad.DAGER), 'Klagefristen skal være 41–43 dager etter vedtaksdatoen').toBeGreaterThanOrEqual(41);
    expect(Number(rad.DAGER), 'Klagefristen skal være 41–43 dager etter vedtaksdatoen').toBeLessThanOrEqual(43);
    console.log(
      `✅ VEDTAK_METADATA: ${rad.VEDTAK_TYPE}, vedtaksdato ${rad.VEDTAK_DATO?.toISOString()}, klagefrist +${rad.DAGER} dager`
    );
  });
}
