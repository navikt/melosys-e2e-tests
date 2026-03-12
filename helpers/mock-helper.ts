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

/**
 * A SED document stored in the RINA CPI mock
 */
export interface RinaDocumentInfo {
  caseId: string;
  documentId: string;
  sedType: string | null;
  content: Record<string, unknown>;
}

/**
 * Fetch stored SED documents from the RINA CPI mock.
 *
 * These are the documents that melosys-eessi has submitted to RINA via
 * POST /eux/cpi/buc/{id}/sed. They contain the full SED JSON content.
 *
 * @param request - Playwright APIRequestContext
 * @param sedType - Optional SED type filter (e.g., 'A008')
 * @returns Array of stored SED documents with full content
 */
export async function fetchStoredSedDocuments(
  request: APIRequestContext,
  sedType?: string
): Promise<RinaDocumentInfo[]> {
  const url = sedType
    ? `http://localhost:8083/testdata/verification/rina/documents?sedType=${sedType}`
    : 'http://localhost:8083/testdata/verification/rina/documents';

  const response = await request.get(url);

  if (!response.ok()) {
    throw new Error(`Failed to fetch stored SED documents: ${response.status()}`);
  }

  return await response.json();
}

/**
 * Find the newest NAV-format SED document that was not present in a previous snapshot.
 *
 * The RINA CPI mock stores documents in both NAV format (from melosys-eessi)
 * and EU format (from eux-rina-api). NAV format documents have `sed` and `sedVer`
 * at the root level.
 *
 * Usage:
 *   // Before the action that creates the SED:
 *   const before = await fetchStoredSedDocuments(request, 'A008');
 *   // ... perform action ...
 *   const sedContent = await findNewNavFormatSed(request, 'A008', before);
 */
export async function findNewNavFormatSed(
  request: APIRequestContext,
  sedType: string,
  before: RinaDocumentInfo[],
  timeoutMs = 30000
): Promise<Record<string, any>> {
  const beforeKeys = new Set(before.map(d => `${d.caseId}:${d.documentId}`));
  const pollInterval = 2000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const after = await fetchStoredSedDocuments(request, sedType);
    const newDocs = after.filter(d => !beforeKeys.has(`${d.caseId}:${d.documentId}`));

    // Filter to NAV format (has 'sed' and 'sedVer' at root)
    const navFormatDocs = newDocs.filter(d => {
      const c = d.content as Record<string, any>;
      return c.sed !== undefined && c.sedVer !== undefined;
    });

    if (navFormatDocs.length > 0) {
      return navFormatDocs[navFormatDocs.length - 1].content as Record<string, any>;
    }

    console.log(`⏳ Waiting for NAV-format ${sedType} SED... (new docs: ${newDocs.length})`);
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Final attempt with detailed error
  const after = await fetchStoredSedDocuments(request, sedType);
  const newDocs = after.filter(d => !beforeKeys.has(`${d.caseId}:${d.documentId}`));
  const formats = newDocs.map(d => Object.keys(d.content).join(',')).join(' | ');
  throw new Error(
    `Timed out waiting for NAV-format ${sedType} document (${timeoutMs}ms). ` +
    `New docs: ${newDocs.length}, formats: [${formats}]`
  );
}

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
    console.log(`⚠️  Could not clear mock data: ${(error as Error).message || error}`);
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
  /** Fødselsnummer for bruker. If not set, uses first person in PersonRepo */
  brukerIdent?: string;
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
  const payload: Record<string, unknown> = {
    antall: options.antall ?? 1,
    forVirksomhet: options.forVirksomhet ?? false,
    medLogiskVedlegg: options.medLogiskVedlegg ?? false,
    medVedlegg: options.medVedlegg ?? false,
    tilordnetRessurs: options.tilordnetRessurs ?? 'Z990693', // testuser
  };

  if (options.brukerIdent) {
    payload.brukerIdent = options.brukerIdent;
  }

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
