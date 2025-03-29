const express = require("express");
const router = express.Router();
const supabase = require("../db");
const { OpenAI } = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

async function getCities(country) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `
                        You will receive a country in this format: { "id": number, "name": string }.

                        Respond ONLY with a JSON object that has a key "cities" and a value that is an array of 2 to 5 city objects.

                        Each city object must look like this:
                        {
                          "country_id": number,
                          "name": string,
                          "state_province": string (can be an empty string if not applicable)
                        }

                        The full response must look like this:
                        {
                          "cities": [
                            { "country_id": 123, "name": "City One", "state_province": "Province A" },
                            { "country_id": 123, "name": "City Two", "state_province": null }
                          ]
                        }

                    Do not return a single city or any other fields. Only return a JSON object with the "cities" array.
      `
                },
                { role: "user", content: JSON.stringify(country) }
            ],
            temperature: 0,
            max_tokens: 512
        });

        return JSON.parse(response.choices[0].message.content);
    }
    catch (error) {
        console.error("Error creating cities:", error);
    }

}

router.post("/load-cities", async (req, res) => {
    try {
        const limit = req.query.limit;
        console.log(limit);
        const { data, error } = await supabase.rpc('get_countries_without_cities').limit(parseInt(limit));
        const allCities = []

        if (error) throw error;
        for (const country of data) {
            console.log(country.name)
            const cities = await getCities(country);
            const {data: insertedCities, error: insertErr} = await supabase.from("cities").insert(cities.cities).select("*")
            allCities.push(...insertedCities)
        }


        res.json(allCities);
    }
    catch (error) {
        console.error("Error creating cities:", error);
    }
})

router.get("/all", async (req, res) => {
    try {
        const {data: allCities, error: err} = await supabase.from("cities").select("*");
        res.json(allCities);
    }
    catch (error) {
        console.error("Error getting cities:", error);
    }
})

router.get("/by-country", async (req, res) => {
    try {
        const countryId = req.query.country
        console.log(countryId)
        const {data, error} = await supabase.from("cities")
            .select(`
                id, 
                name, 
                state_province, 
                country:countries(id, name, region, sub_region),
                images:city_images(url)`)
            .eq("country_id", countryId)
        res.json(data)

    }
    catch (error) {
        console.error("Error getting cities:", error);
    }
})

router.post("/add", async (req, res) => {
    try {
        const newCities = req.body;
        const {data: insertedCities, error: insertErr} = await supabase.from("cities").insert(newCities).select("*")
        res.json(insertedCities);
    }
    catch (error) {
        console.error("Error creating cities:", error);
    }
})

router.get("/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const {data, error} = await supabase.from("cities")
        .select(`
                id, 
                name, 
                state_province, 
                country:countries(id, name, region, sub_region),
                images:city_images(url)`)
            .eq("id", id)
        res.json(data)

    }
    catch (error) {
        console.error("Error getting city:", error);
    }
})

router.post("/search", async (req, res) => {
    try {
        const name = req.body.name
        console.log(name)
        const {data, error} = await supabase.from("cities")
        .select("*")
            .ilike("name",`%${name}%`)
        res.json(data)
    }
    catch (error) {
        console.error("Error getting cities:", error);
    }
})

module.exports = router;