// Within EMR — Application
import { supabase } from '../../shared/supabase.js';
import { initAuth, signOut, getAuthState, onAuthStateChange, getBasePath } from '../../shared/auth.js';

// ============================================
// CONFIG & AUTH
// ============================================
const ALLOWED_EMAILS = [
  'justin@within.center',
  'lauren@awknranch.com',
  'wdnaylor@gmail.com',
];

const CACHED_AUTH_KEY = 'awkn-ranch-cached-auth';

const EMR_TABLES = {
  patients: 'within_patients',
  sessions: 'within_sessions',
  assessments: 'within_assessments',
  notes: 'within_notes',
  appointments: 'within_appointments',
  consents: 'within_consents',
  inventory: 'within_inventory',
  invoices: 'within_invoices',
  vitals: 'within_session_vitals',
};

// In-memory data store (loaded from Supabase)
const store = {
  patients: [],
  sessions: [],
  assessments: [],
  notes: [],
  appointments: [],
  consents: [],
  inventory: [],
  invoices: [],
};

let currentDate = new Date();
let vitalsCount = 1;

// ============================================
// INIT
// ============================================
async function init() {
  try {
    await initAuth();

    let state = getAuthState();
    if (state.isAuthenticated && state.isPending) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 12000);
        const unsub = onAuthStateChange((s) => {
          if (!s.isPending) { clearTimeout(timeout); unsub(); resolve(); }
        });
      });
    }

    state = getAuthState();
    const email = state.user?.email?.toLowerCase();

    if (!state.isAuthenticated || !ALLOWED_EMAILS.includes(email)) {
      window.location.href = getBasePath() + '/within/';
      return;
    }

    // Set user info
    const name = state.user?.displayName || state.appUser?.display_name || email;
    document.getElementById('userName').textContent = name;
    document.getElementById('userEmail').textContent = email;
    document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();

    // Show app
    document.getElementById('loadingOverlay').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');

    // Load data
    await loadAllData();
    renderDashboard();
    renderScheduleDate();

    setupEventListeners();
  } catch (error) {
    console.error('[WITHIN EMR]', error);
    showToast('Failed to initialize: ' + error.message, 'error');
  }
}

// ============================================
// DATA LOADING
// ============================================
async function loadAllData() {
  const loads = [
    loadTable('patients'),
    loadTable('sessions'),
    loadTable('assessments'),
    loadTable('notes'),
    loadTable('appointments'),
    loadTable('consents'),
    loadTable('inventory'),
    loadTable('invoices'),
  ];
  await Promise.allSettled(loads);
}

async function loadTable(key) {
  try {
    const { data, error } = await supabase
      .from(EMR_TABLES[key])
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // Table might not exist yet — that's fine, we'll create it
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.log(`[EMR] Table ${EMR_TABLES[key]} not found, using empty data`);
        store[key] = [];
        return;
      }
      throw error;
    }
    store[key] = data || [];
  } catch (e) {
    console.warn(`[EMR] Failed to load ${key}:`, e.message);
    store[key] = [];
  }
}

// ============================================
// SAVE HELPERS
// ============================================
async function saveRecord(table, data) {
  try {
    const { data: result, error } = await supabase
      .from(EMR_TABLES[table])
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    store[table].unshift(result);
    return result;
  } catch (e) {
    // If table doesn't exist, store locally
    if (e.code === '42P01' || e.message?.includes('does not exist')) {
      const localRecord = { id: crypto.randomUUID(), ...data, created_at: new Date().toISOString() };
      store[table].unshift(localRecord);
      showToast('Saved locally (database table pending setup)', 'info');
      return localRecord;
    }
    throw e;
  }
}

