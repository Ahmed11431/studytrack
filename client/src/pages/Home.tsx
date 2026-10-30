import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  BookOpen,
  Check,
  CircleCheck,
  ClipboardCheck,
  LayoutGrid,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
  Target,
  Timer,
  TimerReset,
  Trophy,
} from "lucide-react";

const SUBJECTS = ["Web Programming", "DSA", "OS", "Arc", "Linear Algebra"] as const;
const LECTURES = Array.from({ length: 12 }, (_, index) => index + 1);
const STORAGE_KEY = "studytrack-progress-v1";
const TIMER_STORAGE_KEY = "studytrack-pomodoro-v1";

type Subject = (typeof SUBJECTS)[number];
type ProgressState = Record<Subject, Record<number, { studied: boolean; solved: boolean }>>;
type Filter = "all" | Subject;
type TimerMode = "focus" | "break";
type TimerState = { mode: TimerMode; secondsLeft: number; isRunning: boolean; sessionsCompleted: number };

const TIMER_MODES: Record<TimerMode, { label: string; caption: string; duration: number }> = {
  focus: { label: "تركيز", caption: "وقت المذاكرة", duration: 25 * 60 },
  break: { label: "راحة", caption: "استراحة قصيرة", duration: 5 * 60 },
};

function createEmptyProgress(): ProgressState {
  return SUBJECTS.reduce((subjects, subject) => {
    subjects[subject] = LECTURES.reduce((lectures, lecture) => {
      lectures[lecture] = { studied: false, solved: false };
      return lectures;
    }, {} as Record<number, { studied: boolean; solved: boolean }>);
    return subjects;
  }, {} as ProgressState);
}

function loadProgress(): ProgressState {
  const empty = createEmptyProgress();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ProgressState> | null;
    if (!saved) return empty;
    SUBJECTS.forEach((subject) => {
      LECTURES.forEach((lecture) => {
        const item = saved[subject]?.[lecture];
        if (item) {
          empty[subject][lecture] = {
            studied: item.studied === true,
            solved: item.solved === true,
          };
        }
      });
    });
  } catch {
    return empty;
  }
  return empty;
}

function percent(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 100);
}

function loadTimer(): TimerState {
  const fallback: TimerState = { mode: "focus", secondsLeft: TIMER_MODES.focus.duration, isRunning: false, sessionsCompleted: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(TIMER_STORAGE_KEY) ?? "null") as Partial<TimerState> | null;
    if (!saved || (saved.mode !== "focus" && saved.mode !== "break")) return fallback;
    const duration = TIMER_MODES[saved.mode].duration;
    return {
      mode: saved.mode,
      secondsLeft: typeof saved.secondsLeft === "number" ? Math.max(0, Math.min(saved.secondsLeft, duration)) : duration,
      isRunning: saved.isRunning === true,
      sessionsCompleted: typeof saved.sessionsCompleted === "number" ? Math.max(0, saved.sessionsCompleted) : 0,
    };
  } catch {
    return fallback;
  }
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function CheckCell({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`status-button ${checked ? "is-checked" : ""}`}
      role="checkbox"
      aria-checked={checked}
      aria-label={`${label}: ${checked ? "تم" : "غير مكتمل"}`}
      onClick={onClick}
    >
      <span className="status-icon">{checked ? <Check size={16} strokeWidth={3} /> : <span />}</span>
      <span className="status-text">{checked ? "تم" : "—"}</span>
    </button>
  );
}

