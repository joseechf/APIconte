import assert from 'node:assert/strict';
import test from 'node:test';
import { rateTechnician } from '../src/api.js';
import { app, requireSession } from '../src/index.js';
import { supabase } from '../src/config/supabase.js';
import { dataClient } from '../src/data.client.js';

const USER_ID = '16a47b2d-3ca1-4fdb-8fe8-a1398f1a3d09';
const OTHER_USER_ID = 'f15d6714-194a-45b0-9f35-4f28fcc4f761';

async function executeMiddleware(middleware, request) {
  let nextCalled = false;
  let nextError;

  await middleware(request, {}, function next(error) {
    nextCalled = true;
    nextError = error;
  });

  return { nextCalled, nextError };
}

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

test('un endpoint privado rechaza una solicitud sin token Bearer', async function () {
  const result = await executeMiddleware(requireSession, { headers: {} });

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError.statusCode, 401);
  assert.equal(result.nextError.message, 'Se requiere un token Bearer.');
  assert.equal(result.nextError.origin, 'src/index.js:requireSession');
});

test('una ruta inexistente responde 404 sin solicitar un token', { concurrency: false }, async function () {
  const request = {
    headers: {},
    method: 'GET',
    originalUrl: '/api/ruta-inexistente',
    url: '/api/ruta-inexistente'
  };
  const response = createResponse();
  response.setHeader = function setHeader() {};
  response.getHeader = function getHeader() {};
  response.removeHeader = function removeHeader() {};

  await new Promise(function executeApplication(resolve, reject) {
    const sendJson = response.json;

    response.json = function json(body) {
      sendJson.call(this, body);
      resolve();
      return this;
    };

    app.handle(request, response, function next(error) {
      reject(error ?? new Error('La aplicación no respondió a la solicitud.'));
    });
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, {
    status: 404,
    message: 'Esa ruta no existe',
    origin: 'src/index.js:notFound'
  });
});

test('un endpoint privado rechaza un token inválido', { concurrency: false }, async function () {
  const originalGetUser = supabase.auth.getUser;

  supabase.auth.getUser = async function getUserStub() {
    return {
      data: { user: null },
      error: { message: 'Token inválido.' }
    };
  };

  try {
    const result = await executeMiddleware(requireSession, {
      headers: { authorization: 'Bearer token-invalido' }
    });

    assert.equal(result.nextCalled, true);
    assert.equal(result.nextError.statusCode, 401);
    assert.equal(result.nextError.message, 'Token inválido.');
    assert.equal(result.nextError.origin, 'Supabase Auth:getUser');
  } finally {
    supabase.auth.getUser = originalGetUser;
  }
});

test('un token válido agrega el usuario autenticado a la solicitud', { concurrency: false }, async function () {
  const originalGetUser = supabase.auth.getUser;

  supabase.auth.getUser = async function getUserStub(token) {
    assert.equal(token, 'token-valido');
    return {
      data: { user: { id: USER_ID } },
      error: null
    };
  };

  try {
    const request = { headers: { authorization: 'Bearer token-valido' } };
    const result = await executeMiddleware(requireSession, request);

    assert.equal(result.nextCalled, true);
    assert.equal(result.nextError, undefined);
    assert.deepEqual(request.user, { id: USER_ID });
  } finally {
    supabase.auth.getUser = originalGetUser;
  }
});

test('un técnico no puede calificarse a sí mismo', async function () {
  const request = {
    body: { id_tecnico: USER_ID, calificacion: 5 },
    user: { id: USER_ID }
  };
  let nextError;

  await rateTechnician(request, {}, function next(error) {
    nextError = error;
  });

  assert.equal(nextError.statusCode, 403);
  assert.equal(nextError.message, 'No puedes calificar tu propio perfil técnico.');
  assert.equal(nextError.origin, 'src/api.js:rateTechnician');
});

test('un usuario autenticado puede calificar a otro técnico', { concurrency: false }, async function () {
  const originalRateTechnician = dataClient.rateTechnician;
  const response = createResponse();

  dataClient.rateTechnician = async function rateTechnicianStub(
    technicianId,
    raterUserId,
    rating
  ) {
    assert.equal(technicianId, OTHER_USER_ID);
    assert.equal(raterUserId, USER_ID);
    assert.equal(rating, 4);
    return { calificacion: 4, cant_calif: 1 };
  };

  try {
    await rateTechnician(
      {
        body: { id_tecnico: OTHER_USER_ID, calificacion: 4 },
        user: { id: USER_ID }
      },
      response,
      function next(error) {
        throw error;
      }
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      status: 200,
      message: 'todo bien',
      technician: { calificacion: 4, cant_calif: 1 }
    });
  } finally {
    dataClient.rateTechnician = originalRateTechnician;
  }
});
