import { IMySQLConfig, IPostgreSQLConfig } from '@utils/interfaces';
import { MySQL, MySQLConnection, MySQLTableManager } from './mysql';

class TableManagerClass {
  constructor() {
    return this;
  }

  async set(manager: string, config: IMySQLConfig) {
    if (manager === 'mysql') {
      const conn = await MySQL.connect(config as IMySQLConfig);
      return new MySQLTableManager(conn, config.database);
    }

    if (manager === 'postgresql') {
      // unavailable
    }

    const conn = await MySQL.connect(config as IMySQLConfig);
    return new MySQLTableManager(conn, config.database);
  }
}

const TableManager = new TableManagerClass();

export {
  TableManager,
  MySQL,
  MySQLConnection,
}