// ============================================
// TAB NAVIGATION
// ============================================
const TAB_TITLES = {
  dashboard: ['Dashboard', 'Overview of your clinic'],
  patients: ['Patients', 'Manage patient records'],
  schedule: ['Schedule', 'Appointments and calendar'],
  sessions: ['Treatment Sessions', 'Ketamine therapy session documentation'],
  outcomes: ['Outcome Measures', 'PHQ-9, GAD-7, PCL-5 tracking'],
  consents: ['Consents', 'Consent document management'],
  notes: ['Clinical Notes', 'SOAP notes and documentation'],
  inventory: ['Inventory', 'Controlled substance log (DEA compliance)'],
  billing: ['Billing', 'Invoices and payments'],
};

function switchTab(tabName) {
  // Update nav
  document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === tabName);
  });

  // Update topbar
  const [title, subtitle] = TAB_TITLES[tabName] || [tabName, ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSubtitle').textContent = subtitle;

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.add('hidden');

  // Refresh tab data
  refreshTab(tabName);
}

// Make switchTab global for onclick handlers
window.switchTab = switchTab;

function refreshTab(tabName) {
  switch (tabName) {
    case 'dashboard': renderDashboard(); break;
    case 'patients': renderPatients(); break;
    case 'schedule': renderSchedule(); break;
    case 'sessions': renderSessions(); break;
    case 'outcomes': renderOutcomes(); break;
    case 'consents': renderConsents(); break;
    case 'notes': renderNotes(); break;
    case 'inventory': renderInventory(); break;
    case 'billing': renderBilling(); break;
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
  // Sidebar nav
  document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Sign out
  document.getElementById('signOutBtn').addEventListener('click', async () => {
    await signOut();
    window.location.href = getBasePath() + '/within/';
  });

  // Mobile menu
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('hidden');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.add('hidden');
  });

  // Modal close buttons
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.closeModal).classList.add('hidden');
    });
  });

  // Modal overlay click to close
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  // Add Patient
  document.getElementById('addPatientBtn').addEventListener('click', () => openPatientModal());
  document.getElementById('savePatientBtn').addEventListener('click', () => savePatient());

  // New Session
  document.getElementById('newSessionBtn').addEventListener('click', () => openSessionModal());
  document.getElementById('saveSessionBtn').addEventListener('click', () => saveSession());

  // New Assessment
  document.getElementById('newAssessmentBtn').addEventListener('click', () => openAssessmentModal());
  document.getElementById('saveAssessmentBtn').addEventListener('click', () => saveAssessment());

  // New Note
  document.getElementById('newNoteBtn').addEventListener('click', () => openNoteModal());
  document.getElementById('saveNoteBtn').addEventListener('click', () => saveNote());

  // New Appointment
  document.getElementById('addApptBtn').addEventListener('click', () => openApptModal());
  document.getElementById('saveApptBtn').addEventListener('click', () => saveAppointment());

  // Add vitals entry
  document.getElementById('addVitalEntry').addEventListener('click', addVitalsRow);

  // Auto-calculate mg/kg
  const doseInput = document.querySelector('[name="dose_mg"]');
  const weightInput = document.querySelector('[name="weight_kg"]');
  const mgkgInput = document.querySelector('[name="dose_mg_kg"]');
  if (doseInput && weightInput) {
    const calcMgKg = () => {
      const dose = parseFloat(doseInput.value);
      const weight = parseFloat(weightInput.value);
      mgkgInput.value = (dose && weight) ? (dose / weight).toFixed(2) : '';
    };
    doseInput.addEventListener('input', calcMgKg);
    weightInput.addEventListener('input', calcMgKg);
  }

  // Auto-sum PHQ-9
  document.querySelectorAll('[name^="phq9_q"]').forEach(input => {
    input.addEventListener('input', () => {
      let sum = 0;
      document.querySelectorAll('[name^="phq9_q"]').forEach(q => {
        sum += parseInt(q.value) || 0;
      });
      const scoreInput = document.querySelector('#assessmentForm [name="score"]');
      if (scoreInput) scoreInput.value = sum;
    });
  });

  // Schedule navigation
  document.getElementById('prevDay').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() - 1);
    renderScheduleDate();
    renderSchedule();
  });
  document.getElementById('nextDay').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() + 1);
    renderScheduleDate();
    renderSchedule();
  });
  document.getElementById('todayBtn').addEventListener('click', () => {
    currentDate = new Date();
    renderScheduleDate();
    renderSchedule();
  });

  // Search handlers
  document.getElementById('patientSearch')?.addEventListener('input', renderPatients);
  document.getElementById('sessionSearch')?.addEventListener('input', renderSessions);
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderDashboard() {
  const activePatients = store.patients.filter(p => p.status !== 'inactive' && !p.is_archived);
  document.getElementById('statTotalPatients').textContent = activePatients.length;

  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = store.appointments.filter(a => a.appt_date === today);
  document.getElementById('statTodaySessions').textContent = todaySessions.length;

  const pendingConsents = store.consents.filter(c => c.status === 'sent' || c.status === 'pending');
  document.getElementById('statPendingConsents').textContent = pendingConsents.length;

  // Today's schedule on dashboard
  const dashSchedule = document.getElementById('dashTodaySchedule');
  if (todaySessions.length > 0) {
    dashSchedule.innerHTML = todaySessions.slice(0, 5).map(a => {
      const patient = store.patients.find(p => p.id === a.patient_id);
      const name = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown';
      return `<div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border);">
        <span style="font-weight:500;">${name}</span>
        <span style="color:var(--text-muted);font-size:0.8125rem;">${a.appt_time || ''} &middot; ${formatApptType(a.appt_type)}</span>
      </div>`;
    }).join('');
  } else {
    dashSchedule.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">calendar_month</span><p>No sessions scheduled today</p></div>';
  }

  // Recent patients
  const dashPatients = document.getElementById('dashRecentPatients');
  if (activePatients.length > 0) {
    dashPatients.innerHTML = activePatients.slice(0, 5).map(p => {
      return `<div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border);">
        <span style="font-weight:500;">${p.first_name} ${p.last_name}</span>
        <span class="badge badge--active">Active</span>
      </div>`;
    }).join('');
  } else {
    dashPatients.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">group</span><p>No patients yet</p></div>';
  }
}

