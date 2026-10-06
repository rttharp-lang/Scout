// Mascot Lab — the team's name for labels, file names, refs and the owner inbox.
// An uploaded logo clears the sample team name; until the coach types a new one in the
// Studio, the school from the order's contact details stands in, so files are never
// "your-team-…", refs never fall back to "ML-" and the inbox never says just "Team"
// when the order knows the school.

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * teamFields(team, contact) → { school, mascot, fromContact }.
 * The typed team name when there is one (school or mascot), else the contact form's
 * school (mascot ""), else two empty strings.
 */
export function teamFields(team, contact) {
  const school = clean(team?.school);
  const mascot = clean(team?.mascot);
  if (school || mascot) return { school, mascot, fromContact: false };
  const fallback = clean(contact?.school);
  return { school: fallback, mascot: "", fromContact: !!fallback };
}

/** teamLabel(team, contact, empty = "") → "Northgate Bulldogs" | the contact school | `empty`. */
export function teamLabel(team, contact, empty = "") {
  const t = teamFields(team, contact);
  return [t.school, t.mascot].filter(Boolean).join(" ") || empty;
}
