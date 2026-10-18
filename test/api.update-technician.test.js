import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateRouter, updateTechnician } from '../src/api.js';
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

async function executeUpdateTechnician(body) {
  const request = {
    body,
    user: { id: USER_ID }
  };
  const response = createResponse();
  let nextError;

  await updateTechnician(request, response, function next(error) {
    nextError = error;
  });

  return { response, nextError };
}

function executePutTechnician() {
  const router = createPrivateRouter(function allowSession(_request, _response, next) {
    return next();
  });
  const request = {
    baseUrl: '/api',
    method: 'PUT',
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

test('PATCH /api/technicians reemplaza especialidades y ubicaciones', { concurrency: false }, async function () {
  const originalUpdateTechnician = dataClient.updateTechnician;
  let receivedValues;
  const specialties = [
    { especialidad: 'Electricista', experiencia: 4 },
    { especialidad: 'Plomero', experiencia: 2 }
  ];
  const locations = ['Panama', 'Herrera'];

  dataClient.updateTechnician = async function updateTechnicianStub(
    userId,
    receivedSpecialties,
    receivedLocations
  ) {
    receivedValues = {
      userId,
      specialties: receivedSpecialties,
      locations: receivedLocations
    };
  };

  try {
    const { response, nextError } = await executeUpdateTechnician({
      especialidades: specialties,
      ubicaciones: locations
    });

    assert.equal(nextError, undefined);
    assert.deepEqual(receivedValues, {
      userId: USER_ID,
      specialties,
      locations
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      status: 200,
      message: 'todo bien',
      technician: {
        specialtiesUpdated: true,
        locationsUpdated: true
      }
    });
  } finally {
    dataClient.updateTechnician = originalUpdateTechnician;
  }
});

test('PATCH /api/technicians conserva ubicaciones cuando no se envían', { concurrency: false }, async function () {
  const originalUpdateTechnician = dataClient.updateTechnician;
  let receivedLocations;

  dataClient.updateTechnician = async function updateTechnicianStub(
    _userId,
    _specialties,
    locations
  ) {
    receivedLocations = locations;
  };

  try {
    const { response, nextError } = await executeUpdateTechnician({
      especialidades: [{ especialidad: 'Electricista', experiencia: 3 }]
    });

    assert.equal(nextError, undefined);
    assert.equal(receivedLocations, undefined);
    assert.deepEqual(response.body.technician, {
      specialtiesUpdated: true,
      locationsUpdated: false
    });
  } finally {
    dataClient.updateTechnician = originalUpdateTechnician;
  }
});

test('PATCH /api/technicians rechaza tipos incorrectos', async function () {
  const invalidBodies = [
    { especialidades: 'Electricista' },
    { especialidades: [{ especialidad: 'Electricista', experiencia: 'tres' }] },
    { ubicaciones: [123] }
  ];

  for (const body of invalidBodies) {
    const { nextError } = await executeUpdateTechnician(body);

    assert.equal(nextError.statusCode, 400);
  }
});

test('PATCH /api/technicians rechaza una entrada de inyección SQL inválida', async function () {
  const { nextError } = await executeUpdateTechnician({
    especialidades: [{
      especialidad: "' OR '1'='1; DROP TABLE tecnico; --",
      experiencia: 1
    }]
  });

  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.origin, 'src/api.js:validateTechnicianSpecialties');
});

test('PATCH /api/technicians rechaza una entrada XSS', async function () {
  const { nextError } = await executeUpdateTechnician({
    especialidades: [{
      especialidad: '<script>alert(1)</script>',
      experiencia: 1
    }]
  });

  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.origin, 'src/api.js:validateTechnicianSpecialties');
});

test('PATCH /api/technicians rechaza especialidades fuera del catálogo', async function () {
  const { nextError } = await executeUpdateTechnician({
    especialidades: [{ especialidad: 'Jardinero', experiencia: 1 }]
  });

  assert.equal(nextError.statusCode, 400);
  assert.equal(nextError.origin, 'src/api.js:validateTechnicianSpecialties');
});

test('PUT /api/technicians no está registrado en lugar de PATCH', function () {
  const result = executePutTechnician();

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
});
