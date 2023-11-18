import joi from 'joi';
import fs from 'fs';
import path from 'path';
import {
  toCamelCase,
  toPascalCase,
  toSnakeCase,
} from 'js-convert-case';
import {
  v4 as uuid,
} from 'uuid';
import {
  DEFAULT_ATTRIBUTES,
  DEFAULT_ATTRIBUTES_NAMES,
  TEXT_TYPES,
  VALID_OPS,
  IColumn,
  IColumns,
  IConstraint,
  IModelFind,
  IModelFindOne,
  IModelInsert,
  IModelPopulate,
  IModelUpdate,
  IObject,
  ITable,
  ITables,
  TDBConnection,
  toCamelKeys,
  validateObj,
} from '../utils';

class Column {
  [key: string]: any;
  type: string;
  required: boolean;
  unique: boolean;
  default?: string;
  primaryKey: boolean;
  onUpdate?: string;
  foreignKey: boolean;
  referenceTable?: string;

  constructor(column: IColumn) {
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

  define(name: string) {
    let column = `${toSnakeCase(name)} ${this.type}`;
    column += this.unique ? ' unique' : '';
    column += this.required ? ' not null' : '';
    
    if (this.default) {
      if (TEXT_TYPES.some((value: string) => this.type.includes(value))) {
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

  wasModified(existing: Column) {
    for (const key in existing) {
      if (this[key] !== existing[key]) {
        return true;
      }
    }

    return false;
  }

  getAlterations(tableName: string, name: string, existing: Column) {
    const alterations = [];
    if (existing.isForeignKey() && !this.isForeignKey()) {
      alterations.push(`drop constraint fk_${tableName}_${name}`);
    }

    if (!this.default && existing.default) {
      alterations.push(`alter column ${name} drop default`);
    } else {
      alterations.push(`modify column ${this.define(name)}`);
    }

    if (this.isForeignKey() && !existing.isForeignKey()) {
      const newConstraint = new Constraint({ tableName, columnName: name, referenceTable: this.referenceTable as string });
      alterations.push(`add ${newConstraint.define()}`);
    }

    return alterations;
  }

}

class TableColumns {
  [name: string]: Column;

  constructor(columns: IColumns) {
    for (const name in columns) {
      this[name] = new Column(columns[name]);
    }
    return this;
  }
}

class Constraint {
  tableName: string;
  columnName: string;
  referenceTable: string;

  constructor(constraint: IConstraint) {
    this.tableName = constraint.tableName;
    this.columnName = constraint.columnName;
    this.referenceTable = constraint.referenceTable;
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
        this[key] = new Constraint({
          tableName,
          columnName: key,
          referenceTable: columns[key].referenceTable as string,
        });
      }
    }
    return this;
  }
}

export class Table {
  name: string;
  columns: TableColumns;
  constraints?: TableConstraints;

  constructor(name: string, columns: IColumns) {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'snowy.json')).toString());
    this.name = name;
    this.columns = new TableColumns(Object.assign({}, DEFAULT_ATTRIBUTES[config.orm.adapter], columns));
    if (this.hasForeignKey()) {
      this.constraints = new TableConstraints(name, this.columns);
    }
    return this;
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

