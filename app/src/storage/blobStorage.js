const { BlobServiceClient } = require('@azure/storage-blob');

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);

const CONTAINER_PHOTOS = process.env.BLOB_CONTAINER_PHOTOS || 'repair-photos';
const CONTAINER_REPORTS = process.env.BLOB_CONTAINER_REPORTS || 'repair-reports';

async function ensureContainerExists(containerName) {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists({ access: 'blob' });
  return containerClient;
}

/**
 * Faz upload de um ficheiro para o Blob Storage
 * @param {Buffer} fileBuffer - conteúdo do ficheiro
 * @param {string} fileName - nome do blob (ex: "repair-123-before.jpg")
 * @param {string} mimeType - tipo MIME (ex: "image/jpeg")
 * @param {string} containerName - nome do container Azure
 * @returns {string} URL pública do blob
 */
async function uploadFile(fileBuffer, fileName, mimeType, containerName = CONTAINER_PHOTOS) {
  const containerClient = await ensureContainerExists(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(fileName);

  await blockBlobClient.uploadData(fileBuffer, {
    blobHTTPHeaders: { blobContentType: mimeType },
  });

  return blockBlobClient.url;
}

/**
 * Upload específico de foto de reparação
 */
async function uploadRepairPhoto(repairId, phase, fileBuffer, mimeType) {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const fileName = `${repairId}-${phase}-${Date.now()}.${ext}`;
  return uploadFile(fileBuffer, fileName, mimeType, CONTAINER_PHOTOS);
}

/**
 * Upload de relatório PDF gerado
 */
async function uploadReport(repairId, pdfBuffer) {
  const fileName = `report-${repairId}-${Date.now()}.pdf`;
  return uploadFile(pdfBuffer, fileName, 'application/pdf', CONTAINER_REPORTS);
}

/**
 * Lista todos os blobs de uma reparação
 */
async function listRepairPhotos(repairId) {
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_PHOTOS);
  const photos = [];
  for await (const blob of containerClient.listBlobsFlat({ prefix: repairId })) {
    photos.push({
      name: blob.name,
      url: `${blobServiceClient.url}${CONTAINER_PHOTOS}/${blob.name}`,
      createdOn: blob.properties.createdOn,
    });
  }
  return photos;
}

module.exports = {
  uploadRepairPhoto,
  uploadReport,
  listRepairPhotos,
  uploadFile,
};
