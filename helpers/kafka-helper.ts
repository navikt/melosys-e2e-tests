import { execSync } from 'node:child_process';

/**
 * Leser meldinger fra Kafka-topics i den lokale stacken.
 *
 * Bruker kafka-console-consumer/kafka-get-offsets inne i kafka-containeren (samme mønster som
 * skattehendelse-helper), så det virker både lokalt og på CI uten Kafka-klient i testrepoet.
 *
 * Topicene beholder meldinger fra tidligere kjøringer. Hent derfor slutt-offset FØR steget som
 * produserer meldingene, og les bare meldinger fra og med den offseten.
 *
 * @example
 * const offsets = hentSluttOffsets(KAFKA_TOPICS.FAKTURA_BESTILT);
 * await vedtak.klikkFattVedtak();
 * const meldinger = await ventPåMeldinger<FakturaBestiltMelding>(KAFKA_TOPICS.FAKTURA_BESTILT, {
 *   fraOffsets: offsets,
 *   antall: 4,
 * });
 */

const BOOTSTRAP_SERVER = 'kafka.melosys.docker-internal:9092';

export const KAFKA_TOPICS = {
  /** Fakturaer sendt fra faktureringskomponenten til OEBS */
  FAKTURA_BESTILT: 'faktura-bestilt.v1',
} as const;

/** Slutt-offset per partisjon */
export type KafkaOffsets = Record<number, number>;

/** FakturaBestiltDto fra faktureringskomponenten */
export interface FakturaBestiltMelding {
  fodselsnummer: string;
  fullmektigOrgnr: string | null;
  fullmektigFnr: string | null;
  fakturaserieReferanse: string;
  fakturaReferanseNr: string;
  krediteringFakturaRef: string;
  referanseBruker: string;
  referanseNAV: string;
  beskrivelse: string;
  artikkel: string;
  faktureringsDato: string;
  fakturaLinjer: {
    beskrivelse: string;
    antall: number;
    enhetspris: number;
    belop: number;
  }[];
}

function kafka(kommando: string): string {
  return execSync(`docker exec kafka ${kommando} --bootstrap-server ${BOOTSTRAP_SERVER}`, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Henter slutt-offset per partisjon. Et topic som ikke finnes ennå gir offset 0 på partisjon 0.
 */
export function hentSluttOffsets(topic: string): KafkaOffsets {
  const offsets: KafkaOffsets = { 0: 0 };
  let utdata: string;
  try {
    utdata = kafka(`kafka-get-offsets --topic ${topic}`);
  } catch (feil) {
    const { stdout = '', stderr = '' } = feil as { stdout?: string; stderr?: string };
    if (`${stdout}${stderr}`.includes('Could not match any topic-partitions')) return offsets;
    throw feil;
  }
  // Utdata: "<topic>:<partisjon>:<offset>" per linje
  for (const linje of utdata.split('\n')) {
    const match = linje.trim().match(/:(\d+):(\d+)$/);
    if (match) offsets[Number(match[1])] = Number(match[2]);
  }
  return offsets;
}

/**
 * Leser alle JSON-meldinger fra og med gitte offsets. Linjer som ikke er JSON hoppes over.
 */
export function lesMeldinger<T>(topic: string, fraOffsets: KafkaOffsets, timeoutMs = 3000): T[] {
  return Object.entries(fraOffsets).flatMap(([partisjon, offset]) => {
    const utdata = kafka(
      `kafka-console-consumer --topic ${topic} --partition ${partisjon} --offset ${offset} --timeout-ms ${timeoutMs}`
    );
    return utdata.split('\n').flatMap(linje => {
      try {
        return [JSON.parse(linje) as T];
      } catch {
        return [];
      }
    });
  });
}

/**
 * Poller topicet til det har kommet minst `antall` meldinger fra og med `fraOffsets`.
 */
export async function ventPåMeldinger<T>(
  topic: string,
  { fraOffsets, antall, timeoutMs = 90000, intervalMs = 2000 }: {
    fraOffsets: KafkaOffsets;
    antall: number;
    timeoutMs?: number;
    intervalMs?: number;
  }
): Promise<T[]> {
  const frist = Date.now() + timeoutMs;
  let meldinger: T[] = [];
  let sisteFeil: unknown;
  while (Date.now() < frist) {
    try {
      meldinger = lesMeldinger<T>(topic, fraOffsets);
      if (meldinger.length >= antall) {
        console.log(`📥 Kafka: ${meldinger.length} melding(er) på ${topic}`);
        return meldinger;
      }
    } catch (feil) {
      // Topicet kan mangle til første melding er produsert
      sisteFeil = feil;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `Fikk ${meldinger.length} av ${antall} forventede meldinger på ${topic} innen ${timeoutMs} ms` +
      (sisteFeil ? ` (siste feil: ${sisteFeil})` : '')
  );
}
