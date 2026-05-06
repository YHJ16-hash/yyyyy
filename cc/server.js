const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const multer = require("multer");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const DB_PATH = path.join(DATA_DIR, "app.sqlite");
const INDEX_PATH = path.join(ROOT, "index.html");
const PORT = Number(process.env.PORT || 3000);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','student')),
    display_name TEXT NOT NULL,
    class_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    course TEXT NOT NULL,
    due_date TEXT NOT NULL,
    points INTEGER NOT NULL,
    priority TEXT NOT NULL,
    description TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    answer_text TEXT NOT NULL,
    attachment_name TEXT NOT NULL DEFAULT '',
    attachment_path TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK(status IN ('submitted','graded')) DEFAULT 'submitted',
    score INTEGER,
    feedback TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL,
    graded_at TEXT,
    UNIQUE(assignment_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    target_role TEXT NOT NULL CHECK(target_role IN ('all','admin','student')) DEFAULT 'all',
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notifications_read (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notification_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    read_at TEXT NOT NULL,
    UNIQUE(notification_id, user_id)
  );
`);

const sessions = new Map();
const now = () => new Date().toISOString();
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const uid = () => crypto.randomBytes(16).toString("hex");
const formatDateTime = (value) => new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
}).format(new Date(value));
const toISODateTime = (value) => {
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? now() : parsed.toISOString();
};

function execOne(sql, params = []) { return db.prepare(sql).get(...params); }
function execAll(sql, params = []) { return db.prepare(sql).all(...params); }
function execRun(sql, params = []) { return db.prepare(sql).run(...params); }

function seed() {
  const count = execOne("SELECT COUNT(*) AS n FROM users").n;
  if (count) return;
  const created = now();
  const adminId = execRun(
    "INSERT INTO users (username, password, role, display_name, class_name, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ["admin", sha("admin123"), "admin", "系统管理员", "教务中心", created]
  ).lastInsertRowid;
  const studentId = execRun(
    "INSERT INTO users (username, password, role, display_name, class_name, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ["student", sha("student123"), "student", "张同学", "计算机 2401 班", created]
  ).lastInsertRowid;
  const items = [
    ["JavaScript 基础练习", "前端基础", "2026-05-08T22:00:00.000Z", 100, "高", "完成 8 道基础题，覆盖变量、条件判断、循环和函数。"],
    ["表格与筛选页面", "网页布局", "2026-05-07T20:00:00.000Z", 100, "高", "实现一个带筛选和搜索的列表页面。"],
    ["信息检索小测", "语文", "2026-05-03T09:00:00.000Z", 50, "中", "阅读材料后回答 5 个简答题。"],
    ["英语听力记录", "英语", "2026-05-10T21:30:00.000Z", 80, "中", "收听一段对话，整理关键词并写出 100 词摘要。"],
    ["数学错题整理", "数学", "2026-05-06T18:00:00.000Z", 60, "高", "把本周三道错题重新整理，写出错误原因和改正步骤。"]
  ];
  for (const [title, course, due, points, priority, description] of items) {
    execRun(
      "INSERT INTO assignments (title, course, due_date, points, priority, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [title, course, due, points, priority, description, adminId, created, created]
    );
  }
  execRun(
    "INSERT INTO submissions (assignment_id, user_id, answer_text, attachment_name, attachment_path, status, score, feedback, submitted_at, graded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [3, studentId, "已按要求完成简答题。", "", "", "graded", 92, "思路清晰，第二题可再精炼。", created, created]
  );
  for (const [title, body, targetRole] of [
    ["本周作业提醒", "今天 20:00 前提交表格与筛选页面。", "all"],
    ["批改说明", "信息检索小测已完成批改，请查看反馈。", "student"],
    ["班级公告", "下周一进行一次课堂演示，请准备作品展示。", "all"]
  ]) {
    execRun(
      "INSERT INTO notifications (title, body, target_role, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
      [title, body, targetRole, adminId, created]
    );
  }
}
seed();

function readCookies(req) {
  const raw = req.headers.cookie || "";
  return Object.fromEntries(raw.split(";").map((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return ["", ""];
    return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())];
  }).filter(([k]) => k));
}

function currentUser(req) {
  const token = readCookies(req).session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  return execOne("SELECT id, username, role, display_name, class_name FROM users WHERE id = ?", [session.userId]) || null;
}

function auth(req, res) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: "未登录" });
    return null;
  }
  return user;
}

function requireRole(user, role) {
  return user && user.role === role;
}

function apiUser(user) {
  return { id: user.id, username: user.username, role: user.role, displayName: user.display_name, className: user.class_name };
}

function getAssignmentRows(user, { q = "", status = "all", course = "all" } = {}) {
  const rows = execAll("SELECT a.*, u.display_name AS creator_name FROM assignments a JOIN users u ON u.id = a.created_by ORDER BY datetime(a.due_date) ASC, a.id DESC");
  const query = q.trim().toLowerCase();
  return rows.map((row) => {
    if (user.role === "admin") {
      const ag = execOne(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
          SUM(CASE WHEN status = 'graded' THEN 1 ELSE 0 END) AS graded
        FROM submissions WHERE assignment_id = ?
      `, [row.id]);
      const total = Number(ag?.total || 0);
      const submitted = Number(ag?.submitted || 0);
      const graded = Number(ag?.graded || 0);
      return {
        id: row.id,
        title: row.title,
        course: row.course,
        dueDate: row.due_date,
        points: row.points,
        priority: row.priority,
        description: row.description,
        status: total === 0 ? (new Date(row.due_date) < new Date() ? "overdue" : "todo") : (graded === total ? "graded" : "submitted"),
        submissionStatus: total === 0 ? "todo" : "submitted",
        submittedAt: "",
        score: null,
        feedback: "",
        answerText: "",
        attachmentName: "",
        attachmentPath: "",
        createdByName: row.creator_name,
        creatorId: row.created_by,
        submissionCount: total,
        gradedCount: graded,
        pendingCount: submitted
      };
    }
    const submission = execOne("SELECT status, submitted_at, score, feedback, answer_text, attachment_name, attachment_path FROM submissions WHERE assignment_id = ? AND user_id = ?", [row.id, user.id]);
    const derivedStatus = submission?.status === "graded" ? "graded" : submission?.status === "submitted" ? "submitted" : (new Date(row.due_date) < new Date() ? "overdue" : "todo");
    return {
      id: row.id,
      title: row.title,
      course: row.course,
      dueDate: row.due_date,
      points: row.points,
      priority: row.priority,
      description: row.description,
      status: derivedStatus,
      submissionStatus: submission?.status || "todo",
      submittedAt: submission?.submitted_at || "",
      score: submission?.score ?? null,
      feedback: submission?.feedback || "",
      answerText: submission?.answer_text || "",
      attachmentName: submission?.attachment_name || "",
      attachmentPath: submission?.attachment_path || "",
      createdByName: row.creator_name,
      creatorId: row.created_by
    };
  }).filter((item) => {
    const matchesQuery = !query || [item.title, item.course, item.description, item.feedback, item.answerText].some((value) => String(value).toLowerCase().includes(query));
    const matchesStatus = status === "all" || item.status === status;
    const matchesCourse = course === "all" || item.course === course;
    return matchesQuery && matchesStatus && matchesCourse;
  });
}

function parseMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) return { fields: {}, file: null };
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const body = req.body;
  const chunks = [];
  let start = body.indexOf(boundary);
  while (start !== -1) {
    const next = body.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    const part = body.slice(start + boundary.length + 2, next - 2);
    const sep = part.indexOf(Buffer.from("\r\n\r\n"));
    if (sep !== -1) {
      const head = part.slice(0, sep).toString("utf8");
      const data = part.slice(sep + 4);
      const nameMatch = /name="([^"]+)"/i.exec(head);
      const fileMatch = /filename="([^"]*)"/i.exec(head);
      if (nameMatch && fileMatch && fileMatch[1]) {
        chunks.push({ name: nameMatch[1], fileName: path.basename(fileMatch[1]), data });
      } else if (nameMatch) {
        chunks.push({ name: nameMatch[1], value: data.toString("utf8").replace(/\r\n$/, "") });
      }
    }
    start = next;
  }
  const fields = {};
  let file = null;
  for (const part of chunks) {
    if (part.data) file = part;
    else fields[part.name] = part.value;
  }
  return { fields, file };
}

function makeUploadPath(userId, assignmentId, originalName) {
  const safe = originalName ? path.basename(originalName).replace(/[^\w.\-()\u4e00-\u9fa5]/g, "_") : "attachment";
  return path.join(UPLOAD_DIR, `${userId}-${assignmentId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safe}`);
}

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => res.sendFile(INDEX_PATH));
app.get("/index.html", (req, res) => res.sendFile(INDEX_PATH));
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/login", (req, res) => {
  const user = execOne("SELECT * FROM users WHERE username = ? AND password = ?", [req.body.username || "", sha(req.body.password || "")]);
  if (!user) return res.status(401).json({ error: "用户名或密码错误" });
  const token = uid();
  sessions.set(token, { userId: user.id, createdAt: Date.now() });
  res.cookie("session", token, { httpOnly: true, sameSite: "lax" });
  res.json({ user: apiUser(user) });
});

