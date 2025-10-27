import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth-helper';
import { FormHelper } from '../helpers/form-helper';

/**
 * Split workflow into smaller, focused tests
 * Run only the part you're working on
 */

test.describe('Melosys Workflow - Split into Parts', () => {
  
  // Part 1: Create case
  test('Part 1: Create new case', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    
    await page.goto('http://localhost:3000/melosys/');
    await page.getByRole('button', { name: 'Opprett ny sak/behandling' }).click();
    await page.getByRole('textbox', { name: 'Brukers f.nr. eller d-nr.:' }).fill('30056928150');
    // ... rest of case creation ...
    
    console.log('✅ Part 1 complete');
  });
  
  // Part 2: Fill form with Bruttoinntekt (the problematic part)
  test('Part 2: Fill Bruttoinntekt field', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    const formHelper = new FormHelper(page);
    
    // Navigate directly to the form (skip case creation)
    await page.goto('http://localhost:3000/melosys/behandling/2'); // Use actual ID
    
    // Test just this part
    await formHelper.fillAndWait(
      page.getByRole('textbox', { name: 'Bruttoinntekt' }),
      '100000',
      1500
    );
    
    await page.getByRole('button', { name: 'Bekreft og fortsett' }).click();
    
    console.log('✅ Part 2 complete');
  });
  
  // Part 3: Complete vedtak
  test('Part 3: Complete vedtak', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    
    // Navigate directly to vedtak step
    await page.goto('http://localhost:3000/melosys/behandling/2/vedtak');
    
    await page.locator('.ql-editor').first().fill('fritekst');
    await page.getByRole('button', { name: 'Fatt vedtak' }).click();
    
    console.log('✅ Part 3 complete');
  });
});
