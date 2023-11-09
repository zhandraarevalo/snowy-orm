import {
  Table,
  MySQLConnection,
  MySQL as MySQLClass,
  StoredTables as StoredTablesClass,
} from './classes';
import { IRecordTables } from '@utils/interfaces';

const MySQL = new MySQLClass();
const StoredTables = new StoredTablesClass();

class MySQLTableManager {
  private conn: MySQLConnection;
  private database: string;

  constructor(conn: MySQLConnection, database: string) {
    this.conn = conn;
    this.database = database;
    return this;
  }

  private async drop(recordTables: IRecordTables) {
    const tableNames = await StoredTables.getNames(this.conn, this.database);
    const existingTables = await StoredTables.getTables(this.conn, tableNames);
    const dropSortedTables = StoredTables.sortDesc(existingTables);
    
    for (const table of dropSortedTables) {
      await table.drop(this.conn);
    }

    const tables: Table[] = [];
    for (const name in recordTables) {
      const record = recordTables[name];
      tables.push(new Table(record.name, record.columns));
    }
    console.log(tables);

    const createSortedTables = StoredTables.sortAsc(tables);
    for (const table of createSortedTables) {
      await table.create(this.conn);
    }
  }

  private async alter() {

  }

  async run(migration: 'drop' | 'alter', recordTables: IRecordTables) {
    if (migration === 'drop') {
      await this.drop(recordTables);
    } else {
      await this.alter();
    }
  }
}

export {
  MySQL,
  MySQLConnection,
  MySQLTableManager,
}
