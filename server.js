const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 } // Batas maksimal ukuran file 50MB
});

// Middleware CORS lengkap untuk menangani preflight request dari frontend
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

// Endpoint health check untuk monitoring Railway
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

// Endpoint utama untuk konversi audio
app.post('/convert', upload.single('audioFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send("File audio tidak ditemukan.");
    }

    const inputPath = req.file.path;
    const outputPath = path.join(__dirname, 'uploads', `output_${Date.now()}.ogg`);
    
    // Validasi & clamping parameter speed dan gain agar aman
    let speed = parseFloat(req.body.speed) || 2.3;
    if (speed < 0.5) speed = 0.5;
    if (speed > 4.0) speed = 4.0;

    let gain = parseFloat(req.body.gain) || -6;
    if (gain < -30) gain = -30;
    if (gain > 10) gain = 10;

    // Argumen untuk execFile agar aman dari command injection
    const args = [
        '-i', inputPath,
        '-filter:a', `atempo=${speed},volume=${gain}dB`,
        '-c:a', 'libvorbis',
        outputPath
    ];

    execFile(ffmpegPath, args, (error, stdout, stderr) => {
        // Pastikan file input selalu dibersihkan
        if (fs.existsSync(inputPath)) {
            try { fs.unlinkSync(inputPath); } catch (e) { console.error(e); }
        }

        if (error) {
            console.error('FFmpeg Error:', error);
            if (fs.existsSync(outputPath)) {
                try { fs.unlinkSync(outputPath); } catch (e) { console.error(e); }
            }
            return res.status(500).send("Gagal memproses audio dengan FFmpeg.");
        }

        // Kirim file hasil konversi ke client lalu bersihkan setelah terkirim
        res.download(outputPath, 'bypassed_audio.ogg', (err) => {
            if (fs.existsSync(outputPath)) {
                try { fs.unlinkSync(outputPath); } catch (e) { console.error(e); }
            }
        });
    });
});

// Port dinamis yang wajib untuk platform cloud seperti Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server backend berjalan di port ${PORT}`);
});