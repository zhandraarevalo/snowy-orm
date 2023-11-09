import { toCamelCase, toSnakeCase } from 'js-convert-case';
import mysql, { Connection } from 'mysql2/promise';
import { v4 as uuid } from 'uuid';
import { IColumn, IColumns, IMySQLConfig } from './../../utils/interfaces';
import { DEFAULT_ATTRIBUTES } from './constants';

const textTypes = ['char', 'varchar', 'text'];

export class MySQLConnection {
  private conn: Connection | null;

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

  async find(query: string, bind?: any[]): Promise<Array<any>> {
    if (!this.conn) {
      throw new Error('Connection has been terminated');
    }
    const [rows]: any[][] = await this.conn.execute(query);
    return rows;
  }

  async findOne(query: string, bind?: any[]): Promise<any> {
    if (!this.conn) {
      throw new Error('Connection has been terminated');
    }
    const [rows]: any[][] = await this.conn.execute(query);
    return (rows && rows.length > 0) ? rows[0] : null;
  }

  async end() {
    if (!this.conn) {
      throw new Error('Connection has been terminated');
    }
    await this.conn.end();
  }
}

export class MySQL {
  constructor() {
    return this;
  }

  async connect(config: IMySQLConfig) {
    const conn: Connection = await mysql.createConnection(config);
    return new MySQLConnection(conn);
  }
}

class Column {
  [key: string]: any;
  private type: string;
  private required: boolean;
  private unique: boolean;
  private default?: string;
  private primaryKey: boolean;
  private onUpdate?: string;
  private foreignKey: boolean;
  private referenceTable?: string;

  constructor(column: IColumn) {
    this.id = uuid();
    this.type = column.type;
    this.required = column.required || false;
    this.unique = column.unique || false;
    this.default = column.default;
    this.primaryKey = column.primaryKey || false;
    this.onUpdate = column.onUpdate;
    this.foreignKey = column.foreignKey || false;
    this.referenceTable = column.referenceTable;
    return this;
  }

  get getReferenceTable() {
    return this.referenceTable;
  }

  define(name: string) {
    let column = `${toSnakeCase(name)} ${this.type}`;
    column += this.unique ? ' unique' : '';
    column += this.required ? ' not null' : '';
    
    if (this.default) {
      if (textTypes.some((value: string) => this.type.includes(value))) {
        column += ` default '${this.default}'`;
      } else {
        column += ` default ${this.default}`;
      }
    }

    column += this.onUpdate ? ` on update ${this.onUpdate}` : '';
    column += this.primaryKey ? ' primary key' : '';
    return column;
  }

  isForeignKey() {
    if (this.foreignKey && this.referenceTable) {
      return true;
    }
    return false;
  }

  // wasModified(existing: IColumn) {
  //   for (const key in existing) {
  //     if (this[key] !== existing[key]) {
  //       return true;
  //     }
  //   }

  //   return false;
  // }

}

class TableColumns {
  [key: string]: Column;

  constructor(columns: IColumns) {
    for (const key in columns) {
      this[key] = new Column(columns[key]);
    }
    return this;
  }
}

class Constraint {
  private tableName: string;
  private columnName: string;
  private referenceTable: string;

  constructor(tableName: string, columnName: string, referenceTable: string) {
    this.tableName = tableName;
    this.columnName = columnName;
    this.referenceTable = referenceTable;
  }

  define() {
    return `constraint fk_${this.tableName}_${this.columnName} foreign key(${this.columnName}) references ${this.referenceTable}(id)`;
  }
}

class TableConstraints {
  [key: string]: Constraint;

  constructor(tableName: string, columns: TableColumns) {
    for (const key in columns) {
      if (columns[key].isForeignKey()) {
        this[key] = new Constraint(tableName, key, columns[key].getReferenceTable as string);
      }
    }
    return this;
  }
}

export class Table {
  private name: string;
  private columns: TableColumns;
  private constraints?: TableConstraints;

