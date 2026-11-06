/**
 * Light formatting for AI replies: paragraphs, bullet and numbered lists, and **bold**.
 * The text is never treated as HTML; everything becomes plain React text, so a reply
 * can't inject markup. Anything that isn't one of these patterns is shown as written.
 */
import React from 'react';

type Block = { kind: 'p'; lines: string[] } | { kind: 'ul' | 'ol'; items: string[]; start: number };

const BULLET = /^\s*(?:[-*•]\s+)(.*)$/;
const NUMBER = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

/** Splits a reply into paragraphs and lists. Exported for tests. */
export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', lines: para });
    para = [];
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(HEADING, '**$1**');
    const b = line.match(BULLET);
    const n = !b && line.match(NUMBER);
    const last = blocks[blocks.length - 1];
    if (b || n) {
      flush();
      const kind = b ? 'ul' : 'ol';
      const item = b ? b[1] : (n as RegExpMatchArray)[2];
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item], start: n ? Number(n[1]) : 1 });
    } else if (!line.trim()) {
      flush();
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/** **bold** inside a line; a lone or unfinished ** (while a reply streams in) stays as text */
function inline(line: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    out.push(<strong key={`${key}-${m.index}`} className="font-bold">{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

/** An AI reply as paragraphs and lists. */
export const RichText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {toBlocks(text).map((b, i) => {
      if (b.kind === 'p')
        return (
          <p key={i} className="m-0 [&+*]:mt-3">
            {b.lines.map((l, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                {inline(l, `${i}-${j}`)}
              </React.Fragment>
            ))}
          </p>
        );
      const List = b.kind;
      return (
        <List key={i} start={b.kind === 'ol' && b.start !== 1 ? b.start : undefined} className={`m-0 flex flex-col gap-1.5 ps-6 [&+*]:mt-3 ${b.kind === 'ol' ? 'list-decimal' : 'list-disc'}`}>
          {b.items.map((it, j) => (
            <li key={j} className="ps-1">
              {inline(it, `${i}-${j}`)}
            </li>
          ))}
        </List>
      );
    })}
  </>
);
