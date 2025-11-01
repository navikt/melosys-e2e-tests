import { test, expect } from '../fixtures';
import { AuthHelper } from '../helpers/auth-helper';
import { FormHelper } from '../helpers/form-helper';

/**
 * Example test showing how to use FormHelper for dynamic forms
 */

test.describe('Form Helper Examples', () => {
  
  test('example: handle Bruttoinntekt field with API call', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    
    const formHelper = new FormHelper(page);
    
    // Navigate to your form...
    // await page.goto('/melosys/behandling/2');
    
    // Fill field that triggers API (automatically presses Tab)
    await formHelper.fillAndWaitForApi(
      page.getByRole('textbox', { name: 'Bruttoinntekt' }),
      '100000',
      '/trygdeavgift/beregning'
    );
    
    // The API has completed, UI is updated, continue with workflow...
  });

  test('example: handle optional radio button', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    
    const formHelper = new FormHelper(page);
    
    // Check radio only if not already checked
    await formHelper.checkRadioIfNeeded(
      page.getByRole('radio', { name: 'Opprett ny sak' })
    );
    
    // Continue workflow...
  });

  test('example: fill multiple fields with API calls', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    
    const formHelper = new FormHelper(page);
    
    // Fill multiple fields that each trigger API
    await formHelper.fillMultipleFieldsWithApi([
      {
        locator: page.getByRole('textbox', { name: 'Bruttoinntekt' }),
        value: '100000',
        apiPattern: '/trygdeavgift/beregning'
      },
      {
        locator: page.getByRole('textbox', { name: 'Arbeidstimer' }),
        value: '37.5',
        apiPattern: '/trygdeavgift/beregning'
      }
    ]);
    
    // All API calls completed, continue...
  });

  test('example: most reliable approach (network idle)', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    
    const formHelper = new FormHelper(page);
    
    // When you're not sure about the API endpoint, use network idle
    await formHelper.fillAndWaitForNetworkIdle(
      page.getByRole('textbox', { name: 'Bruttoinntekt' }),
      '100000'
    );
    
    // All network activity has settled, safe to continue
  });
});
