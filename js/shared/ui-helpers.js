/**
 * ============================================
 * Messliner — Global UI & Modal Helpers (ui-helpers.js)
 * Version: 1.0.0
 * Handles Modals, Sidebar, Drawers, Icons, and Dropdown Outside-Clicks
 * ============================================
 */

/* Global Modal Helpers */
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (['editProfileModal', 'changePasswordModal', 'supportModal'].includes(id)) {
    modal.classList.add('sheet-closing');
    setTimeout(() => {
      modal.classList.remove('active', 'sheet-closing');
    }, 240);
  } else {
    modal.classList.remove('active');
  }
}

function openModal(id) {
  let modal = document.getElementById(id);
  if (!modal && !window._modalsLoaded) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'views/shared/modals.html', false);
      xhr.send(null);
      if (xhr.status === 200 || xhr.status === 0) {
        var c = document.getElementById('modalsContainer') || document.body;
        c.innerHTML = xhr.responseText;
        window._modalsLoaded = true;
        modal = document.getElementById(id);
      }
    } catch (_) {}
  }
  if (modal) {
    modal.classList.remove('sheet-closing');
    modal.classList.add('active');
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('active');
}

/* Sign Out Confirmation Modal */
function showSignOutConfirm() {
  const modal = document.getElementById('signOutModal');
  if (!modal) return;
  modal.classList.remove('so-closing');
  modal.classList.add('active');
}

function closeSignOutModal() {
  const modal = document.getElementById('signOutModal');
  if (!modal) return;
  modal.classList.add('so-closing');
  setTimeout(() => { modal.classList.remove('active', 'so-closing'); }, 230);
}

/* Edit Profile Modal */
function openEditProfileModal() {
  const user = (window.Messliner && Messliner.history && Messliner.history.currentUserData) || (window.Messliner && Messliner.state && Messliner.state.user) || {};
  const nameInput = document.getElementById('profileEditNameInput');
  const phoneInput = document.getElementById('profileEditPhoneInput');
  const emailInput = document.getElementById('profileEditEmailInput');
  if (nameInput) nameInput.value = user.name || '';
  if (phoneInput) phoneInput.value = user.phone || '';
  if (emailInput) emailInput.value = user.email || (window.Messliner && Messliner.state && Messliner.state.user && Messliner.state.user.email) || '';
  openModal('editProfileModal');
}

/* Copy Dining Join ID / Mess Code */
function copyDiningJoinId() {
  const idEl = document.getElementById('profileDiningJoinId');
  const secIdEl = document.getElementById('profileSecMessCode');
  const text = (idEl ? idEl.textContent.trim() : '') || (secIdEl ? secIdEl.textContent.trim() : '');
  if (!text || text === 'Loading...' || text === '------' || text === '-') return;

  const onSuccess = () => {
    if (typeof showToast === 'function') {
      showToast('Mess Code copied to clipboard!', 'success');
    }
    const iconEl = document.getElementById('copyJoinIdIcon');
    const btn = document.getElementById('copyJoinIdBtn');
    if (iconEl && btn) {
      iconEl.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
      btn.style.color = '#059669';
      btn.style.background = '#ECFDF5';
      setTimeout(() => {
        iconEl.innerHTML = '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
        btn.style.color = '';
        btn.style.background = '';
      }, 1800);
    }

    const secBtns = document.querySelectorAll('.profile-copy-btn');
    secBtns.forEach(b => {
      b.dataset.origText = b.dataset.origText || b.innerHTML;
      b.classList.add('copied');
      b.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:3px;"><polyline points="20 6 9 17 4 12"/></svg>Copied';
    });
    setTimeout(() => {
      secBtns.forEach(b => {
        b.classList.remove('copied');
        if (b.dataset.origText) b.innerHTML = b.dataset.origText;
      });
    }, 1800);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
      onSuccess();
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    onSuccess();
  }
}

/* Support Drawer & Feedback Form */
function toggleSupportReportForm() {
  const drawer = document.getElementById('supportReportFormDrawer');
  const chevron = document.getElementById('supportReportChevron');
  if (!drawer) return;
  const isOpen = drawer.style.display === 'block';
  drawer.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
}

function submitSupportReport() {
  const type = document.getElementById('supportReportType')?.value || 'Feedback';
  const msg = document.getElementById('supportReportMessage')?.value?.trim();
  if (!msg) {
    if (typeof showToast === 'function') showToast('Please enter your message or description', 'warning');
    return;
  }
  if (typeof showToast === 'function') {
    showToast('Thank you! Your feedback has been received.', 'success');
  }
  const input = document.getElementById('supportReportMessage');
  if (input) input.value = '';
  toggleSupportReportForm();
}

function copySupportEmail() {
  const emailEl = document.getElementById('supportEmailText');
  const email = emailEl ? emailEl.textContent.trim() : 'messliner.app@gmail.com';
  const onSuccess = () => {
    if (typeof showToast === 'function') showToast('Support email copied to clipboard!', 'success');
    const btn = document.getElementById('copySupportEmailBtn');
    if (btn) {
      btn.textContent = 'Copied!';
      btn.style.color = '#059669';
      btn.style.borderColor = '#059669';
      btn.style.background = '#ECFDF5';
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.style.color = '';
        btn.style.borderColor = '';
        btn.style.background = '';
      }, 1800);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(email).then(onSuccess).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = email; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
      onSuccess();
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = email; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    onSuccess();
  }
}

