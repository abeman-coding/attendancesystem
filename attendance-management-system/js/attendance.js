/* ============ js/attendance.js ============ */
document.addEventListener('DOMContentLoaded', async () => {
  const profile = await getProfile();
  if (!profile){ location.replace('login.html'); return; }

  const root = $('#attendanceRoot');

  if (profile.role === 'teacher' || profile.role === 'admin'){
    await renderTeacherView(profile, root);
  } else if (profile.role === 'student'){
    await renderStudentView(profile, root);
  } else {
    await renderOfficerView(profile, root);
  }
});

/* ==================================================================
   TEACHER / ADMIN VIEW
   ================================================================== */
async function renderTeacherView(me, root){
  await initShell({ role: me.role, active: 'attendance.html', title: 'Attendance' });

  root.innerHTML = `<div class="skeleton-list"></div>`;

  /* courses available to this user */
  let courseQuery = db.from('courses').select('id, code, title').order('code');
  if (me.role === 'teacher') courseQuery = courseQuery.eq('teacher_id', me.id);
  const { data: courses, error } = await courseQuery;
  if (error){ root.innerHTML = emptyState('⚠️', error.message); return; }

  if (!courses?.length){
    root.innerHTML = emptyState('📚', 'No courses available. Ask an admin to assign a course.');
    return;
  }

  const preselected = new URLSearchParams(location.search).get('course') || courses[0].id;

  root.innerHTML = `
    <section class="card" style="margin-bottom:1.4rem">
      <div class="card-head"><h3>Start a session</h3></div>
      <div class="card-body">
        <form id="sessionForm" class="filters">
          <div class="field">
            <label for="courseSel">Course</label>
            <select id="courseSel">
              ${courses.map(c => `<option value="${c.id}" ${c.id === preselected ? 'selected' : ''}>
                ${escapeHtml(c.code)} — ${escapeHtml(c.title)}
              </option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="sessionDate">Date</label>
            <input id="sessionDate" type="date" value="${todayISO()}" />
          </div>
          <div class="field">
            <label for="sessionTopic">Topic (optional)</label>
            <input id="sessionTopic" placeholder="e.g. Binary trees" />
          </div>
          <div class="field field-action">
            <button class="btn btn-primary" type="submit">Create session</button>
          </div>
        </form>
      </div>
    </section>

    <div id="sessionArea"></div>`;

  const form = $('#sessionForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true);

    const payload = {
      course_id:    $('#courseSel').value,
      session_date: $('#sessionDate').value || todayISO(),
      topic:        $('#sessionTopic').value.trim() || null,
      code:         randomCode(6),
      is_open:      true,
      created_by:   me.id
    };

    try {
      const { data, error } = await db.from('sessions').insert(payload).select().single();
      if (error) throw error;
      toast('Session created', 'success');
      form.reset();
      $('#sessionDate').value = todayISO();
      await loadSession(data.id, payload.course_id);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });

  /* load the most recent session for the preselected course */
  const { data: latest } = await db
    .from('sessions')
    .select('id, course_id')
    .eq('course_id', preselected)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest) await loadSession(latest.id, latest.course_id);
  else $('#sessionArea').innerHTML = emptyState('🗓️', 'No session yet. Create one above to start marking attendance.');

  /* ------------------------------------------------------------------ */
  async function loadSession(sessionId, courseId){
    const area = $('#sessionArea');
    area.innerHTML = '<div class="skeleton-list"></div>';

    const [{ data: session }, { data: enrolls }] = await Promise.all([
      db.from('sessions').select('*').eq('id', sessionId).single(),
      db.from('enrollments')
        .select('student_id, profiles:student_id(id, full_name, matric_no)')
        .eq('course_id', courseId)
    ]);

    if (!session){ area.innerHTML = emptyState('⚠️', 'Session not found.'); return; }

    const { data: records } = await db
      .from('attendance')
      .select('*')
      .eq('session_id', sessionId);

    const recMap = Object.fromEntries((records || []).map(r => [r.student_id, r.status]));
    const students = (enrolls || []).map(e => e.profiles).filter(Boolean);

    const counts = { present: 0, late: 0, absent: 0, excused: 0 };
    (records || []).forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

    area.innerHTML = `
      <div class="session-banner" style="margin-bottom:1.2rem">
        <div>
          <h3>Session code</h3>
          <small>${fmtDate(session.session_date)} · ${students.length} enrolled student${students.length === 1 ? '' : 's'}</small>
        </div>
        <div class="big-code">${escapeHtml(session.code)}</div>
        <button class="btn" id="toggleSession">${session.is_open ? 'Close session' : 'Reopen session'}</button>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Mark attendance</h3>
          <div class="summary-chips">
            <span class="chip present">${counts.present || 0} present</span>
            <span class="chip late">${counts.late || 0} late</span>
            <span class="chip absent">${counts.absent || 0} absent</span>
            <span class="chip excused">${counts.excused || 0} excused</span>
          </div>
        </div>
        <div class="card-body">
          ${students.length
            ? students.map(s => markRow(s, recMap[s.id])).join('')
            : emptyState('👥', 'No students enrolled in this course yet.')}
        </div>
      </div>`;

    /* toggle session */
    $('#toggleSession').addEventListener('click', async () => {
      const { error } = await db
        .from('sessions')
        .update({ is_open: !session.is_open })
        .eq('id', session.id);
      if (error) return toast(error.message, 'error');
      toast(session.is_open ? 'Session closed' : 'Session reopened', 'success');
      await loadSession(session.id, courseId);
    });

    /* mark buttons */
    area.querySelectorAll('.seg button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const studentId = btn.dataset.student;
        const status    = btn.dataset.status;

        /* optimistic UI */
        btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');

        const { error } = await db.from('attendance').upsert({
          session_id: session.id,
          student_id: studentId,
          status,
          marked_by:  me.id,
          marked_at:  new Date().toISOString()
        }, { onConflict: 'session_id,student_id' });

        if (error) toast(error.message, 'error');
        else toast(`Marked ${status}`, 'success', 1500);
      });
    });
  }

  function markRow(student, current){
    const statuses = ['present', 'late', 'absent', 'excused'];
    return `
      <div class="mark-row">
        <span class="avatar">${escapeHtml(initials(student.full_name))}</span>
        <div class="name">
          <strong>${escapeHtml(student.full_name)}</strong>
          <small>${escapeHtml(student.matric_no || '—')}</small>
        </div>
        <div class="seg">
          ${statuses.map(s => `
            <button type="button"
              data-status="${s}"
              data-student="${student.id}"
              class="${current === s ? 'on' : ''}">${s}</button>`).join('')}
        </div>
      </div>`;
  }
}

/* ==================================================================
   STUDENT VIEW
   ================================================================== */
async function renderStudentView(me, root){
  await initShell({ role: 'student', active: 'attendance.html', title: 'My attendance' });

  root.innerHTML = '<div class="skeleton-list"></div>';

  const { data: enrolls } = await db
    .from('enrollments')
    .select('courses:course_id(id, code, title)')
    .eq('student_id', me.id);

  const courses = (enrolls || []).map(e => e.courses).filter(Boolean);
  const ids = courses.map(c => c.id);

  let sessions = [], records = [];

  if (ids.length){
    const [sRes, rRes] = await Promise.all([
      db.from('sessions')
        .select('id, code, session_date, topic, is_open, course_id')
        .in('course_id', ids)
        .order('session_date', { ascending: false })
        .limit(60),
      db.from('attendance').select('session_id, status').eq('student_id', me.id)
    ]);
    sessions = sRes.data || [];
    records  = rRes.data || [];
  }

  const recMap = Object.fromEntries(records.map(r => [r.session_id, r.status]));
  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

  root.innerHTML = `
    <section class="card" style="margin-bottom:1.4rem">
      <div class="card-head"><h3>Check in with a code</h3></div>
      <div class="card-body">
        <form id="checkinForm2" class="checkin-form" style="max-width:420px">
          <input id="checkinCode2" class="code-input" type="text" maxlength="6" placeholder="A7K2Q9" autocomplete="off" />
          <button class="btn btn-primary" type="submit">Check in</button>
        </form>
        <div class="alert hidden" id="checkinMsg2" style="margin-top:.9rem;max-width:420px"></div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>My attendance history</h3></div>
      <div class="card-body">
        ${sessions.length ? `
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Course</th><th>Date</th><th>Topic</th><th>Status</th></tr></thead>
              <tbody>
                ${sessions.map(s => {
                  const c = courseMap[s.course_id];
                  const st = recMap[s.id];
                  return `
                    <tr>
                      <td><strong>${escapeHtml(c?.code || '—')}</strong> <span class="muted">${escapeHtml(c?.title || '')}</span></td>
                      <td>${fmtDate(s.session_date)}</td>
                      <td class="muted">${escapeHtml(s.topic || '—')}</td>
                      <td>${st ? statusBadge(st) : (s.is_open
                        ? '<span class="badge neutral">not marked</span>'
                        : '<span class="badge absent">absent</span>')}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : emptyState('📋', 'No sessions recorded for your courses yet.')}
      </div>
    </section>`;

  /* check-in handler */
  const form  = $('#checkinForm2');
  const input = $('#checkinCode2');
  const msg   = $('#checkinMsg2');

  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'alert hidden';

    const code = input.value.trim();
    if (code.length !== 6){
      msg.className = 'alert error';
      msg.textContent = 'Enter a valid 6-character code.';
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true);

    try {
      const { data, error } = await db.rpc('check_in', { p_code: code });
      if (error) throw error;

      msg.className = data?.ok ? 'alert success' : 'alert error';
      msg.textContent = data?.message || 'Done';

      if (data?.ok){
        toast('Attendance recorded ✅', 'success');
        setTimeout(() => location.reload(), 1200);
      }
    } catch (err) {
      msg.className = 'alert error';
      msg.textContent = err.message;
    } finally {
      setLoading(btn, false);
    }
  });
}

/* ==================================================================
   OFFICER VIEW
   ================================================================== */
async function renderOfficerView(me, root){
  await initShell({ role: 'officer', active: 'attendance.html', title: 'Attendance' });

  root.innerHTML = '<div class="skeleton-list"></div>';

  const { data, error } = await db
    .from('sessions')
    .select('id, code, session_date, is_open, courses:course_id(code, title, department), attendance(count)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error){ root.innerHTML = emptyState('⚠️', error.message); return; }

  if (!data?.length){
    root.innerHTML = emptyState('🗓️', 'No sessions recorded yet.');
    return;
  }

  root.innerHTML = `
    <section class="card">
      <div class="card-head"><h3>All sessions</h3><small class="muted">${data.length} sessions</small></div>
      <div class="card-body">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Course</th><th>Department</th><th>Date</th><th>Code</th><th>Checked in</th><th>Status</th></tr></thead>
            <tbody>
              ${data.map(s => `
                <tr>
                  <td><strong>${escapeHtml(s.courses?.code || '—')}</strong>
                      <span class="muted">${escapeHtml(s.courses?.title || '')}</span></td>
                  <td class="muted">${escapeHtml(s.courses?.department || '—')}</td>
                  <td>${fmtDate(s.session_date)}</td>
                  <td><span class="s-code">${escapeHtml(s.code)}</span></td>
                  <td>${s.attendance?.[0]?.count ?? 0}</td>
                  <td>${s.is_open
                    ? '<span class="badge present">open</span>'
                    : '<span class="badge neutral">closed</span>'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
}