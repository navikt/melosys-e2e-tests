import {test, expect} from '../helpers/docker-log-fixture';

test.describe('Utenfor avtaleland - Medlemskap og lovvalg ', () => {
    test.describe('Yrkesaktiv - Førstegangsbehandling', () => {
            test('2-8 forste ledd bokstav a (arbeidstaker)', async ({page}) => {

            // Full workflow from creation to vedtak
            await page.goto('http://localhost:3000/melosys/');

            await page.getByRole('button', {name: 'Opprett ny sak/behandling'}).click();

            await page.getByRole('textbox', {name: 'Brukers f.nr. eller d-nr.:'}).click();
            await page.getByRole('textbox', {name: 'Brukers f.nr. eller d-nr.:'}).fill('30056928150');
            await page.getByLabel('Sakstype').selectOption('FTRL');
            await page.getByLabel('Sakstema').selectOption('MEDLEMSKAP_LOVVALG');
            await page.getByLabel('Behandlingstema').selectOption('YRKESAKTIV');
            await page.getByLabel('Årsak', {exact: true}).selectOption('SØKNAD');
            await page.getByRole('checkbox', {name: 'Legg behandlingen i mine'}).check();

            await page.getByRole('button', {name: 'Opprett ny behandling'}).click();

            await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();
            await page.getByRole('button', {name: 'Åpne datovelger'}).first().click();
            await page.getByRole('dialog').getByLabel('År').selectOption('2023');
            await page.getByRole('button', {name: 'søndag 1', exact: true}).click();
            await page.getByRole('button', {name: 'Åpne datovelger'}).nth(1).click();
            await page.getByRole('dialog').getByLabel('År').selectOption('2024');
            await page.getByRole('dialog').getByLabel('Måned', {exact: true}).selectOption('7');
            await page.getByRole('button', {name: 'torsdag 1', exact: true}).click();
            await page.getByRole('radio', {name: 'Velg land fra liste'}).check();
            await page.locator('div').filter({hasText: /^Velg\.\.\.$/}).nth(3).click();
            await page.getByRole('option', {name: 'Afghanistan'}).click();
            await page.getByLabel('Trygdedekning').selectOption('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');

            await page.getByRole('button', {name: 'Bekreft og fortsett'}).click();

            await page.getByRole('checkbox', {name: 'Ståles Stål AS'}).check();

            await page.getByRole('button', {name: 'Bekreft og fortsett'}).click();

            await page.getByLabel('Hvilken bestemmelse skal sø').selectOption('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
            await page.getByRole('radio', {name: 'Ja'}).check();
            await page.getByRole('group', {name: 'Har søker vært medlem i minst'}).getByLabel('Ja').check();
            await page.getByRole('group', {name: 'Har søker nær tilknytning til'}).getByLabel('Ja').check();

            await page.getByRole('button', {name: 'Bekreft og fortsett'}).click();

            await page.getByLabel('Resultat periode').selectOption('INNVILGET');

            await page.getByRole('button', {name: 'Bekreft og fortsett'}).click();

            // Wait for the Trygdeavgift page to load
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(500);

            // Select "Nei" for Skattepliktig
            await page.getByRole('radio', {name: 'Nei'}).first().check();

            // Wait for the inntekt section to appear
            const inntektskildeDropdown = page.getByLabel('Inntektskilde');
            await inntektskildeDropdown.waitFor({state: 'visible', timeout: 5000});

            await inntektskildeDropdown.selectOption('INNTEKT_FRA_UTLANDET');
            await page.getByRole('group', {name: 'Betales aga.?'}).getByLabel('Nei').check();

            const bruttoinntektField = page.getByRole('textbox', {name: 'Bruttoinntekt'});
            await bruttoinntektField.click();
            await bruttoinntektField.fill('100000');
            await bruttoinntektField.press('Tab');

            // Wait for network to settle
            await page.waitForLoadState('networkidle', {timeout: 15000});

            const bekreftButton = page.getByRole('button', {name: 'Bekreft og fortsett'});
            await expect(bekreftButton).toBeEnabled({timeout: 15000});

            await bekreftButton.click();

            await page.getByRole('button', {name: 'Fatt vedtak'}).click();

            console.log('✅ Workflow completed');
        });
    });
});
