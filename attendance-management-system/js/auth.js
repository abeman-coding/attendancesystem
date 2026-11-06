/* ============ js/auth.js ============ */
/* Handles: login form, register form, and the dashboard shell. */

/* ------------------------------------------------------------------
   NAV CONFIG
   ------------------------------------------------------------------ */
const ICONS = {
  grid:  '<path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  cap:   '<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/>',
  check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  book:  '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'
};

function svgIcon(name){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.grid}</svg>`;
}

const NAV_ITEMS = {
  admin: [
    { href: 'admin.html',      icon: 'grid',  label: 'Dashboard'  },
    { href: 'students.html',   icon: 'users', label: 'Students'   },
    { href: 'teachers.html',   icon: 'cap',   label: 'Teachers'   },
    { href: 'attendance.html', icon: 'check', label: 'Attendance' },
    { href: 'reports.html',    icon: 'chart', label: 'Reports'    }
  ],
  teacher: [
    { href: 'teacher.html',    icon: 'grid',  label: 'Dashboard'  },
    { href: 'attendance.html', icon: 'check', label: 'Attendance' },
    { href: 'reports.html',    icon: 'chart', label: 'Reports'    }
  ],
  student: [
    { href: 'student.html',    icon: 'grid',  label: 'Dashboard'  },
    { href: 'reports.html',    icon: 'chart', label: 'My reports' }
  ],
  officer: [
    { href: 'officer.html',    icon: 'grid',  label: 'Dashboard'  },
    { href: 'students.html',   icon: 'users', label: 'Students'   },
    { href: 'attendance.html', icon: 'check', label: 'Attendance' },
    { href: 'reports.html',    icon: 'chart', label: 'Reports'    }
  ]
};

/* ------------------------------------------------------------------
   DASHBOARD SHELL
   ------------------------------------------------------------------ */
async function initShell({ role, active, title }){
  const profile = await requireAuth([role]);
  if (!profile) return null;

  document.title = `${title} • AttendX`;
  const titleEl = $('#pageTitle');
  if (titleEl) titleEl.textContent = title;

  /* nav */
  const nav = $('#nav');
  if (nav){
    nav.innerHTML = (NAV_ITEMS[role] || [])
      .map(item => `
        <a class="nav-item ${item.href === active ? 'active' : ''}" href="${item.href}">
          ${svgIcon(item.icon)}<span>${item.label}</span>
        </a>`)
      .join('');
  }

  /* user chip */
  $$('[data-user-name]').forEach(n => n.textContent = profile.full_name);
  $$('[data-user-role]').forEach(n => n.textContent = profile.role);
  $$('[data-user-initials]').forEach(n => n.textContent = initials(profile.full_name));

  /* logout buttons */
  $$('[data-logout]').forEach(b => b.addEventListener('click', logout));

  /* mobile sidebar */
  const sidebar  = $('#sidebar');
  const backdrop = $('.sidebar-backdrop');
  const openBtn  = $('[data-sidebar-open]');
  const closeAll = () => { sidebar?.classList.remove('open'); backdrop?.classList.remove('show'); };

  openBtn?.addEventListener('click', () => {
    sidebar?.classList.add('open');
    backdrop?.classList.add('show');
  });
  backdrop?.addEventListener('click', closeAll);
  $$('[data-sidebar-close]').forEach(b => b.addEventListener('click', closeAll));
  $$('.nav-item').forEach(a => a.addEventListener('click', closeAll));

  return profile;
}

/* ==================================================================
   LOGIN
   ================================================================== */
(function bindLogin(){
  const form = document.getElementById('loginForm');
  if (!form) return;

  redirectIfAuthenticated();

  const errorBox = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');

  const showError = (msg) => {
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');

    const email    = form.email.value.trim();
    const password = form.password.value;

    if (!email || !password) return showError('Please enter your email and password.');

    setLoading(btn, true);
    try {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: profile, error: pErr } = await db
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (pErr || !profile) throw new Error('Could not load your profile. Contact an administrator.');

      toast('Signed in successfully', 'success', 1500);
      location.replace(`${profile.role}.html`);
    } catch (err) {
      showError(err.message || 'Unable to sign in.');
      setLoading(btn, false);
    }
  });
})();

/* ==================================================================
   REGISTER
   ================================================================== */
(function bindRegister(){
  const form = document.getElementById('registerForm');
  if (!form) return;

  redirectIfAuthenticated();

  const errorBox = document.getElementById('registerError');
  const okBox    = document.getElementById('registerSuccess');
  const btn      = document.getElementById('registerBtn');
  const roleSel  = document.getElementById('role');
  const matric   = document.getElementById('matricField');

  const syncRole = () => {
    matric.style.display = roleSel.value === 'student' ? '' : 'none';
  };
  roleSel.addEventListener('change', syncRole);
  syncRole();

  const showError = (msg) => {
    okBox.classList.add('hidden');
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');
    okBox.classList.add('hidden');

    const fullName   = form.fullName.value.trim();
    const email      = form.email.value.trim();
    const role       = roleSel.value;
    const department = form.department.value.trim();
    const matricNo   = form.matricNo.value.trim();
    const password   = form.password.value;
    const confirm    = form.confirm.value;

    if (!fullName)                 return showError('Please enter your full name.');
    if (!email)                    return showError('Please enter your email address.');
    if (password.length < 6)       return showError('Password must be at least 6 characters.');
    if (password !== confirm)      return showError('Passwords do not match.');
    if (!form.terms.checked)       return showError('Please accept the terms to continue.');

    setLoading(btn, true);
    try {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role, department, matric_no: matricNo }
        }
      });
      if (error) throw error;

      /* A DB trigger creates the profile row automatically. */
      if (data.session){
        toast('Account created!', 'success');
        location.replace(`${role}.html`);
      } else {
        okBox.innerHTML = 'Account created 🎉 Please check your email to confirm your address, then sign in.';
        okBox.classList.remove('hidden');
        form.reset();
        syncRole();
        setLoading(btn, false);
      }
    } catch (err) {
      showError(err.message || 'Unable to create account.');
      setLoading(btn, false);
    }
  });
})();