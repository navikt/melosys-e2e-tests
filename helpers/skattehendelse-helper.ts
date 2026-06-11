import { execSync } from 'node:child_process';

/**
 * Skattehendelse slik melosys-api sin SkattehendelserConsumer forventer den
 * (JSON-deserialisert via objectMapper).
 *
 * @see melosys-api/domain/.../avgift/aarsavregning/Skattehendelse.kt
 */
export interface Skattehendelse {
  /** Skatteåret hendelsen gjelder, f.eks. '2025' */
  gjelderPeriode: string;
  /** Fnr eller aktørId — api slår opp aktørId via PDL */
  identifikator: string;
  hendelsetype: string;
}

/**
 * Publish a skattehendelse directly to the Kafka topic melosys-api consumes
 * (teammelosys.skattehendelser.v1-local, local-mock profile).
 *
 * Uses kafka-console-producer inside the kafka container, so it works both
 * locally and on CI without adding a Kafka client dependency to the test repo.
 *
 * Requires the 'melosys.skattehendelse.consumer' toggle to be enabled
 * (default ON) for melosys-api to act on the event.
 *
 * @example
 * publishSkattehendelse({
 *   gjelderPeriode: String(FORRIGE_AAR),
 *   identifikator: USER_ID_VALID,
 *   hendelsetype: 'NY',
 * });
 */
export function publishSkattehendelse(hendelse: Skattehendelse): void {
  const json = JSON.stringify(hendelse);
  console.log(`📨 Publishing skattehendelse to Kafka: ${json}`);
  execSync(
    'docker exec -i kafka kafka-console-producer' +
      ' --bootstrap-server kafka.melosys.docker-internal:9092' +
      ' --topic teammelosys.skattehendelser.v1-local',
    { input: `${json}\n`, encoding: 'utf-8' }
  );
  console.log('✅ Skattehendelse published');
}
