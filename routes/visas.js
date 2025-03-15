const express = require("express");
const router = express.Router();
const supabase = require("../db");
const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

let intervalId = null;
let intervalTime = 30000;
let updateLimit = 10;

const logAIResponseToFile = (response) => {
    const logFilePath = path.join(process.cwd(), "ai_responses.log");
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${JSON.stringify(response, null, 2)}\n\n`;

    fs.appendFile(logFilePath, logMessage, (err) => {
        if (err) console.error("Failed to write AI response to log file:", err);
    });
};

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

        logAIResponseToFile(response);
        return JSON.parse(response.choices[0].message.content);
    } catch (error) {
        console.error("Error fetching visa status:", error);
        return { error: "Could not retrieve visa status", combo: countryCombo };
    }
}

async function createVisaStatus(filterCountry = null) {
    try {
        const query = supabase
            .from("visa_status")
            .select("id, passport:countries!visa_status_passport_fkey(name), destination:countries!visa_status_destination_fkey(name)")
            .is("status", null)
            .limit(150);

        if (filterCountry) query.eq("passport", filterCountry);

        const { data: country_combo, error } = await query;
        if (error) throw error;
        console.log(country_combo.length);
        if (!country_combo.length) {
            console.log("✅ All visa statuses are updated! Stopping the loop.");
            clearInterval(intervalId);
            intervalId = null;
            return;
        }

        console.log(`Processing ${country_combo.length} visa records...`);
        updateLimit--;

        const updates = await Promise.all(
            country_combo.map(async (country) => {
                const visaStatus = await getVisaStatus(country);
                return {
                    status: visaStatus.status,
                    notes: visaStatus.notes
                };
            })
        );

        // ✅ Use `update()` instead of `upsert()`
        for (let i = 0; i < country_combo.length; i++) {
            const { error: updateError } = await supabase
                .from("visa_status")
                .update(updates[i])
                .eq("id", country_combo[i].id); // ✅ Only update records by `id`

            if (updateError) throw updateError;
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
                "passport:countries!visa_status_passport_fkey(name), " +
                "destination:countries!visa_status_destination_fkey(name), " +
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
module.exports = router;