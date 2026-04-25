import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRoutes from './routes/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

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
