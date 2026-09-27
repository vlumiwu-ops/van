const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');

const app = express();

// Konfigurasi CORS resmi untuk mengizinkan frontend Anda
app.use(cors({
    origin: ['https://zzstudio.online'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Penanganan eksplisit untuk preflight OPTIONS request
app.options('*', cors());

const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 } // Batas maksimal ukuran file 50MB
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

// Menggunakan port dinamis Railway dan binding '0.0.0.0' agar terhindar dari SIGTERM
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server backend berjalan di port ${PORT}`);
});
