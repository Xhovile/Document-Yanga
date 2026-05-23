/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  FileText, Plus, Search, Trash2, Wifi, WifiOff, FileCode, ChevronLeft, Upload, User, Settings, Database, HardDrive,
  Folder, FolderOpen, ChevronDown, ChevronRight, Link
} from 'lucide-react';
import { Document, DocumentType, AppUser } from '../types';
import * as mammoth from 'mammoth';

export interface FolderFile {
  name: string;
  type: DocumentType;
  size: number;
  content: string;
}

export interface FolderNode {
  name: string;
  files: FolderFile[];
  subfolders: FolderNode[];
}

export interface DefaultFolder {
  id: string;
  name: string;
  isExpanded: boolean;
  subfolders: FolderNode[];
  files: FolderFile[];
  devicePath?: string;
}

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
  onToggleSettings: () => void;
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
  onToggleSettings,
}: SidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [newDocType, setNewDocType] = useState<DocumentType>('docx');
  const [newTitle, setNewTitle] = useState('');
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);
  
  const [editEmail, setEditEmail] = useState(currentUser.email);
  const [editName, setEditName] = useState(currentUser.name);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore foldered trees from localStorage or fall back to empty array on startup
  const [folders, setFolders] = useState<DefaultFolder[]>(() => {
    try {
      const stored = localStorage.getItem('yanga_custom_folders_v1');
      if (stored) {
        const parsed: DefaultFolder[] = JSON.parse(stored);
        return parsed.map(f => ({ ...f, isExpanded: false }));
      }
      return [];
    } catch {
      return [];
    }
  });

  const [expandedSubfolders, setExpandedSubfolders] = useState<Record<string, boolean>>({});
  const [activeFolderChoiceId, setActiveFolderChoiceId] = useState<string | null>(null);
  
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Persist customized folders structure
  const saveFoldersToStorage = (updated: DefaultFolder[]) => {
    try {
      localStorage.setItem('yanga_custom_folders_v1', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const deleteFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = folders.filter(f => f.id !== folderId);
    setFolders(updated);
    saveFoldersToStorage(updated);
  };

  const toggleFolder = (folderId: string) => {
    const updated = folders.map(f => f.id === folderId ? { ...f, isExpanded: !f.isExpanded } : f);
    setFolders(updated);
    saveFoldersToStorage(updated);
  };

  const toggleSubfolder = (pathKey: string) => {
    setExpandedSubfolders(prev => ({
      ...prev,
      [pathKey]: !prev[pathKey]
    }));
  };

  const isSubfolderExpanded = (pathKey: string) => !!expandedSubfolders[pathKey];

  const triggerFolderSelect = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering parent accordion toggling
    setActiveFolderChoiceId(folderId);
    setTimeout(() => {
      folderInputRef.current?.click();
    }, 50);
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesList = e.target.files;
      const tree: any = { name: 'root', files: [], subfolders: {} };

      for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        
        // parse webkitRelativePath
        const pathParts = file.webkitRelativePath.split('/').slice(1);
        if (pathParts.length === 0) continue;

        const fileName = pathParts[pathParts.length - 1];
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const isSupported = ['txt', 'md', 'docx', 'pdf'].includes(ext);
        if (!isSupported) continue;

        let currentNode = tree;
        for (let p = 0; p < pathParts.length - 1; p++) {
          const part = pathParts[p];
          if (!currentNode.subfolders[part]) {
            currentNode.subfolders[part] = { name: part, files: [], subfolders: {} };
          }
          currentNode = currentNode.subfolders[part];
        }

        const type = ext as DocumentType;

        let content = `[Local File: ${fileName}]`;
        if (file.size < 500000 && (ext === 'txt' || ext === 'md')) {
          try {
            content = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = (ev) => resolve(ev.target?.result as string || '');
              reader.onerror = () => resolve(`[Failed to read ${fileName}]`);
              reader.readAsText(file);
            });
          } catch {
            // fallback
          }
        }

        currentNode.files.push({
          name: fileName,
          type,
          size: file.size,
          content
        });
      }

      const convertNode = (node: any): FolderNode | null => {
        const subfoldersFiltered = Object.keys(node.subfolders)
          .map(k => convertNode(node.subfolders[k]))
          .filter((sub): sub is FolderNode => sub !== null);

        if (node.files.length === 0 && subfoldersFiltered.length === 0) {
          return null;
        }

        return {
          name: node.name,
          files: node.files,
          subfolders: subfoldersFiltered
        };
      };

      const parsedSubfolders = Object.keys(tree.subfolders)
        .map(k => convertNode(tree.subfolders[k]))
        .filter((sub): sub is FolderNode => sub !== null);
      const parsedFiles = tree.files;
      const rootName = filesList[0].webkitRelativePath.split('/')[0] || "Custom Folder";

      let updated: DefaultFolder[];
      if (activeFolderChoiceId && activeFolderChoiceId !== 'new') {
        updated = folders.map(f => {
          if (f.id === activeFolderChoiceId) {
            return {
              ...f,
              isExpanded: true,
              devicePath: rootName,
              subfolders: parsedSubfolders,
              files: parsedFiles
            };
          }
          return f;
        });
      } else {
        const newFolder: DefaultFolder = {
          id: 'f_' + Date.now().toString(),
          name: rootName,
          isExpanded: true,
          subfolders: parsedSubfolders,
          files: parsedFiles,
          devicePath: rootName
        };
        updated = [...folders, newFolder];
      }

      setFolders(updated);
      saveFoldersToStorage(updated);
      setActiveFolderChoiceId(null);
      e.target.value = '';
    }
  };

  const handleFolderFileClick = (file: FolderFile) => {
    const existing = documents.find(d => d.title === file.name);
    if (existing) {
      setActiveDoc(existing);
    } else {
      onImportDoc(file.name, file.content, file.type, file.size);
    }
  };

  const lastOpenedTime = (doc: Document) => {
    return Math.max(doc.lastOpenedAt || 0, doc.updatedAt || 0, doc.createdAt || 0);
  };

  const filteredDocs = [...documents]
    .sort((a, b) => lastOpenedTime(b) - lastOpenedTime(a))
    .filter((doc) =>
      doc.title.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .slice(0, 20);

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

  const processFile = async (file: File) => {
    const filename = file.name;
    const size = file.size;
    const ext = filename.split('.').pop()?.toLowerCase();
    
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
          const result = await mammoth.convertToHtml({ arrayBuffer });
          onImportDoc(filename, result.value, 'docx', size);
        } catch (err) {
          console.error(err);
          onImportDoc(filename, `Error loading Word document content.`, 'docx', size);
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === 'pdf') {
      const reader = new FileReader();
      reader.onload = () => {
        onImportDoc(filename, `[PDF Preview - View Mode Rendered] Size: ${size} bytes`, 'pdf', size);
      };
      reader.readAsText(file);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFile(e.target.files[0]);
    }
  };

  const saveProfileChange = (e: React.FormEvent) => {
    e.preventDefault();
    onUserUpdate({
      email: editEmail,
      name: editName,
      isLoggedIn: true,
    });
    setShowProfileSwitcher(false);
  };

  // Recursive renderer for subfolder nodes
  const renderFolderNode = (node: FolderNode, depth: number = 1, parentKey: string = ''): React.ReactNode => {
    const currentKey = parentKey ? `${parentKey}/${node.name}` : node.name;
    const key = `${currentKey}-${depth}`;
    const expanded = isSubfolderExpanded(key);
    
    return (
      <div key={key} className="mt-1 select-none">
        {/* Subfolder title */}
        <div 
          onClick={() => toggleSubfolder(key)}
          className="flex items-center space-x-1.5 py-1 px-1.5 rounded hover:bg-[#1a1c24] text-slate-400 hover:text-slate-200 cursor-pointer text-xs"
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-500" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-500" />
          )}
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 text-cyan-500/80 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-cyan-600/80 shrink-0" />
          )}
          <span className="truncate flex-1">{node.name}</span>
        </div>

        {/* Subfolder contents */}
        {expanded && (
          <div className="space-y-0.5">
            {node.subfolders?.map(sub => renderFolderNode(sub, depth + 1, currentKey))}
            {node.files?.map((file, idx) => (
              <div
                key={`${currentKey}/${file.name}-${idx}`}
                onClick={() => handleFolderFileClick(file)}
                className="flex items-center space-x-2 py-1 px-1.5 rounded hover:bg-[#1c1e26] text-slate-450 hover:text-slate-200 cursor-pointer text-xs"
                style={{ paddingLeft: `${(depth + 1) * 12 + 10}px` }}
              >
                <FileText className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                <span className="truncate flex-1">{file.name}</span>
                <span className="text-[9px] font-mono text-slate-600">{(file.size / 1024).toFixed(1)}K</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Human bytes size conversion helper
  const totalDiskBytes = documents.reduce((acc, d) => acc + (d.size || 0), 0);
  const formattedDBSize = (totalDiskBytes / 1024).toFixed(1);

  return (
    <div 
      className={`bg-[#12141a] text-slate-300 flex-shrink-0 relative transition-all duration-300 flex flex-col ${
        isCollapsed 
          ? 'w-0 overflow-hidden border-r-0 opacity-0 pointer-events-none' 
          : 'w-72 border-r border-[#1d1f27]'
      } ${
        isDragging ? 'ring-2 ring-cyan-500/20 ring-inset bg-[#151821]' : ''
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      id="sidebar-container"
    >
      {/* Top area: App Name / Status Indicator / Collapse */}
      <div className="p-5 border-b border-[#1d1f27] flex items-center justify-between" id="sidebar-header">
        <div className="flex items-center space-x-2.5">
          <FileCode className="h-5 w-5 text-neutral-400" />
          <span className="font-sans font-semibold text-base tracking-tight text-slate-100">
            Yanga
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="System Standby" />
        </div>

        <div className="flex items-center space-x-2">
          {/* Subtle online/offline toggler */}
          <button 
            type="button"
            onClick={() => setIsOffline(!isOffline)}
            className={`p-1.5 rounded transition-all cursor-pointer ${
              isOffline 
                ? 'text-amber-500 hover:bg-amber-950/20' 
                : 'text-emerald-500 hover:bg-emerald-950/20'
            }`}
            title={isOffline ? "Currently working offline" : "Database Synchronized"}
          >
            {isOffline ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-all cursor-pointer"
            title="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Middle area: Search & Creation trigger */}
      <div className="p-4 space-y-3.5 border-b border-[#1d1f27]" id="sidebar-actions-area">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-500 h-3.5 w-3.5" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#181a22] border border-[#1d1f27] rounded-md py-1.5 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-neutral-700 font-sans"
            id="search-input"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowCreateMenu(!showCreateMenu)}
            className="flex-1 flex items-center justify-center space-x-1.5 bg-[#f5f5f5] hover:bg-white text-slate-950 font-medium text-xs rounded-md py-1.5 px-3 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Doc</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center space-x-1.5 bg-[#1c1e26] hover:bg-[#222530] text-slate-300 border border-[#2b2e3a] font-medium text-xs rounded-md py-1.5 px-3 transition-colors cursor-pointer group"
            id="internal-storage-btn"
            title="Browse & find documents on this device"
          >
            <HardDrive className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-200" />
            <span>Internal Storage</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleManualUpload}
            accept=".txt,.md,.docx,.pdf"
            className="hidden"
          />
        </div>

        {showCreateMenu && (
          <form onSubmit={handleCreate} className="p-3 bg-[#181a22] border border-[#232631] rounded-lg space-y-2 animate-fadeIn" id="create-document-form">
            <div className="flex gap-1">
              {(['docx', 'txt', 'md'] as DocumentType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setNewDocType(type)}
                  className={`flex-1 text-[9px] font-mono py-1 rounded uppercase border font-semibold ${
                    newDocType === type
                      ? 'bg-slate-800 border-slate-700 text-slate-100'
                      : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="Name..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="flex-1 bg-slate-950 border border-[#262936] rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-700"
                autoFocus
                required
              />
              <button
                type="submit"
                className="bg-slate-200 hover:bg-white text-slate-900 rounded-md px-2 px-2.5 text-xs font-semibold cursor-pointer"
              >
                Add
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Middle area: Recent files list */}
      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1" id="recent-files-scroller">
        
        {/* Hidden directory picker input */}
        <input
          type="file"
          ref={folderInputRef}
          onChange={handleFolderSelect}
          className="hidden"
          {...{
            webkitdirectory: "true",
            directory: "true",
            multiple: true
          } as any}
        />

        {/* Local Directories / Folders Accordion Area */}
        {folders.length === 0 ? (
          <button
            type="button"
            onClick={(e) => triggerFolderSelect('new', e)}
            className="w-full flex items-center justify-center space-x-2 py-3 px-4 mb-5 bg-[#171a24] hover:bg-[#1d212d] text-cyan-400 hover:text-cyan-300 border border-cyan-500/10 hover:border-cyan-400/30 font-mono text-xs rounded-lg transition-all shadow-md group cursor-pointer text-center"
            id="choose-default-folders-btn"
          >
            <Folder className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" />
            <span>Choose default folders</span>
          </button>
        ) : (
          <div className="mb-6 space-y-1">
            <div className="flex items-center justify-between px-1.5 mb-2">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                Local Directories
              </h3>
              <button
                type="button"
                onClick={(e) => triggerFolderSelect('new', e)}
                className="text-[10px] text-cyan-500 hover:text-cyan-400 font-mono flex items-center space-x-1 cursor-pointer"
                title="Link another local folder"
              >
                <span>+ Add</span>
              </button>
            </div>

            <div className="space-y-1.5">
              {folders.map((f) => {
                return (
                  <div key={f.id} className="rounded-lg overflow-hidden bg-[#151720]/40 border border-[#1d1f27]/40">
                    <div 
                      onClick={() => toggleFolder(f.id)}
                      className={`flex items-center justify-between p-2 px-2.5 cursor-pointer hover:bg-[#1a1c24] transition-all select-none ${
                        f.isExpanded ? 'bg-[#181a22]' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        {f.isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        )}
                        {f.isExpanded ? (
                          <FolderOpen className="h-4 w-4 text-cyan-500/90 shrink-0" />
                        ) : (
                          <Folder className="h-4 w-4 text-cyan-600/90 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-slate-200 block truncate text-left">{f.name}</span>
                          {f.devicePath && (
                            <span className="text-[8.5px] font-mono text-cyan-500 block truncate leading-none text-left">
                              Linked: {f.devicePath}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => triggerFolderSelect(f.id, e)}
                          className="p-1 rounded text-slate-500 hover:text-cyan-400 hover:bg-[#20222d] transition-all cursor-pointer flex items-center gap-1 group"
                          title="Link / choose physical device folder"
                        >
                          <Link className="h-3 w-3 group-hover:scale-105" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => deleteFolder(f.id, e)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-[#20222d] transition-all cursor-pointer flex items-center gap-1 group animate-fadeIn"
                          title="Unlink/delete folder"
                        >
                          <Trash2 className="h-3 w-3 group-hover:scale-105" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded level items */}
                    {f.isExpanded && (
                      <div className="px-2 pb-2 bg-[#13151c]/40 space-y-1 pt-1 border-t border-[#1d1f27]/30 max-h-60 overflow-y-auto custom-scrollbar">
                        {f.subfolders.length === 0 && f.files.length === 0 && (
                          <div className="text-[10px] font-mono text-slate-600 py-2 text-center">
                            Empty device folder
                          </div>
                        )}
                        
                        {/* Nested levels of nodes recursively */}
                        {f.subfolders.map(sub => renderFolderNode(sub, 1, f.id))}
                        
                        {/* Nested files */}
                        {f.files.map((file, idx) => (
                          <div
                            key={`${f.id}/${file.name}-${idx}`}
                            onClick={() => handleFolderFileClick(file)}
                            className="flex items-center space-x-2 py-1 px-1.5 rounded hover:bg-[#1c1e26] text-slate-400 hover:text-slate-200 cursor-pointer text-xs ml-1.5"
                          >
                            <FileText className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                            <span className="truncate flex-1 text-left">{file.name}</span>
                            <span className="text-[9px] font-mono text-slate-600">{(file.size / 1024).toFixed(1)}K</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1.5 mb-2 font-mono">
          Recent Documents
        </h3>
        
        {filteredDocs.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-xs font-mono">
            Empty workspace
          </div>
        ) : (
          filteredDocs.map((doc) => {
            const isActive = activeDoc?.id === doc.id;
            
            return (
              <div
                key={doc.id}
                onClick={() => setActiveDoc(doc)}
                className={`group flex items-center justify-between p-1.5 px-2 rounded-lg cursor-pointer transition-all ${
                  isActive
                    ? 'bg-[#1c1e26] text-slate-100 font-medium border-l border-neutral-400'
                    : 'text-slate-400 hover:bg-[#15171f] hover:text-slate-200'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                  <FileText className={`h-3.5 w-3.5 shrink-0 ${
                    isActive ? 'text-slate-200' : 'text-slate-500'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs truncate leading-tight">
                      {doc.title}
                    </p>
                    <div className="flex items-center space-x-1 mt-0.5 text-[9px] font-mono text-slate-500">
                      <span>{(doc.size / 1024).toFixed(1)} KB</span>
                      <span>•</span>
                      <span className="uppercase text-[8px]">{doc.type}</span>
                      {doc.syncStatus === 'pending' && <span className="text-amber-500">✍️</span>}
                      {doc.syncStatus === 'conflict' && <span className="text-rose-500">⚠️</span>}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteDoc(doc.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-1 rounded transition-all cursor-pointer"
                  title="Move to trash"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom area: Storage status, Profile, settings drawer */}
      <div className="p-4 bg-[#101217] border-t border-[#1d1f27] space-y-3" id="sidebar-footer">
        
        {/* Storage footprint label */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-1">
          <span className="flex items-center gap-1">
            <Database className="h-3 w-3 text-slate-600" />
            <span>Offline footprint</span>
          </span>
          <span className="text-slate-400 font-bold">{formattedDBSize} KB</span>
        </div>

        {/* User profile & settings layout */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-900/40" id="user-settings-row">
          <button 
            type="button"
            onClick={() => setShowProfileSwitcher(!showProfileSwitcher)}
            className="flex items-center space-x-2.5 text-left min-w-0 max-w-[180px] hover:opacity-80 transition-all cursor-pointer"
            title="Switch workspace accounts"
          >
            <div className="h-6 w-6 rounded-full bg-slate-800 text-slate-300 font-bold flex items-center justify-center text-[10px] uppercase shrink-0">
              {currentUser.name.slice(0, 2) || "YS"}
            </div>
            <div className="overflow-hidden">
              <h4 className="text-xs font-medium text-slate-250 truncate">{currentUser.name || "Yanga User"}</h4>
            </div>
          </button>

          <button 
            type="button"
            onClick={onToggleSettings}
            className="p-1.5 rounded-md hover:bg-[#181a23] hover:text-slate-100 text-slate-500 transition-colors cursor-pointer"
            title="Workspace Details & Tools"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Account credentials switching dialog inside sidebar boundaries */}
      {showProfileSwitcher && (
        <div className="absolute inset-0 bg-[#0c0d11]/95 z-40 p-5 flex flex-col justify-center animate-fadeIn">
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200">
                Workspace Identity
              </h3>
            </div>
            <form onSubmit={saveProfileChange} className="space-y-3">
              <div>
                <label className="block text-[9px] uppercase font-mono text-slate-500 mb-1">
                  Full Display Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="block text-[9px] uppercase font-mono text-slate-500 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-600"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowProfileSwitcher(false)}
                  className="px-2.5 py-1 rounded bg-[#181a22] text-xs text-slate-450 hover:text-slate-250 hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1 rounded bg-slate-200 hover:bg-white text-slate-950 text-xs font-semibold"
                >
                  Switch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
