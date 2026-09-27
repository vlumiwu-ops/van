const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');

const app = express();

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/ogg',
    'audio/x-m4a',
    'audio/m4a',
    'audio/mp4',
];

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

const upload = multer({
    dest: UPLOAD_DIR,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            return cb(null, true);
        }
        const err = new Error('Invalid file type. Allowed types: mp3, wav, ogg, m4a.');
        err.code = 'INVALID_FILE_TYPE';
        return cb(err);
    },
});

// Full CORS middleware with preflight handling
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

app.use(express.json());

function cleanupFile(filePath) {
    if (!filePath) return;
    fs.promises.unlink(filePath).catch((err) => {
        if (err.code !== 'ENOENT') {
            console.error(`Failed to clean up file ${filePath}:`, err.message);
        }
    });
}

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return Math.min(Math.max(num, min), max);
}

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.post('/convert', (req, res) => {
    upload.single('audioFile')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({ error: 'FILE_TOO_LARGE', message: 'File exceeds the 500MB size limit.' });
                }
                return res.status(400).json({ error: err.code, message: err.message });
            }
            if (err.code === 'INVALID_FILE_TYPE') {
                return res.status(400).json({ error: 'INVALID_FILE_TYPE', message: err.message });
            }
            console.error('Upload error:', err);
            return res.status(500).json({ error: 'UPLOAD_ERROR', message: 'Failed to process upload.' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'NO_FILE', message: 'Audio file not found in request.' });
        }

        const inputPath = req.file.path;
        const outputPath = path.join(UPLOAD_DIR, `output_${Date.now()}.ogg`);

        const speed = clamp(req.body.speed, 0.5, 2.0, 1.0);
        const gain = clamp(req.body.gain, -20, 20, 0);

        const args = [
            '-y',
            '-i', inputPath,
            '-filter:a', `atempo=${speed},volume=${gain}dB`,
            '-c:a', 'libvorbis',
            outputPath,
        ];

        let responded = false;

        const ffmpegProcess = execFile(ffmpegPath, args, (error, stdout, stderr) => {
            cleanupFile(inputPath);

            if (error) {
                console.error('FFmpeg processing error:', error.message, stderr);
                cleanupFile(outputPath);
                if (!responded) {
                    responded = true;
                    return res.status(500).json({ error: 'FFMPEG_ERROR', message: 'Failed to process audio with FFmpeg.' });
                }
                return;
            }

            res.download(outputPath, 'converted_audio.ogg', (downloadErr) => {
                cleanupFile(outputPath);
                if (downloadErr) {
                    console.error('Error sending converted file:', downloadErr.message);
                }
            });
        });

        ffmpegProcess.on('error', (procErr) => {
            console.error('Failed to start FFmpeg process:', procErr.message);
            cleanupFile(inputPath);
            cleanupFile(outputPath);
            if (!responded) {
                responded = true;
                res.status(500).json({ error: 'FFMPEG_SPAWN_ERROR', message: 'Failed to start FFmpeg process.' });
            }
        });
    });
});

// Multer / general error handling middleware
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'FILE_TOO_LARGE', message: 'File exceeds the 500MB size limit.' });
        }
        return res.status(400).json({ error: err.code, message: err.message });
    }

    if (err && err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ error: 'INVALID_FILE_TYPE', message: err.message });
    }

    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Audio converter backend running on port ${PORT}`);
});
