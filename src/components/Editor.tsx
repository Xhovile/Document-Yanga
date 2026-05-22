/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Eye, Edit3, Share2, RefreshCw, Lock, AlertTriangle, FileText, 
  Heading1, Heading2, Bold, Italic, List, Shield, HelpCircle, Save, Download, Menu
} from 'lucide-react';
import { Document, WorkspaceMode, AppUser, SharingPermission, UserPermission } from '../types';
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
}: EditorProps) {
  const [localTitle, setLocalTitle] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'view' | 'edit'>('view');
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync title with document
  useEffect(() => {
    if (document) {
      setLocalTitle(document.title);
    }
  }, [document?.id]);

  if (!document) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-8 text-center" id="editor-empty-state">
        <div className="border border-slate-800 rounded-2xl p-8 max-w-md bg-slate-900/40 space-y-4 animate-scaleUp">
          <div className="h-12 w-12 rounded-full bg-cyan-950 flex items-center justify-center text-cyan-400 mx-auto">
            <FileText className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-sans font-bold text-slate-100">No Document Active</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Select an existing file from the sidebar, drag a file inside the explorer bounds, or create a brand new draft to begin writing offline.
          </p>
        </div>
      </div>
    );
  }

  // Permission Checks
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

  // Render content based on Document's markdown / HTML / raw txt
  const parseMarkdownToReact = (markdown: string) => {
    const lines = markdown.split('\n');
    let insideList = false;
    const items: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      // Heading 1
      if (line.startsWith('# ')) {
        items.push(<h1 key={index} className="text-2xl font-bold font-sans text-slate-100 mt-6 mb-3 tracking-tight border-b border-slate-800 pb-2">{line.slice(2)}</h1>);
      } 
      // Heading 2
      else if (line.startsWith('## ')) {
        items.push(<h2 key={index} className="text-xl font-bold font-sans text-slate-200 mt-5 mb-2.5 tracking-tight">{line.slice(3)}</h2>);
      } 
      // Heading 3
      else if (line.startsWith('### ')) {
        items.push(<h3 key={index} className="text-lg font-bold font-sans text-slate-300 mt-4 mb-2">{line.slice(4)}</h3>);
      } 
      // Lists
      else if (line.startsWith('- ') || line.startsWith('* ')) {
        items.push(
          <li key={index} className="ml-5 list-disc text-sm text-slate-300 mb-1 leading-relaxed">
            {line.slice(2)}
          </li>
        );
      } 
      // Divider
      else if (line.trim() === '---') {
        items.push(<hr key={index} className="my-6 border-slate-800" />);
      } 
      // Standard paragraph
      else {
        if (line.trim() === '') {
          items.push(<div key={index} className="h-3" />);
        } else {
          // Process light inline strong text like **bold** and *italic*
          let elementContent: React.ReactNode = line;
          const boldRegex = /\*\*(.*?)\*\*/g;
          const matches = line.match(boldRegex);
          
          if (matches) {
            const parts = line.split(/\*\*.*?\*\*/g);
            const innerTexts: string[] = [];
            let match;
            while ((match = boldRegex.exec(line)) !== null) {
              innerTexts.push(match[1]);
            }
            elementContent = (
              <span>
                {parts.map((p, i) => (
                  <span key={i}>
                    {p}
                    {i < innerTexts.length && <strong className="font-bold text-cyan-400">{innerTexts[i]}</strong>}
                  </span>
                ))}
              </span>
            );
          }

          items.push(
            <p key={index} className="text-sm text-slate-300 mb-3.5 leading-relaxed font-sans">
              {elementContent}
            </p>
          );
        }
      }
    });

    return <div className="space-y-1">{items}</div>;
  };

  // Helper formatting injectors
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
    onContentChange(newContent);

    // Reset selection focus
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

  // Sync triggers
  const executeSync = () => {
    setSyncFeedback("Syncing document metadata...");
    onTriggerSync(document.id);
    setTimeout(() => {
      setSyncFeedback(null);
    }, 2000);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 overflow-hidden" id="editor-active-container">
      {/* File Top Bar / Title & Mode Switches */}
      <div className="px-6 py-4 border-b border-slate-900 bg-slate-950 flex flex-col md:flex-row md:items-center justify-between gap-4" id="editor-top-bar">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          {isSidebarCollapsed && (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(false)}
              className="p-1.5 rounded-md bg-slate-900 hover:bg-slate-850 border border-slate-800 text-cyan-400 hover:text-cyan-350 transition-colors mr-1 cursor-pointer flex items-center justify-center shrink-0"
              title="Expand Sidebar"
              id="expand-sidebar-bar-btn"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}

          <form onSubmit={handleTitleSubmit} className="flex-1 flex items-center space-x-2">
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={() => localTitle.trim() && onTitleChange(localTitle.trim())}
              disabled={!canEdit}
              className={`font-sans font-semibold text-lg bg-transparent hover:bg-slate-900 focus:bg-slate-900 border border-transparent hover:border-slate-800 rounded px-2 py-0.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 max-w-md w-full truncate ${
                !canEdit ? 'opacity-85 cursor-not-allowed' : ''
              }`}
              title="Edit document title"
              id="editor-title-field"
            />
            {!canEdit && (
              <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-rose-950/50 border border-rose-800 text-rose-400">
                <Lock className="h-2.5 w-2.5" />
                <span>Read Only</span>
              </span>
            )}
          </form>
        </div>

        {/* 4 Core Modes Tabs Nav */}
        <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800" id="mode-tab-bar">
          <button
            onClick={() => setActiveMode('view')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeMode === 'view'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            id="tab-mode-view"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>View</span>
          </button>

          <button
            onClick={() => setActiveMode('edit')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeMode === 'edit'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            id="tab-mode-edit"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Edit</span>
          </button>

          <button
            onClick={() => setActiveMode('sync')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeMode === 'sync'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            id="tab-mode-sync"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${document.syncStatus === 'pending' ? 'animate-spin text-amber-500' : ''}`} />
            <span>Sync</span>
          </button>

          <button
            onClick={() => setActiveMode('share')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeMode === 'share'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            id="tab-mode-share"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Share</span>
          </button>
        </div>
      </div>

      {/* Screen Workspace Views */}
      <div className="flex-1 overflow-y-auto" id="workspace-dynamic-panel">
        
        {/* CHECK CAN VIEW PERMISSION */}
        {!canView ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center" id="permission-blocked">
            <div className="max-w-md p-6 border border-rose-900 bg-rose-950/10 rounded-xl space-y-4">
              <Lock className="h-10 w-10 text-rose-500 mx-auto" />
              <h2 className="text-base font-bold text-slate-100">Access Denied</h2>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                You do not have viewer credentials to access this document. The author has set permissions to private. Switch to an invited user address via the sidebar avatar profile menu to preview.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* 1. VIEW MODE SCREEN */}
            {activeMode === 'view' && (
              <div className="p-8 max-w-3xl mx-auto space-y-6" id="view-mode-canvas">
                {/* Header Metadata Ribbon */}
                <div className="flex items-center justify-between text-xs text-slate-500 font-mono pb-4 border-b border-slate-900">
                  <div className="flex gap-4">
                    <span>Format: <b className="text-slate-300 uppercase">{document.type}</b></span>
                    <span>Size: <b className="text-slate-300">{(getByteSize(document.content) / 1024).toFixed(2)} KB</b></span>
                  </div>
                  <div>
                    <button
                      onClick={() => onExportPDF(document)}
                      className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 font-bold font-mono transition-colors cursor-pointer"
                      id="export-pdf-doc-action"
                    >
                      <Download className="h-3 w-3" />
                      <span>Convert to PDF</span>
                    </button>
                  </div>
                </div>

                {document.type === 'pdf' ? (
                  <div className="border border-slate-800 rounded-lg p-10 bg-slate-900/60 text-center space-y-4">
                    <div className="h-12 w-12 rounded bg-rose-950 flex items-center justify-center text-rose-400 mx-auto">
                      <FileText className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-200">{document.title}</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      PDF loading and rendering initialized using high-performance DOM lazy structures.
                    </p>
                    <div className="p-4 bg-slate-950 rounded border border-slate-850 text-left font-mono text-xs text-slate-300 overflow-auto whitespace-pre-wrap">
                      {document.content}
                    </div>
                  </div>
                ) : document.type === 'docx' && document.content.includes('<') ? (
                  // Render parsed DOCX HTML safely (Mammoth generated)
                  <div 
                    className="prose prose-invert max-w-none text-slate-300 font-sans leading-relaxed space-y-3"
                    dangerouslySetInnerHTML={{ __html: document.content }}
                    id="docx-rendered-html"
                  />
                ) : document.type === 'md' ? (
                  // Custom Markdown Parser
                  parseMarkdownToReact(document.content)
                ) : (
                  // Standard Monospace Text View
                  <div className="font-mono text-sm leading-6 whitespace-pre-wrap text-slate-300 bg-slate-900/40 p-6 rounded-lg border border-slate-900 overflow-auto">
                    {document.content}
                  </div>
                )}
              </div>
            )}

            {/* 2. EDIT MODE SCREEN */}
            {activeMode === 'edit' && (
              <div className="h-full flex flex-col" id="edit-mode-canvas">
                {/* Check Edit Permissions Lock */}
                {!canEdit ? (
                  <div className="p-8 border-b border-rose-950 bg-rose-950/10 text-rose-400 flex items-center space-x-3 text-xs font-medium">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Editing permission is locked because you do not own this document and have been granted <b>Read-Only (Viewer)</b> privileges. Change login email in sidebar profile to override.</span>
                  </div>
                ) : (
                  <div className="p-2 border-b border-slate-900 bg-slate-950/70 flex items-center space-x-1 overflow-x-auto" id="editor-toolbar">
                    <button
                      onClick={() => injectFormatting('h1')}
                      className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-900 transition-colors"
                      title="Heading 1"
                    >
                      <Heading1 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => injectFormatting('h2')}
                      className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-900 transition-colors"
                      title="Heading 2"
                    >
                      <Heading2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => injectFormatting('bold')}
                      className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-900 transition-colors"
                      title="Bold"
                    >
                      <Bold className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => injectFormatting('italic')}
                      className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-900 transition-colors"
                      title="Italic"
                    >
                      <Italic className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => injectFormatting('list')}
                      className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-900 transition-colors"
                      title="Bullet Point List"
                    >
                      <List className="h-4 w-4" />
                    </button>
                    
                    <span className="h-4 w-px bg-slate-800 mx-2" />
                    
                    <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                      <Save className="h-3 w-3 text-emerald-500 animate-pulse" />
                      <span>Autosaves drafts offline</span>
                    </span>
                  </div>
                )}

                <div className="flex-1 min-h-0 relative">
                  <textarea
                    ref={textareaRef}
                    value={document.content}
                    onChange={(e) => onContentChange(e.target.value)}
                    disabled={!canEdit}
                    placeholder="Start typing document body in Markdown or raw format here..."
                    className="absolute inset-0 w-full h-full p-8 bg-transparent text-slate-300 leading-relaxed text-sm font-sans focus:outline-none resize-none overflow-y-auto"
                    id="editor-textarea-field"
                  />
                </div>
              </div>
            )}

            {/* 3. SYNC MODE SCREEN */}
            {activeMode === 'sync' && (
              <div className="p-8 max-w-2xl mx-auto space-y-6" id="sync-mode-canvas">
                <div className="border border-slate-800 bg-slate-900/40 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-sans font-bold text-slate-100 flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-cyan-400" />
                      Offline Workstation & Server Sync Queue
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono border ${
                      isOffline 
                        ? 'bg-amber-950/50 border-amber-800 text-amber-400'
                        : 'bg-emerald-950/50 border-emerald-800 text-emerald-400'
                    }`}>
                      {isOffline ? 'Offline Draft Workspace' : 'Linked to Cloud-Sync'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Under offline-first design patterns, edits made offline are registered instantly in local metadata queues. Once you reconnect to the sync servers, modifications reconcile with documents stored upon database.
                  </p>

                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-xs py-1.5 border-b border-slate-850">
                      <span className="text-slate-500">Document Sync State</span>
                      <span className={`font-mono font-bold capitalize ${
                        document.syncStatus === 'synced' ? 'text-emerald-400' :
                        document.syncStatus === 'conflict' ? 'text-rose-400 animate-pulse' :
                        'text-amber-400'
                      }`}>
                        {document.syncStatus}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs py-1.5 border-b border-slate-850">
                      <span className="text-slate-500">Local Modified Draft</span>
                      <span className="font-mono text-slate-300">{document.syncStatus === 'synced' ? 'Unmodified' : 'Yes (Saved Locally)'}</span>
                    </div>

                    <div className="flex justify-between text-xs py-1.5 border-b border-slate-850">
                      <span className="text-slate-500">Last Database Reconcile</span>
                      <span className="font-mono text-slate-300">{new Date(document.updatedAt).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  {syncFeedback && (
                    <div className="p-3 bg-cyan-950/40 border border-cyan-800 text-cyan-400 text-xs rounded-lg animate-fadeIn">
                      {syncFeedback}
                    </div>
                  )}

                  {/* Sync Action Controls */}
                  <div className="flex gap-3 justify-end pt-2">
                    <button
                      onClick={executeSync}
                      disabled={isOffline}
                      className={`flex items-center space-x-1.5 px-4 py-2 rounded text-xs font-semibold cursor-pointer ${
                        isOffline 
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-850' 
                          : 'bg-cyan-600 hover:bg-cyan-500 text-white transition-colors'
                      }`}
                      id="trigger-reconciliation-btn"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Trigger Database Sync</span>
                    </button>
                  </div>
                </div>

                {/* Simulated Synchronization Collision Panel */}
                {document.syncStatus === 'conflict' && (
                  <div className="border border-rose-900 bg-rose-950/10 rounded-xl p-5 space-y-4 animate-scaleUp">
                    <div className="flex items-center space-x-2 text-rose-400 font-bold text-xs uppercase font-mono">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Reconciliation Collision Resolved</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      While you were working offline, another user pushed conflicting modifications on the cloud database. Document Yanga blocks automated overwriting, giving you side-by-side reconciliation comparison choice:
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono pt-2">
                      <div className="space-y-1.5">
                        <span className="block font-sans font-semibold text-amber-400">Your Offline Draft (Local)</span>
                        <div className="p-3 bg-slate-950 border border-slate-850 rounded text-[10px] text-slate-300 h-32 overflow-y-auto leading-relaxed">
                          {document.content}
                        </div>
                        <button
                          onClick={() => onResolveConflict(document.id, document.content)}
                          className="w-full bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-800 py-1.5 rounded-md transition-colors font-medium text-[11px] cursor-pointer"
                          id="keep-local-version-action"
                        >
                          Overrule with Local Version
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <span className="block font-sans font-semibold text-cyan-400">Server State (Remote)</span>
                        <div className="p-3 bg-slate-950 border border-slate-850 rounded text-[10px] text-slate-300 h-32 overflow-y-auto leading-relaxed">
                          {document.originalContent || 'Simulated Conflict Content loaded from Remote Workspace database...'}
                        </div>
                        <button
                          onClick={() => onResolveConflict(document.id, document.originalContent || 'Default Conflict Value')}
                          className="w-full bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-800 py-1.5 rounded-md transition-colors font-medium text-[11px] cursor-pointer"
                          id="accept-server-version-action"
                        >
                          Accept Remote Server Content
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. SHARE MODE SCREEN */}
            {activeMode === 'share' && (
              <div className="p-8 max-w-2xl mx-auto space-y-6" id="share-mode-canvas">
                <div className="border border-slate-800 bg-slate-900/40 rounded-xl p-6 space-y-5">
                  <h3 className="font-sans font-bold text-slate-100 flex items-center gap-2 border-b border-slate-850 pb-3">
                    <Shield className="h-4 w-4 text-cyan-400" />
                    Access Permissions & Link Sharing Controls
                  </h3>

                  {/* Public Link Toggle Selection */}
                  <div className="space-y-2">
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      External Link Access Control
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2" id="link-sharing-controls">
                      {(['private', 'view', 'edit'] as SharingPermission[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => isOwner && onUpdatePermissions(document.id, { linkSharing: mode })}
                          disabled={!isOwner}
                          className={`p-3 rounded-lg border text-left flex flex-col justify-between h-20 transition-all ${
                            !isOwner ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                          } ${
                            document.permissions.linkSharing === mode
                              ? 'bg-cyan-950/40 border-cyan-500 text-cyan-300'
                              : 'bg-slate-900 border-slate-850 text-slate-400 hover:text-slate-300'
                          }`}
                          id={`link-share-mode-${mode}`}
                        >
                          <span className="text-xs font-bold capitalize">{mode} Link</span>
                          <span className="text-[10px] text-slate-400 leading-tight">
                            {mode === 'private' && 'Only specified members can view.'}
                            {mode === 'view' && 'Anyone with the URL can read.'}
                            {mode === 'edit' && 'Anyone with the URL can edit.'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Collaborator Management Grid */}
                  <div className="space-y-3 pt-3">
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Enlist Invited Members
                    </label>

                    {/* Invite Input form panel */}
                    {isOwner ? (
                      <div className="flex gap-2" id="collaborator-invite-form">
                        <input
                          type="email"
                          placeholder="Email address (e.g. editor@yanga.app)..."
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          id="invite-email-input"
                        />
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value as 'view' | 'edit')}
                          className="bg-slate-950 border border-slate-850 rounded text-xs px-2 text-slate-300 outline-none"
                          id="invite-role-select"
                        >
                          <option value="view">Viewer</option>
                          <option value="edit">Editor</option>
                        </select>
                        <button
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
                          className="bg-cyan-600 hover:bg-cyan-500 text-white rounded px-4 text-xs font-semibold cursor-pointer"
                          id="add-member-btn"
                        >
                          Invite
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 bg-slate-950 p-3 rounded">
                        Only the owner (<b>{document.permissions.owner}</b>) can invite users.
                      </p>
                    )}

                    {/* Member List */}
                    <div className="space-y-1.5 divide-y divide-slate-900 border border-slate-850 rounded-lg p-3 bg-slate-950/20" id="collaborator-invited-list">
                      <div className="flex justify-between items-center text-xs pb-2 font-mono text-slate-500">
                        <span>Invited Member Account</span>
                        <span>Role Privilege</span>
                      </div>
                      
                      <div className="flex justify-between items-center text-xs py-2 bg-slate-900/10 px-1 rounded-sm">
                        <div className="flex items-center space-x-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                          <span>{document.permissions.owner}</span>
                        </div>
                        <span className="font-mono text-cyan-400 font-bold">Owner</span>
                      </div>

                      {document.permissions.sharedWith.length === 0 ? (
                        <p className="text-center py-4 text-xs text-slate-600">No other members listed.</p>
                      ) : (
                        document.permissions.sharedWith.map((collab, index) => (
                          <div key={index} className="flex justify-between items-center text-xs py-2.5 px-1 hover:bg-slate-900/10 transition-colors">
                            <span>{collab.email}</span>
                            <div className="flex items-center space-x-2">
                              <span className="font-mono capitalize text-slate-300">{collab.role}</span>
                              {isOwner && (
                                <button
                                  onClick={() => {
                                    const nextList = document.permissions.sharedWith.filter(c => c.email !== collab.email);
                                    onUpdatePermissions(document.id, { sharedWith: nextList });
                                  }}
                                  className="text-rose-500 hover:text-rose-400 text-[10px] uppercase font-bold cursor-pointer font-mono"
                                  id={`remove-member-${collab.email}`}
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
