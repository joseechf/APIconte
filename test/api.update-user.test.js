import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateRouter, updateUser } from '../src/api.js';
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

async function executeUpdateUser(body) {
  const request = {
    body,
    user: { id: USER_ID }
  };
  const response = createResponse();
  let nextError;

  await updateUser(request, response, function next(error) {
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

test('PATCH /api/users actualiza únicamente los campos enviados', { concurrency: false }, async function () {
  const originalUpdateUser = dataClient.updateUser;
  let receivedUserId;
  let receivedAttributes;
  const updatedUser = {
    id: USER_ID,
    email: 'nuevo@correo.com',
    user_metadata: { name: 'Ana Gómez', phone: '61234567' }
  };

  dataClient.updateUser = async function updateUserStub(userId, attributes) {
    receivedUserId = userId;
    receivedAttributes = attributes;
    return updatedUser;
  };

  try {
    const { response, nextError } = await executeUpdateUser({
      email: ' NUEVO@CORREO.COM ',
      name: 'Ana Gómez'
    });

    assert.equal(nextError, undefined);
    assert.equal(receivedUserId, USER_ID);
    assert.deepEqual(receivedAttributes, {
      email: 'nuevo@correo.com',
      user_metadata: { name: 'Ana Gómez' }
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      status: 200,
      message: 'todo bien',
      user: updatedUser
    });
  } finally {
    dataClient.updateUser = originalUpdateUser;
  }
});

test('PATCH /api/users conserva campos no enviados', { concurrency: false }, async function () {
  const originalUpdateUser = dataClient.updateUser;
  let receivedAttributes;

  dataClient.updateUser = async function updateUserStub(_userId, attributes) {
    receivedAttributes = attributes;
    return { id: USER_ID };
  };

  try {
    const { nextError } = await executeUpdateUser({ phone: '61234567' });

    assert.equal(nextError, undefined);
    assert.deepEqual(receivedAttributes, {
      user_metadata: { phone: '61234567' }
    });
  } finally {
    dataClient.updateUser = originalUpdateUser;
  }
});

test('PATCH /api/users rechaza tipos incorrectos', async function () {
  const invalidBodies = [
    { email: 123 },
    { name: ['Ana Gómez'] },
    { phone: 61234567 },
    { password: 12345678 }
  ];

  for (const body of invalidBodies) {
    const { nextError } = await executeUpdateUser(body);

    assert.equal(nextError.statusCode, 400);
  }
});

test('PATCH /api/users rechaza un intento de inyección SQL', async function () {
  const { nextError } = await executeUpdateUser({
    email: "nuevo@correo.com' OR '1'='1"
  });

  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.message, 'email no es válido.');
  assert.equal(nextError.origin, 'src/api.js:validateEmail');
});

test('PATCH /api/users rechaza un intento de XSS', async function () {
  const { nextError } = await executeUpdateUser({
    name: '<script>alert(1)</script>'
  });

  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.message, 'name no es válido.');
  assert.equal(nextError.origin, 'src/api.js:validateName');
});

test('PATCH /api/users rechaza un cuerpo sin campos actualizables', async function () {
  const { nextError } = await executeUpdateUser({});

  assert.equal(nextError.statusCode, 400);
  assert.equal(
    nextError.message,
    'Proporciona al menos email, name, phone o password para actualizar.'
  );
  assert.equal(nextError.origin, 'src/api.js:updateUser');
});

test('PUT /api/users no está registrado en lugar de PATCH', function () {
  const result = executePutUser();

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
});