function PomodoroTimer() {
  const [timer, setTimer] = useState<TimerState>(() => loadTimer());
  const mode = TIMER_MODES[timer.mode];

  useEffect(() => {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
  }, [timer]);

  useEffect(() => {
    if (!timer.isRunning) return;
    const interval = window.setInterval(() => {
      setTimer((current) => {
        if (current.secondsLeft > 1) return { ...current, secondsLeft: current.secondsLeft - 1 };
        const nextMode: TimerMode = current.mode === "focus" ? "break" : "focus";
        return {
          mode: nextMode,
          secondsLeft: TIMER_MODES[nextMode].duration,
          isRunning: false,
          sessionsCompleted: current.sessionsCompleted + Number(current.mode === "focus"),
        };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timer.isRunning]);

  const chooseMode = (nextMode: TimerMode) => {
    setTimer((current) => ({ ...current, mode: nextMode, secondsLeft: TIMER_MODES[nextMode].duration, isRunning: false }));
  };

  const resetTimer = () => {
    setTimer((current) => ({ ...current, secondsLeft: mode.duration, isRunning: false }));
  };

  const skipMode = () => {
    const nextMode: TimerMode = timer.mode === "focus" ? "break" : "focus";
    setTimer((current) => ({ ...current, mode: nextMode, secondsLeft: TIMER_MODES[nextMode].duration, isRunning: false }));
  };

  const progress = ((mode.duration - timer.secondsLeft) / mode.duration) * 360;

  return (
    <section className={`pomodoro-card ${timer.mode === "break" ? "break-mode" : ""}`} aria-label="مؤقت بومودورو">
      <div className="pomodoro-intro">
        <div className="pomodoro-icon"><Timer size={19} /></div>
        <div><span className="section-kicker">Pomodoro</span><h2>نظّم وقت مذاكرتك</h2><p>{mode.caption} — جلسة قصيرة بتركيز أعلى.</p></div>
      </div>
      <div className="pomodoro-modes" role="tablist" aria-label="وضع المؤقت">
        {(Object.keys(TIMER_MODES) as TimerMode[]).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={timer.mode === item} className={timer.mode === item ? "active" : ""} onClick={() => chooseMode(item)}>{TIMER_MODES[item].label}<small>{TIMER_MODES[item].duration / 60} د</small></button>
        ))}
      </div>
      <div className="pomodoro-clock" style={{ "--timer-progress": `${progress}deg` } as CSSProperties}>
        <div><strong>{formatTimer(timer.secondsLeft)}</strong><span>{timer.isRunning ? "جاري الآن" : "جاهز للبدء"}</span></div>
      </div>
      <div className="pomodoro-controls">
        <button type="button" className="timer-main-button" onClick={() => setTimer((current) => ({ ...current, isRunning: !current.isRunning }))} aria-label={timer.isRunning ? "إيقاف المؤقت" : "تشغيل المؤقت"}>{timer.isRunning ? <Pause size={15} /> : <Play size={15} />}{timer.isRunning ? "إيقاف مؤقت" : "ابدأ الآن"}</button>
        <button type="button" className="timer-icon-button" onClick={resetTimer} aria-label="إعادة ضبط المؤقت" title="إعادة ضبط"><TimerReset size={17} /></button>
        <button type="button" className="timer-icon-button" onClick={skipMode} aria-label="تخطي الوضع الحالي" title="تخطي"><SkipForward size={17} /></button>
      </div>
      <div className="pomodoro-sessions"><span className="session-dots" aria-hidden="true"><i className={timer.sessionsCompleted > 0 ? "filled" : ""} /><i className={timer.sessionsCompleted > 1 ? "filled" : ""} /><i className={timer.sessionsCompleted > 2 ? "filled" : ""} /><i className={timer.sessionsCompleted > 3 ? "filled" : ""} /></span><span>{timer.sessionsCompleted} جلسة تركيز مكتملة</span></div>
    </section>
  );
}

export default function Home() {
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  const [filter, setFilter] = useState<Filter>("all");
  const [savedPulse, setSavedPulse] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    setSavedPulse(true);
    const timer = window.setTimeout(() => setSavedPulse(false), 900);
    return () => window.clearTimeout(timer);
  }, [progress]);

  const stats = useMemo(() => {
    let completedTasks = 0;
    let fullyDoneLectures = 0;
    SUBJECTS.forEach((subject) => {
      LECTURES.forEach((lecture) => {
        const item = progress[subject][lecture];
        completedTasks += Number(item.studied) + Number(item.solved);
        fullyDoneLectures += Number(item.studied && item.solved);
      });
    });
    return { completedTasks, fullyDoneLectures, totalTasks: SUBJECTS.length * LECTURES.length * 2 };
  }, [progress]);

  const visibleSubjects = filter === "all" ? SUBJECTS : [filter];

  const subjectStats = (subject: Subject) => {
    let completed = 0;
    let finishedLectures = 0;
    LECTURES.forEach((lecture) => {
      const item = progress[subject][lecture];
      completed += Number(item.studied) + Number(item.solved);
      finishedLectures += Number(item.studied && item.solved);
    });
    return { completed, finishedLectures, total: LECTURES.length * 2 };
  };

  const toggle = (subject: Subject, lecture: number, key: "studied" | "solved") => {
    setProgress((current) => ({
      ...current,
      [subject]: {
        ...current[subject],
        [lecture]: {
          ...current[subject][lecture],
          [key]: !current[subject][lecture][key],
        },
      },
    }));
  };

  const toggleSubject = (subject: Subject) => {
    const statsForSubject = subjectStats(subject);
    const shouldComplete = statsForSubject.completed < statsForSubject.total;
    setProgress((current) => ({
      ...current,
      [subject]: LECTURES.reduce((lectures, lecture) => {
        lectures[lecture] = { studied: shouldComplete, solved: shouldComplete };
        return lectures;
      }, {} as Record<number, { studied: boolean; solved: boolean }>),
    }));
  };

  const resetProgress = () => {
    if (window.confirm("هل تريد مسح كل التقدم والبدء من جديد؟")) {
      setProgress(createEmptyProgress());
      setFilter("all");
    }
  };

  return (
    <main className="app-shell">
      <div className="page-frame">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true"><span /></div>
            <div>
              <div className="brand-name">StudyTrack</div>
              <div className="brand-caption">خطة مذاكرة منظمة</div>
            </div>
          </div>
          <div className={`save-state ${savedPulse ? "is-saving" : ""}`}>
            <span className="save-dot" />
            <span>يُحفظ تلقائياً</span>
          </div>
        </header>

        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={14} /> مساحة تركيزك اليومية</div>
            <h1>كل محاضرة تخلّصها،<br /><em>بتقرّبك من هدفك.</em></h1>
            <p>تابع مذاكرتك وحلّك في مكان واحد. اختار الحالة المناسبة لكل محاضرة وشوف تقدّمك يكبر خطوة بخطوة.</p>
          </div>
          <div className="hero-target" aria-label={`${percent(stats.completedTasks, stats.totalTasks)} بالمئة من المهام مكتملة`}>
            <div className="ring" style={{ "--progress": `${percent(stats.completedTasks, stats.totalTasks) * 3.6}deg` } as CSSProperties}>
              <div className="ring-inner">
                <strong>{percent(stats.completedTasks, stats.totalTasks)}%</strong>
                <span>منجز</span>
              </div>
            </div>
            <div className="target-note"><Target size={16} /><span>استمر، أنت ماشي صح</span></div>
          </div>
        </section>

        <section className="stats-strip" aria-label="ملخص التقدم">
          <div className="stat-item">
            <div className="stat-icon blue"><ClipboardCheck size={19} /></div>
            <div><span className="stat-label">إجمالي المهام</span><strong>{stats.totalTasks} <small>خانة</small></strong></div>
          </div>
          <div className="stat-item">
            <div className="stat-icon green"><CircleCheck size={19} /></div>
            <div><span className="stat-label">تم إنجازه</span><strong>{stats.completedTasks} <small>خانة</small></strong></div>
          </div>
          <div className="stat-item">
            <div className="stat-icon orange"><Trophy size={19} /></div>
            <div><span className="stat-label">محاضرات مكتملة</span><strong>{stats.fullyDoneLectures} <small>من 60</small></strong></div>
          </div>
          <div className="stat-quote"><span>✦</span> الإنجاز الصغير المتكرر يصنع الفرق الكبير.</div>
        </section>

        <PomodoroTimer />

        <section className="workspace">
          <aside className="subject-sidebar">
            <div className="sidebar-heading"><div><span className="section-kicker">المواد الدراسية</span><h2>خطتك الحالية</h2></div><BookOpen size={20} /></div>
            <nav className="subject-list" aria-label="فلترة المواد">
              <button type="button" className={`subject-filter ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
                <span className="subject-symbol all-symbol"><LayoutGrid size={16} /></span><span className="subject-filter-name">كل المواد</span><span className="filter-count">60</span>
              </button>
              {SUBJECTS.map((subject, index) => {
                const statsForSubject = subjectStats(subject);
                return (
                  <button key={subject} type="button" className={`subject-filter ${filter === subject ? "active" : ""}`} onClick={() => setFilter(subject)}>
                    <span className={`subject-symbol subject-${index + 1}`}>{subject.slice(0, 1)}</span>
                    <span className="subject-filter-body"><span className="subject-filter-name" dir="ltr">{subject}</span><span className="mini-progress"><span style={{ width: `${percent(statsForSubject.completed, statsForSubject.total)}%` }} /></span></span>
                    <span className="filter-count">{statsForSubject.finishedLectures}/12</span>
                  </button>
                );
              })}
            </nav>
            <div className="sidebar-tip"><span className="tip-icon">↗</span><div><strong>نصيحة اليوم</strong><p>ابدأ بمحاضرة واحدة فقط. المهم إنك تبدأ.</p></div></div>
          </aside>

          <section className="progress-panel">
            <div className="panel-header">
              <div><span className="section-kicker">متابعة المحاضرات</span><h2>{filter === "all" ? "كل المحاضرات" : filter}</h2></div>
              <div className="panel-actions">
                {filter !== "all" && <button type="button" className="outline-button" onClick={() => toggleSubject(filter)}><Check size={15} /> تحديد المادة {subjectStats(filter).completed === subjectStats(filter).total ? "كغير مكتملة" : "كمكتملة"}</button>}
                <button type="button" className="reset-button" onClick={resetProgress}><RotateCcw size={15} /> إعادة ضبط</button>
              </div>
            </div>
            <div className="legend"><span><i className="legend-dot study-dot" /> مذاكرة المحاضرة</span><span><i className="legend-dot solve-dot" /> حلّ / تمارين</span><span className="legend-hint">اضغط على الخانة لتغيير حالتها</span></div>

            <div className="table-wrap">
              <table className="lecture-table" dir="ltr">
                <thead>
                  <tr><th>المادة / المحاضرة</th><th><span className="th-pill study-pill" /> مذاكرة</th><th><span className="th-pill solve-pill" /> حلّ وتمارين</th></tr>
                </thead>
                <tbody>
                  {visibleSubjects.map((subject) => {
                    const statsForSubject = subjectStats(subject);
                    return (
                      <Fragment key={subject}>
                        <tr className="subject-row"><th colSpan={3}><span className="subject-row-mark">{subject.slice(0, 1)}</span><span className="subject-row-name" dir="ltr">{subject}</span><span className="subject-row-progress"><span>{statsForSubject.completed}/{statsForSubject.total} مهام</span><span className="group-progress"><span style={{ width: `${percent(statsForSubject.completed, statsForSubject.total)}%` }} /></span></span></th></tr>
                        {LECTURES.map((lecture) => {
                          const item = progress[subject][lecture];
                          return (
                            <tr key={`${subject}-${lecture}`} className={item.studied && item.solved ? "lecture-complete" : ""}>
                              <td><span className="lecture-number">{String(lecture).padStart(2, "0")}</span><span className="lecture-name">Lecture {lecture}</span>{item.studied && item.solved && <span className="done-badge">مكتملة</span>}</td>
                              <td><CheckCell checked={item.studied} label={`${subject} Lecture ${lecture} مذاكرة`} onClick={() => toggle(subject, lecture, "studied")} /></td>
                              <td><CheckCell checked={item.solved} label={`${subject} Lecture ${lecture} حل`} onClick={() => toggle(subject, lecture, "solved")} /></td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer className="panel-footer"><span><span className="footer-check">✓</span> التقدم محفوظ على هذا الجهاز</span><span>{stats.completedTasks} من {stats.totalTasks} مهمة مكتملة</span></footer>
          </section>
        </section>
      </div>
    </main>
  );
}
