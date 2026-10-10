// Provenance helpers shared by the assembler (node) and the market page:
// which dossiers were verified on the live web vs written from agent
// knowledge, and the de-duplicated queue of claims a live check must confirm.
import { LENS_IDS } from "./roster.js";

export const isKnowledge = (x) => !!(x && x.provenance && x.provenance.mode === "knowledge");

export function verificationOf({ dossiers, strategy, review }) {
  const fc = review && review.factcheck;
  const queue = [
    ...(fc ? fc.verdicts.filter((v) => v.verdict === "unverifiable").map((v) => ({ lens: v.lens, claim: v.claim, note: v.note })) : []),
    ...((strategy && strategy.provenance && strategy.provenance.verify) || []).map((c) => ({ lens: "strategy", claim: c, note: "" })),
    ...LENS_IDS.flatMap((n) => ((dossiers[n] && dossiers[n].provenance && dossiers[n].provenance.verify) || []).map((c) => ({ lens: n, claim: c, note: "" }))),
  ];
  const seen = new Set();
  const verifyQueue = queue.filter((q) => { const k = q.claim.toLowerCase().slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; });
  return {
    live: LENS_IDS.filter((n) => dossiers[n] && !isKnowledge(dossiers[n])),
    knowledge: LENS_IDS.filter((n) => isKnowledge(dossiers[n])),
    briefMode: isKnowledge(strategy) ? "knowledge" : "live",
    queue: verifyQueue,
  };
}
