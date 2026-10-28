import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router"
import { PageTitle } from "@/components/ui"
import { useAuth } from "@/app/authContext"
import { loadResource, saveResource } from "@/services/dataSource"
import { supabase } from "@/services/supabase"

export type DbCourse = {
  id: string
  code: string
  title: string
  units: number
  department_name?: string
  description?: string
}

export type ClassScheduleRow = {
  id: string
  code: string
  section: string
  units: number | string
  days: string
  time: string
  campus: string
}

export type CourseBlock = {
  id: string
  courseId?: string
  code: string
  title: string
  units: number | string
  datesHeld: string
  topics: string
  tasks: string
  rows: ClassScheduleRow[]
}

type ClassRowDraft = {
  code: string
  section: string
  campus: string
  startTime: string
  endTime: string
  units: string
  days: string[]
  customDays: string
}

const emptyClassRow: ClassRowDraft = {
  code: "",
  section: "",
  campus: "CONGRESS",
  startTime: "18:30",
  endTime: "21:00",
  units: "5",
  days: ["MON", "THU"],
  customDays: "",
}

const DAYS_OPTIONS = [
  { label: "MON", value: "MON" },
  { label: "TUE", value: "TUE" },
  { label: "WED", value: "WED" },
  { label: "THU", value: "THU" },
  { label: "FRI", value: "FRI" },
  { label: "SAT", value: "SAT" },
  { label: "SUN", value: "SUN" },
]

