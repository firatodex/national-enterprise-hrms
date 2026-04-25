const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const punchRoutes = require('./routes/punches');
const adminRoutes = require('./routes/admin');
const salaryRoutes = require('./routes/salary');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', punchRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin/salary', salaryRoutes);

// Serve frontend static files
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
app.use('/', express.static(frontendPath));

// SPA fallback for admin routes
app.get(['/admin', '/admin/*'], (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin', 'index.html'));
});

app.get(['/employee', '/employee/*'], (req, res) => {
  res.sendFile(path.join(frontendPath, 'employee', 'index.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message || 'Internal error' } });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nNational Enterprise HRMS`);
  console.log(`Server running: http://localhost:${PORT}`);
  console.log(`\nOpen in browser:`);
  console.log(`  Login:    http://localhost:${PORT}/`);
  console.log(`  Employee: http://localhost:${PORT}/employee/`);
  console.log(`  Admin:    http://localhost:${PORT}/admin/`);
});
