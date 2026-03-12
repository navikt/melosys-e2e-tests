import oracledb from 'oracledb';

/**
 * Database helper for verifying data in Oracle database
 * 
 * Usage:
 *   const db = new DatabaseHelper();
 *   await db.connect();
 *   const result = await db.query('SELECT * FROM BEHANDLING WHERE id = :id', { id: 123 });
 *   await db.close();
 */
export class DatabaseHelper {
  private connection: oracledb.Connection | null = null;

  /**
   * Connect to Oracle database running in Docker Compose
   */
  async connect() {
    if (this.connection) {
      return;
    }

    try {
      this.connection = await oracledb.getConnection({
        user: process.env.DB_USER || 'MELOSYS',
        password: process.env.DB_PASSWORD || 'melosyspwd',
        connectString: process.env.DB_CONNECT_STRING || 'localhost:1521/freepdb1'
      });
      
      console.log('✅ Connected to Oracle database');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  /**
   * Execute a query
   * @param suppressErrors - If true, don't log errors to console (useful when probing for table existence)
   */
  async query<T = any>(sql: string, binds: any = {}, suppressErrors = false): Promise<T[]> {
    if (!this.connection) {
      throw new Error('Database not connected. Call connect() first.');
    }

    try {
      const result = await this.connection.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });

      return (result.rows || []) as T[];
    } catch (error) {
      if (!suppressErrors) {
        console.error('❌ Query failed:', error);
      }
      throw error;
    }
  }

