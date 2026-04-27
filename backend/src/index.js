require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes   = require('./routes/auth');
const adminRoutes  = require('./routes/admin');
const salaryRoutes = require('./routes/salary');
const punchRoutes  = require('./routes/punches');
const migrateRoute = require('./routes/migrate');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/v1/auth',   authRoutes);
app.use('/api/v1/admin',  adminRoutes);
app.use('/api/v1/salary', salaryRoutes);
app.use('/api/v1',        punchRoutes);
app.use('/api/migrate',   migrateRoute);

const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
