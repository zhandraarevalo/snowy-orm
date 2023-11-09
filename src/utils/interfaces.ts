export interface IColumn {
  type: string;
  required?: boolean;
  unique?: boolean;
  default?: string;
  primaryKey?: boolean;
  onUpdate?: string;
  foreignKey?: boolean;
  referenceTable?: string;
}

export interface IColumns {
  [key: string]: IColumn;
}

export interface IMySQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  timezone?: string;
}

export interface IObject {
  [key: string]: any;
}

export interface IPostgreSQLConfig {
  
}

export interface ITable {
  name: string;
  columns: IColumns;
}

export interface IRecordTables {
  [name: string]: ITable;
}
