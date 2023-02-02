import { CollationOptions, Collection, IndexDescription, IndexDirection } from "mongodb";

type KeysList = { [key: string]: IndexDirection } | Map<string, IndexDirection>;

function mapKeyEntries([key, value]: [string, IndexDirection]): string {
    /** - Omit value when is default IndexDirection = 1
     *  - Key entry will be mapped to "key$value" string
     */
    return [key, value === 1 ? null : value].filter(Boolean).join("$");
}

export function generateKeysName(keys: KeysList): string {
    /** - Join key entries using underscore "_" separator */
    return Object.entries(keys).map(mapKeyEntries).join("_");
}

export function generateCollationName(collation?: CollationOptions): string {
    /** Return empty string of no collation provided */
    if (!collation) return "";

    /** Collation name is a "locale_strength" string */
    return [collation.locale, collation.strength].filter(Boolean).join("_");
}

export function generateIndexName(collection: Collection, indexDescription: IndexDescription): string {
    const { key, unique, sparse, partialFilterExpression, expireAfterSeconds } = indexDescription;

    /** Default _id index name */
    if (JSON.stringify(key) === JSON.stringify({ _id: 1 })) return "_id_";

    /** Build index name */
    let name = "IX";

    /** Unique index prefix */
    if (unique) name = `U${name}`;

    /** Sparse index prefix */
    if (sparse) name = `S${name}`;

    /** Filter index prefix */
    if (partialFilterExpression) name = `F${name}`;

    /** TTL index prefix */
    if (typeof expireAfterSeconds === "number") name = `TTL_${name}`;

    /** Index name:
     *    [TTL]_[F][S][U]IX_[CollectionName]_[Keys]_[Collation]
     */
    name = [name, collection.collectionName, generateKeysName(indexDescription.key), generateCollationName(indexDescription.collation)]
        .filter(Boolean)
        .join("_");

    return name;
}