  /**
   * Execute a single query and return first row
   */
  async queryOne<T = any>(sql: string, binds: any = {}): Promise<T | null> {
    const results = await this.query<T>(sql, binds);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Clean all data tables except lookup tables and PROSESS_STEG
   * Excludes: tables ending with _TYPE, _TEMA, _STATUS, and PROSESS_STEG
   * @param silent - If true, suppress console output
   */
  async cleanDatabase(silent = false): Promise<{ cleanedCount: number; totalRowsDeleted: number }> {
    if (!this.connection) {
      throw new Error('Database not connected. Call connect() first.');
    }

    if (!silent) {
      console.log('\n🧹 Starting database cleanup...\n');
    }

    try {
      // Get all tables
      const tables = await this.query<{TABLE_NAME: string}>(`
        SELECT table_name
        FROM user_tables
        ORDER BY table_name
      `, {}, true);

      if (!silent) {
        console.log(`Found ${tables.length} total tables\n`);
      }

      const tablesToClean: string[] = [];
      const skippedTables: string[] = [];

      // Filter tables to clean
      for (const table of tables) {
        const tableName = table.TABLE_NAME;

        // Skip lookup/reference tables that should never be cleaned
        // These tables contain static reference data needed by the application
        const lookupTables = [
          'PROSESS_STEG',                  // Process step definitions
          'BEHANDLINGSMAATE',              // Treatment methods (referenced by FK_BEHANDLINGSMAATE)
          'PREFERANSE',                    // Preferences/settings
          'SAKSOPPLYSNING_KILDESYSTEM',    // Source system definitions
          'UTENLANDSK_MYNDIGHET',          // Foreign authority reference data
          'UTENLANDSK_MYNDIGHET_PREF',     // Foreign authority preferences
          'flyway_schema_history'          // Database migration history
        ];

        if (tableName.endsWith('_TYPE') ||
            tableName.endsWith('_TEMA') ||
            tableName.endsWith('_STATUS') ||
            lookupTables.includes(tableName)) {
          skippedTables.push(tableName);
          continue;
        }

        tablesToClean.push(tableName);
      }

      if (!silent) {
        console.log(`📋 Tables to clean: ${tablesToClean.length}`);
        console.log(`⏭️  Tables to skip: ${skippedTables.length} (lookup/reference tables)\n`);
      }

      // Disable foreign key constraints temporarily
      await this.connection.execute('BEGIN\n' +
        '  FOR c IN (SELECT constraint_name, table_name FROM user_constraints WHERE constraint_type = \'R\') LOOP\n' +
        '    EXECUTE IMMEDIATE \'ALTER TABLE \' || c.table_name || \' DISABLE CONSTRAINT \' || c.constraint_name;\n' +
        '  END LOOP;\n' +
        'END;');

      if (!silent) {
        console.log('🔓 Disabled foreign key constraints\n');
      }

      let cleanedCount = 0;
      let totalRowsDeleted = 0;

      // Truncate data from each table (faster than DELETE and resets sequences)
      for (const tableName of tablesToClean) {
        try {
          // Count rows before truncation
          const countResult = await this.query(`SELECT COUNT(*) as cnt FROM ${tableName}`, {}, true);
          const rowCount = countResult[0]?.CNT || 0;

          if (rowCount > 0) {
            // TRUNCATE is faster than DELETE and resets auto-increment sequences
            await this.connection.execute(`TRUNCATE TABLE ${tableName}`);
            if (!silent) {
              console.log(`✅ Cleaned ${tableName.padEnd(40)} (${rowCount} rows truncated)`);
            }
            cleanedCount++;
            totalRowsDeleted += rowCount;
          }
        } catch (error) {
          if (!silent) {
            console.log(`⚠️  Could not clean ${tableName}: ${(error as Error).message || error}`);
          }
        }
      }

      // Re-enable foreign key constraints
      await this.connection.execute('BEGIN\n' +
        '  FOR c IN (SELECT constraint_name, table_name FROM user_constraints WHERE constraint_type = \'R\') LOOP\n' +
        '    EXECUTE IMMEDIATE \'ALTER TABLE \' || c.table_name || \' ENABLE CONSTRAINT \' || c.constraint_name;\n' +
        '  END LOOP;\n' +
        'END;');

      if (!silent) {
        console.log('\n🔒 Re-enabled foreign key constraints');

        console.log('\n' + '─'.repeat(60));
        console.log(`\n✨ Database cleanup complete!`);
        console.log(`   Tables cleaned: ${cleanedCount}`);
        console.log(`   Total rows deleted: ${totalRowsDeleted}\n`);
      }

      return { cleanedCount, totalRowsDeleted };

    } catch (error) {
      if (!silent) {
        console.error('❌ Database cleanup failed:', error);
      }
      throw error;
    }
  }

  /**
   * Show all database tables with their data
   * Useful for debugging - shows what data exists in the database
   * @param skipLookupTables - If true, skip tables ending with _TYPE, _TEMA, _STATUS (default: true)
   */
  async showAllData(skipLookupTables = true): Promise<void> {
    if (!this.connection) {
      throw new Error('Database not connected. Call connect() first.');
    }

    console.log('\n🔍 Analyzing database contents...\n');

    // Get all tables
    const tables = await this.query<{TABLE_NAME: string}>(`
      SELECT table_name
      FROM user_tables
      ORDER BY table_name
    `, {}, true);

    console.log(`Found ${tables.length} total tables\n`);

    // Filter out lookup tables and check which have data
    const tablesWithData: {name: string, count: number}[] = [];

    for (const table of tables) {
      const tableName = table.TABLE_NAME;

      // Skip lookup tables if requested
      if (skipLookupTables &&
          (tableName.endsWith('_TYPE') ||
           tableName.endsWith('_TEMA') ||
           tableName.endsWith('_STATUS'))) {
        continue;
      }

      // Count rows in table
      try {
        const countResult = await this.query(`SELECT COUNT(*) as cnt FROM ${tableName}`, {}, true);
        const count = countResult[0]?.CNT || 0;

        if (count > 0) {
          tablesWithData.push({ name: tableName, count: count });
        }
      } catch (error) {
        console.log(`⚠️  Could not query ${tableName}: ${(error as Error).message || error}`);
      }
    }

    // Display results
    console.log(`\n📊 Tables with data (${tablesWithData.length} tables):\n`);
    console.log('─'.repeat(60));

    for (const table of tablesWithData) {
      console.log(`📋 ${table.name.padEnd(40)} ${String(table.count).padStart(6)} rows`);

      // Show sample data from the table
      try {
        const sample = await this.query(`SELECT * FROM ${table.name} WHERE ROWNUM <= 1`, {}, true);
        if (sample.length > 0) {
          const columns = Object.keys(sample[0]).slice(0, 5); // First 5 columns
          console.log(`   Columns: ${columns.join(', ')}${columns.length < Object.keys(sample[0]).length ? ', ...' : ''}`);
        }
      } catch (error) {
        // Ignore errors in sample query
      }
      console.log('');
    }

    console.log('─'.repeat(60));
    console.log(`\nTotal rows across all tables: ${tablesWithData.reduce((sum, t) => sum + t.count, 0)}\n`);
  }

  /**
   * Close the database connection
   */
  async close() {
    if (this.connection) {
      try {
        await this.connection.close();
        this.connection = null;
        console.log('✅ Database connection closed');
      } catch (error) {
        console.error('❌ Failed to close database:', error);
        throw error;
      }
    }
  }
}

/**
 * Helper function to create a database fixture for tests
 */
export async function withDatabase<T>(
  callback: (db: DatabaseHelper) => Promise<T>
): Promise<T> {
  const db = new DatabaseHelper();
  try {
    await db.connect();
    return await callback(db);
  } finally {
    await db.close();
  }
}
