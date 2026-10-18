import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateRouter, rateTechnician } from '../src/api.js';
import { dataClient } from '../src/data.client.js';

const RATER_USER_ID = '16a47b2d-3ca1-4fdb-8fe8-a1398f1a3d09';
const TECHNICIAN_ID = 'f15d6714-194a-45b0-9f35-4f28fcc4f761';

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

async function executeRateTechnician(body) {
  const request = {
    body,
    user: { id: RATER_USER_ID }
  };
  const response = createResponse();
  let nextError;

  await rateTechnician(request, response, function next(error) {
    nextError = error;
  });

  return { response, nextError };
}

function executePostRating() {
  const router = createPrivateRouter(function allowSession(_request, _response, next) {
    return next();
  });
  const request = {
    baseUrl: '/api',
    method: 'POST',
    originalUrl: '/api/technicians/rating',
    url: '/technicians/rating'
  };
  let nextCalled = false;
  let nextError;

  router.handle(request, {}, function next(error) {
    nextCalled = true;
    nextError = error;
  });

  return { nextCalled, nextError };
}

test('PATCH /api/technicians/rating registra una calificación válida', { concurrency: false }, async function () {
  const originalRateTechnician = dataClient.rateTechnician;

  dataClient.rateTechnician = async function rateTechnicianStub(
    technicianId,
    raterUserId,
    rating
  ) {
    assert.equal(technicianId, TECHNICIAN_ID);
    assert.equal(raterUserId, RATER_USER_ID);
    assert.equal(rating, 5);
    return { calificacion: 4.5, cant_calif: 2 };
  };

  try {
    const { response, nextError } = await executeRateTechnician({
      id_tecnico: TECHNICIAN_ID,
      calificacion: 5
    });

    assert.equal(nextError, undefined);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      status: 200,
      message: 'todo bien',
      technician: { calificacion: 4.5, cant_calif: 2 }
    });
  } finally {
    dataClient.rateTechnician = originalRateTechnician;
  }
});

test('PATCH /api/technicians/rating rechaza tipos y valores inválidos', async function () {
  const invalidBodies = [
    { id_tecnico: TECHNICIAN_ID, calificacion: '5' },
    { id_tecnico: TECHNICIAN_ID, calificacion: 2.5 },
    { id_tecnico: TECHNICIAN_ID, calificacion: 0 },
    { id_tecnico: TECHNICIAN_ID, calificacion: 6 }
  ];

  for (const body of invalidBodies) {
    const { nextError } = await executeRateTechnician(body);

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.message, 'calificacion debe ser un número entero entre 1 y 5.');
    assert.equal(nextError.origin, 'src/api.js:validateRating');
  }
});

test('PATCH /api/technicians/rating rechaza un UUID de inyección SQL', async function () {
  const { nextError } = await executeRateTechnician({
    id_tecnico: "' OR '1'='1",
    calificacion: 5
  });

  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.message, 'id debe ser un UUID válido.');
  assert.equal(nextError.origin, 'src/api.js:validateUserId');
});

test('PATCH /api/technicians/rating rechaza un UUID con XSS', async function () {
  const { nextError } = await executeRateTechnician({
    id_tecnico: '<script>alert(1)</script>',
    calificacion: 5
  });

  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.message, 'id debe ser un UUID válido.');
  assert.equal(nextError.origin, 'src/api.js:validateUserId');
});

test('PATCH /api/technicians/rating informa el límite de calificaciones', { concurrency: false }, async function () {
  const originalRateTechnician = dataClient.rateTechnician;
  const quotaError = new Error('Ya alcanzaste el máximo de tres calificaciones para este técnico.');

  quotaError.statusCode = 409;
  quotaError.origin = 'src/data.client.js:rateTechnician';
  dataClient.rateTechnician = async function rateTechnicianStub() {
    throw quotaError;
  };

  try {
    const { nextError } = await executeRateTechnician({
      id_tecnico: TECHNICIAN_ID,
      calificacion: 4
    });

    assert.equal(nextError, quotaError);
    assert.equal(nextError.statusCode, 409);
    assert.equal(nextError.origin, 'src/data.client.js:rateTechnician');
  } finally {
    dataClient.rateTechnician = originalRateTechnician;
  }
});

test('POST /api/technicians/rating no está registrado en lugar de PATCH', function () {
  const result = executePostRating();

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
});
