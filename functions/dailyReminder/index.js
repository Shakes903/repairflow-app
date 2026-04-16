const { CosmosClient } = require('@azure/cosmos');
const { EmailClient } = require('@azure/communication-email');

// Ativada todos os dias às 09:00 UTC
// Verifica reparações com status "done" há mais de 3 dias e envia lembrete
module.exports = async function (context, myTimer) {
  context.log('dailyReminder: a verificar equipamentos por levantar...');

  const cosmosClient = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY,
  });

  const container = cosmosClient
    .database(process.env.COSMOS_DB_NAME || 'repairflow')
    .container('repairs');

  // Busca reparações com status "done" há mais de 3 dias
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { resources: overdueRepairs } = await container.items
    .query({
      query: `SELECT * FROM c WHERE c.status = 'done' AND c.updatedAt <= @cutoff AND c.clientEmail != null`,
      parameters: [{ name: '@cutoff', value: threeDaysAgo }],
    })
    .fetchAll();

  context.log(`Encontradas ${overdueRepairs.length} reparações com equipamento por levantar.`);

  if (overdueRepairs.length === 0) return;

  const emailClient = new EmailClient(process.env.ACS_CONNECTION_STRING);

  for (const repair of overdueRepairs) {
    const daysWaiting = Math.floor((Date.now() - new Date(repair.updatedAt)) / (1000 * 60 * 60 * 24));

    const emailMessage = {
      senderAddress: process.env.ACS_SENDER_EMAIL,
      recipients: {
        to: [{ address: repair.clientEmail, displayName: repair.clientName }],
      },
      content: {
        subject: `[RepairFlow] Lembrete: o seu equipamento está pronto para levantamento`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
            <h2 style="color:#1a73e8">🔧 RepairFlow – Lembrete</h2>
            <p>Olá <strong>${repair.clientName}</strong>,</p>
            <p>Gostaríamos de lembrá-lo que o seu equipamento está pronto para levantamento há <strong>${daysWaiting} dia(s)</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:8px;background:#f8f9fa"><strong>Equipamento</strong></td><td style="padding:8px">${repair.equipment} ${repair.brand || ''} ${repair.model || ''}</td></tr>
              <tr><td style="padding:8px;background:#f8f9fa"><strong>Concluído em</strong></td><td style="padding:8px">${new Date(repair.updatedAt).toLocaleDateString('pt-PT')}</td></tr>
            </table>
            <p>Por favor dirija-se à loja para levantar o seu equipamento.</p>
            <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
            <p style="font-size:0.8rem;color:#999">RepairFlow – Gestão de Reparações Técnicas</p>
          </div>
        `,
      },
    };

    try {
      const poller = await emailClient.beginSend(emailMessage);
      await poller.pollUntilDone();
      context.log(`Lembrete enviado para ${repair.clientEmail} (${repair.id})`);
    } catch (err) {
      context.log.error(`Erro ao enviar lembrete para ${repair.clientEmail}: ${err.message}`);
    }
  }
};
