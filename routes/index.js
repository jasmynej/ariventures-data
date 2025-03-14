const express = require('express');
const router = express.Router();
const axios = require('axios');

/* GET home page. */
router.get('/', async function(req, res, next) {
  const countriesDb = await axios.get("http://localhost:4000/countries");
  res.render('index', { countries: countriesDb.data });
});

module.exports = router;
