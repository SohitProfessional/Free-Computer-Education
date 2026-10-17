const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const iconFor = title => {
  const t = String(title).toLowerCase();
  if (t.includes("excel") || t.includes("spreadsheet")) return "▦";
  if (t.includes("word") || t.includes("document")) return "▤";
  if (t.includes("paint") || t.includes("design")) return "◈";
  if (t.includes("html") || t.includes("css") || t.includes("program")) return "</>";
  if (t.includes("internet") || t.includes("email")) return "◎";
  if (t.includes("typing") || t.includes("keyboard")) return "⌨";
  if (t.includes("powerpoint")) return "▧";
  return "⌘";
};
async function api(url, options = {}) {
  const res = await fetch(url, { credentials:"same-origin", ...options, headers: { ...(options.body && !(options.body instanceof FormData) ? {"Content-Type":"application/json"} : {}), ...(options.headers || {}) } });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) { const error = new Error(data.error || "Request failed."); error.status = res.status; error.data = data; throw error; }
  return data;
}
function toast(message) {
  const node = $("#toast");
  if (!node) { alert(message); return; }
  node.textContent = message; node.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("show"), 3200);
}
function page(content, title = "Free Computer Education") {
  document.title = title;
  document.body.innerHTML = `<div class="announcement">100% free learning · No course enrollment required</div><header class="site-header"><a class="brand" href="/"><span class="brand-mark">F</span><span>Free Computer <b>Education</b></span></a><nav><a href="/">Home</a><a href="/#courses">Courses</a><a href="/#tests">Online tests</a><a href="/dashboard">My dashboard</a></nav></header><main class="app-page">${content}</main><footer class="footer"><a class="brand" href="/"><span class="brand-mark">F</span><span>Free Computer <b>Education</b></span></a><p>Practical digital skills, open to everyone.</p></footer><div class="toast" id="toast" role="status"></div>`;
}
function formError(form, message) {
  let node = $(".form-error", form);
  if (!node) { node = document.createElement("div"); node.className = "form-error"; form.prepend(node); }
  node.textContent = message;
}
function setLoading(button, yes, label = "Please wait…") {
  if (yes) { button.dataset.label = button.textContent; button.textContent = label; button.disabled = true; }
  else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; }
}
async function getCurrentUser() {
  try { return (await api("/api/auth/me")).user; } catch { return null; }
}
async function initHeader() {
  const user = await getCurrentUser();
  const login = $("#login-link"), dash = $("#dashboard-link"), admin = $("#admin-link"), logout = $("#logout-button");
  if (user) {
    if (login) login.hidden = true;
    if (dash) dash.hidden = false;
    if (admin) admin.hidden = user.role !== "admin";
    if (logout) logout.hidden = false;
    logout?.addEventListener("click", async () => { await api("/api/auth/logout", { method:"POST" }); location.href = "/"; });
  }
  $("#mobile-menu")?.addEventListener("click", () => $("#main-nav")?.classList.toggle("open"));
  $("#year") && ($("#year").textContent = new Date().getFullYear());
  return user;
}
function courseCard(course, i = 0) {
  return `<article class="course-card"><div class="course-art art-${i%6}"><span class="level">${esc(course.level || "Beginner")}</span>${esc(iconFor(course.title))}</div><div class="course-body"><span class="course-category">${esc(course.category || "Computer Skills")}</span><h3>${esc(course.title)}</h3><p>${esc(course.description || "Learn useful computer skills with simple, practical lessons.")}</p><div class="course-foot"><span>Free · Self-paced</span><a href="/course/${encodeURIComponent(course.slug)}">Start learning →</a></div></div></article>`;
}
async function renderHome() {
  await initHeader();
  const grid = $("#course-grid"); if (!grid) return;
  let courses = [];
  try { courses = (await api("/api/courses")).courses; } catch (e) { grid.innerHTML = `<p class="muted">Could not load courses. Check the database connection and refresh.</p>`; return; }
  const categories = ["All", ...new Set(courses.map(c => c.category || "Computer Skills"))];
  $("#category-chips").innerHTML = categories.map((c,i) => `<button class="chip ${i===0?"active":""}" data-category="${esc(c)}">${esc(c==="All"?"All subjects":c)}</button>`).join("");
  const draw = (list) => {
    grid.innerHTML = list.map((c,i)=>courseCard(c,i)).join("");
    $("#course-count").textContent = `${list.length} ${list.length===1?"course":"courses"}`;
    $("#course-empty").hidden = list.length !== 0;
  };
  draw(courses);
  let category = "All", query = "";
  const filter = () => draw(courses.filter(c => (category==="All" || (c.category || "Computer Skills")===category) && `${c.title} ${c.description} ${c.category}`.toLowerCase().includes(query.toLowerCase())));
  $("#category-chips").addEventListener("click", e => { const btn = e.target.closest("[data-category]"); if(!btn)return; category=btn.dataset.category; $$(".chip",$("#category-chips")).forEach(b=>b.classList.toggle("active",b===btn)); filter(); });
  $("#search-input").addEventListener("input", e => { query=e.target.value; filter(); });
  $("#search-form").addEventListener("submit", e => { e.preventDefault(); $("#courses").scrollIntoView({behavior:"smooth"}); });
  const testGrid = $("#test-grid");
  try {
    const tests = (await api("/api/tests/public")).tests;
    testGrid.innerHTML = tests.length ? tests.map(t=>`<article class="test-card"><div class="test-icon-small">✳</div><h3>${esc(t.title)}</h3><p>${esc(t.description || "Check your understanding with this online test.")}</p><div class="test-meta">◷ ${Number(t.durationMinutes)} minutes ${t.course ? " · "+esc(t.course.title):""}</div><button class="btn btn-primary start-test" data-test="${esc(t._id)}">Start test →</button></article>`).join("") : `<p class="muted">No tests are published yet. Check back soon.</p>`;
    $$(".start-test", testGrid).forEach(b=>b.addEventListener("click", async()=>{
      const user = await getCurrentUser();
      if(!user){location.href="/login?redirect="+encodeURIComponent("/take-test/"+b.dataset.test);return;}
      location.href="/take-test/"+b.dataset.test;
    }));
  } catch { testGrid.innerHTML = `<p class="muted">Tests are temporarily unavailable.</p>`; }
}
function authPage(mode) {
  const register = mode === "register", forgot = mode === "forgot", reset = mode === "reset";
  const title = register ? "Create your account" : forgot ? "Reset your password" : reset ? "Choose a new password" : "Welcome back";
  const subtitle = register ? "Create an account to take tests and track your results." : forgot ? "Enter your email and we'll send a reset link if an account exists." : reset ? "Use a strong password you haven't used before." : "Log in to take a test and keep track of your progress.";
  const fields = register ? `<div class="field"><label for="name">Full name</label><input id="name" name="name" required minlength="2" maxlength="100" autocomplete="name" placeholder="Your full name"></div><div class="field"><label for="mobile">Mobile number (optional)</label><input id="mobile" name="mobile" autocomplete="tel" placeholder="Mobile number"></div>` : "";
  const email = !reset ? `<div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com"></div>` : "";
  const password = (!forgot && !reset) ? `<div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required minlength="${register?10:1}" maxlength="128" autocomplete="${register?"new-password":"current-password"}" placeholder="${register?"At least 10 characters":"Your password"}"></div>` : "";
  const newPassword = reset ? `<div class="field"><label for="password">New password</label><input id="password" name="password" type="password" required minlength="10" maxlength="128" autocomplete="new-password" placeholder="At least 10 characters"></div><div class="field"><label for="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" required minlength="10" maxlength="128" placeholder="Repeat your password"></div>` : "";
  const confirm = register ? `<div class="field"><label for="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" required minlength="10" maxlength="128" autocomplete="new-password" placeholder="Repeat your password"></div><p class="muted" style="font-size:11px">By creating an account, you agree to use this learning platform responsibly.</p>` : "";
  const links = register ? `Already have an account? <a href="/login">Log in</a>` : forgot ? `Remembered your password? <a href="/login">Log in</a>` : reset ? `Back to <a href="/login">log in</a>` : `New here? <a href="/register">Create an account</a>`;
  page(`<div class="auth-wrap"><aside class="auth-art"><a class="brand" href="/" style="color:white"><span class="brand-mark" style="background:#fff;color:#315cf5">F</span><span>Free Computer <b>Education</b></span></a><div><div class="art-symbol">✳</div><h2>Learn freely.<br>Grow confidently.</h2><p>Every published lesson is open to everyone. Sign in when you're ready to test your skills.</p></div><small style="color:#dbe5ff">Knowledge should have no barriers.</small></aside><section class="auth-form"><div class="eyebrow">YOUR LEARNING JOURNEY</div><h1>${title}</h1><p>${subtitle}</p><form id="auth-form">${fields}${email}${password}${newPassword}${confirm}${!register&&!forgot&&!reset?`<div class="form-row"><label><input type="checkbox" id="remember"> Remember me on this device</label><a href="/forgot-password">Forgot password?</a></div>`:""}<button class="btn btn-primary full-width" type="submit">${register?"Create account":forgot?"Send reset instructions":reset?"Update password":"Log in"} →</button></form><div class="auth-switch">${links}</div></section></div>`, title);
  const form = $("#auth-form");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const button = $("button[type=submit]",form); setLoading(button,true);
    const val = id => $(`#${id}`,form)?.value || "";
    try {
      if(register) {
        if(val("password") !== val("confirm")) throw new Error("Passwords do not match.");
        await api("/api/auth/register",{method:"POST",body:JSON.stringify({name:val("name"),email:val("email"),mobile:val("mobile"),password:val("password")})});
        location.href="/dashboard";
      } else if(mode==="login") {
        const redirect = new URLSearchParams(location.search).get("redirect") || "/dashboard";
        const data = await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:val("email"),password:val("password"),redirect})});
        location.href = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : (data.user.role==="admin"?"/admin":"/dashboard");
      } else if(forgot) {
        const data = await api("/api/auth/forgot-password",{method:"POST",body:JSON.stringify({email:val("email")})});
        form.innerHTML = `<p class="badge-status">${esc(data.message || "If an account exists, instructions will be sent.")}</p><p class="muted">Check your inbox and spam folder. The link expires in 15 minutes.</p>`;
      } else {
        if(val("password") !== val("confirm")) throw new Error("Passwords do not match.");
        const token = new URLSearchParams(location.search).get("token");
        await api("/api/auth/reset-password",{method:"POST",body:JSON.stringify({token,password:val("password")})});
        form.innerHTML = `<p class="badge-status">Password updated successfully.</p><p><a href="/login">Go to login →</a></p>`;
      }
    } catch(err) { formError(form,err.message); setLoading(button,false); }
  });
}
function shell(content, title) { page(content,title); }
async function dashboardPage() {
  const user = await getCurrentUser();
  if(!user){location.href="/login?redirect=%2Fdashboard";return;}
  shell(`<div class="page-heading"><div><div class="eyebrow">STUDENT PANEL</div><h1>Welcome, ${esc(user.name.split(" ")[0])}.</h1><p class="muted">Your learning space, all in one place.</p></div><a class="btn btn-primary" href="/#courses">Explore courses →</a></div><div class="panel-grid"><div class="metric"><span>Account type</span><strong style="font-size:20px">Student</strong></div><div class="metric"><span>Completed tests</span><strong id="test-count">—</strong></div><div class="metric"><span>Learning access</span><strong style="font-size:20px">Free</strong></div><div class="metric"><span>Member since</span><strong style="font-size:20px">${new Date(user.createdAt).toLocaleDateString(undefined,{month:"short",year:"numeric"})}</strong></div></div><div class="panel-card"><h2>My recent test results</h2><div id="results-container">Loading results…</div></div><div class="panel-card"><h2>Account profile</h2><form id="profile-form"><div class="field"><label for="profile-name">Full name</label><input id="profile-name" value="${esc(user.name)}" required minlength="2"></div><div class="field"><label for="profile-mobile">Mobile number</label><input id="profile-mobile" value="${esc(user.mobile||"")}"></div><p class="muted" style="font-size:11px">Email: ${esc(user.email)} (cannot be changed here)</p><button class="btn btn-primary">Save profile</button></form></div>`, "Student Dashboard");
  try {
    const results = (await api("/api/student/results")).results;
    $("#test-count").textContent = results.length;
    $("#results-container").innerHTML = results.length ? `<table class="data-table"><thead><tr><th>Test</th><th>Score</th><th>Result</th><th>Date</th></tr></thead><tbody>${results.map(r=>`<tr><td>${esc(r.test?.title||"Test")}</td><td>${r.score}/${r.totalMarks} (${r.percentage}%)</td><td><span class="badge-status ${r.passed?"":"badge-draft"}">${r.passed?"Passed":"Not passed"}</span></td><td>${new Date(r.submittedAt).toLocaleDateString()}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No tests taken yet. You can read any course without enrollment, then take a test when you're ready.</p><a href="/#tests" class="btn btn-outline">Browse tests →</a>`;
  } catch(e) { $("#results-container").textContent = e.message; }
  $("#profile-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/student/profile",{method:"PUT",body:JSON.stringify({name:$("#profile-name").value,mobile:$("#profile-mobile").value})});toast("Profile updated.");}catch(err){toast(err.message);}});
}
async function coursePage(slug) {
  let data;
  try { data=await api(`/api/courses/${encodeURIComponent(slug)}`); }
  catch(e){shell(`<div class="panel-card"><h1>Course not found</h1><p>${esc(e.message)}</p><a class="btn btn-primary" href="/">Back home</a></div>`);return;}
  shell(`<div class="page-heading"><div><div class="eyebrow">${esc(data.course.category)} · ${esc(data.course.level)}</div><h1>${esc(data.course.title)}</h1><p class="muted">${esc(data.course.description)}</p></div><a href="/#courses" class="btn btn-outline">← All courses</a></div><div class="panel-card"><h2>Lessons in this course</h2>${data.lessons.length?`<table class="data-table"><thead><tr><th>#</th><th>Chapter</th><th>Lesson</th><th></th></tr></thead><tbody>${data.lessons.map((l,i)=>`<tr><td>${i+1}</td><td>${esc(l.chapter)}</td><td>${esc(l.title)}</td><td><a class="btn btn-outline" href="/lesson/${encodeURIComponent(l.slug)}">Read lesson →</a></td></tr>`).join("")}</tbody></table>`:`<p class="muted">Lessons are being prepared for this course.</p>`}</div>`,data.course.title);
}
async function lessonPage(slug) {
  let data;
  try {data=await api(`/api/lessons/${encodeURIComponent(slug)}`);}catch(e){shell(`<div class="panel-card"><h1>Lesson not found</h1><p>${esc(e.message)}</p><a href="/" class="btn btn-primary">Back home</a></div>`);return;}
  const lesson=data.lesson;
  // Lesson content is authored by administrators. It is still sanitized server-side in production deployments;
  // this MVP renders it as text/paragraphs to avoid executing arbitrary HTML.
  const content = lesson.content.split(/\n{2,}/).map(p=>`<p>${esc(p).replace(/\n/g,"<br>")}</p>`).join("");
  shell(`<div style="max-width:900px;margin:0 auto 18px"><a href="/course/${encodeURIComponent(lesson.course.slug)}" class="muted">← ${esc(lesson.course.title)}</a></div><article class="lesson-content"><div class="eyebrow">${esc(lesson.chapter)}</div><h1>${esc(lesson.title)}</h1><div class="muted" style="font-size:12px;margin-bottom:25px">Free lesson · No account required</div>${content}<div class="lesson-nav">${data.previous?`<a class="btn btn-outline" href="/lesson/${encodeURIComponent(data.previous.slug)}">← Previous lesson</a>`:"<span></span>"}${data.next?`<a class="btn btn-primary" href="/lesson/${encodeURIComponent(data.next.slug)}">Next lesson →</a>`:""}</div></article>`,lesson.title);
}
async function adminPage() {
  const user=await getCurrentUser();
  if(!user){location.href="/login?redirect=%2Fadmin";return;}
  if(user.role!=="admin"){shell(`<div class="panel-card"><h1>Access denied</h1><p>Administrator permissions are required.</p><a href="/dashboard" class="btn btn-primary">Student dashboard</a></div>`);return;}
  shell(`<div class="page-heading"><div><div class="eyebrow">SITE MANAGEMENT</div><h1>Admin dashboard</h1><p class="muted">Manage the public learning library and online tests.</p></div><a class="btn btn-outline" href="/">View website ↗</a></div><div class="panel-grid" id="admin-metrics"><div class="metric"><span>Students</span><strong>…</strong></div><div class="metric"><span>Courses</span><strong>…</strong></div><div class="metric"><span>Lessons</span><strong>…</strong></div><div class="metric"><span>Test attempts</span><strong>…</strong></div></div><div class="panel-card"><h2>Add a course</h2><form id="course-form"><div class="field"><label>Course title</label><input name="title" required minlength="2" placeholder="e.g. MS Excel Basics"></div><div class="field"><label>Description</label><textarea name="description" placeholder="What will students learn?"></textarea></div><div class="field"><label>Category</label><input name="category" value="Computer Basics" required></div><div class="field"><label>Difficulty</label><select name="level"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></div><div class="field"><label><input type="checkbox" name="published" checked> Publish immediately (publicly readable)</label></div><button class="btn btn-primary">Create course</button></form></div><div class="panel-card"><h2>Course library</h2><div id="admin-courses">Loading…</div></div><div class="panel-card"><h2>Add a lesson</h2><form id="lesson-form"><div class="field"><label>Course</label><select name="course" id="lesson-course" required></select></div><div class="field"><label>Lesson title</label><input name="title" required minlength="2"></div><div class="field"><label>Chapter</label><input name="chapter" value="Getting Started"></div><div class="field"><label>Lesson content</label><textarea name="content" required style="min-height:180px" placeholder="Write the lesson content. Separate paragraphs with a blank line."></textarea></div><div class="field"><label><input type="checkbox" name="published" checked> Publish immediately</label></div><button class="btn btn-primary">Create lesson</button></form></div><div class="panel-card"><h2>Lessons</h2><div id="admin-lessons">Loading…</div></div><div class="panel-card"><h2>Create an online test</h2><p class="muted">Create a multiple-choice or true/false test. Correct answers stay on the server and are used only for scoring.</p><form id="test-form"><div class="field"><label>Test title</label><input name="title" required></div><div class="field"><label>Description</label><textarea name="description"></textarea></div><div class="field"><label>Duration (minutes)</label><input name="durationMinutes" type="number" min="1" max="240" value="15"></div><div class="field"><label>Passing percentage</label><input name="passingPercent" type="number" min="0" max="100" value="40"></div><div class="field"><label>Questions (one per line: question | option A | option B | correct answer)</label><textarea name="questionsText" required placeholder="What does CPU stand for? | Central Processing Unit | Computer Personal Unit | Central Processing Unit&#10;Is HTML a markup language? | True | False | True" style="min-height:130px"></textarea></div><div class="field"><label><input type="checkbox" name="published" checked> Publish test</label></div><button class="btn btn-primary">Create test</button></form></div><div class="panel-card"><h2>Recent test results</h2><div id="admin-results">Loading…</div></div>`, "Admin Panel");
  const refresh=async()=>{
    const o=await api("/api/admin/overview");
    $("#admin-metrics").innerHTML=[["Students",o.students],["Courses",o.courses],["Lessons",o.lessons],["Test attempts",o.attempts]].map(([k,v])=>`<div class="metric"><span>${k}</span><strong>${v}</strong></div>`).join("");
    const c=(await api("/api/admin/courses")).courses;
    $("#admin-courses").innerHTML=c.length?`<table class="data-table"><thead><tr><th>Course</th><th>Status</th><th>Actions</th></tr></thead><tbody>${c.map(x=>`<tr><td><b>${esc(x.title)}</b><br><small class="muted">${esc(x.slug)}</small></td><td><span class="badge-status ${x.published?"":"badge-draft"}">${x.published?"Published":"Draft"}</span></td><td><div class="inline-actions"><button class="btn btn-outline toggle-course" data-id="${x.id}" data-pub="${!x.published}">${x.published?"Unpublish":"Publish"}</button><button class="btn btn-danger delete-course" data-id="${x.id}">Delete</button></div></td></tr>`).join("")}</tbody></table>`:"No courses yet.";
    $("#lesson-course").innerHTML=c.map(x=>`<option value="${x.id}">${esc(x.title)}</option>`).join("");
    const lessons=(await api("/api/admin/lessons")).lessons;
    $("#admin-lessons").innerHTML=lessons.length?`<table class="data-table"><thead><tr><th>Lesson</th><th>Course</th><th>Status</th><th>Action</th></tr></thead><tbody>${lessons.map(l=>`<tr><td>${esc(l.title)}</td><td>${esc(l.course?.title||"")}</td><td><span class="badge-status ${l.published?"":"badge-draft"}">${l.published?"Published":"Draft"}</span></td><td><div class="inline-actions"><button class="btn btn-outline toggle-lesson" data-id="${l._id}" data-pub="${!l.published}">${l.published?"Unpublish":"Publish"}</button><button class="btn btn-danger delete-lesson" data-id="${l._id}">Delete</button></div></td></tr>`).join("")}</tbody></table>`:"No lessons yet.";
    const results=(await api("/api/admin/results")).results;
    $("#admin-results").innerHTML=results.length?`<table class="data-table"><thead><tr><th>Student</th><th>Test</th><th>Score</th><th>Outcome</th></tr></thead><tbody>${results.map(r=>`<tr><td>${esc(r.student?.name||"Unknown")}<br>${esc(r.student?.email||"")}</td><td>${esc(r.test)}</td><td>${r.score}/${r.totalMarks} (${r.percentage}%)</td><td>${r.passed?"Passed":"Not passed"}</td></tr>`).join("")}</tbody></table>`:"No submitted results yet.";
    $$(".toggle-course").forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/courses/${b.dataset.id}`,{method:"PUT",body:JSON.stringify({published:b.dataset.pub==="true"})});await refresh();}catch(e){toast(e.message);}});
    $$(".delete-course").forEach(b=>b.onclick=async()=>{if(confirm("Delete this course and its lessons?")){try{await api(`/api/admin/courses/${b.dataset.id}`,{method:"DELETE"});await refresh();}catch(e){toast(e.message);}}});
    $$(".toggle-lesson").forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/lessons/${b.dataset.id}`,{method:"PUT",body:JSON.stringify({published:b.dataset.pub==="true"})});await refresh();}catch(e){toast(e.message);}});
    $$(".delete-lesson").forEach(b=>b.onclick=async()=>{if(confirm("Delete this lesson?")){try{await api(`/api/admin/lessons/${b.dataset.id}`,{method:"DELETE"});await refresh();}catch(e){toast(e.message);}}});
  };
  try { await refresh(); } catch(e) { toast(e.message); }
  $("#course-form").onsubmit=async e=>{e.preventDefault();const f=e.target;const body=Object.fromEntries(new FormData(f));body.published=!!f.published.checked;try{await api("/api/admin/courses",{method:"POST",body:JSON.stringify(body)});f.reset();f.category.value="Computer Basics";await refresh();toast("Course created.");}catch(err){formError(f,err.message);}};
  $("#lesson-form").onsubmit=async e=>{e.preventDefault();const f=e.target;const body=Object.fromEntries(new FormData(f));body.published=!!f.published.checked;try{await api("/api/admin/lessons",{method:"POST",body:JSON.stringify(body)});f.reset();f.chapter.value="Getting Started";await refresh();toast("Lesson created.");}catch(err){formError(f,err.message);}};
  $("#test-form").onsubmit=async e=>{e.preventDefault();const f=e.target;const body=Object.fromEntries(new FormData(f));body.published=!!f.published.checked;body.questions=body.questionsText.split("\n").map(line=>line.trim()).filter(Boolean).map(line=>{const [prompt,a,b,correctAnswer]=line.split("|").map(x=>x.trim());return {prompt,options:[a,b].filter(Boolean),correctAnswer,type:"mcq",marks:1};});delete body.questionsText;body.durationMinutes=Number(body.durationMinutes);body.passingPercent=Number(body.passingPercent);try{await api("/api/admin/tests",{method:"POST",body:JSON.stringify(body)});f.reset();toast("Test created.");}catch(err){formError(f,err.message);}};
}
async function takeTest(id) {
  const user=await getCurrentUser();
  if(!user){location.href="/login?redirect="+encodeURIComponent("/take-test/"+id);return;}
  shell(`<div class="panel-card"><p>Preparing your test…</p></div>`);
  try {
    const data=await api(`/api/tests/${id}/start`,{method:"POST",body:"{}"});
    const {test,attemptId,startedAt}=data;
    let answers={}, remaining=test.durationMinutes*60;
    const draw=()=>{
      shell(`<div class="page-heading"><div><div class="eyebrow">ONLINE TEST</div><h1>${esc(test.title)}</h1><p class="muted">Choose the best answer. Your score is calculated securely after submission.</p></div><div class="timer" id="timer">${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,"0")}</div></div><form id="test-attempt"><div id="questions">${test.questions.map((q,i)=>`<div class="question"><b>${i+1}. ${esc(q.prompt)}</b><p class="muted">${q.marks} mark(s)</p>${q.options.map(opt=>`<label><input type="radio" name="${esc(q.id)}" value="${esc(opt)}" ${answers[q.id]===opt?"checked":""}> ${esc(opt)}</label>`).join("")}${q.type==="short"?`<input name="${esc(q.id)}" value="${esc(answers[q.id]||"")}" placeholder="Your answer">`:""}</div>`).join("")}</div><button class="btn btn-primary" type="submit">Submit test →</button></form>`,test.title);
      $("#test-attempt").addEventListener("change",e=>{if(e.target.name)answers[e.target.name]=e.target.value;});
      $("#test-attempt").addEventListener("submit",async e=>{e.preventDefault();if(!confirm("Submit this test now?"))return;try{await api(`/api/attempts/${attemptId}/answers`,{method:"PUT",body:JSON.stringify({answers})});const result=(await api(`/api/attempts/${attemptId}/submit`,{method:"POST",body:"{}"})).result;showResult(result,test.title);}catch(err){toast(err.message);}});
    };
    // Rehydrate remaining time based on server-provided start timestamp.
    const startMs=new Date(startedAt).getTime();
    const update=()=>{remaining=Math.max(0,test.durationMinutes*60-Math.floor((Date.now()-startMs)/1000));const timer=$("#timer");if(timer)timer.textContent=`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,"0")}`;if(remaining<=0){clearInterval(interval);const form=$("#test-attempt");if(form){const data=new FormData(form);for(const [k,v] of data.entries())answers[k]=v;api(`/api/attempts/${attemptId}/answers`,{method:"PUT",body:JSON.stringify({answers})}).catch(()=>{}).finally(()=>api(`/api/attempts/${attemptId}/submit`,{method:"POST",body:"{}"}).then(r=>showResult(r.result,test.title)).catch(e=>toast(e.message)));}}};
    draw(); const interval=setInterval(update,1000);
  }catch(e){shell(`<div class="panel-card"><h1>Unable to start test</h1><p>${esc(e.message)}</p><a class="btn btn-primary" href="/#tests">Back to tests</a></div>`);}
}
function showResult(result,title) {
  shell(`<div class="auth-wrap" style="max-width:650px;min-height:0"><section class="auth-form" style="grid-column:1/-1;text-align:center"><div class="art-symbol" style="font-size:42px;color:${result.passed?"#169c6b":"#d88b27"}">${result.passed?"✓":"✳"}</div><div class="eyebrow">TEST SUBMITTED</div><h1>${esc(title)}</h1><p>Your result has been saved to your account.</p><div class="panel-grid" style="grid-template-columns:repeat(3,1fr);text-align:left"><div class="metric"><span>Score</span><strong>${result.score}/${result.totalMarks}</strong></div><div class="metric"><span>Percentage</span><strong>${result.percentage}%</strong></div><div class="metric"><span>Outcome</span><strong style="font-size:18px">${result.passed?"Passed":"Try again"}</strong></div></div><a class="btn btn-primary" href="/dashboard">View my results →</a> <a class="btn btn-outline" href="/#courses">Keep learning</a></section></div>`, "Test result");
}
function route() {
  const p=location.pathname;
  if(p==="/login")return authPage("login");
  if(p==="/register")return authPage("register");
  if(p==="/forgot-password")return authPage("forgot");
  if(p==="/reset-password")return authPage("reset");
  if(p==="/dashboard")return dashboardPage();
  if(p==="/admin")return adminPage();
  if(p.startsWith("/course/"))return coursePage(decodeURIComponent(p.slice(8)));
  if(p.startsWith("/lesson/"))return lessonPage(decodeURIComponent(p.slice(8)));
  if(p.startsWith("/take-test/"))return takeTest(decodeURIComponent(p.slice(11)));
}
document.addEventListener("DOMContentLoaded",()=>{
  if(location.pathname==="/")renderHome();
  else route();
});
