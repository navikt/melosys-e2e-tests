import { APIRequestContext } from '@playwright/test';

/**
 * Helper for managing melosys-mock test data
 *
 * The mock service provides endpoints for clearing test data:
 * - DELETE http://localhost:8083/testdata/clear
 *
 * Usage:
 *   await clearMockData(page.request);
 */

export interface MockClearResponse {
  message: string;
  journalpostCleared?: string | number;
  oppgaveCleared?: string | number;
}

/**
 * Clear all test data from melosys-mock service
 * @param request - Playwright APIRequestContext (from page.request or request fixture)
 * @returns Response data with counts of cleared items
 */
export async function clearMockData(request: APIRequestContext): Promise<MockClearResponse> {
  try {
    const response = await request.delete('http://localhost:8083/testdata/clear');

    if (!response.ok()) {
      throw new Error(`Mock service returned status ${response.status()}`);
    }

    const data: MockClearResponse = await response.json();

    console.log('✅ Mock data cleared:');
    console.log(`   Journalposter: ${data.journalpostCleared || 0}`);
    console.log(`   Oppgaver: ${data.oppgaveCleared || 0}`);

    return data;
  } catch (error) {
    console.log(`⚠️  Could not clear mock data: ${error.message || error}`);
    throw error;
  }
}

/**
 * Clear all test data silently (no console output)
 * Useful for automatic cleanup in test fixtures
 */
export async function clearMockDataSilent(request: APIRequestContext): Promise<MockClearResponse> {
  const response = await request.delete('http://localhost:8083/testdata/clear');

  if (!response.ok()) {
    throw new Error(`Mock service returned status ${response.status()}`);
  }

  return await response.json();
}
