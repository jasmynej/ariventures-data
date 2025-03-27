const express = require('express');
const router = express.Router();
const supabase = require('../db');
const axios = require('axios');


router.get("/", async (req, res) => {
    try {
        const { data, error } = await supabase.from("countries").select("*");

        if (error) throw error;

        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || "Internal Server Error" });
    }
});

router.post("/load", async function (req, res) {
    try {
        // ✅ Delete all existing countries (since Supabase doesn't support TRUNCATE)
        const { error: deleteError } = await supabase.from("countries").delete().neq("id", 0);
        if (deleteError) throw deleteError;

        // ✅ Fetch country data from API
        const countriesAPI = await axios.get("https://restcountries.com/v3.1/all");
        let objsToInsert = countriesAPI.data.map((item) => ({
            name: item.name.common,
            capital: item.capital ? item.capital[0] : null,
            region: item.region,
            sub_region: item.subregion,
            flag_img: item.flags.png
        }));

        // ✅ If no data to insert, return early
        if (objsToInsert.length === 0) {
            return res.status(400).json({ error: "No data to insert" });
        }

        // ✅ Bulk insert data using Supabase's `.insert()`
        const { data, error } = await supabase.from("countries").insert(objsToInsert).select();

        if (error) throw error;

        res.json({ message: "Batch insert successful", countries: data });

    } catch (error) {
        console.error("Error inserting countries:", error.message);
        res.status(500).json({ error: "Batch insert failed", details: error.message });
    }
});


router.post("/load-visa-combinations", async function (req, res) {
    try {
        // Delete all existing visa_status records
        const { error: deleteError } = await supabase.from("visa_status").delete().neq("id", 0);
        if (deleteError) throw deleteError;

        // Fetch country IDs
        const { data: countries, error: fetchError } = await supabase.from("countries").select("id");
        if (fetchError) throw fetchError;

        const countryIds = countries.map(row => row.id);
        let combinations = [];

        // Generate all passport-country combinations
        for (let i = 0; i < countryIds.length; i++) {
            for (let j = 0; j < countryIds.length; j++) {
                if (i !== j) {
                    combinations.push({ passport: countryIds[i], destination: countryIds[j] });
                }
            }
        }

        console.log(`Generated ${combinations.length} combinations`);

        // Batch insert using chunks (5000 rows per insert)
        const chunkSize = 5000;
        for (let i = 0; i < combinations.length; i += chunkSize) {
            const chunk = combinations.slice(i, i + chunkSize);
            const { error: insertError } = await supabase.from("visa_status").insert(chunk);
            if (insertError) throw insertError;
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
        const { region, subRegion } = req.query;

        const { data, error } = await supabase
            .from("visa_status")
            .select(`
                passport:countries!visa_status_passport_fkey(name),
                destination:countries!visa_status_destination_fkey(name)
            `)
            .limit(300)
            .or(`passport.sub_region.eq.${subRegion},passport.region.eq.${region}`);

        if (error) throw error;

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/search", async function (req, res) {
    try {
        const name = req.body.name;
        const regions = req.body.regions;
        const subRegions = req.body.subRegions;
        let query = supabase.from("countries").select('*');

        if (name) {
            query = query.ilike("name", `%${name}%`);
        }

        if (regions?.length > 0) {
            console.log(regions);
            const orQuery = regions
                .map(val => `region.ilike.%${val}%`)
                .join(',');
            query = query.or(orQuery);
        }

        if (subRegions?.length > 0) {
            console.log(subRegions);
            const orQuery = subRegions
                .map(val => `sub_region.ilike.%${val}%`)
                .join(',');
            query = query.or(orQuery);
        }

        const { data, error } = await query;

        res.json(data)
    }
    catch (error) {
        console.error("Error searching countries:", error.message);
    }


})
module.exports = router;