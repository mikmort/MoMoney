import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { createHash } from 'node:crypto';
import { BlobRepository, SnapshotStore, StorageError } from '../snapshotStore';
import { decodeLegacySnapshot, isRecord, validateSnapshot } from '../../../src/utils/cloudSnapshot';

function statusOf(error: unknown): number | undefined {
  return isRecord(error) && typeof error.statusCode === 'number' ? error.statusCode : undefined;
}

export function userIdentity(request: HttpRequest): { userId: string; namespace: string } {
  // Only a SWA-linked backend, protected from direct access by the platform, may supply this header.
  if (process.env.STORAGE_AUTH_MODE !== 'swa-linked') throw new StorageError(503, 'Storage authentication is not configured.');
  const header = request.headers.get('x-ms-client-principal');
  if (!header) throw new StorageError(401, 'Sign in to use cloud storage.');
  let user: unknown;
  try { user = JSON.parse(Buffer.from(header, 'base64').toString('utf8')); }
  catch { throw new StorageError(401, 'Invalid identity.'); }
  if (!isRecord(user) || typeof user.userId !== 'string' || !user.userId ||
      typeof user.identityProvider !== 'string' || !Array.isArray(user.userRoles) ||
      !user.userRoles.includes('authenticated')) throw new StorageError(401, 'Sign in to use cloud storage.');
  return {
    userId: user.userId,
    namespace: createHash('sha256').update(`${user.identityProvider}:${user.userId}`).digest('hex')
  };
}

function repository(): BlobRepository {
  const endpoint = process.env.STORAGE_ACCOUNT_URL;
  const containerName = process.env.STORAGE_CONTAINER;
  if (!endpoint || !containerName) throw new StorageError(503, 'Storage account is not configured.');
  const container = new BlobServiceClient(endpoint, new DefaultAzureCredential()).getContainerClient(containerName);
  return {
    async read(name) {
      try {
        const response = await container.getBlobClient(name).download();
        if (!response.etag || !response.readableStreamBody) throw new Error('Incomplete blob response.');
        const chunks: Buffer[] = [];
        for await (const chunk of response.readableStreamBody) chunks.push(Buffer.from(chunk));
        return { text: Buffer.concat(chunks).toString('utf8'), etag: response.etag };
      } catch (error) {
        if (statusOf(error) === 404 && isRecord(error) && error.code === 'BlobNotFound') return null;
        throw error;
      }
    },
    async create(name, text) {
      await container.getBlockBlobClient(name).upload(text, Buffer.byteLength(text), {
        conditions: { ifNoneMatch: '*' }, blobHTTPHeaders: { blobContentType: 'application/json' }
      });
    },
    async writeHead(name, text, etag) {
      try {
        await container.getBlockBlobClient(name).upload(text, Buffer.byteLength(text), {
          conditions: etag ? { ifMatch: etag } : { ifNoneMatch: '*' },
          blobHTTPHeaders: { blobContentType: 'application/json' }
        });
      } catch (error) {
        if (statusOf(error) === 412 || statusOf(error) === 409) {
          throw new StorageError(409, 'Another device saved first. Your local data was not overwritten.');
        }
        throw error;
      }
    }
  };
}

export async function storage(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = { 'Cache-Control': 'no-store', 'X-MoMoney-Storage': '1' };
  try {
    const identity = userIdentity(request);
    const blobs = repository();
    const store = new SnapshotStore(blobs, `users/${identity.namespace}`);
    const action = request.params.action;
    // Run migration before PUT as well: older clients must not bypass an existing legacy save.
    if (action === 'current' && process.env.STORAGE_IMPORT_LEGACY === 'true' && !(await store.current()).version) {
      const legacy = await blobs.read(`${identity.userId}-money-save`);
      if (legacy) {
        try { await store.save(decodeLegacySnapshot(JSON.parse(legacy.text)), null, false); }
        catch (error) {
          if (!(error instanceof StorageError && error.status === 409)) throw error;
        }
      }
    }
    if (request.method === 'GET') {
      if (action === 'versions') return { headers, jsonBody: await store.history(request.query.get('cursor') || undefined) };
      if (action === 'version') return { headers, jsonBody: await store.version(request.query.get('revision') || '') };
      if (action !== 'current') throw new StorageError(404, 'Unknown storage route.');
      const current = (await store.current()).version;
      return { headers, jsonBody: { current, account: identity.namespace } };
    }
    if (action !== 'current') throw new StorageError(405, 'Only the current snapshot can be saved.');
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      throw new StorageError(415, 'JSON content type is required.');
    }
    const text = await request.text();
    if (Buffer.byteLength(text) > 10 * 1024 * 1024) throw new StorageError(413, 'Snapshot exceeds the 10 MB limit.');
    let body: unknown;
    try { body = JSON.parse(text); }
    catch { throw new StorageError(400, 'Invalid JSON.'); }
    if (!isRecord(body) || !(body.expectedRevision === null || typeof body.expectedRevision === 'string')) {
      throw new StorageError(428, 'An explicit base revision is required.');
    }
    try { validateSnapshot(body.data); }
    catch (error) { throw new StorageError(400, error instanceof Error ? error.message : 'Invalid snapshot.'); }
    const version = await store.save(body.data, body.expectedRevision, body.allowRemoval === true);
    return { headers, jsonBody: version };
  } catch (error) {
    context.error('Storage request failed', error instanceof StorageError ? error.message : 'Storage unavailable');
    return {
      headers,
      status: error instanceof StorageError ? error.status : 503,
      jsonBody: { error: error instanceof StorageError ? error.message : 'Storage unavailable. No local data was replaced. Please retry later.' }
    };
  }
}

app.http('storage', {
  route: 'storage/{action}',
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  handler: storage
});
