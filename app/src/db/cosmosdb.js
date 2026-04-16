const { CosmosClient } = require('@azure/cosmos');

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});

const DB_NAME = process.env.COSMOS_DB_NAME || 'repairflow';

// Containers (equivalente a "coleções" / tabelas)
const CONTAINERS = {
  repairs: 'repairs',
  clients: 'clients',
};

async function getContainer(containerName) {
  const db = client.database(DB_NAME);
  return db.container(containerName);
}

// ──────────────────────────────────────────────
// REPARAÇÕES
// ──────────────────────────────────────────────

async function getAllRepairs() {
  const container = await getContainer(CONTAINERS.repairs);
  const { resources } = await container.items
    .query('SELECT * FROM c ORDER BY c._ts DESC')
    .fetchAll();
  return resources;
}

async function getRepairById(id) {
  const container = await getContainer(CONTAINERS.repairs);
  const { resource } = await container.item(id, id).read();
  return resource;
}

async function createRepair(data) {
  const { v4: uuidv4 } = require('uuid');
  const container = await getContainer(CONTAINERS.repairs);
  const repair = {
    id: uuidv4(),
    ...data,
    status: 'pending',       // pending | diagnosed | in_progress | done | delivered
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [
      { status: 'pending', date: new Date().toISOString(), note: 'Pedido criado' }
    ],
  };
  const { resource } = await container.items.create(repair);
  return resource;
}

async function updateRepairStatus(id, newStatus, note = '') {
  const container = await getContainer(CONTAINERS.repairs);
  const { resource: existing } = await container.item(id, id).read();
  if (!existing) throw new Error('Reparação não encontrada');

  const updated = {
    ...existing,
    status: newStatus,
    updatedAt: new Date().toISOString(),
    history: [
      ...existing.history,
      { status: newStatus, date: new Date().toISOString(), note }
    ],
  };
  const { resource } = await container.item(id, id).replace(updated);
  return resource;
}

async function updateRepair(id, data) {
  const container = await getContainer(CONTAINERS.repairs);
  const { resource: existing } = await container.item(id, id).read();
  if (!existing) throw new Error('Reparação não encontrada');

  const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
  const { resource } = await container.item(id, id).replace(updated);
  return resource;
}

async function deleteRepair(id) {
  const container = await getContainer(CONTAINERS.repairs);
  await container.item(id, id).delete();
}

// ──────────────────────────────────────────────
// CLIENTES
// ──────────────────────────────────────────────

async function getAllClients() {
  const container = await getContainer(CONTAINERS.clients);
  const { resources } = await container.items
    .query('SELECT * FROM c ORDER BY c.name')
    .fetchAll();
  return resources;
}

async function getClientById(id) {
  const container = await getContainer(CONTAINERS.clients);
  const { resource } = await container.item(id, id).read();
  return resource;
}

async function createClient(data) {
  const { v4: uuidv4 } = require('uuid');
  const container = await getContainer(CONTAINERS.clients);
  const clientDoc = {
    id: uuidv4(),
    ...data,
    createdAt: new Date().toISOString(),
  };
  const { resource } = await container.items.create(clientDoc);
  return resource;
}

module.exports = {
  getAllRepairs,
  getRepairById,
  createRepair,
  updateRepairStatus,
  updateRepair,
  deleteRepair,
  getAllClients,
  getClientById,
  createClient,
};
