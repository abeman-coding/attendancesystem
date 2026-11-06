/* ============ js/admin.js ============ */
/* Handles: admin.html, students.html, teachers.html */

document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body.dataset.page;

  if (page === 'admin')    await initAdminDashboard();
  if (page === 'students') await initStudentsPage();
  if (page === 'teachers') await initTeachersPage();
});

/* ==================================================================
   ADMIN DASHBOARD
   ================================================================== */
async function initAdminDashboard(){
  const me = await initShell({ role: 'admin', active: 'admin.html', title: 'Dashboard' });
  if (!me) return;

  const statsEl = $('#stats');
  statsEl.innerHTML = skeletonStats(4);

  try {
    const [
      { count: studentCount },
      { count: teacherCount },
      { count: courseCount },
      { count: sessionCount }
    ] = await Promise.all([
      db.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
      db.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
      db.from('courses').select('*', { count: 'exact', head: true }),
      db.from('sessions').select('*', { count: 'exact', head: true })
    ]);

    statsEl.innerHTML = [
      statCard('👥', studentCount ?? 0, 'Students',   ''),
      statCard('👨‍🏫', teacherCount ?? 0, 'Teachers',   'green'),
      statCard('📚', courseCount ?? 0, 'Courses',    'blue'),
      statCard('✅', sessionCount ?? 0, 'Sessions',   'amber')
    ].join('');
  } catch (err) {
    toast('Could not load stats: ' + err.message, 'error');
  }

  /* recent sessions */
  const box = $('#recentSessions');
  try {
    const { data, error } = await db
      .from('sessions')
      .select('id, session_date, code, is_open, created_at, courses:course_id(code, title)')
      .order('created_at', { ascending: false })
      .limit(7);
    if (error) throw error;

    if (!data?.length){
      box.innerHTML = emptyState('🗓️', 'No sessions yet. Teachers will appear here once they start a class.');
      return;
    }

    box.innerHTML = data.map(s => `
      <div class="session-item">
        <span class="s-code">${escapeHtml(s.code)}</span>
        <div class="s-main">
          <strong>${escapeHtml(s.courses?.code || 'Course')} — ${escapeHtml(s.courses?.title || '')}</strong>
          <small>${fmtDate(s.session_date)} · ${s.is_open
            ? '<span class="badge present">open</span>'
            : '<span class="badge neutral">closed</span>'}</small>
        </div>
      </div>`).join('');
  } catch (err) {
    box.innerHTML = emptyState('⚠️', err.message);
  }
}

/* ==================================================================
   STUDENTS PAGE
   ================================================================== */