function renderPatients() {
  const search = document.getElementById('patientSearch')?.value?.toLowerCase() || '';
  const filtered = store.patients.filter(p => {
    if (p.is_archived) return false;
    if (!search) return true;
    return `${p.first_name} ${p.last_name} ${p.email} ${p.phone}`.toLowerCase().includes(search);
  });

  const tbody = document.getElementById('patientsBody');
  const empty = document.getElementById('patientsEmpty');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    document.getElementById('patientsTable').classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  document.getElementById('patientsTable').classList.remove('hidden');

  tbody.innerHTML = filtered.map(p => {
    const sessionCount = store.sessions.filter(s => s.patient_id === p.id).length;
    const lastSession = store.sessions.find(s => s.patient_id === p.id);
    return `<tr>
      <td style="font-weight:500;">${p.first_name} ${p.last_name}</td>
      <td>${p.dob || '--'}</td>
      <td>${p.phone || '--'}</td>
      <td><span class="badge badge--${p.status === 'inactive' ? 'cancelled' : 'active'}">${p.status || 'Active'}</span></td>
      <td>${lastSession?.session_date || '--'}</td>
      <td>${sessionCount}</td>
      <td>
        <div class="row-actions">
          <button title="View" onclick="viewPatient('${p.id}')"><span class="material-symbols-outlined">visibility</span></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderScheduleDate() {
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('scheduleDate').textContent = currentDate.toLocaleDateString('en-US', opts);

  // Set default date on appointment modal
  const apptDateInput = document.querySelector('#apptForm [name="appt_date"]');
  if (apptDateInput) apptDateInput.value = currentDate.toISOString().slice(0, 10);
}

function renderSchedule() {
  const dateStr = currentDate.toISOString().slice(0, 10);
  const appts = store.appointments
    .filter(a => a.appt_date === dateStr)
    .sort((a, b) => (a.appt_time || '').localeCompare(b.appt_time || ''));

  const grid = document.getElementById('scheduleGrid');
  const empty = document.getElementById('scheduleEmpty');

  if (appts.length === 0) {
    grid.innerHTML = '';
    grid.appendChild(empty);
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = appts.map(a => {
    const patient = store.patients.find(p => p.id === a.patient_id);
    const name = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient';
    return `<div class="schedule-item">
      <div class="schedule-item__time">${a.appt_time || '--:--'}</div>
      <div class="schedule-item__details">
        <div class="schedule-item__patient">${name}</div>
        <div class="schedule-item__type">${formatApptType(a.appt_type)}</div>
        ${a.room ? `<div class="schedule-item__room">${a.room}</div>` : ''}
      </div>
      <span class="badge badge--${a.status === 'completed' ? 'completed' : a.status === 'cancelled' ? 'cancelled' : 'active'}">${a.status || 'Scheduled'}</span>
    </div>`;
  }).join('');
}

function renderSessions() {
  const search = document.getElementById('sessionSearch')?.value?.toLowerCase() || '';
  const filtered = store.sessions.filter(s => {
    if (!search) return true;
    const patient = store.patients.find(p => p.id === s.patient_id);
    const name = patient ? `${patient.first_name} ${patient.last_name}` : '';
    return `${name} ${s.route} ${s.session_date}`.toLowerCase().includes(search);
  });

  const tbody = document.getElementById('sessionsBody');
  const empty = document.getElementById('sessionsEmpty');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    document.getElementById('sessionsTable').classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  document.getElementById('sessionsTable').classList.remove('hidden');

  tbody.innerHTML = filtered.map(s => {
    const patient = store.patients.find(p => p.id === s.patient_id);
    const name = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown';
    return `<tr>
      <td>${s.session_date || '--'}</td>
      <td style="font-weight:500;">${name}</td>
      <td>${s.route || '--'}</td>
      <td>${s.dose_mg ? s.dose_mg + ' mg' : '--'}</td>
      <td>${s.duration_min ? s.duration_min + ' min' : '--'}</td>
      <td><span class="badge badge--${s.status === 'completed' ? 'completed' : s.status === 'in_progress' ? 'in-progress' : 'active'}">${s.status || 'Documented'}</span></td>
      <td>
        <div class="row-actions">
          <button title="View"><span class="material-symbols-outlined">visibility</span></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderOutcomes() {
  populatePatientSelects();
}

function renderConsents() {
  const filtered = store.consents;
  const tbody = document.getElementById('consentsBody');
  const empty = document.getElementById('consentsEmpty');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    document.getElementById('consentsTable').classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  document.getElementById('consentsTable').classList.remove('hidden');

  tbody.innerHTML = filtered.map(c => {
    const patient = store.patients.find(p => p.id === c.patient_id);
    const name = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown';
    return `<tr>
      <td style="font-weight:500;">${name}</td>
      <td>${c.document_type || '--'}</td>
      <td>${c.sent_date || '--'}</td>
      <td><span class="badge badge--${c.status === 'signed' ? 'signed' : c.status === 'sent' ? 'sent' : 'draft'}">${c.status || 'Draft'}</span></td>
      <td>${c.signed_date || '--'}</td>
      <td><div class="row-actions"><button title="View"><span class="material-symbols-outlined">visibility</span></button></div></td>
    </tr>`;
  }).join('');
}

function renderNotes() {
  const filtered = store.notes;
  const tbody = document.getElementById('notesBody');
  const empty = document.getElementById('notesEmpty');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    document.getElementById('notesTable').classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  document.getElementById('notesTable').classList.remove('hidden');

  tbody.innerHTML = filtered.map(n => {
    const patient = store.patients.find(p => p.id === n.patient_id);
    const name = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown';
    return `<tr>
      <td>${n.note_date || '--'}</td>
      <td style="font-weight:500;">${name}</td>
      <td>${formatNoteType(n.note_type)}</td>
      <td>${n.provider || '--'}</td>
      <td><span class="badge badge--${n.status === 'signed' ? 'signed' : 'draft'}">${n.status || 'Draft'}</span></td>
      <td><div class="row-actions"><button title="View"><span class="material-symbols-outlined">visibility</span></button></div></td>
    </tr>`;
  }).join('');
}

function renderInventory() {
  const filtered = store.inventory;
  const tbody = document.getElementById('inventoryBody');
  const empty = document.getElementById('inventoryEmpty');

  // Calculate stock
  let balance = 0;
  const sorted = [...filtered].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  sorted.forEach(entry => {
    if (entry.type === 'received') balance += (entry.quantity || 0);
    else balance -= (entry.quantity || 0);
  });
  document.getElementById('invKetamineStock').textContent = balance > 0 ? balance.toFixed(1) : '--';

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    document.getElementById('inventoryTable').classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  document.getElementById('inventoryTable').classList.remove('hidden');

  let runningBal = 0;
  const rows = sorted.map(entry => {
    if (entry.type === 'received') runningBal += (entry.quantity || 0);
    else runningBal -= (entry.quantity || 0);
    return `<tr>
      <td>${entry.entry_date || new Date(entry.created_at).toLocaleDateString()}</td>
      <td><span class="badge badge--${entry.type === 'received' ? 'active' : entry.type === 'administered' ? 'completed' : 'cancelled'}">${entry.type}</span></td>
      <td>${entry.lot_number || '--'}</td>
      <td>${entry.quantity || '--'}</td>
      <td>${runningBal.toFixed(1)}</td>
      <td>${entry.witness || '--'}</td>
      <td>${entry.notes || '--'}</td>
    </tr>`;
  });

  tbody.innerHTML = rows.join('');
}

function renderBilling() {
  const filtered = store.invoices;
  const tbody = document.getElementById('billingBody');
  const empty = document.getElementById('billingEmpty');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    document.getElementById('billingTable').classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  document.getElementById('billingTable').classList.remove('hidden');

  tbody.innerHTML = filtered.map(inv => {
    const patient = store.patients.find(p => p.id === inv.patient_id);
    const name = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown';
    return `<tr>
      <td>${inv.invoice_number || '--'}</td>
      <td style="font-weight:500;">${name}</td>
      <td>${inv.invoice_date || '--'}</td>
      <td>$${(inv.amount || 0).toFixed(2)}</td>
      <td><span class="badge badge--${inv.status === 'paid' ? 'active' : inv.status === 'overdue' ? 'cancelled' : 'pending'}">${inv.status || 'Pending'}</span></td>
      <td><div class="row-actions"><button title="View"><span class="material-symbols-outlined">visibility</span></button></div></td>
    </tr>`;
  }).join('');

  // Summaries
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const collected = filtered.filter(i => i.status === 'paid' && i.invoice_date?.startsWith(thisMonth)).reduce((s, i) => s + (i.amount || 0), 0);
  const outstanding = filtered.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.amount || 0), 0);
  document.getElementById('billCollected').textContent = '$' + collected.toFixed(2);
  document.getElementById('billOutstanding').textContent = '$' + outstanding.toFixed(2);
}

// ============================================
// MODAL HELPERS
// ============================================

function populatePatientSelects() {
  const options = store.patients
    .filter(p => !p.is_archived)
    .map(p => `<option value="${p.id}">${p.first_name} ${p.last_name}</option>`)
    .join('');

  ['sessionPatientSelect', 'assessmentPatientSelect', 'notePatientSelect', 'apptPatientSelect', 'outcomesPatientSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const firstOpt = el.querySelector('option:first-child');
      el.innerHTML = '';
      el.appendChild(firstOpt);
      el.insertAdjacentHTML('beforeend', options);
    }
  });
}

