const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/', (req, res) => {
  res.send("Ariventures Data")
})
/* GET home page. */
router.get('/home', async function(req, res, next) {
  const countriesDb = await axios.get("http://localhost:4000/countries");
  res.render('index', { countries: countriesDb.data });
});

module.exports = router;