app.post("/api/logout", (req, res) => {
  const token = readCookies(req).session;
  if (token) sessions.delete(token);
  res.clearCookie("session");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  res.json({ user: apiUser(user) });
});

app.get("/api/courses", (req, res) => {
  res.json({ items: execAll("SELECT DISTINCT course FROM assignments ORDER BY course ASC").map((row) => row.course) });
});

app.get("/api/dashboard", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  const assignments = getAssignmentRows(user, { q: req.query.q || "", status: req.query.status || "all", course: req.query.course || "all" });
  const todo = assignments.filter((a) => a.status === "todo").length;
  const submitted = assignments.filter((a) => a.status === "submitted").length;
  const gradedRows = assignments.filter((a) => a.status === "graded");
  const avgScore = gradedRows.length ? Math.round(gradedRows.reduce((sum, a) => sum + (a.score || 0), 0) / gradedRows.length) : null;
  const dueSoon = assignments.filter((a) => {
    const diff = new Date(a.dueDate).getTime() - Date.now();
    return diff > 0 && diff <= 48 * 60 * 60 * 1000 && a.status !== "graded";
  }).length;
  res.json({ todo, submitted, avgScore, dueSoon, total: assignments.length });
});

app.get("/api/assignments", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  const items = getAssignmentRows(user, { q: req.query.q || "", status: req.query.status || "all", course: req.query.course || "all" }).map((item) => ({
    ...item,
    dueDateLabel: formatDateTime(item.dueDate),
    statusLabel: item.status === "overdue" ? "已逾期" : item.status === "todo" ? "待提交" : item.status === "submitted" ? "已提交" : "已批改"
  }));
  res.json({ items });
});

app.post("/api/assignments", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  if (!requireRole(user, "admin")) return res.status(403).json({ error: "权限不足" });
  const body = req.body;
  const title = String(body.title || "").trim();
  if (!title) return res.status(400).json({ error: "标题不能为空" });
  const result = execRun(
    "INSERT INTO assignments (title, course, due_date, points, priority, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [title, String(body.course || "").trim(), toISODateTime(body.dueDate || now()), Number(body.points || 100), String(body.priority || "中"), String(body.description || "").trim(), user.id, now(), now()]
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

app.get("/api/assignments/:id", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  const assignmentId = Number(req.params.id);
  const row = execOne("SELECT a.*, u.display_name AS creator_name FROM assignments a JOIN users u ON u.id = a.created_by WHERE a.id = ?", [assignmentId]);
  if (!row) return res.status(404).json({ error: "未找到" });
  const submission = execOne("SELECT * FROM submissions WHERE assignment_id = ? AND user_id = ?", [assignmentId, user.id]);
  res.json({
    assignment: {
      id: row.id,
      title: row.title,
      course: row.course,
      dueDate: row.due_date,
      points: row.points,
      priority: row.priority,
      description: row.description,
      createdByName: row.creator_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    },
    submission: submission ? { ...submission, score: submission.score ?? null, graded_at: submission.graded_at || null } : null
  });
});

app.patch("/api/assignments/:id", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  if (!requireRole(user, "admin")) return res.status(403).json({ error: "权限不足" });
  const existing = execOne("SELECT * FROM assignments WHERE id = ?", [Number(req.params.id)]);
  if (!existing) return res.status(404).json({ error: "未找到" });
  execRun(
    "UPDATE assignments SET title = ?, course = ?, due_date = ?, points = ?, priority = ?, description = ?, updated_at = ? WHERE id = ?",
    [String(req.body.title || existing.title).trim(), String(req.body.course || existing.course).trim(), toISODateTime(req.body.dueDate || existing.due_date), Number(req.body.points || existing.points), String(req.body.priority || existing.priority), String(req.body.description || existing.description).trim(), now(), Number(req.params.id)]
  );
  res.json({ ok: true });
});