function openPatientModal() {
  document.getElementById('patientForm').reset();
  document.getElementById('patientModalTitle').textContent = 'Add New Patient';
  document.getElementById('patientModal').classList.remove('hidden');
}

function openSessionModal() {
  document.getElementById('sessionForm').reset();
  document.getElementById('sessionModalTitle').textContent = 'New Treatment Session';
  document.querySelector('#sessionForm [name="session_date"]').value = new Date().toISOString().slice(0, 10);
  vitalsCount = 1;
  document.getElementById('vitalsLog').innerHTML = buildVitalsRow(0);
  populatePatientSelects();
  document.getElementById('sessionModal').classList.remove('hidden');
}

function openAssessmentModal() {
  document.getElementById('assessmentForm').reset();
  document.querySelector('#assessmentForm [name="assessment_date"]').value = new Date().toISOString().slice(0, 10);
  populatePatientSelects();
  document.getElementById('assessmentModal').classList.remove('hidden');
}

function openNoteModal() {
  document.getElementById('noteForm').reset();
  document.querySelector('#noteForm [name="note_date"]').value = new Date().toISOString().slice(0, 10);
  populatePatientSelects();
  document.getElementById('noteModal').classList.remove('hidden');
}

function openApptModal() {
  document.getElementById('apptForm').reset();
  document.querySelector('#apptForm [name="appt_date"]').value = currentDate.toISOString().slice(0, 10);
  populatePatientSelects();
  document.getElementById('apptModal').classList.remove('hidden');
}

