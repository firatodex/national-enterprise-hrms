import express from 'express';
import bcryptjs from 'bcryptjs';
import supabase from '../utils/db.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { employee_code, password } = req.body;

    if (!employeeCode || !password) {
      return res.status(400).json({ error: 'Employee code and password required' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('employee_code', employeeCode)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcryptjs.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        employeeCode: user.employee_code,
        fullName: user.full_name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
