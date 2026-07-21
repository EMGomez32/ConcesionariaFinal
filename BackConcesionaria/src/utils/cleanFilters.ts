/**
 * Remove empty string, null, and undefined values from filters
 * This prevents Prisma from searching for exact matches on empty strings
 * @param filters - Object with filter values
 * @returns Cleaned filters object
 */
export const cleanFilters = (filters: Record<string, any>): Record<string, any> => {
    return Object.entries(filters).reduce((acc, [key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
            acc[key] = value;
        }
        return acc;
    }, {} as Record<string, any>);
};
