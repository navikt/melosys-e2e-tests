#!/usr/bin/env node
// Guardrail mot workflow-kommando-injeksjon i GitHub Actions-loggen.
//
// GitHub leser en logglinje som starter med «::» som en kommando. Skriver et
// steg en verdi utenfra — client_payload fra et fremmed repo, eller en
// workflow_dispatch-input — rått til loggen, kan avsenderen sende en verdi med
// linjeskift og få «::error title=…::» (forfalsket annotasjon på kjøringen)
// eller «::add-mask::latest» (skjuler tekst i resten av jobbloggen).
//
// Klassen ble lappet tre ganger på tre steder før den ble talt opp: taint
// forplanter seg gjennom lokale tilordninger (INPUT_ENV=$INPUT_ENVIRONMENT),
// så en øyeblikkelig lesing finner bare det stedet man ser på. Denne sjekken
// følger taint til fikspunkt og ser hele tilstandsrommet.
//
// To lovlige måter å skrive en slik verdi til loggen:
//   1. log_payload "Ledetekst:" "$VERDI"          (fjerner linjeskift)
//   2. printf '%s' "$VERDI" | tr '\n\r' '  '      (samme, inline)
// En verdi som er validert mot en grammatikk uten linjeskift merkes i stedet
// med «# log-injection-ok: <grunn>» på linja.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.github/workflows';
const UNTRUSTED = /\$\{\{\s*(inputs\.\w+|github\.event\.client_payload\.\w+|github\.event\.action)\s*\}\}/;
const ENV_ASSIGN = /^\s{2,}([A-Za-z_][A-Za-z0-9_]*):\s*(\$\{\{.*\}\}.*)$/;
const SHELL_ASSIGN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const LOG_LINE = /^(echo|printf|\[[^\]]*\]\s*&&\s*(echo|printf))\b/;
const SAFE = [/log_payload\s/, /\|\s*tr\s+'\\n\\r'/];
const ALLOW = /#\s*log-injection-ok:/;

let funn = [];

for (const fil of readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))) {
  const linjer = readFileSync(join(DIR, fil), 'utf-8').split('\n');

  // 1. env:-navn som får verdi utenfra.
  const smittet = new Set();
  for (const linje of linjer) {
    const m = ENV_ASSIGN.exec(linje);
    if (m && UNTRUSTED.test(m[2])) smittet.add(m[1]);
  }

  // 2. Taint gjennom lokale tilordninger, til fikspunkt.
  for (let runde = 0; runde < 20; runde++) {
    let vokste = false;
    for (const linje of linjer) {
      if (ENV_ASSIGN.test(linje)) continue;
      const m = SHELL_ASSIGN.exec(linje);
      if (!m || smittet.has(m[1])) continue;
      const brukerSmittet = [...smittet].some((navn) => new RegExp(`\\$\\{?${navn}\\b`).test(m[2]));
      if (UNTRUSTED.test(m[2]) || brukerSmittet) {
        smittet.add(m[1]);
        vokste = true;
      }
    }
    if (!vokste) break;
  }

  // 3. log_payload er bare et løfte hvis definisjonen holder det. Uten denne
  //    sjekken består alt så lenge kallsidene NEVNER hjelperen.
  const definisjon = linjer.find((l) => /log_payload\(\)\s*\{/.test(l));
  if (definisjon && !/\|\s*tr\s+'\\n\\r'/.test(definisjon)) {
    funn.push(
      `${fil}:${linjer.indexOf(definisjon) + 1}: log_payload fjerner ikke linjeskift — ` +
        'kallsidene som stoler på den er ikke trygge\n    ' + definisjon.trim().slice(0, 110),
    );
  }
  if (!definisjon && linjer.some((l) => /log_payload\s+"/.test(l))) {
    funn.push(`${fil}: log_payload brukes, men er ikke definert i filen`);
  }

  // 4. «log-injection-ok» er en påstand, ikke et bevis: sjekken kan ikke se om
  //    grunnen holder. Der grunnen er en validering ANDRE steder i filen, pinnes
  //    den valideringen — ellers består sjekken mens merkelappene er blitt usanne.
  const KREVER = [
    { marker: /log-injection-ok: tag-verdiene er validert/, kilde: /\[\[ "\$tag_value" =~ \^\[A-Za-z0-9_\]/ },
    { marker: /log-injection-ok: validert som tall/, kilde: /=~ \^\[0-9\]\+\$/ },
  ];
  for (const { marker, kilde } of KREVER) {
    const paastand = linjer.findIndex((l) => marker.test(l));
    if (paastand !== -1 && !linjer.some((l) => kilde.test(l))) {
      funn.push(
        `${fil}:${paastand + 1}: linja viser til en validering som ikke finnes lenger — ` +
          'fjern merkelappen eller legg valideringen tilbake',
      );
    }
  }

  // 5. Skrivinger til loggen som bruker en smittet verdi.
  linjer.forEach((linje, i) => {
    const s = linje.trim();
    const nr = i + 1;
    if (ALLOW.test(s)) return;

    // Verdi utenfra rett i et run:-skript er alltid feil — også utenom loggen.
    if (UNTRUSTED.test(s) && !ENV_ASSIGN.test(linje) && !/^\s*(if:|#)/.test(s)) {
      funn.push(`${fil}:${nr}: verdi utenfra interpolert rett i run: — les den fra env: i stedet\n    ${s.slice(0, 110)}`);
      return;
    }
    if (!LOG_LINE.test(s)) return;
    if (/GITHUB_(OUTPUT|ENV|STEP_SUMMARY)/.test(s)) return;
    if (SAFE.some((re) => re.test(s))) return;
    const brukt = [...smittet].filter((navn) => new RegExp(`\\$\\{?${navn}\\b`).test(s));
    if (brukt.length > 0) {
      funn.push(`${fil}:${nr}: logger ${brukt.join(', ')} uten å fjerne linjeskift\n    ${s.slice(0, 110)}`);
    }
  });
}

if (funn.length > 0) {
  console.error('❌ Mulig workflow-kommando-injeksjon i jobbloggen:\n');
  for (const f of funn) console.error('  ' + f + '\n');
  console.error('Bruk log_payload (eller tr) — eller merk linja med «# log-injection-ok: <grunn>»');
  console.error('hvis verdien er validert mot en grammatikk uten linjeskift.');
  process.exit(1);
}
console.log('✅ check:workflow OK — ingen verdier utenfra skrives rått til jobbloggen.');
