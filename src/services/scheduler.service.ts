import { logger } from '../config/logger';
import { markOverdueInvoices } from './invoice.service';
import { sendAutomaticReminders } from './email.service';
import { markExpiredQuotations } from './quotation.service';

// Simple interval-based scheduler (no external dependency needed)
// For production, replace with Azure Function Timer or node-cron

let schedulerInterval: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (schedulerInterval) return;

  logger.info('⏰ Scheduler démarré — vérification toutes les heures');

  // Run immediately on start
  runDailyTasks();

  // Then every hour
  schedulerInterval = setInterval(() => {
    runDailyTasks();
  }, 60 * 60 * 1000);
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Scheduler arrêté');
  }
}

async function runDailyTasks(): Promise<void> {
  logger.info('⚙️  Exécution des tâches planifiées...');

  try {
    // 1. Detect overdue invoices
    const overdueCount = await markOverdueInvoices();
    if (overdueCount > 0) {
      logger.info(`✅ ${overdueCount} facture(s) marquée(s) EN RETARD`);
    }

    // 2. Expire quotations past validity date
    const expiredQuotations = await markExpiredQuotations();
    if (expiredQuotations > 0) {
      logger.info(`✅ ${expiredQuotations} devis marqué(s) EXPIRÉ(S)`);
    }

    // 3. Send automatic reminders
    const { sent, errors } = await sendAutomaticReminders();
    if (sent > 0 || errors > 0) {
      logger.info(`✅ Relances : ${sent} envoyée(s), ${errors} erreur(s)`);
    }
  } catch (err) {
    logger.error('❌ Erreur dans les tâches planifiées', { err });
  }
}
