const express = require('express');
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const authRoutes = require('./routes/auth');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/v1/auth', authRoutes);

// Serve frontend static files
const frontendPath = join(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// API health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
const adminRoutes  = require('./routes/admin');
const salaryRoutes = require('./routes/salary');
const punchRoutes  = require('./routes/punches');

app.use('/api/v1/auth',   authRoutes);
app.use('/api/v1/admin',  adminRoutes);
app.use('/api/v1/salary', salaryRoutes);
app.use('/api/v1',        punchRoutes);   // /punches/in, /punches/out, /me/today
