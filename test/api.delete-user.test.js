import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateRouter, deleteUser } from '../src/api.js';
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

async function executeDeleteUser() {
  const request = { user: { id: USER_ID } };
  const response = createResponse();
  let nextError;

  await deleteUser(request, response, function next(error) {
    nextError = error;
  });

  return { response, nextError };
}

function executePutUser() {
  const router = createPrivateRouter(function allowSession(_request, _response, next) {
    return next();
  });
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

test('DELETE /api/users elimina al usuario autenticado', { concurrency: false }, async function () {
  const originalDeleteUser = dataClient.deleteUser;
  let receivedUserId;

  dataClient.deleteUser = async function deleteUserStub(userId) {
    receivedUserId = userId;
  };

  try {
    const { response, nextError } = await executeDeleteUser();

    assert.equal(nextError, undefined);
    assert.equal(receivedUserId, USER_ID);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      status: 200,
      message: 'todo bien'
    });
  } finally {
    dataClient.deleteUser = originalDeleteUser;
  }
});

test('PUT /api/users no está registrado en lugar de DELETE', function () {
  const result = executePutUser();

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
});
