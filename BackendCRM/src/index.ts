import { crearServidor } from './server.js';
import { config } from './config.js';
import { cerrarPool } from './db/pool.js';

const app = await crearServidor();

// Fargate manda SIGTERM y espera. Sin esto, el proceso muere de golpe y las
// peticiones en vuelo se cortan a mitad — visible como 502 en cada despliegue.
for (const senal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(senal, async () => {
    app.log.info(`${senal} recibida, cerrando`);
    try {
      await app.close();
      await cerrarPool();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'fallo al cerrar');
      process.exit(1);
    }
  });
}

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  app.log.error({ err: error }, 'no pudo arrancar');
  process.exit(1);
}
