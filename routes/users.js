const express = require('express');
const router = express.Router();
const pool = require('../db');

/* GET users listing. */
router.get('/', async function(req, res) {
  try {
    const allUsers = await pool.query('SELECT * FROM users');
    res.json(allUsers.rows);
  }
  catch (error) {
    console.log(error);
  }

});

module.exports = router;
