import { MySQLConnection } from '../connection/mysql';
import { PostgreSQLConnection } from '../connection/postgresql';

export type TDBConnection = MySQLConnection | PostgreSQLConnection;
export type TAvailableAdapters = 'mysql' | 'postgresql';
export type TValidMigration = 'drop' | 'alter';
