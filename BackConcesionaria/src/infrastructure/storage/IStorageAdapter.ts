export interface SavedFile {
    /** Path/key inside the storage backend. Used for delete + future migration. */
    storageKey: string;
    /** Public URL clients can fetch (relative or absolute depending on adapter). */
    url: string;
}

export interface UploadInput {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
}

export interface IStorageAdapter {
    save(file: UploadInput, prefix: string): Promise<SavedFile>;
    delete(storageKey: string): Promise<void>;
}
