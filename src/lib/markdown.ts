/** Minimal markdown → HTML (headings, bold, code, lists, paragraphs). */
export function renderMarkdown(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("### ")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h4>${inline(t.slice(4))}</h4>`;
    } else if (t.startsWith("## ") || t.startsWith("# ")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h3>${inline(t.replace(/^#+ /, ""))}</h3>`;
    } else if (/^[-*] /.test(t)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(t.slice(2))}</li>`;
    } else if (/^\d+\. /.test(t)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(t.replace(/^\d+\. /, ""))}</li>`;
    } else if (t === "" || t === "---") {
      if (inList) { html += "</ul>"; inList = false; }
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p>${inline(t)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}
