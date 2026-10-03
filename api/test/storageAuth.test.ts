import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpRequest } from '@azure/functions';
import { userIdentity } from '../src/functions/storage';

function request(user?: unknown) {
  return new HttpRequest({
    method: 'GET',
    url: 'https://example.test/api/storage/current',
    headers: user ? { 'x-ms-client-principal': Buffer.from(JSON.stringify(user)).toString('base64') } : {}
  });
}

test('unconfigured authentication fails closed', () => {
  delete process.env.STORAGE_AUTH_MODE;
  assert.throws(() => userIdentity(request()), { status: 503 });
});

test('anonymous and malformed principals are rejected', () => {
  process.env.STORAGE_AUTH_MODE = 'swa-linked';
  assert.throws(() => userIdentity(request()), { status: 401 });
  assert.throws(() => userIdentity(request({ userId: 'alice', identityProvider: 'aad', userRoles: ['anonymous'] })), { status: 401 });
  assert.throws(() => userIdentity(request({ userRoles: ['authenticated'] })), { status: 401 });
});

test('the trusted platform identity determines the namespace, including provider', () => {
  process.env.STORAGE_AUTH_MODE = 'swa-linked';
  const a = userIdentity(request({ userId: 'alice', identityProvider: 'aad', userRoles: ['authenticated'] }));
  const b = userIdentity(request({ userId: 'alice', identityProvider: 'github', userRoles: ['authenticated'] }));
  assert.match(a.namespace, /^[0-9a-f]{64}$/);
  assert.notEqual(a.namespace, b.namespace);
});
