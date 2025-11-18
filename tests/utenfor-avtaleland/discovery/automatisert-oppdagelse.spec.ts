import { test } from '../../../fixtures';
import { AuthHelper } from '../../../helpers/auth-helper';
import { HovedsidePage } from '../../../pages/hovedside.page';
import { OpprettNySakPage } from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../../../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../../../pages/behandling/lovvalg.page';
import { USER_ID_VALID } from '../../../pages/shared/constants';
import { waitForProcessInstances } from '../../../helpers/api-helper';
import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Automatisert Oppdagelse Script for Alle Bestemmelser
 *
 * Dette scriptet tester systematisk hver bestemmelse for å oppdage:
 * 1. Hvilke spørsmål som vises
 * 2. Hvilke Ja/Nei kombinasjoner som blokkerer progresjon
 * 3. Hvilke kombinasjoner som tillater fortsettelse
 * 4. Eksakte advarselsmeldinger
 *
 * Output: JSON og Markdown rapporter for hver bestemmelse
 */

interface Question {
  text: string;
  groupName?: string;
  index: number;
}

interface ScenarioResult {
  answers: ('Ja' | 'Nei')[];
  canProceed: boolean;
  warningMessage?: string;
  questionsAppeared: string[];
}

interface BestemmelseDiscovery {
  code: string;
  displayName: string;
  questions: Question[];
  scenarios: ScenarioResult[];
  validScenarios: ScenarioResult[];
  blockingScenarios: ScenarioResult[];
}

async function setupBehandlingToLovvalg(page: Page): Promise<LovvalgPage> {
  const auth = new AuthHelper(page);
  await auth.login();

  const hovedside = new HovedsidePage(page);
  const opprettSak = new OpprettNySakPage(page);
  const medlemskap = new MedlemskapPage(page);
  const arbeidsforhold = new ArbeidsforholdPage(page);
  const lovvalg = new LovvalgPage(page);

  await hovedside.gotoOgOpprettNySak();
  await opprettSak.opprettStandardSak(USER_ID_VALID);
  await opprettSak.assertions.verifiserBehandlingOpprettet();

  await waitForProcessInstances(page.request, 30);
  await hovedside.goto();
  await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

  await medlemskap.velgPeriode('01.01.2023', '01.07.2024');
  await medlemskap.velgLand('Afghanistan');
  await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
  await medlemskap.klikkBekreftOgFortsett();

  await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

  return lovvalg;
}

async function detectQuestions(page: Page): Promise<Question[]> {
  const questions: Question[] = [];

  // Find all radio button groups (questions)
  const groups = await page.locator('role=group').filter({ has: page.locator('role=radio') }).all();

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const groupText = await group.getAttribute('aria-label') || await group.textContent();

    if (groupText && !groupText.includes('Velg') && groupText.length > 10) {
      questions.push({
        text: groupText.trim(),
        groupName: groupText.trim(),
        index: i
      });
    }
  }

  return questions;
}

async function answerQuestion(page: Page, questionIndex: number, answer: 'Ja' | 'Nei'): Promise<void> {
  // Get all question groups
  const groups = await page.locator('role=group').filter({ has: page.locator('role=radio') }).all();

  if (questionIndex >= groups.length) {
    console.log(`⚠️  Question ${questionIndex} not found (only ${groups.length} questions visible)`);
    return;
  }

  const group = groups[questionIndex];
  const radio = group.getByLabel(answer);

  if (await radio.isVisible()) {
    await radio.check();
    await page.waitForTimeout(300); // Wait for any conditional questions to appear/disappear
  }
}

async function checkIfCanProceed(page: Page): Promise<boolean> {
  const button = page.getByRole('button', { name: 'Bekreft og fortsett' });
  return await button.isEnabled();
}

async function getWarningMessage(page: Page): Promise<string | undefined> {
  // Look for warning message
  const warningText = page.locator('div, p, span').filter({ hasText: /kan ikke gå videre/i });

  if (await warningText.first().isVisible().catch(() => false)) {
    const text = await warningText.first().textContent();
    return text?.trim();
  }

  return undefined;
}

async function testScenario(
  page: Page,
  lovvalg: LovvalgPage,
  bestemmelse: string,
  answers: ('Ja' | 'Nei')[]
): Promise<ScenarioResult> {
  // Reload page to reset state
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Select bestemmelse
  try {
    await lovvalg.velgBestemmelse(bestemmelse);
    await page.waitForTimeout(800);
  } catch (error) {
    console.log(`      ⚠️  Could not select bestemmelse, retrying...`);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await lovvalg.velgBestemmelse(bestemmelse);
    await page.waitForTimeout(800);
  }

  // Answer questions in sequence
  const questionsAppeared: string[] = [];

  for (let i = 0; i < answers.length; i++) {
    const currentQuestions = await detectQuestions(page);

    if (i < currentQuestions.length) {
      questionsAppeared.push(currentQuestions[i].text);
      await answerQuestion(page, i, answers[i]);
    } else {
      // Question didn't appear (conditional logic)
      break;
    }
  }

  // Wait for any warnings to appear
  await page.waitForTimeout(800);

  // Check results
  const canProceed = await checkIfCanProceed(page);
  const warningMessage = await getWarningMessage(page);

  return {
    answers: answers.slice(0, questionsAppeared.length),
    canProceed,
    warningMessage,
    questionsAppeared
  };
}

