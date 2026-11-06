/* ============ js/reports.js ============ */
document.addEventListener('DOMContentLoaded', async () => {
  const profile = await getProfile();
  if (!profile){ location.replace('login.html'); return; }

  const shellRole = profile.role;
  await initShell({ role: shellRole, active: 'reports.html', title: 'Reports' });

  const courseSel = $('#filterCourse');
  const fromEl    = $('#filterFrom');
  const toEl      = $('#filterTo');
  const statusSel = $('#filterStatus');
  const tableEl   = $('#reportTable');
  const countEl   = $('#recordCount');
  const statsEl   = $('#reportStats');

  let courses = [];
  let rows    = [];

  /* ---------- load course options ---------- */
  let cq = db.from('courses').select('id, code, title').order('code');
  if (profile.role === 'teacher') cq = cq.eq('teacher_id', profile.id);
  const { data: courseData } = await cq;
  courses = courseData || [];
  courseSel.innerHTML = '<option value="">All courses</option>' +
    courses.map(c => `<option value="${c.id}">${escapeHtml(c.code)} — ${escapeHtml(c.title)}</option>`).join('');

  /* ---------- default date range = last 30 days ---------- */
  const to = new Date();
  const from = new Date(); from.setDate(from.getDate() - 30);
  fromEl.value = from.toISOString().slice(0, 10);
  toEl.value   = to.toISOString().slice(0, 10);

  /* ---------- fetch ---------- */
  async function load(){
    tableEl.innerHTML = '<div class="skeleton-list"></div>';
    statsEl.innerHTML = skeletonStats(4);

    let q = db
      .from('attendance')
      .select(`
        id, status, marked_at,
        profiles:student_id(id, full_name, matric_no),
        sessions:session_id(id, session_date, course_id, courses:course_id(id, code, title))
      `)
      .order('marked_at', { ascending: false })
      .limit(2000);

    if (statusSel.value) q = q.eq('status', statusSel.value);
    if (fromEl.value)    q = q.gte('marked_at', `${fromEl.value}T00:00:00`);
    if (toEl.value)      q = q.lte('marked_at', `${toEl.value}T23:59:59`);

    const { data, error } = await q;
    if (error){
      tableEl.innerHTML = emptyState('⚠️', error.message);
      statsEl.innerHTML = '';
      return;
    }

    let list = data || [];

    /* client-side filters */
    if (courseSel.value){
      list = list.filter(r => r.sessions?.course_id === courseSel.value);
    }
    if (profile.role === 'student'){
      list = list.filter(r => r.profiles?.id === profile.id);
    }

    rows = list;
    render();
  }

  /* ---------- render ---------- */
  function render(){
    const total   = rows.length;
    const present = rows.filter(r => r.status === 'present').length;
    const late    = rows.filter(r => r.status === 'late').length;
    const absent  = rows.filter(r => r.status === 'absent').length;
    const rate    = percent(present + late, total);

    statsEl.innerHTML = [
      statCard('📋', total, 'Total records', ''),
      statCard('✅', present + late, 'Attended', 'green'),
      statCard('❌', absent, 'Absent', 'red'),
      statCard('📊', rate + '%', 'Attendance rate', rate >= 75 ? 'green' : 'amber')
    ].join('');

    countEl.textContent = `${total} record${total === 1 ? '' : 's'}`;

    if (!total){
      tableEl.innerHTML = emptyState('📊', 'No records match your filters.');
      return;
    }

    tableEl.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Student</th><th>Matric</th><th>Course</th><th>Date</th><th>Status</th><th>Marked</th></tr>
          </thead>
          <tbody>
            ${rows.slice(0, 500).map(r => `
              <tr>
                <td><strong>${escapeHtml(r.profiles?.full_name || '—')}</strong></td>
                <td class="muted">${escapeHtml(r.profiles?.matric_no || '—')}</td>
                <td>${escapeHtml(r.sessions?.courses?.code || '—')}
                    <span class="muted">${escapeHtml(r.sessions?.courses?.title || '')}</span></td>
                <td>${fmtDate(r.sessions?.session_date)}</td>
                <td>${statusBadge(r.status)}</td>
                <td class="muted">${fmtDateTime(r.marked_at)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${rows.length > 500 ? '<p class="muted" style="padding:1rem;font-size:.8rem">Showing first 500 rows — export CSV for the full dataset.</p>' : ''}`;
  }

  /* ---------- CSV export ---------- */
  $('#exportBtn').addEventListener('click', () => {
    if (!rows.length) return toast('Nothing to export', 'warning');

    const header = ['Student', 'Matric', 'Course Code', 'Course Title', 'Date', 'Status', 'Marked At'];
    const lines = [header.join(',')];

    rows.forEach(r => {
      const cells = [
        r.profiles?.full_name || '',
        r.profiles?.matric_no || '',
        r.sessions?.courses?.code || '',
        r.sessions?.courses?.title || '',
        r.sessions?.session_date || '',
        r.status || '',
        r.marked_at || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cells.join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `attendx-report-${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast('Report exported', 'success');
  });

  /* ---------- filters ---------- */
  $('#applyFilters').addEventListener('click', load);
  $('#resetFilters').addEventListener('click', () => {
    courseSel.value = '';
    statusSel.value = '';
    const t = new Date();
    const f = new Date(); f.setDate(f.getDate() - 30);
    fromEl.value = f.toISOString().slice(0, 10);
    toEl.value   = t.toISOString().slice(0, 10);
    load();
  });

  await load();
});