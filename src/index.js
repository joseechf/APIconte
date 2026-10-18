import 'dotenv/config';
import express from 'express';
// agregado por graciela, CORS
import cors from 'cors';
// listo
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabase } from './config/supabase.js';
import { createPrivateRouter, createPublicRouter } from './api.js';

//editado por graciela, CORS
/*const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.json());
app.use('/api', createPublicRouter());*/

//agregado por graciela para reemplazar lo de arriba
const app = express();
const port = process.env.PORT ?? 3000;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://192.168.60.11:5173'
  ],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use('/api', createPublicRouter());
//listo

export async function requireSession(request, response, next) {
  try {
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      const error = new Error('Se requiere un token Bearer.');
      error.statusCode = 401;
      error.origin = 'src/index.js:requireSession';
      throw error;
    }

    const token = authorization.slice('Bearer '.length);
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      const sessionError = new Error(error?.message ?? 'El token de sesión no es válido.');
      sessionError.statusCode = 401;
      sessionError.origin = 'Supabase Auth:getUser';
      throw sessionError;
    }
    console.log('token verificado')
    request.user = data.user;
    return next();
  } catch (error) {
    return next(error);
  }
}

// Solo las rutas montadas después de este punto requieren una sesión válida.
app.use('/api', requireSession, createPrivateRouter());

function health(_request, response) {
  // La instancia se importa para validar que las credenciales estén configuradas.
  void supabase;
  return response.status(200).json({
    status: 200,
    message: 'todo bien'
  });
}

app.get('/health', health);

function notFound(request, response) {
  return response.status(404).json({
    status: 404,
    message: `Ruta no encontrada: ${request.method} ${request.path}`,
    origin: 'src/index.js:notFound'
  });
}

app.use(notFound);

function errorHandler(error, _request, response, _next) {
  console.error(`[${error.origin ?? 'src/index.js:errorHandler'}]`, error);
  const status = error.statusCode ?? 500;
  return response.status(status).json({
    status,
    message: error.message ?? 'Error interno del servidor.',
    origin: error.origin ?? 'src/index.js:errorHandler'
  });
}

app.use(errorHandler);

function startServer() {
  console.log(`API disponible en http://localhost:${port}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(port, startServer);
}
