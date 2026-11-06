/* ============ js/officer.js ============ */
document.addEventListener('DOMContentLoaded', async () => {
  const me = await initShell({ role: 'officer', active: 'officer.html', title: 'Officer' });
  if (!me) return;

  const statsEl = $('#stats');
  statsEl.innerHTML = skeletonStats(4);

  try {
    const [
      { count: studentCount },
      { count: courseCount },
      { count: sessionCount },
      { count: recordCount }
    ] = await Promise.all([
      db.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
      db.from('courses').select('*', { count: 'exact', head: true }),
      db.from('sessions').select('*', { count: 'exact', head: true }),
      db.from('attendance').select('*', { count: 'exact', head: true })
    ]);

    statsEl.innerHTML = [
      statCard('👥', studentCount ?? 0, 'Students', ''),
      statCard('📚', courseCount ?? 0, 'Courses', 'blue'),
      statCard('🗓️', sessionCount ?? 0, 'Sessions', 'amber'),
      statCard('✅', recordCount ?? 0, 'Attendance records', 'green')
    ].join('');
  } catch (err) {
    toast('Could not load stats: ' + err.message, 'error');
  }

  /* ----- latest sessions ----- */
  const listEl = $('#sessionList');
  try {
    const { data, error } = await db
      .from('sessions')
      .select('id, code, session_date, is_open, created_at, courses:course_id(code, title, department)')
      .order('created_at', { ascending: false })
      .limit(12);
    if (error) throw error;

    if (!data?.length){
      listEl.innerHTML = emptyState('🗓️', 'No sessions recorded yet.');
    } else {
      listEl.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Course</th><th>Date</th><th>Code</th><th>Status</th></tr></thead>
            <tbody>
              ${data.map(s => `
                <tr>
                  <td><strong>${escapeHtml(s.courses?.code || '—')}</strong>
                      <span class="muted">${escapeHtml(s.courses?.title || '')}</span></td>
                  <td>${fmtDate(s.session_date)}</td>
                  <td><span class="s-code">${escapeHtml(s.code)}</span></td>
                  <td>${s.is_open
                    ? '<span class="badge present">open</span>'
                    : '<span class="badge neutral">closed</span>'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }
  } catch (err) {
    listEl.innerHTML = emptyState('⚠️', err.message);
  }

  /* ----- departments breakdown ----- */
  const deptEl = $('#departmentList');
  try {
    const { data, error } = await db.from('courses').select('department');
    if (error) throw error;

    const counts = {};
    (data || []).forEach(c => {
      const d = c.department || 'Unassigned';
      counts[d] = (counts[d] || 0) + 1;
    });

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length){
      deptEl.innerHTML = emptyState('🏫', 'No departments registered.');
    } else {
      deptEl.innerHTML = `<div class="course-grid">${entries.map(([dept, n]) => `
        <div class="course-card">
          <div class="code">Department</div>
          <h4>${escapeHtml(dept)}</h4>
          <div class="meta"><span>${n} course${n === 1 ? '' : 's'}</span></div>
        </div>`).join('')}</div>`;
    }
  } catch (err) {
    deptEl.innerHTML = emptyState('⚠️', err.message);
  }
});