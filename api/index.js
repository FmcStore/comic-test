const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();

// Konfigurasi Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Limit besar untuk sync data history

// --- Database Connection ---
const connectionOptions = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
};

async function connectToDatabase() {
    if (mongoose.connection.readyState === 1) return;
    try {
        await mongoose.connect(process.env.MONGODB_URI, connectionOptions);
        console.log("✅ Database Terhubung!");
    } catch (err) {
        console.error("❌ Gagal DB:", err.message);
    }
}

// --- Schemas ---
const MappingSchema = new mongoose.Schema({
    uuid: { type: String, unique: true },
    slug: String,
    type: String
});

const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }, 
    history: { type: Array, default: [] },
    bookmarks: { type: Array, default: [] },
    lastSync: { type: Date, default: Date.now }
});

const Mapping = mongoose.models.Mapping || mongoose.model('Mapping', MappingSchema);
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// --- 1. Custom Proxy Route (Bypass CORS & Images) ---
app.get('/api/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Parameter url wajib ada" });

    try {
        // Request ke sumber asli
        const response = await axios.get(url, {
            responseType: 'arraybuffer', // Penting untuk gambar
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://komikcast.ch/' 
            }
        });

        // Set Headers Response
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 1 hari

        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }

        return res.send(response.data);
    } catch (error) {
        console.error("Proxy Error:", error.message);
        // Jangan return 500 jika gambar tidak ketemu, return 404 image placeholder logic di frontend
        res.status(404).json({ error: "Gagal mengambil data" });
    }
});

// --- 2. Auth Routes (Login/Register) ---
app.post('/api/auth/login', async (req, res) => {
    await connectToDatabase();
    const { email, password } = req.body;
    
    try {
        let user = await User.findOne({ email });
        
        // Auto Register jika user tidak ditemukan
        if (!user) {
            user = await User.create({ email, password, history: [], bookmarks: [] });
            return res.json({ success: true, isNew: true, user: { email: user.email, history: [], bookmarks: [] } });
        } else {
            // Cek Password
            if (user.password !== password) {
                return res.status(401).json({ success: false, message: "Password salah!" });
            }
            return res.json({ 
                success: true, 
                isNew: false, 
                user: { 
                    email: user.email, 
                    history: user.history, 
                    bookmarks: user.bookmarks 
                } 
            });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// --- 3. Sync Routes (Save Data) ---
app.post('/api/user/sync', async (req, res) => {
    await connectToDatabase();
    const { email, history, bookmarks } = req.body;
    
    try {
        await User.findOneAndUpdate({ email }, { history, bookmarks, lastSync: new Date() });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- 4. Mapping Routes (UUID System) ---
app.post('/api/get-id', async (req, res) => {
    await connectToDatabase();
    const { slug, type } = req.body;
    if (!slug || !type) return res.status(400).json({ error: "Missing data" });
    
    let data = await Mapping.findOne({ slug, type });
    if (!data) {
        data = await Mapping.create({ uuid: uuidv4(), slug, type });
    }
    return res.json({ uuid: data.uuid });
});

app.get('/api/get-slug/:uuid', async (req, res) => {
    await connectToDatabase();
    const data = await Mapping.findOne({ uuid: req.params.uuid });
    return data ? res.json(data) : res.status(404).json({ error: "Not found" });
});

app.get('/api/health', (req, res) => res.json({ status: "OK", database: "Connected" }));

module.exports = app;
