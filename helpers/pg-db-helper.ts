import { Client } from 'pg';

/**
 * Database helper for PostgreSQL databases (faktureringskomponenten, trygdeavgift-beregning, etc.)
 *
 * Usage:
 *   const db = new PgDatabaseHelper('faktureringskomponenten');
 *   await db.connect();
 *   const result = await db.query('SELECT * FROM faktura WHERE id = $1', [123]);
 *   await db.close();
 *
 * Or with the convenience function:
 *   await withPgDatabase('faktureringskomponenten', async (db) => {
 *     const result = await db.queryOne('SELECT * FROM faktura WHERE id = $1', [123]);
 *   });
 */
export class PgDatabaseHelper {
  private client: Client | null = null;
  private readonly schema: string;

  constructor(schema: string) {
    this.schema = schema;
  }

  async connect() {
    if (this.client) {
      return;
    }

    try {
      this.client = new Client({
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432'),
        database: process.env.PG_DATABASE || 'postgres',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || 'mysecretpassword',
      });

      await this.client.connect();
      await this.client.query(`SET search_path TO "${this.schema}"`);

      console.log(`✅ Connected to PostgreSQL (schema: ${this.schema})`);
    } catch (error) {
      console.error(`❌ Failed to connect to PostgreSQL (schema: ${this.schema}):`, error);
      throw error;
    }
  }

  async query<T = any>(sql: string, params: any[] = [], suppressErrors = false): Promise<T[]> {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }

    try {
      const result = await this.client.query(sql, params);
      return result.rows as T[];
    } catch (error) {
      if (!suppressErrors) {
        console.error('❌ Query failed:', error);
      }
      throw error;
    }
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  async execute(sql: string, params: any[] = [], suppressErrors = false): Promise<number> {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }

    try {
      const result = await this.client.query(sql, params);
      return result.rowCount ?? 0;
    } catch (error) {
      if (!suppressErrors) {
        console.error('❌ Execute failed:', error);
      }
      throw error;
    }
  }

  /**
   * Clean all data tables in the schema.
   * Skips Flyway migration history table.
   */
  async cleanDatabase(silent = false): Promise<{ cleanedCount: number; totalRowsDeleted: number }> {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }

    if (!silent) {
      console.log(`\n🧹 Starting PostgreSQL cleanup (schema: ${this.schema})...\n`);
    }

    try {
      const tables = await this.query<{ tablename: string }>(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = $1
        ORDER BY tablename
      `, [this.schema], true);

      if (!silent) {
        console.log(`Found ${tables.length} total tables\n`);
      }

      const tablesToClean: string[] = [];
      const skippedTables: string[] = [];

      for (const table of tables) {
        const tableName = table.tablename;

        if (tableName === 'flyway_schema_history') {
          skippedTables.push(tableName);
          continue;
        }

        tablesToClean.push(tableName);
      }

      if (!silent) {
        console.log(`📋 Tables to clean: ${tablesToClean.length}`);
        console.log(`⏭️  Tables to skip: ${skippedTables.length}\n`);
      }

      let cleanedCount = 0;
      let totalRowsDeleted = 0;

      // TRUNCATE all tables in one statement with CASCADE to handle FK constraints
      if (tablesToClean.length > 0) {
        const quotedTables = tablesToClean.map(t => `"${this.schema}"."${t}"`).join(', ');

        // Count rows before truncation
        for (const tableName of tablesToClean) {
          try {
            const countResult = await this.query<{ count: string }>(
              `SELECT COUNT(*) as count FROM "${this.schema}"."${tableName}"`, [], true
            );
            const rowCount = parseInt(countResult[0]?.count || '0');
            if (rowCount > 0) {
              cleanedCount++;
              totalRowsDeleted += rowCount;
              if (!silent) {
                console.log(`✅ Will clean ${tableName.padEnd(40)} (${rowCount} rows)`);
              }
            }
          } catch (error) {
            if (!silent) {
              console.log(`⚠️  Could not count ${tableName}: ${error.message || error}`);
            }
          }
        }

        await this.client.query(`TRUNCATE ${quotedTables} CASCADE`);
      }

      if (!silent) {
        console.log('\n' + '─'.repeat(60));
        console.log(`\n✨ PostgreSQL cleanup complete! (schema: ${this.schema})`);
        console.log(`   Tables cleaned: ${cleanedCount}`);
        console.log(`   Total rows deleted: ${totalRowsDeleted}\n`);
      }

      return { cleanedCount, totalRowsDeleted };
    } catch (error) {
      if (!silent) {
        console.error(`❌ PostgreSQL cleanup failed (schema: ${this.schema}):`, error);
      }
      throw error;
    }
  }

  async showAllData(): Promise<void> {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }

    console.log(`\n🔍 Analyzing PostgreSQL contents (schema: ${this.schema})...\n`);

    const tables = await this.query<{ tablename: string }>(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = $1
      ORDER BY tablename
    `, [this.schema], true);

    console.log(`Found ${tables.length} total tables\n`);

    const tablesWithData: { name: string; count: number }[] = [];

    for (const table of tables) {
      const tableName = table.tablename;
      try {
        const countResult = await this.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM "${this.schema}"."${tableName}"`, [], true
        );
        const count = parseInt(countResult[0]?.count || '0');
        if (count > 0) {
          tablesWithData.push({ name: tableName, count });
        }
      } catch (error) {
        console.log(`⚠️  Could not query ${tableName}: ${error.message || error}`);
      }
    }

    console.log(`\n📊 Tables with data (${tablesWithData.length} tables):\n`);
    console.log('─'.repeat(60));

    for (const table of tablesWithData) {
      console.log(`📋 ${table.name.padEnd(40)} ${String(table.count).padStart(6)} rows`);

      try {
        const sample = await this.query(
          `SELECT * FROM "${this.schema}"."${table.name}" LIMIT 1`, [], true
        );
        if (sample.length > 0) {
          const columns = Object.keys(sample[0]).slice(0, 5);
          console.log(`   Columns: ${columns.join(', ')}${columns.length < Object.keys(sample[0]).length ? ', ...' : ''}`);
        }
      } catch {
        // Ignore errors in sample query
      }
      console.log('');
    }

    console.log('─'.repeat(60));
    console.log(`\nTotal rows across all tables: ${tablesWithData.reduce((sum, t) => sum + t.count, 0)}\n`);
  }

  async close() {
    if (this.client) {
      try {
        await this.client.end();
        this.client = null;
        console.log(`✅ PostgreSQL connection closed (schema: ${this.schema})`);
      } catch (error) {
        console.error(`❌ Failed to close PostgreSQL connection:`, error);
        throw error;
      }
    }
  }
}

/**
 * Convenience function - creates connection, runs callback, closes connection.
 */
export async function withPgDatabase<T>(
  schema: string,
  callback: (db: PgDatabaseHelper) => Promise<T>
): Promise<T> {
  const db = new PgDatabaseHelper(schema);
  try {
    await db.connect();
    return await callback(db);
  } finally {
    await db.close();
  }
}

/**
 * Shorthand for faktureringskomponenten database.
 */
export async function withFaktureringDatabase<T>(
  callback: (db: PgDatabaseHelper) => Promise<T>
): Promise<T> {
  return withPgDatabase('faktureringskomponenten', callback);
}