app.delete("/api/assignments/:id", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  if (!requireRole(user, "admin")) return res.status(403).json({ error: "权限不足" });
  const assignmentId = Number(req.params.id);
  const files = execAll("SELECT attachment_path FROM submissions WHERE assignment_id = ?", [assignmentId]);
  execRun("DELETE FROM submissions WHERE assignment_id = ?", [assignmentId]);
  execRun("DELETE FROM assignments WHERE id = ?", [assignmentId]);
  for (const row of files) if (row.attachment_path && fs.existsSync(row.attachment_path)) fs.unlinkSync(row.attachment_path);
  res.json({ ok: true });
});

app.get("/api/assignments/:id/submissions", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  if (!requireRole(user, "admin")) return res.status(403).json({ error: "权限不足" });
  const items = execAll(`
    SELECT s.*, u.display_name AS student_name, u.username AS student_username, u.class_name AS student_class
    FROM submissions s
    JOIN users u ON u.id = s.user_id
    WHERE s.assignment_id = ?
    ORDER BY datetime(s.submitted_at) DESC, s.id DESC
  `, [Number(req.params.id)]).map((row) => ({
    id: row.id,
    assignmentId: row.assignment_id,
    userId: row.user_id,
    studentName: row.student_name,
    studentUsername: row.student_username,
    studentClass: row.student_class,
    answerText: row.answer_text,
    attachmentName: row.attachment_name,
    attachmentPath: row.attachment_path,
    status: row.status,
    score: row.score == null ? null : row.score,
    feedback: row.feedback,
    submittedAt: row.submitted_at,
    gradedAt: row.graded_at,
    submittedAtLabel: formatDateTime(row.submitted_at)
  }));
  res.json({ items });
});

app.get("/api/submissions", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  const assignmentId = Number(req.query.assignmentId || 0);
  const submission = execOne("SELECT * FROM submissions WHERE assignment_id = ? AND user_id = ?", [assignmentId, user.id]);
  res.json({ submission: submission ? { ...submission, score: submission.score ?? null, graded_at: submission.graded_at || null } : null });
});

app.post("/api/submissions", upload.single("attachment"), (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  const assignmentId = Number(req.body.assignmentId || 0);
  const assignment = execOne("SELECT * FROM assignments WHERE id = ?", [assignmentId]);
  if (!assignment) return res.status(404).json({ error: "作业不存在" });
  const answerText = String(req.body.answerText || "").trim();
  if (!answerText && !req.file) return res.status(400).json({ error: "请填写答案或上传附件" });
  let attachmentName = "";
  let attachmentPath = "";
  if (req.file) {
    attachmentName = req.file.originalname;
    attachmentPath = makeUploadPath(user.id, assignmentId, req.file.originalname);
    fs.writeFileSync(attachmentPath, req.file.buffer);
  }
  const existed = execOne("SELECT id, attachment_path FROM submissions WHERE assignment_id = ? AND user_id = ?", [assignmentId, user.id]);
  if (existed?.attachment_path && attachmentPath && existed.attachment_path !== attachmentPath && fs.existsSync(existed.attachment_path)) {
    fs.unlinkSync(existed.attachment_path);
  }
  if (existed) {
    execRun(
      "UPDATE submissions SET answer_text = ?, attachment_name = ?, attachment_path = ?, status = 'submitted', score = NULL, feedback = '', submitted_at = ?, graded_at = NULL WHERE id = ?",
      [answerText, attachmentName, attachmentPath, now(), existed.id]
    );
  } else {
    execRun(
      "INSERT INTO submissions (assignment_id, user_id, answer_text, attachment_name, attachment_path, status, score, feedback, submitted_at, graded_at) VALUES (?, ?, ?, ?, ?, 'submitted', NULL, '', ?, NULL)",
      [assignmentId, user.id, answerText, attachmentName, attachmentPath, now()]
    );
  }
  res.json({ ok: true });
});

app.post("/api/submissions/:id/grade", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  if (!requireRole(user, "admin")) return res.status(403).json({ error: "权限不足" });
  const submission = execOne("SELECT * FROM submissions WHERE id = ?", [Number(req.params.id)]);
  if (!submission) return res.status(404).json({ error: "未找到提交" });
  execRun("UPDATE submissions SET status = 'graded', score = ?, feedback = ?, graded_at = ? WHERE id = ?", [req.body.score == null ? null : Number(req.body.score), String(req.body.feedback || "").trim(), now(), Number(req.params.id)]);
  res.json({ ok: true });
});

