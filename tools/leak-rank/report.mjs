// The report: a CSV of everything, a short Markdown summary, and a self-contained HTML page sorted by stars. No network here.
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
const csvCell = (v) => {
  const s = String(v ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const starText = (n) => (n == null ? "unrated" : "★".repeat(n) + "☆".repeat(5 - n))

const sorted = (rows) => [...rows].sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1) || (b.features.usedBy - a.features.usedBy) || a.name.localeCompare(b.name))

export function reportCsv(rows) {
  const head = ["stars", "name", "origin", "kind", "says", "depth", "generality", "worth_to_target", "in_mathlib", "vacuous", "draw_spread", "closed_by_cheap_tactic", "closed_by_one_library_lemma", "numeric_only", "proof_lines", "used_by", "keystone", "duplicate_of", "runs", "reasons"]
  const lines = [head.join(",")]
  for (const r of sorted(rows)) {
    const f = r.features
    const rd = r.reading
    lines.push(
      [
        r.stars ?? "",
        r.name,
        f.origin,
        rd?.kind ?? "",
        rd?.says ?? "",
        rd?.depth?.toFixed(1) ?? "",
        rd?.generality?.toFixed(1) ?? "",
        rd?.role?.toFixed(1) ?? "",
        rd?.inMathlib ?? "",
        rd?.vacuous ?? "",
        rd ? rd.spread.toFixed(1) : "",
        r.probes ? r.probes.cheap : "",
        r.probes ? r.probes.library : "",
        f.ground,
        f.proofLines,
        f.usedBy,
        f.keystone,
        f.duplicateOf ?? "",
        r.runs.length,
        r.reasons.join(" | "),
      ].map(csvCell).join(","),
    )
  }
  return lines.join("\n") + "\n"
}

export function reportMd(rows, { target, distribution }) {
  const n = rows.length
  const rated = rows.filter((r) => r.stars != null)
  const pct = (k) => (rated.length ? `${Math.round((100 * rated.filter((r) => r.stars >= k).length) / rated.length)}%` : "n/a")
  const out = []
  out.push(`# Banked theorems for ${target}: star ranking`, "")
  out.push(`${n} distinct entries, ${rated.length} rated.`, "")
  out.push("| stars | entries |", "|---|---|")
  for (const k of [5, 4, 3, 2, 1]) out.push(`| ${starText(k)} | ${distribution[k]} |`)
  if (distribution.unrated) out.push(`| unrated | ${distribution.unrated} |`)
  out.push("", `At least three stars: ${pct(3)}. At least four: ${pct(4)}.`, "")
  const top = sorted(rated).slice(0, 15)
  out.push("## The best fifteen", "", "| stars | name | what it says |", "|---|---|---|")
  for (const r of top) out.push(`| ${starText(r.stars)} | ${r.name} | ${r.reading?.says ?? ""} |`)
  return out.join("\n") + "\n"
}

export function reportHtml(rows, { target, title }) {
  const body = sorted(rows)
    .map((r) => {
      const f = r.features
      const rd = r.reading
      return `<tr data-stars="${r.stars ?? 0}"><td class="s">${starText(r.stars)}</td><td><b>${esc(r.name)}</b><div class="says">${esc(rd?.says ?? "")}</div><div class="why">${esc(r.reasons.join(" · "))}</div></td><td>${esc(rd?.kind ?? "")}</td><td class="n">${rd ? rd.depth.toFixed(1) : ""}</td><td class="n">${rd ? rd.generality.toFixed(1) : ""}</td><td class="n">${rd ? rd.role.toFixed(1) : ""}</td><td class="n">${f.usedBy}</td></tr>`
    })
    .join("\n")
  return `<!doctype html><meta charset="utf-8"><title>Banked theorems: ${esc(target)}</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top;text-align:left}th{position:sticky;top:0;background:#fff}.s{white-space:nowrap;color:#b8860b}.n{text-align:right;white-space:nowrap}.says{color:#444}.why{color:#888;font-size:12px}h1{font-size:18px}</style>
<h1>${esc(title || target)}: banked theorems, ranked</h1>
<table><thead><tr><th>stars</th><th>theorem</th><th>kind</th><th>depth</th><th>general</th><th>worth</th><th>used by</th></tr></thead><tbody>
${body}
</tbody></table>`
}

// What the app needs to show a rating: numbers and flags keyed by the entry's own id (the sha1 of its statement), and no theorem text, no
// name and no prose, so that it can sit in a public repository next to a target whose lemmas are not published. The app explains the rungs.
export function exportQuality(rows, { targetId, rankedAt, draws = 2, method = "features, two Leak IV probes and a model reading" }) {
  const entries = {}
  for (const r of rows) {
    if (!r.entryId || r.stars == null) continue
    const rd = r.reading
    const e = { s: r.stars, u: r.features.usedBy }
    if (rd) {
      e.d = Number(rd.depth.toFixed(1))
      e.g = Number(rd.generality.toFixed(1))
      e.w = Number(rd.role.toFixed(1))
      e.k = rd.kind
    }
    if (r.probes?.cheap) e.c = 1
    if (r.probes?.library) e.l = 1
    if (r.features.ground) e.n = 1
    if (rd?.inMathlib === "yes") e.m = 1
    if (rd?.vacuous === "likely") e.v = 1
    if (r.features.duplicateOf) e.x = 1
    if (r.features.keystone) e.t = 1
    entries[r.entryId] = e
  }
  return { targetId, rankedAt, draws, method, count: Object.keys(entries).length, entries }
}
