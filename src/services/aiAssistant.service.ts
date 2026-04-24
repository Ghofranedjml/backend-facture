export type DocumentType = 'INVOICE' | 'QUOTE';

export interface AIAssistantInput {
  documentType: DocumentType;
  data: {
    client: {
      id?: string;
      name: string;
      email?: string | null;
      taxId?: string | null;
      type?: 'PRO' | 'INDIVIDUAL';
    };
    items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    amounts: {
      ht: number;
      tva: number;
      ttc: number;
    };
    dates: {
      createdAt: string;
      dueDate?: string;
      validUntil?: string;
    };
    status: string;
  };
}

export interface Anomaly {
  type: 'FINANCIAL' | 'BUSINESS' | 'LOGIC';
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface AIAssistantOutput {
  summary: string;
  anomalies: Anomaly[];
  suggestions: string[];
  confidence: number;
}

export class AIAssistant {
  static analyze(input: AIAssistantInput): AIAssistantOutput {
    const anomalies: Anomaly[] = [];
    const suggestions: string[] = [];

    this.detectFinancialAnomalies(input, anomalies, suggestions);
    this.detectBusinessAnomalies(input, anomalies, suggestions);
    this.detectLogicalAnomalies(input, anomalies, suggestions);

    return {
      summary: this.generateSummary(input),
      anomalies,
      suggestions: Array.from(new Set(suggestions)),
      confidence: this.calculateConfidence(anomalies),
    };
  }

  private static detectFinancialAnomalies(
    input: AIAssistantInput,
    anomalies: Anomaly[],
    suggestions: string[],
  ): void {
    const { amounts, items } = input.data;

    if (amounts.ht < 0) {
      anomalies.push({ type: 'FINANCIAL', message: 'Montant HT negatif detecte', severity: 'HIGH' });
      suggestions.push('Verifier les prix unitaires et quantites des lignes');
    }

    if (amounts.tva < 0) {
      anomalies.push({ type: 'FINANCIAL', message: 'Montant TVA negatif detecte', severity: 'HIGH' });
      suggestions.push('Revoir le calcul de la TVA');
    }

    if (amounts.ttc < 0) {
      anomalies.push({ type: 'FINANCIAL', message: 'Montant TTC negatif detecte', severity: 'HIGH' });
      suggestions.push('Verifier la coherence HT + TVA - RAS');
    }

    const calculatedHT = items.reduce((sum, item) => sum + item.total, 0);
    if (Math.abs(calculatedHT - amounts.ht) > 0.01) {
      anomalies.push({
        type: 'FINANCIAL',
        message: `Incoherence: total HT calcule (${calculatedHT.toFixed(3)}) != HT declare (${amounts.ht.toFixed(3)})`,
        severity: 'HIGH',
      });
      suggestions.push('Recalculer automatiquement le HT a partir des lignes');
    }

    const tvaRate = amounts.ht > 0 ? (amounts.tva / amounts.ht) * 100 : 0;
    if (tvaRate > 30) {
      anomalies.push({
        type: 'FINANCIAL',
        message: `Taux TVA anormalement eleve: ${tvaRate.toFixed(2)}%`,
        severity: 'MEDIUM',
      });
      suggestions.push('Verifier le taux de TVA applique');
    }

    if (amounts.ht === 0 && items.length > 0) {
      anomalies.push({
        type: 'FINANCIAL',
        message: 'HT a zero mais des lignes de facture existent',
        severity: 'MEDIUM',
      });
      suggestions.push('Verifier que les montants des lignes sont corrects');
    }
  }

