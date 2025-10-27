import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth-helper';
import { FormHelper } from '../helpers/form-helper';

/**
 * Debug test to figure out why Bruttoinntekt field can't be found
 */

test('DEBUG: Find Bruttoinntekt field', async ({ page }) => {
  const auth = new AuthHelper(page);
  await auth.login();
  const formHelper = new FormHelper(page);

  await page.goto('http://localhost:3000/melosys/');
  await page.getByRole('button', {name: 'Opprett ny sak/behandling'}).click();
  await page.getByRole('textbox', {name: 'Brukers f.nr. eller d-nr.:'}).fill('30056928150');
  
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
  
  // Wait for page to load
  await page.waitForLoadState('domcontentloaded');
  console.log('✅ Page loaded');
  
  await page.getByRole('radio', {name: 'Nei'}).check();
  console.log('✅ Checked Nei');
  
  await page.getByLabel('Inntektskilde').selectOption('ARBEIDSINNTEKT');
  console.log('✅ Selected ARBEIDSINNTEKT');
  
  // Wait a bit for any dynamic content
  await page.waitForTimeout(2000);
  
  console.log('Current URL:', page.url());
  console.log('Page title:', await page.title());
  
  // Take screenshot BEFORE looking for the field
  await page.screenshot({ path: 'debug-before-bruttoinntekt.png', fullPage: true });
  console.log('📸 Screenshot saved: debug-before-bruttoinntekt.png');
  
  // Check if there's a "Bekreft og fortsett" button we need to click
  const nextButton = page.getByRole('button', {name: 'Bekreft og fortsett'});
  const nextButtonExists = await nextButton.count();
  console.log('\n"Bekreft og fortsett" button exists?', nextButtonExists > 0);
  
  if (nextButtonExists > 0) {
    console.log('🔄 Clicking "Bekreft og fortsett" to go to next page...');
    await nextButton.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    console.log('New URL:', page.url());
    await page.screenshot({ path: 'debug-after-next-button.png', fullPage: true });
    console.log('📸 Screenshot saved: debug-after-next-button.png');
  }
  
  // Try different selectors to find the field
  console.log('\n🔍 Searching for Bruttoinntekt field...\n');
  
  // Method 1: By role
  const byRole = await page.getByRole('textbox', {name: 'Bruttoinntekt'}).count();
  console.log('By role "textbox" with name "Bruttoinntekt":', byRole);
  
  // Method 2: By label
  const byLabel = await page.getByLabel('Bruttoinntekt').count();
  console.log('By label "Bruttoinntekt":', byLabel);
  
  // Method 3: By name attribute
  const byName = await page.locator('input[name*="bruttoinntekt" i]').count();
  console.log('By name attribute containing "bruttoinntekt":', byName);
  
  // Method 4: By id attribute
  const byId = await page.locator('input[id*="bruttoinntekt" i]').count();
  console.log('By id attribute containing "bruttoinntekt":', byId);
  
  // Method 5: By placeholder
  const byPlaceholder = await page.locator('input[placeholder*="bruttoinntekt" i]').count();
  console.log('By placeholder containing "bruttoinntekt":', byPlaceholder);
  
  // Method 6: All input fields on page
  const allInputs = await page.locator('input[type="text"], input[type="number"], input:not([type])').count();
  console.log('\nTotal text/number inputs on page:', allInputs);
  
  // List all labels on the page
  console.log('\n📋 All labels on page:');
  const labels = await page.locator('label').allTextContents();
  labels.forEach((label, index) => {
    console.log(`  ${index + 1}. "${label}"`);
  });
  
  // Try to find it by any text
  const byText = await page.locator('text=Bruttoinntekt').count();
  console.log('\nElements containing text "Bruttoinntekt":', byText);
  
  // Take a screenshot to see what's on the page
  await page.screenshot({ path: 'debug-bruttoinntekt-page.png', fullPage: true });
  console.log('\n📸 Screenshot saved to: debug-bruttoinntekt-page.png');
  
  console.log('\n🎯 If the field exists, try one of these selectors in your test:');
  if (byRole > 0) console.log('   page.getByRole("textbox", {name: "Bruttoinntekt"})');
  if (byLabel > 0) console.log('   page.getByLabel("Bruttoinntekt")');
  if (byName > 0) console.log('   page.locator("input[name*=\'bruttoinntekt\']")');
  if (byId > 0) console.log('   page.locator("input[id*=\'bruttoinntekt\']")');
  if (byPlaceholder > 0) console.log('   page.locator("input[placeholder*=\'bruttoinntekt\']")');
});
