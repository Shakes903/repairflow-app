const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadRepairPhoto } = require('../storage/blobStorage');
const db = require('../db/cosmosdb');

// Multer em memória (não guarda no disco, vai direto para o Azure Blob)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  },
});

// POST /api/upload/:repairId/photo
// Campo do form: "photo", query param: phase=before|after
router.post('/:repairId/photo', upload.single('photo'), async (req, res) => {
  try {
    const { repairId } = req.params;
    const phase = req.query.phase || 'before'; // 'before' ou 'after'

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum ficheiro enviado' });
    }

    const photoUrl = await uploadRepairPhoto(
      repairId,
      phase,
      req.file.buffer,
      req.file.mimetype
    );

    // Guarda a URL no CosmosDB na lista de fotos da reparação
    const repair = await db.getRepairById(repairId);
    if (!repair) return res.status(404).json({ error: 'Reparação não encontrada' });

    const updatedPhotos = { ...repair.photos };
    if (!updatedPhotos[phase]) updatedPhotos[phase] = [];
    updatedPhotos[phase].push(photoUrl);

    await db.updateRepair(repairId, { photos: updatedPhotos });

    res.json({ url: photoUrl, phase, repairId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao fazer upload da foto' });
  }
});

module.exports = router;
