/**
 * Kunstig reproduksjon av prosessinstans-racet — fasiten på om ventingen faktisk virker.
 *
 * Trigger: POST /api/fagsaker (oppretter én OPPRETT_SAK-prosessinstans, asynkront dispatchet
 * AFTER_COMMIT). POST-en ventes IKKE på, akkurat som et UI-klikk: AnnulleringPage.bekreft()
 * klikker knappen og returnerer med én gang. Rett etterpå kalles ventemetoden, og
 * PROSESSINSTANS-tabellen leses ØYEBLIKKELIG. Svarte ventemetoden COMPLETED uten at det finnes
 * en ny, ferdig instans, har den løyet — den ventet på forrige stegs arbeid.
 *
 * Racet oppstår bare når backend er treg nok. På en frisk lokal maskin committer POST-en på
 * ~20 ms og rekker innenfor settling-forsinkelsen, så racet må fremtvinges:
 *
 *   1. Kjør melosys-api med `melosys.e2e.initial-settling-delay-ms=0`
 *      (compose: `MELOSYS_E2E_INITIAL_SETTLING_DELAY_MS: "0"` på melosys-api).
 *   2. Legg en kort forsinkelse i registreringen — f.eks. `Thread.sleep(400)` først i
 *      `ProsessinstansService.lagre(...)` i melosys-api. IKKE commit den.
 *
 * Målt 2026-07-31 under de betingelsene: `old` løy 9/10, `new` 0/10.
 *
 * Kjør:  npx ts-node --transpile-only scripts/prosessinstans-race-repro.ts [iterasjoner] [old|new]
 *        (trenger TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}')
 */
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import oracledb from 'oracledb';
import {USER_ID_VALID} from '../pages/shared/constants';

dotenv.config({path: path.resolve(__dirname, '../.env')});
dotenv.config({path: path.resolve(__dirname, '../.env.local'), override: true});

const API = 'http://localhost:8080';
const MODE = (process.argv[3] || 'old') as 'old' | 'new';
const ITERATIONS = Number(process.argv[2] || 10);

const dbConfig = {
    user: process.env.DB_USER || 'MELOSYS',
    password: process.env.DB_PASSWORD || 'melosyspwd',
    connectString: process.env.DB_CONNECT_STRING || `localhost:1521/${process.env.MELOSYS_ORACLE_DB_NAME || 'freepdb1'}`
};

const token = process.env.LOCAL_AUTH_TOKEN!;

async function opprettSak(): Promise<number> {
    const res = await fetch(`${API}/api/fagsaker`, {
        method: 'POST',
        headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8'},
        body: JSON.stringify({
            hovedpart: 'BRUKER',
            brukerID: USER_ID_VALID,
            sakstype: 'FTRL',
            sakstema: 'MEDLEMSKAP_LOVVALG',
            behandlingstema: 'YRKESAKTIV',
            behandlingstype: 'FØRSTEGANG',
            behandlingsaarsakType: 'SØKNAD',
            mottaksdato: '2026-07-31',
            soknadDto: {
                periode: {fom: '2026-01-01', tom: '2026-12-31'},
                land: {landkoder: ['SWE'], flereLandUkjentHvilke: false}
            }
        })
    });
    return res.status;
}

/** Dagens kontrakt: helperen sender kun timeout, serveren bestemmer alt annet. */
async function ventGammel(): Promise<any> {
    const res = await fetch(`${API}/internal/e2e/process-instances/await?timeoutSeconds=30`);
    return res.json();
}

/** Ny kontrakt: markør tatt FØR handlingen, og krav om N nye instanser etter markøren. */
async function hentMarkør(): Promise<string> {
    const res = await fetch(`${API}/internal/e2e/process-instances/marker`);
    if (!res.ok) throw new Error(`marker-endepunktet mangler (${res.status}) — er ny api-image deployet?`);
    return (await res.json()).marker;
}

async function ventNy(markør: string): Promise<any> {
    const res = await fetch(
        `${API}/internal/e2e/process-instances/await?timeoutSeconds=30&after=${encodeURIComponent(markør)}&expectedNew=1`
    );
    return res.json();
}

type Instans = { id: string; status: string };

