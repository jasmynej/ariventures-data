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
        await pool.query("TRUNCATE TABLE countries RESTART IDENTITY CASCADE;");
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

router.post("/load-visa-combinations", async function (req, res) {
    try {
        await pool.query("TRUNCATE TABLE visa_status RESTART IDENTITY CASCADE;");
        // Fetch country IDs
        const { rows } = await pool.query("SELECT id FROM countries");
        const countryIds = rows.map(row => row.id);

        let combinations = [];

        // Generate all passport-country combinations
        for (let i = 0; i < countryIds.length; i++) {
            for (let j = 0; j < countryIds.length; j++) {
                if (i !== j) {
                    combinations.push([countryIds[i], countryIds[j]]);
                }
            }
        }

        console.log(`Generated ${combinations.length} combinations`);

        // Batch insert using chunks (5000 rows per insert to avoid SQL limits)
        const chunkSize = 5000;
        for (let i = 0; i < combinations.length; i += chunkSize) {
            const chunk = combinations.slice(i, i + chunkSize);
            const values = chunk.flat(); // Flatten nested array
            const placeholders = chunk
                .map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`)
                .join(", ");

            const insertQuery = `INSERT INTO visa_status (passport, destination) VALUES ${placeholders}`;

            await pool.query(insertQuery, values);
            console.log(`Inserted ${chunk.length} visa combinations`);
        }

        res.json({ message: "Batch insert successful", total: combinations.length });
    } catch (error) {
        console.error("Error inserting visa combinations", error.message);
        res.status(500).json({ error: "Batch insert failed", details: error.message });
    }
});

router.get("/combos", async function (req, res) {
    try {
        const regionParams = req.query
        const region = regionParams.region ? regionParams.region : null;
        const subregion = regionParams.subRegion ? regionParams.subRegion : null;


        const query = `
                SELECT c1.name AS passport, c2.name AS destination 
                FROM visa_status v
                JOIN countries c1 ON c1.id = v.passport
                JOIN countries c2 ON c2.id = v.destination
                WHERE c1.sub_region = ANY($1)
                AND c1.region = ANY($2)
                LIMIT 300;
            `;

        const combos = await pool.query(query, [subregion, region])
        res.send(combos.rows);

    }
    catch (error) {
        res.send(error);
    }
})
module.exports = router;