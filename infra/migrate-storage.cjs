const { AzureCliCredential } = require('../api/node_modules/@azure/identity');
const { BlobServiceClient } = require('../api/node_modules/@azure/storage-blob');
const { createHash } = require('node:crypto');

async function hashBlob(blob, etag) {
  const response = await blob.download(0, undefined, { conditions: { ifMatch: etag } });
  if (!response.readableStreamBody) throw new Error('Missing blob response stream');
  const hash = createHash('sha256');
  for await (const chunk of response.readableStreamBody) hash.update(chunk);
  return hash.digest('hex');
}

async function migrate() {
  if (!process.argv.includes('--confirm-frozen')) throw new Error('Disable and verify legacy blobProxy before passing --confirm-frozen');
  const credential = new AzureCliCredential({ tenantId: '661e4baf-db68-4a3d-9d81-73dd277cabd1' });
  const source = new BlobServiceClient('https://momoneygroupbb64.blob.core.windows.net', credential).getContainerClient('money-files');
  const destination = new BlobServiceClient('https://stmomoneyprod4eb0.blob.core.windows.net', credential).getContainerClient('money-files');
  let copied = 0;
  let verified = 0;
  const sourceVersions = new Map();
  for await (const item of source.listBlobsFlat()) {
    if (!item.properties.etag) throw new Error('Source blob has no ETag');
    sourceVersions.set(item.name, item.properties.etag);
    const from = source.getBlobClient(item.name);
    const to = destination.getBlockBlobClient(item.name);
    const expectedHash = await hashBlob(from, item.properties.etag);
    if (!await to.exists()) {
      const response = await from.download(0, undefined, { conditions: { ifMatch: item.properties.etag } });
      if (!response.readableStreamBody) throw new Error('Missing source stream');
      await to.uploadStream(response.readableStreamBody, 4 * 1024 * 1024, 2, {
        conditions: { ifNoneMatch: '*' },
        blobHTTPHeaders: { blobContentType: item.properties.contentType || 'application/octet-stream' },
        metadata: { source: 'legacy-storageproxy' }
      });
      copied++;
    }
    const actual = await to.getProperties();
    if (!actual.etag || await hashBlob(to, actual.etag) !== expectedHash) {
      throw new Error('Migration verification failed. Neither the source nor conflicting destination was overwritten.');
    }
    verified++;
  }
  let checked = 0;
  for await (const item of source.listBlobsFlat()) {
    if (sourceVersions.get(item.name) !== item.properties.etag) throw new Error('Legacy data changed during migration. Do not enable the new API.');
    checked++;
  }
  if (checked !== sourceVersions.size) throw new Error('Legacy data was removed during migration. Do not enable the new API.');
  console.log(JSON.stringify({ copied, verified, sourceUnchanged: true }));
}

migrate().catch(error => {
  // SDK errors can include URLs and identity details; never print financial payloads or credentials.
  console.error('Migration stopped:', error.code || error.message);
  process.exitCode = 1;
});
