import { Router } from 'express';
import { dataClient } from './data.client.js';

const MAX_EMAIL_LENGTH = 255;
const MAX_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const MAX_PHONE_LENGTH = 15;
const MAX_CATALOG_VALUE_LENGTH = 20;
const MAX_EXPERIENCE = 2147483647;
const MIN_RATING = 1;
const MAX_RATING = 5;
const VALID_PROVINCES = new Set([
  "Bocas del Toro",
  "Coclé",
  "Colón",
  "Chiriquí",
  "Darién",
  "Herrera",
  "Los Santos",
  "Panamá",
  "Panamá Oeste",
  "Veraguas",
  "Panama",
  "Cocle",
  "Darien",
]);
const VALID_SPECIALTIES = new Set([
  'Refrigeración',
  'Soldador',
  'Electricista',
  'Plomero',
  'Albañil',
  'Pintor',
  'Mecánico',
  'Herrero',
  'Ebanista',
  'Carpintero',
  'Vidriero'
]);

function createAppError(message, statusCode, origin) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.origin = origin;
  return error;
}

function preserveError(error, origin, fallbackStatusCode) {
  if (!error.origin) {
    error.origin = origin;
  }

  if (!error.statusCode) {
    error.statusCode = error.status ?? fallbackStatusCode;
  }

  return error;
}

function validateCredentials(credentials) {
  validateRequestBody(credentials);

  if (!credentials.email || !credentials.name || !credentials.phone || !credentials.password) {
    throw createAppError(
      'email, name, phone y password son obligatorios.',
      400,
      'src/api.js:validateCredentials'
    );
  }

  return {
    email: validateEmail(credentials.email),
    name: validateName(credentials.name),
    phone: validatePhone(credentials.phone),
    password: validatePassword(credentials.password)
  };
}

function validateRequestBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createAppError(
      'El cuerpo de la solicitud debe ser un objeto JSON.',
      400,
      'src/api.js:validateRequestBody'
    );
  }
}

function validateEmail(email) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (
    normalizedEmail.length === 0 ||
    normalizedEmail.length > MAX_EMAIL_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    throw createAppError('email no es válido.', 400, 'src/api.js:validateEmail');
  }

  return normalizedEmail;
}

function validateName(name) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';

  if (
    normalizedName.length === 0 ||
    normalizedName.length > MAX_NAME_LENGTH ||
    /[<>]/.test(normalizedName)
  ) {
    throw createAppError('name no es válido.', 400, 'src/api.js:validateName');
  }

  return normalizedName;
}

function validatePhone(phone) {
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';

  if (
    normalizedPhone.length > MAX_PHONE_LENGTH ||
    !/^\+?[0-9]{8,15}$/.test(normalizedPhone)
  ) {
    throw createAppError(
      'phone debe contener entre 8 y 15 dígitos; puede iniciar con +.',
      400,
      'src/api.js:validatePhone'
    );
  }

  return normalizedPhone;
}

function validatePassword(password) {
  if (
    typeof password !== 'string' ||
    password.length < MIN_PASSWORD_LENGTH ||
    Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES
  ) {
    throw createAppError(
      'password debe tener entre 8 y 72 bytes.',
      400,
      'src/api.js:validatePassword'
    );
  }

  return password;
}

function validateUserId(userId) {
  if (
    typeof userId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
  ) {
    throw createAppError('id debe ser un UUID válido.', 400, 'src/api.js:validateUserId');
  }

  return userId;
}

function validateCatalogList(values, fieldName, allowedValues) {
  if (values === undefined) {
    return [];
  }

  if (!Array.isArray(values)) {
    throw createAppError(
      `${fieldName} debe ser una lista.`,
      400,
      'src/api.js:validateCatalogList'
    );
  }

  const uniqueValues = new Set();
  const normalizedValues = [];

  for (const value of values) {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';

    if (
      normalizedValue.length === 0 ||
      normalizedValue.length > MAX_CATALOG_VALUE_LENGTH ||
      /[<>]/.test(normalizedValue)
    ) {
      throw createAppError(
        `Cada valor de ${fieldName} debe ser texto no vacío de máximo 20 caracteres.`,
        400,
        'src/api.js:validateCatalogList'
      );
    }

    if (allowedValues && !allowedValues.has(normalizedValue)) {
      throw createAppError(
        `${normalizedValue} no es un valor permitido para ${fieldName}.`,
        400,
        'src/api.js:validateCatalogList'
      );
    }

    if (uniqueValues.has(normalizedValue)) {
      throw createAppError(
        `${fieldName} no puede contener valores duplicados.`,
        400,
        'src/api.js:validateCatalogList'
      );
    }

    uniqueValues.add(normalizedValue);
    normalizedValues.push(normalizedValue);
  }

  return normalizedValues;
}

