import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Přepínatelná vrstva úložiště souborů (STORAGE_DRIVER):
 *  - "local" = lokální disk (dev)
 *  - "r2" / "s3" = Cloudflare R2 nebo jiné S3-kompatibilní úložiště
 * Zbytek aplikace pracuje jen s tímto rozhraním.
 */
export interface StorageProvider {
  // prefix = složka (např. "<ownerId>/<projectId>"); vrací plný storage key
  save(file: Buffer, originalName: string, prefix?: string): Promise<string>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Sestaví bezpečný klíč: <prefix>/<uuid><ext>. */
function buildKey(originalName: string, prefix?: string): string {
  const ext = path.extname(originalName);
  const name = `${randomUUID()}${ext}`;
  if (!prefix) return name;
  const safe = prefix
    .split("/")
    .map((seg) => seg.replace(/[^a-zA-Z0-9_-]/g, "_"))
    .filter(Boolean)
    .join("/");
  return safe ? `${safe}/${name}` : name;
}

class LocalStorage implements StorageProvider {
  private dir: string;

  constructor(dir: string) {
    this.dir = path.resolve(process.cwd(), dir);
  }

  private full(key: string) {
    return path.join(this.dir, key);
  }

  async save(
    file: Buffer,
    originalName: string,
    prefix?: string,
  ): Promise<string> {
    const key = buildKey(originalName, prefix);
    const full = this.full(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, file);
    return key;
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.full(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.full(key)).catch(() => {});
  }
}

class S3Storage implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET ?? "dms";
    this.client = new S3Client({
      region: process.env.R2_REGION ?? "auto",
      endpoint: process.env.R2_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
    });
  }

  async save(
    file: Buffer,
    originalName: string,
    prefix?: string,
  ): Promise<string> {
    const key = buildKey(originalName, prefix);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file,
      }),
    );
    return key;
  }

  async read(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client
      .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
      .catch(() => {});
  }
}

function createStorage(): StorageProvider {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  switch (driver) {
    case "r2":
    case "s3":
      return new S3Storage();
    case "local":
    default:
      return new LocalStorage(process.env.STORAGE_LOCAL_DIR ?? "./.uploads");
  }
}

export const storage = createStorage();
