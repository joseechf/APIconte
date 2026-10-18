import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateRouter, getUser } from '../src/api.js';
import { DataClient, dataClient } from '../src/data.client.js';

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

test('getUserWithTechnicianData devuelve datos normales cuando no hay perfil técnico', async function () {
  const client = new DataClient();
  const user = {
    id: USER_ID,
    email: 'usuario@correo.com',
    user_metadata: { name: 'Luis Pérez', phone: '61234567' }
  };

  client.getUser = async function getUserStub(userId) {
    assert.equal(userId, USER_ID);
    return user;
  };
  client.getOptionalTechnicianByUserId = async function getOptionalTechnicianByUserIdStub(userId) {
    assert.equal(userId, USER_ID);
    return null;
  };

  const result = await client.getUserWithTechnicianData(USER_ID);

  assert.deepEqual(result, user);
  assert.equal('calificacion' in result, false);
  assert.equal('especialidades' in result, false);
  assert.equal('ubicaciones' in result, false);
});

test('getUserWithTechnicianData unifica datos falsos de usuario y técnico', async function () {
  const client = new DataClient();

  client.getUser = async function getUserStub() {
    return {
      id: USER_ID,
      email: 'tecnico@correo.com',
      user_metadata: { name: 'Ana Gómez', phone: '69876543' }
    };
  };
  client.getOptionalTechnicianByUserId = async function getOptionalTechnicianByUserIdStub() {
    return {
      calificacion: 4.5,
      especialidades: [{ especialidad: 'Electricista', experiencia: 4 }],
      ubicaciones: ['Panama', 'Herrera']
    };
  };

  const result = await client.getUserWithTechnicianData(USER_ID);

  assert.deepEqual(result, {
    id: USER_ID,
    email: 'tecnico@correo.com',
    user_metadata: { name: 'Ana Gómez', phone: '69876543' },
    calificacion: 4.5,
    especialidades: [{ especialidad: 'Electricista', experiencia: 4 }],
    ubicaciones: ['Panama', 'Herrera']
  });
});

test('GET /api/users obtiene al usuario autenticado con sus datos técnicos', { concurrency: false }, async function () {
  const originalGetUserWithTechnicianData = dataClient.getUserWithTechnicianData;
  const expectedUser = {
    id: USER_ID,
    email: 'tecnico@correo.com',
    user_metadata: { name: 'Ana Gómez', phone: '61234567' },
    calificacion: 4.5,
    especialidades: [{ especialidad: 'Electricista', experiencia: 4 }],
    ubicaciones: ['Panama']
  };

  dataClient.getUserWithTechnicianData = async function getUserWithTechnicianDataStub(userId) {
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
    dataClient.getUserWithTechnicianData = originalGetUserWithTechnicianData;
  }
});

test('PUT /api/users no está registrado como endpoint privado', function () {
  const result = executePutUser();

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
});