  async create(conn: TDBConnection) {
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
    await this.exportModel();

    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'snowy.json')).toString());
    const modelName = toPascalCase(this.name);
    fs.appendFileSync(
      path.join(process.cwd(), config.orm.modelsPath, 'index.ts'),
      `export { ${modelName} } from './${modelName}';\n`
    );
  }

  async alter(conn: TDBConnection, existing: Table) {
    const alterations = [];
    for (const name in this.columns) {
      if (existing.columns[name]) {
        if (this.columns[name].wasModified(existing.columns[name])) {
          const modifiedColumn = this.columns[name].getAlterations(this.name, name, existing.columns[name]);
          alterations.push(...modifiedColumn);
        }
      } else {
        alterations.push(`add column ${this.columns[name].define(name)}`);
        if (this.columns[name].isForeignKey() && this.constraints && this.constraints[name]) {
          alterations.push(`add constraint ${this.constraints[name].define()}`);
        }
      }
    }

    for (const name in existing.columns) {
      if (!this.columns[name]) {
        if (existing.columns[name].isForeignKey() && existing.constraints && existing.constraints[name]) {
          alterations.push(`drop constraint fk_${this.name}_${name}`);
        }
        alterations.push(`drop column ${toSnakeCase(name)}`);
      }
    }

    if (alterations.length > 0) {
      await this.deleteModel();
      await conn.execute(`alter table ${this.name} ${alterations.join(', ')};`);
      await this.exportModel();
    }
  }
  
  async drop(conn: TDBConnection) {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'snowy.json')).toString());
    const modelsIndexPath = path.join(process.cwd(), config.orm.modelsPath, 'index.ts');
    try {
      fs.unlinkSync(modelsIndexPath);
    } catch {}
 
    await this.deleteModel();
    await conn.execute(`truncate table \`${this.name}\`;`);
    await conn.execute(`drop table \`${this.name}\`;`);
  }

  private async exportModel() {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'snowy.json')).toString());
    const modelName = toPascalCase(this.name);
    const modelPath = path.join(process.cwd(), config.orm.modelsPath, modelName+'.ts');

    let modelData = `import joi from 'joi';\n`;
    modelData += `import { Model, TDBConnection } from 'snowy-orm';\n`;
    modelData += `import * as table from '@tables/${this.name}'; // define tables path in the tsconfig.json or change the route to match your tables folder\n\n`;
    modelData += `class ${modelName}Model extends Model {\n\n`;
    modelData += `  constructor() {\n`;
    modelData += `    super(table.default);\n`;
    modelData += `    return this;\n`;
    modelData += `  }\n\n`;
    modelData += `  async create(conn: TDBConnection, data: any) {\n`;
    modelData += `    const schema = joi.object().keys({\n`;
    let updateSchema = `    const schema = joi.object().keys({\n`; 

    for (const name in this.columns) {
      if (!DEFAULT_ATTRIBUTES_NAMES.includes(name)) {
        let key = `${name}: joi`;
        if (this.columns[name].type === 'int') {
          key += '.number().integer()';
        } else if (this.columns[name].type === 'float') {
          key += '.number()';
        } else if (this.columns[name].type.includes('date')) {
          key += '.date()';
        } else if (this.columns[name].type === 'tinyint' || this.columns[name].type === 'boolean') {
          key += '.boolean()';
        } else {
          key += '.string()';
        }
        updateSchema += `      ${key},\n`;

        if (this.columns[name].required) {
          key += '.required()';
        }
        
        modelData += `      ${key},\n`;
      }
    }
    
    updateSchema += `    }).unknown(false);\n`;
    modelData += `    }).unknown(false);\n`;
    modelData += `    return await super.create(conn, { schema, ...data });\n`;
    modelData += `  }\n\n`;
    modelData += `  update(conn: TDBConnection, id: string) {\n`;
    modelData += updateSchema;
    modelData += `    return {\n`;
    modelData += `      set: async (obj: any) => {\n`;
    modelData += `        return await super.update(conn, id).set({ schema, obj });\n`;
    modelData += `      }\n`;
    modelData += `    }\n`;
    modelData += `  }\n\n`;
    modelData += `}\n`;
    modelData += `export const ${modelName} = new ${modelName}Model();\n`;

    fs.writeFileSync(modelPath, modelData);
  }

  private async deleteModel() {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'snowy.json')).toString());
    const modelName = toPascalCase(this.name);
    const modelPath = path.join(process.cwd(), config.orm.modelsPath, modelName+'.ts');
    try {
      fs.unlinkSync(modelPath);
    } catch {}
  }

}

export class TableList {
  private list: Table[] = [];

  constructor(tables: ITables | Table[]) {
    if (Array.isArray(tables)) {
      this.list = tables;
    } else {
      for (const name in tables) {
        this.list.push(new Table(tables[name].name, tables[name].columns));
      }
    }
    return this;
  }

  sortAsc() {
    const tables = this.list;
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
          const found = sortedTables.find((table: Table) => table.name === key.referenceTable);
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

  sortDesc() {
    const sorted = this.sortAsc();
    return sorted.reverse();
  }

}

export class StoredTables {
  private conn: TDBConnection;

  constructor(conn: TDBConnection) {
    this.conn = conn;
    return this;
  }

  async get() {
    const tableNames = await this.getNames();
    const tables = await this.getTables(tableNames);
    return new TableList(tables);
  }

  private async getNames() {
    const query = `
      select table_name as tableName
      from information_schema.tables
      where table_schema = '${process.env.DB_SCHEMA}';
    `;
    return await this.conn.find(query);
  }

