import { pick, difference, find } from 'lodash';

const defaultMessages = {
    notDefinedKey(key) { return `Key '${key}' is not defined in schema`; },
    modelIsUndefined() { return 'Validated model is undefined'; },
    validateRequired(key) { return `Field '${key}' is required`; },
    validateString(key) { return `Field '${key}' is not a String`; },
    validateNumber(key) { return `Field '${key}' is not a Number`; },
    validateObject(key) { return `Field '${key}' is not a Object`; },
    validateArray(key) { return `Field '${key}' is not a Array`; },
    validateBoolean(key) { return `Field '${key}' is not a Boolean`; },
    validateDate(key) { return `Field '${key}' is not a Date`; }
};

class Schema {
    constructor(schema, messages) {
        this.schema = schema;
        this.errors = {};
        this.messages = messages || defaultMessages;

        this.validateTypeString = this.validateTypeString.bind(this);
        this.validateTypeNumber = this.validateTypeNumber.bind(this);
        this.validateTypeObject = this.validateTypeObject.bind(this);
        this.validateTypeArray = this.validateTypeArray.bind(this);
        this.validateTypeBoolean = this.validateTypeBoolean.bind(this);
        this.validateTypeDate = this.validateTypeDate.bind(this);
        this.validateTypeSchema = this.validateTypeSchema.bind(this);

        this.typesValidators = {
            String: this.validateTypeString,
            Number: this.validateTypeNumber,
            Object: this.validateTypeObject,
            Array: this.validateTypeArray,
            Boolean: this.validateTypeBoolean,
            Date: this.validateTypeDate,
        };
    }

    getDefaultValueForModel(value, wrrapArray) {
        return wrrapArray ? [value] : value;
    }

    getDefaultValues() {
        const fieldsKeys = Object.keys(this.schema);
        const model = {};
        fieldsKeys.forEach((key) => {
            const field = this.getField(key);
            const isArrayOfType = Array.isArray(field.type);
            const fieldType = isArrayOfType? field.type[0] : field.type;

            if (field.defaultValue) {
                model[key] = this.getDefaultValueForModel(field.defaultValue, isArrayOfType);
                return;
            }
            if (field.options) {
                model[key] = this.getDefaultValueForModel(
                    field.options[0].value ? field.options[0].value : field.options[0],
                    isArrayOfType
                );
                return;
            }
            if (fieldType instanceof Schema) {
                model[key] = this.getDefaultValueForModel(fieldType.getDefaultValues(), isArrayOfType);
                return;
            }
            if (fieldType.name === 'Number') {
                model[key] = this.getDefaultValueForModel(NaN, isArrayOfType);
                return;
            }
            if (fieldType.name === 'Boolean') {
                model[key] = this.getDefaultValueForModel(false, isArrayOfType);
                return;
            }
            if (fieldType.name === 'Object') {
                model[key] = this.getDefaultValueForModel({}, isArrayOfType);
                return;
            }
            model[key] = this.getDefaultValueForModel('', isArrayOfType);
        });
        return model;
    }

    getField(name) {
        return this.schema[name];
    }

    getFields() {
        return this.schema;
    }

    validate(model) {
        this.errors = {};
        if(this.checkModel(model)) {
            this.checkKeysDiff(model);
            this.checkTypesAndValidators(model);
        }
        return this.errors;
    }

    setError(key, message, index) {
        if (!this.errors[key]) this.errors[key] = [];
        if (index > -1) {
            this.errors[key][index] = message;
            return;
        }
        this.errors[key].push(message);
    }

    checkModel(model) {
        if(!model) {
            this.setError('model', this.messages.modelIsUndefined());
            return false;
        }
        return true;
    }

    checkKeysDiff(model) {
        const modelKeys = Object.keys(model);
        const schemaKeys = Object.keys(this.schema);
        const keysDiff = difference(modelKeys, schemaKeys);
        if (keysDiff.length > 0) {
            keysDiff.forEach(key => {
                this.setError(key, this.messages.notDefinedKey(key));
            });
        }
    }

    checkTypesAndValidators(model) {
        const schemaKeys = Object.keys(this.schema);
        const validatedObject = pick(model, schemaKeys);
        schemaKeys.forEach((key) => {
            const value = validatedObject[key];
            const fieldSchema = this.schema[key];
            const isArrayOfType = Array.isArray(fieldSchema.type);
            const fieldType = isArrayOfType ? fieldSchema.type[0] : fieldSchema.type;
            if (isArrayOfType && this.validateType(Array, value)){
                value.forEach((item, index) => {
                    this.validateType(fieldType, item, key, index);
                });
            } else {
                this.validateType(fieldType, value, key);
            }
            this.validateRequired(fieldSchema, value, key);
            if (fieldSchema.validators) {
                const failedValidator = find(
                    fieldSchema.validators,
                    v => !v.validator(value, fieldSchema, validatedObject)
                );
                if (failedValidator) this.setError(key, failedValidator.errorMessage);
            }
        })
    }

    validateRequired(fieldSchema, value, key) {
        if (fieldSchema.required && (!value || value.length === 0)) {
            this.setError(key, this.messages.validateRequired(key));
        }
    }

    validateType(type, value, key, index) {
        if (typeof this.typesValidators[type.name] === 'function') {
            return this.typesValidators[type.name](value, key, type, index);
        }
        if (type instanceof Schema) {
            return this.validateTypeSchema(value, key, type, index)
        }
        throw new Error(`Unrecognized type ${type.name}`);
    }

    validateTypeString(value, key, index) {
        if (typeof value === 'string') return true;
        this.setError(key, this.messages.validateString(key), index);
        return false;
    }

    validateTypeNumber(value, key, index) {
        if (typeof value === 'number') return true;
        this.setError(key, this.messages.validateNumber(key), index);
        return false;
    }

    validateTypeObject(value, key, index) {
        if (typeof value === 'object' && !Array.isArray(value)) return true;
        this.setError(key, this.messages.validateObject(key), index);
        return false;
    }

    validateTypeArray(value, key, index) {
        if (Array.isArray(value)) return true;
        this.setError(key, this.messages.validateArray(key), index);
        return false;
    }

    validateTypeBoolean(value, key, index) {
        if(typeof value === 'boolean') return true;
        this.setError(key, this.messages.validateBoolean(key), index);
        return false;
    }

    validateTypeDate(value, key, index) {
        if(value instanceof Date) return true;
        this.setError(key, this.messages.validateDate(key), index);
        return false;
    }

    validateTypeSchema(value, subSchemaKey, type, index) {
        const errors = type.validate(value);
        const keys = Object.keys(errors);
        if (keys.length === 0) return true;
        this.setError(subSchemaKey, errors, index);
        return false;
    }
}

export default Schema;
