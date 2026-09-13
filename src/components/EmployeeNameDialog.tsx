import { FormEvent, useState } from "react";
import { Loader2, Save, UserRound } from "lucide-react";
import { validateNickname } from "../lib/employee";
import { updateEmployeeNickname } from "../lib/store";
import { Dialog } from "./stock/ItemFormDialog";

interface Props {
  nickname: string;
  onClose: () => void;
  onSaved: (nickname: string) => void;
}

export default function EmployeeNameDialog({ nickname: initialNickname, onClose, onSaved }: Props) {
  const [nickname, setNickname] = useState(initialNickname);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateNickname(nickname);
    if (validationError) {
      setError(validationError);
      return;
    }

    const nextNickname = nickname.trim();
    setError("");
    setSaving(true);
    try {
      await updateEmployeeNickname(nextNickname);
      onSaved(nextNickname);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกชื่อไม่สำเร็จ");
      setSaving(false);
    }
  }

  const handleClose = () => {
    if (!saving) onClose();
  };

  return (
    <Dialog title="แก้ไขชื่อ" onClose={handleClose}>
      <form className="clock-form employee-name-form" onSubmit={handleSubmit}>
        <label className="field">
          <span><UserRound size={16} /> ชื่อเล่น</span>
          <input
            autoFocus
            autoComplete="nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="เช่น มะลิ"
          />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button className="icon-text-button quiet" type="button" onClick={handleClose} disabled={saving}>ยกเลิก</button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
            {saving ? "กำลังบันทึก..." : "บันทึกชื่อ"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
