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
            brukerID: '30056928150',
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

async function tellInstanser(conn: oracledb.Connection): Promise<{ total: number; uferdige: number }> {
    const r: any = await conn.execute(
        `SELECT COUNT(*) AS TOTAL, SUM(CASE WHEN STATUS <> 'FERDIG' THEN 1 ELSE 0 END) AS UFERDIGE FROM PROSESSINSTANS`,
        [], {outFormat: oracledb.OUT_FORMAT_OBJECT}
    );
    return {total: r.rows[0].TOTAL, uferdige: r.rows[0].UFERDIGE ?? 0};
}

/** Venter til den nye instansen faktisk er registrert og ferdig — fasit på hvor lang tid det tar. */
async function ventPåSannheten(conn: oracledb.Connection, før: number, maxMs = 30000): Promise<number> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        const n = await tellInstanser(conn);
        if (n.total > før && n.uferdige === 0) return Date.now() - start;
        await new Promise(r => setTimeout(r, 50));
    }
    return -1;
}

(async () => {
    const conn = await oracledb.getConnection(dbConfig);
    let løgner = 0;
    console.log(`\n=== waitForProcessInstances-race — modus: ${MODE.toUpperCase()}, ${ITERATIONS} iterasjoner ===\n`);

    for (let i = 1; i <= ITERATIONS; i++) {
        const før = await tellInstanser(conn);

        const markør = MODE === 'new' ? await hentMarkør() : null;

        const t0 = Date.now();
        // Fire-and-forget, akkurat som et UI-klikk: AnnulleringPage.bekreft() klikker knappen
        // og returnerer med én gang — den venter ikke på at POST-en er committet.
        const postPromise = opprettSak();

        const svar = markør ? await ventNy(markør) : await ventGammel();
        const ventetMs = Date.now() - t0;

        const etter = await tellInstanser(conn);
        const nye = etter.total - før.total;
        const løy = svar.status === 'COMPLETED' && (nye < 1 || etter.uferdige > 0);
        if (løy) løgner++;

        const status = await postPromise;
        if (status !== 204) {
            console.log(`  ${i}: POST /api/fagsaker ga ${status} — iterasjonen forkastes`);
            continue;
        }

        const sannhetMs = await ventPåSannheten(conn, før.total);

        console.log(
            `  ${i}: ${løy ? '❌ LØY  ' : '✅ ok   '} svar=${svar.status} etter ${ventetMs}ms | ` +
            `nye instanser ved svartidspunkt=${nye}, uferdige=${etter.uferdige} | ` +
            `faktisk ferdig etter ~${sannhetMs}ms`
        );
    }

    console.log(`\n=== ${løgner}/${ITERATIONS} falske COMPLETED (${MODE}) ===\n`);
    await conn.close();
    process.exit(løgner > 0 && MODE === 'new' ? 1 : 0);
})();
