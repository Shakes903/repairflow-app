const { BlobServiceClient } = require('@azure/storage-blob');
const { EmailClient } = require('@azure/communication-email');

module.exports = async function (context, documents) {
  if (!documents || documents.length === 0) return;

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  );
  const emailClient = new EmailClient(process.env.ACS_CONNECTION_STRING);
  const containerClient = blobServiceClient.getContainerClient('repair-reports');

  for (const doc of documents) {
    if (doc.status !== 'done') continue;
    if (!doc.clientEmail) continue;

    const reportDate = new Date().toLocaleDateString('pt-PT');
    const completedDate = doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString('pt-PT') : reportDate;

    const beforePhotos = (doc.photos && doc.photos.before) ? doc.photos.before : [];
    const afterPhotos = (doc.photos && doc.photos.after) ? doc.photos.after : [];

    const photosHtml = (beforePhotos.length > 0 || afterPhotos.length > 0) ? `
      <h2 style="color:#1a73e8;margin-top:24px">Fotografias</h2>
      ${beforePhotos.length > 0 ? `<p><strong>Antes da reparação:</strong></p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">${beforePhotos.map(url => `<img src="${url}" style="max-width:300px;border-radius:8px;border:1px solid #ddd"/>`).join('')}</div>` : ''}
      ${afterPhotos.length > 0 ? `<p style="margin-top:12px"><strong>Após a reparação:</strong></p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">${afterPhotos.map(url => `<img src="${url}" style="max-width:300px;border-radius:8px;border:1px solid #ddd"/>`).join('')}</div>` : ''}
    ` : '';

    const htmlContent = `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><title>Relatório de Reparação</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; color: #333; }
  h1 { color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  td { padding: 10px; border: 1px solid #ddd; }
  td:first-child { background: #f8f9fa; font-weight: bold; width: 200px; }
  .footer { margin-top: 40px; font-size: 0.8rem; color: #999; text-align: center; }
</style>
</head>
<body>
  <h1>🔧 RepairFlow – Relatório de Reparação</h1>
  <table>
    <tr><td>ID da Reparação</td><td>${doc.id}</td></tr>
    <tr><td>Cliente</td><td>${doc.clientName || 'N/A'}</td></tr>
    <tr><td>Email</td><td>${doc.clientEmail || 'N/A'}</td></tr>
    <tr><td>Equipamento</td><td>${doc.equipment || 'N/A'} ${doc.brand || ''} ${doc.model || ''}</td></tr>
    <tr><td>Problema Reportado</td><td>${doc.description || doc.problem || 'N/A'}</td></tr>
    <tr><td>Orçamento Final</td><td>${doc.budget ? doc.budget + '€' : 'N/A'}</td></tr>
    <tr><td>Estado</td><td>Concluído</td></tr>
    <tr><td>Data de Conclusão</td><td>${completedDate}</td></tr>
    <tr><td>Data do Relatório</td><td>${reportDate}</td></tr>
  </table>
  ${photosHtml}
  <div class="footer">RepairFlow – Gestão de Reparações Técnicas</div>
</body>
</html>`;

    const blobName = `report-${doc.id}-${Date.now()}.html`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const buffer = Buffer.from(htmlContent, 'utf-8');
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: 'text/html' }
    });

    const reportUrl = blockBlobClient.url;

    const emailMessage = {
      senderAddress: process.env.ACS_SENDER_EMAIL,
      recipients: { to: [{ address: doc.clientEmail, displayName: doc.clientName }] },
      content: {
        subject: `[RepairFlow] Relatório da sua reparação – ${doc.equipment}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
            <h2 style="color:#1a73e8">🔧 RepairFlow – Reparação Concluída</h2>
            <p>Olá <strong>${doc.clientName}</strong>,</p>
            <p>A sua reparação foi concluída. Pode consultar o relatório através do link abaixo:</p>
            <p><a href="${reportUrl}" style="background:#1a73e8;color:white;padding:10px 20px;border-radius:4px;text-decoration:none">Ver Relatório</a></p>
            <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
            <p style="font-size:0.8rem;color:#999">RepairFlow – Gestão de Reparações Técnicas</p>
          </div>`,
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