  async getTable(name: string) {
    let columnsQuery = `select c.column_name as name, c.column_type as type, c.is_nullable as nullable,`;
    columnsQuery += ` c.column_key as c_key, c.column_default as defaultValue, c.extra as extra,`;
    columnsQuery += ` k.constraint_name as constraintType, k.referenced_table_name as referenceTable`;
    columnsQuery += ` from information_schema.columns c`;
    columnsQuery += ` left join information_schema.key_column_usage k`;
    columnsQuery += ` on k.table_name = c.table_name and k.column_name = c.column_name`;
    columnsQuery += ` where c.table_name = '${name}'`;

    const existingColumns = await this.conn.find(columnsQuery);
    const columns: IColumns = {};

    for (const column of existingColumns) {
      columns[toCamelCase(column.name)] = {
        type: column.type,
        required: column.nullable === 'NO',
        unique: column.c_key === 'UNI',
        default: column.defaultValue ? column.defaultValue.toLowerCase() : undefined,
        primaryKey: column.constraintType === 'PRIMARY',
        onUpdate: column.extra !== '' && column.extra.split('on update').length > 1 ? column.extra.split(' on update ')[1].toLowerCase() : undefined,
        foreignKey: column.constraintType !== null && column.constraintType.includes('fk_'),
        referenceTable: column.referenceTable || undefined,
      }
    }

    return new Table(name, columns);
  }

  private async getTables(tableNames: any[]) {
    const tables: Table[] = [];
    for (const item of tableNames) {
      const table = await this.getTable(item.tableName);
      tables.push(table);
    }
    return tables;
  }
}

export class RecordTables {

  constructor() {
    return this;
  }

  async transformContent(content: string) {
    let data = content.split('\n');
    let jsonContent = '';

    for (let item of data) {
      item = item.trim();
      const keysAndValues = item.split(':');
      if (keysAndValues.length > 1) {
        keysAndValues[0] = `"${keysAndValues[0]}"`;
        keysAndValues[1] = keysAndValues[1].split(`'`).join(`"`);
        item = keysAndValues.join(':');
      }
      jsonContent += item;
    }

    return JSON.parse(jsonContent);
  }

  async readFiles() {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'snowy.json')).toString());
    const tablesPath = path.join(process.cwd(), config.orm.tablesPath);
    const tablesFiles = fs.readdirSync(tablesPath);
    const recordTables: Table[] = [];
    for (const fileName of tablesFiles) {
      const fileContent = fs.readFileSync(path.join(tablesPath, fileName)).toString();
      const tableDetail: ITable = await this.transformContent(fileContent.replace('export default', ''));
      const table = new Table(tableDetail.name, tableDetail.columns);
      recordTables.push(table);
    }
    return recordTables;
    
  }

  async get() {
    const recordTables = await this.readFiles();
    return new TableList(recordTables);
  }
}

export class Model {
  private table: Table;

  constructor(table: ITable | Table) {
    if (table instanceof Table) {
      this.table = table;
    } else {
      this.table = new Table(table.name, table.columns);
    }
    return this;
  }

  private getConditionValue(key: string, value: any) {
    if (key === 'id' || this.table.columns[key].isForeignKey()) {
      return `uuid_to_bin('${value}')`;
    } else if (typeof value === 'string') {
      return `'${value}'`;
    } else if (value instanceof Date) {
      return `str_to_date("${value.toLocaleString()}", "%m/%d/%Y, %r")`;
    } else {
      return value;
    }
  }

  private getSearchConditions(where: IObject) {
    const conditions: string[] = [];
  
    for (const [key, value] of Object.entries(where)) {
  
      if (value.constructor === [].constructor) {
        throw new Error('Invalid data type');
      }
  
      if (value.constructor === ({}).constructor) {
        for (const op in value) {
          if (!VALID_OPS.includes(op)) {
            throw new Error('Invalid query operation');
          }
  
          conditions.push(`${toSnakeCase(key)} ${op} ${this.getConditionValue(key, value[op])}`);
        }
      } else {
        conditions.push(`${toSnakeCase(key)} = ${this.getConditionValue(key, value)}`);
      }
    }
  
    return conditions;
  }

  private async getPopulatedData(conn: TDBConnection, obj: any, populate: IModelPopulate[]) {
    const populated: any = {};

    for (const item of populate) {
      const { column, ...populateConditions } = item;
      if (this.table.columns[column] && this.table.constraints && this.table.constraints[column]) {
        const conditions = Object.assign({}, populateConditions, { where: { id: obj[column] } });
        const relatedTable = await (new StoredTables(conn)).getTable(this.table.constraints[column].referenceTable);
        const model = new Model(relatedTable);
        const populatedData = await model.findOne(conn, conditions);
        populated[`${column}`] = populatedData;
      } else {
        const relatedTable = await (new StoredTables(conn)).getTable(column);
        const model = new Model(relatedTable);
  
        let reverseRelation = false;
        for (const key in relatedTable.constraints) {
          reverseRelation = relatedTable.constraints[key].referenceTable === this.table.name ? true : reverseRelation;
        }
  
        if (reverseRelation) {
          const populatedData = await model.find(conn, populateConditions);
          populated[`${column}List`] = populatedData;
        } else {
          throw new Error('No relation found');
        }
      }
    }

    return populated;
  }

