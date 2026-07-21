/**
 * Create an object composed of the picked object properties
 * @param object
 * @param keys
 * @returns
 */
const pick = (object: Record<string, any>, keys: string[]) => {
    return keys.reduce((obj: Record<string, any>, key: string) => {
        if (object && Object.prototype.hasOwnProperty.call(object, key)) {
            obj[key] = object[key];
        }
        return obj;
    }, {});
};

export default pick;