// ============================================
// SAVE FUNCTIONS
// ============================================

async function savePatient() {
  const form = document.getElementById('patientForm');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const fd = new FormData(form);
  const data = {
    first_name: fd.get('first_name'),
    last_name: fd.get('last_name'),
    dob: fd.get('dob'),
    sex: fd.get('sex'),
    gender_identity: fd.get('gender_identity'),
    pronouns: fd.get('pronouns'),
    email: fd.get('email'),
    phone: fd.get('phone'),
    address: fd.get('address'),
    emergency_name: fd.get('emergency_name'),
    emergency_relationship: fd.get('emergency_relationship'),
    emergency_phone: fd.get('emergency_phone'),
    primary_diagnosis: fd.get('primary_diagnosis'),
    referring_provider: fd.get('referring_provider'),
    current_medications: fd.get('current_medications'),
    allergies: fd.get('allergies'),
    medical_history: fd.get('medical_history'),
    contraindications: JSON.stringify({
      hypertension: fd.get('contra_hypertension') === 'on',
      psychosis: fd.get('contra_psychosis') === 'on',
      pregnancy: fd.get('contra_pregnancy') === 'on',
      allergy: fd.get('contra_allergy') === 'on',
      substance: fd.get('contra_substance') === 'on',
      icp: fd.get('contra_icp') === 'on',
      hepatic: fd.get('contra_hepatic') === 'on',
    }),
    status: 'active',
  };

  try {
    await saveRecord('patients', data);
    document.getElementById('patientModal').classList.add('hidden');
    showToast('Patient added successfully', 'success');
    renderPatients();
    renderDashboard();
  } catch (e) {
    showToast('Error saving patient: ' + e.message, 'error');
  }
}