function validateTechnicianSpecialties(specialties) {
  if (!Array.isArray(specialties)) {
    throw createAppError(
      'especialidades debe ser una lista.',
      400,
      'src/api.js:validateTechnicianSpecialties'
    );
  }

  const uniqueSpecialties = new Set();
  const normalizedSpecialties = [];

  for (const specialty of specialties) {
    if (!specialty || typeof specialty !== 'object' || Array.isArray(specialty)) {
      throw createAppError(
        'Cada especialidad debe ser un objeto.',
        400,
        'src/api.js:validateTechnicianSpecialties'
      );
    }

    const name = typeof specialty.especialidad === 'string'
      ? specialty.especialidad.trim()
      : '';
    const experience = specialty.experiencia;

    if (
      name.length === 0 ||
      name.length > MAX_CATALOG_VALUE_LENGTH ||
      /[<>]/.test(name)
    ) {
      throw createAppError(
        'Cada especialidad debe tener texto no vacío de máximo 20 caracteres.',
        400,
        'src/api.js:validateTechnicianSpecialties'
      );
    }

    if (!VALID_SPECIALTIES.has(name)) {
      throw createAppError(
        `${name} no es una especialidad permitida.`,
        400,
        'src/api.js:validateTechnicianSpecialties'
      );
    }

    if (!Number.isInteger(experience) || experience < 0 || experience > MAX_EXPERIENCE) {
      throw createAppError(
        'La experiencia debe ser un entero entre 0 y 2147483647.',
        400,
        'src/api.js:validateTechnicianSpecialties'
      );
    }

    if (uniqueSpecialties.has(name)) {
      throw createAppError(
        'especialidades no puede contener valores duplicados.',
        400,
        'src/api.js:validateTechnicianSpecialties'
      );
    }

    uniqueSpecialties.add(name);
    normalizedSpecialties.push({
      especialidad: name,
      experiencia: experience
    });
  }

  return normalizedSpecialties;
}

function validateRating(rating) {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    throw createAppError(
      'calificacion debe ser un número entero entre 1 y 5.',
      400,
      'src/api.js:validateRating'
    );
  }

  return rating;
}

export async function createUser(request, response, next) {
  console.log('creando usuario')
  try {
    validateRequestBody(request.body);
    const credentials = validateCredentials(request.body);
    const data = await dataClient.createUser(credentials);
    console.log('todo bien...')
    return response.status(201).json({
      status: 201,
      message: 'todo bien',
      user: data.user,
      session: data.session
    });
  } catch (error) {
    console.log(error)
    return next(preserveError(error, 'src/api.js:createUser', 500));
  }
}

export async function createTechnician(request, response, next) {
  try {
    validateRequestBody(request.body);
    const userId = validateUserId(request.user?.id);
    const specialties = validateCatalogList(
      request.body.especialidades,
      'especialidades',
      VALID_SPECIALTIES
    );
    const locations = validateCatalogList(
      request.body.ubicaciones,
      'ubicaciones',
      VALID_PROVINCES
    );
    await dataClient.createTechnician(userId, specialties, locations);

    return response.status(201).json({
      status: 201,
      message: 'todo bien',
      technician: {
        created: true,
        specialties,
        locations
      }
    });
  } catch (error) {
    return next(preserveError(error, 'src/api.js:createTechnician', 500));
  }
}

export async function getAllTechnicians(_request, response, next) {
  try {
    const technicians = await dataClient.getAllTechnicians();
    return response.status(200).json({
      status: 200,
      message: 'todo bien',
      technicians
    });
  } catch (error) {
    return next(preserveError(error, 'src/api.js:getAllTechnicians', 500));
  }
}

