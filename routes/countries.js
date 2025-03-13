const express = require('express');
const router = express.Router();
const pool = require('../db');
const axios = require('axios');

router.get('/', async function(req, res) {
    try {
        const countriesDb = await pool.query('SELECT * FROM countries');
        res.json(countriesDb.rows);
    }
    catch (error) {
        res.send(error);
    }
})

router.post("/load", async function (req, res) {
    try {
        const countriesAPI = await axios.get("https://restcountries.com/v3.1/all");
        let objsToInsert = [];

        countriesAPI.data.forEach((item) => {
            let country = {
                name: item.name.common,
                capital: item.capital ? item.capital[0] : null, // Handle missing capital
                region: item.region,
                sub_region: item.subregion,
                flag_img: item.flags.png
            };
            objsToInsert.push(country);
        });

        if (objsToInsert.length === 0) {
            return res.status(400).json({ error: "No data to insert" });
        }

        // Build query dynamically
        const values = [];
        const placeholders = objsToInsert
            .map((_, index) => {
                const offset = index * 5;
                return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
            })
            .join(", ");

        const insertQuery = `INSERT INTO countries (name, capital, region, sub_region, flag_img) VALUES ${placeholders} RETURNING *`;

        // Flatten the values array
        objsToInsert.forEach((country) => {
            values.push(country.name, country.capital, country.region, country.sub_region, country.flag_img);
        });

        // Execute the query
        const result = await pool.query(insertQuery, values);
        res.json({ message: "Batch insert successful", countries: result.rows });

    } catch (error) {
        console.error("Error inserting countries:", error.message);
        res.status(500).json({ error: "Batch insert failed", details: error.message });
    }
});

module.exports = router;