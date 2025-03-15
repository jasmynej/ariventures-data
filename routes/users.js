const express = require('express');
const router = express.Router();
const supabase = require('../db');

/* GET users listing. */
router.get('/', async function(req, res) {
  try {
    const { data, error } = await supabase.from("users").select("*");

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }

});

module.exports = router;