/* Help Page Tabs & FAQ */
function switchHelpTab(tab) {
  const indicator = document.getElementById('helpTabIndicator');
  const bugBtn = document.getElementById('helpTabBugBtn');
  const suggBtn = document.getElementById('helpTabSuggestionBtn');
  const catInput = document.getElementById('helpFormCategory');
  const msgLabel = document.getElementById('helpFormMessageLabel');
  const msgTextarea = document.getElementById('helpFormMessage');
  const submitBtn = document.getElementById('helpFormSubmitBtn');

  if (tab === 'bug') {
    if (indicator) indicator.style.transform = 'translateX(0%)';
    if (bugBtn) { bugBtn.style.color = '#0F172A'; }
    if (suggBtn) { suggBtn.style.color = '#64748B'; }
    if (catInput) catInput.value = 'Bug Report';
    if (msgLabel) msgLabel.textContent = 'Issue Description';
    if (msgTextarea) msgTextarea.placeholder = 'Describe what went wrong, which page or calculation, and what you expected...';
    if (submitBtn) submitBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Submit Report';
  } else {
    if (indicator) indicator.style.transform = 'translateX(100%)';
    if (bugBtn) { bugBtn.style.color = '#64748B'; }
    if (suggBtn) { suggBtn.style.color = '#0F172A'; }
    if (catInput) catInput.value = 'Feature Suggestion';
    if (msgLabel) msgLabel.textContent = 'Feature Proposal';
    if (msgTextarea) msgTextarea.placeholder = 'Describe your idea or new feature you would like to see in Messliner...';
    if (submitBtn) submitBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Submit Suggestion';
  }
}

function toggleFaqItem(headerEl) {
  const parent = headerEl.closest('.help-faq-item');
  if (!parent) return;
  const body = parent.querySelector('.faq-body');
  const chevron = parent.querySelector('.faq-chevron');
  if (!body) return;
  const isOpen = body.style.display === 'block';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  parent.style.borderColor = isOpen ? '#E2E8F0' : '#059669';
  parent.style.background = isOpen ? '#F8FAFC' : '#ffffff';
}

function filterHelpFaqs() {
  const q = (document.getElementById('helpSearchInput')?.value || '').toLowerCase().trim();
  const items = document.querySelectorAll('.help-faq-item');
  let visibleCount = 0;
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    const matches = !q || text.includes(q);
    item.style.display = matches ? 'block' : 'none';
    if (matches) visibleCount++;
  });
  const countEl = document.getElementById('helpFaqCount');
  if (countEl) {
    countEl.textContent = `${visibleCount} Guides`;
  }
}

function submitFullPageReport() {
  const category = document.getElementById('helpFormCategory')?.value || 'General';
  const name = document.getElementById('helpFormName')?.value?.trim();
  const contact = document.getElementById('helpFormContact')?.value?.trim();
  const msg = document.getElementById('helpFormMessage')?.value?.trim();

  if (!msg) {
    if (typeof showToast === 'function') showToast('Please enter your feedback description or issue details', 'warning');
    return;
  }

  if (typeof showToast === 'function') {
    showToast('Thank you! Your report/suggestion has been submitted.', 'success');
  }

  const form = document.getElementById('helpFeedbackForm');
  if (form) form.reset();
}

/* Header Page Icons Map */
const _headerIcons = {
  dashboard: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  overview: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  meals: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
  finance: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
  ledger: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
  profile: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  mymeal: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
  mealchart: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>',
  bazar: '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>',
  summary: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  history: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  notifications: '<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  aicontrol: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  aiassistant: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  'user-bills': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  fridaymeal: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  help: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>'
};

function setHeaderIcon(page) {
  const el = document.getElementById('headerPageIcon');
  if (!el) return;
  if (page === 'dashboard') {
    el.style.display = 'none';
  } else {
    el.style.display = 'flex';
  }
  const paths = _headerIcons[page] || _headerIcons.dashboard;
  el.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

// Global Event Listeners for Dropdowns and Sidebar
document.addEventListener('DOMContentLoaded', () => {
  const sidebarUserBtn = document.getElementById('sidebarUserBtn');
  if (sidebarUserBtn) {
    sidebarUserBtn.addEventListener('click', function () {
      const userDropdown = document.getElementById('userDropdown');
      if (userDropdown) userDropdown.classList.toggle('active');
    });
  }

  document.addEventListener('click', function (e) {
    const userDropdown = document.getElementById('userDropdown');
    if (userDropdown && !e.target.closest('#sidebarUserBtn') && !e.target.closest('#userDropdown')) {
      userDropdown.classList.remove('active');
    }
    if (!e.target.closest('.custom-dropdown')) {
      document.querySelectorAll('.custom-dropdown').forEach(dropdown => {
        dropdown.classList.remove('active');
      });
    }
  });
});
