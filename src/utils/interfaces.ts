export interface IDBConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface IObject {
  [key: string]: any;
}

export interface IColumn extends IObject {
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
  [name: string]: IColumn;
}

export interface IConstraint {
  tableName: string;
  columnName: string;
  referenceTable: string
}

export interface ITable {
  name: string;
  columns: IColumns;
}

export interface ITables {
  [name: string]: ITable;
}

export interface IModelUpdate {
  obj: any,
  schema: any,
}

export interface IModelInsert extends IModelUpdate {
  fetch?: boolean,
}

export interface IModelFindOne {
  where?: IObject;
  populate?: IModelPopulate[];
}

export interface IModelSort {
  column: string;
  order?: 'asc' | 'desc';
}

export interface IModelFind extends IModelFindOne {
  sort?: IModelSort[];
}

export interface IModelPopulate extends IModelFind {
  column: string;
}

export interface IModel {
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  id: string;
}