async function saveSession() {
  const form = document.getElementById('sessionForm');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const fd = new FormData(form);

  // Collect vitals log
  const vitals = [];
  for (let i = 0; i < vitalsCount; i++) {
    const time = fd.get(`vital_time_${i}`);
    if (time) {
      vitals.push({
        time,
        bp: fd.get(`vital_bp_${i}`),
        hr: fd.get(`vital_hr_${i}`),
        spo2: fd.get(`vital_spo2_${i}`),
        rr: fd.get(`vital_rr_${i}`),
        sedation: fd.get(`vital_sedation_${i}`),
      });
    }
  }

  const data = {
    patient_id: fd.get('patient_id'),
    session_date: fd.get('session_date'),
    session_number: fd.get('session_number') ? parseInt(fd.get('session_number')) : null,
    provider: fd.get('provider'),
    route: fd.get('route'),
    drug: fd.get('drug'),
    weight_kg: fd.get('weight_kg') ? parseFloat(fd.get('weight_kg')) : null,
    dose_mg: fd.get('dose_mg') ? parseFloat(fd.get('dose_mg')) : null,
    dose_mg_kg: fd.get('dose_mg_kg') ? parseFloat(fd.get('dose_mg_kg')) : null,
    duration_min: fd.get('duration_min') ? parseInt(fd.get('duration_min')) : null,
    lot_number: fd.get('lot_number'),
    lot_expiration: fd.get('lot_expiration'),
    pre_vitals: JSON.stringify({
      bp_systolic: fd.get('pre_bp_systolic'),
      bp_diastolic: fd.get('pre_bp_diastolic'),
      hr: fd.get('pre_hr'),
      spo2: fd.get('pre_spo2'),
      temp: fd.get('pre_temp'),
      rr: fd.get('pre_rr'),
    }),
    post_vitals: JSON.stringify({
      bp_systolic: fd.get('post_bp_systolic'),
      bp_diastolic: fd.get('post_bp_diastolic'),
      hr: fd.get('post_hr'),
      spo2: fd.get('post_spo2'),
    }),
    intra_vitals: JSON.stringify(vitals),
    last_meal_time: fd.get('last_meal_time'),
    meds_today: fd.get('meds_today'),
    pre_screening_notes: fd.get('pre_screening_notes'),
    go_decision: fd.get('go_decision') === 'on',
    side_effects: JSON.stringify({
      nausea: fd.get('se_nausea') === 'on',
      hypertension: fd.get('se_hypertension') === 'on',
      dissociation: fd.get('se_dissociation') === 'on',
      anxiety: fd.get('se_anxiety') === 'on',
      headache: fd.get('se_headache') === 'on',
      dizziness: fd.get('se_dizziness') === 'on',
      blurred_vision: fd.get('se_blurred_vision') === 'on',
    }),
    adjunct_meds: fd.get('adjunct_meds'),
    session_notes: fd.get('session_notes'),
    discharge_criteria: JSON.stringify({
      oriented: fd.get('dc_oriented') === 'on',
      ambulating: fd.get('dc_ambulating') === 'on',
      bp_normal: fd.get('dc_bp_normal') === 'on',
      no_nausea: fd.get('dc_no_nausea') === 'on',
      transport: fd.get('dc_transport') === 'on',
    }),
    discharge_time: fd.get('discharge_time'),
    discharge_notes: fd.get('discharge_notes'),
    status: 'completed',
  };

  try {
    await saveRecord('sessions', data);
    document.getElementById('sessionModal').classList.add('hidden');
    showToast('Treatment session saved', 'success');
    renderSessions();
    renderDashboard();
  } catch (e) {
    showToast('Error saving session: ' + e.message, 'error');
  }
}

