import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicRouter, createUser } from '../src/api.js';
import { dataClient } from '../src/data.client.js';

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

async function executeCreateUser(body) {
  const request = { body };
  const response = createResponse();
  let nextError;

  await createUser(request, response, function next(error) {
    nextError = error;
  });

  return { response, nextError };
}

function executeGetUsers() {
  const router = createPublicRouter();
  const request = {
    baseUrl: '/api',
    method: 'GET',
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

test('POST /api/users crea un usuario con datos válidos', { concurrency: false }, async function () {
  const originalCreateUser = dataClient.createUser;
  let receivedCredentials;

  dataClient.createUser = async function createUserStub(credentials) {
    receivedCredentials = credentials;
    return {
      user: { id: '16a47b2d-3ca1-4fdb-8fe8-a1398f1a3d09' },
      session: null
    };
  };

  try {
    const { response, nextError } = await executeCreateUser({
      email: '  TECNICO@correo.com ',
      name: 'Ana Gómez',
      phone: '61234567',
      password: 'segura123'
    });

    assert.equal(nextError, undefined);
    assert.deepEqual(receivedCredentials, {
      email: 'tecnico@correo.com',
      name: 'Ana Gómez',
      phone: '61234567',
      password: 'segura123'
    });
    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.body, {
      status: 201,
      message: 'todo bien',
      user: { id: '16a47b2d-3ca1-4fdb-8fe8-a1398f1a3d09' },
      session: null
    });
  } finally {
    dataClient.createUser = originalCreateUser;
  }
});

test('POST /api/users rechaza campos obligatorios faltantes', async function () {
  const { response, nextError } = await executeCreateUser({
    email: 'tecnico@correo.com',
    name: 'Ana Gómez',
    phone: '61234567'
  });

  assert.equal(response.statusCode, undefined);
  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.message, 'email, name, phone y password son obligatorios.');
  assert.equal(nextError.origin, 'src/api.js:validateCredentials');
});

test('POST /api/users rechaza tipos de datos incorrectos', async function () {
  const invalidInputs = [
    {
      body: {
        email: 123,
        name: 'Ana Gómez',
        phone: '61234567',
        password: 'segura123'
      },
      message: 'email no es válido.'
    },
    {
      body: {
        email: 'tecnico@correo.com',
        name: ['Ana Gómez'],
        phone: '61234567',
        password: 'segura123'
      },
      message: 'name no es válido.'
    },
    {
      body: {
        email: 'tecnico@correo.com',
        name: 'Ana Gómez',
        phone: 61234567,
        password: 'segura123'
      },
      message: 'phone debe contener entre 8 y 15 dígitos; puede iniciar con +.'
    }
  ];

  for (const invalidInput of invalidInputs) {
    const { nextError } = await executeCreateUser(invalidInput.body);

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.message, invalidInput.message);
  }
});

test('POST /api/users rechaza un intento de inyección SQL', async function () {
  const { nextError } = await executeCreateUser({
    email: "tecnico@correo.com' OR '1'='1",
    name: 'Ana Gómez',
    phone: '61234567',
    password: 'segura123'
  });

  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.message, 'email no es válido.');
  assert.equal(nextError.origin, 'src/api.js:validateEmail');
});

test('POST /api/users rechaza un intento de XSS', async function () {
  const { nextError } = await executeCreateUser({
    email: 'tecnico@correo.com',
    name: '<script>alert(1)</script>',
    phone: '61234567',
    password: 'segura123'
  });

  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.message, 'name no es válido.');
  assert.equal(nextError.origin, 'src/api.js:validateName');
});

test('GET /api/users no está registrado como endpoint público', function () {
  const result = executeGetUsers();

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
});

test('POST /api/users rechaza un correo con formato inválido', async function () {
  const { nextError } = await executeCreateUser({
    email: 'correo-invalido',
    name: 'Ana Gómez',
    phone: '61234567',
    password: 'segura123'
  });

  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.message, 'email no es válido.');
  assert.equal(nextError.origin, 'src/api.js:validateEmail');
});
