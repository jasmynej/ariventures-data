const express = require('express');
const router = express.Router();
const pool = require('../db')
const {OpenAI} = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_KEY,
});

let intervalId = null
let intervalTime = 30000;
let updateLimit = 10;

const logAIResponseToFile = (response) => {
    const logFilePath = path.join(process.cwd(), "ai_responses.log");
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${JSON.stringify(response, null, 2)}\n\n`;

    fs.appendFile(logFilePath, logMessage, (err) => {
        if (err) {
            console.error("Failed to write AI response to log file:", err);
        }
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
                    content: "I need you to determine whether or not someone needs a visa if they are traveling from Country A going to Country B. " +
                        "You will receive a JSON object that's structured like {\"status_id\":1,\"passport\":\"United States\", \"destination\":\"France\"}. " +
                        "Return a JSON object like this {\"status_id\":1,\"status\":\"VISA-FREE\", \"notes\":\"Any additional notes about the requirements\"}. " +
                        "The status options are: VISA_FREE, VISA_REQUIRED, E_VISA."
                },
                {
                    role: "user",
                    content: JSON.stringify(countryCombo) // New user input
                }
            ],
            temperature: 0,
            max_tokens: 2048
        });

        // Parse the response text into JSON
        let aiResponse = response
        logAIResponseToFile(aiResponse);
        const visaStatus = JSON.parse(response.choices[0].message.content);
        return visaStatus;
    } catch (error) {
        console.error("Error fetching visa status:", error);

        return {
            error: "Could not retrieve visa status",
            combo: countryCombo,
            };
    }
}

async function createVisaStatus(query) {
    try {
        try {

            const updateQuery = `UPDATE visa_status SET status = $1, notes = $2 WHERE id = $3`;

            const combos = await pool.query(query);
            let country_combo = combos.rows;

            if (country_combo.length  === 0) {

                console.log("✅ All visa statuses are updated! Stopping the loop.");
                clearInterval(intervalId);
                intervalId = null; // Reset intervalId so we can restart later if needed
                return;
            }

            console.log(`Processing ${country_combo.length} visa records...`);
            updateLimit-=1
            const statuses = await Promise.all(
                country_combo.map(async (country) => {
                    const visaStatus = await getVisaStatus(country);

                    // Update the visa_status table with both status and notes
                    await pool.query(updateQuery, [
                        visaStatus.status,
                        visaStatus.notes,
                        visaStatus.status_id, // Ensure this is the correct ID
                    ]);

                    console.log(`Updated ${country.passport} -> ${country.destination}: ${visaStatus.status}`);
                })
            );

            return statuses
        } catch (err) {
            console.error("Error updating visa statuses:", err);
        }

    }
    catch (error) {
        console.error("Failed to create visa status:", error);
    }
}

router.post("/get-status", (req, res) => {
    if (intervalId) {
        return res.json({ message: "Already running!" }); // Prevent duplicate intervals
    }
    const query = `
            SELECT c1.name AS passport, c2.name AS destination, v.id as status_id
            FROM visa_status v
            JOIN countries c1 ON c1.id = v.passport
            JOIN countries c2 ON c2.id = v.destination
            WHERE v.status IS NULL
            LIMIT 150;
        `;
    intervalId = setInterval(createVisaStatus(query), intervalTime); // Start updating every 5 sec
    res.json({ message: "Visa status update started!" });
});

// **Route to manually stop the interval**
router.post("/stop-status-update", (req, res) => {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        res.json({ message: "Visa status update stopped!" });
    } else {
        res.json({ message: "No active visa status update running." });
    }
});

router.post("/status-for-country", (req, res) => {
    const country = req.query.country;
    const query = `
        SELECT c1.name AS passport, c2.name AS destination, v.id as status_id
        FROM visa_status v
        JOIN countries c1 ON c1.id = v.passport
        JOIN countries c2 ON c2.id = v.destination
        WHERE v.status IS NULL
        AND c1.name = '${country}' 
    `

    intervalId = setInterval(() => createVisaStatus(query), intervalTime); // ✅ Use arrow function to pass reference

    res.json({ message: "Visa status update started!" });


})

module.exports = router