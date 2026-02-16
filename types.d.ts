declare module 'oracledb' {
  namespace oracledb {
    interface Connection {
      execute(sql: string, binds?: any, options?: any): Promise<any>;
      close(): Promise<void>;
    }
  }

  interface OracleDB {
    getConnection(config: {
      user: string;
      password: string;
      connectString: string;
    }): Promise<oracledb.Connection>;
    OUT_FORMAT_OBJECT: number;
  }

  const oracledb: OracleDB;
  export default oracledb;
}