function formatTime(time: string) {
  if (!time) return ""
  if (time.includes("AM") || time.includes("PM")) return time
  const [hourText, minute] = time.split(":")
  const hour = Number(hourText)
  if (!Number.isInteger(hour) || !minute) return time
  const period = hour >= 12 ? "PM" : "AM"
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minute} ${period}`
}

function getHeldDates(value: string) {
  return value
    .split(",")
    .map((date) => date.trim())
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
}

function formatHeldDate(date: string) {
  const [year, month, day] = date.split("-")
  return `${month}/${day}/${year}`
}

/* ─── Shared Label ─────────────────────────────────────── */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[10.5px] font-bold uppercase tracking-widest mb-1.5"
      style={{ color: "#8fa394" }}
    >
      {children}
    </label>
  )
}

/* ─── Section Card ──────────────────────────────────────── */
function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`bg-white rounded-2xl border p-6 ${className}`}
      style={{
        borderColor: "#e8eeea",
        boxShadow: "0 1px 4px 0 rgba(0,60,30,0.06), 0 0 0 0 transparent",
      }}
    >
      {children}
    </div>
  )
}

/* ─── Section Header ────────────────────────────────────── */
function SectionHeader({
  num,
  title,
  subtitle,
  extra,
  actions,
}: {
  num: string
  title: string
  subtitle?: string
  extra?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-xl text-white font-black flex items-center justify-center text-[11px] tracking-wide flex-shrink-0 shadow-sm"
          style={{
            background: "linear-gradient(135deg,#009668 0%,#00b87a 100%)",
          }}
        >
          {num}
        </div>

        <div
          className="h-8 w-px self-stretch"
          style={{ background: "#e8eeea" }}
        />
        <div>
          <div className="flex items-center gap-2.5">
            <h2
              className="text-[14.5px] font-bold"
              style={{ color: "#111c14" }}
            >
              {title}
            </h2>
            {extra}
          </div>
          {subtitle && (
            <p className="text-[11.5px] mt-0.5" style={{ color: "#8fa394" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

const inputCls =
  "w-full h-11 px-3.5 rounded-xl border text-[13.5px] font-medium outline-none transition-colors bg-[#fafbfa]"
const inputStyle = { borderColor: "#e8eeea", color: "#111c14" }

export default function ProfSubmit() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [recordType, setRecordType] = useState("Accomplishment Report (AR)")
  const [period, setPeriod] = useState("September Cycle 1")
  const [facultyName, setFacultyName] = useState(user.name.toUpperCase())
  const [facultyNumber, setFacultyNumber] = useState("")
  const [college, setCollege] = useState("COLLEGE OF LIBERAL ARTS AND SCIENCES")

  // Database courses state
  const [availableCourses, setAvailableCourses] = useState<DbCourse[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false)

  // Course blocks in report
  const [courses, setCourses] = useState<CourseBlock[]>([
    {
      id: "course-1",
      code: "CC 116",
      title: "ADVANCED WEB SYSTEMS AND TECHNOLOGIES",
      units: 5,
      datesHeld: "2026-08-21,2026-08-23,2026-08-30",
      topics: "DESIGNING LOG IN MODAL",
      tasks: "",
      rows: [
        {
          id: "row-1",
          code: "CC 116",
          section: "BSCS 3-B",
          units: 5,
          days: "MON | THU",
          time: "6:30 – 9:00 PM | 6:30 – 9:00 PM",
          campus: "CONGRESS",
        },
      ],
    },
  ])

  // Class modal state
  const [classModalCourseId, setClassModalCourseId] = useState<string | null>(null)
  const [classRowDraft, setClassRowDraft] = useState<ClassRowDraft>(emptyClassRow)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)

  // File & notes
  const [notes, setNotes] = useState("")
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  /* ── 1. Fetch available courses and professor info from DB ── */
  useEffect(() => {
    let isCancelled = false

    async function loadData() {
      setLoadingCourses(true)
      let fetchedCourses: DbCourse[] = []

      // A. Try API endpoint
      try {
        const res = await loadResource<DbCourse[]>(
          `/professor/courses?email=${encodeURIComponent(user.email)}`,
          []
        )
        if (Array.isArray(res) && res.length > 0) {
          fetchedCourses = res
        }
      } catch (err) {
        console.warn("Could not load from /professor/courses:", err)
      }

      // B. If empty, try Supabase directly
      if (fetchedCourses.length === 0 && supabase) {
        try {
          const { data, error } = await supabase
            .from("curriculum_courses")
            .select("id, code, title, units, department_name, description")
            .eq("is_active", true)
            .order("code", { ascending: true })

          if (!error && Array.isArray(data) && data.length > 0) {
            fetchedCourses = data
          }
        } catch (sbErr) {
          console.warn("Supabase curriculum fallback error:", sbErr)
        }
      }

      // C. Fallback seeded courses if offline / demo
      if (fetchedCourses.length === 0) {
        fetchedCourses = [
          {
            id: "course-cc116",
            code: "CC 116",
            title: "ADVANCED WEB SYSTEMS AND TECHNOLOGIES",
            units: 5,
            department_name: "Computer Studies Department",
            description: "Advanced client-server architectures and modern web frameworks.",
          },
          {
            id: "course-cc105",
            code: "CC 105",
            title: "INFORMATION MANAGEMENT",
            units: 3,
            department_name: "Computer Studies Department",
            description: "Database design and information system architectures.",
          },
        ]
      }

      if (!isCancelled) {
        setAvailableCourses(fetchedCourses)
        setLoadingCourses(false)

        // Pre-fill initial course block from first available DB course if not already customized
        setCourses((prev) => {
          if (prev.length > 0 && prev[0].title && prev[0].title !== "ADVANCED WEB SYSTEMS AND TECHNOLOGIES") {
            return prev
          }
          const matched =
            fetchedCourses.find((c) => c.code.toLowerCase().includes("cc 116")) ||
            fetchedCourses[0]
          if (!matched) return prev

          return [
            {
              id: "course-1",
              courseId: matched.id,
              code: matched.code,
              title: matched.title,
              units: matched.units,
              datesHeld: "2026-08-21,2026-08-23,2026-08-30",
              topics: "",
              tasks: "",
              rows: [
                {
                  id: "row-1",
                  code: matched.code,
                  section: "BSCS 3-B",
                  units: matched.units,
                  days: "MON | THU",
                  time: "6:30 – 9:00 PM | 6:30 – 9:00 PM",
                  campus: "CONGRESS",
                },
              ],
            },
          ]
        })
      }
    }

    loadData()

    // Also fetch professor profile details
    async function loadProfessorProfile() {
      try {
        if (supabase) {
          const { data } = await supabase
            .from("user_professors")
            .select("employee_id, department, firstname, lastname")
            .or(`email.eq.${user.email},id.eq.${user.id}`)
            .limit(1)
            .maybeSingle()

          if (data && !isCancelled) {
            if (data.employee_id) setFacultyNumber(data.employee_id)
            if (data.department) setCollege(data.department.toUpperCase())
            if (data.firstname && data.lastname) {
              setFacultyName(`${data.firstname} ${data.lastname}`.toUpperCase())
            }
          }
        }
      } catch (err) {
        console.warn("Could not load professor profile:", err)
      }
    }

    loadProfessorProfile()

    return () => {
      isCancelled = true
    }
  }, [user.email, user.id])

  /* ── 2. Filter courses user can add ("you can't add a course if you're not in it") ── */
  const unaddedCourses = useMemo(() => {
    return availableCourses.filter(
      (dbC) => !courses.some((c) => c.code.trim().toUpperCase() === dbC.code.trim().toUpperCase())
    )
  }, [availableCourses, courses])

  /* ── 3. Course actions ── */
  const handleAddCourseFromDb = (course: DbCourse) => {
    const newBlock: CourseBlock = {
      id: `course_${Date.now()}`,
      courseId: course.id,
      code: course.code,
      title: course.title,
      units: course.units,
      datesHeld: "",
      topics: "",
      tasks: "",
      rows: [
        {
          id: `row_${Date.now()}`,
          code: course.code,
          section: "",
          units: course.units,
          days: "MON | THU",
          time: "6:30 – 9:00 PM",
          campus: "CONGRESS",
        },
      ],
    }
    setCourses((prev) => [...prev, newBlock])
    setIsAddCourseModalOpen(false)
  }

  const handleDeleteCourse = (courseId: string) => {
    if (courses.length <= 1) return
    setCourses((prev) => prev.filter((c) => c.id !== courseId))
  }

  const updateCourseField = (
    courseId: string,
    field: "title" | "datesHeld" | "topics" | "tasks",
    value: string
  ) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, [field]: value } : c))
    )
  }

  /* ── 4. Class Schedule Row actions ── */
  const openClassRowModal = (courseId: string, existingRow?: ClassScheduleRow) => {
    const targetCourse = courses.find((c) => c.id === courseId)
    if (existingRow) {
      setEditingRowId(existingRow.id)
      const dayArr = existingRow.days.split("|").map((d) => d.trim().toUpperCase())
      setClassRowDraft({
        code: existingRow.code || targetCourse?.code || "",
        section: existingRow.section || "",
        campus: existingRow.campus || "CONGRESS",
        startTime: "18:30",
        endTime: "21:00",
        units: String(existingRow.units || targetCourse?.units || 3),
        days: dayArr,
        customDays: existingRow.days,
      })
    } else {
      setEditingRowId(null)
      setClassRowDraft({
        ...emptyClassRow,
        code: targetCourse?.code || "",
        units: String(targetCourse?.units || 5),
        campus: "CONGRESS",
      })
    }
    setClassModalCourseId(courseId)
  }

  const closeClassRowModal = () => {
    setClassModalCourseId(null)
    setEditingRowId(null)
  }

  const saveClassRow = () => {
    if (!classModalCourseId) return
    const daysStr =
      classRowDraft.days.length > 0
        ? classRowDraft.days.join(" | ")
        : classRowDraft.customDays.trim() || "MON | THU"

    const timeStartFormatted = formatTime(classRowDraft.startTime)
    const timeEndFormatted = formatTime(classRowDraft.endTime)
    const timeStr =
      classRowDraft.days.length > 1
        ? `${timeStartFormatted} – ${timeEndFormatted} | ${timeStartFormatted} – ${timeEndFormatted}`
        : `${timeStartFormatted} – ${timeEndFormatted}`

    setCourses((prev) =>
      prev.map((c) => {
        if (c.id !== classModalCourseId) return c
        if (editingRowId) {
          return {
            ...c,
            rows: c.rows.map((r) =>
              r.id === editingRowId
                ? {
                    ...r,
                    code: classRowDraft.code.trim().toUpperCase(),
                    section: classRowDraft.section.trim().toUpperCase(),
                    units: Number(classRowDraft.units) || c.units,
                    days: daysStr,
                    time: timeStr,
                    campus: classRowDraft.campus.trim().toUpperCase(),
                  }
                : r
            ),
          }
        } else {
          const newRow: ClassScheduleRow = {
            id: `row_${Date.now()}`,
            code: classRowDraft.code.trim().toUpperCase(),
            section: classRowDraft.section.trim().toUpperCase(),
            units: Number(classRowDraft.units) || c.units,
            days: daysStr,
            time: timeStr,
            campus: classRowDraft.campus.trim().toUpperCase(),
          }
          return { ...c, rows: [...c.rows, newRow] }
        }
      })
    )
    closeClassRowModal()
  }

  const handleDeleteRow = (courseId: string, rowId: string) => {
    setCourses((prev) =>
      prev.map((c) => {
        if (c.id !== courseId) return c
        return { ...c, rows: c.rows.filter((r) => r.id !== rowId) }
      })
    )
  }

  /* ── 5. Form submission ── */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)

    const kind = recordType.startsWith("Accomplishment") ? "AR" : "DTR"
    const reference = `${kind}-${Date.now()}`
    const now = new Date().toLocaleString()

    const combinedTopics = courses
      .map((c) => (c.topics ? `${c.code}: ${c.topics}` : ""))
      .filter(Boolean)
      .join(" · ")
    const combinedTasks = courses
      .map((c) => (c.tasks ? `${c.code}: ${c.tasks}` : ""))
      .filter(Boolean)
      .join(" · ")

    const record = {
      id: reference,
      type: kind,
      period,
      units: `${courses.length} course${courses.length === 1 ? "" : "s"}`,
      submitted: now,
      status: "Pending",
      stage: "Checker",
      currentStage: "Checker",
      stage_key: "AR-AP-STG-1",
      approval_stage: "AR-AP-STG-1",
      stage_order: 1,
      email: user?.email,
      facultyEmail: user?.email,
      facultyName: facultyName || user?.name || "Faculty",
      facultyNumber: facultyNumber || "—",
      event: `${kind} submitted · ${period}`,
      record: {
        period,
        reference,
        email: user?.email,
        facultyEmail: user?.email,
        facultyName: facultyName || user?.name || "Faculty",
        facultyNumber,
        college,
        tables: courses.map((course) => ({
          title: course.title,
          meta: course.datesHeld,
          datesHeld: course.datesHeld,
          topics: course.topics,
          tasks: course.tasks,
          columns: ["Code", "Program, Year & Section", "Units", "Days", "Time", "Campus"],
          rows: course.rows.map((row) => [
            row.code,
            row.section,
            row.units,
            row.days,
            row.time,
            row.campus,
          ]),
        })),
        topics: combinedTopics || "Course syllabus alignment and lecture execution",
        tasks: combinedTasks || "Lecture and Discussion, Activity",
        notes,
        attachment: uploadedFile ?? undefined,
        reviewer: "Faculty Checker",
        reviewedAt: now,
        remark: "Received and queued for review.",
      },
    }

    try {
      // Submit directly to accomplishment_reports (and report_entries)
      await saveResource("/professor/accomplishment-reports", record)
      navigate("/prof/history")
    } catch (reason) {
      try {
        await saveResource("/professor/submissions", record)
        navigate("/prof/history")
      } catch (fallbackErr) {
        setSubmitError(reason instanceof Error ? reason.message : "Unable to submit this record.")
        setIsSubmitting(false)
      }
    }
  }

  return (
    <div className="pb-32 max-w-[1180px] mx-auto">
      <PageTitle
        title="Submit Record"
        subtitle="File an Accomplishment Report (AR) or DTR for the current cycle."
      />

      {submitError && (
        <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px] flex items-center justify-between">
          <span>{submitError}</span>
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="text-red-500 hover:text-red-700 text-sm font-bold"
          >
            ✕
          </button>
        </div>
      )}

      <form
        id="submit-form"
        onSubmit={handleSubmit}
        className="space-y-6"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        {/* ── SECTION 01: Record Information ── */}
        <SectionCard>
          <SectionHeader
            num="01"
            title="Record Information"
            subtitle="Choose the type of record and the submission cycle."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Record Type</FieldLabel>
              <select
                value={recordType}
                onChange={(e) => setRecordType(e.target.value)}
                className={inputCls}
                style={inputStyle}
              >
                <option>Accomplishment Report (AR)</option>
                <option>Daily Time Record (DTR)</option>
              </select>
            </div>
            <div>
              <FieldLabel>Period</FieldLabel>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className={inputCls}
                style={inputStyle}
              >
                <option>September Cycle 1</option>
                <option>September Cycle 2</option>
                <option>October Cycle 1</option>
                <option>October Cycle 2</option>
                <option>November Cycle 1</option>
              </select>
            </div>
          </div>
        </SectionCard>

        {/* ── SECTION 02: Faculty Information ── */}
        <SectionCard>
          <SectionHeader
            num="02"
            title="Faculty Information"
            subtitle="Shared instructor information applied to all course entries."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.6fr_0.75fr_2fr]">
            <div>
              <FieldLabel>Faculty Name</FieldLabel>
              <input
                type="text"
                required
                value={facultyName}
                onChange={(e) => setFacultyName(e.target.value)}
                className={inputCls + " uppercase"}
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>Faculty #</FieldLabel>
              <input
                type="text"
                placeholder="e.g. P00001"
                value={facultyNumber}
                onChange={(e) => setFacultyNumber(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>College / Department</FieldLabel>
              <input
                type="text"
                value={college}
                onChange={(e) => setCollege(e.target.value)}
                className={inputCls + " uppercase"}
                style={inputStyle}
              />
            </div>
          </div>
        </SectionCard>

        {/* ── SECTION 03+: Course Blocks (Exact match to Photo Format) ── */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-bold text-[#111c14]">
                  Teaching Load Courses ({courses.length})
                </h3>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#f0faf5] text-[#009668] border border-[#a3d9bc]">
                  Database Connected
                </span>
              </div>
              <p className="text-[12px] text-[#8fa394] mt-0.5">
                Each course includes schedule rows, held dates, and discussed topics.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#a3d9bc] bg-[#f0faf5] px-3 py-2 text-[11.5px] font-semibold text-[#007a55]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 flex-shrink-0">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Click the highlighted fields to edit your teaching load details.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAddCourseModalOpen(true)}
              className="px-4 py-2 rounded-xl text-[12.5px] font-bold flex items-center gap-2 transition-all shadow-sm hover:shadow active:scale-98"
              style={{
                background: "linear-gradient(135deg, #009668 0%, #00b87a 100%)",
                color: "#ffffff",
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Course ({unaddedCourses.length} available)
            </button>
          </div>

          {courses.map((course, idx) => (
            <div
              key={course.id}
              className="bg-white rounded-2xl border p-6 transition-all"
              style={{
                borderColor: "#a3d9bc",
                boxShadow: "0 2px 8px 0 rgba(0,30,15,0.06)",
              }}
            >
              {/* Course Top Bar */}
              <div className="flex items-center justify-between pb-4 border-b border-[#eef2ef] mb-5">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-[#009668] text-white text-[12px] font-black flex items-center justify-center">
                    0{idx + 3}
                  </span>
                  <div>
                    <h4 className="text-[14px] font-bold text-[#111c14] tracking-wide">
                      COURSE {idx + 1} · {course.code}
                    </h4>
                    <p className="text-[11.5px] text-[#718576]">
                      {course.units} Units · {course.rows.length} class section{course.rows.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[#f0faf5] px-2.5 py-1.5 text-[11px] font-bold text-[#009668]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    Editable
                  </span>
                  <button
                    type="button"
                    onClick={() => openClassRowModal(course.id)}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-bold border border-[#009668] text-[#009668] hover:bg-[#f0faf5] transition-colors flex items-center gap-1.5"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-3.5 h-3.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Class Row
                  </button>

                  {courses.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCourse(course.id)}
                      className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors"
                      title="Remove Course"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* ── Table 1: Official Header & Schedule Grid (Photo Format) ── */}
              <div className="overflow-x-auto">
                <table
                  className="w-full border-collapse"
                  style={{
                    border: "1.5px solid #111c14",
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}
                >
                  <tbody>
                    {/* Top Row: COURSE [N] | [COURSE TITLE] */}
                    <tr>
                      <td
                        style={{ border: "1.5px solid #111c14" }}
                        className="w-40 sm:w-44 px-4 py-3.5 text-center font-black text-[13px] tracking-wider uppercase bg-[#fafbfa] text-[#111c14]"
                      >
                        COURSE {idx + 1}
                      </td>
                      <td
                        colSpan={5}
                        style={{ border: "1.5px solid #111c14" }}
                        className="px-4 py-3.5 font-bold text-[13.5px] sm:text-[14px] tracking-wide uppercase bg-white text-[#111c14]"
                      >
                        {course.title}
                      </td>
                    </tr>

                    {/* Column Headers Row */}
                    <tr className="bg-[#fafbfa]">
                      <th
                        style={{ border: "1px solid #111c14" }}
                        className="w-24 px-3 py-2.5 text-center text-[12px] font-bold text-[#111c14]"
                      >
                        Code
                      </th>
                      <th
                        style={{ border: "1px solid #111c14" }}
                        className="px-3 py-2.5 text-center text-[12px] font-bold text-[#111c14]"
                      >
                        Program, Year &amp; Section
                      </th>
                      <th
                        style={{ border: "1px solid #111c14" }}
                        className="w-20 px-3 py-2.5 text-center text-[12px] font-bold text-[#111c14]"
                      >
                        Units
                      </th>
                      <th
                        style={{ border: "1px solid #111c14" }}
                        className="w-32 px-3 py-2.5 text-center text-[12px] font-bold text-[#111c14]"
                      >
                        Days
                      </th>
                      <th
                        style={{ border: "1px solid #111c14" }}
                        className="px-3 py-2.5 text-center text-[12px] font-bold text-[#111c14]"
                      >
                        Time
                      </th>
                      <th
                        style={{ border: "1px solid #111c14" }}
                        className="w-32 px-3 py-2.5 text-center text-[12px] font-bold text-[#111c14]"
                      >
                        Campus
                      </th>
                    </tr>

                    {/* Data Rows */}
                    {course.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          style={{ border: "1px solid #111c14" }}
                          className="text-center py-6 text-[12.5px] text-gray-500 bg-[#fefefe]"
                        >
                          No class section schedule added yet. Click &quot;Add Class Row&quot; above to add one.
                        </td>
                      </tr>
                    ) : (
                      course.rows.map((row) => (
                        <tr key={row.id} className="group hover:bg-[#fbfcfb] transition-colors">
                          <td
                            style={{ border: "1px solid #111c14" }}
                            className="px-3 py-3 text-center text-[12.5px] font-bold text-[#111c14]"
                          >
                            {row.code}
                          </td>
                          <td
                            style={{ border: "1px solid #111c14" }}
                            className="px-3 py-3 text-center text-[12.5px] font-semibold text-[#111c14]"
                          >
                            {row.section}
                          </td>
                          <td
                            style={{ border: "1px solid #111c14" }}
                            className="px-3 py-3 text-center text-[12.5px] font-semibold text-[#111c14]"
                          >
                            {row.units}
                          </td>
                          <td
                            style={{ border: "1px solid #111c14" }}
                            className="px-3 py-3 text-center text-[12.5px] font-bold text-[#111c14] tracking-wide"
                          >
                            {row.days}
                          </td>
                          <td
                            style={{ border: "1px solid #111c14" }}
                            className="px-3 py-3 text-center text-[12px] font-medium text-[#111c14]"
                          >
                            {row.time}
                          </td>
                          <td
                            style={{ border: "1px solid #111c14" }}
                            className="px-3 py-3 text-center text-[12.5px] font-bold uppercase text-[#111c14]"
                          >
                            <div className="flex items-center justify-center gap-1.5">
                              <span>{row.campus}</span>
                              <div className="ml-1 flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openClassRowModal(course.id, row)}
                                  className="rounded p-0.5 text-[#009668] hover:bg-[#eaf4ee]"
                                  title="Edit row"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRow(course.id, row.id)}
                                  className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                                  title="Remove row"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}

                    {/* Classes held Row (Full width span) */}
                    <tr>
                      <td
                        colSpan={6}
                        style={{ border: "1.5px solid #111c14" }}
                        className="px-4 py-3 bg-[#fafbfa]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[12.5px] text-[#111c14] whitespace-nowrap">
                            Classes held:
                          </span>
                          <input
                            type="date"
                            value=""
                            aria-label={`Add a class date for ${course.code}`}
                            onChange={(e) =>
                              e.target.value &&
                              updateCourseField(
                                course.id,
                                "datesHeld",
                                [...new Set([...getHeldDates(course.datesHeld), e.target.value])]
                                  .sort()
                                  .join(",")
                              )
                            }
                            className="rounded-md border border-dashed border-[#a3d9bc] bg-[#f8fdf9] px-2 py-1 text-[12.5px] font-semibold text-[#111c14] outline-none transition-colors focus:border-[#009668] focus:bg-white"
                          />
                          <span className="text-[11.5px] font-medium text-[#718576]">
                            Select each date from the calendar
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {getHeldDates(course.datesHeld).map((date) => (
                              <span
                                key={date}
                                className="inline-flex items-center gap-1 rounded-md border border-[#a3d9bc] bg-[#f0faf5] px-2 py-1 text-[11.5px] font-semibold text-[#007a55]"
                              >
                                {formatHeldDate(date)}
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateCourseField(
                                      course.id,
                                      "datesHeld",
                                      getHeldDates(course.datesHeld)
                                        .filter((heldDate) => heldDate !== date)
                                        .join(",")
                                    )
                                  }
                                  className="rounded text-[#718576] hover:bg-white hover:text-red-500"
                                  aria-label={`Remove ${formatHeldDate(date)}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ── Table 2: Topics Discussed & Task/Activity Description (Photo Format) ── */}
              <div className="mt-4 overflow-x-auto">
                <table
                  className="w-full border-collapse"
                  style={{
                    border: "1.5px solid #111c14",
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{ border: "1px solid #111c14" }}
                        className="w-48 sm:w-56 px-4 py-3 text-[12.5px] font-bold text-[#111c14] bg-[#fafbfa] align-top"
                      >
                        Topics Discussed
                      </td>
                      <td
                        style={{ border: "1px solid #111c14" }}
                        className="px-4 py-2.5 text-[13px] text-[#111c14] bg-white"
                      >
                        <input
                          type="text"
                          value={course.topics}
                          placeholder="e.g. DESIGNING LOG IN MODAL"
                          onChange={(e) =>
                            updateCourseField(course.id, "topics", e.target.value)
                          }
                          className="w-full rounded-md border border-dashed border-[#a3d9bc] bg-[#f8fdf9] px-2 py-1 font-bold uppercase tracking-wide text-[#111c14] outline-none placeholder:normal-case placeholder:font-normal placeholder:text-gray-400 focus:border-[#009668] focus:bg-white"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{ border: "1px solid #111c14" }}
                        className="w-48 sm:w-56 px-4 py-3 text-[12.5px] font-bold text-[#111c14] bg-[#fafbfa] align-top"
                      >
                        Task/Activity Description
                      </td>
                      <td
                        style={{ border: "1px solid #111c14" }}
                        className="px-4 py-2.5 text-[13px] text-[#111c14] bg-white"
                      >
                        <input
                          type="text"
                          value={course.tasks}
                          placeholder="e.g. Lecture and Discussion, Activity"
                          onChange={(e) =>
                            updateCourseField(course.id, "tasks", e.target.value)
                          }
                          className="w-full rounded-md border border-dashed border-[#a3d9bc] bg-[#f8fdf9] px-2 py-1 font-medium text-[#111c14] outline-none placeholder:text-gray-400 focus:border-[#009668] focus:bg-white"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Add Course Button */}
          <button
            type="button"
            onClick={() => setIsAddCourseModalOpen(true)}
            className="w-full py-4 rounded-2xl border-2 border-dashed font-bold text-[13px] transition-all flex items-center justify-center gap-2 hover:bg-[#f0faf5] hover:border-[#009668] active:scale-[0.995]"
            style={{ borderColor: "#a3d9bc", color: "#009668" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Course Subject Block ({unaddedCourses.length} available from your load)
          </button>
        </div>

        {/* ── SECTIONS 04 & 05: Supporting Documents & Notes ── */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <SectionCard>
            <SectionHeader
              num="04"
              title="Supporting Attachment"
              subtitle="Upload syllabus, meeting attendance, or proof of class."
            />
            <div
              onClick={() => setUploadedFile("Accomplishment_Report_Docs_Sept.pdf")}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragOver(true)
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragOver(false)
                if (e.dataTransfer.files[0]) {
                  setUploadedFile(e.dataTransfer.files[0].name)
                }
              }}
              className="rounded-xl border-2 border-dashed p-7 flex flex-col items-center justify-center cursor-pointer transition-all select-none"
              style={{
                borderColor: isDragOver ? "#009668" : "#cad5cc",
                background: isDragOver ? "#eaf4ee" : uploadedFile ? "#f0faf5" : "#fafbfa",
              }}
            >
              {uploadedFile ? (
                <>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2 bg-[#d4f0e4]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#009668" strokeWidth="2" className="w-5 h-5">
                      <path d="M9 12l2 2 4-4" />
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  </div>
                  <p className="text-[13px] font-bold text-[#009668]">{uploadedFile}</p>
                  <p className="text-[11px] mt-1 text-[#8fa394]">Click to replace attached document</p>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2 bg-[#eaf4ee]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#009668" strokeWidth="2" className="w-5 h-5">
                      <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                  </div>
                  <p className="text-[13px] font-semibold text-[#3d4a41]">Browse or drag proof files here</p>
                  <p className="text-[11px] mt-1 text-[#8fa394]">PDF · DOCX · XLS · XLSX · JPG · PNG</p>
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard>
            <SectionHeader
              num="05"
              title="Remarks &amp; Notes"
              subtitle="Optional memo for the department checker &amp; HR officer."
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="Provide any additional clarifications, make-up classes, or notes..."
              className="w-full p-4 rounded-xl border text-[13px] leading-relaxed outline-none transition-colors resize-none placeholder:text-gray-300"
              style={{
                borderColor: "#e8eeea",
                color: "#3d4a41",
                background: "#fafbfa",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#009668")}
              onBlur={(e) => (e.target.style.borderColor = "#e8eeea")}
            />
          </SectionCard>
        </div>
      </form>

      {/* ── MODAL 1: Add Course from DB ("you can't add a course if you're not in it") ── */}
      {isAddCourseModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddCourseModalOpen(false)
          }}
        >
          <div className="w-full max-w-[540px] rounded-2xl bg-white p-6 shadow-2xl border border-[#cad5cc] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-[16px] font-bold text-[#111c14]">
                  Add Course from Your Teaching Load
                </h3>
                <p className="text-[12px] text-[#718576] mt-0.5">
                  You can only file records for courses assigned to your department load.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCourseModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-[20px] leading-none"
              >
                ✕
              </button>
            </div>

            {loadingCourses ? (
              <div className="py-8 text-center text-[13px] text-gray-500">
                Fetching your assigned courses from the database...
              </div>
            ) : availableCourses.length === 0 ? (
              <div className="py-6 text-center text-[13px] text-gray-500 bg-gray-50 rounded-xl">
                No active courses assigned to your department in the curriculum catalog.
              </div>
            ) : unaddedCourses.length === 0 ? (
              <div className="py-6 px-4 text-center rounded-xl bg-[#f0faf5] border border-[#a3d9bc]">
                <p className="text-[13px] font-bold text-[#009668]">
                  All Assigned Courses Already Added
                </p>
                <p className="text-[12px] text-[#4b6a55] mt-1">
                  All {availableCourses.length} courses in your assigned load are currently part of this report. You cannot add courses that are not assigned to you.
                </p>
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto space-y-2.5 pr-1">
                {availableCourses.map((dbC) => {
                  const isAdded = courses.some(
                    (c) => c.code.trim().toUpperCase() === dbC.code.trim().toUpperCase()
                  )
                  return (
                    <div
                      key={dbC.id || dbC.code}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                        isAdded
                          ? "bg-gray-50 border-gray-200 opacity-60"
                          : "bg-white border-[#cad5cc] hover:border-[#009668] hover:bg-[#fbfdfc]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#eaf4ee] text-[#009668] border border-[#a3d9bc]">
                            {dbC.code}
                          </span>
                          <span className="text-[11px] font-semibold text-gray-500">
                            {dbC.units} Units
                          </span>
                        </div>
                        <h4 className="text-[13px] font-bold text-[#111c14] mt-1 truncate">
                          {dbC.title}
                        </h4>
                        {dbC.department_name && (
                          <p className="text-[11px] text-[#718576] truncate">
                            {dbC.department_name}
                          </p>
                        )}
                      </div>

                      {isAdded ? (
                        <span className="text-[11px] font-bold text-gray-400 px-3 py-1.5 rounded-lg bg-gray-100 whitespace-nowrap">
                          Added
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddCourseFromDb(dbC)}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-[#009668] text-white hover:bg-[#008059] transition-colors whitespace-nowrap active:scale-95"
                        >
                          + Add Course
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-5 pt-3 border-t border-[#eef2ef] flex justify-end">
              <button
                type="button"
                onClick={() => setIsAddCourseModalOpen(false)}
                className="px-4 py-2 rounded-xl text-[12px] font-semibold text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Add / Edit Class Row ── */}
      {classModalCourseId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeClassRowModal()
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-class-title"
            onKeyDown={(e) => e.key === "Escape" && closeClassRowModal()}
            className="w-full max-w-[460px] rounded-2xl bg-white p-6 shadow-2xl border border-[#cad5cc]"
          >
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h3 id="add-class-title" className="text-[15px] font-bold text-[#111c14]">
                  {editingRowId ? "Edit Class Section Row" : "Add Class Section Row"}
                </h3>
                <p className="text-[11.5px] text-[#718576]">
                  Enter section, schedule days, time, and campus.
                </p>
              </div>
              <button
                type="button"
                onClick={closeClassRowModal}
                className="text-gray-400 hover:text-gray-700 text-[20px] leading-none"
              >
                ✕
              </button>
            </header>

            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                  Course Code
                  <input
                    readOnly
                    value={classRowDraft.code}
                    className="mt-1 block h-9 w-full rounded-xl border px-3 text-[12px] font-bold uppercase bg-gray-50 border-[#cad5cc] text-[#111c14] cursor-not-allowed"
                  />
                </label>

                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                  Units
                  <input
                    type="number"
                    min="1"
                    value={classRowDraft.units}
                    onChange={(e) =>
                      setClassRowDraft({ ...classRowDraft, units: e.target.value })
                    }
                    className="mt-1 block h-9 w-full rounded-xl border px-3 text-[12px] font-medium border-[#cad5cc] text-[#111c14] outline-none focus:border-[#009668]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                  Program, Year &amp; Section
                  <input
                    autoFocus
                    required
                    placeholder="e.g. BSCS 3-B"
                    value={classRowDraft.section}
                    onChange={(e) =>
                      setClassRowDraft({ ...classRowDraft, section: e.target.value })
                    }
                    className="mt-1 block h-9 w-full rounded-xl border px-3 text-[12px] font-medium uppercase border-[#cad5cc] text-[#111c14] outline-none focus:border-[#009668]"
                  />
                </label>

                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                  Campus
                  <select
                    value={classRowDraft.campus}
                    onChange={(e) =>
                      setClassRowDraft({ ...classRowDraft, campus: e.target.value })
                    }
                    className="mt-1 block h-9 w-full rounded-xl border px-3 text-[12px] font-medium uppercase border-[#cad5cc] text-[#111c14] outline-none focus:border-[#009668] bg-white"
                  >
                    <option value="CONGRESS">CONGRESS</option>
                    <option value="SOUTH">SOUTH</option>
                    <option value="CAMARIN">CAMARIN</option>
                    <option value="BAGONG SILANG">BAGONG SILANG</option>
                  </select>
                </label>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e] mb-1.5">
                  Schedule Days
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS_OPTIONS.map((day) => {
                    const isSelected = classRowDraft.days.includes(day.value)
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => {
                          const nextDays = isSelected
                            ? classRowDraft.days.filter((d) => d !== day.value)
                            : [...classRowDraft.days, day.value]
                          setClassRowDraft({ ...classRowDraft, days: nextDays })
                        }}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                          isSelected
                            ? "bg-[#009668] text-white shadow-xs"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {day.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                  Time Start
                  <input
                    required
                    type="time"
                    value={classRowDraft.startTime}
                    onChange={(e) =>
                      setClassRowDraft({ ...classRowDraft, startTime: e.target.value })
                    }
                    className="mt-1 block h-9 w-full rounded-xl border px-3 text-[12px] font-medium border-[#cad5cc] text-[#111c14] outline-none focus:border-[#009668]"
                  />
                </label>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                  Time End
                  <input
                    required
                    type="time"
                    value={classRowDraft.endTime}
                    onChange={(e) =>
                      setClassRowDraft({ ...classRowDraft, endTime: e.target.value })
                    }
                    className="mt-1 block h-9 w-full rounded-xl border px-3 text-[12px] font-medium border-[#cad5cc] text-[#111c14] outline-none focus:border-[#009668]"
                  />
                </label>
              </div>
            </div>

            <footer className="mt-5 flex justify-end gap-2 border-t border-[#f0f4f1] pt-4">
              <button
                type="button"
                onClick={closeClassRowModal}
                className="px-4 py-2 rounded-xl text-[12px] font-semibold text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveClassRow}
                disabled={!classRowDraft.section.trim()}
                className="rounded-xl px-5 py-2 text-[12px] font-bold text-white transition-opacity disabled:opacity-50"
                style={{ background: "#009668" }}
              >
                {editingRowId ? "Save Changes" : "Add Row"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {/* ── STICKY FOOTER ── */}
      <div
        className="fixed bottom-0 left-64 right-0 z-30 px-8 py-4 flex items-center justify-between"
        style={{
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid #e8eeea",
          boxShadow: "0 -2px 16px 0 rgba(0,60,30,0.07)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full animate-pulse bg-[#009668]" />
          <span className="text-[12.5px] font-semibold text-[#009668]">
            Draft automatically synchronized
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/prof")}
            className="px-5 py-2.5 rounded-xl border text-[13px] font-semibold transition-all hover:bg-[#f7f9f8] active:scale-[0.98]"
            style={{ borderColor: "#e8eeea", color: "#5a6b5e" }}
          >
            Cancel
          </button>

          <button
            type="submit"
            form="submit-form"
            disabled={isSubmitting || courses.length === 0}
            className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all flex items-center gap-2 active:scale-[0.98] disabled:opacity-70 shadow-md"
            style={{
              background: isSubmitting
                ? "#5abf97"
                : "linear-gradient(135deg,#009668 0%,#00b87a 100%)",
            }}
          >
            {isSubmitting ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 animate-spin">
                  <circle cx="12" cy="12" r="10" opacity="0.25" />
                  <path d="M12 2a10 10 0 0110 10" />
                </svg>
                Submitting…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Submit Accomplishment Report
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
