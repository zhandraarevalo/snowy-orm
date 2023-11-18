import { IDBConfig, TAvailableAdapters } from '../utils';
import { MySQL } from './mysql';
import { PostgreSQL } from './postgresql';

class SnowyConnectionClass {
  constructor() {
    return this;
  }

  async get(adapter: TAvailableAdapters, config: IDBConfig) {
    if (adapter === 'mysql') {
      return await MySQL.connect(config);
    } else if (adapter === 'postgresql') {
      return await PostgreSQL.connect(config);
    }

    throw new Error('Invalid DB Manager');
  }
}
export const SnowyConnection = new SnowyConnectionClass();
