import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateRouter, createTechnician } from '../src/api.js';
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

async function executeCreateTechnician(body) {
  const request = {
    body,
    user: { id: USER_ID }
  };
  const response = createResponse();
  let nextError;

  await createTechnician(request, response, function next(error) {
    nextError = error;
  });

  return { response, nextError };
}

function executeDeleteTechnician() {
  const router = createPrivateRouter();
  const request = {
    baseUrl: '/api',
    method: 'DELETE',
    originalUrl: '/api/technicians',
    url: '/technicians'
  };
  let nextCalled = false;
  let nextError;

  router.handle(request, {}, function next(error) {
    nextCalled = true;
    nextError = error;
  });

  return { nextCalled, nextError };
}

test('POST /api/technicians crea el perfil del usuario autenticado', { concurrency: false }, async function () {
  const originalCreateTechnician = dataClient.createTechnician;
  let receivedValues;

  dataClient.createTechnician = async function createTechnicianStub(
    userId,
    specialties,
    locations
  ) {
    receivedValues = { userId, specialties, locations };
  };

  try {
    const { response, nextError } = await executeCreateTechnician({
      especialidades: ['Electricista', 'Plomero'],
      ubicaciones: ['Panama', 'Herrera']
    });

    assert.equal(nextError, undefined);
    assert.deepEqual(receivedValues, {
      userId: USER_ID,
      specialties: ['Electricista', 'Plomero'],
      locations: ['Panama', 'Herrera']
    });
    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.body, {
      status: 201,
      message: 'todo bien',
      technician: {
        created: true,
        specialties: ['Electricista', 'Plomero'],
        locations: ['Panama', 'Herrera']
      }
    });
  } finally {
    dataClient.createTechnician = originalCreateTechnician;
  }
});

test('POST /api/technicians rechaza tipos incorrectos en las listas', async function () {
  const invalidBodies = [
    { especialidades: 'Electricista', ubicaciones: [] },
    { especialidades: [], ubicaciones: [123] }
  ];

  for (const body of invalidBodies) {
    const { nextError } = await executeCreateTechnician(body);

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.origin, 'src/api.js:validateCatalogList');
  }
});

test('POST /api/technicians rechaza una entrada de inyección SQL inválida', async function () {
  const { nextError } = await executeCreateTechnician({
    especialidades: ["' OR '1'='1; DROP TABLE tecnico; --"],
    ubicaciones: []
  });

  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.origin, 'src/api.js:validateCatalogList');
});

test('POST /api/technicians rechaza una entrada XSS', async function () {
  const { nextError } = await executeCreateTechnician({
    especialidades: ['<script>alert(1)</script>'],
    ubicaciones: []
  });

  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.origin, 'src/api.js:validateCatalogList');
});

test('DELETE /api/technicians no está registrado como endpoint privado', function () {
  const result = executeDeleteTechnician();

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
});