  constructor(name: string, columns: IColumns) {
    this.name = name;
    this.columns = new TableColumns(Object.assign({}, DEFAULT_ATTRIBUTES, columns));
    if (this.hasForeignKey()) {
      this.constraints = new TableConstraints(name, this.columns);
    }
    return this;
  }

  get getName() {
    return this.name;
  }

  hasForeignKey() {
    for (const name in this.columns) {
      if (this.columns[name].isForeignKey()) {
        return true;
      }
    }
    return false;
  }

  getForeignKeys() {
    const foreignKeys: Column[] = [];
    for (const name in this.columns) {
      if (this.columns[name].isForeignKey()) {
        foreignKeys.push(this.columns[name]);
      }
    }
    return foreignKeys;
  }

  async create(conn: MySQLConnection) {
    const columns = [];
    const constraints = [];
    for (const name in this.columns) {
      columns.push(this.columns[name].define(name));

      if (this.columns[name].isForeignKey() && this.constraints && this.constraints[name]) {
        constraints.push(this.constraints[name].define());
      }
    }
    const attributes = [...columns, ...constraints];

    const query = `create table if not exists \`${this.name}\`(${attributes.join(', ')});`;
    await conn.execute(query);
  }

  async get() {

  }

  async alter() {

  }
  
  async drop(conn: MySQLConnection) {
    await conn.execute(`truncate table \`${this.name}\`;`);
    await conn.execute(`drop table \`${this.name}\`;`);
  }

}

export class StoredTables {
  constructor() {
    return this;
  }

  async getNames(conn: MySQLConnection, database: string) {
    const query = `
      select table_name as tableName
      from information_schema.tables
      where table_schema = '${database}';
    `;
    return await conn.find(query);
  }

  async getTable(conn: MySQLConnection, name: string) {
    let columnsQuery = `select c.column_name as name, c.column_type as type, c.is_nullable as nullable,`;
    columnsQuery += ` c.column_default as defaultValue, c.extra as extra,`;
    columnsQuery += ` k.constraint_name as constraintType, k.referenced_table_name as referenceTable`;
    columnsQuery += ` from information_schema.columns c`;
    columnsQuery += ` left join information_schema.key_column_usage k`;
    columnsQuery += ` on k.table_name = c.table_name and k.column_name = c.column_name`;
    columnsQuery += ` where c.table_name = '${name}'`;

    const existingColumns = await conn.find(columnsQuery);
    const columns: IColumns = {};

    for (const column of existingColumns) {
      columns[toCamelCase(column.name)] = {
        type: column.type,
        required: column.nullable === 'NO',
        default: column.defaultValue ? column.defaultValue.toLowerCase() : undefined,
        primaryKey: column.constraintType === 'PRIMARY',
        onUpdate: column.extra !== '' && column.extra.split('on update').length > 1 ? column.extra.split(' on update ')[1].toLowerCase() : undefined,
        foreignKey: column.constraintType !== null && column.constraintType.includes('fk_'),
        referenceTable: column.referenceTable || undefined,
      }
    }

    return new Table(name, columns);
  }

  async getTables(conn: MySQLConnection, tableNames: any[]) {
    const tables: Table[] = [];
    for (const item of tableNames) {
      const table = await this.getTable(conn, item.tableName);
      tables.push(table);
    }
    return tables;
  }

  sortAsc(tables: Table[]) {
    const sortedTables: Table[] = [];

    for (const [i, table] of tables.entries()) {
      if (!table.hasForeignKey()) {
        sortedTables.push(table);
        tables.splice(i, 1);
      }
    }

    while (tables.length > 0) {
      for (const [i, table] of tables.entries()) {
        const keys = table.getForeignKeys();
  
        let canBeDropped = true;
        for (const key of keys) {
          const found = sortedTables.find((table: Table) => table.getName === key.getReferenceTable);
          canBeDropped = !found ? false : canBeDropped;
        }

        if (canBeDropped) {
          sortedTables.push(table);
          tables.splice(i, 1);
        }
      }
    }

    return sortedTables;
  }

  sortDesc(tables: Table[]) {
    const sorted = this.sortAsc(tables);
    return sorted.reverse();
  }

}
