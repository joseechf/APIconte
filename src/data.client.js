import {
  getPostgresPool,
  getSupabaseAdminClient,
  supabase
} from './config/supabase.js';

const MAX_RATING_COUNT = 2147483647;
const MAX_RATINGS_PER_USER = 3;

function preserveClientError(error, origin) {
  if (!error.message && Array.isArray(error.errors)) {
    error.message = error.errors
      .map(function (connectionError) {
        return connectionError.message;
      })
      .join('; ');
  }

  if (!error.origin) {
    error.origin = origin;
  }

  if (!error.statusCode) {
    if (error.code === '23505') {
      error.statusCode = 409;
    } else if (error.code === '23503' || error.code === '23514' || error.code === '22P02') {
      error.statusCode = 400;
    } else {
      error.statusCode = error.status ?? 500;
    }
  }

  return error;
}

export class DataClient {
  async createUser(credentials) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: {
            name: credentials.name,
            phone: credentials.phone
          }
        }
      });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error('Supabase no devolvió el usuario creado.');
      }

      return data;
    } catch (error) {
      throw preserveClientError(error, 'src/data.client.js:createUser');
    }
  }

  async getUser(userId) {
    try {
      const admin = getSupabaseAdminClient();
      const { data, error } = await admin.auth.admin.getUserById(userId);

      if (error) {
        throw error;
      }

      return data.user;
    } catch (error) {
      throw preserveClientError(error, 'src/data.client.js:getUser');
    }
  }

  async updateUser(userId, attributes) {
    try {
      const admin = getSupabaseAdminClient();
      const { data, error } = await admin.auth.admin.updateUserById(userId, attributes);

      if (error) {
        throw error;
      }

      return data.user;
    } catch (error) {
      throw preserveClientError(error, 'src/data.client.js:updateUser');
    }
  }

  async deleteUser(userId) {
    try {
      const admin = getSupabaseAdminClient();
      const { error } = await admin.auth.admin.deleteUser(userId, false);

      if (error) {
        throw error;
      }
    } catch (error) {
      throw preserveClientError(error, 'src/data.client.js:deleteUser');
    }
  }

  async getAllTechnicians() {
    try {
      const pool = getPostgresPool();
      const { rows } = await pool.query(`
        select
          tecnico.calificacion::float8 as calificacion,
          coalesce(
            (
              select json_agg(
                json_build_object(
                  'especialidad', trabajo.id_especialidad,
                  'experiencia', trabajo.experiencia
                )
                order by trabajo.id_especialidad
              )
              from public.tecnico_trabajo as trabajo
              where trabajo.id_tecnico = tecnico.id_tecnico
            ),
            '[]'::json
          ) as especialidades,
          coalesce(
            (
              select json_agg(ubicacion.provincia order by ubicacion.provincia)
              from public.tecnico_ubicacion as ubicacion
              where ubicacion.id_tecnico = tecnico.id_tecnico
            ),
            '[]'::json
          ) as ubicaciones
        from public.tecnico as tecnico
        order by tecnico.calificacion desc, tecnico.id_tecnico
      `);

      return rows;
    } catch (error) {
      throw preserveClientError(error, 'src/data.client.js:getAllTechnicians');
    }
  }

  async createTechnician(userId, specialties, locations) {
    const pool = getPostgresPool();
    let connection;

    try {
      connection = await pool.connect();
      await connection.query('BEGIN');
      await connection.query(
        'insert into public.tecnico (id_tecnico) values ($1)',
        [userId]
      );

      if (specialties.length > 0) {
        await connection.query(
          `insert into public.tecnico_trabajo (id_tecnico, id_especialidad)
           select $1, item.especialidad
           from unnest($2::varchar(20)[]) as item(especialidad)`,
          [userId, specialties]
        );
      }

      if (locations.length > 0) {
        await connection.query(
          `insert into public.tecnico_ubicacion (id_tecnico, provincia)
           select $1, item.provincia
           from unnest($2::varchar(20)[]) as item(provincia)`,
          [userId, locations]
        );
      }

      await connection.query('COMMIT');
    } catch (error) {
      if (connection) {
        try {
          await connection.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('[src/data.client.js:createTechnician rollback]', rollbackError);
        }
      }

      throw preserveClientError(error, 'src/data.client.js:createTechnician');
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  async updateTechnician(userId, specialties, locations) {
    const pool = getPostgresPool();
    let connection;

    try {
      connection = await pool.connect();
      await connection.query('BEGIN');
      const technician = await connection.query(
        'select id_tecnico from public.tecnico where id_tecnico = $1 for update',
        [userId]
      );

      if (technician.rowCount === 0) {
        const error = new Error('El usuario no tiene un perfil técnico.');
        error.statusCode = 404;
        error.origin = 'src/data.client.js:updateTechnician';
        throw error;
      }

      if (specialties !== undefined) {
        await connection.query(
          'delete from public.tecnico_trabajo where id_tecnico = $1',
          [userId]
        );

        if (specialties.length > 0) {
          const specialtyNames = specialties.map(function (specialty) {
            return specialty.especialidad;
          });
          const experienceYears = specialties.map(function (specialty) {
            return specialty.experiencia;
          });

          await connection.query(
            `insert into public.tecnico_trabajo (id_tecnico, id_especialidad, experiencia)
             select $1, item.especialidad, item.experiencia
             from unnest($2::varchar(20)[], $3::integer[])
               as item(especialidad, experiencia)`,
            [userId, specialtyNames, experienceYears]
          );
        }
      }

      if (locations !== undefined) {
        await connection.query(
          'delete from public.tecnico_ubicacion where id_tecnico = $1',
          [userId]
        );

        if (locations.length > 0) {
          await connection.query(
            `insert into public.tecnico_ubicacion (id_tecnico, provincia)
             select $1, item.provincia
             from unnest($2::varchar(20)[]) as item(provincia)`,
            [userId, locations]
          );
        }
      }

      await connection.query('COMMIT');
    } catch (error) {
      if (connection) {
        try {
          await connection.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('[src/data.client.js:updateTechnician rollback]', rollbackError);
        }
      }

      throw preserveClientError(error, 'src/data.client.js:updateTechnician');
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  async rateTechnician(technicianId, raterUserId, rating) {
    const pool = getPostgresPool();
    let connection;

    try {
      connection = await pool.connect();
      await connection.query('BEGIN');
      const technicianResult = await connection.query(
        `select calificacion::float8 as calificacion, cant_calif
         from public.tecnico
         where id_tecnico = $1
         for update`,
        [technicianId]
      );

      if (technicianResult.rowCount === 0) {
        const error = new Error('El usuario no tiene un perfil técnico.');
        error.statusCode = 404;
        error.origin = 'src/data.client.js:rateTechnician';
        throw error;
      }

      const technician = technicianResult.rows[0];

      if (technician.cant_calif >= MAX_RATING_COUNT) {
        const error = new Error('El técnico alcanzó el máximo de calificaciones permitidas.');
        error.statusCode = 409;
        error.origin = 'src/data.client.js:rateTechnician';
        throw error;
      }

      const ratingMetadataResult = await connection.query(
        `select cantidad_calificaciones
         from public.metadata_calificacion
         where id_usuario = $1 and id_tecnico = $2
         for update`,
        [raterUserId, technicianId]
      );
      const ratingMetadata = ratingMetadataResult.rows[0];

      if (
        ratingMetadata &&
        ratingMetadata.cantidad_calificaciones >= MAX_RATINGS_PER_USER
      ) {
        const error = new Error('Ya alcanzaste el máximo de tres calificaciones para este técnico.');
        error.statusCode = 409;
        error.origin = 'src/data.client.js:rateTechnician';
        throw error;
      }

      const ratingCount = technician.cant_calif + 1;
      const averageRating = Math.round(
        ((technician.calificacion * technician.cant_calif + rating) / ratingCount) * 100
      ) / 100;
      const updatedTechnician = await connection.query(
        `update public.tecnico
         set calificacion = $2, cant_calif = $3
         where id_tecnico = $1
         returning calificacion::float8 as calificacion, cant_calif`,
        [technicianId, averageRating, ratingCount]
      );

      if (ratingMetadata) {
        await connection.query(
          `update public.metadata_calificacion
           set cantidad_calificaciones = $3
           where id_usuario = $1 and id_tecnico = $2`,
          [
            raterUserId,
            technicianId,
            ratingMetadata.cantidad_calificaciones + 1
          ]
        );
      } else {
        await connection.query(
          `insert into public.metadata_calificacion
             (id_usuario, id_tecnico, cantidad_calificaciones)
           values ($1, $2, $3)`,
          [raterUserId, technicianId, 1]
        );
      }

      await connection.query('COMMIT');
      return updatedTechnician.rows[0];
    } catch (error) {
      if (connection) {
        try {
          await connection.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('[src/data.client.js:rateTechnician rollback]', rollbackError);
        }
      }

      throw preserveClientError(error, 'src/data.client.js:rateTechnician');
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
}

export const dataClient = new DataClient();
