import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { IStorageAdapter, SavedFile, UploadInput } from './IStorageAdapter';

// Stores files under <root>/<prefix>/<yyyy-mm>/<random>.<ext>
// `url` is built relative to a public mount point ('/uploads' by default), so
// the backend can serve them via express.static and clients can fetch directly.
export class LocalStorageAdapter implements IStorageAdapter {
    constructor(
        private readonly root: string,
        private readonly publicBase: string = '/uploads'
    ) { }

    async save(file: UploadInput, prefix: string): Promise<SavedFile> {
        const ext = path.extname(file.originalname).toLowerCase().slice(0, 16);
        const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '-');
        const yearMonth = new Date().toISOString().slice(0, 7);
        const randomName = crypto.randomBytes(16).toString('hex') + ext;

        const relativePath = path.posix.join(safePrefix, yearMonth, randomName);
        const fullPath = path.join(this.root, relativePath);

        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, file.buffer);

        return {
            storageKey: relativePath,
            url: `${this.publicBase}/${relativePath}`,
        };
    }

    async delete(storageKey: string): Promise<void> {
        const fullPath = path.join(this.root, storageKey);
        try {
            await fs.unlink(fullPath);
        } catch (err: any) {
            // Missing file is acceptable on delete (idempotent semantics).
            if (err.code !== 'ENOENT') throw err;
        }
    }
}

const STORAGE_ROOT = process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads');
export const storage: IStorageAdapter = new LocalStorageAdapter(STORAGE_ROOT);
