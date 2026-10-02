// SiYuan mangles the HTML-comment offset marker into a link; offsets are
// detected without it (empty Start/End plus a duration), so drop it on write.
export function toSiyuanMarkdown(md: string): string {
  return md.replace(/<!--wt:offset-->/g, "");
}

// SiYuan's markdown adds `{: style="..."}` cell attributes and a trailing
// block IAL line; strip them so the shared parser sees a plain pipe table.
export function fromSiyuanKramdown(md: string): string {
  return md
    .replace(/\[!--wt:offset--\]\(!--wt:offset--\)/g, "")
    .replace(/\{:\s[^}]*\}/g, "");
}
