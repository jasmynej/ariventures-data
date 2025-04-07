const jwt = require("jsonwebtoken")
const supabase = require("../db");

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
        return res.status(401).json({ error: "No token provided" });
    }

    try {
        // Validate the token using Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: "Invalid token" });
        }

        // Attach user info to the request
        req.user = user;
        next();
    } catch (err) {
        console.error("Auth error:", err.message);
        res.status(401).json({ error: "Unauthorized" });
    }
}

module.exports = authMiddleware;