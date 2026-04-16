const express = require('express');
const router = express.Router();
const db = require('../db/cosmosdb');

// GET /api/clients
router.get('/', async (req, res) => {
  try {
    const clients = await db.getAllClients();
    res.json(clients);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao obter clientes' });
  }
});

// GET /api/clients/:id
router.get('/:id', async (req, res) => {
  try {
    const client = await db.getClientById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(client);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao obter cliente' });
  }
});

// POST /api/clients
router.post('/', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Campos obrigatórios: name, email' });
    }
    const client = await db.createClient({ name, email, phone });
    res.status(201).json(client);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

module.exports = router;
