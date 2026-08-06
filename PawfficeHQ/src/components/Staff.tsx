import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import "./Staff.css";

type StaffProps = { businessId: string; readOnly?: boolean };

type StaffMember = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  role: string;
  manager_id: string | null;
  is_active: boolean;
  has_login: boolean;
  created_at: string;
};

type StaffForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  role: string;
  managerId: string;
  isActive: boolean;
};

const emptyForm: StaffForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  jobTitle: "",
  role: "staff",
  managerId: "",
  isActive: true,
};

function Staff({ businessId, readOnly = false }: StaffProps) {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadStaff() {
    setLoading(true);
    setErrorMessage("");
    const { data, error } = await supabase.rpc("get_staff_members", {
      p_business_id: businessId,
    });
    if (error) setErrorMessage(error.message);
    setMembers((data as StaffMember[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadStaff();
  }, [businessId]);

  const managerChoices = useMemo(
    () =>
      members.filter((member) => member.is_active && member.id !== editingId),
    [members, editingId],
  );

  function managerName(managerId: string | null) {
    const manager = members.find((member) => member.id === managerId);
    return manager
      ? `${manager.first_name} ${manager.last_name}`
      : "Not assigned";
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setErrorMessage("");
    setShowForm(true);
  }

  function openEdit(member: StaffMember) {
    setEditingId(member.id);
    setForm({
      firstName: member.first_name,
      lastName: member.last_name,
      email: member.email ?? "",
      phone: member.phone ?? "",
      jobTitle: member.job_title ?? "",
      role: member.role,
      managerId: member.manager_id ?? "",
      isActive: member.is_active,
    });
    setErrorMessage("");
    setShowForm(true);
  }

  async function saveStaff(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");

    const shared = {
      p_business_id: businessId,
      p_first_name: form.firstName,
      p_last_name: form.lastName,
      p_email: form.email || null,
      p_phone: form.phone || null,
      p_job_title: form.jobTitle || null,
      p_role: form.role,
      p_manager_id: form.managerId || null,
    };

    const { error } = editingId
      ? await supabase.rpc("update_staff_member", {
          ...shared,
          p_staff_id: editingId,
          p_is_active: form.isActive,
        })
      : await supabase.rpc("create_staff_member", shared);

    if (error) {
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    setShowForm(false);
    setSaving(false);
    await loadStaff();
  }

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Team</p>
          <h2>Staff</h2>
        </div>
        {!readOnly && (
          <button className="primary-button" onClick={openNew}>
            + Add staff member
          </button>
        )}
      </header>

      {errorMessage && (
        <p className="error-message" role="alert">
          {errorMessage}
        </p>
      )}

      {showForm && !readOnly && (
        <section className="dashboard-panel" style={{ marginBottom: 24 }}>
          <div className="panel-heading">
            <h3>{editingId ? "Edit staff member" : "New staff member"}</h3>
          </div>
          <form onSubmit={saveStaff} className="staff-form">
            <div className="staff-form-grid">
              <label>
                First name
                <input
                  required
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({ ...form, firstName: e.target.value })
                  }
                />
              </label>
              <label>
                Last name
                <input
                  required
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label>
                Job title
                <input
                  value={form.jobTitle}
                  placeholder="Groomer, receptionist…"
                  onChange={(e) =>
                    setForm({ ...form, jobTitle: e.target.value })
                  }
                />
              </label>
              <label>
                Access role
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="staff">Staff</option>
                  <option value="groomer">Groomer</option>
                  <option value="receptionist">Receptionist</option>
                  <option value="manager">Manager</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
              <label>
                Reports to
                <select
                  value={form.managerId}
                  onChange={(e) =>
                    setForm({ ...form, managerId: e.target.value })
                  }
                >
                  <option value="">Not assigned</option>
                  {managerChoices.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.first_name} {member.last_name}
                    </option>
                  ))}
                </select>
              </label>
              {editingId && (
                <label className="staff-checkbox">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm({ ...form, isActive: e.target.checked })
                    }
                  />{" "}
                  Active staff member
                </label>
              )}
            </div>
            <div className="staff-form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button className="primary-button" disabled={saving}>
                {saving ? "Saving…" : "Save staff member"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="dashboard-panel">
        {loading ? (
          <p>Loading staff…</p>
        ) : members.length === 0 ? (
          <div className="empty-state">
            <h3>No staff members yet</h3>
            <p>
              Add your team to begin assigning appointments and permissions.
            </p>
          </div>
        ) : (
          <div className="staff-grid">
            {members.map((member) => (
              <article
                className={`staff-card ${member.is_active ? "" : "inactive"}`}
                key={member.id}
              >
                <div className="staff-card-top">
                  <div className="staff-avatar">
                    {member.first_name[0]}
                    {member.last_name[0]}
                  </div>
                  <div>
                    <h3>
                      {member.first_name} {member.last_name}
                    </h3>
                    <p>{member.job_title || "Team member"}</p>
                  </div>
                  <span className="staff-status">
                    {member.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <dl className="staff-details">
                  <div>
                    <dt>Role</dt>
                    <dd>{member.role}</dd>
                  </div>
                  <div>
                    <dt>Reports to</dt>
                    <dd>{managerName(member.manager_id)}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{member.email || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{member.phone || "Not provided"}</dd>
                  </div>
                </dl>
                <p className="staff-login-status">
                  {member.has_login
                    ? "Login connected"
                    : "Profile only — no login yet"}
                </p>
                {!readOnly && (
                  <button
                    className="secondary-button"
                    onClick={() => openEdit(member)}
                  >
                    Edit staff member
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export default Staff;
