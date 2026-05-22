/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  FileText, Plus, Search, Trash2, Wifi, WifiOff, FileCode, CheckCircle2, AlertTriangle, 
  Upload, User, FileDigit, Globe, Lock, Users, LogIn, ChevronLeft, ChevronRight, Menu
} from 'lucide-react';
import { Document, DocumentType, AppUser } from '../types';
import { getByteSize } from '../db';
import * as mammoth from 'mammoth';

interface SidebarProps {
  documents: Document[];
  activeDoc: Document | null;
  setActiveDoc: (doc: Document) => void;
  onCreateDoc: (type: DocumentType, title: string) => void;
  onDeleteDoc: (id: string) => void;
  onImportDoc: (title: string, content: string, type: DocumentType, size: number) => void;
  isOffline: boolean;
  setIsOffline: (offline: boolean) => void;
  currentUser: AppUser;
  onUserUpdate: (user: AppUser) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export default function Sidebar({
  documents,
  activeDoc,
  setActiveDoc,
  onCreateDoc,
  onDeleteDoc,
  onImportDoc,
  isOffline,
  setIsOffline,
  currentUser,
  onUserUpdate,
  isCollapsed,
  setIsCollapsed,
}: SidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [newDocType, setNewDocType] = useState<DocumentType>('md');
  const [newTitle, setNewTitle] = useState('');
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [profileModalDoc, setProfileModalDoc] = useState(false);
  
  // States for user credential editing
  const [editEmail, setEditEmail] = useState(currentUser.email);
  const [editName, setEditName] = useState(currentUser.name);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter folders/files
  const filteredDocs = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const titleWithExt = newTitle.endsWith(`.${newDocType}`) 
      ? newTitle 
      : `${newTitle}.${newDocType}`;
    onCreateDoc(newDocType, titleWithExt);
    setNewTitle('');
    setShowCreateMenu(false);
  };

  // Drag and Drop File Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFile = async (file: File) => {
    const filename = file.name;
    const size = file.size;
    const ext = filename.split('.').pop()?.toLowerCase();
    
