import { randomUUID } from 'node:crypto';
import { CloudSnapshot, CloudVersion, isRecord, removedRecords, validateSnapshot } from '../../src/utils/cloudSnapshot';

export class StorageError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface StoredBlob { text: string; etag: string }
export interface BlobRepository {
  read(name: string): Promise<StoredBlob | null>;
  create(name: string, text: string): Promise<void>;
  writeHead(name: string, text: string, etag: string | null): Promise<void>;
}

export class SnapshotStore {
  constructor(private blobs: BlobRepository, private prefix: string) {}

  private versionPath(id: string): string {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new StorageError(400, 'Invalid revision.');
    return `${this.prefix}/versions/${id}.json`;
  }

  async version(id: string): Promise<CloudVersion> {
    const blob = await this.blobs.read(this.versionPath(id));
    if (!blob) throw new StorageError(404, 'Recovery version not found.');
    const version: unknown = JSON.parse(blob.text);
    if (!isRecord(version) || version.revision !== id ||
        !(version.parent === null || typeof version.parent === 'string') ||
        typeof version.createdAt !== 'string' || !Number.isFinite(Date.parse(version.createdAt))) {
      throw new Error('Invalid stored version metadata.');
    }
    validateSnapshot(version.data);
    return { revision: id, parent: version.parent, createdAt: version.createdAt, data: version.data };
  }

  async current(): Promise<{ version: CloudVersion | null; etag: string | null }> {
    const head = await this.blobs.read(`${this.prefix}/head.json`);
    if (!head) return { version: null, etag: null };
    const version = await this.version(JSON.parse(head.text).revision);
    return { version, etag: head.etag };
  }

  async save(data: CloudSnapshot, expected: string | null, allowRemoval: boolean): Promise<CloudVersion> {
    validateSnapshot(data);
    const current = await this.current();
    if ((current.version?.revision ?? null) !== expected) {
      throw new StorageError(409, 'Cloud data changed. Download or review the current cloud version before saving.');
    }
    if (current.version && removedRecords(current.version.data, data) > 0 && !allowRemoval) {
      throw new StorageError(422, 'Save blocked: records would be removed. Review and confirm this change in Settings.');
    }
    const version: CloudVersion = {
      revision: randomUUID(), parent: expected, createdAt: new Date().toISOString(), data
    };
    // Create-only versions survive even a failed head update. Never delete or overwrite recovery data.
    await this.blobs.create(this.versionPath(version.revision), JSON.stringify(version));
    await this.blobs.writeHead(`${this.prefix}/head.json`, JSON.stringify({ revision: version.revision }), current.etag);
    return version;
  }

  async history(cursor?: string): Promise<{ versions: Omit<CloudVersion, 'data'>[]; next: string | null }> {
    let id = cursor || (await this.current()).version?.revision;
    const versions: Omit<CloudVersion, 'data'>[] = [];
    while (id && versions.length < 25) {
      const { data, ...metadata } = await this.version(id);
      versions.push(metadata);
      id = metadata.parent || undefined;
    }
    return { versions, next: id || null };
  }
}
