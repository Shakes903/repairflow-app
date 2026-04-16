require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const repairsRouter = require('./routes/repairs');
const clientsRouter = require('./routes/clients');
const uploadRouter = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/repairs', repairsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/upload', uploadRouter);

// Health check (útil para Azure App Service)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'RepairFlow', timestamp: new Date().toISOString() });
});

// Serve frontend para qualquer rota não-API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`RepairFlow a correr na porta ${PORT}`);
});

module.exports = app;