/**
 * Leser instansene som IDer, ikke som antall: da kan «nye siden handlingen» avgjøres eksakt,
 * uten å blande inn eldre uferdige rader fra tidligere kjøringer.
 */
async function hentInstanser(conn: oracledb.Connection): Promise<Instans[]> {
    const r: any = await conn.execute(
        `SELECT RAWTOHEX(UUID) AS ID, STATUS FROM PROSESSINSTANS`,
        [], {outFormat: oracledb.OUT_FORMAT_OBJECT}
    );
    return r.rows.map((rad: any) => ({id: rad.ID, status: rad.STATUS}));
}

function nyeSiden(før: Set<string>, etter: Instans[]): Instans[] {
    return etter.filter(i => !før.has(i.id));
}

/** Venter til handlingens egen instans faktisk er registrert og ferdig — fasit på hvor lang tid det tar. */
async function ventPåSannheten(conn: oracledb.Connection, før: Set<string>, maxMs = 30000): Promise<number> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        const nye = nyeSiden(før, await hentInstanser(conn));
        if (nye.length > 0 && nye.every(i => i.status === 'FERDIG')) return Date.now() - start;
        await new Promise(r => setTimeout(r, 50));
    }
    return -1;
}

(async () => {
    const conn = await oracledb.getConnection(dbConfig);
    let løgner = 0;
    let forkastet = 0;
    console.log(`\n=== prosessinstans-race — modus: ${MODE.toUpperCase()}, ${ITERATIONS} iterasjoner ===`);
    if (MODE === 'old') {
        // Uten dette leses «0 løgner» lett som «racet finnes ikke», når det egentlig betyr
        // «betingelsene som fremkaller racet er ikke satt opp».
        console.log(
            'NB: `old` gir 0 løgner på en frisk backend — POST-en committer på ~20 ms og rekker\n' +
            '    innenfor settling-forsinkelsen. Racet krever settling-delay 0 OG treg registrering\n' +
            '    (se filhodet). Er de ikke satt opp, måler denne kjøringen ingenting.'
        );
    }
    console.log('');

    for (let i = 1; i <= ITERATIONS; i++) {
        const før = new Set((await hentInstanser(conn)).map(x => x.id));

        const markør = MODE === 'new' ? await hentMarkør() : null;

        const t0 = Date.now();
        // Fire-and-forget, akkurat som et UI-klikk: AnnulleringPage.bekreft() klikker knappen
        // og returnerer med én gang — den venter ikke på at POST-en er committet.
        const postPromise = opprettSak();

        const svar = markør ? await ventNy(markør) : await ventGammel();
        const ventetMs = Date.now() - t0;

        const nye = nyeSiden(før, await hentInstanser(conn));

        // Iterasjoner der handlingen aldri traff må forkastes FØR de telles: en feilet POST
        // oppretter ingen instans, og ville da garantert blitt bokført som en løgn.
        const status = await postPromise;
        if (status !== 204) {
            console.log(`  ${i}: POST /api/fagsaker ga ${status} — iterasjonen forkastes`);
            forkastet++;
            continue;
        }

        const uferdige = nye.filter(x => x.status !== 'FERDIG').length;
        const løy = svar.status === 'COMPLETED' && (nye.length < 1 || uferdige > 0);
        if (løy) løgner++;

        const sannhetMs = await ventPåSannheten(conn, før);

        console.log(
            `  ${i}: ${løy ? '❌ LØY  ' : '✅ ok   '} svar=${svar.status} etter ${ventetMs}ms | ` +
            `nye instanser ved svartidspunkt=${nye.length}, uferdige=${uferdige} | ` +
            `faktisk ferdig etter ${sannhetMs < 0 ? 'ALDRI (timeout)' : `~${sannhetMs}ms`}`
        );
    }

    const talt = ITERATIONS - forkastet;
    console.log(`\n=== ${løgner}/${talt} falske COMPLETED (${MODE})${forkastet ? `, ${forkastet} forkastet` : ''} ===`);
    console.log(
        'Merk: skriptet lager ekte saker og rydder ikke opp. Kjør cleanup-fixturen eller\n' +
        '`npx playwright test` etterpå hvis du vil ha ren database.\n'
    );
    await conn.close();
    process.exit(løgner > 0 && MODE === 'new' ? 1 : 0);
})();
