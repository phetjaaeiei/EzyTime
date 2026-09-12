import { useCallback, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useAsyncData } from "../lib/useAsyncData";
import { ASSIGNABLE_ROLES, listStaffRoles, setStaffRole, staffRoleLabel, type AssignableRole, type StaffMember } from "../lib/roles";

const CHOICES: (AssignableRole | null)[] = [null, ...ASSIGNABLE_ROLES];

export default function RoleManagementPanel() {
  const load = useCallback(() => listStaffRoles(), []);
  const { data, loading, error, reload } = useAsyncData<StaffMember[]>(load, []);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const trimmed = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (trimmed ? data.filter((member) => `${member.display_name} ${member.email ?? ""}`.toLowerCase().includes(trimmed)) : data),
    [data, trimmed],
  );

  async function change(member: StaffMember, role: AssignableRole | null) {
    if (member.role === role) return;
    setSavingId(member.user_id); setSaveError(""); setMessage("");
    try {
      await setStaffRole(member.user_id, role);
      setMessage(role ? `ตั้ง ${member.display_name} เป็น ${staffRoleLabel(role)} แล้ว` : `ยกเลิกสิทธิ์ของ ${member.display_name} แล้ว`);
      reload();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="admin-layout admin-dashboard-layout" aria-labelledby="role-panel-heading">
      <div className="admin-heading-row admin-dashboard-heading">
        <div>
          <div className="eyebrow-row"><span className="status-dot" />ผู้ดูแลระบบ</div>
          <h1 id="role-panel-heading">สิทธิ์ทีมงาน</h1>
          <p className="muted-copy">ตั้ง CEO หรือ Manager (สิทธิ์เท่า admin ทุกอย่าง) ให้ผู้ใช้ที่เข้าสู่ระบบแล้ว — เฉพาะ admin เท่านั้นที่ตั้งได้</p>
        </div>
        <div className="admin-actions">
          <button className="icon-text-button" type="button" onClick={() => void reload()} disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            รีเฟรช
          </button>
        </div>
      </div>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
      {message ? <p className="muted-copy" role="status">{message}</p> : null}

      <section className="form-panel role-panel" aria-labelledby="role-list-heading">
        <div className="section-heading-row">
          <div>
            <h2 id="role-list-heading">ผู้ใช้ในระบบ</h2>
            <p className="muted-copy">เลือกสิทธิ์ให้แต่ละคน — CEO และ Manager เห็นและจัดการได้เท่า admin (ยกเว้นการตั้งสิทธิ์นี้)</p>
          </div>
          <span className="role-panel-icon" aria-hidden="true"><ShieldCheck size={20} /></span>
        </div>

        {!loading && !error && data.length ? (
          <div className="stock-search">
            <Search size={17} aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อหรืออีเมล…" aria-label="ค้นหาผู้ใช้" />
          </div>
        ) : null}

        {loading ? (
          <div className="skeleton-table" aria-label="กำลังโหลดข้อมูล">{Array.from({ length: 4 }).map((_, i) => <span key={i} />)}</div>
        ) : filtered.length ? (
          <ul className="role-list">
            {filtered.map((member) => (
              <li key={member.user_id} className="role-row">
                <div className="role-identity">
                  <strong>{member.display_name}</strong>
                  {member.email ? <small>{member.email}</small> : null}
                </div>
                <div className="role-actions" role="group" aria-label={`สิทธิ์ของ ${member.display_name}`}>
                  {CHOICES.map((choice) => (
                    <button
                      key={choice ?? "none"}
                      type="button"
                      className={member.role === choice ? "role-choice is-active" : "role-choice"}
                      aria-pressed={member.role === choice}
                      disabled={savingId === member.user_id}
                      onClick={() => void change(member, choice)}
                    >
                      {choice === null ? "ไม่มีสิทธิ์" : staffRoleLabel(choice)}
                    </button>
                  ))}
                  {savingId === member.user_id ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">{trimmed ? "ไม่พบผู้ใช้ที่ค้นหา" : "ยังไม่มีผู้ใช้ที่เข้าสู่ระบบ"}</p>
        )}
      </section>
    </section>
  );
}
