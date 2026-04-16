const { EmailClient } = require('@azure/communication-email');

// Esta função é ativada pelo CosmosDB Change Feed
// Sempre que um documento na coleção "repairs" é alterado, esta função é invocada
module.exports = async function (context, documents) {
  if (!documents || documents.length === 0) {
    context.log('Nenhum documento para processar.');
    return;
  }

  const emailClient = new EmailClient(process.env.ACS_CONNECTION_STRING);

  for (const doc of documents) {
    context.log(`Reparação alterada: ${doc.id} -> Status: ${doc.status}`);

    // Só envia email se o cliente tiver email registado
    if (!doc.clientEmail) {
      context.log(`Reparação ${doc.id}: cliente sem email, a ignorar notificação.`);
      continue;
    }

    const statusLabels = {
      pending:     'Pendente',
      diagnosed:   'Diagnosticado',
      in_progress: 'Em Progresso',
      done:        'Concluído – pronto para levantamento',
      delivered:   'Entregue',
    };

    const statusLabel = statusLabels[doc.status] || doc.status;
    const lastNote = doc.history?.slice(-1)?.[0]?.note || '';

    const emailMessage = {
      senderAddress: process.env.ACS_SENDER_EMAIL,
      recipients: {
        to: [{ address: doc.clientEmail, displayName: doc.clientName }],
      },
      content: {
        subject: `[RepairFlow] Atualização da sua reparação – ${doc.equipment}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
            <h2 style="color:#1a73e8">🔧 RepairFlow</h2>
            <p>Olá <strong>${doc.clientName}</strong>,</p>
            <p>O estado da sua reparação foi atualizado:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:8px;background:#f8f9fa"><strong>Equipamento</strong></td><td style="padding:8px">${doc.equipment} ${doc.brand || ''} ${doc.model || ''}</td></tr>
              <tr><td style="padding:8px;background:#f8f9fa"><strong>Estado</strong></td><td style="padding:8px;color:#1a73e8"><strong>${statusLabel}</strong></td></tr>
              ${doc.budget ? `<tr><td style="padding:8px;background:#f8f9fa"><strong>Orçamento</strong></td><td style="padding:8px">${doc.budget}€</td></tr>` : ''}
              ${lastNote ? `<tr><td style="padding:8px;background:#f8f9fa"><strong>Nota</strong></td><td style="padding:8px">${lastNote}</td></tr>` : ''}
            </table>
            <p>Aceda ao RepairFlow para mais detalhes.</p>
            <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
            <p style="font-size:0.8rem;color:#999">RepairFlow – Gestão de Reparações Técnicas</p>
          </div>
        `,
      },
    };

    try {
      const poller = await emailClient.beginSend(emailMessage);
      await poller.pollUntilDone();
      context.log(`Email enviado para ${doc.clientEmail}`);
    } catch (err) {
      context.log.error(`Erro ao enviar email: ${err.message}`);
    }
  }
};