app.get("/api/notifications", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  const items = execAll(`
    SELECT n.*, u.display_name AS creator_name
    FROM notifications n
    JOIN users u ON u.id = n.created_by
    ORDER BY datetime(n.created_at) DESC, n.id DESC
  `).filter((row) => row.target_role === "all" || row.target_role === user.role).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    targetRole: row.target_role,
    createdAt: row.created_at,
    creatorName: row.creator_name,
    createdAtLabel: formatDateTime(row.created_at)
  }));
  res.json({ items });
});

app.post("/api/notifications", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  if (!requireRole(user, "admin")) return res.status(403).json({ error: "权限不足" });
  const title = String(req.body.title || "").trim();
  const body = String(req.body.body || "").trim();
  if (!title || !body) return res.status(400).json({ error: "标题和内容不能为空" });
  const targetRole = ["all", "admin", "student"].includes(req.body.targetRole) ? req.body.targetRole : "all";
  const result = execRun("INSERT INTO notifications (title, body, target_role, created_by, created_at) VALUES (?, ?, ?, ?, ?)", [title, body, targetRole, user.id, now()]);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.post("/api/notifications/read", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  execRun("INSERT OR IGNORE INTO notifications_read (notification_id, user_id, read_at) VALUES (?, ?, ?)", [Number(req.body.notificationId), user.id, now()]);
  res.json({ ok: true });
});

app.get("/api/users", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  if (!requireRole(user, "admin")) return res.status(403).json({ error: "权限不足" });
  res.json({ items: execAll("SELECT id, username, role, display_name, class_name, created_at FROM users ORDER BY id ASC").map((row) => ({
    id: row.id, username: row.username, role: row.role, displayName: row.display_name, className: row.class_name, createdAt: row.created_at
  })) });
});

app.post("/api/users", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  if (!requireRole(user, "admin")) return res.status(403).json({ error: "权限不足" });
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "").trim();
  if (!username || !password) return res.status(400).json({ error: "用户名和密码不能为空" });
  try {
    const result = execRun("INSERT INTO users (username, password, role, display_name, class_name, created_at) VALUES (?, ?, ?, ?, ?, ?)", [username, sha(password), req.body.role === "admin" ? "admin" : "student", String(req.body.displayName || username), String(req.body.className || ""), now()]);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch {
    res.status(400).json({ error: "用户名已存在" });
  }
});

app.patch("/api/users/:id", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  if (!requireRole(user, "admin")) return res.status(403).json({ error: "权限不足" });
  const targetId = Number(req.params.id);
  const existing = execOne("SELECT * FROM users WHERE id = ?", [targetId]);
  if (!existing) return res.status(404).json({ error: "未找到" });
  execRun("UPDATE users SET role = ?, display_name = ?, class_name = ? WHERE id = ?", [req.body.role === "admin" ? "admin" : "student", String(req.body.displayName || existing.display_name), String(req.body.className || existing.class_name), targetId]);
  if (req.body.password) execRun("UPDATE users SET password = ? WHERE id = ?", [sha(String(req.body.password)), targetId]);
  res.json({ ok: true });
});

app.delete("/api/users/:id", (req, res) => {
  const user = auth(req, res);
  if (!user) return;
  if (!requireRole(user, "admin")) return res.status(403).json({ error: "权限不足" });
  const targetId = Number(req.params.id);
  if (targetId === user.id) return res.status(400).json({ error: "不能删除自己" });
  const files = execAll("SELECT attachment_path FROM submissions WHERE user_id = ?", [targetId]);
  execRun("DELETE FROM notifications_read WHERE user_id = ?", [targetId]);
  execRun("DELETE FROM submissions WHERE user_id = ?", [targetId]);
  execRun("DELETE FROM users WHERE id = ?", [targetId]);
  for (const row of files) if (row.attachment_path && fs.existsSync(row.attachment_path)) fs.unlinkSync(row.attachment_path);
  res.json({ ok: true });
});

app.get("/api/download", (req, res) => {
  const file = String(req.query.file || "");
  if (!file) return res.status(400).json({ error: "缺少文件" });
  const filePath = path.resolve(file);
  if (!filePath.startsWith(UPLOAD_DIR)) return res.status(400).json({ error: "非法文件路径" });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "文件不存在" });
  res.download(filePath, path.basename(filePath));
});

app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(ROOT));

app.listen(PORT, () => {
  console.log(`Homework system running at http://localhost:${PORT}`);
});
