import React from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { useApp } from "./lib/store.jsx";
import { Shell } from "./components/Shell.jsx";
import Login from "./screens/Login.jsx";
import Directory from "./screens/Directory.jsx";
import Portfolio from "./screens/Portfolio.jsx";
import TeamWorld from "./screens/TeamWorld.jsx";
import Taxonomy from "./screens/Taxonomy.jsx";
import Studio from "./screens/Studio.jsx";
import EvidenceLibrary from "./screens/EvidenceLibrary.jsx";
import Across from "./screens/Across.jsx";
import Settings from "./screens/Settings.jsx";
import { Loading } from "./components/ui.jsx";

function Gate({ children }) {
  const { me, workspaces } = useApp(); const { wid } = useParams();
  if (me === undefined) return <Loading />;
  if (!me.user) return <Navigate to="/login" replace />;
  if (!workspaces.find((w) => w.workspace_id === wid)) return <div className="wrap" style={{ padding: 40 }}><div className="notice bad">You do not have access to workspace “{wid}”.</div></div>;
  return <Shell>{children}</Shell>;
}
function Home() {
  const { me, workspaces } = useApp();
  if (me === undefined) return <Loading />;
  if (!me.user) return <Navigate to="/login" replace />;
  const live = workspaces.find((w) => w.kind === "live") || workspaces[0];
  return live ? <Navigate to={`/w/${live.workspace_id}`} replace /> : <div className="wrap" style={{ padding: 40 }}>No workspace membership. Ask an admin to add you.</div>;
}
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />
      <Route path="/w/:wid" element={<Gate><Directory /></Gate>} />
      <Route path="/w/:wid/portfolio" element={<Gate><Portfolio /></Gate>} />
      <Route path="/w/:wid/across" element={<Gate><Across /></Gate>} />
      <Route path="/w/:wid/evidence" element={<Gate><EvidenceLibrary /></Gate>} />
      <Route path="/w/:wid/taxonomy" element={<Gate><Taxonomy /></Gate>} />
      <Route path="/w/:wid/studio" element={<Gate><Studio /></Gate>} />
      <Route path="/w/:wid/settings" element={<Gate><Settings /></Gate>} />
      <Route path="/w/:wid/teams/:teamId" element={<Gate><TeamWorld /></Gate>} />
      <Route path="/w/:wid/teams/:teamId/:section" element={<Gate><TeamWorld /></Gate>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
