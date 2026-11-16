const API_URL = `http://${window.location.hostname}:3000/api`;
let currentRole = 'lecturer';
let venuesList = [];

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get('role');
    if (roleParam === 'admin' || roleParam === 'lecturer') {
        document.getElementById('roleSelect').value = roleParam;
        switchRole();
        return;
    }
    fetchVenues();
    fetchBookings();
});

// Display Feedback Alert
function showAlert(message, type = 'success') {
    const alertBox = document.getElementById('alertBox');
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.classList.remove('hidden');
    setTimeout(() => alertBox.classList.add('hidden'), 4500);
}

// Switch between Lecturer and Admin Roles
function switchRole() {
    currentRole = document.getElementById('roleSelect').value;
    const adminSection = document.getElementById('adminSection');
    const lecturerSection = document.getElementById('lecturerSection');
    const adminCols = document.querySelectorAll('.admin-only');

    if (currentRole === 'admin') {
        adminSection.classList.remove('hidden');
        lecturerSection.classList.add('hidden');
        adminCols.forEach(el => el.classList.remove('hidden'));
    } else {
        adminSection.classList.add('hidden');
        lecturerSection.classList.remove('hidden');
        adminCols.forEach(el => el.classList.add('hidden'));
    }
    fetchVenues();
    fetchBookings();
}

// ==========================================
// VENUES CRUD OPERATIONS
// ==========================================

// READ Venues
async function fetchVenues() {
    const res = await fetch(`${API_URL}/venues`);
    venuesList = await res.json();

    // Populate Dropdown for Lecturer Booking Form
    const select = document.getElementById('bookingVenueId');
    select.innerHTML = '<option value="">-- Select Campus Venue --</option>';
    venuesList.forEach(v => {
        if (v.status === 'Available') {
            select.innerHTML += `<option value="${v.id}">${v.name} (${v.building} - Cap: ${v.capacity})</option>`;
        }
    });

    // Populate Venues Directory Table
    const tbody = document.getElementById('venuesTableBody');
    tbody.innerHTML = '';
    venuesList.forEach(v => {
        const badgeClass = v.status === 'Available' ? 'badge-available' : 'badge-maintenance';
        const adminButtons = currentRole === 'admin' ? `
            <td>
                <button class="btn btn-warning" onclick="editVenue(${v.id})">Edit</button>
                <button class="btn btn-danger" onclick="deleteVenue(${v.id})">Delete</button>
            </td>
        ` : '';

        tbody.innerHTML += `
            <tr>
                <td><strong>${v.name}</strong></td>
                <td>${v.building}</td>
                <td>${v.capacity} Seats</td>
                <td>${v.facilities}</td>
                <td><span class="badge ${badgeClass}">${v.status}</span></td>
                ${adminButtons}
            </tr>
        `;
    });
}

// CREATE or UPDATE Venue
document.getElementById('venueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editVenueId').value;
    const payload = {
        name: document.getElementById('venueName').value,
        building: document.getElementById('venueBuilding').value,
        capacity: document.getElementById('venueCapacity').value,
        facilities: document.getElementById('venueFacilities').value,
        status: document.getElementById('venueStatus').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/venues/${id}` : `${API_URL}/venues`;

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (res.ok) {
        showAlert(data.message, 'success');
        resetVenueForm();
        fetchVenues();
    } else {
        showAlert(data.error, 'error');
    }
});

// Populate Form for Editing (Update)
function editVenue(id) {
    const venue = venuesList.find(v => v.id === id);
    if (!venue) return;

    document.getElementById('editVenueId').value = venue.id;
    document.getElementById('venueName').value = venue.name;
    document.getElementById('venueBuilding').value = venue.building;
    document.getElementById('venueCapacity').value = venue.capacity;
    document.getElementById('venueFacilities').value = venue.facilities;
    document.getElementById('venueStatus').value = venue.status;

    document.getElementById('venueFormTitle').textContent = `Edit Venue: ${venue.name}`;
    document.getElementById('saveVenueBtn').textContent = 'Update Venue';
    document.getElementById('cancelEditBtn').classList.remove('hidden');
}

function resetVenueForm() {
    document.getElementById('venueForm').reset();
    document.getElementById('editVenueId').value = '';
    document.getElementById('venueFormTitle').textContent = 'Add New Campus Venue';
    document.getElementById('saveVenueBtn').textContent = 'Add Venue';
    document.getElementById('cancelEditBtn').classList.add('hidden');
}

// DELETE Venue
async function deleteVenue(id) {
    if (!confirm('Are you sure you want to delete this venue and its associated bookings?')) return;
    const res = await fetch(`${API_URL}/venues/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
        showAlert(data.message, 'success');
        fetchVenues();
        fetchBookings();
    }
}

// ==========================================
// BOOKINGS / REQUESTS CRUD OPERATIONS
// ==========================================

// READ Bookings
async function fetchBookings() {
    const res = await fetch(`${API_URL}/bookings`);
    const bookings = await res.json();
    const tbody = document.getElementById('bookingsTableBody');
    tbody.innerHTML = '';

    bookings.forEach(b => {
        let badgeClass = 'badge-pending';
        if (b.status === 'Approved') badgeClass = 'badge-approved';
        if (b.status === 'Rejected') badgeClass = 'badge-rejected';

        let actionButtons = '';
        if (currentRole === 'admin') {
            actionButtons = `
                ${b.status === 'Pending' ? `
                    <button class="btn btn-success" onclick="updateBookingStatus(${b.id}, 'Approved')">Approve</button>
                    <button class="btn btn-warning" onclick="updateBookingStatus(${b.id}, 'Rejected')">Reject</button>
                ` : ''}
                <button class="btn btn-danger" onclick="deleteBooking(${b.id})">Delete</button>
            `;
        } else {
            actionButtons = `
                <button class="btn btn-danger" onclick="deleteBooking(${b.id})">Cancel</button>
            `;
        }

        tbody.innerHTML += `
            <tr>
                <td><strong>${b.venue_name}</strong><br><small>${b.building}</small></td>
                <td>${b.lecturer_name}<br><small><strong>${b.course_code}</strong></small></td>
                <td>${b.booking_date}<br><small>${b.start_time} - ${b.end_time}</small></td>
                <td>${b.purpose || '-'}</td>
                <td><span class="badge ${badgeClass}">${b.status}</span></td>
                <td>${actionButtons}</td>
            </tr>
        `;
    });
}

// CREATE Booking Request
document.getElementById('bookingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        venue_id: document.getElementById('bookingVenueId').value,
        lecturer_name: document.getElementById('lecturerName').value,
        course_code: document.getElementById('courseCode').value,
        booking_date: document.getElementById('bookingDate').value,
        start_time: document.getElementById('startTime').value,
        end_time: document.getElementById('endTime').value,
        purpose: document.getElementById('purpose').value
    };

    const res = await fetch(`${API_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (res.ok) {
        showAlert(data.message, 'success');
        document.getElementById('bookingForm').reset();
        fetchBookings();
    } else {
        showAlert(data.error, 'error');
    }
});

// UPDATE Booking Status (Approve/Reject)
async function updateBookingStatus(id, status) {
    const res = await fetch(`${API_URL}/bookings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (res.ok) {
        showAlert(data.message, 'success');
        fetchBookings();
    }
}

// DELETE Booking
async function deleteBooking(id) {
    if (!confirm('Remove this booking record?')) return;
    const res = await fetch(`${API_URL}/bookings/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
        showAlert(data.message, 'success');
        fetchBookings();
    }
}