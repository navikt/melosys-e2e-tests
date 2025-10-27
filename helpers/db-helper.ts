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
        password: process.env.DB_PASSWORD || 'melosys',
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
   */
  async query<T = any>(sql: string, binds: any = {}): Promise<T[]> {
    if (!this.connection) {
      throw new Error('Database not connected. Call connect() first.');
    }

    try {
      const result = await this.connection.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      
      return (result.rows || []) as T[];
    } catch (error) {
      console.error('❌ Query failed:', error);
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
