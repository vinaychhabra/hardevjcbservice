import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signUp({ email, password, fullName, companyName });
    setSubmitting(false);
    if (error) setError(error);
    else navigate("/");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--graphite-900)" }}>
      <form onSubmit={handleSubmit} className="panel" style={{ width: 380, padding: 32 }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Create your account</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 24, fontSize: 13 }}>
          This creates your company workspace and makes you the owner.
        </p>

        {error && (
          <div style={{ background: "#f6e4e4", color: "var(--red)", padding: "8px 12px", borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="field-group">
          <label className="field">Company name</label>
          <input className="input" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Your name</label>
          <input className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Password</label>
          <input className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
          {submitting ? "Creating…" : "Create account"}
        </button>

        <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
