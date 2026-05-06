
    const state = {
      user: null,
      activeTab: "overview",
      query: "",
      status: "all",
      course: "all",
      selectedAssignmentId: null,
      selectedSubmissionId: null,
      assignments: [],
      submissions: [],
      notifications: [],
      users: [],
      courses: [],
      dashboard: null,
      assignmentDraft: null
    };

    const els = {
      loginView: document.getElementById("loginView"),
      appView: document.getElementById("appView"),
      loginForm: document.getElementById("loginForm"),
      nav: document.getElementById("nav"),
      tabs: document.getElementById("tabs"),
      content: document.getElementById("content"),
      searchInput: document.getElementById("searchInput"),
      logoutBtn: document.getElementById("logoutBtn"),
      dateChip: document.getElementById("dateChip"),
      userChip: document.getElementById("userChip"),
      userCard: document.getElementById("userCard"),
      roleHint: document.getElementById("roleHint"),
      toast: document.getElementById("toast")
    };

    const icons = {
      overview: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-5H4v5Z"></path></svg>',
      assignments: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"></path></svg>',
      submissions: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
      users: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><path d="M20 8v6M23 11h-6"></path></svg>',
      notifications: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"></path><path d="M9 17a3 3 0 0 0 6 0"></path></svg>',
      refresh: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-15.3-6.4L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 15.3 6.4L21 16"></path><path d="M16 19h5v5"></path></svg>',
      add: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>'
    };

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function fmtDate(value) {
      if (!value) return "-";
      const d = new Date(value);
      return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(d);
    }

    function toLocalInput(value) {
      if (!value) return "";
      const d = new Date(value);
      const offset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - offset).toISOString().slice(0, 16);
    }

    function toast(text) {
      els.toast.textContent = text;
      els.toast.classList.add("show");
      clearTimeout(window.__toastTimer);
      window.__toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
    }

    async function api(path, options = {}) {
      const res = await fetch(path, {
        credentials: "same-origin",
        ...options,
        headers: options.body instanceof FormData
          ? options.headers || {}
          : { "Content-Type": "application/json", ...(options.headers || {}) }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "请求失败");
      return data;
    }

    function visibleTabs() {
      const items = [
        { id: "overview", label: "总览", role: "all" },
        { id: "assignments", label: "作业管理", role: "all" },
        { id: "submissions", label: "批改中心", role: "admin" },
        { id: "users", label: "用户管理", role: "admin" },
        { id: "notifications", label: "通知中心", role: "all" }
      ];
      return items.filter((item) => item.role === "all" || state.user?.role === item.role);
    }

    function activeAssignment() {
      if (state.assignmentDraft) return state.assignmentDraft;
      return state.assignments.find((item) => item.id === state.selectedAssignmentId) || state.assignments[0] || null;
    }

    async function loadSession() {
      try {
        const data = await api("/api/me");
        state.user = data.user;
        showApp();
        await loadAll();
      } catch {
        showLogin();
      }
    }

    function showLogin() {
      els.loginView.classList.remove("hidden");
      els.appView.classList.add("hidden");
    }

    function showApp() {
      els.loginView.classList.add("hidden");
      els.appView.classList.remove("hidden");
      els.userChip.textContent = `${state.user.displayName} · ${state.user.role === "admin" ? "管理员" : "学生"}`;
      els.userCard.textContent = `${state.user.displayName} / ${state.user.username}`;
      els.roleHint.textContent = state.user.role === "admin" ? "管理员视图" : "学生视图";
      renderNav();
      renderTabs();
      renderDate();
    }

    function renderNav() {
      els.nav.innerHTML = visibleTabs().map((item) => `
        <button class="${state.activeTab === item.id ? "active" : ""}" data-tab="${item.id}" aria-selected="${state.activeTab === item.id}">
          ${icons[item.id] || ""}
          ${item.label}
        </button>
      `).join("");
    }

    function renderTabs() {
      els.tabs.innerHTML = visibleTabs().map((item) => `
        <button class="${state.activeTab === item.id ? "active" : ""}" data-tab="${item.id}">${item.label}</button>
      `).join("");
    }

    function renderDate() {
      els.dateChip.textContent = new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short"
      }).format(new Date());
    }

    async function loadAll() {
      const params = new URLSearchParams({ q: state.query, status: state.status, course: state.course });
      const [dashboard, assignments, notifications, courses] = await Promise.all([
        api(`/api/dashboard?${params}`),
        api(`/api/assignments?${params}`),
        api("/api/notifications"),
        api("/api/courses")
      ]);
      state.dashboard = dashboard;
      state.assignments = assignments.items;
      state.notifications = notifications.items;
      state.courses = courses.items;
      if (!state.selectedAssignmentId && state.assignments[0]) {
        state.selectedAssignmentId = state.assignments[0].id;
      }
      if (state.activeTab === "submissions" && state.user.role === "admin") {
        await loadSubmissions();
      }
      if (state.activeTab === "users" && state.user.role === "admin") {
        await loadUsers();
      }
      render();
    }

    async function loadSubmissions() {
      const item = activeAssignment();
      if (!item) {
        state.submissions = [];
        return;
      }
      const data = await api(`/api/assignments/${item.id}/submissions`);
      state.submissions = data.items;
      const preview = document.getElementById("submissionPreview");
      if (preview) {
        preview.innerHTML = state.submissions.length ? `
          <div class="list">
            ${state.submissions.map((row) => `
              <div class="list-item">
                <div class="row">
                  <div>
                    <strong>${escapeHtml(row.studentName)}</strong>
                    <p>${escapeHtml(row.studentUsername)} · ${escapeHtml(row.studentClass || "未填写班级")}</p>
                  </div>
                  <span class="tag ${statusClass(row.status)}">${statusText(row.status)}</span>
                </div>
                <p>提交时间：${fmtDate(row.submittedAt)}</p>
                <p>${escapeHtml(row.answerText || "仅附件提交")}</p>
                ${row.attachmentPath ? `<p><a href="/api/download?file=${encodeURIComponent(row.attachmentPath)}">下载附件：${escapeHtml(row.attachmentName || "附件")}</a></p>` : ""}
                <form class="stack" data-grade-form="${row.id}" style="margin-top:10px">
                  <div class="field"><label>分数</label><input name="score" type="number" min="0" max="${activeAssignment()?.points || 100}" value="${row.score ?? ""}" /></div>
                  <div class="field"><label>反馈</label><textarea name="feedback">${escapeHtml(row.feedback || "")}</textarea></div>
                  <button class="btn primary" type="submit">保存批改</button>
                </form>
              </div>
            `).join("")}
          </div>
        ` : `<div class="empty">暂无提交</div>`;
      }
    }

    async function loadUsers() {
      const data = await api("/api/users");
      state.users = data.items;
    }

    function render() {
      renderNav();
      renderTabs();
      els.content.innerHTML = "";
      if (state.activeTab === "overview") {
        renderOverview();
      } else if (state.activeTab === "assignments") {
        renderAssignments();
      } else if (state.activeTab === "submissions") {
        renderSubmissions();
      } else if (state.activeTab === "users") {
        renderUsers();
      } else if (state.activeTab === "notifications") {
        renderNotifications();
      }
    }

    function renderOverview() {
      const upcoming = [...state.assignments].slice(0, 5);
      const recent = [...state.notifications].slice(0, 4);
      els.content.innerHTML = `
        <section class="section">
          <div class="section-head">
            <h2>总览</h2>
            <div class="controls">
              <button class="btn ghost" data-action="refresh">${icons.refresh} 刷新</button>
            </div>
          </div>
          <div class="section-body stack">
            <div class="stats">
              <div class="stat"><div class="k">待提交</div><div class="v">${state.dashboard?.todo ?? 0}</div><div class="s">当前未完成作业</div></div>
              <div class="stat"><div class="k">已提交</div><div class="v">${state.dashboard?.submitted ?? 0}</div><div class="s">等待批改或复核</div></div>
              <div class="stat"><div class="k">平均成绩</div><div class="v">${state.dashboard?.avgScore ?? "--"}</div><div class="s">已批改作业统计</div></div>
              <div class="stat"><div class="k">48 小时提醒</div><div class="v">${state.dashboard?.dueSoon ?? 0}</div><div class="s">即将截止的作业</div></div>
            </div>
            <div class="grid-2">
              <div class="panel">
                <div class="panel-head">
                  <h3>近期作业</h3>
                </div>
                <div class="panel-body">
                  ${upcoming.length ? `
                    <table>
                      <thead><tr><th>作业</th><th>课程</th><th>截止</th><th>状态</th></tr></thead>
                      <tbody>
                        ${upcoming.map(renderAssignmentRow).join("")}
                      </tbody>
                    </table>
                  ` : `<div class="empty">暂无作业</div>`}
                </div>
              </div>
              <div class="panel">
                <div class="panel-head">
                  <h3>最近通知</h3>
                </div>
                <div class="panel-body list">
                  ${recent.length ? recent.map(renderNotificationItem).join("") : `<div class="empty">暂无通知</div>`}
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
    }

    function filtersMarkup() {
      const statuses = [
        ["all", "全部"],
        ["todo", "待提交"],
        ["submitted", "已提交"],
        ["graded", "已批改"]
      ];
      return `
        <div class="toolbar">
          <div class="controls">
            ${statuses.map(([value, label]) => `<button class="${state.status === value ? "active" : ""}" data-status="${value}">${label}</button>`).join("")}
            <select id="courseFilter">
              <option value="all">全部课程</option>
              ${state.courses.map((item) => `<option value="${escapeHtml(item)}" ${state.course === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
            </select>
          </div>
          ${state.user.role === "admin" ? `<div class="controls"><button class="btn primary" data-action="new-assignment">${icons.add} 新建作业</button></div>` : ""}
        </div>
      `;
    }

    function renderAssignments() {
      const item = activeAssignment();
      const rows = state.assignments;
      els.content.innerHTML = `
        <section class="section">
          <div class="section-head">
            <h2>作业管理</h2>
            <div class="controls">
              <button class="btn ghost" data-action="refresh">${icons.refresh} 刷新</button>
            </div>
          </div>
          <div class="section-body">
            ${filtersMarkup()}
            <div class="grid-2">
              <div class="panel">
                <div class="panel-head">
                  <h3>作业列表</h3>
                </div>
                <div class="panel-body" style="padding:0;overflow:auto;max-height:640px">
                  ${rows.length ? `
                    <table>
                      <thead><tr><th>作业</th><th>课程</th><th>截止</th><th>状态</th><th>分值</th></tr></thead>
                      <tbody>
                        ${rows.map(renderAssignmentRow).join("")}
                      </tbody>
                    </table>
                  ` : `<div class="empty" style="margin:14px">暂无匹配作业</div>`}
                </div>
              </div>
              <div class="panel">
                <div class="panel-head">
                  <h3>${state.user.role === "admin" ? "编辑作业" : "作业详情"}</h3>
                </div>
                <div class="panel-body">
                  ${item ? renderAssignmentDetail(item) : `<div class="empty">请选择一条作业</div>`}
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
    }

    function renderSubmissions() {
      const item = activeAssignment();
      els.content.innerHTML = `
        <section class="section">
          <div class="section-head">
            <h2>批改中心</h2>
            <div class="controls">
              <button class="btn ghost" data-action="refresh">${icons.refresh} 刷新</button>
            </div>
          </div>
          <div class="section-body">
            ${filtersMarkup()}
            <div class="grid-2">
              <div class="panel">
                <div class="panel-head"><h3>提交列表</h3></div>
                <div class="panel-body" style="padding:0;overflow:auto;max-height:640px">
                  ${state.assignments.length ? `
                    <table>
                      <thead><tr><th>作业</th><th>课程</th><th>截止</th><th>状态</th></tr></thead>
                      <tbody>${state.assignments.map(renderAssignmentRow).join("")}</tbody>
                    </table>
                  ` : `<div class="empty" style="margin:14px">暂无作业</div>`}
                </div>
              </div>
              <div class="panel">
                <div class="panel-head"><h3>提交详情</h3></div>
                <div class="panel-body">
                  ${item ? renderSubmissionDetail(item) : `<div class="empty">请选择一条作业</div>`}
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
    }

    function renderUsers() {
      els.content.innerHTML = `
        <section class="section">
          <div class="section-head">
            <h2>用户管理</h2>
            <div class="controls">
              <button class="btn ghost" data-action="refresh">${icons.refresh} 刷新</button>
            </div>
          </div>
          <div class="section-body">
            <div class="grid-2">
              <div class="panel">
                <div class="panel-head"><h3>用户列表</h3></div>
                <div class="panel-body" style="padding:0;overflow:auto;max-height:640px">
                  ${state.users.length ? `
                    <table>
                      <thead><tr><th>用户名</th><th>角色</th><th>姓名</th><th>班级</th></tr></thead>
                      <tbody>
                        ${state.users.map((user) => `
                          <tr data-user-id="${user.id}">
                            <td data-label="用户名">${escapeHtml(user.username)}</td>
                            <td data-label="角色"><span class="tag ${user.role === "admin" ? "graded" : "submitted"}">${user.role === "admin" ? "管理员" : "学生"}</span></td>
                            <td data-label="姓名">${escapeHtml(user.displayName)}</td>
                            <td data-label="班级">${escapeHtml(user.className)}</td>
                          </tr>
                        `).join("")}
                      </tbody>
                    </table>
                  ` : `<div class="empty" style="margin:14px">暂无用户</div>`}
                </div>
              </div>
              <div class="panel">
                <div class="panel-head"><h3>新增用户</h3></div>
                <div class="panel-body">
                  <form id="userForm" class="stack">
                    <div class="field"><label>用户名</label><input name="username" /></div>
                    <div class="field"><label>密码</label><input name="password" type="password" /></div>
                    <div class="field"><label>姓名</label><input name="displayName" /></div>
                    <div class="field"><label>班级</label><input name="className" /></div>
                    <div class="field"><label>角色</label><select name="role"><option value="student">学生</option><option value="admin">管理员</option></select></div>
                    <button class="btn primary" type="submit">创建用户</button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
    }

    function renderNotifications() {
      const items = state.notifications;
      els.content.innerHTML = `
        <section class="section">
          <div class="section-head">
            <h2>通知中心</h2>
            <div class="controls">
              <button class="btn ghost" data-action="refresh">${icons.refresh} 刷新</button>
            </div>
          </div>
          <div class="section-body">
            <div class="grid-2">
              <div class="panel">
                <div class="panel-head"><h3>通知列表</h3></div>
                <div class="panel-body">
                  <div class="list">
                    ${items.length ? items.map(renderNotificationItem).join("") : `<div class="empty">暂无通知</div>`}
                  </div>
                </div>
              </div>
              <div class="panel">
                <div class="panel-head"><h3>${state.user.role === "admin" ? "发布通知" : "已读管理"}</h3></div>
                <div class="panel-body">
                  ${state.user.role === "admin" ? renderNotificationForm() : `<div class="empty">学生端仅查看通知，不支持发布。</div>`}
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
    }

    function renderNotificationForm() {
      return `
        <form id="notifyForm" class="stack">
          <div class="field"><label>标题</label><input name="title" /></div>
          <div class="field"><label>内容</label><textarea name="body"></textarea></div>
          <div class="field">
            <label>目标角色</label>
            <select name="targetRole">
              <option value="all">全部</option>
              <option value="admin">管理员</option>
              <option value="student">学生</option>
            </select>
          </div>
          <button class="btn primary" type="submit">发布通知</button>
        </form>
      `;
    }

    function renderAssignmentRow(item) {
      const selected = item.id === state.selectedAssignmentId ? "selected" : "";
      return `
        <tr class="${selected}" data-assignment-id="${item.id}">
          <td data-label="作业">
            <div style="font-weight:600">${escapeHtml(item.title)}</div>
            <div style="color:var(--muted);font-size:12px;margin-top:4px">${escapeHtml(item.priority)} 优先级</div>
          </td>
          <td data-label="课程">${escapeHtml(item.course)}</td>
          <td data-label="截止">${fmtDate(item.dueDate)}</td>
          <td data-label="状态"><span class="tag ${statusClass(item.status)}">${statusText(item.status)}</span></td>
          <td data-label="分值">${item.points}</td>
        </tr>
      `;
    }

    function statusClass(status) {
      return status === "graded" ? "graded" : status === "submitted" ? "submitted" : status === "overdue" ? "overdue" : "todo";
    }

    function statusText(status) {
      return {
        todo: "待提交",
        submitted: "已提交",
        graded: "已批改",
        overdue: "已逾期"
      }[status] || "未知";
    }

    function renderAssignmentDetail(item) {
      const isAdmin = state.user.role === "admin";
      const isDraft = !item.id;
      const assignmentForm = `
        <form id="assignmentForm" class="stack">
          <div class="field"><label>标题</label><input name="title" value="${escapeHtml(item.title)}" /></div>
          <div class="field"><label>课程</label><input name="course" value="${escapeHtml(item.course)}" /></div>
          <div class="field"><label>截止时间</label><input name="dueDate" type="datetime-local" value="${toLocalInput(item.dueDate)}" /></div>
          <div class="field"><label>分值</label><input name="points" type="number" value="${item.points}" min="1" /></div>
          <div class="field"><label>优先级</label><select name="priority">
            ${["高","中","低"].map((value) => `<option value="${value}" ${item.priority === value ? "selected" : ""}>${value}</option>`).join("")}
          </select></div>
          <div class="field"><label>描述</label><textarea name="description">${escapeHtml(item.description)}</textarea></div>
          <div class="actions">
            <button class="btn primary" type="submit">保存作业</button>
            ${isDraft ? "" : `<button class="btn secondary" type="button" data-action="delete-assignment">删除</button>`}
            <button class="btn ghost" type="button" data-action="new-assignment">新建作业</button>
          </div>
        </form>
      `;
      const studentSubmission = `
        <div class="stack">
          <div class="meta">
            <div><span>截止时间</span><strong>${fmtDate(item.dueDate)}</strong></div>
            <div><span>总分</span><strong>${item.points} 分</strong></div>
            <div><span>状态</span><strong><span class="tag ${statusClass(item.status)}">${statusText(item.status)}</span></strong></div>
            <div><span>课程</span><strong>${escapeHtml(item.course)}</strong></div>
          </div>
          <div class="desc">${escapeHtml(item.description)}</div>
          ${item.answerText || item.attachmentName ? `
            <div class="desc">
              <strong style="display:block;margin-bottom:6px">当前提交</strong>
              <div>${escapeHtml(item.answerText || "附件提交")}</div>
              ${item.attachmentPath ? `<div style="margin-top:8px"><a href="/api/download?file=${encodeURIComponent(item.attachmentPath)}">下载附件：${escapeHtml(item.attachmentName || "附件")}</a></div>` : ""}
            </div>
          ` : ""}
          ${item.feedback ? `<div class="desc"><strong style="display:block;margin-bottom:6px">教师反馈</strong>${escapeHtml(item.feedback)}</div>` : ""}
          <form id="submissionForm" class="stack">
            <div class="field"><label>答案内容</label><textarea name="answerText" placeholder="输入答案说明或提交备注"></textarea></div>
            <div class="field"><label>附件</label><input name="attachment" type="file" /></div>
            <button class="btn primary" type="submit">提交作业</button>
          </form>
        </div>
      `;
      return `
        <div class="stack">
          <div class="meta">
            <div><span>截止时间</span><strong>${fmtDate(item.dueDate)}</strong></div>
            <div><span>总分</span><strong>${item.points} 分</strong></div>
            <div><span>状态</span><strong><span class="tag ${statusClass(item.status)}">${statusText(item.status)}</span></strong></div>
            <div><span>课程</span><strong>${escapeHtml(item.course)}</strong></div>
          </div>
          <div class="desc">${escapeHtml(item.description)}</div>
          ${isAdmin ? `
            ${assignmentForm}
            ${isDraft ? `<div class="empty">保存后可查看该作业的学生提交。</div>` : `<div class="panel" style="box-shadow:none">
              <div class="panel-head"><h3>学生提交</h3></div>
              <div class="panel-body" id="submissionPreview">
                <div class="empty">正在加载提交列表...</div>
              </div>
            </div>`}
          ` : studentSubmission}
        </div>
      `;
    }

    function emptyAssignment() {
      return {
        id: null,
        title: "",
        course: "",
        dueDate: "",
        points: 100,
        priority: "中",
        description: ""
      };
    }

    function renderSubmissionDetail(item) {
      if (!item) return `<div class="empty">请选择一条作业</div>`;
      const rows = state.submissions;
      return `
        <div class="stack">
          <div class="meta">
            <div><span>截止时间</span><strong>${fmtDate(item.dueDate)}</strong></div>
            <div><span>总分</span><strong>${item.points} 分</strong></div>
            <div><span>状态</span><strong><span class="tag ${statusClass(item.status)}">${statusText(item.status)}</span></strong></div>
            <div><span>课程</span><strong>${escapeHtml(item.course)}</strong></div>
          </div>
          <div class="desc">${escapeHtml(item.description)}</div>
          ${rows.length ? `
            <div class="list">
              ${rows.map((row) => `
                <div class="list-item">
                  <div class="row">
                    <div>
                      <strong>${escapeHtml(row.studentName)}</strong>
                      <p>${escapeHtml(row.studentUsername)} · ${escapeHtml(row.studentClass || "未填写班级")}</p>
                    </div>
                    <span class="tag ${statusClass(row.status)}">${statusText(row.status)}</span>
                  </div>
                  <p>提交时间：${fmtDate(row.submittedAt)}</p>
                  <p>${escapeHtml(row.answerText || "仅附件提交")}</p>
                  ${row.attachmentPath ? `<p><a href="/api/download?file=${encodeURIComponent(row.attachmentPath)}">下载附件：${escapeHtml(row.attachmentName || "附件")}</a></p>` : ""}
                  <form class="stack" data-grade-form="${row.id}" style="margin-top:10px">
                    <div class="field"><label>分数</label><input name="score" type="number" min="0" max="${item.points}" value="${row.score ?? ""}" /></div>
                    <div class="field"><label>反馈</label><textarea name="feedback">${escapeHtml(row.feedback || "")}</textarea></div>
                    <button class="btn primary" type="submit">保存批改</button>
                  </form>
                </div>
              `).join("")}
            </div>
          ` : `<div class="empty">暂无提交</div>`}
        </div>
      `;
    }

    function renderNotificationItem(item) {
      return `
        <div class="list-item">
          <div class="row">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.body)}</p>
            </div>
            <span class="tag graded">${item.targetRole === "all" ? "全部" : item.targetRole === "admin" ? "管理员" : "学生"}</span>
          </div>
          <p>${escapeHtml(item.creatorName)} · ${escapeHtml(item.createdAtLabel)}</p>
          ${state.user ? `<button class="btn secondary" data-action="read-notification" data-id="${item.id}">标记已读</button>` : ""}
        </div>
      `;
    }

    function setActiveTab(tab) {
      state.activeTab = tab;
      render();
      loadTabData();
    }

    async function loadTabData() {
      try {
        if (state.activeTab === "submissions" && state.user.role === "admin") {
          await loadSubmissions();
          render();
        }
        if (state.activeTab === "users" && state.user.role === "admin") {
          await loadUsers();
          render();
        }
      } catch (error) {
        toast(error.message);
      }
    }

    async function refreshData() {
      try {
        await loadAll();
        toast("已刷新");
      } catch (error) {
        toast(error.message);
      }
    }

    async function submitLogin(event) {
      event.preventDefault();
      try {
        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;
        const data = await api("/api/login", {
          method: "POST",
          body: JSON.stringify({ username, password })
        });
        state.user = data.user;
        state.activeTab = "overview";
        await loadAll();
        showApp();
        toast("登录成功");
      } catch (error) {
        toast(error.message);
      }
    }

    async function handleLogout() {
      try {
        await api("/api/logout", { method: "POST" });
      } finally {
        state.user = null;
        state.activeTab = "overview";
        state.assignments = [];
        state.submissions = [];
        state.notifications = [];
        state.users = [];
        showLogin();
      }
    }

    async function submitAssignmentForm(form) {
      const item = activeAssignment();
      const body = {
        title: form.title.value.trim(),
        course: form.course.value.trim(),
        dueDate: form.dueDate.value,
        points: Number(form.points.value || 100),
        priority: form.priority.value,
        description: form.description.value.trim()
      };
      try {
        if (item && item.id) {
          await api(`/api/assignments/${item.id}`, { method: "PATCH", body: JSON.stringify(body) });
          toast("作业已保存");
        } else {
          const data = await api("/api/assignments", { method: "POST", body: JSON.stringify(body) });
          state.selectedAssignmentId = data.id;
          toast("作业已创建");
        }
        state.assignmentDraft = null;
        await refreshData();
      } catch (error) {
        toast(error.message);
      }
    }

    async function createNewAssignment() {
      state.selectedAssignmentId = null;
      state.assignmentDraft = emptyAssignment();
      render();
    }

    async function deleteAssignment() {
      const item = activeAssignment();
      if (!item) return;
      if (!confirm(`删除作业「${item.title}」？`)) return;
      try {
        await api(`/api/assignments/${item.id}`, { method: "DELETE" });
        state.selectedAssignmentId = null;
        toast("已删除");
        await refreshData();
      } catch (error) {
        toast(error.message);
      }
    }

    async function submitStudentSubmission(form) {
      const item = activeAssignment();
      if (!item) return;
      try {
        const fd = new FormData();
        fd.append("assignmentId", item.id);
        fd.append("answerText", form.answerText.value.trim());
        const file = form.attachment.files[0];
        if (file) fd.append("attachment", file);
        await api("/api/submissions", { method: "POST", body: fd });
        toast("已提交");
        await refreshData();
      } catch (error) {
        toast(error.message);
      }
    }

    async function gradeSubmission(form, submissionId, maxPoints) {
      try {
        await api(`/api/submissions/${submissionId}/grade`, {
          method: "POST",
          body: JSON.stringify({
            score: form.score.value === "" ? null : Number(form.score.value),
            feedback: form.feedback.value.trim()
          })
        });
        toast("批改已保存");
        await loadSubmissions();
        render();
      } catch (error) {
        toast(error.message);
      }
    }

    async function submitUserForm(form) {
      try {
        await api("/api/users", {
          method: "POST",
          body: JSON.stringify({
            username: form.username.value.trim(),
            password: form.password.value,
            displayName: form.displayName.value.trim(),
            className: form.className.value.trim(),
            role: form.role.value
          })
        });
        toast("用户已创建");
        await loadUsers();
        render();
      } catch (error) {
        toast(error.message);
      }
    }

    async function submitNotificationForm(form) {
      try {
        await api("/api/notifications", {
          method: "POST",
          body: JSON.stringify({
            title: form.title.value.trim(),
            body: form.body.value.trim(),
            targetRole: form.targetRole.value
          })
        });
        toast("通知已发布");
        await refreshData();
      } catch (error) {
        toast(error.message);
      }
    }

    document.addEventListener("click", async (event) => {
      const tabBtn = event.target.closest("[data-tab]");
      if (tabBtn) {
        setActiveTab(tabBtn.dataset.tab);
        return;
      }
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) {
        const row = event.target.closest("[data-assignment-id]");
        if (row) {
          state.selectedAssignmentId = Number(row.dataset.assignmentId);
          render();
          if (state.activeTab === "submissions" && state.user.role === "admin") {
            await loadSubmissions();
            render();
          }
          return;
        }
        return;
      }

      if (action === "refresh") return refreshData();
      if (action === "new-assignment") return createNewAssignment();
      if (action === "delete-assignment") return deleteAssignment();
      if (action === "read-notification") {
        try {
          await api("/api/notifications/read", { method: "POST", body: JSON.stringify({ notificationId: Number(event.target.dataset.id) }) });
          toast("已标记");
        } catch (error) {
          toast(error.message);
        }
      }
    });

    document.addEventListener("submit", async (event) => {
      const form = event.target;
      if (form.id === "assignmentForm") {
        event.preventDefault();
        return submitAssignmentForm(form);
      }
      if (form.id === "submissionForm") {
        event.preventDefault();
        return submitStudentSubmission(form);
      }
      if (form.id === "userForm") {
        event.preventDefault();
        return submitUserForm(form);
      }
      if (form.id === "notifyForm") {
        event.preventDefault();
        return submitNotificationForm(form);
      }
      const gradeForm = form.closest("[data-grade-form]");
      if (gradeForm) {
        event.preventDefault();
        const submissionId = Number(gradeForm.dataset.gradeForm);
        return gradeSubmission(form, submissionId, activeAssignment()?.points || 100);
      }
    });

    document.addEventListener("change", (event) => {
      if (event.target.id === "courseFilter") {
        state.course = event.target.value;
        refreshData();
      }
    });

    els.loginForm.addEventListener("submit", submitLogin);
    els.logoutBtn.addEventListener("click", handleLogout);
    els.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value.trim();
      refreshData();
    });

    loadSession();
    renderDate();
    setInterval(renderDate, 60000);
  