    // Validate supported formats
    if (ext === 'txt' || ext === 'md') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string || '';
        onImportDoc(filename, text, ext as DocumentType, size);
      };
      reader.readAsText(file);
    } else if (ext === 'docx') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        try {
          // Process DOCX client-side using mammoth
          const result = await mammoth.convertToHtml({ arrayBuffer });
          // Stripping some dense elements but retaining light structures or rich elements
          onImportDoc(filename, result.value, 'docx', size);
        } catch (err) {
          console.error('Error parsing DOCX file: ', err);
          // Fallback to text matching
          onImportDoc(filename, `Failed to parse binary docx structure. Raw loading...`, 'docx', size);
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === 'pdf') {
      // PDF viewing is view only. Since PDF binary is too large, we can create a simulated file pointer in IndexedDB
      // and display information + raw text or render a high quality mock/preview
      const reader = new FileReader();
      reader.onload = (e) => {
        onImportDoc(filename, `[PDF Binary stream - View Only Mode Available] Size: ${size} bytes`, 'pdf', size);
      };
      reader.readAsText(file);
    } else {
      alert('Supported file formats: .txt, .md, .docx, .pdf');
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await processFile(file);
    }
  };

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await processFile(file);
    }
  };

  const saveProfileChange = (e: React.FormEvent) => {
    e.preventDefault();
    onUserUpdate({
      email: editEmail,
      name: editName,
      isLoggedIn: true,
    });
    setProfileModalDoc(false);
  };

  return (
    <div 
      className={`bg-slate-900 text-slate-100 flex-shrink-0 relative transition-all duration-300 flex flex-col ${
        isCollapsed 
          ? 'w-0 overflow-hidden border-r-0 opacity-0 pointer-events-none' 
          : 'w-80 border-r border-slate-800'
      } ${
        isDragging ? 'ring-4 ring-cyan-500 ring-inset' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      id="sidebar-container"
    >
      {/* App Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between" id="sidebar-header">
        <div className="flex items-center space-x-2">
          <FileCode className="h-6 w-6 text-cyan-400" />
          <span className="font-sans font-bold text-lg tracking-tight bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
            Yanga
          </span>
          <span className="text-[10px] uppercase tracking-wider font-mono px-1 py-0.5 rounded-sm bg-slate-800 text-slate-400">
            MVP
          </span>
        </div>

        {/* Header Action Row */}
        <div className="flex items-center space-x-1.5" id="header-action-row">
          {/* Network Button Status Indicator */}
          <button 
            onClick={() => setIsOffline(!isOffline)}
            className={`flex items-center space-x-1 px-1.5 py-1 rounded text-[11px] font-mono font-bold transition-colors shrink-0 ${
              isOffline 
                ? 'bg-amber-950/40 border border-amber-800 text-amber-400 hover:bg-amber-950/60' 
                : 'bg-emerald-950/40 border border-emerald-800 text-emerald-400 hover:bg-emerald-950/60'
            }`}
            title={isOffline ? "Currently Offline" : "Connected to sync"}
            id="network-toggle-btn"
          >
            {isOffline ? (
              <>
                <WifiOff className="h-3 w-3 text-amber-400" />
                <span>Off-line</span>
              </>
            ) : (
              <>
                <Wifi className="h-3 w-3 text-emerald-400" />
                <span>On-line</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 px-1.5 rounded-md hover:bg-slate-850 text-slate-400 hover:text-slate-100 border border-transparent hover:border-slate-800 transition-all flex items-center justify-center cursor-pointer shrink-0"
            title="Fold Sidebar"
            id="collapse-sidebar-btn"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* User Status Profile */}
      <div className="p-3 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between" id="user-profile-section">
        <div className="flex items-center space-x-2">
          <div className="h-7 w-7 rounded-full bg-cyan-700 flex items-center justify-center text-xs font-bold text-white uppercase">
            {currentUser.name.slice(0, 2)}
          </div>
          <div className="overflow-hidden">
            <h4 className="text-xs font-medium text-slate-200 truncate">{currentUser.name}</h4>
            <p className="text-[10px] text-slate-400 font-mono truncate">{currentUser.email}</p>
          </div>
        </div>
        <button 
          onClick={() => setProfileModalDoc(true)}
          className="text-slate-400 hover:text-cyan-400 p-1 rounded-md hover:bg-slate-800 transition-colors"
          title="Simulate Switching User Account"
          id="edit-profile-btn"
        >
          <User className="h-4 w-4" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-3 relative" id="sidebar-search">
        <Search className="absolute left-6 top-5.5 text-slate-400 h-4 w-4" />
        <input
          type="text"
          placeholder="Search workspace..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-md py-1.5 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 font-sans"
          id="search-input"
        />
      </div>

      {/* Document Actions Menu */}
      <div className="px-3 pb-2 flex gap-1.5" id="sidebar-actions">
        <button
          onClick={() => setShowCreateMenu(!showCreateMenu)}
          className="flex-1 flex items-center justify-center space-x-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs rounded-md py-2 px-3 transition-colors shadow-sm cursor-pointer"
          id="new-document-trigger"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Document</span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs rounded-md p-2 transition-colors cursor-pointer"
          title="Import local TXT, MD, DOCX, or PDF"
          id="file-upload-btn"
        >
          <Upload className="h-3.5 w-3.5" />
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleManualUpload}
          accept=".txt,.md,.docx,.pdf"
          className="hidden"
          id="hidden-file-input"
        />
      </div>

      {/* Create New Document Form overlay option */}
      {showCreateMenu && (
        <form onSubmit={handleCreate} className="mx-3 mb-3 p-3 bg-slate-950 border border-slate-800 rounded-md space-y-2.5 animate-fadeIn" id="create-document-form">
          <div className="flex gap-1" id="type-selector-group">
            {(['md', 'txt', 'docx', 'pdf'] as DocumentType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setNewDocType(type)}
                className={`flex-1 text-[10px] font-mono font-bold py-1 px-1 rounded uppercase border ${
                  newDocType === type
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                id={`type-btn-${type}`}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Filename..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              autoFocus
              id="new-doc-title-input"
            />
            <button
              type="submit"
              className="bg-cyan-600 hover:bg-cyan-500 text-white rounded px-3 text-xs font-semibold cursor-pointer"
              id="submit-create-btn"
            >
              Add
            </button>
          </div>
        </form>
      )}

      {/* Document List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 border-t border-slate-800/60 pt-2" id="document-list-container">
        {filteredDocs.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No files found in workspace.
          </div>
        ) : (
          filteredDocs.map((doc) => {
            const isActive = activeDoc?.id === doc.id;
            const isShared = doc.permissions.sharedWith.length > 0 || doc.permissions.linkSharing !== 'private';
            
            return (
              <div
                key={doc.id}
                onClick={() => setActiveDoc(doc)}
                className={`group flex items-center justify-between p-2 rounded-md cursor-pointer transition-all ${
                  isActive
                    ? 'bg-slate-800 text-white border-l-2 border-cyan-400'
                    : 'text-slate-300 hover:bg-slate-850 hover:text-white'
                }`}
                id={`doc-item-${doc.id}`}
              >
                <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                  <div className={`p-1.5 rounded-md ${
                    doc.type === 'md' ? 'bg-indigo-950/70 text-indigo-400' :
                    doc.type === 'pdf' ? 'bg-rose-950/70 text-rose-400' :
                    doc.type === 'docx' ? 'bg-sky-950/70 text-sky-400' :
                    'bg-slate-900 text-slate-400'
                  }`}>
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate leading-tight group-hover:text-white">
                      {doc.title}
                    </p>
                    <div className="flex items-center space-x-1.5 mt-0.5 text-[9px] font-mono text-slate-500">
                      <span>{(doc.size / 1024).toFixed(1)} KB</span>
                      <span>•</span>
                      <span className="uppercase">{doc.type}</span>
                      {doc.syncStatus === 'pending' && (
                        <>
                          <span>•</span>
                          <span className="text-amber-500 font-bold flex items-center gap-0.5">
                            <span className="h-1 w-1 rounded-full bg-amber-500 animate-pulse inline-block" />
                            Draft
                          </span>
                        </>
                      )}
                      {doc.syncStatus === 'conflict' && (
                        <>
                          <span>•</span>
                          <span className="text-rose-500 font-bold flex items-center gap-0.5">
                            <AlertTriangle className="h-2 w-2" />
                            Conflict
                          </span>
                        </>
                      )}
                      {isShared && (
                        <>
                          <span>•</span>
                          <span className="text-cyan-400 flex items-center font-bold">
                            {doc.permissions.linkSharing !== 'private' ? (
                              <Globe className="h-2 w-2" />
                            ) : (
                              <Users className="h-2 w-2" />
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Delete action */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete ${doc.title}?`)) {
                      onDeleteDoc(doc.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-900 transition-all cursor-pointer"
                  title="Move document to Trash"
                  id={`delete-doc-btn-${doc.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Drag Drop Hint Overlay */}
      <div className="p-3 border-t border-slate-800 text-center text-[11px] text-slate-500 bg-slate-950/30" id="drag-drop-hint">
        <p>Drag files directly here (.txt, .md, .docx, .pdf)</p>
      </div>

      {/* Simulated User Profile Switching Modal */}
      {profileModalDoc && (
        <div className="absolute inset-0 bg-slate-950/90 z-45 flex items-center justify-center p-4 animate-fadeIn" id="user-sandbox-modal">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 w-full max-w-sm space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <LogIn className="h-4 w-4 text-cyan-400" />
                Change Custom User Account
              </h3>
              <button 
                onClick={() => setProfileModalDoc(false)} 
                className="text-slate-400 hover:text-slate-100 text-sm font-semibold"
                id="close-profile-modal-btn"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              We provide this profile card so you can immediately toggle between different users (e.g., matching invite list emails) to verify editing, reading, and shared permission checks perfectly!
            </p>
            <form onSubmit={saveProfileChange} className="space-y-3 font-sans">
              <div>
                <label className="block text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-1">
                  Full Display Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  id="profile-name-input"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  id="profile-email-input"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setProfileModalDoc(false)}
                  className="bg-slate-800 hover:bg-slate-705 px-3 py-1.5 rounded text-xs text-slate-300 transition-colors"
                  id="cancel-profile-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-cyan-600 hover:bg-cyan-500 px-4 py-1.5 rounded text-xs text-white font-medium transition-colors"
                  id="save-profile-btn"
                >
                  Switch User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