async function discoverBestemmelse(
  page: Page,
  lovvalg: LovvalgPage,
  code: string,
  displayName: string
): Promise<BestemmelseDiscovery> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 DISCOVERING: ${displayName}`);
  console.log(`   Code: ${code}`);
  console.log(`${'='.repeat(80)}`);

  // Select bestemmelse to see initial questions
  await lovvalg.velgBestemmelse(code);
  await page.waitForTimeout(500);

  // Detect max questions (test with all "Ja" to see all conditional questions)
  const maxQuestions = await detectQuestions(page);
  console.log(`📋 Found ${maxQuestions.length} potential questions`);
  maxQuestions.forEach((q, i) => {
    console.log(`   ${i + 1}. ${q.text.substring(0, 80)}...`);
  });

  // Generate all combinations
  const numQuestions = maxQuestions.length;
  const numCombinations = Math.pow(2, numQuestions);

  console.log(`\n🧪 Testing ${numCombinations} combinations...`);

  const scenarios: ScenarioResult[] = [];

  for (let i = 0; i < numCombinations; i++) {
    // Convert number to binary to get Ja/Nei pattern
    const answers: ('Ja' | 'Nei')[] = [];
    for (let j = 0; j < numQuestions; j++) {
      answers.push((i & (1 << j)) ? 'Ja' : 'Nei');
    }

    console.log(`   Testing combination ${i + 1}/${numCombinations}: ${answers.join(', ')}`);

    try {
      const result = await testScenario(page, lovvalg, code, answers);
      scenarios.push(result);

      if (result.canProceed) {
        console.log(`      ✅ CAN PROCEED`);
      } else {
        console.log(`      ❌ BLOCKED${result.warningMessage ? ' - Warning shown' : ''}`);
      }
    } catch (error) {
      console.log(`      ⚠️  Error testing combination: ${error}`);
    }
  }

  // Categorize scenarios
  const validScenarios = scenarios.filter(s => s.canProceed);
  const blockingScenarios = scenarios.filter(s => !s.canProceed);

  console.log(`\n📊 Results:`);
  console.log(`   ✅ Valid scenarios: ${validScenarios.length}`);
  console.log(`   ❌ Blocking scenarios: ${blockingScenarios.length}`);

  return {
    code,
    displayName,
    questions: maxQuestions,
    scenarios,
    validScenarios,
    blockingScenarios
  };
}

function saveDiscoveryResults(discovery: BestemmelseDiscovery): void {
  const outputDir = path.join(__dirname, 'discovery-results');

  // Create directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save JSON
  const jsonFile = path.join(outputDir, `${discovery.code}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(discovery, null, 2));
  console.log(`\n💾 Saved JSON: ${jsonFile}`);

  // Save Markdown report
  const mdFile = path.join(outputDir, `${discovery.code}.md`);
  let markdown = `# ${discovery.displayName}\n\n`;
  markdown += `**Code:** \`${discovery.code}\`\n\n`;
  markdown += `## Questions\n\n`;

  discovery.questions.forEach((q, i) => {
    markdown += `${i + 1}. ${q.text}\n`;
  });

  markdown += `\n## Valid Scenarios (${discovery.validScenarios.length})\n\n`;
  markdown += `| Answers | Result |\n`;
  markdown += `|---------|--------|\n`;
  discovery.validScenarios.forEach(s => {
    markdown += `| ${s.answers.join(', ')} | ✅ CAN PROCEED |\n`;
  });

  markdown += `\n## Blocking Scenarios (${discovery.blockingScenarios.length})\n\n`;
  markdown += `| Answers | Warning |\n`;
  markdown += `|---------|--------|\n`;
  discovery.blockingScenarios.forEach(s => {
    const warning = s.warningMessage ? s.warningMessage.substring(0, 50) + '...' : 'No warning captured';
    markdown += `| ${s.answers.join(', ')} | ❌ ${warning} |\n`;
  });

  fs.writeFileSync(mdFile, markdown);
  console.log(`💾 Saved Markdown: ${mdFile}`);
}

// Hovedtest - Kjør automatisert oppdagelse
test.describe('Automatisert Bestemmelse Oppdagelse @manual', () => {
  // Høy prioritet bestemmelser å teste
  // Start med § 2-8 b (student) - mest lik § 2-8 a som vi allerede har testet
  const HIGH_PRIORITY = [
    { code: 'FTRL_KAP2_2_8_FØRSTE_LEDD_B', name: '§ 2-8 første ledd bokstav b (student)' }
    // Uncomment to test more:
    // { code: 'FTRL_KAP2_2_1', name: '§ 2-1 (bosatt i Norge)' },
    // { code: 'FTRL_KAP2_2_2', name: '§ 2-2 (arbeidstaker i Norge)' },
    // { code: 'FTRL_KAP2_2_7_FØRSTE_LEDD', name: '§ 2-7 første ledd (opphold i Norge)' },
    // { code: 'FTRL_KAP2_2_7A', name: '§ 2-7a (bosatt i Norge, arbeid på utenlandsk skip)' },
    // { code: 'FTRL_KAP2_2_8_ANDRE_LEDD', name: '§ 2-8 andre ledd (særlig grunn)' }
  ];

  // Test hver bestemmelse
  HIGH_PRIORITY.forEach(({ code, name }) => {
    test(`Oppdag: ${name}`, async ({ page }) => {
      test.setTimeout(120000); // 2 minutter for oppdagelse

      const lovvalg = await setupBehandlingToLovvalg(page);

      const discovery = await discoverBestemmelse(page, lovvalg, code, name);

      saveDiscoveryResults(discovery);

      // Log summary
      console.log(`\n✅ Discovery complete for ${name}`);
      console.log(`   Questions: ${discovery.questions.length}`);
      console.log(`   Valid scenarios: ${discovery.validScenarios.length}`);
      console.log(`   Blocking scenarios: ${discovery.blockingScenarios.length}`);
    });
  });
});
