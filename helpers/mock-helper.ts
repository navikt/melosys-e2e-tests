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

/**
 * Options for creating journalføring oppgaver
 */
export interface CreateJfrOppgaveOptions {
  /** Number of oppgaver to create (default: 1) */
  antall?: number;
  /** Create for virksomhet (company) instead of person (default: false) */
  forVirksomhet?: boolean;
  /** Include logical attachments (default: false) */
  medLogiskVedlegg?: boolean;
  /** Include attachments (default: false) */
  medVedlegg?: boolean;
  /** Assigned resource/user ID (default: Z990693 - testuser) */
  tilordnetRessurs?: string;
}

/**
 * Create journalføring oppgaver in melosys-mock
 *
 * This creates test journalføring tasks that will appear in "Mine oppgaver"
 * and trigger JFR_NY_SAK_BRUKER process when completed.
 *
 * @param request - Playwright APIRequestContext
 * @param options - Configuration options
 * @returns true if successful
 *
 * @example
 * // Create 1 journalføring oppgave for the test user
 * await createJournalforingOppgaver(request);
 *
 * // Create 3 oppgaver with attachments
 * await createJournalforingOppgaver(request, { antall: 3, medVedlegg: true });
 */
export async function createJournalforingOppgaver(
  request: APIRequestContext,
  options: CreateJfrOppgaveOptions = {}
): Promise<boolean> {
  const payload = {
    antall: options.antall ?? 1,
    forVirksomhet: options.forVirksomhet ?? false,
    medLogiskVedlegg: options.medLogiskVedlegg ?? false,
    medVedlegg: options.medVedlegg ?? false,
    tilordnetRessurs: options.tilordnetRessurs ?? 'Z990693', // testuser
  };

  try {
    const response = await request.post('http://localhost:8083/testdata/jfr-oppgave', {
      data: payload,
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok()) {
      console.log(`⚠️ Failed to create journalføring oppgaver: ${response.status()}`);
      return false;
    }

    console.log(`✅ Created ${payload.antall} journalføring oppgave(r)`);
    return true;
  } catch (error) {
    console.log(`⚠️ Could not create journalføring oppgaver: ${error}`);
    return false;
  }
}

/**
 * Response from creating a journalpost for a sak
 */
export interface JournalpostForSakResponse {
  journalpostId: string;
  fagsakId: string;
  dokumentInfoIds: string[];
}

/**
 * Options for creating a journalpost linked to a fagsak
 */
export interface CreateJournalpostForSakOptions {
  /** The saksnummer (e.g., "MEL-95") */
  fagsakId: string;
  /** The bruker's fødselsnummer */
  brukerIdent: string;
  /** Optional title for the document */
  tittel?: string;
}

/**
 * Create a journalpost (with document) linked to a specific fagsak.
 *
 * This is needed for flows that require documents attached to the sak,
 * such as "Videresend søknad" which requires at least one vedlegg.
 *
 * @param request - Playwright APIRequestContext
 * @param options - Configuration options including fagsakId and brukerIdent
 * @returns Response with journalpostId and dokumentInfoIds
 *
 * @example
 * // Create a journalpost for sak MEL-95
 * const result = await createJournalpostForSak(request, {
 *   fagsakId: 'MEL-95',
 *   brukerIdent: '30056928150'
 * });
 * console.log('Created journalpost:', result.journalpostId);
 * console.log('Document IDs:', result.dokumentInfoIds);
 */
export async function createJournalpostForSak(
  request: APIRequestContext,
  options: CreateJournalpostForSakOptions
): Promise<JournalpostForSakResponse> {
  const payload = {
    fagsakId: options.fagsakId,
    brukerIdent: options.brukerIdent,
    tittel: options.tittel ?? 'Søknad om A1 for utsendte arbeidstakere',
  };

  const response = await request.post('http://localhost:8083/testdata/journalpost', {
    data: payload,
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok()) {
    const errorText = await response.text();
    throw new Error(`Failed to create journalpost for sak: ${response.status()} - ${errorText}`);
  }

  const result: JournalpostForSakResponse = await response.json();
  console.log(`✅ Created journalpost ${result.journalpostId} for sak ${result.fagsakId}`);
  console.log(`   Documents: ${result.dokumentInfoIds.join(', ')}`);

  return result;
}