export async function updateTechnician(request, response, next) {
  try {
    validateRequestBody(request.body);
    const userId = validateUserId(request.user?.id);
    let specialties;
    let locations;

    if (request.body.especialidades !== undefined) {
      specialties = validateTechnicianSpecialties(request.body.especialidades);
    }

    if (request.body.ubicaciones !== undefined) {
      locations = validateCatalogList(
        request.body.ubicaciones,
        'ubicaciones',
        VALID_PROVINCES
      );
    }

    if (specialties === undefined && locations === undefined) {
      throw createAppError(
        'Proporciona al menos especialidades o ubicaciones para actualizar.',
        400,
        'src/api.js:updateTechnician'
      );
    }

    await dataClient.updateTechnician(userId, specialties, locations);
    return response.status(200).json({
      status: 200,
      message: 'todo bien',
      technician: {
        specialtiesUpdated: specialties !== undefined,
        locationsUpdated: locations !== undefined
      }
    });
  } catch (error) {
    return next(preserveError(error, 'src/api.js:updateTechnician', 500));
  }
}

export async function rateTechnician(request, response, next) {
  try {
    validateRequestBody(request.body);
    const userId = validateUserId(request.user?.id);
    const technicianId = validateUserId(request.body.id_tecnico);

    if (userId === technicianId) {
      throw createAppError(
        'No puedes calificar tu propio perfil técnico.',
        403,
        'src/api.js:rateTechnician'
      );
    }

    const rating = validateRating(request.body.calificacion);
    const technician = await dataClient.rateTechnician(technicianId, userId, rating);
    return response.status(200).json({
      status: 200,
      message: 'todo bien',
      technician
    });
  } catch (error) {
    return next(preserveError(error, 'src/api.js:rateTechnician', 500));
  }
}

export async function getUser(request, response, next) {
  try {
    const userId = validateUserId(request.user?.id);
    const user = await dataClient.getUserWithTechnicianData(userId);
    return response.status(200).json({
      status: 200,
      message: 'todo bien',
      user
    });
  } catch (error) {
    return next(preserveError(error, 'src/api.js:getUser', 500));
  }
}

export async function updateUser(request, response, next) {
  try {
    validateRequestBody(request.body);
    const userId = validateUserId(request.user?.id);
    const attributes = {};
    const userMetadata = {};

    if (request.body.email !== undefined) {
      attributes.email = validateEmail(request.body.email);
    }

    if (request.body.password !== undefined) {
      attributes.password = validatePassword(request.body.password);
    }

    if (request.body.name !== undefined) {
      userMetadata.name = validateName(request.body.name);
    }

    if (request.body.phone !== undefined) {
      userMetadata.phone = validatePhone(request.body.phone);
    }

    if (Object.keys(userMetadata).length > 0) {
      attributes.user_metadata = userMetadata;
    }

    if (Object.keys(attributes).length === 0) {
      throw createAppError(
        'Proporciona al menos email, name, phone o password para actualizar.',
        400,
        'src/api.js:updateUser'
      );
    }

    const user = await dataClient.updateUser(userId, attributes);
    return response.status(200).json({
      status: 200,
      message: 'todo bien',
      user
    });
  } catch (error) {
    return next(preserveError(error, 'src/api.js:updateUser', 500));
  }
}

export async function deleteUser(request, response, next) {
  try {
    const userId = validateUserId(request.user?.id);
    await dataClient.deleteUser(userId);

    return response.status(200).json({
      status: 200,
      message: 'todo bien'
    });
  } catch (error) {
    return next(preserveError(error, 'src/api.js:deleteUser', 500));
  }
}

export function createPublicRouter() {
  const router = Router();

  router.post('/users', createUser);
  router.get('/technicians', getAllTechnicians);

  return router;
}

export function createPrivateRouter() {
  const router = Router();

  router.get('/users', getUser);
  router.patch('/users', updateUser);
  router.delete('/users', deleteUser);
  router.post('/technicians', createTechnician);
  router.patch('/technicians', updateTechnician);
  router.patch('/technicians/rating', rateTechnician);

  return router;
}
