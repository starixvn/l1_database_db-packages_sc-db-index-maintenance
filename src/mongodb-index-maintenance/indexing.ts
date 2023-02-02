import { Collection, IndexDescription, IndexDirection, MongoServerError } from "mongodb";
import { generateIndexName } from "../helpers/name-generator";

export function filterIndexes(indexes: IndexDescription[], filter?: Partial<IndexDescription>): IndexDescription[] {
    /** Skip if no filters provided */
    if (!filter) return indexes;

    /** Priority 1: filter by key */
    if (filter.key) return indexes.filter(({ key }) => JSON.stringify(key) === JSON.stringify(filter.key));

    /** Priority 2: filter by name */
    if (filter.name) return indexes.filter((idx) => idx.name === filter.name);

    /** Ignore others
     *    TODO: Filter by options too
     */
    return indexes;
}

export async function getIndexes(collection: Collection, filter?: Partial<IndexDescription>): Promise<IndexDescription[]> {
    /** Fetch indexes from server */
    const indexes: IndexDescription[] = await collection.listIndexes().toArray();

    return filterIndexes(indexes, filter);
}

type KeyDefinition = { [key: string]: IndexDirection };
type AcceptedFilters = Pick<Partial<IndexDescription>, "key" | "name"> | KeyDefinition | string;

export function buildFilter<F extends AcceptedFilters>(input?: F): Partial<IndexDescription> {
    /** No inputs return empty filter */
    if (!input) return {};

    /** Treat string filter as index name */
    if (typeof input === "string") return { name: input };

    /** If input is an object with key is object, it is IndexDescription */
    if (typeof input === "object" && typeof input.key === "object") return { key: input.key };

    /** Other case, the whole input must be index keys definition */
    return { key: input } as Pick<Partial<IndexDescription>, "key">;
}

export async function getIndex<F extends AcceptedFilters>(collection: Collection, filter?: F): Promise<IndexDescription> {
    const realFilter: Partial<IndexDescription> = buildFilter(filter);

    return (await getIndexes(collection, realFilter))[0];
}

export async function dropIndex<F extends AcceptedFilters>(collection: Collection, index: F): Promise<boolean> {
    const realFilter: Partial<IndexDescription> = buildFilter(index);
    const svrIndex = await getIndex(collection, realFilter);

    /** If no correct index on server, return */
    if (!svrIndex || !svrIndex.name) return false;

    /** Drop index by name */
    await collection.dropIndex(svrIndex.name);
    return true;
}

export async function createIndex(collection: Collection, index: IndexDescription): Promise<string> {
    const { key, ...options } = index;
    options.name = generateIndexName(collection, index);
    return collection.createIndex(key, options);
}

export async function deployIndex(collection: Collection, index: IndexDescription): Promise<string> {
    let indexName: string;
    try {
        /** Try create index right away */
        indexName = await createIndex(collection, index);
    } catch (error: unknown) {
        /** Errors other than IndexOptionConflict are not expected, throw */
        if (error instanceof MongoServerError && error.code !== 85) throw error;

        /** Error 85 - IndexOptionsConflict - drop and recreate index */
        await dropIndex(collection, index);
        indexName = await createIndex(collection, index);
    }
    return indexName;
}

export async function deployIndexes(collection: Collection, indexes: IndexDescription[]): Promise<string[]> {
    return Promise.all(indexes.map(async (index) => deployIndex(collection, index)));
}
