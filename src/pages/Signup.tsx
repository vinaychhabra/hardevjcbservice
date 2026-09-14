import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { formatAppError } from "../lib/errorMessages";

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
    if (error) setError(formatAppError(error));
    else navigate("/");
  }

  return (
    <div className="auth-shell">
      <form onSubmit={handleSubmit} className="auth-card">
        <div className="auth-badge">Hardev JCB</div>
        <h1>Create your account</h1>
        <p>This creates your company workspace and makes you the owner.</p>

        {error && (
          <div style={{ background: "rgba(198, 61, 66, 0.12)", color: "var(--danger)", padding: "10px 12px", borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
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

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Creating…" : "Create account"}
        </button>

        <p style={{ marginTop: 18, fontSize: 13 }}>
          Already have an account? <Link className="auth-link" to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
