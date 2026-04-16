const express = require('express');
const router = express.Router();
const db = require('../db/cosmosdb');

// GET /api/repairs  – listar todas as reparações
router.get('/', async (req, res) => {
  try {
    const repairs = await db.getAllRepairs();
    res.json(repairs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao obter reparações' });
  }
});

// GET /api/repairs/:id  – obter reparação por ID
router.get('/:id', async (req, res) => {
  try {
    const repair = await db.getRepairById(req.params.id);
    if (!repair) return res.status(404).json({ error: 'Reparação não encontrada' });
    res.json(repair);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao obter reparação' });
  }
});

// POST /api/repairs  – criar nova reparação
router.post('/', async (req, res) => {
  try {
    const { clientId, clientName, clientEmail, clientPhone,
            equipment, brand, model, problem, estimatedDelivery } = req.body;

    if (!clientName || !equipment || !problem) {
      return res.status(400).json({ error: 'Campos obrigatórios: clientName, equipment, problem' });
    }

    const repair = await db.createRepair({
      clientId, clientName, clientEmail, clientPhone,
      equipment, brand, model, problem, estimatedDelivery,
      budget: null,
      photos: { before: [], after: [] },
      reportUrl: null,
    });

    res.status(201).json(repair);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar reparação' });
  }
});

// PATCH /api/repairs/:id/status  – atualizar estado
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, note, budget } = req.body;
    const validStatuses = ['pending', 'diagnosed', 'in_progress', 'done', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use: ${validStatuses.join(', ')}` });
    }

    let repair = await db.updateRepairStatus(req.params.id, status, note);

    // Se foi fornecido orçamento, atualiza também
    if (budget !== undefined) {
      repair = await db.updateRepair(req.params.id, { budget });
    }

    res.json(repair);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar estado' });
  }
});

// PUT /api/repairs/:id  – atualizar dados da reparação
router.put('/:id', async (req, res) => {
  try {
    const repair = await db.updateRepair(req.params.id, req.body);
    res.json(repair);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar reparação' });
  }
});

// DELETE /api/repairs/:id  – apagar reparação
router.delete('/:id', async (req, res) => {
  try {
    await db.deleteRepair(req.params.id);
    res.json({ message: 'Reparação eliminada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao eliminar reparação' });
  }
});

module.exports = router;
