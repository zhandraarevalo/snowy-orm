import mysql, { Connection } from 'mysql2/promise';
import { IDBConfig } from '../utils';

export class MySQLConnection {
  private conn: Connection | undefined;

  constructor(conn: Connection) {
    this.conn = conn;
    return this;
  }

  async execute(query: string) {
    if (!this.conn) {
      throw new Error('Connection has been terminated');
    }
    await this.conn.execute(query);
  }

  async find(query: string, bind?: any[]) {
    if (!this.conn) {
      throw new Error('Connection has been terminated');
    }
    const [rows]: any[][] = await this.conn.execute(query, bind);
    return rows;
  }

  async findOne(query: string, bind?: any[]) {
    if (!this.conn) {
      throw new Error('Connection has been terminated');
    }
    const [rows]: any[][] = await this.conn.execute(query, bind);

    if (rows.length > 1) {
      throw new Error('Search return more than one row');
    }
    return rows.length > 0 ? rows[0] : null;
  }

  async end() {
    if (!this.conn) {
      throw new Error('Connection has been terminated');
    }
    await this.conn.end();
    this.conn = undefined;
  }
}

class MySQLManager {
  constructor() {
    return this;
  }

  async connect(config: IDBConfig) {
    const conn: Connection = await mysql.createConnection(config);
    return new MySQLConnection(conn);
  }
}

export const MySQL = new MySQLManager();
