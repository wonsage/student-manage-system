import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError } from "../api";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>学生管理系统</h1>
        <p className="sub">Austin Education · 登录</p>

        {error && <div className="error-banner">{error}</div>}

        <div className="field">
          <label>邮箱</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@austin.edu"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label>密码</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        <button className="btn primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? "登录中…" : "登录"}
        </button>

        <div className="login-hint">
          演示账号（密码均为 <b>password123</b>）：
          <br />
          课程顾问 <b>wangli@austin.edu</b>
          <br />
          老师 <b>wang.teacher@austin.edu</b>
        </div>
      </form>
    </div>
  );
}
