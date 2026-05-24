/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Eye, Edit3, Share2, Info, Lock, AlertTriangle, FileText, 
  Heading1, Heading2, Bold, Italic, List, Shield, Download, Menu, ChevronRight, Users, Globe, Settings, CornerUpLeft, CornerUpRight,
  Save, ChevronDown, Maximize, Minimize
} from 'lucide-react';
import { Document, WorkspaceMode, AppUser, SharingPermission } from '../types';
import { getByteSize } from '../db';

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
  documentsList?: Document[]; // Optional reference for recent files drawer when none is open
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
  const [drawerTab, setDrawerTab] = useState<'info' | 'share' | 'sync'>('info');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'view' | 'edit'>('view');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!window.document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);
      if (!isCurrentlyFullscreen) {
        // Unlock screen orientation when exiting fullscreen
        try {
          const anyScreen = screen as any;
          if (anyScreen.orientation && typeof anyScreen.orientation.unlock === 'function') {
            anyScreen.orientation.unlock();
          }
        } catch (err) {
          console.warn("Screen orientation unlock failed:", err);
        }
      }
    };
    window.document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    const anyScreen = screen as any;
    if (!window.document.fullscreenElement) {
      window.document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
        // Lock screen orientation to match current display mode (portrait vs landscape)
        try {
          if (anyScreen.orientation && typeof anyScreen.orientation.lock === 'function') {
            const currentOrientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
            anyScreen.orientation.lock(currentOrientation).catch((err: any) => {
              console.warn("Screen orientation lock rejected:", err);
            });
          }
        } catch (err) {
          console.warn("Screen orientation lock API error:", err);
        }
      }).catch((err) => {
        console.warn("Fullscreen request failed", err);
        setIsFullscreen(true);
      });
      // Also trigger sidebar collapse for cleaner look
      setIsSidebarCollapsed(true);
    } else {
      try {
        if (anyScreen.orientation && typeof anyScreen.orientation.unlock === 'function') {
          anyScreen.orientation.unlock();
        }
      } catch (err) {
        console.warn("Screen orientation unlock failed:", err);
      }
      window.document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(() => {
        setIsFullscreen(false);
      });
    }
  };
  
  // Scroll hide / show state (hide on scrolling up, show on scrolling down)
  const [hideOnScroll, setHideOnScroll] = useState(false);

  useEffect(() => {
    let lastScrollTop = 0;
    
    const handleScrollEvent = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target || typeof target.scrollTop === 'undefined') return;
      
      const currentScrollTop = target.scrollTop;
      
      // If we are close or at the very top of the scrolled element, make sure everything is visible
      if (currentScrollTop <= 10) {
        setHideOnScroll(false);
        lastScrollTop = currentScrollTop;
        return;
      }
      
      const diff = currentScrollTop - lastScrollTop;
      
      // Filter out small scrolling jitters
      if (Math.abs(diff) > 2) {
        if (diff < 0) {
          // Scrolling UP (scrollbar moves up towards 0, scrollTop decreases) -> immediately reappear!
          setHideOnScroll(false);
        } else {
          // Scrolling DOWN (scrollbar moves down, scrollTop increases) -> immediately disappear!
          setHideOnScroll(true);
        }
        lastScrollTop = currentScrollTop;
      }
    };

    // Use capture phase (true) to intercept scroll events dispatched by any scrollable element inside the editor
    window.addEventListener('scroll', handleScrollEvent, true);

    return () => {
      window.removeEventListener('scroll', handleScrollEvent, true);
    };
  }, []);

  // Save options dropdown states
  const [showSaveDropdown, setShowSaveDropdown] = useState(false);
  const [isPromptingSaveAs, setIsPromptingSaveAs] = useState(false);
  const [saveAsTitle, setSaveAsTitle] = useState('');
  const [saveBannerMessage, setSaveBannerMessage] = useState<string | null>(null);
  
  const saveDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (saveDropdownRef.current && !saveDropdownRef.current.contains(event.target as Node)) {
        setShowSaveDropdown(false);
        setIsPromptingSaveAs(false);
      }
    }
    window.document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Clean undo/redo buffers for document editing
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isHistoryUpdate, setIsHistoryUpdate] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (document) {
      setLocalTitle(document.title);
      // Reset undo history for the new active document
      setHistory([document.content]);
      setHistoryIndex(0);
    }
  }, [document?.id]);

  // Capture code content changes to update history indices gently
  const handleContentEdit = (newVal: string) => {
    onContentChange(newVal);

    if (isHistoryUpdate) {
      setIsHistoryUpdate(false);
      return;
    }

    const nextHist = history.slice(0, historyIndex + 1);
    nextHist.push(newVal);
    // Limit history stack size to 50
    if (nextHist.length > 50) nextHist.shift();
    setHistory(nextHist);
    setHistoryIndex(nextHist.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0 && document) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      setIsHistoryUpdate(true);
      onContentChange(history[prevIdx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1 && document) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setIsHistoryUpdate(true);
      onContentChange(history[nextIdx]);
    }
  };

  if (!document) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0d0e12] text-slate-400 p-8 text-center" id="editor-empty-state">
        <div className="max-w-md w-full py-16 px-8 rounded-xl bg-[#12141a]/40 border border-[#1e2028]/30 space-y-5 animate-scaleUp">
          <div className="h-10 w-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 mx-auto">
            <FileText className="h-4 w-4 text-slate-400" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-medium text-slate-100 tracking-tight">Focus Your Thoughts</h2>
            <p className="text-xs text-slate-400 font-sans max-w-xs mx-auto leading-relaxed">
              Create a modern markdown file or import rich DOCX reports to write with surgical precision and control.
            </p>
          </div>
          
          <button
            type="button"
            onClick={onToggleSettings}
            className="inline-flex items-center space-x-1.5 bg-[#f5f5f5] hover:bg-white text-slate-950 px-5 py-2 text-xs font-semibold rounded-lg transition-all"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Open Workspace Diagnostics</span>
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

  // Formatting injector matching caret positions
  const injectFormatting = (syntax: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = document.content;
    const selected = text.substring(start, end);

    let replacement = '';
    if (syntax === 'h1') replacement = `# ${selected || 'Heading'}\n`;
    else if (syntax === 'h2') replacement = `## ${selected || 'Subheading'}\n`;
    else if (syntax === 'bold') replacement = `**${selected || 'bold text'}**`;
    else if (syntax === 'italic') replacement = `*${selected || 'italic text'}*`;
    else if (syntax === 'list') replacement = `\n- ${selected || 'list item'}`;

    const newContent = text.substring(0, start) + replacement + text.substring(end);
    handleContentEdit(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + replacement.length, start + replacement.length);
    }, 50);
  };

  const handleTitleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localTitle.trim()) {
      onTitleChange(localTitle.trim());
    }
  };

  // Custom Markdown Parser rendering beautifully spaced typography
  const renderMarkdown = (markdown: string) => {
    const lines = markdown.split('\n');
    const items: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      if (line.startsWith('# ')) {
        items.push(<h1 key={index} className="text-2xl font-sans font-semibold text-slate-100 mt-6 mb-3 tracking-tight pb-1">{line.slice(2)}</h1>);
      } else if (line.startsWith('## ')) {
        items.push(<h2 key={index} className="text-lg font-sans font-semibold text-slate-200 mt-5 mb-2 tracking-tight">{line.slice(3)}</h2>);
      } else if (line.startsWith('### ')) {
        items.push(<h3 key={index} className="text-base font-sans font-semibold text-slate-300 mt-4 mb-1.5 tracking-tight">{line.slice(4)}</h3>);
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        items.push(
          <li key={index} className="ml-4 list-disc text-slate-300 text-sm leading-relaxed mb-1 font-sans">
            {line.slice(2)}
          </li>
        );
      } else if (line.trim() === '---') {
        items.push(<hr key={index} className="my-5 border-slate-800/40" />);
      } else {
        if (line.trim() === '') {
          items.push(<div key={index} className="h-3" />);
        } else {
          let contentNode: React.ReactNode = line;
          const boldRegex = /\*\*(.*?)\*\*/g;
          const matches = line.match(boldRegex);
          
          if (matches) {
            const parts = line.split(/\*\*.*?\*\*/g);
            const boldWords: string[] = [];
            let match;
            while ((match = boldRegex.exec(line)) !== null) {
              boldWords.push(match[1]);
            }
            contentNode = (
              <span>
                {parts.map((p, i) => (
                  <span key={i}>
                    {p}
                    {i < boldWords.length && <strong className="font-semibold text-slate-100">{boldWords[i]}</strong>}
                  </span>
                ))}
              </span>
            );
          }

          items.push(
            <p key={index} className="text-slate-350 text-[13.5px] leading-relaxed mb-3.5 font-sans">
              {contentNode}
            </p>
          );
        }
      }
    });

    return <div className="space-y-1">{items}</div>;
  };

  return (
    <div className="flex-1 flex bg-[#0c0d12] text-slate-100 overflow-hidden relative" id="editor-active-container">
      {isFullscreen && (
        <button
          type="button"
          onClick={toggleFullscreen}
          className={`absolute top-4 right-4 z-50 p-2.5 rounded-full bg-[#181a23]/90 hover:bg-[#202330]/90 text-slate-450 hover:text-slate-100 border border-[#2d313f] hover:border-slate-500/30 shadow-2xl cursor-pointer transition-all duration-300 ${
            hideOnScroll ? 'opacity-0 -translate-y-12 pointer-events-none' : 'opacity-100 translate-y-0'
          }`}
          title="Exit Full Screen"
        >
          <Minimize className="h-5 w-5" />
        </button>
      )}
      
      {/* 2-Column inner layout: Center Workspace + Right details Panel */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-[#151720] relative">
        
        {/* Tiny clean top toolbar bar */}
        {!isFullscreen && (
          <div 
            className={`px-6 bg-[#0c0d12] flex items-center justify-between gap-4 transition-all duration-200 overflow-hidden ${
              hideOnScroll ? 'h-0 py-0 border-b-0 opacity-0 pointer-events-none' : 'h-[53px] py-3.5 border-b border-[#14161f] opacity-100'
            }`} 
            id="editor-top-bar"
          >
            <div className="flex items-center space-x-3.5 min-w-0 flex-1">
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
                  className="font-sans font-medium text-sm bg-transparent border-b border-transparent hover:border-slate-800 focus:border-slate-700 px-1 py-0.5 text-slate-150 focus:outline-none max-w-xs truncate"
                  title="Edit document title"
                  id="editor-title-field"
                />
                {!canEdit && (
                  <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] uppercase font-mono bg-slate-900 border border-slate-800 text-slate-500">
                    <Lock className="h-2.5 w-2.5" />
                    <span>Read Only</span>
                  </span>
                )}
              </form>
            </div>            {/* Top diagnostic indicators / Trigger buttons to slide-in Right drawer detail column */}
            <div className="flex items-center space-x-1.5" id="top-bar-tabs">
              {saveBannerMessage && (
                <span className="text-[10px] text-emerald-400 animate-fadeIn font-mono bg-[#111915] border border-emerald-950/35 px-2 py-1 rounded mr-2 shrink-0">
                  ✓ {saveBannerMessage}
                </span>
              )}

              {/* View Full Screen Icon Button */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1.5 rounded-md hover:bg-[#181a23] border border-transparent hover:border-[#21232e] text-slate-400 hover:text-slate-100 transition-colors cursor-pointer flex items-center"
                title={isFullscreen ? "Exit Full Screen" : "View Full Screen"}
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4" />
                ) : (
                  <Maximize className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setDrawerTab('info');
                  setIsRightDrawerOpen(!isRightDrawerOpen);
                }}
                className={`p-1 px-2 text-xs font-semibold rounded-md border transition-all flex items-center gap-1 cursor-pointer ${
                  isRightDrawerOpen
                    ? 'bg-[#1c1e26] border-slate-700 text-slate-200'
                    : 'bg-transparent border-transparent text-slate-450 hover:text-slate-200'
                }`}
                title="Document settings & metadata"
              >
                <Settings className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Settings</span>
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Canvas Area */}
        <div className={`flex-1 overflow-y-auto w-full ${activeMode === 'edit' ? 'bg-[#fcfcf9] p-0' : 'bg-[#0a0b0f] p-6 lg:p-12'}`} id="workspace-scroll-wrap">
          
          {/* Permission Block message */}
          {!canView ? (
            <div className="h-full flex items-center justify-center text-center p-8">
              <div className="max-w-md p-6 bg-[#12141a]/60 border border-slate-800 rounded-xl space-y-4">
                <Lock className="h-8 w-8 text-slate-500 mx-auto" />
                <h2 className="text-sm font-semibold text-slate-200">Private Document</h2>
                <p className="text-xs text-slate-400 font-sans leading-relaxed">
                  The document owner has set link privileges to strict private. Swap to an invited collaborator account or request access to start viewing files.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* 1. VIEW MODE SCREEN: Deep, matte, calm, lots of whitespace */}
              {activeMode === 'view' && (
                <div className="max-w-3xl mx-auto space-y-8 animate-fadeIn text-left" id="view-mode-canvas">
                  
                  {/* Narrow elegant view text layouts */}
                  <div className="prose prose-slate prose-invert max-w-none">
                    {document.type === 'pdf' ? (
                      <div className="border border-slate-800/40 rounded-xl p-8 bg-[#12141a]/40 text-left space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800/40 pb-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">PDF Parser View</h4>
                          <span className="text-[10px] font-mono text-slate-500">{(document.size/1024).toFixed(1)} KB</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-normal">
                          Displaying imported binary metadata text contents:
                        </p>
                        <div className="font-mono text-xs text-slate-300 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                          {document.content}
                        </div>
                      </div>
                    ) : document.type === 'docx' && document.content.includes('<') ? (
                      <div 
                        className="text-slate-350 text-[13.5px] leading-relaxed space-y-3"
                        dangerouslySetInnerHTML={{ __html: document.content }}
                      />
                    ) : (
                      renderMarkdown(document.content)
                    )}
                  </div>
                </div>
              )}

              {/* 2. EDIT MODE SCREEN: stunning soft bone-white page sheet */}
              {activeMode === 'edit' && (
                <div className="w-full flex-1 flex flex-col animate-fadeIn" id="edit-mode-canvas">
                  
                  {/* Warning on non-owners editing role */}
                  {!canEdit && (
                    <div className="max-w-3xl mx-auto w-full mt-4 p-3.5 bg-rose-950/20 border border-rose-900/30 text-rose-400 rounded-lg flex items-center space-x-2.5 text-xs font-sans">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Editing privileges are closed. This document is set to Read-Only for your credentials.</span>
                    </div>
                  )}

                  {/* Core physical card writing sheet! Beautiful cream white panel is now full-screen edge-to-edge */}
                  <div 
                    className={`w-full flex-1 flex flex-col min-h-[calc(100vh-140px)] bg-[#fcfcf9] text-slate-900 ${
                      !canEdit ? 'opacity-80 pointer-events-none' : ''
                    }`}
                  >
                    
                    {/* Small layout formatting toolbar helper inside the card */}
                    {canEdit && (
                      <div className="border-b border-slate-200 bg-slate-50/60 sticky top-0 z-10" id="card-inner-toolbar">
                        <div className="max-w-3xl mx-auto px-6 py-2.5 flex items-center justify-between overflow-x-auto">
                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => injectFormatting('h1')}
                              className="p-1 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                              title="Insert Main Title"
                            >
                              <Heading1 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => injectFormatting('h2')}
                              className="p-1 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                              title="Insert Subheading"
                            >
                              <Heading2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => injectFormatting('bold')}
                              className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                              title="Make selection Bold"
                            >
                              <Bold className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => injectFormatting('italic')}
                              className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                              title="Make selection Italic"
                            >
                              <Italic className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => injectFormatting('list')}
                              className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                              title="Inject Checklist"
                            >
                              <List className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="text-[10px] uppercase font-mono tracking-wider font-bold">
                            {autosaveStatus === 'saving' && (
                              <span className="text-amber-600 flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <span>Saving draft...</span>
                              </span>
                            )}
                            {autosaveStatus === 'saved' && (
                              <span className="text-emerald-600">✓ Autosaved Locally</span>
                            )}
                            {autosaveStatus === 'error' && (
                              <span className="text-rose-600">⚠️ Save failed</span>
                            )}
                            {autosaveStatus === 'idle' && (
                              <span className="text-slate-400">Idle</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Text writing container - Centered with max-w-3xl for optimal readable column bounds */}
                    <div className="flex-1 max-w-3xl mx-auto w-full p-8 md:p-12 flex flex-col">
                      <textarea
                        ref={textareaRef}
                        value={document.content}
                        onChange={(e) => handleContentEdit(e.target.value)}
                        disabled={!canEdit}
                        placeholder="Begin writing text thoughts elegantly here..."
                        className="w-full flex-1 bg-transparent text-slate-800 leading-relaxed text-[15.5px] font-sans focus:outline-none resize-none overflow-y-auto border-0 focus:ring-0 p-0 min-h-[500px]"
                        id="document-editor-textarea"
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Floating Stacked Edit & Save buttons */}
        {!isFullscreen && (
          <div 
            className={`absolute bottom-6 right-6 z-30 flex flex-col gap-3 transition-all duration-200 ${
              hideOnScroll ? 'opacity-0 translate-y-12 pointer-events-none' : 'opacity-100 translate-y-0'
            }`} 
            id="floating-actions-container"
          >
            {/* Edit Mode Toggle Button */}
            <button
              type="button"
              onClick={() => {
                setActiveMode(activeMode === 'edit' ? 'view' : 'edit');
                setShowSaveDropdown(false);
              }}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl cursor-pointer border ${
                activeMode === 'edit'
                  ? 'bg-[#181a23]/90 hover:bg-[#202330]/90 text-amber-400 border-amber-500/30'
                  : 'bg-[#181a23]/90 hover:bg-[#202330]/90 text-slate-350 border-[#2d313f] hover:text-white'
              }`}
              title={activeMode === 'edit' ? "Switch to View Mode" : "Switch to Edit Mode"}
            >
              <Edit3 className="h-5 w-5" />
            </button>

            {/* Save Options trigger with vertical pop-up folder list */}
            <div className="relative" ref={saveDropdownRef} id="floating-save-options-container">
              <button
                onClick={() => setShowSaveDropdown(!showSaveDropdown)}
                type="button"
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl cursor-pointer border ${
                  showSaveDropdown
                    ? 'bg-slate-100/95 text-slate-955 border-white'
                    : 'bg-[#181a23]/90 hover:bg-[#202330]/90 text-slate-350 border-[#2d313f] hover:text-white'
                }`}
                title="Save & Export Options"
              >
                <Save className="h-5 w-5" />
              </button>

              {showSaveDropdown && (
                <div className="absolute right-0 bottom-full mb-3 w-52 bg-[#12141a] border border-[#232631] rounded-lg shadow-2xl z-50 py-1 animate-fadeIn font-sans text-left">
                  {!isPromptingSaveAs ? (
                    <>
                      <button
                        onClick={() => {
                          setShowSaveDropdown(false);
                          setSaveBannerMessage('Autosaved Clean Draft');
                          setTimeout(() => setSaveBannerMessage(null), 3500);
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs text-slate-300 hover:bg-[#181a22] hover:text-white flex items-center space-x-2"
                      >
                        <Save className="h-3.5 w-3.5 text-slate-500" />
                        <span>Save Draft</span>
                      </button>

                      <button
                        onClick={() => {
                          setSaveAsTitle(document.title.replace(/\.[^/.]+$/, "") + " - Copy");
                          setIsPromptingSaveAs(true);
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs text-slate-300 hover:bg-[#181a22] hover:text-white flex items-center space-x-2"
                      >
                        <Share2 className="h-3.5 w-3.5 text-slate-500" />
                        <span>Save As (Duplicate)</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowSaveDropdown(false);
                          if (onSaveAndExit) onSaveAndExit();
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs text-slate-300 hover:bg-[#181a22] hover:text-white flex items-center space-x-2 border-t border-[#1d1f27]"
                      >
                        <FileText className="h-3.5 w-3.5 text-slate-500" />
                        <span>Save and Exit</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowSaveDropdown(false);
                          onExportPDF(document);
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs text-slate-300 hover:bg-[#181a22] hover:text-white flex items-center space-x-2 border-t border-[#1d1f27]"
                      >
                        <Download className="h-3.5 w-3.5 text-slate-500" />
                        <span>Convert to PDF</span>
                      </button>
                    </>
                  ) : (
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (saveAsTitle.trim() && onSaveAs) {
                          onSaveAs(document, saveAsTitle.trim());
                          setIsPromptingSaveAs(false);
                          setShowSaveDropdown(false);
                          setSaveAsTitle('');
                        }
                      }}
                      className="p-3 space-y-2"
                    >
                      <p className="text-[10px] text-slate-500 font-mono">NEW COPY FILE NAME:</p>
                      <input
                        type="text"
                        value={saveAsTitle}
                        onChange={(e) => setSaveAsTitle(e.target.value)}
                        placeholder="Name..."
                        className="w-full bg-[#181a22] text-slate-100 placeholder-slate-600 border border-[#232631] rounded p-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-700 font-sans"
                        autoFocus
                        required
                      />
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setIsPromptingSaveAs(false)}
                          className="flex-1 py-1 text-[10px] bg-transparent text-slate-400 hover:text-white rounded"
                        >
                          Back
                        </button>
                        <button
                          type="submit"
                          className="flex-1 py-1 text-[10px] bg-slate-200 text-slate-950 font-bold rounded hover:bg-white transition-colors"
                        >
                          Duplicate
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT DRAWER: slides in cleanly, holds access level, details, conversion action configs */}
      {!isFullscreen && isRightDrawerOpen && (
        <div 
          className="w-72 md:w-80 border-l border-[#1d1f27] bg-[#12141a] h-full flex flex-col shrink-0 animate-slideLeft z-30 font-sans"
          id="right-drawer-container"
        >
          {/* Drawer Header Tabs */}
          <div className="border-b border-[#1d1f27] bg-[#101217] p-3 flex items-center justify-between">
            <div className="flex bg-[#181a22] p-0.5 rounded-lg border border-[#21232e]">
              <button
                type="button"
                onClick={() => setDrawerTab('info')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${
                  drawerTab === 'info' ? 'bg-[#222530] text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Settings
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('share')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${
                  drawerTab === 'share' ? 'bg-[#222530] text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sharing
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsRightDrawerOpen(false)}
              className="p-1.5 rounded hover:bg-slate-900 text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>

          {/* Drawer Tab Content Scroll Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-slate-300">
            
            {/* FILE INFO TAB */}
            {drawerTab === 'info' && (
              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Metadata</h4>
                  <div className="bg-[#181a22] p-3 rounded-lg border border-[#1e2029]/60 space-y-2.5 font-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Owner:</span>
                      <span className="text-slate-200 truncate max-w-[120px]">{document.permissions.owner}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">File structure:</span>
                      <span className="text-slate-200 uppercase">{document.type} format</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Caret size:</span>
                      <span className="text-slate-200">{(getByteSize(document.content)/1024).toFixed(2)} KB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sync state:</span>
                      <span className={`capitalize font-semibold ${
                        document.syncStatus === 'synced' ? 'text-emerald-400' : 'text-amber-500 animate-pulse'
                      }`}>{document.syncStatus}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Export Conversion</h4>
                  <button
                    onClick={() => {
                      onExportPDF(document);
                    }}
                    type="button"
                    className="w-full py-2 px-3 rounded-lg border border-slate-700 bg-transparent text-slate-200 hover:bg-slate-900 text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center space-x-2"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Compile PDF download</span>
                  </button>
                </div>

                {/* Cloud operations triggers inside file details drawer */}
                <div className="space-y-2.5 pt-2 border-t border-[#1d1f27]">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Synchronization</h4>
                  <button
                    onClick={() => onTriggerSync(document.id)}
                    disabled={isOffline}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 ${
                      isOffline 
                        ? 'bg-[#181a22] text-slate-500 border border-slate-850 cursor-not-allowed' 
                        : 'bg-slate-200 hover:bg-white text-slate-950 cursor-pointer'
                    }`}
                  >
                    <span>Trigger Manual Sync</span>
                  </button>
                </div>

                {/* Conflict resolution module (ONLY visualizes if active conflict detected!) */}
                {document.syncStatus === 'conflict' && (
                  <div className="p-3 bg-rose-950/20 border border-rose-900/30 rounded-lg space-y-3.5 mt-2">
                    <p className="text-[10px] text-rose-400 font-mono flex items-center gap-1 font-bold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Surgical Conflict Queue</span>
                    </p>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      Another colleague has edited the server version. Select choice:
                    </p>

                    <button
                      type="button"
                      onClick={() => onResolveConflict(document.id, document.content)}
                      className="w-full bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 py-1 rounded text-[10px] font-semibold border border-amber-800"
                    >
                      Enforce Your Local Draft
                    </button>

                    <button
                      type="button"
                      onClick={() => onResolveConflict(document.id, document.originalContent || '')}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-1 rounded text-[10px] font-semibold"
                    >
                      Receive Remote Cloud Version
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SHARING & PERMISSIONS TAB */}
            {drawerTab === 'share' && (
              <div className="space-y-4 text-xs">
                {/* External link access logic */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Link Exposure</h4>
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
                            : 'bg-[#181a22] border-transparent text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        <span className="font-semibold capitalize text-slate-200">{mode} link access</span>
                        <span className="text-[10px] text-slate-550 leading-tight">
                          {mode === 'private' ? 'Access restricted to specified members.' :
                           mode === 'view' ? 'Anyone with the link can view.' : 'Anyone with the link can edit.'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Invited team members */}
                <div className="space-y-2.5 pt-2 border-t border-[#1d1f27]">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Enlisted Collaborators</h4>
                  
                  {isOwner ? (
                    <div className="space-y-1.5">
                      <input
                        type="email"
                        placeholder="Invite email..."
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="w-full bg-[#181a22] border border-[#232631] rounded p-1.5 text-xs text-slate-250 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value as 'view' | 'edit')}
                          className="flex-1 bg-[#181a22] border border-[#232631] rounded text-[11px] px-1 text-slate-300"
                        >
                          <option value="view">Viewer</option>
                          <option value="edit">Editor</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (!inviteEmail.trim()) return;
                            const currentList = [...document.permissions.sharedWith];
                            const exists = currentList.find(c => c.email === inviteEmail);
                            if (exists) {
                              exists.role = inviteRole;
                            } else {
                              currentList.push({ email: inviteEmail, role: inviteRole });
                            }
                            onUpdatePermissions(document.id, { sharedWith: currentList });
                            setInviteEmail('');
                          }}
                          className="bg-slate-250 hover:bg-white text-slate-950 px-3 py-1 text-xs font-semibold rounded cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500">Only the owner ({document.permissions.owner}) can invite members.</p>
                  )}

                  {/* Collaborators list view */}
                  <div className="space-y-1.5 pt-2">
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 pb-1 border-b border-[#21232e]">
                      <span>Account</span>
                      <span>Privilege</span>
                    </div>

                    <div className="flex justify-between items-center text-xs py-1">
                      <span className="truncate max-w-[130px] font-mono text-slate-400">{document.permissions.owner}</span>
                      <span className="text-slate-500 text-[10px]">Owner</span>
                    </div>

                    {document.permissions.sharedWith.map((c, i) => (
                      <div key={i} className="flex justify-between items-center text-xs py-1">
                        <span className="truncate max-w-[130px] font-mono text-slate-400">{c.email}</span>
                        <div className="flex items-center space-x-1.5 text-[10px]">
                          <span className="capitalize text-slate-500">{c.role}</span>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextList = document.permissions.sharedWith.filter(item => item.email !== c.email);
                                onUpdatePermissions(document.id, { sharedWith: nextList });
                              }}
                              className="text-rose-500 hover:text-rose-400"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