async function saveAssessment() {
  const form = document.getElementById('assessmentForm');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const fd = new FormData(form);

  // Collect item scores for PHQ-9
  const items = {};
  for (let i = 1; i <= 9; i++) {
    const val = fd.get(`phq9_q${i}`);
    if (val !== null && val !== '') items[`q${i}`] = parseInt(val);
  }

  const data = {
    patient_id: fd.get('patient_id'),
    assessment_date: fd.get('assessment_date'),
    measure: fd.get('measure'),
    score: parseInt(fd.get('score')),
    item_scores: Object.keys(items).length > 0 ? JSON.stringify(items) : null,
  };

  // PHQ-9 Q9 alert
  if (items.q9 && items.q9 > 0) {
    showToast('ALERT: Patient endorsed suicidal ideation (PHQ-9 Item 9). Assess with C-SSRS.', 'error');
  }

  try {
    await saveRecord('assessments', data);
    document.getElementById('assessmentModal').classList.add('hidden');
    showToast('Assessment saved', 'success');
    renderOutcomes();
  } catch (e) {
    showToast('Error saving assessment: ' + e.message, 'error');
  }
}

async function saveNote() {
  const form = document.getElementById('noteForm');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const fd = new FormData(form);
  const data = {
    patient_id: fd.get('patient_id'),
    note_date: fd.get('note_date'),
    note_type: fd.get('note_type'),
    provider: fd.get('provider'),
    subjective: fd.get('subjective'),
    objective: fd.get('objective'),
    assessment: fd.get('assessment'),
    plan: fd.get('plan'),
    status: 'draft',
  };

  try {
    await saveRecord('notes', data);
    document.getElementById('noteModal').classList.add('hidden');
    showToast('Note saved', 'success');
    renderNotes();
  } catch (e) {
    showToast('Error saving note: ' + e.message, 'error');
  }
}

