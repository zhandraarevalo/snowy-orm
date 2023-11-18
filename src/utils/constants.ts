import { IColumns, IObject } from '.';

const MYSQL_DEFAULT_ATTRIBUTES: IColumns = {
  createdAt: {
    type: 'datetime',
    required: true,
    default: 'current_timestamp',
  },
  updatedAt: {
    type: 'datetime',
    required: true,
    default: 'current_timestamp',
    onUpdate: 'current_timestamp',
  },
  deletedAt: {
    type: 'datetime',
  },
  id: {
    type: 'binary(16)',
    required: true,
    primaryKey: true,
  }
}

export const DEFAULT_ATTRIBUTES: IObject = {
  mysql: MYSQL_DEFAULT_ATTRIBUTES,
}

export const DEFAULT_ATTRIBUTES_NAMES: string[] = ['createdAt', 'updatedAt', 'deletedAt', 'id'];

export const TEXT_TYPES = ['char', 'varchar', 'text'];

export const VALID_OPS = ['>', '>=', '<', '<='];
