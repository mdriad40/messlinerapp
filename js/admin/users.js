/* ============================================
   Messliner — User Management (admin/users.js)
   ============================================ */

const UsersModule = {
  users: {},
  editingUserId: null,
  selectedUserId: null,

  /**
   * Initialize user management with realtime listener
   */
  init(diningId, initialData) {
    this.diningId = diningId;
    this.users = initialData?.users || {};
    this.settings = initialData?.settings || {};
    this.deposits = initialData?.deposits || {};
    this.selectedUserId = null;

    if (initialData?.meals) {
      this.mealsBreakdown = {};
      Object.values(initialData.meals).forEach(monthData => {
        Object.values(monthData).forEach(dayData => {
          Object.entries(dayData).forEach(([type, typeData]) => {
            if (typeof typeData === 'object') {
              Object.entries(typeData).forEach(([uid, count]) => {
                const c = parseFloat(count) || 0;
                if (!this.mealsBreakdown[uid]) {
                  this.mealsBreakdown[uid] = { breakfast: 0, lunch: 0, dinner: 0 };
                }
                if (this.mealsBreakdown[uid][type] !== undefined) {
                  this.mealsBreakdown[uid][type] += c;
                }
              });
            }
          });
        });
      });
    } else {
      this.mealsBreakdown = {};
    }

    if (Object.keys(this.users).length > 0) {
      this.render();
      this._updateUserCount();
    }

    db.ref(`dinings/${diningId}/settings`).on('value', (snap) => {
      this.settings = snap.val() || {};
      if (Object.keys(this.users).length > 0) this.render();
    });

    db.ref(`dinings/${diningId}/meals`).on('value', (snap) => {
      this.mealsBreakdown = {};
      const allMeals = snap.val() || {};
      Object.values(allMeals).forEach(monthData => {
        Object.values(monthData).forEach(dayData => {
          Object.entries(dayData).forEach(([type, typeData]) => {
            if (typeof typeData === 'object') {
              Object.entries(typeData).forEach(([uid, count]) => {
                const c = parseFloat(count) || 0;
                if (!this.mealsBreakdown[uid]) {
                  this.mealsBreakdown[uid] = { breakfast: 0, lunch: 0, dinner: 0 };
                }
                if (this.mealsBreakdown[uid][type] !== undefined) {
                  this.mealsBreakdown[uid][type] += c;
                }
              });
            }
          });
        });
      });
      if (Object.keys(this.users).length > 0) this.render();
    });

    const usersRef = db.ref(`dinings/${diningId}/users`);
    usersRef.on('value', (snap) => {
      this.users = snap.val() || {};
      this.render();
      this._updateUserCount();

      // If we are currently on the meals page, refresh both the user grid AND
      // the meal log table — users arriving late would otherwise leave the log empty.
      if (Router.currentPage === 'meals' && Messliner.meals) {
        Messliner.meals.renderUserGrid();
        Messliner.meals.renderMealLog();
      }
    });

    db.ref(`dinings/${diningId}/deposits`).on('value', (snap) => {
      this.deposits = snap.val() || {};
      if (Object.keys(this.users).length > 0) this.render();
    });

    // Keydown listener for Enter key to impersonate
    if (!this._keydownListenerAdded) {
      document.addEventListener('keydown', (e) => {
        if (Router.currentPage === 'users' && e.key === 'Enter') {
          if (this.selectedUserId) {
            window.open(`dashboard.html?impersonate=${this.selectedUserId}`, '_blank');
          }
        }
      });
      this._keydownListenerAdded = true;
    }
  },

  /**
   * Set selected user and highlight their card
   */
  selectUser(id, el) {
    this.selectedUserId = id;
    document.querySelectorAll('.user-card').forEach(c => c.classList.remove('selected'));
    if (el) el.classList.add('selected');
  },

  /**
   * Render users grid
   */
  render() {
    const grid = document.getElementById('usersGrid');
    if (!grid) return;

    const userEntries = Object.entries(this.users).sort((a, b) => {
      const timeA = a[1].createdAt ? new Date(a[1].createdAt).getTime() : 0;
      const timeB = b[1].createdAt ? new Date(b[1].createdAt).getTime() : 0;
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return a[1].name.localeCompare(b[1].name);
    });

    if (userEntries.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          </div>
          <h3>No Members Yet</h3>
          <p>Add members to start managing your dining.</p>
          <button class="btn btn-primary" onclick="Messliner.users.showAddModal()">Add First Member</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = userEntries.map(([id, user]) => {
      const roleBadge = user.role === 'admin'
        ? '<span class="badge badge-primary" style="margin-left:var(--space-2);">Admin</span>'
        : '';
      const isSelected = id === this.selectedUserId ? 'selected' : '';

      return `
        <div class="user-card fade-up ${isSelected}" onclick="Messliner.users.selectUser('${id}', this)" style="animation-delay:${Math.random() * 0.15}s;">
          <div class="avatar" style="background:${this._avatarColor(user.name)};">${Utils.initials(user.name)}</div>
          <div class="user-card-info">
            <div class="user-card-name">${user.name || 'Unknown'}${roleBadge}</div>
            <div class="user-card-meta">Phone: ${user.phone || '—'}</div>
          </div>
          ${user.role !== 'admin' ? `
            <div class="dropdown" style="margin-left:var(--space-2);">
              <button class="btn btn-ghost btn-icon btn-sm" onclick="this.nextElementSibling.classList.toggle('active');event.stopPropagation();">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
              </button>
              <div class="dropdown-menu">
                <button class="dropdown-item" onclick="window.open('dashboard.html?impersonate=${id}', '_blank'); event.stopPropagation();">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                  Open Account
                </button>
                <button class="dropdown-item" onclick="Messliner.users.showEditModal('${id}'); event.stopPropagation();">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit
                </button>
                <button class="dropdown-item danger" onclick="Messliner.users.confirmDelete('${id}', '${(user.name || '').replace(/'/g, "\\'")}'); event.stopPropagation();">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  Delete
                </button>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');



    // Close dropdowns on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.user-card .dropdown-menu').forEach(m => m.classList.remove('active'));
    });
  },

  /**
   * Filter users by search query
   */
  filterUsers(query) {
    const grid = document.getElementById('usersGrid');
    if (!grid) return;

    const q = query.toLowerCase();
    const cards = grid.querySelectorAll('.user-card');
    cards.forEach(card => {
      const name = card.querySelector('.user-card-name')?.textContent.toLowerCase() || '';
      const meta = card.querySelector('.user-card-meta')?.textContent.toLowerCase() || '';
      card.style.display = (name.includes(q) || meta.includes(q)) ? '' : 'none';
    });
  },

  /**
   * Show add user modal
   */
  showAddModal() {
    this.editingUserId = null;
    document.getElementById('userModalTitle').textContent = 'Add Member';
    document.getElementById('addUserForm').reset();
    document.getElementById('userPasswordGroup').style.display = 'block';
    document.getElementById('userPasswordInput').required = true;
    document.getElementById('saveUserBtn').querySelector('.btn-text').textContent = 'Save Member';
    openModal('addUserModal');
  },

  /**
   * Show edit user modal
   */
  showEditModal(userId) {
    const user = this.users[userId];
    if (!user) return;

    this.editingUserId = userId;
    document.getElementById('userModalTitle').textContent = 'Edit Member';
    document.getElementById('userNameInput').value = user.name || '';
    document.getElementById('userUsernameInput').value = user.username || '';
    document.getElementById('userPhoneInput').value = user.phone || '';
    document.getElementById('userEmailInput').value = user.email || '';
    document.getElementById('userPasswordGroup').style.display = 'none';
    document.getElementById('userPasswordInput').required = false;
    document.getElementById('saveUserBtn').querySelector('.btn-text').textContent = 'Update Member';
    openModal('addUserModal');
  },

  /**
   * Close user modal
   */
  closeModal() {
    closeModal('addUserModal');
    this.editingUserId = null;
  },

  /**
   * Save or update user
   */
  async saveUser() {
    const name = document.getElementById('userNameInput').value.trim();
    const username = document.getElementById('userUsernameInput').value.trim().toLowerCase();
    const phone = document.getElementById('userPhoneInput').value.trim();
    const email = document.getElementById('userEmailInput').value.trim();
    const password = document.getElementById('userPasswordInput').value;

    if (!name || !username || !email) {
      Notifications.toast('warning', 'Missing Fields', 'Name, username, and email are required.');
      return;
    }

    const btn = document.getElementById('saveUserBtn');
    btn.disabled = true;

    try {
      if (this.editingUserId) {
        // Update existing user
        await db.ref(`dinings/${this.diningId}/users/${this.editingUserId}`).update({
          name, username, phone, email
        });

        // Update username mapping
        await db.ref(`userMappings/usernameToDining/${username}`).set({
          diningId: this.diningId,
          userId: this.editingUserId
        });

        Notifications.toast('success', 'Updated', `${name} has been updated.`);
        await Notifications.log(this.diningId, 'user_updated', `Updated user: ${name}`, Messliner.state.userId, this.editingUserId);
      } else {
        // Create new user with Firebase Auth
        if (!password || password.length < 6) {
          Notifications.toast('warning', 'Weak Password', 'Password must be at least 6 characters.');
          btn.disabled = false;
          return;
        }

        // We need a workaround: creating a new auth user signs us out
        // So we use a secondary Firebase app to create the user
        const secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary');
        const secondaryAuth = secondaryApp.auth();

        try {
          const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
          const newUid = cred.user.uid;
          await secondaryAuth.signOut();

          const userId = Utils.generateId();

          // Save user to dining
          await db.ref(`dinings/${this.diningId}/users/${userId}`).set({
            name,
            username,
            email,
            phone,
            role: 'user',
            authUid: newUid,
            totalDeposit: 0,
            totalMeals: 0,
            mealCost: 0,
            balance: 0,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            mealStatus: {
              breakfast: true,
              lunch: true,
              dinner: true
            }
          });

          // Create mappings
          await db.ref(`userMappings/emailToDining/${Utils.encodeEmail(email)}`).set({
            diningId: this.diningId,
            userId
          });

          await db.ref(`userMappings/usernameToDining/${username}`).set({
            diningId: this.diningId,
            userId
          });

          // Notify
          await Notifications.create(this.diningId, 'New Member Added', `${name} has joined the dining.`, 'all', 'info');
          await Notifications.log(this.diningId, 'user_added', `Added new user: ${name}`, Messliner.state.userId, userId);
          Notifications.toast('success', 'Member Added', `${name} has been added successfully.`);

        } finally {
          // Delete secondary app
          secondaryApp.delete();
        }
      }

      this.closeModal();
    } catch (error) {
      console.error('Save user error:', error);
      let msg = 'Failed to save member.';
      if (error.code === 'auth/email-already-in-use') msg = 'This email is already registered.';
      Notifications.toast('error', 'Error', msg);
    } finally {
      btn.disabled = false;
    }
  },

  /**
   * Show confirm delete dialog
   */
  confirmDelete(userId, userName) {
    document.getElementById('confirmTitle').textContent = 'Delete Member?';
    document.getElementById('confirmMessage').textContent = `Are you sure you want to remove ${userName}? This cannot be undone.`;
    document.getElementById('confirmActionBtn').onclick = () => this.deleteUser(userId);
    openModal('confirmDialog');
  },

  /**
   * Delete a user
   */
  async deleteUser(userId) {
    try {
      const user = this.users[userId];
      if (!user) return;

      // Remove user data
      await db.ref(`dinings/${this.diningId}/users/${userId}`).remove();

      // Remove mappings
      if (user.username) {
        await db.ref(`userMappings/usernameToDining/${user.username}`).remove();
      }
      if (user.email) {
        await db.ref(`userMappings/emailToDining/${Utils.encodeEmail(user.email)}`).remove();
      }

      await Notifications.log(this.diningId, 'user_deleted', `Deleted user: ${user.name}`, Messliner.state.userId);
      Notifications.toast('success', 'Deleted', `${user.name} has been removed.`);
      closeModal('confirmDialog');

    } catch (error) {
      console.error('Delete user error:', error);
      Notifications.toast('error', 'Error', 'Failed to delete member.');
    }
  },

  /**
   * Refresh users list
   */
  refresh() {
    this.render();
  },

  /**
   * Update the user count badge in sidebar
   */
  _updateUserCount() {
    const count = Object.keys(this.users).length;
    const badge = document.getElementById('userCountBadge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline' : 'none';
    }
    Utils.setText('usersSubtitle', `${count} member${count !== 1 ? 's' : ''} · Click a card & press Enter to open their account in a new tab`);
  },
  /**
   * Get avatar background color based on name
   */
  _avatarColor(name) {
    const colors = [
      'var(--primary-100)', 'var(--accent-100)', 'var(--warning-100)',
      'var(--danger-100)', '#E0E7FF', '#FCE7F3', '#DBEAFE',
      '#D1FAE5', '#FEF3C7', '#FEE2E2'
    ];
    const index = (name || '').charCodeAt(0) % colors.length;
    return colors[index];
  },

  /**
   * Get user select options HTML (for dropdowns)
   */
  getUserOptions() {
    return Object.entries(this.users)
      .map(([id, u]) => `<option value="${id}">${u.name}</option>`)
      .join('');
  }
};

console.log('[Messliner] Users module loaded');
