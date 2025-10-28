import {test, expect} from '@playwright/test';
import {AuthHelper} from '../helpers/auth-helper';
import { FormHelper } from '../helpers/form-helper';
import {withDatabase} from '../helpers/db-helper';

/**
 * Example E2E test for Melosys workflow
 *
 * This demonstrates:
 * 1. Authentication
 * 2. User workflow recording
 * 3. Database verification
 * 4. Trace and video recording for debugging
 *
 * To record a new workflow:
 *   npm run codegen
 *
 * Then copy the generated code into this test.
 */

test.describe('Melosys Workflow Example', () => {

    test('should complete a basic workflow', async ({page}) => {
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
        await page.getByRole('button', {name: 'Opprett ny sak/behandling'}).click();
        await page.getByRole('textbox', {name: 'Brukers f.nr. eller d-nr.:'}).click();
        await page.getByRole('textbox', {name: 'Brukers f.nr. eller d-nr.:'}).fill('30056928150');
        // Only interact if the radio button is visible
        const radioButton = page.getByRole('radio', {name: 'Opprett ny sak'});
        if (await radioButton.isVisible()) {
            await radioButton.check();
        }
        await page.getByLabel('Sakstype').selectOption('FTRL');
        await page.getByLabel('Sakstema').selectOption('MEDLEMSKAP_LOVVALG');
        await page.getByLabel('Behandlingstema').selectOption('YRKESAKTIV');
        await page.getByLabel('Årsak', {exact: true}).selectOption('SØKNAD');
        await page.getByRole('checkbox', {name: 'Legg behandlingen i mine'}).check();
        await page.getByRole('button', {name: 'Opprett ny behandling'}).click();
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();
        await page.getByRole('button', {name: 'Åpne datovelger'}).first().click();
        await page.getByRole('dialog').getByLabel('År').selectOption('2024');
        await page.getByRole('dialog').getByLabel('Måned', {exact: true}).selectOption('0');
        await page.getByRole('button', {name: 'mandag 1', exact: true}).click();
        await page.getByRole('button', {name: 'Åpne datovelger'}).nth(1).click();
        await page.getByRole('dialog').getByLabel('Måned', {exact: true}).selectOption('3');
        await page.getByRole('button', {name: 'mandag 1', exact: true}).click();
        await page.getByRole('radio', {name: 'Velg land fra liste'}).check();
        await page.locator('.css-19bb58m').click();
        await page.getByRole('option', {name: 'Afghanistan'}).click();
        await page.getByLabel('Trygdedekning').selectOption('FULL_DEKNING_FTRL');
        await page.getByRole('button', {name: 'Bekreft og fortsett'}).click();
        await page.getByRole('checkbox', {name: 'Ståles Stål AS'}).check();
        await page.getByRole('button', {name: 'Bekreft og fortsett'}).click();
        await page.getByLabel('Hvilken bestemmelse skal sø').selectOption('FTRL_KAP2_2_1');
        await page.getByLabel('Angi brukers situasjon').selectOption('MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD');
        await page.getByRole('radio', {name: 'Ja'}).check();
        await page.getByRole('group', {name: 'Er søkers arbeidsoppdrag i'}).getByLabel('Ja').check();
        await page.getByRole('group', {name: 'Plikter arbeidsgiver å betale'}).getByLabel('Ja').check();
        await page.getByRole('group', {name: 'Har søker lovlig opphold i'}).getByLabel('Ja').check();
        await page.getByRole('button', {name: 'Bekreft og fortsett'}).click();
        await page.getByRole('button', {name: 'Bekreft og fortsett'}).click();
        
        // Wait for the Trygdeavgift page to load
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);
        
        // Step 1: Select "Nei" for Skattepliktig
        await page.getByRole('radio', {name: 'Nei'}).check();
        
        // Wait a moment for the inntekt section to appear
        await page.waitForTimeout(300);
        
        // Step 2: Select ARBEIDSINNTEKT - this will reveal the Bruttoinntekt field
        await page.getByLabel('Inntektskilde').selectOption('ARBEIDSINNTEKT');
        
        // Step 3: Wait for the Bruttoinntekt field to appear (it's shown dynamically after selecting ARBEIDSINNTEKT)
        await page.getByRole('textbox', {name: 'Bruttoinntekt'}).waitFor({ state: 'visible', timeout: 5000 });
        
        // Step 4: Fill the Bruttoinntekt field
        await formHelper.fillAndWait(
            page.getByRole('textbox', {name: 'Bruttoinntekt'}),
            '100000',
            2000  // Wait for calculation to complete
        );
        await page.getByRole('button',   {name: 'Bekreft og fortsett'}).click();
        await page.locator('.ql-editor').first().click();
        await page.locator('.ql-editor').first().fill('fritekst');
        await page.getByRole('paragraph').filter({hasText: /^$/}).first().click();
        await page.locator('.ql-editor.ql-blank').first().fill('begrunnelse');
        await page.locator('.ql-editor.ql-blank').click();
        await page.locator('.ql-editor.ql-blank').fill('trygdeavgift');
        await page.getByRole('button', {name: 'Fatt vedtak'}).click();
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
