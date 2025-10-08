// server.js - Node.js Backend API for Certificate System
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Sessions for admin auth
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
    console.error('❌ Error: SESSION_SECRET environment variable is required');
    console.error('📝 Please check your .env file and ensure SESSION_SECRET is set');
    process.exit(1);
}
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' }
}));

// Configuration
const csvFile = path.join(__dirname, 'data', 'students.csv');
const referencesFile = path.join(__dirname, 'data', 'references.json');
const dataDir = path.join(__dirname, 'data');

// Admin credentials from environment variables (required for security)
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

// Validate required environment variables
if (!ADMIN_USER || !ADMIN_PASS) {
    console.error('❌ Error: ADMIN_USER and ADMIN_PASS environment variables are required');
    console.error('📝 Please check your .env file and ensure these variables are set');
    process.exit(1);
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

// Ensure data directory exists
async function ensureDataDirectory() {
    try {
        await fs.access(dataDir);
    } catch (error) {
        await fs.mkdir(dataDir, { recursive: true });
    }
}

// Initialize references file if it doesn't exist
async function initializeReferencesFile() {
    try {
        await fs.access(referencesFile);
    } catch (error) {
        await fs.writeFile(referencesFile, JSON.stringify({}));
    }
}

// Initialize students CSV with header if it doesn't exist
async function initializeStudentsCSV() {
    try {
        await fs.access(csvFile);
    } catch (error) {
        const header = 'name,email,eligibility\n';
        await fs.writeFile(csvFile, header, 'utf8');
    }
}

/**
 * Read CSV file and return as array
 */
async function readCSV(filename) {
    try {
        await fs.access(filename);
        
        return new Promise((resolve, reject) => {
            const results = [];
            const stream = require('fs').createReadStream(filename)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', () => resolve(results))
                .on('error', reject);
        });
    } catch (error) {
        return [];
    }
}

/**
 * Write data to CSV file
 */
async function writeCSV(filename, data) {
    if (!data || data.length === 0) {
        // Ensure at least header exists when asked to write empty data
        const headerLine = 'name,email,eligibility\n';
        await fs.writeFile(filename, headerLine, 'utf8');
        return true;
    }
    
    try {
        const headers = Object.keys(data[0]).map(key => ({ id: key, title: key }));
        
        const csvWriter = createCsvWriter({
            path: filename,
            header: headers
        });
        
        await csvWriter.writeRecords(data);
        return true;
    } catch (error) {
        console.error('Error writing CSV:', error);
        return false;
    }
}

/**
 * Generate unique reference ID
 */
function generateReferenceId() {
    const timestamp = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
    const random = uuidv4().substring(0, 5).toUpperCase();
    return `CERT-${timestamp}-${random}`;
}

/**
 * Read references from JSON file
 */
async function readReferences() {
    try {
        const content = await fs.readFile(referencesFile, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        return {};
    }
}

/**
 * Write references to JSON file
 */
async function writeReferences(references) {
    try {
        await fs.writeFile(referencesFile, JSON.stringify(references, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing references:', error);
        return false;
    }
}

/**
 * Find user in CSV data and check eligibility
 */
async function findUser(name, email) {
    const students = await readCSV(csvFile);
    
    return students.find(student => 
        student.name.trim().toLowerCase() === name.trim().toLowerCase() &&
        student.email.trim().toLowerCase() === email.trim().toLowerCase()
    );
}

/**
 * Check if user is eligible for certificate
 */
function isEligibleForCertificate(user) {
    if (!user || !user.eligibility) {
        return false;
    }
    
    const eligibility = user.eligibility.trim().toLowerCase();
    return eligibility === 'eligible' || eligibility === 'well done';
}

/**
 * Store reference ID
 */
async function storeReference(referenceId, userData) {
    const references = await readReferences();
    references[referenceId] = {
        id: referenceId,
        user: userData,
        timestamp: new Date().toISOString(),
        downloaded: false,
        download_count: 0
    };
    return await writeReferences(references);
}

/**
 * Get reference data
 */
async function getReference(referenceId) {
    const references = await readReferences();
    return references[referenceId] || null;
}

/**
 * Find existing certificate for a user
 */
async function findExistingCertificate(name, email) {
    const references = await readReferences();
    
    // Search through all references to find one for this user
    for (const [refId, refData] of Object.entries(references)) {
        if (refData.user && 
            refData.user.name.trim().toLowerCase() === name.trim().toLowerCase() &&
            refData.user.email.trim().toLowerCase() === email.trim().toLowerCase()) {
            return refData;
        }
    }
    return null;
}

/**
 * Update download status
 */
async function updateDownloadStatus(referenceId) {
    const references = await readReferences();
    if (references[referenceId]) {
        references[referenceId].downloaded = true;
        references[referenceId].download_count++;
        references[referenceId].last_download = new Date().toISOString();
        return await writeReferences(references);
    }
    return false;
}

// API Routes

// Admin auth endpoints
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body || {};
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        req.session.isAdmin = true;
        req.session.username = username;
        return res.json({ success: true });
    }
    return res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/admin/logout', (req, res) => {
    req.session?.destroy(() => res.json({ success: true }));
});

app.get('/api/admin/me', (req, res) => {
    if (req.session && req.session.isAdmin) {
        return res.json({ authenticated: true, username: req.session.username });
    }
    return res.status(401).json({ authenticated: false });
});

/**
 * Verify student credentials
 */
app.post('/api/verify_credentials', async (req, res) => {
    try {
        const { name, email } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }
        
        const user = await findUser(name, email);
        if (user) {
            // Check eligibility first
            if (!isEligibleForCertificate(user)) {
                return res.status(403).json({ 
                    error: 'You are not eligible for a certificate at this time. Please contact your administrator.',
                    eligibility_status: user.eligibility || 'unknown'
                });
            }
            
            // Check if user already has a certificate
            const existingCertificate = await findExistingCertificate(name, email);
            
            if (existingCertificate) {
                // Return existing certificate
                res.json({
                    success: true,
                    reference_id: existingCertificate.id,
                    user: existingCertificate.user,
                    existing: true,
                    created_date: existingCertificate.timestamp
                });
            } else {
                // Generate new certificate
                const referenceId = generateReferenceId();
                const stored = await storeReference(referenceId, user);
                
                if (stored) {
                    res.json({
                        success: true,
                        reference_id: referenceId,
                        user: user,
                        existing: false
                    });
                } else {
                    res.status(500).json({ error: 'Failed to store reference' });
                }
            }
        } else {
            res.status(404).json({ error: 'User not found. Please check your name and email address.' });
        }
    } catch (error) {
        console.error('Error verifying credentials:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get certificate by reference ID
 */
app.get('/api/get_certificate', async (req, res) => {
    try {
        const { reference_id } = req.query;
        
        if (!reference_id) {
            return res.status(400).json({ error: 'Reference ID is required' });
        }
        
        const reference = await getReference(reference_id);
        if (reference) {
            res.json({
                success: true,
                data: reference
            });
        } else {
            res.status(404).json({ error: 'Reference ID not found' });
        }
    } catch (error) {
        console.error('Error getting certificate:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Mark certificate as downloaded
 */
app.post('/api/mark_downloaded', async (req, res) => {
    try {
        const { reference_id } = req.body;
        
        if (!reference_id) {
            return res.status(400).json({ error: 'Reference ID is required' });
        }
        
        const updated = await updateDownloadStatus(reference_id);
        if (updated) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: 'Failed to update download status' });
        }
    } catch (error) {
        console.error('Error marking downloaded:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get system statistics
 */
app.get('/api/get_stats', async (req, res) => {
    try {
        const references = await readReferences();
        const referenceValues = Object.values(references);
        
        const totalReferences = referenceValues.length;
        const totalDownloads = referenceValues.reduce((sum, ref) => sum + (ref.download_count || 0), 0);
        const uniqueDownloads = referenceValues.filter(ref => ref.downloaded).length;
        
        res.json({
            total_references: totalReferences,
            total_downloads: totalDownloads,
            unique_downloads: uniqueDownloads
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin-only file access endpoints (view/download CSV/JSON safely)
app.get('/api/admin/students.csv', requireAdmin, async (req, res) => {
    try {
        const content = await fs.readFile(csvFile, 'utf8');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(content);
    } catch (error) {
        console.error('Error reading students.csv:', error);
        return res.status(500).json({ error: 'Failed to read CSV' });
    }
});

app.get('/api/admin/references.json', requireAdmin, async (req, res) => {
    try {
        const content = await fs.readFile(referencesFile, 'utf8');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(content);
    } catch (error) {
        console.error('Error reading references.json:', error);
        return res.status(500).json({ error: 'Failed to read references' });
    }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'Certificate Generator API'
    });
});

/**
 * Get all students (for admin)
 */
app.get('/api/students', requireAdmin, async (req, res) => {
    try {
        const students = await readCSV(csvFile);
        res.json({
            success: true,
            students: students,
            count: students.length
        });
    } catch (error) {
        console.error('Error getting students:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}); 

/**
 * Add new student (for admin)
 */
app.post('/api/students', requireAdmin, async (req, res) => {
    try {
        const { name, email, eligibility } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }
        
        // Check if student already exists
        const existingUser = await findUser(name, email);
        if (existingUser) {
            return res.status(409).json({ error: 'Student already exists' });
        }
        
        const students = await readCSV(csvFile);
        students.push({ 
            name: name.trim(), 
            email: email.trim(),
            eligibility: eligibility ? eligibility.trim() : 'not eligible'
        });
        
        const saved = await writeCSV(csvFile, students);
        if (saved) {
            res.json({ success: true, message: 'Student added successfully' });
        } else {
            res.status(500).json({ error: 'Failed to save student' });
        }
    } catch (error) {
        console.error('Error adding student:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Clean up duplicate certificates (Admin endpoint)
 */
app.post('/api/cleanup_duplicates', requireAdmin, async (req, res) => {
    try {
        const references = await readReferences();
        const userCertificates = new Map();
        const duplicates = [];
        const cleaned = {};
        
        // Find the most recent certificate for each user
        for (const [refId, refData] of Object.entries(references)) {
            if (!refData.user) continue;
            
            const userKey = `${refData.user.name.trim().toLowerCase()}|${refData.user.email.trim().toLowerCase()}`;
            
            if (!userCertificates.has(userKey)) {
                userCertificates.set(userKey, refData);
                cleaned[refId] = refData;
            } else {
                const existing = userCertificates.get(userKey);
                const existingDate = new Date(existing.timestamp);
                const currentDate = new Date(refData.timestamp);
                
                // Keep the more recent one, or the one with more downloads
                if (currentDate > existingDate || 
                    (currentDate.getTime() === existingDate.getTime() && refData.download_count > existing.download_count)) {
                    
                    // Remove the old one from cleaned and add this one
                    duplicates.push(existing.id);
                    delete cleaned[existing.id];
                    
                    userCertificates.set(userKey, refData);
                    cleaned[refId] = refData;
                } else {
                    duplicates.push(refId);
                }
            }
        }
        
        // Save cleaned references
        await writeReferences(cleaned);
        
        res.json({
            success: true,
            message: `Cleanup completed. Removed ${duplicates.length} duplicate certificates.`,
            duplicates_removed: duplicates,
            total_certificates: Object.keys(cleaned).length
        });
    } catch (error) {
        console.error('Error cleaning duplicates:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Block direct access to data directory
app.use('/data', (req, res) => res.status(403).json({ error: 'Forbidden' }));

// Admin maintenance endpoints
app.post('/api/admin/clear_references', requireAdmin, async (req, res) => {
    try {
        await writeReferences({});
        return res.json({ success: true, message: 'All certificate references cleared.' });
    } catch (error) {
        console.error('Error clearing references:', error);
        return res.status(500).json({ error: 'Failed to clear references' });
    }
});

app.post('/api/admin/reset_system', requireAdmin, async (req, res) => {
    try {
        // Clear references and reset students CSV to just header
        await writeReferences({});
        // Read existing students to determine header fields if present
        await fs.writeFile(csvFile, 'name,email,eligibility\n', 'utf8');
        return res.json({ success: true, message: 'System reset completed.' });
    } catch (error) {
        console.error('Error resetting system:', error);
        return res.status(500).json({ error: 'Failed to reset system' });
    }
});

// Admin portal route: serve admin.html only when authenticated
app.get('/admin', (req, res) => {
    if (req.session && req.session.isAdmin) {
        return res.sendFile(path.join(__dirname, 'admin.html'));
    }
    return res.redirect('/admin-login.html');
});

// Serve static files
app.use(express.static(__dirname));

// Route for root path - redirect to index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route for login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize and start server
async function startServer() {
    try {
        await ensureDataDirectory();
        await initializeReferencesFile();
        await initializeStudentsCSV();
        
        app.listen(PORT, () => {
            console.log(`🚀 Certificate Generator API Server running on port ${PORT}`);
            console.log(`📡 API endpoint: http://localhost:${PORT}/api`);
            console.log(`🌐 Frontend: http://localhost:${PORT}`);
            console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;