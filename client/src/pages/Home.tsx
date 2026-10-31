import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BookOpen,
  Check,
  CircleCheck,
  ClipboardCheck,
  Download,
  LayoutGrid,
  Moon,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
  Sun,
  Target,
  Timer,
  TimerReset,
  Trophy,
} from "lucide-react";

const DEFAULT_SUBJECTS = ["Web Programming", "DSA", "OS", "Arc", "Linear Algebra"];
const STORAGE_KEY = "studytrack-progress-v1";
const TIMER_STORAGE_KEY = "studytrack-pomodoro-v1";
const TIME_LOG_STORAGE_KEY = "studytrack-time-log-v1";
const SUBJECTS_STORAGE_KEY = "studytrack-subjects-v1";
const THEME_STORAGE_KEY = "studytrack-theme-v1";

type Subject = string;
type SubjectConfig = { name: string; lectureCount: number; colorIndex: number };
type ProgressState = Record<Subject, Record<number, { studied: boolean; solved: boolean }>>;
type Filter = "all" | Subject;
type TimerMode = "focus" | "break";
type TimerState = { mode: TimerMode; secondsLeft: number; isRunning: boolean; sessionsCompleted: number; subject: Subject };
type TimeLog = Record<Subject, Record<string, number>>;
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const SUBJECT_COLORS = ["subject-1", "subject-2", "subject-3", "subject-4", "subject-5"];

const TIMER_MODES: Record<TimerMode, { label: string; caption: string; duration: number }> = {
  focus: { label: "تركيز", caption: "وقت المذاكرة", duration: 25 * 60 },
  break: { label: "راحة", caption: "استراحة قصيرة", duration: 5 * 60 },
};

function defaultSubjectConfigs(): SubjectConfig[] {
  return DEFAULT_SUBJECTS.map((name, index) => ({ name, lectureCount: 12, colorIndex: index }));
}

function loadSubjects(): SubjectConfig[] {
  const fallback = defaultSubjectConfigs();
  try {
    const saved = JSON.parse(localStorage.getItem(SUBJECTS_STORAGE_KEY) ?? "null") as Partial<SubjectConfig>[] | null;
    if (!Array.isArray(saved) || saved.length === 0) return fallback;
    const names = new Set<string>();
    const loaded = saved.flatMap((item, index) => {
      const name = typeof item?.name === "string" ? item.name.trim() : "";
      if (!name || names.has(name)) return [];
      names.add(name);
      const lectureCount = typeof item.lectureCount === "number" ? Math.max(1, Math.min(100, Math.floor(item.lectureCount))) : 12;
      return [{ name, lectureCount, colorIndex: index }];
    });
    return loaded.length > 0 ? loaded : fallback;
  } catch {
    return fallback;
  }
}

function createEmptyProgress(subjects: SubjectConfig[]): ProgressState {
  return subjects.reduce((progress, subject) => {
    progress[subject.name] = Array.from({ length: subject.lectureCount }, (_, index) => index + 1).reduce((lectures, lecture) => {
      lectures[lecture] = { studied: false, solved: false };
      return lectures;
    }, {} as Record<number, { studied: boolean; solved: boolean }>);
    return progress;
  }, {} as ProgressState);
}

