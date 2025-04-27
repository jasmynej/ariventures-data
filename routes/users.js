const express = require('express');
const router = express.Router();
const supabase = require('../db');


router.post("/signup", async (req, res) => {
  const {email, password} = req.body;
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(200).json({ message: "User registered", user: data.user });
})


router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error("Login error:", error.message);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Optional: save token in cookie or return it to frontend
  res.json({
    message: "Login successful",
    session: data.session,
    user: data.user
  });
});

router.put("/update-role/:profileId", async (req, res) => {
  const profileId = parseInt(req.params.profileId)
  const roleUpdate = req.body
  const {data: userProfile} = await supabase.from('user_profile')
      .update(roleUpdate)
      .eq("id", profileId)
      .select();

  return res.status(200).json(userProfile);
})


router.put("/update-profile/:profileId", async (req, res) => {
  const profileId = parseInt(req.params.profileId)
  const profileUpdate = req.body
  const {data: userProfile} = await supabase.from('user_profile')
  .update(profileUpdate)
  .eq("id", profileId)
  .select();

  return res.status(200).json(userProfile);
})

router.get("/profile/:userId", async (req, res) => {
  const userId = req.params.userId
  const {data: userProfile} = await supabase.from('user_profile')
  .select()
  .eq("user_id", userId)
  .single();

  return res.status(200).json(userProfile);
})
module.exports = router;
