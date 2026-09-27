const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('ffmpeg-static'); // Menggunakan ffmpeg-static untuk kompatibilitas Linux/Railway

const app = express();
const upload = multer({ dest: 'uploads/' });

// Izinkan CORS agar bisa diakses dari web frontend Anda
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

app.post('/convert', upload.single('audioFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send("File audio tidak ditemukan.");
    }

    const inputPath = req.file.path;
    const outputPath = path.join(__dirname, 'uploads', `output_${Date.now()}.ogg`);
    const speed = req.body.speed || '2.3';
    const gain = req.body.gain || '-6';

    // Perintah menjalankan FFmpeg dari ffmpeg-static
    const cmd = `"${ffmpegPath}" -i "${inputPath}" -filter:a "atempo=${speed},volume=${gain}dB" -c:a libvorbis "${outputPath}"`;

    exec(cmd, (error, stdout, stderr) => {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);

        if (error) {
            console.error(error);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            return res.status(500).send("Gagal memproses audio dengan FFmpeg.");
        }

        res.download(outputPath, 'bypassed_audio.ogg', (err) => {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });
    });
});

// Menggunakan port dinamis dari Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server backend berjalan di port ${PORT}`);
});
