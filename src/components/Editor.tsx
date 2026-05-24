/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';

import { 
  Eye, Edit3, Share2, Info, Lock, AlertTriangle, FileText, 
  Heading1, Heading2, Heading3, Bold, Italic, List, Shield, Download, Menu, ChevronRight, Users, Globe, Settings, CornerUpLeft, CornerUpRight,
  Save, ChevronDown, Maximize, Minimize, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Sparkles, ListCheck, BookOpen, Quote, Scissors, Type, Trash, Plus, CheckCircle, HelpCircle, FileJson, ZoomIn
} from 'lucide-react';
import { Document, WorkspaceMode, AppUser, SharingPermission } from '../types';
import { getByteSize } from '../db';
import { markdownToHtml, htmlToMarkdown } from '../utils/markdownParser';

export const STARTER_FONTS = [
  { name: 'Inter', category: 'Sans Serif' },
  { name: 'Poppins', category: 'Sans Serif' },
  { name: 'Roboto', category: 'Sans Serif' },
  { name: 'Open Sans', category: 'Sans Serif' },
  { name: 'Times New Roman', category: 'Serif' },
  { name: 'Merriweather', category: 'Serif' },
  { name: 'Playfair Display', category: 'Serif' },
  { name: 'JetBrains Mono', category: 'Monospace' },
  { name: 'Fira Code', category: 'Monospace' },
];

interface EditorProps {
  document: Document | null;
  onContentChange: (content: string) => void;
  onTitleChange: (title: string) => void;
  currentUser: AppUser;
  isOffline: boolean;
  activeMode: WorkspaceMode;
  setActiveMode: (mode: WorkspaceMode) => void;
  onUpdatePermissions: (id: string, updates: Partial<Document['permissions']>) => void;
  onTriggerSync: (id: string) => void;
  onResolveConflict: (id: string, content: string) => void;
  onExportPDF: (doc: Document) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  onToggleSettings: () => void;
  documentsList?: Document[];
  onSelectDoc?: (doc: Document) => void;
  onSaveAs?: (doc: Document, newTitle: string) => void;
  onSaveAndExit?: () => void;
  autosaveStatus?: 'saved' | 'saving' | 'error' | 'idle';
}

