import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useStore } from "../../store/index.js";
import { Button, Logo } from "../ui/primitives.jsx";
import "../../styles/auth.css";

export function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", password: "", confirm: "", displayName: "" });
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const login = useStore((s) => s.login);
  const register = useStore((s) => s.register);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const isRegister = mode === "register";
  const switchTo = (m) => {
    setMode(m);
    setError("");
  };

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (isRegister && form.password !== form.confirm) return setError("The two passwords are different.");
    setBusy(true);
    try {
      if (isRegister) await register(form.username.trim(), form.password, form.displayName.trim());
      else await login(form.username.trim(), form.password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-intro">
        <Logo size={36} withText />
        <h1>The chat room for your class.</h1>
        <p className="auth-lead">Talk with classmates and teachers, share homework files and photos, and keep every subject in its own channel.</p>

        <ol className="auth-steps">
          <li>
            <span className="step-num">1</span>
            <div>
              <strong>Create an account</strong>
              <p>Pick a username and password. No email needed.</p>
            </div>
          </li>
          <li>
            <span className="step-num">2</span>
            <div>
              <strong>Join your class with a code</strong>
              <p>Your teacher gives you a 6-letter code (teachers create the class and get the codes).</p>
            </div>
          </li>
          <li>
            <span className="step-num">3</span>
            <div>
              <strong>Start talking</strong>
              <p>A short checklist shows you the basics the first time you come in.</p>
            </div>
          </li>
        </ol>
      </section>

      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="segmented auth-switch" role="tablist">
          <button type="button" role="tab" aria-selected={!isRegister} className={!isRegister ? "active" : ""} onClick={() => switchTo("login")}>
            Log in
          </button>
          <button type="button" role="tab" aria-selected={isRegister} className={isRegister ? "active" : ""} onClick={() => switchTo("register")}>
            Create account
          </button>
        </div>

        <h2>{isRegister ? "Create your account" : "Log in"}</h2>

        <label className="field">
          <span className="field-label">Username</span>
          <input className="input" autoComplete="username" value={form.username} onChange={update("username")} placeholder="e.g. sam_k" required autoFocus />
          {isRegister && <span className="field-hint">3–20 characters. Letters, numbers, dot, dash or underscore.</span>}
        </label>

        {isRegister && (
          <label className="field">
            <span className="field-label">
              Your name <span className="muted">(what others see)</span>
            </span>
            <input className="input" value={form.displayName} onChange={update("displayName")} placeholder="e.g. Sam Kamga" maxLength={40} />
          </label>
        )}

        <label className="field">
          <span className="field-label">Password</span>
          <span className="input-with-btn">
            <input
              className="input"
              type={show ? "text" : "password"}
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={form.password}
              onChange={update("password")}
              placeholder={isRegister ? "At least 6 characters" : ""}
              required
            />
            <button type="button" className="icon-btn" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>

        {isRegister && (
          <label className="field">
            <span className="field-label">Type the password again</span>
            <input className="input" type={show ? "text" : "password"} autoComplete="new-password" value={form.confirm} onChange={update("confirm")} required />
          </label>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          {isRegister ? "Create account" : "Log in"}
        </Button>
        <p className="auth-foot muted">
          {isRegister ? "Already have an account? " : "First time here? "}
          <button type="button" className="link-btn" onClick={() => switchTo(isRegister ? "login" : "register")}>
            {isRegister ? "Log in" : "Create an account"}
          </button>
        </p>
      </form>
    </div>
  );
}
