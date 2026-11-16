const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite Database
const db = new sqlite3.Database('./must_venues.db', (err) => {
    if (err) console.error('Database connection error:', err.message);
    else console.log('Connected to MUST SQLite database.');
});

// Create Tables & Seed Initial MUST Campus Venues
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS venues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        building TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        facilities TEXT,
        status TEXT DEFAULT 'Available'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venue_id INTEGER NOT NULL,
        lecturer_name TEXT NOT NULL,
        course_code TEXT NOT NULL,
        booking_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        purpose TEXT,
        status TEXT DEFAULT 'Pending',
        FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
    )`);

    // Seed sample venues if table is empty
    db.get("SELECT COUNT(*) as count FROM venues", (err, row) => {
        if (row && row.count === 0) {
            const stmt = db.prepare("INSERT INTO venues (name, building, capacity, facilities, status) VALUES (?, ?, ?, ?, ?)");
            stmt.run("Nkrumah Hall", "Main Administration Block", 500, "Projector, PA System, AC", "Available");
            stmt.run("ICT Lab 1", "CoICT Building", 80, "Desktop PCs, Smart Board, Wi-Fi", "Available");
            stmt.run("Mechanical Workshop B", "Engineering Complex", 120, "Heavy Machinery, Whiteboard", "Available");
            stmt.run("Lecture Room LR-04", "Academic Block A", 150, "Projector, Whiteboard", "Maintenance");
            stmt.finalize();
            console.log("Seeded initial MUST campus venues.");
        }
    });
});

// ==========================================
// VENUE CRUD ENDPOINTS (Admin Operations)
// ==========================================

// READ all venues
app.get('/api/venues', (req, res) => {
    db.all("SELECT * FROM venues ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// CREATE a new venue
app.post('/api/venues', (req, res) => {
    const { name, building, capacity, facilities, status } = req.body;
    if (!name || !building || !capacity) {
        return res.status(400).json({ error: "Name, building, and capacity are required." });
    }
    const sql = "INSERT INTO venues (name, building, capacity, facilities, status) VALUES (?, ?, ?, ?, ?)";
    db.run(sql, [name, building, capacity, facilities || 'Standard', status || 'Available'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: "Venue added successfully!" });
    });
});

// UPDATE a venue
app.put('/api/venues/:id', (req, res) => {
    const { name, building, capacity, facilities, status } = req.body;
    const sql = "UPDATE venues SET name = ?, building = ?, capacity = ?, facilities = ?, status = ? WHERE id = ?";
    db.run(sql, [name, building, capacity, facilities, status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Venue updated successfully!" });
    });
});

// DELETE a venue
app.delete('/api/venues/:id', (req, res) => {
    db.run("DELETE FROM venues WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Venue deleted successfully!" });
    });
});

// ==========================================
// BOOKING / ALLOCATION CRUD ENDPOINTS
// ==========================================

// READ all bookings (joined with venue name)
app.get('/api/bookings', (req, res) => {
    const sql = `
        SELECT b.*, v.name AS venue_name, v.building 
        FROM bookings b 
        JOIN venues v ON b.venue_id = v.id 
        ORDER BY b.booking_date DESC, b.start_time ASC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// CREATE a venue allocation request (With Time-Clash Validation)
app.post('/api/bookings', (req, res) => {
    const { venue_id, lecturer_name, course_code, booking_date, start_time, end_time, purpose } = req.body;

    if (!venue_id || !lecturer_name || !course_code || !booking_date || !start_time || !end_time) {
        return res.status(400).json({ error: "All required fields must be filled." });
    }

    if (start_time >= end_time) {
        return res.status(400).json({ error: "End time must be after start time." });
    }

    // Check if venue is under maintenance
    db.get("SELECT status FROM venues WHERE id = ?", [venue_id], (err, venue) => {
        if (err || !venue) return res.status(404).json({ error: "Venue not found." });
        if (venue.status !== 'Available') {
            return res.status(400).json({ error: `This venue is currently ${venue.status} and cannot be booked.` });
        }

        // Check for overlapping approved or pending bookings on the same date & venue
        const clashSql = `
            SELECT * FROM bookings 
            WHERE venue_id = ? 
            AND booking_date = ? 
            AND status != 'Rejected'
            AND (? < end_time AND ? > start_time)
        `;
        db.get(clashSql, [venue_id, booking_date, start_time, end_time], (err, clash) => {
            if (err) return res.status(500).json({ error: err.message });
            if (clash) {
                return res.status(409).json({ 
                    error: `Time Clash! Already requested/booked by ${clash.lecturer_name} (${clash.course_code}) from ${clash.start_time} to ${clash.end_time}.` 
                });
            }

            // Insert new booking request
            const insertSql = `
                INSERT INTO bookings (venue_id, lecturer_name, course_code, booking_date, start_time, end_time, purpose, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')
            `;
            db.run(insertSql, [venue_id, lecturer_name, course_code, booking_date, start_time, end_time, purpose], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ id: this.lastID, message: "Venue allocation request submitted!" });
            });
        });
    });
});

// UPDATE booking status (Admin Approve/Reject) or details
app.put('/api/bookings/:id', (req, res) => {
    const { status } = req.body;
    db.run("UPDATE bookings SET status = ? WHERE id = ?", [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Booking status updated to ${status}.` });
    });
});

// DELETE / Cancel a booking
app.delete('/api/bookings/:id', (req, res) => {
    db.run("DELETE FROM bookings WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Booking record removed." });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});