import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { IStorageAdapter, SavedFile, UploadInput } from './IStorageAdapter';
import { extensionParaMime } from '../security/contenidoArchivo';

// Stores files under <root>/<prefix>/<yyyy-mm>/<random>.<ext>
// `url` is built relative to a public mount point ('/uploads' by default), so
// the backend can serve them via express.static and clients can fetch directly.
export class LocalStorageAdapter implements IStorageAdapter {
    constructor(
        private readonly root: string,
        private readonly publicBase: string = '/uploads'
    ) { }

    async save(file: UploadInput, prefix: string): Promise<SavedFile> {
        // La extensión NUNCA sale del originalname (lo controla el cliente: un .html/.svg/.js
        // plantado se serviría desde el dominio de la app). Sale del contenido ya validado
        // (file.extension) o, si no, del mimetype ya validado.
        const extSegura = /^[a-z0-9]{1,5}$/.test(file.extension ?? '') ? file.extension : extensionParaMime(file.mimetype);
        const ext = `.${extSegura}`;
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

    async read(storageKey: string): Promise<Buffer> {
        // El storageKey se compone acá abajo (nunca viene del cliente), pero por
        // las dudas se resuelve y se valida que caiga dentro de root: así un key
        // con '..' no puede leer archivos fuera del directorio de uploads.
        const fullPath = path.resolve(this.root, storageKey);
        const rootResolved = path.resolve(this.root);
        if (fullPath !== rootResolved && !fullPath.startsWith(rootResolved + path.sep)) {
            throw new Error('storageKey fuera del directorio de storage');
        }
        return fs.readFile(fullPath);
    }
}

const STORAGE_ROOT = process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads');
export const storage: IStorageAdapter = new LocalStorageAdapter(STORAGE_ROOT);
