"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type CourseType = "體驗課" | "正課" | "待分類";
type BookingStatus = "已預約" | "已完成" | "已取消";

type Booking = {
  id: string;
  time: string;
  date: string;
  student: string;
  type: CourseType;
  status: BookingStatus;
  record: boolean;
  coach: string;
  location: string;
};

type Student = { name: string; type: string; sessions: number; goal: string; last: string };

export default function Home() {
  const [active, setActive] = useState("今日總覽");
  const [filter, setFilter] = useState("全部");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [today, setToday] = useState("");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/bootstrap", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "無法載入資料");
        setBookings(data.bookings || []);
        setToday(data.today || "");
        setStudents((data.students || []).map((student: Record<string, string>) => ({
          name: student["姓名"], type: student["學員階段"] || "待分類",
          sessions: Number(student["剩餘堂數"] || 0),
          goal: student["主要目標"] || "尚未填寫學習目標", last: "查看紀錄",
        })));
      })
      .catch((error) => setLoadError(error.message))
      .finally(() => setLoading(false));
  }, []);

  const todayBookings = useMemo(() => bookings.filter((booking) => booking.date === today), [bookings, today]);
  const filtered = useMemo(() => todayBookings.filter((booking) => filter === "全部" || booking.type === filter), [todayBookings, filter]);
  const upcomingBookings = useMemo(() => bookings.filter((booking) => !today || booking.date >= today), [bookings, today]);
  const pastBookings = useMemo(() => bookings.filter((booking) => today && booking.date < today), [bookings, today]);

  const todayCount = todayBookings.length;
  const pendingCount = pastBookings.filter((item) => !item.record).length;
  const headerDate = today ? new Intl.DateTimeFormat("zh-TW", { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${today}T12:00:00`)) : "";

  function openRecord(booking: Booking) {
    setSelected(booking);
    setSaved(false);
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const selects = event.currentTarget.querySelectorAll("select");
    const notes = event.currentTarget.querySelectorAll("textarea");
    const response = await fetch("/api/records", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bookingId: selected.id, student: selected.student, date: selected.date,
        beforePain: selects[1]?.value, beforeCondition: notes[0]?.value,
        content: notes[1]?.value, afterPain: selects[2]?.value,
        observation: `${selects[3]?.value || ""}${notes[2]?.value ? `｜${notes[2].value}` : ""}`,
        nextPlan: notes[2]?.value,
      }),
    });
    if (!response.ok) {
      const result = await response.json();
      window.alert(result.error || "儲存失敗，請稍後再試");
      return;
    }
    setBookings((current) => current.map((item) => item.id === selected.id ? { ...item, record: true, status: "已完成" } : item));
    setSaved(true);
    window.setTimeout(() => setSelected(null), 900);
  }

  async function classify(student: string, type: CourseType) {
    const response = await fetch("/api/students/classify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ student, type }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "分類儲存失敗");
    setBookings((current) => current.map((booking) => booking.student === student ? { ...booking, type } : booking));
    setStudents((current) => {
      const exists = current.some((item) => item.name === student);
      return exists ? current.map((item) => item.name === student ? { ...item, type } : item) : [...current, { name: student, type, sessions: 0, goal: "尚未填寫學習目標", last: "尚未上課" }];
    });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-flower">♧</span>
          <div><strong>Le Gin Pilates</strong><small>學員管理系統</small></div>
        </div>
        <nav aria-label="主要導覽">
          {["今日總覽", "預約課程", "學員資料", "上課紀錄", "課程方案"].map((item, index) => (
            <button key={item} className={active === item ? "nav-item active" : "nav-item"} onClick={() => setActive(item)}>
              <span>{["⌂", "▦", "♙", "▤", "▣"][index]}</span>{item}
            </button>
          ))}
        </nav>
        <div className="sidebar-art"><span>❧</span><p>每一次練習<br />都在靠近更好的自己</p></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{headerDate}</p>
            <h1>{active === "今日總覽" ? "早安，ANITA 教練" : active}</h1>
            <p>今天也一起陪學員，溫柔地感受身體的改變。</p>
          </div>
          <div className="coach-chip"><span>AN</span><div><b>ANITA</b><small>皮拉提斯教練</small></div></div>
        </header>

        {loading && <div className="system-message">正在讀取 Google 行事曆與學員資料…</div>}
        {loadError && <div className="system-message error">資料連線失敗：{loadError}</div>}

        {active === "學員資料" ? (
          <StudentView students={students} onBack={() => setActive("今日總覽")} />
        ) : active === "上課紀錄" ? (
          <RecordView bookings={pastBookings} onOpen={openRecord} />
        ) : active === "預約課程" ? (
          <BookingView bookings={upcomingBookings} onOpen={openRecord} onClassify={classify} />
        ) : active === "課程方案" ? (
          <EmptyView title="課程方案" message="課程方案會從 Google Sheet 的「課程方案」工作表顯示在這裡。" />
        ) : (
          <>
            <section className="stats-grid" aria-label="今日數據">
              <StatCard icon="▦" tone="coral" label="今日課程" value={todayCount} note="下一堂 09:00" />
              <StatCard icon="♙" tone="rose" label="今日體驗課" value={todayBookings.filter((b) => b.type === "體驗課").length} note="記得課後追蹤" />
              <StatCard icon="♧" tone="sand" label="今日正課" value={todayBookings.filter((b) => b.type === "正課").length} note="依學員資料分類" />
              <StatCard icon="▤" tone="sage" label="待補紀錄" value={pendingCount} note="完成後更好追蹤" />
            </section>

            <div className="content-grid">
              <section className="panel schedule-panel">
                <div className="panel-heading">
                  <div><span className="leaf">❧</span><div><h2>今日課程</h2><p>預約與學員狀態一目了然</p></div></div>
                  <div className="filters">
                    {["全部", "體驗課", "正課", "待分類"].map((item) => (
                      <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>
                    ))}
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead><tr><th>時間</th><th>學員</th><th>類型</th><th>預約狀態</th><th>紀錄</th><th>操作</th></tr></thead>
                    <tbody>
                      {filtered.map((booking) => (
                        <tr key={booking.id}>
                          <td className="time-cell">{booking.time}</td>
                          <td><button className="student-link" onClick={() => setActive("學員資料")}>{booking.student}</button><small>{booking.location}</small></td>
                          <td><Badge value={booking.type} /></td>
                          <td><Badge value={booking.status} /></td>
                          <td><span className={booking.record ? "record done" : "record"}>{booking.record ? "已填寫" : "尚未填寫"}</span></td>
                          <td><button className={booking.record ? "outline-button" : "primary-button"} onClick={() => openRecord(booking)}>{booking.record ? "查看" : booking.type === "待分類" ? "分類" : "開始紀錄"}<span>›</span></button></td>
                        </tr>
                      ))}
                      {!loading && filtered.length === 0 && <tr><td colSpan={6}>今天目前沒有預約課程。</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside className="right-rail">
                <section className="panel reminder-panel">
                  <div className="rail-title"><span>♧</span><h2>紀錄提醒</h2></div>
                  {pastBookings.filter((item) => !item.record).slice(0, 3).map((booking) => (
                    <button key={booking.id} onClick={() => openRecord(booking)}><i>▤</i><span>{booking.student} · 上課紀錄<small>{booking.date} 尚未完成</small></span><b>›</b></button>
                  ))}
                  {pastBookings.every((item) => item.record) && <p className="empty-note">目前沒有待補紀錄</p>}
                </section>
                <section className="panel next-panel">
                  <div className="rail-title"><span>❧</span><h2>下一步行動</h2></div>
                  <button onClick={() => setActive("預約課程")}><i>▦</i><span>查看今日課程表<small>確認課程與學員狀態</small></span><b>›</b></button>
                  <button onClick={() => setActive("上課紀錄")}><i>▤</i><span>填寫待補紀錄<small>尚有 {pendingCount} 筆</small></span><b>›</b></button>
                  <button onClick={() => setActive("學員資料")}><i>♙</i><span>新增學員資料<small>建立完整學習歷程</small></span><b>›</b></button>
                </section>
              </aside>
            </div>
          </>
        )}
      </section>

      {selected && <RecordModal booking={selected} saved={saved} onClose={() => setSelected(null)} onSave={saveRecord} />}
    </main>
  );
}

function StatCard({ icon, tone, label, value, note }: { icon: string; tone: string; label: string; value: number; note: string }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>;
}

function Badge({ value }: { value: string }) {
  const className = value === "體驗課" ? "trial" : value === "正課" ? "regular" : value === "待分類" ? "unknown" : value === "已完成" ? "complete" : value === "已取消" ? "cancelled" : "booked";
  return <span className={`badge ${className}`}>{value}</span>;
}

function StudentView({ students, onBack }: { students: Student[]; onBack: () => void }) {
  const [query, setQuery] = useState("");
  const visible = students.filter((student) => student.name.includes(query));
  return <section className="panel full-panel">
    <div className="panel-heading student-heading"><div><span className="leaf">❧</span><div><h2>學員資料</h2><p>追蹤每一位學員的目標與學習進度</p></div></div><div className="student-actions"><input aria-label="搜尋學員" placeholder="搜尋學員姓名" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="primary-button">＋ 新增學員</button></div></div>
    <div className="student-grid">{visible.map((student) => <article className="student-card" key={student.name}><div className="avatar">{student.name.slice(0, 1)}</div><div className="student-card-top"><Badge value={student.type} /><span>最近：{student.last}</span></div><h3>{student.name}</h3><p>{student.goal}</p><div className="student-progress"><span>剩餘堂數</span><strong>{student.sessions || "—"}</strong></div><button onClick={onBack}>查看完整紀錄 <span>›</span></button></article>)}</div>
  </section>;
}

function RecordView({ bookings, onOpen }: { bookings: Booking[]; onOpen: (booking: Booking) => void }) {
  return <section className="panel full-panel"><div className="panel-heading"><div><span className="leaf">❧</span><div><h2>上課紀錄</h2><p>這裡只顯示已經上完的歷史課程</p></div></div></div><div className="record-list">{bookings.map((booking) => { const [, month, day] = booking.date.split(/[/-]/); return <article key={booking.id}><div className="date-block"><b>{day}</b><span>{month} 月</span></div><div><h3>{booking.student}<Badge value={booking.type} /></h3><p>{booking.date} · {booking.time} · {booking.coach} · {booking.location}</p></div><span className={booking.record ? "record done" : "record"}>{booking.record ? "已填寫" : "待填寫"}</span><button className="outline-button" onClick={() => onOpen(booking)}>{booking.record ? "查看紀錄" : "開始填寫"}</button></article>;})}{bookings.length === 0 && <p className="empty-note">目前沒有歷史課程。</p>}</div></section>;
}

function BookingView({ bookings, onOpen, onClassify }: { bookings: Booking[]; onOpen: (booking: Booking) => void; onClassify: (student: string, type: CourseType) => Promise<void> }) {
  const [type, setType] = useState("全部");
  const [mode, setMode] = useState<"calendar" | "list">("calendar");
  const [weekOffset, setWeekOffset] = useState(0);
  const [saving, setSaving] = useState("");
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay() + 1 + weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  const keyOf = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const visible = bookings.filter((booking) => type === "全部" || booking.type === type);
  async function choose(booking: Booking, nextType: CourseType) {
    setSaving(booking.student);
    try { await onClassify(booking.student, nextType); }
    catch (error) { window.alert(error instanceof Error ? error.message : "分類失敗"); }
    finally { setSaving(""); }
  }
  return <section className="panel full-panel booking-view">
    <div className="panel-heading"><div><span className="leaf">❧</span><div><h2>學員預約行事曆</h2><p>瀏覽每週課程，未分類學員可直接選擇體驗課或正課</p></div></div><div className="view-actions"><div className="filters">{["全部", "體驗課", "正課", "待分類"].map((item) => <button key={item} className={type === item ? "selected" : ""} onClick={() => setType(item)}>{item}</button>)}</div><div className="mode-switch"><button className={mode === "calendar" ? "selected" : ""} onClick={() => setMode("calendar")}>週行事曆</button><button className={mode === "list" ? "selected" : ""} onClick={() => setMode("list")}>列表</button></div></div></div>
    {mode === "calendar" ? <><div className="calendar-toolbar"><button onClick={() => setWeekOffset((value) => value - 1)}>‹ 上一週</button><strong>{keyOf(days[0])} ～ {keyOf(days[6])}</strong><div><button onClick={() => setWeekOffset(0)}>本週</button><button onClick={() => setWeekOffset((value) => value + 1)}>下一週 ›</button></div></div><div className="week-grid">{days.map((day) => { const dateKey = keyOf(day); const items = visible.filter((booking) => booking.date === dateKey); return <section className="day-column" key={dateKey}><header><span>{new Intl.DateTimeFormat("zh-TW", { weekday: "short" }).format(day)}</span><b>{day.getDate()}</b></header><div>{items.map((booking) => <article className={`calendar-event ${booking.type === "待分類" ? "unclassified" : ""}`} key={booking.id}><time>{booking.time}</time><strong>{booking.student}</strong><small>{booking.coach} · {booking.location}</small>{booking.type === "待分類" ? <div className="quick-classify"><button disabled={saving === booking.student} onClick={() => choose(booking, "體驗課")}>體驗課</button><button disabled={saving === booking.student} onClick={() => choose(booking, "正課")}>正課</button></div> : <Badge value={booking.type} />}<button className="event-open" onClick={() => onOpen(booking)}>查看 ›</button></article>)}{items.length === 0 && <span className="no-booking">沒有課程</span>}</div></section>; })}</div></> : <div className="table-wrap"><table><thead><tr><th>日期</th><th>時間</th><th>學員</th><th>類型／快速分類</th><th>教練／地點</th><th>操作</th></tr></thead><tbody>{visible.map((booking) => <tr key={booking.id}><td>{booking.date}</td><td className="time-cell">{booking.time}</td><td>{booking.student}</td><td>{booking.type === "待分類" ? <div className="quick-classify"><button onClick={() => choose(booking, "體驗課")}>體驗課</button><button onClick={() => choose(booking, "正課")}>正課</button></div> : <Badge value={booking.type} />}</td><td>{booking.coach}<small>{booking.location}</small></td><td><button className="outline-button" onClick={() => onOpen(booking)}>查看／紀錄</button></td></tr>)}{visible.length === 0 && <tr><td colSpan={6}>目前沒有符合的未來預約。</td></tr>}</tbody></table></div>}
  </section>;
}

function EmptyView({ title, message }: { title: string; message: string }) {
  return <section className="panel full-panel"><div className="panel-heading"><div><span className="leaf">❧</span><div><h2>{title}</h2><p>{message}</p></div></div></div><p className="empty-note">目前還沒有資料。</p></section>;
}

function RecordModal({ booking, saved, onClose, onSave }: { booking: Booking; saved: boolean; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="填寫上課紀錄"><div className="record-modal"><header><div><span className="modal-kicker">SESSION NOTE</span><h2>{booking.student}的上課紀錄</h2><p>{booking.date} · {booking.time} · {booking.location}</p></div><button aria-label="關閉" onClick={onClose}>×</button></header>{saved ? <div className="success-state"><span>✓</span><h3>紀錄已儲存</h3><p>這堂課已標記為完成。</p></div> : <form onSubmit={onSave}><div className="form-row"><label>課程類型<select defaultValue={booking.type}><option>體驗課</option><option>正課</option><option>待分類</option></select></label><label>課前疼痛程度<select defaultValue="2"><option value="0">0 · 無疼痛</option>{[1,2,3,4,5,6,7,8,9,10].map((v) => <option key={v}>{v}</option>)}</select></label></div><label>課前身體狀況<textarea placeholder="例如：右側肩頸緊繃、昨晚睡眠不足…" /></label><label>本堂訓練內容<textarea placeholder="記錄器材、動作、組數與提示…" /></label><div className="form-row"><label>課後疼痛程度<select defaultValue="1"><option value="0">0 · 無疼痛</option>{[1,2,3,4,5,6,7,8,9,10].map((v) => <option key={v}>{v}</option>)}</select></label><label>動作完成度<select defaultValue="穩定進步"><option>需要協助</option><option>逐漸穩定</option><option>穩定進步</option><option>掌握良好</option></select></label></div><label>教練觀察與下堂安排<textarea placeholder="代償狀況、左右差異、下次訓練重點…" /></label><footer><button type="button" className="ghost-button" onClick={onClose}>稍後再填</button><button type="submit" className="primary-button">儲存上課紀錄</button></footer></form>}</div></div>;
}