function loadProgress(subjects: SubjectConfig[]): ProgressState {
  const empty = createEmptyProgress(subjects);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ProgressState> | null;
    if (!saved) return empty;
    subjects.forEach((subject) => {
      Array.from({ length: subject.lectureCount }, (_, index) => index + 1).forEach((lecture) => {
        const item = saved[subject.name]?.[lecture];
        if (item) {
          empty[subject.name][lecture] = {
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

function loadTimer(subjects: SubjectConfig[]): TimerState {
  const names = subjects.map((subject) => subject.name);
  const fallback: TimerState = { mode: "focus", secondsLeft: TIMER_MODES.focus.duration, isRunning: false, sessionsCompleted: 0, subject: names[0] };
  try {
    const saved = JSON.parse(localStorage.getItem(TIMER_STORAGE_KEY) ?? "null") as Partial<TimerState> | null;
    if (!saved || (saved.mode !== "focus" && saved.mode !== "break")) return fallback;
    const duration = TIMER_MODES[saved.mode].duration;
    return {
      mode: saved.mode,
      secondsLeft: typeof saved.secondsLeft === "number" ? Math.max(0, Math.min(saved.secondsLeft, duration)) : duration,
      isRunning: saved.isRunning === true,
      sessionsCompleted: typeof saved.sessionsCompleted === "number" ? Math.max(0, saved.sessionsCompleted) : 0,
      subject: saved.subject && names.includes(saved.subject as Subject) ? saved.subject as Subject : names[0],
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

function createEmptyTimeLog(subjects: SubjectConfig[]): TimeLog {
  return subjects.reduce((log, subject) => {
    log[subject.name] = {};
    return log;
  }, {} as TimeLog);
}

function loadTimeLog(subjects: SubjectConfig[]): TimeLog {
  const empty = createEmptyTimeLog(subjects);
  try {
    const saved = JSON.parse(localStorage.getItem(TIME_LOG_STORAGE_KEY) ?? "null") as Partial<TimeLog> | null;
    subjects.forEach((subject) => {
      const subjectLog = saved?.[subject.name];
      if (subjectLog && typeof subjectLog === "object") empty[subject.name] = Object.fromEntries(Object.entries(subjectLog).filter(([, value]) => typeof value === "number" && value >= 0));
    });
  } catch {
    return empty;
  }
  return empty;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentWeekKeys() {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return localDateKey(date);
  });
}

function formatStudyTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}س ${String(minutes).padStart(2, "0")}د` : `${minutes}د`;
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

function PomodoroTimer({ subjects, onStudySecond }: { subjects: SubjectConfig[]; onStudySecond: (subject: Subject) => void }) {
  const [timer, setTimer] = useState<TimerState>(() => loadTimer(subjects));
  const mode = TIMER_MODES[timer.mode];

  useEffect(() => {
    if (!subjects.some((subject) => subject.name === timer.subject)) setTimer((current) => ({ ...current, subject: subjects[0]?.name ?? "" }));
  }, [subjects, timer.subject]);

  useEffect(() => {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
  }, [timer]);

  useEffect(() => {
    if (!timer.isRunning) return;
    const interval = window.setInterval(() => {
      if (timer.mode === "focus") onStudySecond(timer.subject);
      setTimer((current) => {
        if (current.secondsLeft > 1) return { ...current, secondsLeft: current.secondsLeft - 1 };
        const nextMode: TimerMode = current.mode === "focus" ? "break" : "focus";
        return {
          mode: nextMode,
          secondsLeft: TIMER_MODES[nextMode].duration,
          isRunning: false,
          sessionsCompleted: current.sessionsCompleted + Number(current.mode === "focus"),
          subject: current.subject,
        };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [onStudySecond, timer.isRunning, timer.mode, timer.subject]);

  const chooseMode = (nextMode: TimerMode) => {
    setTimer((current) => ({ ...current, mode: nextMode, secondsLeft: TIMER_MODES[nextMode].duration, isRunning: false }));
  };

  const chooseSubject = (subject: Subject) => setTimer((current) => ({ ...current, subject }));

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
        <div><span className="section-kicker">Pomodoro</span><h2>نظّم وقت مذاكرتك</h2><p>{mode.caption} — سجّل الوقت لمادة محددة.</p><label className="timer-subject">المادة الحالية<select value={timer.subject} onChange={(event) => chooseSubject(event.target.value as Subject)} aria-label="المادة الحالية">{subjects.map((subject) => <option key={subject.name} value={subject.name}>{subject.name}</option>)}</select></label></div>
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

function WeeklyStudyReport({ subjects, timeLog }: { subjects: SubjectConfig[]; timeLog: TimeLog }) {
  const weekKeys = getCurrentWeekKeys();
  const rows = subjects.map((subject) => ({
    subject: subject.name,
    index: subject.colorIndex,
    seconds: weekKeys.reduce((total, key) => total + (timeLog[subject.name]?.[key] ?? 0), 0),
  }));
  const totalSeconds = rows.reduce((total, row) => total + row.seconds, 0);
  const maxSeconds = Math.max(...rows.map((row) => row.seconds), 1);
  const activeSubjects = rows.filter((row) => row.seconds > 0).length;

  return (
    <section className="weekly-report" aria-label="تقرير وقت المذاكرة الأسبوعي">
      <div className="report-header"><div><span className="section-kicker">تحليل أسبوعي</span><h2>وقت المذاكرة حسب المادة</h2></div><div className="report-summary"><strong>{formatStudyTime(totalSeconds)}</strong><span>إجمالي هذا الأسبوع · {activeSubjects}/{subjects.length} مواد نشطة</span></div></div>
      <div className="report-rows">
        {rows.map((row) => (
          <div className="report-row" key={row.subject}>
            <div className={`report-symbol ${SUBJECT_COLORS[row.index % SUBJECT_COLORS.length]}`}>{row.subject.slice(0, 1)}</div>
            <div className="report-name" dir="ltr">{row.subject}</div>
            <div className="report-track"><span style={{ width: `${(row.seconds / maxSeconds) * 100}%` }} /></div>
            <strong className="report-time">{formatStudyTime(row.seconds)}</strong>
          </div>
        ))}
      </div>
      <p className="report-note">يُسجّل الوقت تلقائياً أثناء تشغيل جلسة التركيز، حسب المادة المختارة في المؤقت.</p>
    </section>
  );
}

function SubjectManager({ subjects, onSave }: { subjects: SubjectConfig[]; onSave: (subjects: SubjectConfig[]) => void }) {
  const [drafts, setDrafts] = useState<SubjectConfig[]>(subjects);
  const [newName, setNewName] = useState("");
  const [newCount, setNewCount] = useState(12);

  useEffect(() => setDrafts(subjects), [subjects]);

  const updateDraft = (index: number, patch: Partial<SubjectConfig>) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const addSubject = () => {
    const name = newName.trim();
    if (!name || drafts.some((subject) => subject.name.toLowerCase() === name.toLowerCase())) return;
    setDrafts((current) => [...current, { name, lectureCount: Math.max(1, Math.min(100, Math.floor(newCount) || 12)), colorIndex: current.length }]);
    setNewName("");
    setNewCount(12);
  };

  return (
    <details className="subject-manager">
      <summary><span><span className="section-kicker">إعدادات الخطة</span><strong>إدارة المواد والمحاضرات</strong></span><span className="manager-summary-hint">إضافة مادة أو تعديل العدد بدون تعديل الكود</span></summary>
      <div className="manager-body">
        <div className="manager-list">
          {drafts.map((subject, index) => (
            <div className="manager-row" key={`${subject.name}-${index}`}><input aria-label={`اسم المادة ${index + 1}`} value={subject.name} onChange={(event) => updateDraft(index, { name: event.target.value })} /><label>محاضرة <input type="number" min={1} max={100} value={subject.lectureCount} onChange={(event) => updateDraft(index, { lectureCount: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} /></label><button type="button" onClick={() => setDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={drafts.length === 1} aria-label={`حذف مادة ${subject.name}`}>حذف</button></div>
          ))}
        </div>
        <div className="manager-add"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="اسم مادة جديدة" aria-label="اسم مادة جديدة" /><input type="number" min={1} max={100} value={newCount} onChange={(event) => setNewCount(Number(event.target.value) || 1)} aria-label="عدد محاضرات المادة الجديدة" /><button type="button" onClick={addSubject}>+ إضافة</button></div>
        <div className="manager-actions"><span>التقدم الموجود يُحفظ عند تغيير الاسم أو العدد.</span><button type="button" className="manager-save" onClick={() => onSave(drafts)}>حفظ إعدادات المواد</button></div>
      </div>
    </details>
  );
}

export default function Home() {
  const [subjects, setSubjects] = useState<SubjectConfig[]>(() => loadSubjects());
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress(subjects));
  const [filter, setFilter] = useState<Filter>("all");
  const [savedPulse, setSavedPulse] = useState(false);
  const [timeLog, setTimeLog] = useState<TimeLog>(() => loadTimeLog(subjects));
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) === "dark");
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => window.matchMedia?.("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark-mode", isDarkMode);
    localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const onAppInstalled = () => {
      installPromptRef.current = null;
      setCanInstall(false);
      setIsInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const installApp = async () => {
    const promptEvent = installPromptRef.current;
    if (!promptEvent) {
      setShowInstallGuide(true);
      return;
    }
    await promptEvent.prompt();
    await promptEvent.userChoice;
    installPromptRef.current = null;
    setCanInstall(false);
  };

  useEffect(() => {
    localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(subjects));
  }, [subjects]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    setSavedPulse(true);
    const timer = window.setTimeout(() => setSavedPulse(false), 900);
    return () => window.clearTimeout(timer);
  }, [progress]);

  useEffect(() => {
    localStorage.setItem(TIME_LOG_STORAGE_KEY, JSON.stringify(timeLog));
  }, [timeLog]);

  const recordStudySecond = useCallback((subject: Subject) => {
    const today = localDateKey(new Date());
    setTimeLog((current) => ({
      ...current,
      [subject]: { ...current[subject], [today]: (current[subject][today] ?? 0) + 1 },
    }));
  }, []);

  const stats = useMemo(() => {
    let completedTasks = 0;
    let fullyDoneLectures = 0;
    subjects.forEach((subject) => {
      Array.from({ length: subject.lectureCount }, (_, index) => index + 1).forEach((lecture) => {
        const item = progress[subject.name]?.[lecture] ?? { studied: false, solved: false };
        completedTasks += Number(item.studied) + Number(item.solved);
        fullyDoneLectures += Number(item.studied && item.solved);
      });
    });
    return { completedTasks, fullyDoneLectures, totalTasks: subjects.reduce((total, subject) => total + subject.lectureCount * 2, 0) };
  }, [progress, subjects]);

  const visibleSubjects = filter === "all" ? subjects : subjects.filter((subject) => subject.name === filter);

  const subjectStats = (subject: Subject) => {
    const config = subjects.find((item) => item.name === subject);
    const lectureCount = config?.lectureCount ?? 0;
    let completed = 0;
    let finishedLectures = 0;
    let studied = 0;
    let solved = 0;
    Array.from({ length: lectureCount }, (_, index) => index + 1).forEach((lecture) => {
      const item = progress[subject]?.[lecture] ?? { studied: false, solved: false };
      studied += Number(item.studied);
      solved += Number(item.solved);
      completed += Number(item.studied) + Number(item.solved);
      finishedLectures += Number(item.studied && item.solved);
    });
    return { completed, finishedLectures, studied, solved, total: lectureCount * 2 };
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
    const lectureCount = subjects.find((item) => item.name === subject)?.lectureCount ?? 0;
    const shouldComplete = statsForSubject.completed < statsForSubject.total;
    setProgress((current) => ({
      ...current,
      [subject]: Array.from({ length: lectureCount }, (_, index) => index + 1).reduce((lectures, lecture) => {
        lectures[lecture] = { studied: shouldComplete, solved: shouldComplete };
        return lectures;
      }, {} as Record<number, { studied: boolean; solved: boolean }>),
    }));
  };

  const resetProgress = () => {
    if (window.confirm("هل تريد مسح كل التقدم والبدء من جديد؟")) {
      setProgress(createEmptyProgress(subjects));
      setFilter("all");
    }
  };

  const saveSubjectSettings = (nextSubjects: SubjectConfig[]) => {
    const normalized: SubjectConfig[] = [];
    const names = new Set<string>();
    nextSubjects.forEach((subject, index) => {
      const name = subject.name.trim();
      if (!name || names.has(name)) return;
      names.add(name);
      normalized.push({ name, lectureCount: Math.max(1, Math.min(100, Math.floor(subject.lectureCount) || 1)), colorIndex: index });
    });
    if (normalized.length === 0) return;
    const nextProgress = createEmptyProgress(normalized);
    normalized.forEach((subject, index) => {
      const sourceName = progress[subject.name] ? subject.name : subjects[index]?.name;
      const source = sourceName ? progress[sourceName] : undefined;
      if (source) Array.from({ length: subject.lectureCount }, (_, lectureIndex) => lectureIndex + 1).forEach((lecture) => { if (source[lecture]) nextProgress[subject.name][lecture] = source[lecture]; });
    });
    const nextTimeLog = createEmptyTimeLog(normalized);
    normalized.forEach((subject, index) => {
      const sourceName = timeLog[subject.name] ? subject.name : subjects[index]?.name;
      if (sourceName && timeLog[sourceName]) nextTimeLog[subject.name] = timeLog[sourceName];
    });
    setSubjects(normalized);
    setProgress(nextProgress);
    setTimeLog(nextTimeLog);
    if (filter !== "all" && !normalized.some((subject) => subject.name === filter)) setFilter("all");
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
          <div className="topbar-actions">
            {!isInstalled && <button type="button" className="install-button" onClick={installApp} aria-label="إضافة StudyTrack إلى الشاشة الرئيسية" title={canInstall ? "تثبيت التطبيق" : "طريقة إضافة التطبيق للشاشة الرئيسية"}><Download size={15} /><span>ثبّت التطبيق</span></button>}
            <button type="button" className="theme-toggle" onClick={() => setIsDarkMode((current) => !current)} aria-label={isDarkMode ? "التبديل للوضع الفاتح" : "التبديل للوضع الداكن"} title={isDarkMode ? "الوضع الفاتح" : "الوضع الداكن"}>{isDarkMode ? <Sun size={16} /> : <Moon size={16} />}<span>{isDarkMode ? "فاتح" : "داكن"}</span></button>
            <div className={`save-state ${savedPulse ? "is-saving" : ""}`}>
              <span className="save-dot" />
              <span>يُحفظ تلقائياً</span>
            </div>
          </div>
        </header>
        {showInstallGuide && <div className="install-guide" role="status"><Download size={16} /><span>من الهاتف افتح قائمة المتصفح ثم اختر «إضافة إلى الشاشة الرئيسية» أو «Install app».</span><button type="button" onClick={() => setShowInstallGuide(false)} aria-label="إغلاق التعليمات">×</button></div>}

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
            <div><span className="stat-label">محاضرات مكتملة</span><strong>{stats.fullyDoneLectures} <small>من {subjects.reduce((total, subject) => total + subject.lectureCount, 0)}</small></strong></div>
          </div>
          <div className="stat-quote"><span>✦</span> الإنجاز الصغير المتكرر يصنع الفرق الكبير.</div>
        </section>

        <SubjectManager subjects={subjects} onSave={saveSubjectSettings} />

        <PomodoroTimer subjects={subjects} onStudySecond={recordStudySecond} />

        <section className="subject-overview" aria-label="نسبة الإنجاز لكل مادة">
          <div className="overview-header"><div><span className="section-kicker">نظرة سريعة</span><h2>تقدم المواد</h2></div><span className="overview-caption">كل خانة مكتملة تقرّبك خطوة</span></div>
          <div className="overview-grid">
            {subjects.map((subject, index) => {
              const subjectProgress = subjectStats(subject.name);
              const completion = percent(subjectProgress.completed, subjectProgress.total);
              return (
                <button key={subject.name} type="button" className={`overview-card ${filter === subject.name ? "selected" : ""}`} onClick={() => setFilter(subject.name)} aria-label={`عرض تقدم مادة ${subject.name}`}>
                  <div className={`overview-symbol ${SUBJECT_COLORS[index % SUBJECT_COLORS.length]}`}>{subject.name.slice(0, 1)}</div>
                  <div className="overview-card-main"><div className="overview-card-top"><span dir="ltr">{subject.name}</span><strong>{completion}%</strong></div><div className="overview-track"><span style={{ width: `${completion}%` }} /></div><div className="overview-card-bottom"><span>{subjectProgress.completed} من {subjectProgress.total} مهمة</span><span>{subjectProgress.finishedLectures}/{subject.lectureCount} محاضرة كاملة</span></div></div>
                </button>
              );
            })}
          </div>
        </section>

        <WeeklyStudyReport subjects={subjects} timeLog={timeLog} />

        <section className="workspace">
          <aside className="subject-sidebar">
            <div className="sidebar-heading"><div><span className="section-kicker">المواد الدراسية</span><h2>خطتك الحالية</h2></div><BookOpen size={20} /></div>
            <nav className="subject-list" aria-label="فلترة المواد">
              <button type="button" className={`subject-filter ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
                <span className="subject-symbol all-symbol"><LayoutGrid size={16} /></span><span className="subject-filter-name">كل المواد</span><span className="filter-count">{subjects.reduce((total, subject) => total + subject.lectureCount, 0)}</span>
              </button>
              {subjects.map((subject, index) => {
                const statsForSubject = subjectStats(subject.name);
                return (
                  <button key={subject.name} type="button" className={`subject-filter ${filter === subject.name ? "active" : ""}`} onClick={() => setFilter(subject.name)}>
                    <span className={`subject-symbol ${SUBJECT_COLORS[index % SUBJECT_COLORS.length]}`}>{subject.name.slice(0, 1)}</span>
                    <span className="subject-filter-body"><span className="subject-filter-name" dir="ltr">{subject.name}</span><span className="mini-progress"><span style={{ width: `${percent(statsForSubject.completed, statsForSubject.total)}%` }} /></span></span>
                    <span className="filter-count">{statsForSubject.finishedLectures}/{subject.lectureCount}</span>
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
                    const statsForSubject = subjectStats(subject.name);
                    return (
                      <Fragment key={subject.name}>
                        <tr className="subject-row"><th colSpan={3}><span className="subject-row-mark">{subject.name.slice(0, 1)}</span><span className="subject-row-name" dir="ltr">{subject.name}</span><span className="subject-row-progress"><span>{statsForSubject.completed}/{statsForSubject.total} مهام</span><span className="group-progress"><span style={{ width: `${percent(statsForSubject.completed, statsForSubject.total)}%` }} /></span></span></th></tr>
                        {Array.from({ length: subject.lectureCount }, (_, index) => index + 1).map((lecture) => {
                          const item = progress[subject.name]?.[lecture] ?? { studied: false, solved: false };
                          return (
                            <tr key={`${subject.name}-${lecture}`} className={item.studied && item.solved ? "lecture-complete" : ""}>
                              <td><span className="lecture-number">{String(lecture).padStart(2, "0")}</span><span className="lecture-name">Lecture {lecture}</span>{item.studied && item.solved && <span className="done-badge">مكتملة</span>}</td>
                              <td><CheckCell checked={item.studied} label={`${subject.name} Lecture ${lecture} مذاكرة`} onClick={() => toggle(subject.name, lecture, "studied")} /></td>
                              <td><CheckCell checked={item.solved} label={`${subject.name} Lecture ${lecture} حل`} onClick={() => toggle(subject.name, lecture, "solved")} /></td>
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
