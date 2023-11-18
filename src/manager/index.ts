import fs from 'fs';
import path from 'path';
import { Table, RecordTables, StoredTables } from './classes';
import { TDBConnection, TValidMigration } from '../utils';

export class TableManager {
  private conn: TDBConnection;

  constructor(conn: TDBConnection) {
    this.conn = conn;
    return this;
  }

  private async drop() {
    const storedTables = await (new StoredTables(this.conn)).get();
    const recordTables = await (new RecordTables()).get();

    const dropTables = storedTables.sortDesc();
    const createTables = recordTables.sortAsc();
    
    for (const table of dropTables) {
      await table.drop(this.conn);
    }
    
    for (const table of createTables) {
      await table.create(this.conn);
    }
  }

  private async alter() {
    const storedTables = await (new StoredTables(this.conn)).get();
    const recordTables = await (new RecordTables()).get();

    const descStoredTables = storedTables.sortDesc();
    const ascRecordTables = recordTables.sortAsc();

    const alterTables = [];
    const dropTables = [];

    for (const existing of descStoredTables) {
      const found = ascRecordTables.find((table: Table) => table.name === existing.name);

      if (found) {
        alterTables.push(found.alter(this.conn, existing));
      } else {
        dropTables.push(existing.drop(this.conn));
      }
    }

    for (const record of ascRecordTables) {
      const found = descStoredTables.find((table: Table) => table.name === record.name);
      if (!found) {
        await record.create(this.conn);
      }
    }

    await Promise.all(alterTables);
    await Promise.all(dropTables);
  }

  async run() {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'snowy.json')).toString());
    const migration: TValidMigration = config.orm.migration; 
    if (migration === 'drop') {
      await this.drop();
    } else if (migration === 'alter') {
      await this.alter();
    } else {
      throw new Error('Invalid migration');
    }
  }
}

export { Model } from './classes';
