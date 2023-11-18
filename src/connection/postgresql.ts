import { Client, QueryResult } from 'pg';
import { IDBConfig } from '../utils';

export class PostgreSQLConnection {
  private conn: Client | undefined;

  constructor(conn: Client) {
    this.conn = conn;
    return this;
  }

  async execute(query: string, bind?: any[]) {
    if (!this.conn) {
      throw new Error('Connection has been terminated');
    }
    await this.conn.query(query, bind);
  }

  async find(query: string, bind?: any[]) {
    if (!this.conn) {
      throw new Error('Connection has been terminated');
    }
    const response: QueryResult = await this.conn.query(query, bind);
    return response.rows;
  }

  async findOne(query: string, bind?: any[]) {
    if (!this.conn) {
      throw new Error('Connection has been terminated');
    }
    const response: QueryResult = await this.conn.query(query, bind);
    return response.rows.length > 0 ? response.rows[0] : null;
  }

  async end() {
    if (!this.conn) {
      throw new Error('Connection has been terminated');
    }
    await this.conn.end();
    this.conn = undefined;
  }
}

export class PostgreSQLManager {
  constructor() {
    return this;
  }

  async connect(config: IDBConfig) {
    const client = new Client(config);
    client.connect();
    return new PostgreSQLConnection(client);
  }
}
export const PostgreSQL = new PostgreSQLManager();
