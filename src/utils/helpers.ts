import { camelKeys } from "js-convert-case";

export const toCamelKeys = (obj: any) => {

  if (Array.isArray(obj)) {
    const result = [];
    for (let item of obj) {
      item = toCamelKeys(item);
      result.push(item);
    }
    return result;
  }
  
  return camelKeys(obj);
}

export const validateObj = async (schema: any, value: any) => {
  try {
    await schema.validateAsync(value);
    return { valid: true };
  } catch (err: any) {
    console.error('ValidateSchemaError:', err);
    return { valid: false, error: err.details[0].message };
  }
}
