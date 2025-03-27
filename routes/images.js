const express = require("express");
const router = express.Router();
const supabase = require("../db");
const {list, put} = require('@vercel/blob')
const multer = require("multer");

const storage = multer.memoryStorage()
const upload = multer({ storage });

router.get('/', async (req, res) => {
    const allImages = await list();
    res.json(allImages);
})

router.post('/city',upload.single('cityImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const { buffer, mimetype, originalname } = req.file;

        // Upload the image buffer to Vercel Blob
        const blob = await put(`/cities/${originalname}`,buffer, {
            access: 'public',
        })

        const {data, error} = await supabase
            .from('city_images')
            .insert({city_id:req.query.id, url:blob.url})
            .select('*')

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Error uploading image' });
    }

})

module.exports = router;