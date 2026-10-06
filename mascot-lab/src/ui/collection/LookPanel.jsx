// Collection page — the chosen look (effect render, name, print method, "Edit
// look") and the team colors quick edit.
import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button, CanvasImage, ColorField, Skeleton, SpecLabel, inkFor, navigate } from "../components/index.js";

const ROLES = [
  { role: "primary", label: "Primary" },
  { role: "secondary", label: "Secondary" },
  { role: "accent", label: "Accent" },
];

export function LookPanel({ look, palette, onPalette }) {
  const effect = look.effect || look.original;
  const stage = effect?.stage || "paper";
  return (
    <div className="cl-look">
      <div className="cl-look__effect">
        <div className="cl-look__thumb crop-marks">
          <CanvasImage
            canvas={look.art}
            ratio={1}
            stage={stage}
            loading={look.status === "updating"}
            alt={effect ? `${effect.name} look on your logo` : "Your look"}
          />
        </div>
        <div className="cl-look__meta">
          <SpecLabel>The look</SpecLabel>
          {effect ? (
            <>
              <p className="cl-look__name">{effect.name}</p>
              {effect.method && <SpecLabel variant="box" k="Print" v={effect.method} />}
            </>
          ) : (
            <Skeleton variant="text" lines={2} style={{ width: 140 }} />
          )}
          <Button variant="secondary" size="sm" icon={<ArrowLeft aria-hidden="true" />} onClick={() => navigate("studio")}>
            Edit look
          </Button>
        </div>
      </div>
      <div className="cl-look__colors" role="group" aria-labelledby="cl-colors-h">
        <div className="cl-look__colors-head">
          <SpecLabel id="cl-colors-h">Team colors</SpecLabel>
          <span className="cl-look__colors-note">Updates every piece</span>
        </div>
        {ROLES.map(({ role, label }) => (
          <div key={role} style={{ "--chip": palette[role], "--chip-ink": inkFor(palette[role]) }}>
            <ColorField
              className="cl-look__color"
              label={label}
              value={role}
              roles={[]}
              palette={palette}
              onChange={(v) => { if (typeof v === "string" && v.startsWith("#")) onPalette({ [role]: v }); }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
