// ContactForm — who to send the proof to and where to ship. Validates inline (on blur,
// and everything at once when the coach tries to send). Handled in JS: the Artifact
// frame can't post forms anywhere.
import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Field, Input, Textarea, cx } from "../components/index.js";
import { LEAD_TIME_DAYS, PROOF_BUSINESS_DAYS } from "../../order/catalog.js";
import { addBusinessDays, addDays, isoDate, shortDate } from "./util.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** earliestShip(today) → Date: proof turnaround + production lead time. */
export function earliestShip(today = new Date()) {
  return addDays(addBusinessDays(today, PROOF_BUSINESS_DAYS), LEAD_TIME_DAYS);
}

/** validateContact(contact) → { errors: { field: msg }, warnings: { field: msg } }. */
export function validateContact(c = {}, today = new Date()) {
  const errors = {};
  const warnings = {};
  const v = (k) => String(c[k] ?? "").trim();
  if (!v("coach")) errors.coach = "Add your name so we know who to talk to.";
  if (!v("email")) errors.email = "Add an email. That's where the proof goes.";
  else if (!EMAIL_RE.test(v("email"))) errors.email = "That email looks incomplete. Check for a typo.";
  const digits = v("phone").replace(/\D/g, "");
  if (v("phone") && (digits.length < 7 || digits.length > 15)) errors.phone = "Check the phone number, or leave it blank.";
  if (!v("school")) errors.school = "Add the school or club name for the invoice.";
  if (!v("address")) errors.address = "Add a ship-to address.";
  else if (v("address").length < 12) errors.address = "Add the full address: street, city, state and ZIP.";
  if (v("needBy")) {
    const d = new Date(`${v("needBy")}T12:00:00`);
    const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
    if (Number.isNaN(d.getTime())) errors.needBy = "Pick a date from the calendar.";
    else if (d < t0) errors.needBy = "That date has already passed.";
    else {
      const earliest = earliestShip(today);
      if (d < earliest) warnings.needBy = `That's tight. With ${PROOF_BUSINESS_DAYS} business days for the proof and about ${Math.round(LEAD_TIME_DAYS / 7)} weeks of production, the earliest likely ship date is ${shortDate(earliest, true)}. Send it anyway and we'll tell you on the proof what's possible.`;
    }
  }
  if (!c.rightsConfirmed) errors.rightsConfirmed = "Confirm you can use this logo. We can't print it otherwise.";
  return { errors, warnings };
}

const ORDER = ["coach", "email", "phone", "school", "address", "needBy", "notes", "rightsConfirmed"];

export const ContactForm = forwardRef(function ContactForm({ contact, onChange, teamName, disabled = false, showAll = false }, ref) {
  const [touched, setTouched] = useState({});
  const formRef = useRef(null);
  const { errors, warnings } = validateContact(contact);
  const show = (k) => (showAll || touched[k]) && errors[k];
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));
  const set = (k) => (e) => onChange({ [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  useImperativeHandle(ref, () => ({
    /** focus the first invalid field; returns true when the form is valid */
    check() {
      setTouched(Object.fromEntries(ORDER.map((k) => [k, true])));
      const first = ORDER.find((k) => errors[k]);
      if (first) {
        const el = formRef.current?.querySelector(`[name="${first}"]`);
        el?.focus();
        el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
        return false;
      }
      return true;
    },
  }), [errors]);

  return (
    <div className="rv-form" ref={formRef}>
      <div className="rv-form__grid">
        <Field label="Your name" required error={show("coach")}>
          <Input name="coach" autoComplete="name" value={contact.coach || ""} onChange={set("coach")} onBlur={blur("coach")} disabled={disabled} placeholder="Coach Jordan Ellis" />
        </Field>
        <Field label="Email" required error={show("email")} hint={!show("email") ? "The proof and invoice go here." : undefined}>
          <Input name="email" type="email" inputMode="email" autoComplete="email" value={contact.email || ""} onChange={set("email")} onBlur={blur("email")} disabled={disabled} placeholder="coach@school.org" />
        </Field>
        <Field label="Phone" optional error={show("phone")}>
          <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" value={contact.phone || ""} onChange={set("phone")} onBlur={blur("phone")} disabled={disabled} placeholder="(555) 201-4417" />
        </Field>
        <Field label="School or club" required error={show("school")}>
          <Input name="school" autoComplete="organization" value={contact.school || ""} onChange={set("school")} onBlur={blur("school")} disabled={disabled} placeholder={teamName ? `${teamName} High School` : "School name"} />
        </Field>
        <Field label="Ship to" required error={show("address")} className="rv-form__wide" hint={!show("address") ? "Street, city, state and ZIP. A school address is fine." : undefined}>
          <Textarea name="address" rows={3} autoComplete="street-address" value={contact.address || ""} onChange={set("address")} onBlur={blur("address")} disabled={disabled} placeholder={"Athletics Office\n1200 Gate Rd\nNorthgate, OH 43001"} />
        </Field>
        <Field
          label="Need it by"
          optional
          error={show("needBy")}
          hint={!show("needBy") && !warnings.needBy ? `Earliest likely ship date: ${shortDate(earliestShip(), true)}.` : undefined}
          className={cx(warnings.needBy && "rv-form__warnfield")}
        >
          <Input name="needBy" type="date" min={isoDate(new Date())} value={contact.needBy || ""} onChange={set("needBy")} onBlur={blur("needBy")} disabled={disabled} />
        </Field>
        {warnings.needBy && !show("needBy") && <p className="rv-form__warn" role="status">{warnings.needBy}</p>}
        <Field label="Notes for the print shop" optional className="rv-form__wide">
          <Textarea name="notes" rows={3} value={contact.notes || ""} onChange={set("notes")} disabled={disabled} placeholder="Season opener date, a second colourway, a player joining late…" />
        </Field>
      </div>
      <label className={cx("rv-rights", show("rightsConfirmed") && "is-error")}>
        <input type="checkbox" name="rightsConfirmed" checked={!!contact.rightsConfirmed} onChange={set("rightsConfirmed")} onBlur={blur("rightsConfirmed")} disabled={disabled} aria-invalid={show("rightsConfirmed") ? true : undefined} aria-describedby={show("rightsConfirmed") ? "rv-rights-err" : undefined} />
        <span>
          <strong>I own this logo or have permission to use it.</strong>
          <span className="rv-rights__sub">School marks usually need the athletic director's OK.</span>
        </span>
      </label>
      {show("rightsConfirmed") && <p className="rv-form__err" id="rv-rights-err" role="alert">{errors.rightsConfirmed}</p>}
    </div>
  );
});

export default ContactForm;
