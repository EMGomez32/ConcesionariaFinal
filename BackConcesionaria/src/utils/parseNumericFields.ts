/**
 * Convert string values to numbers for specified fields
 * Useful for processing query parameters that should be numeric
 * @param object - The object to process
 * @param numericFields - Array of field names that should be converted to numbers
 * @returns The object with converted numeric fields
 */
export const parseNumericFields = <T extends Record<string, any>>(
    object: T,
    numericFields: string[]
): T => {
    const result: Record<string, any> = { ...object };
    
    numericFields.forEach(field => {
        if (result[field] !== undefined && result[field] !== null && result[field] !== '') {
            const parsed = parseInt(result[field] as string, 10);
            if (!isNaN(parsed)) {
                result[field] = parsed;
            }
        }
    });
    
    return result as T;
};

export default parseNumericFields;
