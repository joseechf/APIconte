import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateRouter, getUser } from '../src/api.js';
import { dataClient } from '../src/data.client.js';

const USER_ID = '16a47b2d-3ca1-4fdb-8fe8-a1398f1a3d09';

function createResponse() {
  return {
    body: undefined,
    statusCode: undefined,
    status: function status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json: function json(body) {
      this.body = body;
      return this;
    }
  };
}

async function executeGetUser() {
  const request = { user: { id: USER_ID } };
  const response = createResponse();
  let nextError;

  await getUser(request, response, function next(error) {
    nextError = error;
  });

  return { response, nextError };
}

function executePutUser() {
  const router = createPrivateRouter();
  const request = {
    baseUrl: '/api',
    method: 'PUT',
    originalUrl: '/api/users',
    url: '/users'
  };
  let nextCalled = false;
  let nextError;

  router.handle(request, {}, function next(error) {
    nextCalled = true;
    nextError = error;
  });

  return { nextCalled, nextError };
}

test('GET /api/users obtiene al usuario autenticado', { concurrency: false }, async function () {
  const originalGetUser = dataClient.getUser;
  const expectedUser = {
    id: USER_ID,
    email: 'tecnico@correo.com',
    user_metadata: { name: 'Ana Gómez', phone: '61234567' }
  };

  dataClient.getUser = async function getUserStub(userId) {
    assert.equal(userId, USER_ID);
    return expectedUser;
  };

  try {
    const { response, nextError } = await executeGetUser();

    assert.equal(nextError, undefined);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      status: 200,
      message: 'todo bien',
      user: expectedUser
    });
  } finally {
    dataClient.getUser = originalGetUser;
  }
});

test('PUT /api/users no está registrado como endpoint privado', function () {
  const result = executePutUser();

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
});
