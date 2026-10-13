/**
 * Very small, safe Markdown subset for lesson text:
 * # / ## / ### headings, **bold**, *italic*, `code`, [links](https://…),
 * "- " bullet lists, "1. " numbered lists, "> " notes, blank-line paragraphs.
 * Built from React elements (never raw HTML), so trainers cannot inject scripts.
 */
const INLINE = /(`[^`]+`)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*(.+?)\*\*|(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])/g;

function inline(text, keyBase = 'i') {
  const out = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${n++}`;
    if (m[1]) out.push(<code key={key}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<a key={key} href={m[3]} target="_blank" rel="noopener noreferrer">{inline(m[2], key)}</a>);
    else if (m[4]) out.push(<strong key={key}>{inline(m[4], key)}</strong>);
    else if (m[5]) out.push(<em key={key}>{inline(m[5], key)}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function RichText({ text }) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  let list = null; // { type: 'ul'|'ol', items: [] }

  const flushPara = () => {
    if (para.length) {
      const k = blocks.length;
      blocks.push(
        <p key={k}>
          {para.map((l, i) => (
            <span key={i}>{i > 0 && <br />}{inline(l, `${k}-${i}`)}</span>
          ))}
        </p>
      );
      para = [];
    }
  };
  const closeList = () => {
    if (list) {
      const k = blocks.length;
      const items = list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>);
      blocks.push(list.type === 'ul' ? <ul key={k}>{items}</ul> : <ol key={k}>{items}</ol>);
      list = null;
    }
  };

  for (const raw of lines) {
    const t = raw.replace(/\s+$/, '');
    let m;
    if (t === '') {
      flushPara();
      closeList();
    } else if ((m = t.match(/^(#{1,3})\s+(.*)$/))) {
      flushPara();
      closeList();
      const H = `h${m[1].length + 1}`; // # -> h2
      blocks.push(<H key={blocks.length}>{inline(m[2], `h${blocks.length}`)}</H>);
    } else if ((m = t.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (list?.type !== 'ul') {
        closeList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = t.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (list?.type !== 'ol') {
        closeList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = t.match(/^>\s?(.*)$/))) {
      flushPara();
      closeList();
      blocks.push(<blockquote key={blocks.length}>{inline(m[1], `q${blocks.length}`)}</blockquote>);
    } else {
      closeList();
      para.push(t);
    }
  }
  flushPara();
  closeList();
  return <div className="prose">{blocks}</div>;
}