async function initStudentsPage(){
  const me = await initShell({
    role: ['admin', 'officer'].includes((await getProfile())?.role) ? (await getProfile()).role : 'admin',
    active: 'students.html',
    title: 'Students'
  });
  if (!me) return;

  const tableEl  = $('#studentTable');
  const countEl  = $('#studentCount');
  const searchEl = $('#searchStudents');
  const deptEl   = $('#filterDept');
  const modal    = $('#studentModal');
  const form     = $('#studentForm');
  const formErr  = $('#studentFormError');

  let allStudents = [];

  async function load(){
    tableEl.innerHTML = '<div class="skeleton-list"></div>';
    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .order('full_name');

    if (error){
      tableEl.innerHTML = emptyState('⚠️', error.message);
      return;
    }
    allStudents = data || [];
    buildDepartments();
    render();
  }

  function buildDepartments(){
    const depts = [...new Set(allStudents.map(s => s.department).filter(Boolean))].sort();
    deptEl.innerHTML = '<option value="">All departments</option>' +
      depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  }

  function render(){
    const q    = searchEl.value.trim().toLowerCase();
    const dept = deptEl.value;

    const rows = allStudents.filter(s => {
      const matchesQ = !q ||
        (s.full_name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.matric_no || '').toLowerCase().includes(q);
      const matchesD = !dept || s.department === dept;
      return matchesQ && matchesD;
    });

    countEl.textContent = `${rows.length} student${rows.length === 1 ? '' : 's'}`;

    if (!rows.length){
      tableEl.innerHTML = emptyState('🎓', 'No students match your filters.');
      return;
    }

    tableEl.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Matric no</th><th>Department</th><th>Joined</th><th></th></tr>
          </thead>
          <tbody>
            ${rows.map(s => `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:.6rem">
                    <span class="avatar">${escapeHtml(initials(s.full_name))}</span>
                    <strong>${escapeHtml(s.full_name)}</strong>
                  </div>
                </td>
                <td class="muted">${escapeHtml(s.email)}</td>
                <td>${escapeHtml(s.matric_no || '—')}</td>
                <td>${escapeHtml(s.department || '—')}</td>
                <td class="muted">${fmtDate(s.created_at)}</td>
                <td class="actions">
                  <button class="btn btn-sm btn-outline" data-edit="${s.id}">Edit</button>
                  <button class="btn btn-sm btn-danger" data-del="${s.id}">Delete</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* --- modal controls --- */
  const openModal = (student = null) => {
    formErr.classList.add('hidden');
    form.reset();
    $('#studentId').value = student?.id || '';
    $('#studentModalTitle').textContent = student ? 'Edit student' : 'Add student';
    if (student){
      $('#sName').value   = student.full_name || '';
      $('#sEmail').value  = student.email || '';
      $('#sMatric').value = student.matric_no || '';
      $('#sDept').value   = student.department || '';
    }
    modal.classList.remove('hidden');
  };

  $('#addStudentBtn')?.addEventListener('click', () => openModal());

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formErr.classList.add('hidden');

    const id = $('#studentId').value;
    const payload = {
      full_name:  $('#sName').value.trim(),
      email:      $('#sEmail').value.trim(),
      matric_no:  $('#sMatric').value.trim(),
      department: $('#sDept').value.trim()
    };

    if (!payload.full_name || !payload.email){
      formErr.textContent = 'Name and email are required.';
      formErr.classList.remove('hidden');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true);

    try {
      if (id){
        const { error } = await db.from('profiles').update(payload).eq('id', id);
        if (error) throw error;
        toast('Student updated', 'success');
      } else {
        /* Creating auth users requires the service role key (server side).
           Here we create a profile row that an admin can link later, or you
           can call an Edge Function. We insert a profile with a generated id. */
        const { error } = await db.from('profiles').insert({
          id: crypto.randomUUID(),
          role: 'student',
          ...payload
        });
        if (error) throw error;
        toast('Student added', 'success');
      }
      modal.classList.add('hidden');
      await load();
    } catch (err) {
      formErr.textContent = err.message;
      formErr.classList.remove('hidden');
    } finally {
      setLoading(btn, false);
    }
  });

  tableEl.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn){
      const student = allStudents.find(s => s.id === editBtn.dataset.edit);
      if (student) openModal(student);
      return;
    }

    const delBtn = e.target.closest('[data-del]');
    if (delBtn){
      if (!confirm('Delete this student record? This cannot be undone.')) return;
      const { error } = await db.from('profiles').delete().eq('id', delBtn.dataset.del);
      if (error) return toast(error.message, 'error');
      toast('Student deleted', 'success');
      await load();
    }
  });

  searchEl.addEventListener('input', render);
  deptEl.addEventListener('change', render);

  await load();
}

/* ==================================================================
   TEACHERS / COURSES PAGE
   ================================================================== */
async function initTeachersPage(){
  const profile = await getProfile();
  const me = await initShell({
    role: profile?.role === 'officer' ? 'officer' : 'admin',
    active: 'teachers.html',
    title: 'Teachers'
  });
  if (!me) return;

  const courseTableEl = $('#courseTable');
  const teacherTableEl = $('#teacherTable');
  const courseCountEl = $('#courseCount');
  const modal = $('#courseModal');
  const form  = $('#courseForm');
  const formErr = $('#courseFormError');
  const teacherSelect = $('#cTeacher');

  let teachers = [];
  let courses  = [];

  async function load(){
    courseTableEl.innerHTML = '<div class="skeleton-list"></div>';
    teacherTableEl.innerHTML = '<div class="skeleton-list"></div>';

    const [tRes, cRes] = await Promise.all([
      db.from('profiles').select('*').eq('role', 'teacher').order('full_name'),
      db.from('courses').select('*, profiles:teacher_id(full_name)').order('code')
    ]);

    if (tRes.error) teacherTableEl.innerHTML = emptyState('⚠️', tRes.error.message);
    else {
      teachers = tRes.data || [];
      renderTeachers();
      teacherSelect.innerHTML = '<option value="">— Unassigned —</option>' +
        teachers.map(t => `<option value="${t.id}">${escapeHtml(t.full_name)}</option>`).join('');
    }

    if (cRes.error) courseTableEl.innerHTML = emptyState('⚠️', cRes.error.message);
    else {
      courses = cRes.data || [];
      renderCourses();
    }
  }

  function renderTeachers(){
    if (!teachers.length){
      teacherTableEl.innerHTML = emptyState('👨‍🏫', 'No teachers registered yet.');
      return;
    }
    teacherTableEl.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Joined</th></tr></thead>
          <tbody>
            ${teachers.map(t => `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:.6rem">
                    <span class="avatar">${escapeHtml(initials(t.full_name))}</span>
                    <strong>${escapeHtml(t.full_name)}</strong>
                  </div>
                </td>
                <td class="muted">${escapeHtml(t.email)}</td>
                <td>${escapeHtml(t.department || '—')}</td>
                <td class="muted">${fmtDate(t.created_at)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderCourses(){
    courseCountEl.textContent = `${courses.length} course${courses.length === 1 ? '' : 's'}`;
    if (!courses.length){
      courseTableEl.innerHTML = emptyState('📚', 'No courses created yet.');
      return;
    }
    courseTableEl.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Code</th><th>Title</th><th>Department</th><th>Teacher</th><th></th></tr></thead>
          <tbody>
            ${courses.map(c => `
              <tr>
                <td><strong>${escapeHtml(c.code)}</strong></td>
                <td>${escapeHtml(c.title)}</td>
                <td class="muted">${escapeHtml(c.department || '—')}</td>
                <td>${c.profiles?.full_name
                  ? `<span class="badge role">${escapeHtml(c.profiles.full_name)}</span>`
                  : '<span class="badge neutral">unassigned</span>'}</td>
                <td class="actions">
                  <button class="btn btn-sm btn-outline" data-edit-course="${c.id}">Edit</button>
                  <button class="btn btn-sm btn-danger" data-del-course="${c.id}">Delete</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  const openModal = (course = null) => {
    formErr.classList.add('hidden');
    form.reset();
    $('#courseId').value = course?.id || '';
    $('#courseModalTitle').textContent = course ? 'Edit course' : 'Add course';
    if (course){
      $('#cCode').value  = course.code || '';
      $('#cTitle').value = course.title || '';
      $('#cDept').value  = course.department || '';
      teacherSelect.value = course.teacher_id || '';
    }
    modal.classList.remove('hidden');
  };

  $('#addCourseBtn')?.addEventListener('click', () => openModal());
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formErr.classList.add('hidden');

    const id = $('#courseId').value;
    const payload = {
      code:       $('#cCode').value.trim().toUpperCase(),
      title:      $('#cTitle').value.trim(),
      department: $('#cDept').value.trim(),
      teacher_id: teacherSelect.value || null
    };

    if (!payload.code || !payload.title){
      formErr.textContent = 'Course code and title are required.';
      formErr.classList.remove('hidden');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true);

    try {
      if (id){
        const { error } = await db.from('courses').update(payload).eq('id', id);
        if (error) throw error;
        toast('Course updated', 'success');
      } else {
        const { error } = await db.from('courses').insert(payload);
        if (error) throw error;
        toast('Course created', 'success');
      }
      modal.classList.add('hidden');
      await load();
    } catch (err) {
      formErr.textContent = err.message;
      formErr.classList.remove('hidden');
    } finally {
      setLoading(btn, false);
    }
  });

  courseTableEl.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-course]');
    if (editBtn){
      const course = courses.find(c => c.id === editBtn.dataset.editCourse);
      if (course) openModal(course);
      return;
    }
    const delBtn = e.target.closest('[data-del-course]');
    if (delBtn){
      if (!confirm('Delete this course and all its sessions?')) return;
      const { error } = await db.from('courses').delete().eq('id', delBtn.dataset.delCourse);
      if (error) return toast(error.message, 'error');
      toast('Course deleted', 'success');
      await load();
    }
  });

  await load();
}

/* ==================================================================
   SHARED RENDER HELPERS
   ================================================================== */
function statCard(icon, value, label, variant = ''){
  return `
    <article class="stat-card ${variant}">
      <div class="stat-icon">${icon}</div>
      <div class="stat-info">
        <strong>${value}</strong>
        <span>${escapeHtml(label)}</span>
      </div>
    </article>`;
}

function skeletonStats(n = 4){
  return Array.from({ length: n }, () => `
    <article class="stat-card">
      <div class="stat-icon">⏳</div>
      <div class="stat-info"><strong>—</strong><span>Loading…</span></div>
    </article>`).join('');
}

function emptyState(emoji, message){
  return `<div class="empty"><span class="emoji">${emoji}</span>${escapeHtml(message)}</div>`;
}