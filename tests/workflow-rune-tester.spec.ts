import {test, expect} from '@playwright/test';
import {AuthHelper} from '../helpers/auth-helper';
import { FormHelper } from '../helpers/form-helper';
import {withDatabase} from '../helpers/db-helper';

test.describe('Melosys Workflow Rune', () => {

    test('should complete a basic workflow 2', async ({page}) => {
        // Setup: Login to the application
        const auth = new AuthHelper(page);
        await auth.login();

        // Setup: Form helper for dynamic forms
        const formHelper = new FormHelper(page);

        // Wait for the home page to load
        await expect(page).toHaveURL(/.*melosys/);

        // TODO: Add your recorded workflow steps here
        // Use: npm run codegen
        // Then Playwright will open a browser and record your actions

        await page.goto('http://localhost:3000/melosys/');
        await page.getByRole('button', { name: 'Opprett ny sak/behandling' }).click();
        await page.getByRole('textbox', { name: 'Brukers f.nr. eller d-nr.:' }).click();
        await page.getByRole('textbox', { name: 'Brukers f.nr. eller d-nr.:' }).fill('30056928150');
        await page.getByLabel('Sakstype').selectOption('FTRL');
        await page.getByLabel('Sakstema').selectOption('MEDLEMSKAP_LOVVALG');
        await page.getByLabel('Behandlingstema').selectOption('YRKESAKTIV');
        await page.getByLabel('Årsak', { exact: true }).selectOption('SØKNAD');
        await page.getByRole('checkbox', { name: 'Legg behandlingen i mine' }).check();
        await page.getByRole('button', { name: 'Opprett ny behandling' }).click();
        await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
        await page.getByRole('button', { name: 'Åpne datovelger' }).first().click();
        await page.getByRole('dialog').getByLabel('År').selectOption('2023');
        await page.getByRole('button', { name: 'søndag 1', exact: true }).click();
        await page.getByRole('button', { name: 'Åpne datovelger' }).nth(1).click();
        await page.getByRole('dialog').getByLabel('År').selectOption('2024');
        await page.getByRole('dialog').getByLabel('Måned', { exact: true }).selectOption('7');
        await page.getByRole('button', { name: 'torsdag 1', exact: true }).click();
        await page.getByRole('radio', { name: 'Velg land fra liste' }).check();
        await page.locator('div').filter({ hasText: /^Velg\.\.\.$/ }).nth(3).click();
        await page.getByRole('option', { name: 'Afghanistan' }).click();
        await page.getByLabel('Trygdedekning').selectOption('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
        await page.getByRole('button', { name: 'Bekreft og fortsett' }).click();
        await page.getByRole('checkbox', { name: 'Ståles Stål AS' }).check();
        await page.getByRole('button', { name: 'Bekreft og fortsett' }).click();
        await page.getByLabel('Hvilken bestemmelse skal sø').selectOption('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
        await page.getByRole('radio', { name: 'Ja' }).check();
        await page.getByRole('group', { name: 'Har søker vært medlem i minst' }).getByLabel('Ja').check();
        await page.getByRole('group', { name: 'Har søker nær tilknytning til' }).getByLabel('Ja').check();
        await page.getByRole('button', { name: 'Bekreft og fortsett' }).click();
        await page.getByLabel('Resultat periode').selectOption('INNVILGET');
        await page.getByRole('button', { name: 'Bekreft og fortsett' }).click();

        // Wait for the Trygdeavgift page to load
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);

        // Select "Nei" for Skattepliktig (use first() since it's the first "Nei" on the page)
        await page.getByRole('radio', { name: 'Nei' }).first().check();

        // Wait for the inntekt section to appear after checking "Nei"
        const inntektskildeDropdown = page.getByLabel('Inntektskilde');
        await inntektskildeDropdown.waitFor({ state: 'visible', timeout: 5000 });

        await inntektskildeDropdown.selectOption('INNTEKT_FRA_UTLANDET');
        await page.getByRole('group', { name: 'Betales aga.?' }).getByLabel('Nei').check();

        const bruttoinntektField = page.getByRole('textbox', { name: 'Bruttoinntekt' });
        await bruttoinntektField.click();
        await bruttoinntektField.fill('100000');
        await bruttoinntektField.press('Tab');  // Trigger blur to start API call

        // Wait for network to settle (API call to complete)
        await page.waitForLoadState('networkidle', { timeout: 15000 });

        // Wait for the "Bekreft og fortsett" button to be enabled (form validation must pass)
        const bekreftButton = page.getByRole('button', { name: 'Bekreft og fortsett' });
        await expect(bekreftButton).toBeEnabled({ timeout: 15000 });

        await bekreftButton.click();
        await page.getByRole('button', { name: 'Fatt vedtak' }).click();

        console.log('✅ Workflow completed');

        // Verify: Check database state
        // await withDatabase(async (db) => {
        //   const behandling = await db.queryOne(
        //     'SELECT * FROM BEHANDLING WHERE personnummer = :pnr',
        //     { pnr: '12345678901' }
        //   );
        //
        //   expect(behandling).not.toBeNull();
        //   expect(behandling.STATUS).toBe('OPPRETTET');
        // });
    });
});
