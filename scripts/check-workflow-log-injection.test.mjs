// Regresjonstest for check-workflow-log-injection.
//
// Fire runder på samme klasse gikk uten testflate, og et verify-pass viste hva
// det kostet: sju av åtte mutasjoner i sjekken gikk uoppdaget — inkludert å
// fjerne fiksen den selv nettopp hadde innført. Hver test her svarer til én
// mutasjon som slapp gjennom.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finnLoggInjeksjon } from './check-workflow-log-injection.mjs';

/** Skriver én workflow til en egen katalog og kjører sjekken på den. */
function sjekk(innhold) {
  const dir = mkdtempSync(join(tmpdir(), 'wf-'));
  const wf = join(dir, 'workflows');
  mkdirSync(wf);
  writeFileSync(join(wf, 'test.yml'), innhold);
  try {
    return finnLoggInjeksjon(wf);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const HODE = `name: T
on:
  workflow_dispatch:
    inputs:
      note: { type: string }
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - name: s
`;

test('rått ekko av en verdi utenfra gir funn', () => {
  const funn = sjekk(HODE + `        env:
          NOTE: \${{ inputs.note }}
        run: |
          echo "note: $NOTE"
`);
  assert.equal(funn.length, 1);
  assert.match(funn[0], /logger NOTE/);
});

test('log_payload gjør den samme linja grei', () => {
  const funn = sjekk(HODE + `        env:
          NOTE: \${{ inputs.note }}
        run: |
          log_payload() { printf '%s %s\\n' "$1" "$(printf '%s' "$2" | tr '\\n\\r' '  ')"; }
          log_payload "note:" "$NOTE"
`);
  assert.deepEqual(funn, []);
});

test('log_payload uten tr er ikke et løfte — definisjonen sjekkes', () => {
  const funn = sjekk(HODE + `        env:
          NOTE: \${{ inputs.note }}
        run: |
          log_payload() { printf '%s %s\\n' "$1" "$2"; }
          log_payload "note:" "$NOTE"
`);
  assert.equal(funn.length, 1);
  assert.match(funn[0], /log_payload fjerner ikke linjeskift/);
});

test('taint følger lokale tilordninger', () => {
  const funn = sjekk(HODE + `        env:
          NOTE: \${{ inputs.note }}
        run: |
          LOKAL="$NOTE"
          echo "note: $LOKAL"
`);
  assert.equal(funn.length, 1);
  assert.match(funn[0], /logger LOKAL/);
});

test('verdi utenfra rett i run: gir funn, også i en shell-if', () => {
  const funn = sjekk(HODE + `        run: |
          if [ "\${{ inputs.note }}" = "x" ]; then echo hei; fi
`);
  assert.equal(funn.length, 1);
  assert.match(funn[0], /interpolert rett i run:/);
});

test('verdien fanges uansett hvor i uttrykket den står', () => {
  // Denne formen skjulte cleanup-old-workflows.yml i tre runder.
  const funn = sjekk(HODE + `        env:
          NOTE: \${{ inputs.note || '30' }}
        run: |
          echo "note: $NOTE"
`);
  assert.equal(funn.length, 1);
  assert.match(funn[0], /logger NOTE/);
});

test('$GITHUB_ENV er en sink, ikke et unntak', () => {
  const funn = sjekk(HODE + `        env:
          NOTE: \${{ inputs.note }}
        run: |
          echo "BAERES=$NOTE" >> "$GITHUB_ENV"
`);
  assert.equal(funn.length, 1);
});

test('$GITHUB_STEP_SUMMARY er markdown, ikke kommandoer', () => {
  const funn = sjekk(HODE + `        env:
          NOTE: \${{ inputs.note }}
        run: |
          echo "note: $NOTE" >> "$GITHUB_STEP_SUMMARY"
`);
  assert.deepEqual(funn, []);
});

test('tee og kommandoer etter ; fanges', () => {
  const funn = sjekk(HODE + `        env:
          NOTE: \${{ inputs.note }}
        run: |
          printf '%s\\n' "$NOTE" | tee /tmp/x
          true; echo "note: $NOTE"
`);
  assert.equal(funn.length, 2);
});

test('inline env-blokk er en deklarasjon, ikke et skript', () => {
  const funn = sjekk(HODE + `        env: { NOTE: "\${{ inputs.note }}" }
        run: |
          log_payload() { printf '%s %s\\n' "$1" "$(printf '%s' "$2" | tr '\\n\\r' '  ')"; }
          log_payload "note:" "$NOTE"
`);
  assert.deepEqual(funn, []);
});

test('inline env-blokk smitter også — ellers er unntaket over vakuøst', () => {
  const funn = sjekk(HODE + `        env: { NOTE: "\${{ inputs.note }}" }
        run: |
          echo "note: $NOTE"
`);
  assert.equal(funn.length, 1);
  assert.match(funn[0], /logger NOTE/);
});

test('en merkelapp krever at valideringen den viser til finnes', () => {
  const funn = sjekk(HODE + `        env:
          NOTE: \${{ inputs.note }}
        run: |
          echo "note: $NOTE"  # log-injection-ok: validert som tall
`);
  assert.equal(funn.length, 1);
  assert.match(funn[0], /viser til en validering som ikke finnes/);
});

test('og at valideringen er ANKRET — ikke bare første tegn', () => {
  // «^[0-9]» uten $ slipper gjennom $'123\n::add-mask::latest'.
  const uankret = sjekk(HODE + `        env:
          NOTE: \${{ inputs.note }}
        run: |
          if ! [[ "$NOTE" =~ ^[0-9] ]]; then exit 1; fi
          echo "note: $NOTE"  # log-injection-ok: validert som tall
`);
  assert.equal(uankret.length, 1, 'uankret validering skal ikke godtas');

  const ankret = sjekk(HODE + `        env:
          NOTE: \${{ inputs.note }}
        run: |
          if ! [[ "$NOTE" =~ ^[0-9]+$ ]]; then exit 1; fi
          echo "note: $NOTE"  # log-injection-ok: validert som tall
`);
  assert.deepEqual(ankret, []);
});
