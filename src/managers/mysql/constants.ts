import { IColumns } from "@utils/interfaces";

export const DEFAULT_ATTRIBUTES: IColumns = {
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
