/**
 * Simple, robust Markdown <-> HTML translator for TipTap editor
 */

export function markdownToHtml(md: string): string {
  if (!md) return '<p></p>';
  
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  let inTodo = false;
  let listType: 'ul' | 'ol' | 'task' | null = null;
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const closeCurrentList = () => {
    if (inList) {
      if (listType === 'ul') html += '</ul>\n';
      else if (listType === 'ol') html += '</ol>\n';
      else if (listType === 'task') html += '</ul>\n';
      inList = false;
      listType = null;
    }
  };

  lines.forEach((line) => {
    // Code block handling
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        html += `<pre><code>${codeBlockLines.join('\n')}</code></pre>\n`;
        inCodeBlock = false;
        codeBlockLines = [];
      } else {
        closeCurrentList();
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      return;
    }

    // Process lists and headers
    let match;
    
    // Header 1
    if (line.startsWith('# ')) {
      closeCurrentList();
      html += `<h1>${parseInline(line.slice(2))}</h1>\n`;
    }
    // Header 2
    else if (line.startsWith('## ')) {
      closeCurrentList();
      html += `<h2>${parseInline(line.slice(3))}</h2>\n`;
    }
    // Header 3
    else if (line.startsWith('### ')) {
      closeCurrentList();
      html += `<h3>${parseInline(line.slice(4))}</h3>\n`;
    }
    // Blockquote
    else if (line.startsWith('> ')) {
      closeCurrentList();
      html += `<blockquote><p>${parseInline(line.slice(2))}</p></blockquote>\n`;
    }
    // Horizontal Rule
    else if (line.trim() === '---' || line.trim() === '***') {
      closeCurrentList();
      html += '<hr />\n';
    }
    // Todo Task list items: "- [ ] task" or "- [x] task"
    else if ((match = line.match(/^[\-\*]\s+\[([ xX])\]\s+(.*)/))) {
      const checked = match[1].toLowerCase() === 'x';
      const content = match[2];
      if (!inList || listType !== 'task') {
        closeCurrentList();
        inList = true;
        listType = 'task';
        html += '<ul data-type="taskList">\n';
      }
      html += `  <li data-checked="${checked}" data-type="taskItem">` +
              `<label><input type="checkbox" ${checked ? 'checked="checked"' : ''}><span></span></label>` +
              `<div><p>${parseInline(content)}</p></div></li>\n`;
    }
    // Bullet lists: "- item" or "* item"
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      const content = line.slice(2);
      if (!inList || listType !== 'ul') {
        closeCurrentList();
        inList = true;
        listType = 'ul';
        html += '<ul>\n';
      }
      html += `  <li><p>${parseInline(content)}</p></li>\n`;
    }
    // Number lists: "1. item"
    else if ((match = line.match(/^\d+\.\s+(.*)/))) {
      const content = match[1];
      if (!inList || listType !== 'ol') {
        closeCurrentList();
        inList = true;
        listType = 'ol';
        html += '<ol>\n';
      }
      html += `  <li><p>${parseInline(content)}</p></li>\n`;
    }
    // Blank line
    else if (line.trim() === '') {
      closeCurrentList();
      // html += '<p></p>\n'; // standard blank spacer
    }
    // Regular text line
    else {
      closeCurrentList();
      html += `<p>${parseInline(line)}</p>\n`;
    }
  });

  closeCurrentList();
  if (inCodeBlock) {
    html += `<pre><code>${codeBlockLines.join('\n')}</code></pre>\n`;
  }

  return html;
}

function parseInline(text: string): string {
  let result = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold (**text** or __text__)
  result = result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic (*text* or _text_)
  result = result.replace(/\*(.*?)\*/g, '<em>$1</em>');
  result = result.replace(/_(.*?)_/g, '<em>$1</em>');

  // Inline code (`code`)
  result = result.replace(/`(.*?)`/g, '<code>$1</code>');

  return result;
}

export function htmlToMarkdown(html: string): string {
  if (!html) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;

  let md = '';

  const walk = (node: Node): string => {
    let result = '';
    
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || '';
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      switch (tag) {
        case 'h1':
          return `# ${walkChildren(el)}\n\n`;
        case 'h2':
          return `## ${walkChildren(el)}\n\n`;
        case 'h3':
          return `### ${walkChildren(el)}\n\n`;
        case 'p':
          // Check inside lists or task list blockquotes
          const pContent = walkChildren(el);
          return pContent ? `${pContent}\n\n` : '';
        case 'strong':
          return `**${walkChildren(el)}**`;
        case 'em':
          return `*${walkChildren(el)}*`;
        case 'code':
          // Check if parent is pre
          if (el.parentElement?.tagName.toLowerCase() === 'pre') {
            return walkChildren(el);
          }
          return `\`${walkChildren(el)}\``;
        case 'pre':
          return `\`\`\`\n${walkChildren(el).trim()}\n\`\`\`\n\n`;
        case 'blockquote':
          return `> ${walkChildren(el).trim().replace(/\n/g, '\n> ')}\n\n`;
        case 'ul':
          const isTask = el.getAttribute('data-type') === 'taskList' || el.classList.contains('task-list');
          let items = '';
          for (let i = 0; i < el.childNodes.length; i++) {
            const child = el.childNodes[i] as HTMLElement;
            if (child.tagName && child.tagName.toLowerCase() === 'li') {
              if (isTask || child.getAttribute('data-type') === 'taskItem') {
                const checkedAttr = child.getAttribute('data-checked');
                const isChecked = checkedAttr === 'true' || child.querySelector('input[type="checkbox"]')?.hasAttribute('checked') || (child.querySelector('input[type="checkbox"]') as HTMLInputElement)?.checked;
                const checkboxText = isChecked ? '[x]' : '[ ]';
                
                // Extract inner P or text
                const itemContent = child.querySelector('div')?.textContent || child.textContent || '';
                items += `- ${checkboxText} ${itemContent.trim()}\n`;
              } else {
                items += `- ${walkChildren(child).trim()}\n`;
              }
            }
          }
          return `${items}\n`;
        case 'ol':
          let olItems = '';
          let count = 1;
          for (let i = 0; i < el.childNodes.length; i++) {
            const child = el.childNodes[i] as HTMLElement;
            if (child.tagName && child.tagName.toLowerCase() === 'li') {
              olItems += `${count}. ${walkChildren(child).trim()}\n`;
              count++;
            }
          }
          return `${olItems}\n`;
        case 'hr':
          return `---\n\n`;
        case 'br':
          return `\n`;
        default:
          return walkChildren(el);
      }
    }
    return result;
  };

  const walkChildren = (el: HTMLElement): string => {
    let result = '';
    for (let i = 0; i < el.childNodes.length; i++) {
      result += walk(el.childNodes[i]);
    }
    return result;
  };

  for (let i = 0; i < body.childNodes.length; i++) {
    md += walk(body.childNodes[i]);
  }

  // Clean trailing spaces and excessive returns
  return md
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