  private async getForeignKeyUUID(conn: TDBConnection, obj: any) {
    for (const key in obj) {
      if (this.table.columns[key] && obj[key].constructor !== ({}).constructor && this.table.columns[key].isForeignKey()) {
        const query = `select bin_to_uuid(${key}) as ${key} from ${this.table.name} where id = uuid_to_bin('${obj.id}')`;
        const result = await conn.findOne(query);
        obj[key] = result[key];
      }
    }
    return obj;
  }

  async create(conn: TDBConnection, data: IModelInsert) {
    const { obj, schema, fetch } = data;

    const validationResult = await validateObj(schema, obj);
    if (!validationResult.valid) {
      throw new Error(validationResult.error);
    }

    const id = uuid();
    const keys: string[] = [];
    const values: any[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      keys.push(toSnakeCase(key));
      values.push(this.getConditionValue(key, value));
    }

    const insertQuery = `insert into \`${this.table.name}\`(id, ${keys.join(', ')}) value (uuid_to_bin('${id}'), ${values.join(', ')})`;
    await conn.execute(insertQuery);

    if (fetch) {
      return await this.findOne(conn, { where: { id } });
    }

    return;
  }

  async find(conn: TDBConnection, data?: IModelFind) {
    let selectQuery = `select m.*, bin_to_uuid(id) as id from ${this.table.name} m where deleted_at is null`;
    let foundList: any[] = [];
    
    if (!data) {
      foundList = Object.values(await conn.find(selectQuery));
    } else {
      const { where, populate, sort } = data;

      if (where) {
        const conditions = this.getSearchConditions(where);
        selectQuery += ` and ${conditions.join(' and ')}`;
      }

      if (sort) {
        const sortingItems: string[] = [];
        for (const item of sort) {
          if (this.table.columns[item.column]) {
            sortingItems.push(`${item.column} ${item.order || 'asc'}`);
          } else {
            throw new Error('Column not found in table');
          }
        }
        selectQuery += ` order by ${sortingItems.join(', ')}`;
      } else {
        selectQuery += ` order by created_at asc`;
      }
      const foundItems: any[] = Object.values(await conn.find(selectQuery));

      if (populate) {
        for (const found of foundItems) {
          const populated: any = await this.getPopulatedData(conn, found, populate);
          foundList.push(Object.assign({}, found, populated));
        }
      } else {
        foundList = foundItems;
      }
    }

    const result: any[] = [];
    for (const found of foundList) {
      const transformedObj = await this.getForeignKeyUUID(conn, found);
      result.push(transformedObj);
    }

    return toCamelKeys(result) as object;
  }

  async findOne(conn: TDBConnection, data?: IModelFindOne) {
    let selectQuery = `select m.*, bin_to_uuid(id) as id from ${this.table.name} m where deleted_at is null`;
    let populated: IObject = {};
    // let found: any = {};

    if (!data) {
      const found = await conn.findOne(selectQuery);
      const transformedObj = await this.getForeignKeyUUID(conn, found);
      const camelObj = toCamelKeys(transformedObj) as object;
      return camelObj;
    }
    
    const { where, populate } = data;

    if (where) {
      const conditions = this.getSearchConditions(where);
      selectQuery += ` and ${conditions.join(' and ')}`;
    }
    const found = await conn.findOne(selectQuery);
    const transformedObj = await this.getForeignKeyUUID(conn, found);

    if (populate) {
      populated = await this.getPopulatedData(conn, transformedObj, populate);
    }

    const completeObj = Object.assign({}, transformedObj, populated);
    const camelObj = toCamelKeys(completeObj) as object;
    return camelObj;
  }

  update(conn: TDBConnection, id: string) {
    return {
      set: async (data: IModelUpdate) => {
        const { obj, schema } = data;
    
        const validationResult = await validateObj(schema, obj);
        if (!validationResult.valid) {
          throw new Error(validationResult.error);
        }

        const modifications = [];
        for (const key in obj) {
          modifications.push(`${key} = ${this.getConditionValue(key, obj[key])}`);
        }

        const query = `update ${this.table.name} set ${modifications.join(', ')} where id = uuid_to_bin('${id}');`;
        await conn.execute(query);
      }
    }
  }

  async delete(conn: TDBConnection, id: string) {
    const query = `update ${this.table.name} set deleted_at = ${this.getConditionValue('deletedAt', new Date())} where id = uuid_to_bin('${id}');`;
    await conn.execute(query);
  }

}
