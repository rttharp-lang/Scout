import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useApp } from "../lib/store.jsx";

export default function Login() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState(null);
  const { refresh } = useApp(); const nav = useNavigate();
  const submit = async (e) => { e.preventDefault(); setErr(null); try { await api.post("/auth/login", { email, password }); await refresh(); nav("/"); } catch (x) { setErr(x.status === 401 ? "Invalid email or password." : x.message); } };
  return (
    <div className="login">
      <form onSubmit={submit}>
        <div className="wide" style={{ fontSize: 40 }}>LOCAL</div>
        <div className="small" style={{ color: "#aaa" }}>NBA & WNBA fandom intelligence. Private workspace; sign in to continue.</div>
        <label className="field" htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="field" htmlFor="pw">Password</label>
        <input id="pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div className="notice bad">{err}</div>}
        <button className="btn" style={{ background: "#fff", color: "#000", justifyContent: "center" }}>Sign in</button>
      </form>
    </div>
  );
}
