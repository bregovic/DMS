import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Přepínatelná vrstva úložiště souborů.
 * Dnes: lokální disk (dev). Později stačí přidat R2/S3 driver
 * implementující stejné rozhraní – zbytek aplikace se nemění.
 */
export interface StorageProvider {
  save(file: Buffer, originalName: string): Promise<string>; // vrací storage key
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements StorageProvider {
  private dir: string;

  constructor(dir: string) {
    this.dir = path.resolve(process.cwd(), dir);
  }

  private full(key: string) {
    return path.join(this.dir, key);
  }

  async save(file: Buffer, originalName: string): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const ext = path.extname(originalName);
    const key = `${randomUUID()}${ext}`;
    await writeFile(this.full(key), file);
    return key;
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.full(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.full(key)).catch(() => {});
  }
}

function createStorage(): StorageProvider {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  switch (driver) {
    case "local":
    default:
      return new LocalStorage(process.env.STORAGE_LOCAL_DIR ?? "./.uploads");
    // case "r2": return new R2Storage(...)  // budoucí rozšíření
  }
}

export const storage = createStorage();