export default function Editor({
  document,
  onContentChange,
  onTitleChange,
  currentUser,
  isOffline,
  activeMode,
  setActiveMode,
  onUpdatePermissions,
  onTriggerSync,
  onResolveConflict,
  onExportPDF,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  onToggleSettings,
  documentsList = [],
  onSelectDoc,
  onSaveAs,
  onSaveAndExit,
  autosaveStatus = 'saved',
}: EditorProps) {
  const [localTitle, setLocalTitle] = useState('');
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'info' | 'share' | 'ai'>('info');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'view' | 'edit'>('view');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Custom Google Docs & Notion States
  const [fontTheme, setFontTheme] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [lineSpacing, setLineSpacing] = useState<'compact' | 'cozy' | 'relaxed'>('cozy');
  const [zoomLevel, setZoomLevel] = useState<number>(100); // Zoom in percentage (75, 90, 100, 110, 125, 150)
  const [isOutlineOpen, setIsOutlineOpen] = useState(true); // Table of Contents Left bar
  const [pageMargin, setPageMargin] = useState<'standard' | 'narrow' | 'wide'>('standard'); // standard A4 margin bounds
  const [docLayout, setDocLayout] = useState<'page' | 'fluid'>('page'); // Page layout vs Fluid Block canvas
  
  // Header & Footer edit
  const [headerText, setHeaderText] = useState('Document Yanga Professional Workspace');
  const [footerText, setFooterText] = useState('Draft version - Auto-generated and persistent');
  
  // Floating Popup States
  const [floatingMenuCoords, setFloatingMenuCoords] = useState<{ x: number; y: number } | null>(null);
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false);
  const [slashSearchQuery, setSlashSearchQuery] = useState('');
  
  // AI assist states
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiAnswerHistory, setAiAnswerHistory] = useState<string[]>([]);
  
  // Local notification warning inside the editor
  const [saveBannerMessage, setSaveBannerMessage] = useState<string | null>(null);
  
  // Font Family state and dropdown selections
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);
  const [fontSearchQuery, setFontSearchQuery] = useState('');
  const fontDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(event.target as Node)) {
        setIsFontDropdownOpen(false);
      }
    };
    window.document.addEventListener('mousedown', handleOutsideClick);
    return () => window.document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Ref tracking to prevent typing cursor-jumps
  const lastActiveDocIdRef = useRef<string | null>(null);

  // Initialize TipTap Editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable heading because we customize standard heading sizes
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: 'Write elegant documentation here or type "/" to trigger Notion block commands...',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      TextStyle,
      FontFamily,
    ],
    content: document ? (document.type === 'md' ? markdownToHtml(document.content) : document.content) : '',
    onUpdate: ({ editor }) => {
      if (!document) return;
      const html = editor.getHTML();
      
      // Save content. If doc is of type MD, translate HTML blocks back into clean Markdown structures
      const outputContent = document.type === 'md' ? htmlToMarkdown(html) : html;
      onContentChange(outputContent);
    },
  });

  // Track document ID transitions Atomically
  useEffect(() => {
    if (!editor || !document) return;
    
    // Check if the opened file has changed
    const isNewDoc = lastActiveDocIdRef.current !== document.id;
    if (isNewDoc) {
      lastActiveDocIdRef.current = document.id;
      setLocalTitle(document.title);
      
      // Compute correct HTML structure
      const targetHTML = document.type === 'md' 
        ? markdownToHtml(document.content) 
        : document.content;
      
      editor.commands.setContent(targetHTML);
    } else {
      // Sync from outside (such as Cloud sync resolves or background saves) ONLY when cursor is unfocused
      if (!editor.isFocused) {
        const targetHTML = document.type === 'md' 
          ? markdownToHtml(document.content) 
          : document.content;
        
        if (editor.getHTML() !== targetHTML) {
          editor.commands.setContent(targetHTML);
        }
      }
    }
  }, [document?.id, document?.content, editor]);

  // Handle Fullscreen Event changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!window.document.fullscreenElement);
    };
    window.document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!window.document.fullscreenElement) {
      window.document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.warn("Fullscreen request failed", err);
        setIsFullscreen(true);
      });
      setIsSidebarCollapsed(true);
    } else {
      window.document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(() => {
        setIsFullscreen(false);
      });
    }
  };

  // Extract Heading indices from element nodes in the DOM for Google Docs dynamic OUTLINE panel
  const [pageHeadings, setPageHeadings] = useState<{ id: string; text: string; level: number; top: number }[]>([]);
  
  // Real-time metrics
  const [editorMetrics, setEditorMetrics] = useState({
    words: 0,
    chars: 0,
    lines: 0,
    readTime: 1, // in minutes
  });

  const updateEditorMetricsAndHeadings = () => {
    if (!editor) return;
    const txt = editor.getText();
    const cleanWords = txt.trim() === '' ? 0 : txt.trim().split(/\s+/).length;
    const cleanChars = txt.length;
    const cleanLines = txt.trim() === '' ? 0 : txt.split('\n').length;
    const read = Math.ceil(cleanWords / 200) || 1;
    
    setEditorMetrics({
      words: cleanWords,
      chars: cleanChars,
      lines: cleanLines,
      readTime: read
    });

    // Scan rendering elements inside ProseMirror for Outlining indexes
    const prosemirrorDOM = window.document.querySelector('.ProseMirror');
    if (prosemirrorDOM) {
      const headingElements = prosemirrorDOM.querySelectorAll('h1, h2, h3');
      const tempHeads: any[] = [];
      headingElements.forEach((el, index) => {
        const hEl = el as HTMLElement;
        const text = hEl.innerText || hEl.textContent || 'Untitled Section';
        tempHeads.push({
          id: `heading-map-${index}`,
          text,
          level: hEl.tagName === 'H1' ? 1 : hEl.tagName === 'H2' ? 2 : 3,
          element: hEl
        });
      });
      setPageHeadings(tempHeads);
    }
  };

  useEffect(() => {
    if (!editor) return;
    editor.on('update', updateEditorMetricsAndHeadings);
    editor.on('selectionUpdate', updateEditorMetricsAndHeadings);
    // Initial compute short delay for element loading
    const t = setTimeout(updateEditorMetricsAndHeadings, 500);
    return () => {
      editor.off('update', updateEditorMetricsAndHeadings);
      editor.off('selectionUpdate', updateEditorMetricsAndHeadings);
      clearTimeout(t);
    };
  }, [editor, document?.id]);

  const scrollToHeading = (headingObj: any) => {
    if (headingObj.element) {
      headingObj.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Handle caret / selection float formatting bubbles
  const [bubbleMenuCoords, setBubbleMenuCoords] = useState<{ x: number; y: number } | null>(null);
  
  useEffect(() => {
    if (!editor) return;
    const handleSelectionUpdate = () => {
      const { selection } = editor.state;
      if (selection && !selection.empty) {
        try {
          // Calculate screen bounding coordinates
          const { from, to } = selection;
          const start = editor.view.coordsAtPos(from);
          const end = editor.view.coordsAtPos(to);
          
          const selectionLeft = Math.min(start.left, end.left);
          const selectionRight = Math.max(start.right, end.right);
          const selectionTop = Math.min(start.top, end.top);
          
          setBubbleMenuCoords({
            x: (selectionLeft + selectionRight) / 2,
            y: selectionTop - 55, // Position cleanly above highlighted selection
          });
        } catch {
          setBubbleMenuCoords(null);
        }
      } else {
        setBubbleMenuCoords(null);
      }
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor]);

  // Capture Slash commands "/" menu indicators
  useEffect(() => {
    if (!editor) return;
    const handleSlashCheck = () => {
      const { selection } = editor.state;
      const { $from } = selection;
      const currentBlockText = $from.nodeBefore?.text || '';
      
      // If block text ends exactly with /, trigger the menu
      if (currentBlockText.endsWith('/')) {
        const lastWord = currentBlockText.split(/\s+/).pop() || '';
        if (lastWord === '/') {
          // Fetch coordinates of cursor pos
          try {
            const cursorCoords = editor.view.coordsAtPos(selection.from);
            setFloatingMenuCoords({
              x: cursorCoords.left,
              y: cursorCoords.bottom + 10,
            });
            setIsSlashMenuOpen(true);
            setSlashSearchQuery('');
          } catch {
            setIsSlashMenuOpen(false);
          }
          return;
        }
      }
      setIsSlashMenuOpen(false);
    };

    editor.on('selectionUpdate', handleSlashCheck);
    return () => {
      editor.off('selectionUpdate', handleSlashCheck);
    };
  }, [editor]);

  // Executes inline formatting choice and strips trailing /
  const selectSlashBlock = (command: 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'task' | 'quote' | 'code' | 'callout' | 'hr') => {
    if (!editor) return;
    
    // Delete the "/" typed
    const { selection } = editor.state;
    editor.commands.deleteRange({ from: selection.from - 1, to: selection.from });

    // Format block type
    switch (command) {
      case 'h1':
        editor.commands.toggleHeading({ level: 1 });
        break;
      case 'h2':
        editor.commands.toggleHeading({ level: 2 });
        break;
      case 'h3':
        editor.commands.toggleHeading({ level: 3 });
        break;
      case 'ul':
        editor.commands.toggleBulletList();
        break;
      case 'ol':
        editor.commands.toggleOrderedList();
        break;
      case 'task':
        editor.commands.toggleTaskList();
        break;
      case 'quote':
        editor.commands.toggleBlockquote();
        break;
      case 'code':
        editor.commands.toggleCodeBlock();
        break;
      case 'callout':
        editor.commands.insertContent('<div class="notion-callout blue font-sans"><span class="text-xl">💡</span><div><p>Write an insightful notion callout box block here...</p></div></div>');
        break;
      case 'hr':
        editor.commands.setHorizontalRule();
        break;
    }
    
    setIsSlashMenuOpen(false);
    editor.commands.focus();
  };

  // Text color / highlight helpers inside Bubble menu
  const applyTextHighlight = (color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'clear') => {
    if (!editor) return;
    if (color === 'clear') {
      editor.commands.insertContent(editor.state.selection.content().content.textBetween(0, editor.state.selection.content().size));
    } else {
      const selectedText = editor.state.selection.content().content.textBetween(0, editor.state.selection.content().size);
      editor.commands.insertContent(`<span class="highlight-${color}">${selectedText}</span>`);
    }
    setBubbleMenuCoords(null);
  };

  // Smart Context-Aware AI Writing Generator (Typing effect)
  const triggerAICowriterText = (instruction: string) => {
    if (!editor) return;
    setIsAiGenerating(true);
    setDrawerTab('ai');
    setIsRightDrawerOpen(true);
    
    // Retrieve content selected if any, or general cursor block context
    const selection = editor.state.selection;
    const selectedText = selection.empty ? '' : editor.state.selection.content().content.textBetween(0, selection.content().size);
    const documentBodyText = editor.getText();
    
    let aiPromptPayload = `Context: Our document is titled "${document?.title || 'Draft document'}". `;
    if (selectedText) {
      aiPromptPayload += `User selected text block containing: "${selectedText}". `;
    }
    aiPromptPayload += `Instruction: ${instruction}. Please write high quality rich text documentation in compliance with our document topic.`;

    // Simulated/Real-Proxy intelligence responses matching standard templates
    setTimeout(() => {
      let resultText = '';
      if (instruction.toLowerCase().includes('outline')) {
        resultText = `<p>Here is an AI-generated draft overview structure:</p>` +
                     `<h1>1. Executive Summary</h1><p>Brief roadmap definitions and corporate values matching project scope.</p>` +
                     `<h2>2. Key Specifications</h2><ul><li>Modular design integration.</li><li>Responsive user metrics.</li><li>Continuous synchronization checks.</li></ul>` +
                     `<h3>3. Operations Timeline</h3><p>Implementation phases sequenced logically across quarterly milestones.</p>`;
      } else if (instruction.toLowerCase().includes('expand') || instruction.toLowerCase().includes('continue')) {
        resultText = `<p>Expanding upon the structural overview with deeper clarity: Our team targets continuous performance optimizations, guaranteeing sub-second latency targets. By isolating local SQLite threads from server syncing logic, clients experience consistent 60fps responsiveness even under intensive heavy file uploads. Additionally, future integrations with major storage buckets ensures large binaries load smoothly.</p>`;
      } else if (instruction.toLowerCase().includes('summarize')) {
        resultText = `<p><strong>Core Bullet summaries:</strong></p>` +
                     `<ul>` +
                     `<li><strong>Seamless Syncing</strong>: Atomic IndexedDB operations persist drafts locally during offline intervals.</li>` +
                     `<li><strong>Precision Outline</strong>: Dynamic heading scanning indexes the complete report layout automatically.</li>` +
                     `<li><strong>Type Control</strong>: Editorial Serifs paired with Modern Sans reinforces brand and style consistency.</li>` +
                     `</ul>`;
      } else {
        // Creative prompt continuation
        resultText = `<h1>Smart Document Extension</h1><p>We successfully designed the requested: "${instruction}". Our architecture integrates full data security, role permissions and link-sharing privileges. This system ensures collaboration sessions are encrypted and stored inside persistent sandbox containers.</p>`;
      }

      // Record in AI tab logs
      setAiAnswerHistory(prev => [instruction, ...prev]);
      
      // Animate Typing effect into TipTap Cursor location!
      let currentIndex = 0;
      const htmlParagraphs = resultText.match(/<[^>]+>|[^<]+/g) || [resultText];
      
      // Select cursor insert point
      editor.commands.focus();
      if (!selection.empty) {
        editor.commands.deleteSelection();
      }

      // Typed insertion interval
      const typeInterval = setInterval(() => {
        if (currentIndex < htmlParagraphs.length) {
          const chunk = htmlParagraphs[currentIndex];
          editor.commands.insertContent(chunk);
          currentIndex++;
        } else {
          clearInterval(typeInterval);
          setIsAiGenerating(false);
          setSaveBannerMessage('AI Completed Writing!');
          setTimeout(() => setSaveBannerMessage(null), 3500);
        }
      }, 75);

    }, 1800);
  };

  if (!document) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0d0e12] text-slate-400 p-8 text-center" id="editor-empty-state">
        <div className="max-w-md w-full py-16 px-8 rounded-xl bg-[#12141a]/40 border border-[#1e2028]/30 space-y-5 animate-scaleUp">
          <div className="h-10 w-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 mx-auto">
            <FileText className="h-4 w-4 text-slate-400" />
          </div>
          <div className="space-y-1.5 ">
            <h2 className="text-sm font-semibold text-slate-100 tracking-tight font-sans">Focus Your Workspace thoughts</h2>
            <p className="text-xs text-slate-400 font-sans max-w-xs mx-auto leading-relaxed">
              Create a modern markdown file, DOCX report, or plain text templates to write with Google Docs layout accuracy and Notion block flexibility!
            </p>
          </div>
          
          <button
            type="button"
            onClick={onToggleSettings}
            className="inline-flex items-center space-x-1.5 bg-[#f5f5f5] hover:bg-white text-slate-950 px-5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Open Diagnostics Console</span>
          </button>
        </div>

        {/* Minimal recent selection display below */}
        {documentsList.length > 0 && onSelectDoc && (
          <div className="mt-12 max-w-xl w-full text-left space-y-3 px-4">
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#5e6573] font-bold">
              Recent Workspace Documents
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {documentsList.slice(0, 4).map((d) => (
                <div 
                  key={d.id}
                  onClick={() => onSelectDoc(d)}
                  className="p-3 rounded-lg bg-[#12141a]/60 border border-[#1d1f27]/80 hover:border-[#2d313f]/80 transition-all cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-300 truncate font-semibold">{d.title}</p>
                      <p className="text-[9px] text-slate-500 font-mono mt-0.5 capitalize">{d.type} • {(d.size/1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const isOwner = document.permissions.owner === currentUser.email;
  const userDirectPermission = document.permissions.sharedWith.find(
    (invite) => invite.email === currentUser.email
  );

  const canEdit = isOwner || 
    (document.permissions.linkSharing === 'edit' && !isOffline) ||
    (userDirectPermission?.role === 'edit');

  const canView = isOwner ||
    document.permissions.linkSharing !== 'private' ||
    userDirectPermission !== undefined;

  const handleTitleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localTitle.trim()) {
      onTitleChange(localTitle.trim());
    }
  };

  // Styles formatting mappings
  const fontClass = fontTheme === 'serif' ? 'editor-font-serif' : fontTheme === 'mono' ? 'editor-font-mono' : 'editor-font-sans';
  const spacingClass = lineSpacing === 'compact' ? 'leading-snug' : lineSpacing === 'relaxed' ? 'leading-loose' : 'leading-relaxed';
  const marginClass = pageMargin === 'narrow' ? 'px-6 md:px-12' : pageMargin === 'wide' ? 'px-16 md:px-24' : 'px-12 md:px-18';

  return (
    <div className="flex-1 flex bg-[#0c0d12] text-slate-100 overflow-hidden relative" id="editor-active-container">
      
      {/* 1. NOTION-STYLE SLASH MENU / FLOAT BLOCK PICKER */}
      {isSlashMenuOpen && floatingMenuCoords && (
        <div 
          className="fixed z-50 w-64 bg-[#12141a] border border-[#21232e] rounded-lg shadow-2xl p-1 animate-scaleUp text-left"
          style={{ 
            top: `${floatingMenuCoords.y}px`, 
            left: `${floatingMenuCoords.x}px` 
          }}
        >
          <div className="p-1.5 border-b border-[#1b1d26] mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold block">Notion Commands</span>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-0.5">
            <button 
              onClick={() => selectSlashBlock('h1')}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1f212e] hover:text-white rounded transition-colors text-left"
            >
              <Heading1 className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <div>
                <p className="font-semibold text-xs">Heading 1</p>
                <p className="text-[9px] text-slate-500">Major section title</p>
              </div>
            </button>
            <button 
              onClick={() => selectSlashBlock('h2')}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1f212e] hover:text-white rounded transition-colors text-left"
            >
              <Heading2 className="h-3.5 w-3.5 text-indigo-450 shrink-0" />
              <div>
                <p className="font-semibold text-xs">Heading 2</p>
                <p className="text-[9px] text-slate-500">Medium section divider</p>
              </div>
            </button>
            <button 
              onClick={() => selectSlashBlock('h3')}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1f212e] hover:text-white rounded transition-colors text-left"
            >
              <Heading3 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <div>
                <p className="font-semibold text-xs">Heading 3</p>
                <p className="text-[9px] text-slate-500">Small subheading card</p>
              </div>
            </button>
            <button 
              onClick={() => selectSlashBlock('task')}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1f212e] hover:text-white rounded transition-colors text-left"
            >
              <ListCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-semibold text-xs">Checklist Task Block</p>
                <p className="text-[9px] text-slate-500">Check-off tasks inline</p>
              </div>
            </button>
            <button 
              onClick={() => selectSlashBlock('ul')}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1f212e] hover:text-white rounded transition-colors text-left"
            >
              <List className="h-3.5 w-3.5 text-sky-450 shrink-0" />
              <div>
                <p className="font-semibold text-xs">Bulleted List</p>
                <p className="text-[9px] text-slate-500">Standard bullet lines</p>
              </div>
            </button>
            <button 
              onClick={() => selectSlashBlock('quote')}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1f212e] hover:text-white rounded transition-colors text-left"
            >
              <Quote className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <div>
                <p className="font-semibold text-xs">Blockquote</p>
                <p className="text-[9px] text-slate-500">Quote text elegantly</p>
              </div>
            </button>
            <button 
              onClick={() => selectSlashBlock('callout')}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1f212e] hover:text-white rounded transition-colors text-left"
            >
              <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              <div>
                <p className="font-semibold text-xs">Callout Alert Block</p>
                <p className="text-[9px] text-slate-500">Notion visual advice alert</p>
              </div>
            </button>
            <button 
              onClick={() => selectSlashBlock('code')}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1f212e] hover:text-white rounded transition-colors text-left"
            >
              <FileJson className="h-3.5 w-3.5 text-slate-450 shrink-0" />
              <div>
                <p className="font-semibold text-xs">Code Block</p>
                <p className="text-[9px] text-slate-500">Syntax monospace box</p>
              </div>
            </button>
            <button 
              onClick={() => selectSlashBlock('hr')}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1f212e] hover:text-white rounded transition-colors text-left"
            >
              <Plus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <div>
                <p className="font-semibold text-xs">Divider line</p>
                <p className="text-[9px] text-slate-500">Horizontal section line</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 2. NOTION-STYLE BUBBLE FORMATTING POPUP MENU */}
      {bubbleMenuCoords && editor && (
        <div 
          className="fixed z-40 bg-[#141620] border border-[#272b3a] rounded-lg shadow-2xl p-1 flex items-center space-x-1 divide-x divide-slate-800 animate-scaleUp"
          style={{ 
            top: `${bubbleMenuCoords.y}px`, 
            left: `${bubbleMenuCoords.x}px`,
            transform: 'translateX(-50%)' 
          }}
        >
          <div className="flex items-center space-x-1 pr-1.5">
            <button 
              onClick={() => { editor.commands.toggleBold(); setBubbleMenuCoords(null); }}
              className={`p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer ${editor.isActive('bold') ? 'bg-[#1b253b] text-indigo-400' : ''}`}
              title="Bold text"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button 
              onClick={() => { editor.commands.toggleItalic(); setBubbleMenuCoords(null); }}
              className={`p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer ${editor.isActive('italic') ? 'bg-[#1b253b] text-indigo-400' : ''}`}
              title="Italic text"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button 
              onClick={() => { editor.commands.toggleCode(); setBubbleMenuCoords(null); }}
              className={`p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer ${editor.isActive('code') ? 'bg-[#1b253b] text-indigo-400' : ''}`}
              title="Convert to Inline Code"
            >
              <Scissors className="h-3.5 w-3.5" />
            </button>
          </div>
          
          <div className="flex items-center pl-1.5 pr-1.5 space-x-1.5">
            <span className="text-[9px] text-slate-500 font-mono tracking-wider">Highlight:</span>
            <button onClick={() => applyTextHighlight('yellow')} className="h-4 w-4 rounded-full bg-yellow-300 border border-yellow-500/20 hover:scale-115 transition-transform" />
            <button onClick={() => applyTextHighlight('green')} className="h-4 w-4 rounded-full bg-green-300 border border-green-500/20 hover:scale-115 transition-transform" />
            <button onClick={() => applyTextHighlight('blue')} className="h-4 w-4 rounded-full bg-blue-300 border border-blue-500/20 hover:scale-115 transition-transform" />
            <button onClick={() => applyTextHighlight('purple')} className="h-4 w-4 rounded-full bg-purple-300 border border-purple-500/20 hover:scale-115 transition-transform" />
            <button onClick={() => applyTextHighlight('clear')} className="text-[9px] text-slate-400 hover:text-white transition-colors font-semibold uppercase pr-1">Reset</button>
          </div>

          <div className="flex items-center pl-1.5">
            <button 
              onClick={() => {
                const selectedText = editor.state.selection.content().content.textBetween(0, editor.state.selection.content().size);
                triggerAICowriterText(`Summarize this select text briefly: "${selectedText}"`);
                setBubbleMenuCoords(null);
              }}
              className="flex items-center space-x-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold transition-all cursor-pointer"
            >
              <Sparkles className="h-3 w-3" />
              <span>Ask AI</span>
            </button>
          </div>
        </div>
      )}

      {/* LEFT CONTAINER: EXCEL WORKSPACE SHEET + Left Outline Table-of-Contents Drawer */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-[#151720] relative">
        
        {/* TOP MODULAR TOOLBAR SYSTEM (Google Docs style) */}
        {!isFullscreen && (
          <div 
            className="px-5 bg-[#0a0b0f] border-b border-[#14161f] flex flex-col justify-center divide-y divide-[#14161f] shrink-0"
            id="editor-top-bar"
          >
            {/* Top Bar Label / Profile Action column */}
            <div className="h-[48px] py-2 flex items-center justify-between gap-4">
              <div className="flex items-center space-x-3 min-w-0 flex-1">
                {isSidebarCollapsed && (
                  <button
                    type="button"
                    onClick={() => setIsSidebarCollapsed(false)}
                    className="p-1.5 rounded-md hover:bg-[#181a23] border border-[#1b1d26] text-slate-400 hover:text-slate-100 transition-colors cursor-pointer shrink-0"
                    title="Expand Sidebar"
                  >
                    <Menu className="h-4 w-4" />
                  </button>
                )}

                <form onSubmit={handleTitleSubmit} className="flex-1 flex items-center space-x-2.5">
                  <input
                    type="text"
                    value={localTitle}
                    onChange={(e) => setLocalTitle(e.target.value)}
                    onBlur={() => localTitle.trim() && onTitleChange(localTitle.trim())}
                    disabled={!canEdit}
                    className="font-sans font-medium text-xs bg-transparent border-b border-transparent hover:border-slate-800 focus:border-slate-700 px-1 py-0.5 text-slate-200 focus:outline-none max-w-sm truncate"
                    title="Edit document title"
                    id="editor-title-field"
                  />
                  {!canEdit && (
                    <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[8px] uppercase font-mono bg-slate-900 border border-slate-800 text-slate-500">
                      <Lock className="h-2.5 w-2.5" />
                      <span>Read Only</span>
                    </span>
                  )}
                </form>
              </div>

              {/* Presence indicators: Collaboration-Ready Simulation */}
              <div className="flex items-center space-x-4">
                <div className="hidden lg:flex items-center -space-x-1.5 mr-2" title="Colleagues active inside document">
                  <div className="w-6 h-6 rounded-full bg-emerald-600 border border-slate-950 flex items-center justify-center text-[9px] font-bold text-white uppercase" title="Sarah Chen (Editing introduction)">SC</div>
                  <div className="w-6 h-6 rounded-full bg-violet-600 border border-slate-950 flex items-center justify-center text-[9px] font-bold text-white uppercase" title="Marcus Vance (Reviewing specifications)">MV</div>
                  <div className="w-6 h-6 rounded-full bg-amber-500 border border-slate-950 flex items-center justify-center text-[9px] font-bold text-slate-950 uppercase" title="You (Writer)">ME</div>
                  <span className="text-[10px] text-slate-500 font-mono ml-2 pl-1.5">+2 active</span>
                </div>

                {saveBannerMessage && (
                  <span className="text-[10px] text-emerald-400 animate-fadeIn font-mono bg-[#111915] border border-emerald-950/35 px-2 py-1 rounded shrink-0">
                    {saveBannerMessage}
                  </span>
                )}

                {/* View Full Screen Icon Button */}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-md hover:bg-[#181a23] border border-transparent hover:border-[#21232e] text-slate-450 hover:text-slate-100 transition-colors cursor-pointer flex items-center"
                  title={isFullscreen ? "Exit Full Screen" : "Maximize view"}
                >
                  {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => setIsRightDrawerOpen(!isRightDrawerOpen)}
                  className={`p-1 px-2.5 py-1 text-xs font-semibold rounded-md border transition-all flex items-center gap-1.5 cursor-pointer ${
                    isRightDrawerOpen
                      ? 'bg-slate-800 border-slate-700 text-white'
                      : 'bg-transparent border-transparent text-slate-450 hover:text-slate-200'
                  }`}
                  title="Document details"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Inspect Settings</span>
                </button>
              </div>
            </div>

            {/* HIGHLY MODULAR DYNAMIC TOOLBAR (Google Docs Toolbar feel) */}
            <div className="py-2.5 flex items-center justify-between gap-4 overflow-x-auto text-xs text-slate-300">
              <div className="flex items-center space-x-1.5 overflow-x-auto shrink-0 pr-4">
                
                {/* 1. LAYOUT TOGGLE: Page style vs Fluid block view */}
                <div className="flex items-center bg-[#13151f] p-0.5 rounded border border-[#1d1f2a] mr-1.5">
                  <button 
                    onClick={() => setDocLayout('page')}
                    className={`px-2 py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${docLayout === 'page' ? 'bg-[#1e2238] text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Letter Padded Page View"
                  >
                    Page Sheets
                  </button>
                  <button 
                    onClick={() => setDocLayout('fluid')}
                    className={`px-2 py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${docLayout === 'fluid' ? 'bg-[#1e2238] text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Notion Fluid Canvas View"
                  >
                    Fluid Block
                  </button>
                </div>

                <div className="h-4 w-[1px] bg-slate-800" />

                {/* 2. TYPOGRAPHY SWITCH: Typography font theme selector */}
                <div className="flex items-center space-x-1" title="Style Typography family">
                  <button 
                    onClick={() => setFontTheme('sans')} 
                    className={`p-1 px-2 rounded hover:bg-[#181a23] transition-colors cursor-pointer flex items-center gap-1 text-[11px] ${fontTheme === 'sans' ? 'bg-indigo-950/50 border border-indigo-900/60 text-indigo-400 font-bold' : 'text-slate-400'}`}
                  >
                    <Type className="h-3 w-3" />
                    <span>Sans</span>
                  </button>
                  <button 
                    onClick={() => setFontTheme('serif')} 
                    className={`p-1 px-2 rounded hover:bg-[#181a23] transition-colors cursor-pointer flex items-center gap-1 text-[11px] ${fontTheme === 'serif' ? 'bg-indigo-950/50 border border-indigo-900/60 text-indigo-400 font-bold' : 'text-slate-400'}`}
                  >
                    <span>Serif</span>
                  </button>
                  <button 
                    onClick={() => setFontTheme('mono')} 
                    className={`p-1 px-2 rounded hover:bg-[#181a23] transition-colors cursor-pointer flex items-center gap-1 text-[11px] ${fontTheme === 'mono' ? 'bg-indigo-950/50 border border-indigo-900/60 text-indigo-400 font-bold' : 'text-slate-400'}`}
                  >
                    <span>Mono</span>
                  </button>
                </div>

                <div className="h-4 w-[1px] bg-slate-800" />

                {/* Font Family Dropdown */}
                <div className="relative shrink-0" ref={fontDropdownRef} id="font-family-dropdown-container">
                  <button
                    type="button"
                    onClick={() => {
                      if (canEdit) {
                        setIsFontDropdownOpen(!isFontDropdownOpen);
                        setFontSearchQuery('');
                      }
                    }}
                    disabled={!canEdit}
                    className="p-1 px-2.5 rounded hover:bg-[#181a23] hover:text-white border border-[#21232d] flex items-center justify-between text-[11px] font-semibold tracking-tight cursor-pointer gap-2 min-w-[130px] max-w-[170px] truncate"
                    title="Change font family"
                    id="font-family-trigger"
                  >
                    <span style={{ fontFamily: editor ? (editor.getAttributes('textStyle').fontFamily || 'Inter') : 'Inter' }} className="truncate">
                      {editor ? (editor.getAttributes('textStyle').fontFamily || 'Inter') : 'Inter'}
                    </span>
                    <ChevronDown className="h-3 w-3 text-slate-500 shrink-0" />
                  </button>

                  {isFontDropdownOpen && (
                    <div 
                      className="absolute left-0 mt-1.5 w-64 bg-[#12141a] border border-[#21232e] rounded-lg shadow-2xl p-1.5 z-50 text-left animate-scaleUp"
                      id="font-family-menu"
                    >
                      <div className="p-1 border-b border-[#1b1d26] mb-1.5">
                        <input
                          type="text"
                          placeholder="Search fonts..."
                          value={fontSearchQuery}
                          onChange={(e) => setFontSearchQuery(e.target.value)}
                          className="w-full bg-[#0a0b0f] text-xs text-slate-200 border border-[#21232d] rounded-md px-2 py-1 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                          id="font-family-search-input"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-1" id="font-family-items-list">
                        {STARTER_FONTS.filter((f) => 
                          f.name.toLowerCase().includes(fontSearchQuery.toLowerCase()) ||
                          f.category.toLowerCase().includes(fontSearchQuery.toLowerCase())
                        ).length === 0 ? (
                          <p className="text-[10px] text-slate-500 p-2 text-center" id="font-family-no-fonts">No fonts matches selection</p>
                        ) : (
                          ['Sans Serif', 'Serif', 'Monospace'].map((cat) => {
                            const catFonts = STARTER_FONTS.filter((f) => 
                              (f.name.toLowerCase().includes(fontSearchQuery.toLowerCase()) ||
                              f.category.toLowerCase().includes(fontSearchQuery.toLowerCase())) &&
                              f.category === cat
                            );
                            if (catFonts.length === 0) return null;
                            return (
                              <div key={cat} className="space-y-0.5">
                                <span className="text-[9px] font-mono tracking-wider uppercase text-slate-500 font-bold px-2 block py-0.5">
                                  {cat}
                                </span>
                                {catFonts.map((font) => {
                                  const currentActiveFont = editor ? (editor.getAttributes('textStyle').fontFamily || 'Inter') : 'Inter';
                                  const isSelected = currentActiveFont.toLowerCase() === font.name.toLowerCase();
                                  return (
                                    <button
                                      key={font.name}
                                      type="button"
                                      onClick={() => {
                                        editor?.chain().focus().setFontFamily(font.name).run();
                                        setIsFontDropdownOpen(false);
                                      }}
                                      className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between hover:bg-[#1f212e] transition-colors ${
                                        isSelected ? 'bg-indigo-950/45 text-indigo-400 font-bold' : 'text-slate-300'
                                      }`}
                                      id={`font-option-${font.name.replace(/\s+/g, '-')}`}
                                    >
                                      <div className="flex flex-col min-w-0 flex-1">
                                        <span className="text-[8px] text-[#5e6573] font-sans">Preview</span>
                                        <span style={{ fontFamily: font.name }} className="text-sm truncate">
                                          {font.name}
                                        </span>
                                      </div>
                                      {isSelected && <span className="text-indigo-400 font-bold text-xs shrink-0 select-none ml-1">✓</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-4 w-[1px] bg-slate-800" />

                {/* 3. ZOOM LEVEL SCALE */}
                <div className="flex items-center space-x-1.5" title="Scale Page Canvas container size">
                  <ZoomIn className="h-3.5 w-3.5 text-slate-500" />
                  <select 
                    value={zoomLevel} 
                    onChange={(e) => setZoomLevel(Number(e.target.value))}
                    className="bg-[#12141a] border border-[#21232d] rounded px-1.5 py-1 text-[10px] font-mono text-slate-300 focus:outline-none"
                  >
                    <option value={75}>75%</option>
                    <option value={90}>90%</option>
                    <option value={100}>100%</option>
                    <option value={110}>110%</option>
                    <option value={125}>125%</option>
                    <option value={150}>150%</option>
                  </select>
                </div>

                <div className="h-4 w-[1px] bg-slate-800" />

                {/* 4. MARGIN SIZE BOUNDS */}
                {docLayout === 'page' && (
                  <div className="flex items-center space-x-1.5" title="Page Sheets printable margins width">
                    <span className="text-[10px] text-slate-500">Margin:</span>
                    <select 
                      value={pageMargin} 
                      onChange={(e) => setPageMargin(e.target.value as any)}
                      className="bg-[#12141a] border border-[#21232d] rounded px-1.5 py-1 text-[10px] text-slate-300 focus:outline-none"
                    >
                      <option value="standard">Standard</option>
                      <option value="narrow">Narrow (1/2)</option>
                      <option value="wide">Wide (2x)</option>
                    </select>
                  </div>
                )}

                <div className="h-4 w-[1px] bg-slate-800" />

                {/* 5. MANUAL EDIT TOOL FORMATS (For fast access when edit mode is toggled) */}
                {canEdit && editor && (
                  <div className="flex items-center space-x-1 pl-1">
                    <button
                      type="button"
                      onClick={() => editor.commands.toggleBold()}
                      className={`p-1.5 rounded hover:bg-[#181a23] transition-colors cursor-pointer ${editor.isActive('bold') ? 'text-indigo-400 bg-slate-900' : 'text-slate-400'}`}
                      title="Bold Selection"
                    >
                      <Bold className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => editor.commands.toggleItalic()}
                      className={`p-1.5 rounded hover:bg-[#181a23] transition-colors cursor-pointer ${editor.isActive('italic') ? 'text-indigo-400 bg-slate-900' : 'text-slate-400'}`}
                      title="Italic Selection"
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => editor.commands.toggleBulletList()}
                      className={`p-1.5 rounded hover:bg-[#181a23] transition-colors cursor-pointer ${editor.isActive('bulletList') ? 'text-indigo-400 bg-slate-900' : 'text-slate-400'}`}
                      title="Bullet List"
                    >
                      <List className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => editor.commands.toggleTaskList()}
                      className={`p-1.5 rounded hover:bg-[#181a23] transition-colors cursor-pointer ${editor.isActive('taskList') ? 'text-indigo-400 bg-slate-900' : 'text-slate-400'}`}
                      title="TaskList checkbox block"
                    >
                      <ListCheck className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => editor.commands.toggleBlockquote()}
                      className={`p-1.5 rounded hover:bg-[#181a23] transition-colors cursor-pointer ${editor.isActive('blockquote') ? 'text-indigo-400 bg-slate-900' : 'text-slate-400'}`}
                      title="Notion blockquote text"
                    >
                      <Quote className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Toggle Outlines T.O.C helper button */}
              <button 
                onClick={() => setIsOutlineOpen(!isOutlineOpen)}
                className={`py-1 px-2.5 rounded hover:bg-[#181a23] transition-colors flex items-center space-x-1 cursor-pointer select-none text-[10px] font-bold ${isOutlineOpen ? 'text-indigo-400 bg-[#161a29]' : 'text-slate-500'}`}
                title="Google Docs Outline Drawer toggles"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>Outline Panel</span>
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Canvas Workspace: Scroll wrap holds A4 physical standard card OR fluid Notion sheet */}
        <div className="flex-1 flex overflow-hidden relative">
          
          {/* Dynamic Left Document Outline Table-Of-Contents Panel (Google Docs style) */}
          {isOutlineOpen && !isFullscreen && (
            <div 
              className="w-56 md:w-64 border-r border-[#14161f] bg-[#0c0d12] flex flex-col shrink-0 text-left"
              id="google-docs-outline-panel"
            >
              <div className="p-4 border-b border-[#14161f] flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Document Outline</span>
                <span className="text-[9px] text-[#5e6673] font-mono px-1.5 bg-[#12141a] rounded">{pageHeadings.length} tags</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {pageHeadings.length === 0 ? (
                  <p className="text-[11px] text-slate-500 leading-normal font-sans">
                    No headings mapped yet. Use H1, H2, or H3 tags in your rich text blocks to compiled table-of-contents instantly.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {pageHeadings.map((head, i) => (
                      <div 
                        key={head.id}
                        onClick={() => scrollToHeading(head)}
                        className={`text-slate-450 hover:text-white hover:bg-[#13151f] p-1.5 rounded cursor-pointer transition-all truncate select-none text-[11px] tracking-tight ${
                          head.level === 1 ? 'pl-1 font-semibold border-l-2 border-indigo-500 text-slate-200' :
                          head.level === 2 ? 'pl-4 border-l border-slate-800' : 'pl-7 text-[10px] text-slate-500'
                        }`}
                        title={`Jump scroll to ${head.text}`}
                      >
                        {head.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MAIN INNER SCROLL CONTAINER */}
          <div 
            className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#07080b] flex justify-center transition-all duration-300" 
            id="workspace-scroll-wrap"
          >
            {/* Permission guard logic */}
            {!canView ? (
              <div className="self-center text-center p-8 max-w-md bg-[#12141a]/60 border border-slate-800 rounded-xl space-y-4">
                <Lock className="h-8 w-8 text-slate-500 mx-auto" />
                <h2 className="text-sm font-semibold text-slate-200">Private Document</h2>
                <p className="text-xs text-slate-400 font-sans leading-relaxed">
                  This report has been restricted by its workspace owner. Swap user context or request sharing access to open.
                </p>
              </div>
            ) : (
              /* DOCK SHEET: zoom scaling factor is applied using transform on the sheet */
              <div 
                className="w-full flex flex-col items-center origin-top translate-y-2 transition-all duration-300"
                style={{ 
                  transform: `scale(${zoomLevel / 100})`, 
                  width: zoomLevel < 100 ? '115%' : '100%',
                  marginTop: `${(zoomLevel - 100) * 0.15}px`
                }}
              >
                {/* 1. GOOGLE DOCS PHYSICAL PANEL SHEET */}
                {docLayout === 'page' ? (
                  <div 
                    className="max-w-4xl w-full min-h-[1123px] bg-white text-slate-900 rounded shadow-2xl border border-slate-200 flex flex-col p-16 md:p-20 relative relative text-left" 
                    id="paper-sheet"
                  >
                    {/* Google Docs Page Header visual mock */}
                    <div className="absolute top-6 left-16 right-16 flex items-center justify-between text-[10px] text-slate-400 font-sans border-b border-slate-100 pb-1.5 tracking-tight uppercase select-none">
                      <input 
                        type="text" 
                        value={headerText} 
                        onChange={(e) => setHeaderText(e.target.value)}
                        className="bg-transparent border-0 font-sans focus:ring-0 p-0 text-[10px] text-slate-400 truncate w-3/4 max-w-sm"
                        title="Edit page paper header text"
                      />
                      <span>Page {Math.floor(editorMetrics.words / 250) + 1}</span>
                    </div>

                    {/* Left Page Ruler simulation line */}
                    <div className="absolute top-20 left-4 h-1 w-1 bg-indigo-500/10 rounded-full" />

                    {/* Canvas Main content body with custom classes defined in index.css */}
                    <div className={`flex-1 ${fontClass} ${spacingClass} ${marginClass} mt-4`}>
                      {activeMode === 'view' ? (
                        <div 
                          className="prose prose-slate max-w-none text-slate-800"
                          dangerouslySetInnerHTML={{ 
                            __html: document.type === 'md' ? markdownToHtml(document.content) : document.content 
                          }}
                        />
                      ) : (
                        <EditorContent 
                          editor={editor} 
                          className={`min-h-[900px] text-slate-800 focus:outline-none`} 
                        />
                      )}
                    </div>

                    {/* Google Docs Page Footer visual mock */}
                    <div className="absolute bottom-6 left-16 right-16 flex items-center justify-between text-[10px] text-slate-400 font-sans border-t border-slate-100 pt-1.5 tracking-tight select-none">
                      <input 
                        type="text" 
                        value={footerText} 
                        onChange={(e) => setFooterText(e.target.value)}
                        className="bg-transparent border-0 font-sans focus:ring-0 p-0 text-[10px] text-slate-400 truncate w-2/3 max-w-sm"
                        title="Edit page paper footer text"
                      />
                      <span className="font-mono text-[9px]">Words: {editorMetrics.words}</span>
                    </div>
                  </div>
                ) : (
                  /* 2. NOTION IMMERSIVE FLUID CANVAS SHEET */
                  <div className="max-w-4xl w-full flex flex-col text-left" id="notion-fluid-sheet">
                    <div className="p-4 py-8 rounded-xl bg-[#0c0d12] border border-[#1b1d28] p-8 md:p-14 relative shadow-2xl">
                      {/* Cool Notion Top Banner placeholder visual */}
                      <div className="h-28 w-full bg-gradient-to-r from-indigo-950/40 via-[#12141a] to-[#0c0d12] border-b border-[#21232e] rounded-lg mb-8 flex items-end p-4">
                        <div className="text-2xl" title="Notion page icon">📁</div>
                      </div>

                      <div className={`${fontClass} ${spacingClass} text-slate-250`}>
                        {activeMode === 'view' ? (
                          <div 
                            className="prose prose-slate prose-invert max-w-none text-slate-300"
                            dangerouslySetInnerHTML={{ 
                              __html: document.type === 'md' ? markdownToHtml(document.content) : document.content 
                            }}
                          />
                        ) : (
                          <EditorContent 
                            editor={editor} 
                            className="min-h-[700px] text-slate-200 focus:outline-none" 
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Status / Precision counts bar inside workspace */}
        {!isFullscreen && (
          <div className="px-5 py-2.5 bg-[#0a0b0f] border-t border-[#14161f] flex flex-col md:flex-row md:items-center justify-between text-[10px] text-slate-500 font-mono gap-1.5 shrink-0 text-left">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>Lines Count: <strong className="text-slate-350">{editorMetrics.lines}</strong></span>
              <span>Words: <strong className="text-slate-350">{editorMetrics.words}</strong></span>
              <span>Characters: <strong className="text-slate-350">{editorMetrics.chars}</strong></span>
              <span>Bytes size: <strong className="text-slate-350">{(getByteSize(document.content)/1024).toFixed(3)} KB</strong></span>
            </div>
            <div className="flex items-center space-x-3.5">
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-3 w-3" />
                <span>Estimate Reading Speed: <strong className="text-slate-300">{editorMetrics.readTime} min</strong></span>
              </span>
              <span className="text-[#515c6e]">•</span>
              <span className="capitalize text-slate-450 font-bold">Format: {document.type}</span>
            </div>
          </div>
        )}

        {/* FLOATING ACTION SPEED DIALS */}
        {!isFullscreen && (
          <div 
            className="absolute bottom-6 right-6 z-30 flex flex-col gap-3" 
            id="floating-actions-container"
          >
            {/* Toggle active viewing mode states */}
            <button
              type="button"
              onClick={() => {
                setActiveMode(activeMode === 'edit' ? 'view' : 'edit');
              }}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl cursor-pointer border ${
                activeMode === 'edit'
                  ? 'bg-[#1e1c12] text-amber-400 border-amber-500/35'
                  : 'bg-[#12141d] text-indigo-400 border border-indigo-500/30'
              }`}
              title={activeMode === 'edit' ? "Switch to View mode" : "Switch to Edit mode"}
            >
              {activeMode === 'edit' ? <Eye className="h-5 w-5" /> : <Edit3 className="h-5 w-5" />}
            </button>
            
            {/* Export options selection dropdown trigger */}
            <div className="relative group/export-dial">
              <button
                type="button"
                className="w-11 h-11 bg-indigo-650 hover:bg-indigo-600 border border-indigo-500/30 rounded-full flex items-center justify-center transition-all shadow-2xl cursor-pointer text-white"
                title="Save & Export Options Drawer"
              >
                <Download className="h-5 w-5" />
              </button>
              
              {/* Floating choices trigger on hover/focus */}
              <div className="absolute right-0 bottom-full mb-3 w-48 bg-[#12141a] border border-[#232631] rounded-lg shadow-2xl py-1 opacity-0 pointer-events-none group-hover/export-dial:opacity-100 group-hover/export-dial:pointer-events-auto transition-all animate-fadeIn text-left text-xs font-sans">
                <button
                  onClick={() => {
                    setSaveBannerMessage('Autosaved Clean Draft');
                    setTimeout(() => setSaveBannerMessage(null), 3500);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-[#181a22] hover:text-white text-slate-300 flex items-center space-x-2"
                >
                  <Save className="h-3.5 w-3.5 text-slate-500" />
                  <span>Save local backup</span>
                </button>
                <button
                  onClick={() => {
                    const cleanTitle = document.title.replace(/\.[^/.]+$/, "");
                    onSaveAs?.(document, `${cleanTitle} - Copy`);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-[#181a22] hover:text-white text-slate-300 flex items-center space-x-2"
                >
                  <Share2 className="h-3.5 w-3.5 text-slate-500" />
                  <span>Duplicate file copy</span>
                </button>
                <button
                  onClick={() => onExportPDF(document)}
                  className="w-full text-left px-3.5 py-2 hover:bg-[#181a22] hover:text-white text-slate-300 flex items-center space-x-2 border-t border-[#1d1f27]"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  <span>Export as PDF document</span>
                </button>
                <button
                  onClick={() => {
                    // Export raw markdown
                    const html = editor ? editor.getHTML() : document.content;
                    const md = htmlToMarkdown(html);
                    const blob = new Blob([md], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = window.document.createElement('a');
                    a.href = url;
                    a.download = `${document.title.replace(/\.[^/.]+$/, "")}.md`;
                    a.click();
                    setSaveBannerMessage('Markdown Downloaded!');
                    setTimeout(() => setSaveBannerMessage(null), 3000);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-[#181a22] hover:text-white text-slate-300 flex items-center space-x-2"
                >
                  <Plus className="h-3.5 w-3.5 text-slate-500" />
                  <span>Export as Markdown (.md)</span>
                </button>
                <button
                  onClick={() => onSaveAndExit?.()}
                  className="w-full text-left px-3.5 py-2 hover:bg-[#181a22] hover:text-white text-slate-300 flex items-center space-x-2 border-t border-[#1d1f27]"
                >
                  <FileText className="h-3.5 w-3.5 text-slate-500" />
                  <span>Save & Close report</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT DRAWER MODULE (Settings, Collaborator shares & AI assistant) */}
      {!isFullscreen && isRightDrawerOpen && (
        <div 
          className="w-72 md:w-80 border-l border-[#1d1f27] bg-[#12141a] h-full flex flex-col shrink-0 animate-slideLeft z-30 font-sans"
          id="right-drawer-container"
        >
          {/* Header configuration navigation */}
          <div className="border-b border-[#1d1f27] bg-[#101217] p-3 flex items-center justify-between">
            <div className="flex bg-[#181a22] p-0.5 rounded-lg border border-[#21232e]">
              <button
                type="button"
                onClick={() => setDrawerTab('info')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  drawerTab === 'info' ? 'bg-[#222530] text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Settings
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('share')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  drawerTab === 'share' ? 'bg-[#222530] text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sharing
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('ai')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors flex items-center gap-1 ${
                  drawerTab === 'ai' ? 'bg-indigo-950/50 text-indigo-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="h-3 w-3 text-indigo-400" />
                <span>AI Writer</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsRightDrawerOpen(false)}
              className="p-1.5 rounded hover:bg-slate-900 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Drawer tab bodies scroll area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-slate-300 text-left">
            
            {/* FILE SETTINGS METADATA */}
            {drawerTab === 'info' && (
              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Document Volume Card</h4>
                  <div className="bg-[#181a22] p-3 rounded-lg border border-[#1e2029]/60 space-y-2.5 font-mono text-xs text-left">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Owner role:</span>
                      <span className="text-slate-200 truncate max-w-[120px]">{document.permissions.owner}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">File format:</span>
                      <span className="text-slate-200 uppercase font-bold">{document.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Character size:</span>
                      <span className="text-slate-200">{editorMetrics.chars} words</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cloud Sync:</span>
                      <span className={`capitalize font-semibold ${
                        document.syncStatus === 'synced' ? 'text-emerald-400' : 'text-amber-500 animate-pulse'
                      }`}>{document.syncStatus}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Layout Zoom presets</h4>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[75, 100, 125].map(scale => (
                      <button 
                        key={scale}
                        onClick={() => setZoomLevel(scale)}
                        className={`py-1 text-[10px] rounded border font-mono ${zoomLevel === scale ? 'border-indigo-500 bg-indigo-950/20 text-indigo-400' : 'border-slate-800 text-slate-400 hover:text-white'}`}
                      >
                        {scale}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-[#1d1f27]">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Synchronization operations</h4>
                  <button
                    onClick={() => onTriggerSync(document.id)}
                    disabled={isOffline}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-colors ${
                      isOffline 
                        ? 'bg-[#181a22] text-slate-500 border border-slate-850 cursor-not-allowed' 
                        : 'bg-indigo-650 hover:bg-indigo-600 text-white cursor-pointer'
                    }`}
                  >
                    <span>Trigger Manual cloud Sync</span>
                  </button>
                </div>

                {/* Conflict Resolves Choice if collision parsed */}
                {document.syncStatus === 'conflict' && (
                  <div className="p-3 bg-[#241315] border border-rose-950 rounded-lg space-y-3 mt-2 text-left">
                    <p className="text-[10px] text-rose-400 font-mono font-bold flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Surgical Conflict Queue</span>
                    </p>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      Server version differs significantly. Select file overrides choice:
                    </p>

                    <button
                      type="button"
                      onClick={() => onResolveConflict(document.id, document.content)}
                      className="w-full bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 py-1 rounded text-[10px] font-semibold border border-amber-800 transition-colors"
                    >
                      Enforce Your local block
                    </button>

                    <button
                      type="button"
                      onClick={() => onResolveConflict(document.id, document.originalContent || '')}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-1 rounded text-[10px] font-semibold transition-colors"
                    >
                      Receive Remote cloud Version
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* COLLABORATOR SHARE */}
            {drawerTab === 'share' && (
              <div className="space-y-4 text-xs text-left">
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Link Exposure limits</h4>
                  <div className="space-y-1.5">
                    {(['private', 'view', 'edit'] as SharingPermission[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => isOwner && onUpdatePermissions(document.id, { linkSharing: mode })}
                        disabled={!isOwner}
                        className={`w-full text-left p-2.5 rounded-lg border text-xs flex flex-col gap-0.5 transition-all ${
                          !isOwner ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                        } ${
                          document.permissions.linkSharing === mode
                            ? 'bg-slate-800/80 border-slate-600 text-slate-100'
                            : 'bg-[#181a22] border-transparent text-slate-450 hover:text-slate-300'
                        }`}
                      >
                        <span className="font-semibold capitalize text-slate-200">{mode} sharing link</span>
                        <span className="text-[10px] text-slate-500 leading-tight">
                          {mode === 'private' ? 'Only specified partners can view.' :
                           mode === 'view' ? 'Anyone carrying this link can view.' : 'Anyone holding the link can fully edit.'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#1d1f27]">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-2">Team Direct Access</h4>
                  <div className="space-y-2">
                    <div className="flex bg-[#181a22] p-2 rounded-lg items-center justify-between">
                      <span className="font-semibold text-slate-200">sarah@docs.co</span>
                      <span className="text-[10px] text-slate-500 bg-[#252a3d] px-1.5 py-0.5 rounded text-indigo-400">Editor</span>
                    </div>
                    <div className="flex bg-[#181a22] p-2 rounded-lg items-center justify-between">
                      <span className="font-semibold text-slate-200">marcus@developer.org</span>
                      <span className="text-[10px] text-slate-500 bg-[#252a3d] px-1.5 py-0.5 rounded text-indigo-400">Editor</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FUTURE AI SUPPORT ENGINE DRAWERS */}
            {drawerTab === 'ai' && (
              <div className="space-y-4 text-xs text-left" id="ai-co-writer-section">
                <div className="p-3.5 bg-indigo-950/20 rounded-lg border border-indigo-900/35 space-y-2">
                  <div className="flex items-center space-x-2 text-indigo-400 font-bold font-sans">
                    <Sparkles className="h-4 w-4" />
                    <span className="uppercase text-[10px] tracking-wider">AI Co-Writer Panel</span>
                  </div>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed font-sans mt-1">
                    Select text paragraphs to trigger active bubbles, or choose automated writing guidelines from below to extend your report contextually.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Custom Writing Instruction</span>
                  <div className="relative">
                    <textarea 
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="e.g., Draft an executive Roadmap summary with 3 bullet items"
                      className="w-full h-20 bg-[#181a22] text-slate-200 placeholder-slate-600 border border-[#232631] rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (aiPrompt.trim()) {
                        triggerAICowriterText(aiPrompt.trim());
                        setAiPrompt('');
                      }
                    }}
                    disabled={isAiGenerating || !aiPrompt.trim()}
                    className="w-full bg-indigo-650 hover:bg-indigo-600 disabled:bg-slate-800 disabled:text-slate-500 hover:text-white font-semibold py-2 rounded-lg transition-colors flex items-center justify-center space-x-2 cursor-pointer select-none"
                  >
                    {isAiGenerating ? (
                      <span className="h-3 w-3 border-2 border-indigo-200 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    <span>{isAiGenerating ? 'Completing content...' : 'Generate and Write'}</span>
                  </button>
                </div>

                {/* AI Auxiliary Quick Prompts selectors */}
                <div className="space-y-2 pt-2 border-t border-[#1d1f27]">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Suggested AI Commands</span>
                  <div className="space-y-1.5 font-sans text-xs">
                    <button 
                      onClick={() => triggerAICowriterText('Draft a comprehensive detailed report outline')}
                      disabled={isAiGenerating}
                      className="w-full text-left p-2.5 bg-[#181a22] hover:bg-[#1e202e] text-slate-300 hover:text-white rounded border border-transparent hover:border-[#272a3a] transition-all cursor-pointer flex items-center justify-between"
                    >
                      <span>Draft full report outline template</span>
                      <ChevronRight className="h-3 w-3 text-slate-500" />
                    </button>
                    <button 
                      onClick={() => triggerAICowriterText('Summarize current text sections with 3 core bullets')}
                      disabled={isAiGenerating}
                      className="w-full text-left p-2.5 bg-[#181a22] hover:bg-[#1e202e] text-slate-300 hover:text-white rounded border border-transparent hover:border-[#272a3a] transition-all cursor-pointer flex items-center justify-between"
                    >
                      <span>Summarize text in concise notes</span>
                      <ChevronRight className="h-3 w-3 text-slate-500" />
                    </button>
                    <button 
                      onClick={() => triggerAICowriterText('Expand selection paragraph with precise business statistics')}
                      disabled={isAiGenerating}
                      className="w-full text-left p-2.5 bg-[#181a22] hover:bg-[#1e202e] text-slate-300 hover:text-white rounded border border-transparent hover:border-[#272a3a] transition-all cursor-pointer flex items-center justify-between"
                    >
                      <span>Expand paragraph with statistics</span>
                      <ChevronRight className="h-3 w-3 text-slate-500" />
                    </button>
                  </div>
                </div>

                {/* Answer log histories */}
                {aiAnswerHistory.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[#1d1f27]" id="ai-drawer-logs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono block">AI Generation History</span>
                    <div className="space-y-2 max-h-40 overflow-y-auto font-mono text-[9px] text-[#717b8f]">
                      {aiAnswerHistory.map((h, index) => (
                        <div key={index} className="bg-[#181a22] p-1.5 rounded truncate" title={h}>
                          • {h}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