async function saveAppointment() {
  const form = document.getElementById('apptForm');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const fd = new FormData(form);
  const data = {
    patient_id: fd.get('patient_id'),
    appt_date: fd.get('appt_date'),
    appt_time: fd.get('appt_time'),
    appt_type: fd.get('appt_type'),
    provider: fd.get('provider'),
    room: fd.get('room'),
    notes: fd.get('notes'),
    status: 'scheduled',
  };

  try {
    await saveRecord('appointments', data);
    document.getElementById('apptModal').classList.add('hidden');
    showToast('Appointment scheduled', 'success');
    renderSchedule();
    renderDashboard();
  } catch (e) {
    showToast('Error saving appointment: ' + e.message, 'error');
  }
}

// ============================================
// VITALS LOG
// ============================================

function buildVitalsRow(index) {
  return `<div class="vitals-entry">
    <div class="form-grid form-grid--tight">
      <div class="form-group"><label>Time</label><input type="time" name="vital_time_${index}"></div>
      <div class="form-group"><label>BP</label><input type="text" name="vital_bp_${index}" placeholder="120/80"></div>
      <div class="form-group"><label>HR</label><input type="number" name="vital_hr_${index}" placeholder="bpm"></div>
      <div class="form-group"><label>SpO2</label><input type="number" name="vital_spo2_${index}" placeholder="%"></div>
      <div class="form-group"><label>RR</label><input type="number" name="vital_rr_${index}" placeholder="/min"></div>
      <div class="form-group"><label>Sedation</label>
        <select name="vital_sedation_${index}">
          <option value="">--</option>
          <option value="1">1 - Alert</option>
          <option value="2">2 - Drowsy</option>
          <option value="3">3 - Light sedation</option>
          <option value="4">4 - Moderate</option>
          <option value="5">5 - Deep</option>
        </select>
      </div>
    </div>
  </div>`;
}

function addVitalsRow() {
  document.getElementById('vitalsLog').insertAdjacentHTML('beforeend', buildVitalsRow(vitalsCount));
  vitalsCount++;
}

// ============================================
// UTILITIES
// ============================================

function formatApptType(type) {
  const map = {
    initial_consult: 'Initial Consultation',
    iv_infusion: 'IV Infusion',
    im_session: 'IM Session',
    sublingual: 'Sublingual Session',
    integration: 'Integration Therapy',
    followup: 'Follow-Up',
    telehealth: 'Telehealth',
  };
  return map[type] || type || '--';
}

function formatNoteType(type) {
  const map = {
    soap: 'SOAP Note',
    initial_eval: 'Initial Evaluation',
    integration: 'Integration Therapy',
    consultation: 'Consultation',
  };
  return map[type] || type || '--';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}

// Global for onclick in HTML
window.viewPatient = function(id) {
  const patient = store.patients.find(p => p.id === id);
  if (patient) {
    showToast(`Patient: ${patient.first_name} ${patient.last_name} — Full patient view coming soon`, 'info');
  }
};

// ============================================
// BOOT
// ============================================
init();
