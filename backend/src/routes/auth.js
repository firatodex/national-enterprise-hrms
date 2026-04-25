import express from 'express';
import supabase from '../utils/db.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    // Test Supabase connection
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('count')
      .single();

    console.log('Supabase test:', { testData, testError });

    if (testError) {
      return res.status(500).json({ error: 'Supabase error: ' + testError.message });
    }

    res.json({ success: true, message: 'Supabase connected' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
