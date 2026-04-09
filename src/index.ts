import app from './app';
import { config } from './config/env';
import { logger } from './config/logger';
import prisma from './config/prisma';
import { startScheduler, stopScheduler } from './services/scheduler.service';

async function bootstrap(): Promise<void> {
  try {
    // Vérifier la connexion BDD avant de démarrer
    await prisma.$connect();
    logger.info('✅ PostgreSQL connecté');

    const server = app.listen(config.PORT, () => {
      logger.info(`🚀 E-Tafakna Billing API démarrée`);
      logger.info(`   → http://localhost:${config.PORT}${config.API_PREFIX}`);
      logger.info(`   → Environnement : ${config.NODE_ENV}`);
      if (config.NODE_ENV !== 'test') {
      startScheduler();
    }
    });

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} reçu — arrêt propre en cours...`);
      stopScheduler();      
      server.close(async () => {
        await prisma.$disconnect();
        logger.info('PostgreSQL déconnecté. Au revoir.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('❌ Erreur au démarrage', { error });
    await prisma.$disconnect();
    process.exit(1);
  }
}

bootstrap();
