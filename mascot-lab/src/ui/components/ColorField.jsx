import React, { useEffect, useId, useState } from "react";
import { Pipette } from "lucide-react";
import { Swatch } from "./Swatch.jsx";
import "./components.css";

const ROLE_NAMES = { primary: "Primary", secondary: "Secondary", accent: "Accent", dark: "Dark", light: "Light" };
const ROLES = Object.keys(ROLE_NAMES);

export function normHex(v) {
  if (typeof v !== "string") return null;
  let h = v.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(h) ? "#" + h.toUpperCase() : null;
}

/**
 * ColorField — pick a colour from the team palette (swatches), type a hex, or use the
 * native picker. `value` may be a palette role ("primary"…) or "#RRGGBB".
 * Swatch clicks call onChange(role) when allowRoles (so the param follows the
 * palette), otherwise onChange(hex). Typed/picked colours always call onChange(hex).
 *   palette: { primary, secondary, accent, dark, light }; extra: ["#hex", …] more swatches.
 */
export function ColorField({ label, value, onChange, palette = {}, roles = ROLES, extra = [], allowRoles = true, hint, id: idProp, className }) {
  const autoId = useId();
  const id = idProp || `c${autoId}`;
  const isRole = ROLES.includes(value);
  const resolved = (isRole ? normHex(palette[value]) : normHex(value)) || "#000000";
  const [text, setText] = useState(resolved);
  useEffect(() => setText(resolved), [resolved]);

  const commit = () => {
    const h = normHex(text);
    if (h && h !== resolved) onChange?.(h);
    else setText(resolved);
  };
  const roleSwatches = roles.filter((r) => normHex(palette[r]));
  const matchRole = isRole ? value : null;

  return (
    <div className={["ml-color", className].filter(Boolean).join(" ")} role="group" aria-labelledby={`${id}-l`}>
      <div className="ml-color__head">
        <span className="ml-color__label" id={`${id}-l`}>{label}</span>
        <span className="ml-color__role">{matchRole ? `Team · ${ROLE_NAMES[matchRole]}` : "Custom"}</span>
      </div>
      <div className="ml-color__row">
        {roleSwatches.map((r) => {
          const hex = normHex(palette[r]);
          const selected = matchRole ? matchRole === r : resolved === hex && !roleSwatches.slice(0, roleSwatches.indexOf(r)).some((q) => normHex(palette[q]) === hex);
          return (
            <Swatch
              key={r}
              color={hex}
              size="md"
              selected={selected}
              label={`${ROLE_NAMES[r]} ${hex}`}
              onClick={() => onChange?.(allowRoles ? r : hex)}
            />
          );
        })}
        {extra.map((h) => {
          const hex = normHex(h);
          if (!hex) return null;
          return <Swatch key={hex} color={hex} selected={!matchRole && resolved === hex} label={hex} onClick={() => onChange?.(hex)} />;
        })}
        <span className="ml-color__sep" aria-hidden="true" />
        <input
          id={id}
          className="ml-color__hex"
          type="text"
          inputMode="text"
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          aria-label={`${label} hex code`}
          value={text}
          onChange={(e) => setText(e.target.value.toUpperCase())}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") setText(resolved);
          }}
          aria-describedby={hint ? `${id}-h` : undefined}
        />
        <label className="ml-color__picker" title="Pick any colour">
          <Pipette aria-hidden="true" />
          <input type="color" aria-label={`${label}: pick any colour`} value={resolved.toLowerCase()} onChange={(e) => onChange?.(e.target.value.toUpperCase())} />
        </label>
      </div>
      {hint && <div className="ml-field__hint" id={`${id}-h`}>{hint}</div>}
    </div>
  );
}

export default ColorField;
