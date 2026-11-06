/* ============ js/student.js ============ */
document.addEventListener('DOMContentLoaded', async () => {
  const me = await initShell({ role: 'student', active: 'student.html', title: 'Student' });
  if (!me) return;

  const statsEl = $('#stats');
  statsEl.innerHTML = skeletonStats(4);

  try {
    /* --- enrolled courses --- */
    const { data: enrolls, error: eErr } = await db
      .from('enrollments')
      .select('course_id, courses:course_id(id, code, title, department)')
      .eq('student_id', me.id);
    if (eErr) throw eErr;

    const courses = (enrolls || []).map(e => e.courses).filter(Boolean);
    const courseIds = courses.map(c => c.id);

    /* --- my attendance records --- */
    let records = [];
    if (courseIds.length){
      const { data, error } = await db
        .from('attendance')
        .select('id, status, marked_at, session_id, sessions:session_id(id, session_date, course_id, code)')
        .eq('student_id', me.id)
        .order('marked_at', { ascending: false });
      if (error) throw error;
      records = data || [];
    }

    /* --- open sessions in my courses --- */
    let openSessions = [];
    if (courseIds.length){
      const { data, error } = await db
        .from('sessions')
        .select('id, code, session_date, topic, course_id')
        .in('course_id', courseIds)
        .eq('is_open', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      openSessions = data || [];
    }

    /* --- stats --- */
    const present = records.filter(r => r.status === 'present' || r.status === 'late').length;
    const total   = records.length;
    const rate    = percent(present, total);

    statsEl.innerHTML = [
      statCard('📚', courses.length, 'Enrolled courses', 'blue'),
      statCard('✅', present, 'Classes attended', 'green'),
      statCard('📉', total - present, 'Classes missed', 'red'),
      statCard('📊', rate + '%', 'Attendance rate', rate >= 75 ? 'green' : 'amber')
    ].join('');

    renderCourses(courses, records);
    renderOpenSessions(openSessions, courses);
    renderRecent(records, courses);

  } catch (err) {
    toast('Failed to load dashboard: ' + err.message, 'error');
    statsEl.innerHTML = '';
  }

  /* --- check-in form --- */
  const form = $('#checkinForm');
  const msg  = $('#checkinMsg');
  const input = $('#checkinCode');

  input?.addEventListener('input', () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'alert hidden';

    const code = input.value.trim().toUpperCase();
    if (code.length !== 6){
      msg.className = 'alert error';
      msg.textContent = 'Please enter a valid 6-character code.';
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    setLoading(btn, true);

    try {
      const { data, error } = await db.rpc('check_in', { p_code: code });
      if (error) throw error;

      if (data?.ok){
        msg.className = 'alert success';
        msg.textContent = data.message || 'Attendance recorded ✅';
        input.value = '';
        toast('Checked in successfully', 'success');
        setTimeout(() => location.reload(), 1200);
      } else {
        msg.className = 'alert error';
        msg.textContent = data?.message || 'Could not check in.';
      }
    } catch (err) {
      msg.className = 'alert error';
      msg.textContent = err.message || 'Check-in failed.';
    } finally {
      setLoading(btn, false);
    }
  });
});

/* ------------------------------------------------------------------ */
function renderCourses(courses, records){
  const box = $('#myCourses');
  if (!courses.length){
    box.innerHTML = emptyState('📚', 'You are not enrolled in any course yet.');
    return;
  }

  box.innerHTML = `<div class="course-grid">${courses.map(c => {
    const recs = records.filter(r => r.sessions?.course_id === c.id);
    const attended = recs.filter(r => r.status === 'present' || r.status === 'late').length;
    const rate = percent(attended, recs.length);
    const cls = rate >= 75 ? 'good' : rate >= 50 ? 'warn' : 'bad';

    return `
      <div class="course-card">
        <div class="code">${escapeHtml(c.code)}</div>
        <h4>${escapeHtml(c.title)}</h4>
        <div class="progress ${cls}"><i style="width:${rate}%"></i></div>
        <div class="meta">
          <span>${attended}/${recs.length} classes</span>
          <strong>${rate}%</strong>
        </div>
      </div>`;
  }).join('')}</div>`;
}

function renderOpenSessions(sessions, courses){
  const box = $('#openSessions');
  if (!sessions.length){
    box.innerHTML = emptyState('🕒', 'No open sessions right now.');
    return;
  }

  const map = Object.fromEntries(courses.map(c => [c.id, c]));

  box.innerHTML = sessions.map(s => {
    const c = map[s.course_id];
    return `
      <div class="session-item">
        <span class="s-code">${escapeHtml(s.code)}</span>
        <div class="s-main">
          <strong>${escapeHtml(c?.code || '')} — ${escapeHtml(c?.title || '')}</strong>
          <small>${fmtDate(s.session_date)}${s.topic ? ' · ' + escapeHtml(s.topic) : ''}</small>
        </div>
        <button class="btn btn-sm btn-primary" data-fill="${escapeHtml(s.code)}">Use code</button>
      </div>`;
  }).join('');

  box.querySelectorAll('[data-fill]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = $('#checkinCode');
      input.value = btn.dataset.fill;
      input.focus();
      window.scrollTo({ top: input.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' });
    });
  });
}

function renderRecent(records, courses){
  const box = $('#recentAttendance');
  if (!records.length){
    box.innerHTML = emptyState('📋', 'No attendance records yet.');
    return;
  }

  const map = Object.fromEntries(courses.map(c => [c.id, c]));

  box.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Course</th><th>Date</th><th>Status</th><th>Marked</th></tr></thead>
        <tbody>
          ${records.slice(0, 12).map(r => {
            const c = map[r.sessions?.course_id];
            return `
              <tr>
                <td><strong>${escapeHtml(c?.code || '—')}</strong> <span class="muted">${escapeHtml(c?.title || '')}</span></td>
                <td>${fmtDate(r.sessions?.session_date)}</td>
                <td>${statusBadge(r.status)}</td>
                <td class="muted">${fmtDateTime(r.marked_at)}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}