  private static detectBusinessAnomalies(
    input: AIAssistantInput,
    anomalies: Anomaly[],
    suggestions: string[],
  ): void {
    const { client, dates, status } = input.data;
    const { documentType } = input;

    if (!client.name || client.name.trim() === '') {
      anomalies.push({ type: 'BUSINESS', message: 'Client sans nom', severity: 'HIGH' });
      suggestions.push('Ajouter le nom du client');
    }

    if (!client.email) {
      anomalies.push({ type: 'BUSINESS', message: 'Client sans adresse email', severity: 'MEDIUM' });
      suggestions.push('Ajouter un email pour pouvoir envoyer le document');
    }

    if (client.type === 'PRO' && !client.taxId && documentType === 'INVOICE') {
      anomalies.push({
        type: 'BUSINESS',
        message: 'Client professionnel sans matricule fiscal',
        severity: 'MEDIUM',
      });
      suggestions.push('Ajouter le matricule fiscal pour la conformite legale');
    }

    if (documentType === 'QUOTE' && dates.validUntil) {
      const validUntil = new Date(dates.validUntil);
      const today = new Date();

      if (validUntil < today && status !== 'CONVERTED' && status !== 'REFUSED') {
        anomalies.push({
          type: 'BUSINESS',
          message: `Devis expire depuis le ${validUntil.toLocaleDateString()}`,
          severity: 'HIGH',
        });
        suggestions.push('Prolonger la validite du devis ou en creer un nouveau');
      } else if (validUntil < today) {
        const daysDiff = Math.ceil((today.getTime() - validUntil.getTime()) / (1000 * 3600 * 24));
        anomalies.push({
          type: 'BUSINESS',
          message: `Devis expire depuis ${daysDiff} jours`,
          severity: 'MEDIUM',
        });
        suggestions.push('Relancer le client ou proposer une prolongation');
      }
    }

    if (documentType === 'INVOICE' && dates.dueDate && status !== 'PAID') {
      const dueDate = new Date(dates.dueDate);
      const today = new Date();

      if (dueDate < today) {
        const daysOverdue = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 3600 * 24));
        anomalies.push({
          type: 'BUSINESS',
          message: `Facture en retard de paiement: ${daysOverdue} jours`,
          severity: 'HIGH',
        });
        suggestions.push(`Envoyer une relance au client (${daysOverdue} jours de retard)`);
      } else {
        const inSevenDays = new Date(today);
        inSevenDays.setDate(inSevenDays.getDate() + 7);
        if (dueDate < inSevenDays) {
          anomalies.push({
            type: 'BUSINESS',
            message: "Facture proche de son echeance (moins de 7 jours)",
            severity: 'LOW',
          });
          suggestions.push("Envoyer un rappel d'echeance au client");
        }
      }
    }
  }

  private static detectLogicalAnomalies(
    input: AIAssistantInput,
    anomalies: Anomaly[],
    suggestions: string[],
  ): void {
    const { amounts, items, status, dates } = input.data;
    const { documentType } = input;

    if (documentType === 'INVOICE' && status === 'PAID' && !dates.dueDate) {
      anomalies.push({
        type: 'LOGIC',
        message: 'Facture marquee payee mais sans date de paiement',
        severity: 'MEDIUM',
      });
      suggestions.push('Ajouter la date de paiement');
    }

    if (amounts.ttc === 0 && items.length > 0) {
      anomalies.push({
        type: 'LOGIC',
        message: 'Total TTC a zero avec des lignes de facture',
        severity: 'MEDIUM',
      });
      suggestions.push('Verifier que les prix unitaires et quantites sont corrects');
    }

    if (documentType === 'QUOTE' && status === 'CONVERTED') {
      anomalies.push({
        type: 'LOGIC',
        message: "Devis marque converti, verifier qu'une facture a bien ete creee",
        severity: 'LOW',
      });
    }

    if (documentType === 'INVOICE' && amounts.tva === 0 && amounts.ht > 0 && status === 'ISSUED') {
      anomalies.push({
        type: 'LOGIC',
        message: 'Facture emise avec TVA a zero - verifier si export ou exoneration',
        severity: 'LOW',
      });
      suggestions.push("Confirmer que l'exoneration de TVA est justifiee");
    }

    for (const item of items) {
      if (item.quantity > 10000) {
        anomalies.push({
          type: 'LOGIC',
          message: `Quantite anormalement elevee: ${item.quantity} x ${item.description}`,
          severity: 'LOW',
        });
        suggestions.push('Verifier la coherence des quantites');
        break;
      }
    }
  }

  private static generateSummary(input: AIAssistantInput): string {
    const { documentType, data } = input;
    const { client, amounts, status, dates } = data;

    const typeLabel = documentType === 'INVOICE' ? 'Facture' : 'Devis';
    const statusLabels: Record<string, string> = {
      DRAFT: 'brouillon',
      ISSUED: 'emise',
      SENT: 'envoye',
      PAID: 'payee',
      OVERDUE: 'en retard',
      ACCEPTED: 'accepte',
      REFUSED: 'refuse',
      CONVERTED: 'converti',
      EXPIRED: 'expire',
    };

    const statusText = statusLabels[status] ?? status.toLowerCase();
    const dateLabel = documentType === 'INVOICE' ? 'echeance' : 'validite';
    const dateValue = documentType === 'INVOICE' ? dates.dueDate : dates.validUntil;

    let summary = `${typeLabel} ${statusText} pour ${client.name} d'un montant de ${amounts.ttc.toFixed(3)} TND`;

    if (dateValue) {
      const date = new Date(dateValue);
      summary += ` (${dateLabel}: ${date.toLocaleDateString()})`;
    }

    if (amounts.tva > 0 && amounts.ht > 0) {
      const tvaRate = (amounts.tva / amounts.ht) * 100;
      summary += ` - TVA ${tvaRate.toFixed(0)}%`;
    }

    return summary;
  }

  private static calculateConfidence(anomalies: Anomaly[]): number {
    if (anomalies.length === 0) return 100;

    let penalty = 0;
    for (const anomaly of anomalies) {
      switch (anomaly.severity) {
        case 'HIGH':
          penalty += 30;
          break;
        case 'MEDIUM':
          penalty += 15;
          break;
        case 'LOW':
          penalty += 5;
          break;
        default:
          break;
      }
    }

    return Math.max(0, Math.min(100, 100 - penalty));
  }
}
