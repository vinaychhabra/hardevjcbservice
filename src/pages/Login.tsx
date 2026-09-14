import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { formatAppError } from "../lib/errorMessages";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) setError(formatAppError(error));
    else navigate("/");
  }

  return (
    <div className="auth-shell">
      <form onSubmit={handleSubmit} className="auth-card">
        <div className="auth-badge">Hardev JCB</div>
        <h1>Welcome back</h1>
        <p>Sign in to your operations workspace.</p>

        {error && (
          <div style={{ background: "rgba(198, 61, 66, 0.12)", color: "var(--danger)", padding: "10px 12px", borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
            {error}
          </div>
        )}

        <div className="field-group">
          <label className="field">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field">Password</label>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <p style={{ marginTop: 18, fontSize: 13 }}>
          New here? <Link className="auth-link" to="/signup">Create a company account</Link>
        </p>
      </form>
    </div>
  );
}
