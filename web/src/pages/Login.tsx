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

  const doLogin = async (em: string, pw: string) => {
    setError("");
    setLoading(true);
    try {
      await login(em, pw);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await doLogin(email, password);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-logo">AE</span>
          <div>
            <h1 style={{ fontSize: "1.3rem" }}>学生管理系统</h1>
            <div className="muted small">Austin Education · 一站式学员管理</div>
          </div>
        </div>
        <p className="sub">报名 · 排课 · 出勤扣课时 · 跟进 · 课时流水</p>

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

        <button className="btn primary" style={{ width: "100%", padding: "11px" }} disabled={loading}>
          {loading ? "登录中…" : "登录"}
        </button>

        <div className="login-hint">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>演示账号（密码统一 password123）</div>
          点击下方一键填充：
          <div className="login-demo-accounts">
            <button type="button" onClick={() => { setEmail("wangli@austin.edu"); setPassword("password123"); }}>
              <span>👩‍💼</span>
              <span><b>课程顾问</b> · 王丽（学生跟进 / 排课 / 课时）</span>
            </button>
            <button type="button" onClick={() => { setEmail("wang.teacher@austin.edu"); setPassword("password123"); }}>
              <span>👨‍🏫</span>
              <span><b>老师</b> · 王老师（点名扣课时 / 写反馈）</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
