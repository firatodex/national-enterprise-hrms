import express from 'express';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { employee_code, password } = req.body;

    res.json({
      success: true,
      access_token: 'test_token',
      refresh_token: 'test_refresh',
      user: {
        id: 1,
        employee_code: 'OWNER',
        full_name: 'Sharadbhai',
        role: 'OWNER'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
