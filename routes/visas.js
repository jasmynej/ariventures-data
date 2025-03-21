const express = require("express");
const router = express.Router();
const supabase = require("../db");
const { OpenAI } = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

let intervalId = null;
let intervalTime = 30000;

async function getVisaStatus(countryCombo) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content:
                        "I need you to determine whether or not someone needs a visa if they are traveling from Country A going to Country B. " +
                        "You will receive a JSON object structured as {\"status_id\":1,\"passport\":\"United States\", \"destination\":\"France\"}. " +
                        "Return a JSON object in the format {\"status_id\":1,\"status\":\"VISA-FREE\", \"notes\":\"Any additional notes about the requirements\"}. " +
                        "Status options are: VISA_FREE, VISA_REQUIRED, E_VISA."
                },
                { role: "user", content: JSON.stringify(countryCombo) }
            ],
            temperature: 0,
            max_tokens: 2048
        });
        return JSON.parse(response.choices[0].message.content);
    } catch (error) {
        console.error("Error fetching visa status:", error);
        return { error: "Could not retrieve visa status", combo: countryCombo };
    }
}

async function createVisaStatus(filterCountry = null, limit = 150) {
    try {
        const query = supabase
            .from("visa_status")
            .select("id, passport(name), destination(name)")
            .is("status", null)
            .limit(limit);

        if (filterCountry) query.eq("passport", filterCountry);

        const { data: country_combo} = await query;
        console.log(country_combo.length);
        if (!country_combo.length) {
            console.log("✅ All visa statuses are updated! Stopping the loop.");
            clearInterval(intervalId);
            intervalId = null;
            return;
        }

        console.log(`Processing ${country_combo.length} visa records...`);

        const updates = await Promise.all(
            country_combo.map(async (country) => {
                const visaStatus = await getVisaStatus(country);
                let status = visaStatus.status
                if (status === 'VISA-FREE') {
                    status = 'VISA_FREE'
                }
                return {
                    status: status,
                    notes: visaStatus.notes
                };
            })
        );

        // ✅ Use `update()` instead of `upsert()`
        for (let i = 0; i < country_combo.length; i++) {
            const { data: status} = await supabase
                .from("visa_status")
                .update(updates[i])
                .eq("id", country_combo[i].id)
                .select(); // ✅ Only update records by `id
            console.log(status)
        }

        console.log(`Updated ${updates.length} visa records.`);
    } catch (err) {
        console.error("Error updating visa statuses:", err);
    }
}

router.post("/get-status", (req, res) => {
    if (intervalId) return res.json({ message: "Already running!" });

    intervalId = setInterval(createVisaStatus, intervalTime);
    res.json({ message: "Visa status update started!" });
});

router.post("/stop-status-update", (req, res) => {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        res.json({ message: "Visa status update stopped!" });
    } else {
        res.json({ message: "No active visa status update running." });
    }
});

router.post("/status-for-country", async (req, res) => {
    try {
        const countryName = req.query.country;

        if (!countryName) return res.status(400).json({ error: "Country name is required" });

        // ✅ Fetch country ID from Supabase
        const { data: country, error } = await supabase
            .from("countries")
            .select("id")
            .eq("name", countryName)
            .single();

        if (error || !country) return res.status(404).json({ error: "Country not found" });

        const countryId = country.id; // ✅ Get the actual country ID

        if (intervalId) return res.json({ message: "Already running!" });

        intervalId = setInterval(() => createVisaStatus(countryId), intervalTime);
        res.json({ message: `Visa status update started for ${countryName}!` });
    } catch (err) {
        console.error("Error in status-for-country:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});



router.get("/status", async (req, res) => {
    try {
        const passport = req.query.passport
        const destination = req.query.destination
        const {data: visaStatus, error} = await supabase
            .from("visa_status")
            .select("" +
                "id, " +
                "passport(name), " +
                "destination(name), " +
                "status, " +
                "notes")
            .eq("passport", passport)
            .eq("destination", destination)

        if (error || !visaStatus) return res.status(404).json({ error: "Status not found" });
        res.json(visaStatus);

    }
    catch (err) {
        console.error("Error fetching visa status:", err);
    }
})

router.get("/valid-passports", async (req, res) => {
    try {
        const { data: visaRecords} = await supabase
            .from("visa_status")
            .select("passport(name, capital,region, sub_region, flag_img)")
            .not("status", "is", null)
            .order("passport", { ascending: true });

        const passports = [
            ...new Map(
                visaRecords.map((record) => [record.passport.name,
                    { name: record.passport.name,
                        capital: record.passport.capital,
                        region: record.passport.region,
                        sub_region: record.passport.sub_region,
                      flag_img:record.passport.flag_img }])
            ).values()
        ];

        res.json(passports)
    }
    catch (err) {
        console.error("Error fetching visa statuses:", err);
    }
})

router.get("/all-status", async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page) : 1; // Default to page 1
        const pageSize = 100; // Default to 20 per page
        const includeNulls = (req.query.includeNulls ? req.query.includeNulls : false) === "true";

        let query = supabase
            .from("visa_status")
            .select(`
                id,
                passport(name, flag_img),
                destination(name, flag_img),
                status,
                notes
            `)
            .range((page - 1) * pageSize, page * pageSize - 1);
        let countQuery = supabase.from("visa_status").select("*", { count: "exact", head: true });
        if (!includeNulls) {
            query = query.not("status", "is", null);
            countQuery = countQuery.not("status", "is", null);
        }

        const { data: statues} = await query;
        const { count } = await countQuery;

        const totalPages = Math.ceil(count / pageSize);

        res.json({
            data: statues,
            totalRecords: count,
            totalPages: totalPages,
            currentPage: page,
            pageSize: pageSize
        });
    }
    catch (err) {
        console.error("Error fetching visa statuses:", err);
    }
})

router.put("/update-status/:id", async (req, res) => {
    const updatedStatus = req.body
    const statusId = req.params.id

    const { data: newStatus} = await supabase
        .from("visa_status")
        .update(updatedStatus)
        .eq("id", statusId)
        .select(); // ✅ Only update records by `id`


    res.json(newStatus)

})
module.exports = router;