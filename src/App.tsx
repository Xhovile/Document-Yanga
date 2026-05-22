/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  loadLocalDocuments, saveLocalDocuments, loadUserAccount, saveUserAccount,
  loadOfflineModeState, saveOfflineModeState, syncDocumentToServer, loadCloudDocuments,
  saveCloudDocument, getByteSize
} from './db';
import { Document, WorkspaceMode, AppUser, DocumentType } from './types';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import { convertDocumentToPDF } from './utils/converter';
import { 
  Wifi, WifiOff, RefreshCw, AlertTriangle, FileCheck, CheckCircle2, 
  Sparkles, Layers, ArrowRight, Database, Settings, X, HardDrive, 
  Info, Cpu, Trash2
} from 'lucide-react';

export default function App() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser>({ email: '', name: '', isLoggedIn: false });
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<WorkspaceMode>('view');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(false);
  const [compressionEnabled, setCompressionEnabled] = useState<boolean>(true);
  const [lazyLoadLimit, setLazyLoadLimit] = useState<number>(100); // in KB

  // Capture sidebar collapse modifications onto small settings storage
  useEffect(() => {
    localStorage.setItem('yanga_sidebar_collapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  const handleSelectDocument = (doc: Document) => {
    const updatedDoc: Document = {
      ...doc,
      lastOpenedAt: Date.now()
    };
    
    // Save last opened doc target ID onto small settings
    localStorage.setItem('yanga_last_opened_doc_id', doc.id);
    
    const updatedDocs = documents.map((d) => d.id === doc.id ? updatedDoc : d);
    
    // Re-index recently opened files order first
    const sortedDocs = updatedDocs.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    
    setDocuments(sortedDocs);
    saveLocalDocuments(sortedDocs);
    setActiveDoc(updatedDoc);
    setActiveMode('view');
  };

  // Load initial settings and documents
  useEffect(() => {
    const initLoad = async () => {
      const loadedDocs = await loadLocalDocuments();
      setDocuments(loadedDocs);
      
      const loadedUser = loadUserAccount();
      setCurrentUser(loadedUser);
      
      const loadedOffline = loadOfflineModeState();
      setIsOffline(loadedOffline);

      const collapsedStored = localStorage.getItem('yanga_sidebar_collapsed');
      if (collapsedStored !== null) {
        setIsSidebarCollapsed(JSON.parse(collapsedStored));
      }

      if (loadedDocs.length > 0) {
        const lastOpenedId = localStorage.getItem('yanga_last_opened_doc_id');
        const matched = lastOpenedId ? loadedDocs.find(d => d.id === lastOpenedId) : null;
        if (matched) {
          const updatedDoc = { ...matched, lastOpenedAt: Date.now() };
          const updatedDocs = loadedDocs.map((d) => d.id === matched.id ? updatedDoc : d);
          setDocuments(updatedDocs);
          saveLocalDocuments(updatedDocs);
          setActiveDoc(updatedDoc);
        } else {
          setActiveDoc(loadedDocs[0]);
        }
      }
    };
    initLoad();
  }, []);

  // Sync draft offline toggles with system variables
  useEffect(() => {
    saveOfflineModeState(isOffline);
    triggerAutoSyncAll();
  }, [isOffline]);

  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  // Creates a new blank template
  const handleCreateDocument = (type: DocumentType, title: string) => {
    const newDocObj: Document = {
      id: `${type}-${Date.now()}`,
      title,
      content: getDocumentTemplate(type),
      type,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastOpenedAt: Date.now(),
      size: 0,
      syncStatus: isOffline ? 'pending' : 'synced',
      isOfflineDraft: isOffline,
      originalContent: getDocumentTemplate(type),
      permissions: {
        owner: currentUser.email,
        sharedWith: [],
        linkSharing: 'private',
      }
    };
    newDocObj.size = getByteSize(newDocObj.content);

    localStorage.setItem('yanga_last_opened_doc_id', newDocObj.id);

    const updated = [newDocObj, ...documents];
    const sorted = updated.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    setDocuments(sorted);
    saveLocalDocuments(sorted);
    setActiveDoc(newDocObj);
    setActiveMode('edit'); // switch to edit directly on creation

    if (!isOffline) {
      saveCloudDocument(newDocObj);
      showNotification(`Created and synced "${title}"`, 'success');
    } else {
      showNotification(`Created local draft "${title}" (offline)`, 'info');
    }
  };

  const getDocumentTemplate = (type: DocumentType): string => {
    if (type === 'md') {
      return `# Untitled Document\n\nStart writing markdown formatting style notes...`;
    } else if (type === 'docx') {
      return `<h1>Untitled DOCX Report</h1><p>Start writing rich-formatted document templates...</p>`;
    } else if (type === 'pdf') {
      return `Simulated PDF Document File\n-----------------------------\nThis content represents imported PDF texts.`;
    }
    return `Start typing plain text document specifications...`;
  };

  const handleDeleteDocument = (id: string) => {
    const updated = documents.filter((doc) => doc.id !== id);
    setDocuments(updated);
    saveLocalDocuments(updated);
    
    // Select another document if active got deleted
    if (activeDoc?.id === id) {
      const nextActive = updated.length > 0 ? updated[0] : null;
      setActiveDoc(nextActive);
      if (nextActive) {
        localStorage.setItem('yanga_last_opened_doc_id', nextActive.id);
      } else {
        localStorage.removeItem('yanga_last_opened_doc_id');
      }
    }
    showNotification('Document moved to trash', 'info');
  };

  const handleImportDocument = (title: string, content: string, type: DocumentType, size: number) => {
    const newDocObj: Document = {
      id: `imported-${Date.now()}`,
      title,
      content,
      type,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastOpenedAt: Date.now(),
      size,
      syncStatus: isOffline ? 'pending' : 'synced',
      isOfflineDraft: isOffline,
      originalContent: content,
      permissions: {
        owner: currentUser.email,
        sharedWith: [],
        linkSharing: 'private',
      }
    };

    localStorage.setItem('yanga_last_opened_doc_id', newDocObj.id);

    const updated = [newDocObj, ...documents];
    const sorted = updated.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    setDocuments(sorted);
    saveLocalDocuments(sorted);
    setActiveDoc(newDocObj);
    setActiveMode('view');
    showNotification(`Successfully imported "${title}"`, 'success');

    if (!isOffline) {
      saveCloudDocument(newDocObj);
    }
  };

  // Handles text area content modifications with draft saving state
  const handleContentChange = (newContent: string) => {
    if (!activeDoc) return;

    const size = getByteSize(newContent);
    const updatedDoc: Document = {
      ...activeDoc,
      content: newContent,
      size,
      updatedAt: Date.now(),
      syncStatus: 'pending', // Marks as pending sync immediately
    };

    // Update state & databases
    const list = documents.map((doc) => doc.id === activeDoc.id ? updatedDoc : doc);
    setDocuments(list);
    saveLocalDocuments(list);
    setActiveDoc(updatedDoc);

    // If online, auto sync draft to remote cloud
    if (!isOffline) {
      const res = syncDocumentToServer(updatedDoc);
      if (res.success) {
        const syncedDoc: Document = { ...updatedDoc, syncStatus: 'synced' };
        const syncedList = list.map((doc) => doc.id === activeDoc.id ? syncedDoc : doc);
        setDocuments(syncedList);
        saveLocalDocuments(syncedList);
        setActiveDoc(syncedDoc);
      } else if (res.conflictWith) {
        // Conflict detected!
        const conflictedDoc: Document = { 
          ...updatedDoc, 
          syncStatus: 'conflict',
          originalContent: res.conflictWith.content 
        };
        const conflictedList = list.map((doc) => doc.id === activeDoc.id ? conflictedDoc : doc);
        setDocuments(conflictedList);
        saveLocalDocuments(conflictedList);
        setActiveDoc(conflictedDoc);
        showNotification("Conflict detected! View Resolve settings", "error");
      }
    }
  };

  const handleTitleChange = (newTitle: string) => {
    if (!activeDoc) return;
    const updatedDoc = {
      ...activeDoc,
      title: newTitle,
      updatedAt: Date.now(),
      syncStatus: 'pending' as const,
    };
    const list = documents.map((doc) => doc.id === activeDoc.id ? updatedDoc : doc);
    setDocuments(list);
    saveLocalDocuments(list);
    setActiveDoc(updatedDoc);
    triggerAutoSyncAll();
  };

  const handleUpdatePermissions = (id: string, updates: Partial<Document['permissions']>) => {
    const list = documents.map((doc) => {
      if (doc.id === id) {
        const updatedDoc = {
          ...doc,
          permissions: {
            ...doc.permissions,
            ...updates,
          },
          updatedAt: Date.now(),
        };
        if (!isOffline) {
          saveCloudDocument(updatedDoc);
        }
        return updatedDoc;
      }
      return doc;
    });

    setDocuments(list);
    saveLocalDocuments(list);
    
    if (activeDoc?.id === id) {
      const activeUpdate = list.find((d) => d.id === id);
      if (activeUpdate) setActiveDoc(activeUpdate);
    }
    showNotification('Permissions updated successfully', 'success');
  };

  // Resolves conflict manually (forces keeper selection)
  const handleResolveConflict = (id: string, resolvedContent: string) => {
    const docToResolve = documents.find((doc) => doc.id === id);
    if (!docToResolve) return;

    const resolvedDoc: Document = {
      ...docToResolve,
      content: resolvedContent,
      size: getByteSize(resolvedContent),
      syncStatus: 'synced',
      originalContent: resolvedContent,
      updatedAt: Date.now(),
    };

    const list = documents.map((doc) => doc.id === id ? resolvedDoc : doc);
    setDocuments(list);
    saveLocalDocuments(list);
    setActiveDoc(resolvedDoc);
    
    if (!isOffline) {
      saveCloudDocument(resolvedDoc);
    }
    showNotification('Reconciliation conflict resolved', 'success');
  };

  // Background check on reconnecting trigger
  const triggerAutoSyncAll = () => {
    if (isOffline) {
      return;
    }

    const unSyncedDocs = documents.filter((doc) => doc.syncStatus === 'pending');
    if (unSyncedDocs.length === 0) return;

    let hasConflict = false;
    const resolvedList = documents.map((doc) => {
      if (doc.syncStatus === 'pending') {
        const res = syncDocumentToServer(doc);
        if (res.success) {
          return { ...doc, syncStatus: 'synced' as const };
        } else if (res.conflictWith) {
          hasConflict = true;
          return { 
            ...doc, 
            syncStatus: 'conflict' as const, 
            originalContent: res.conflictWith.content 
          };
        }
      }
      return doc;
    });

    setDocuments(resolvedList);
    saveLocalDocuments(resolvedList);
    
    if (activeDoc) {
      const activeMatch = resolvedList.find((d) => d.id === activeDoc.id);
      if (activeMatch) setActiveDoc(activeMatch);
    }

    if (hasConflict) {
      showNotification('Some drafts resulted in synchronization conflicts!', 'error');
    } else {
      showNotification(`Reconciliation complete. All pending drafts uploaded!`, 'success');
    }
  };

  // Profile switches
  const handleUserUpdate = (user: AppUser) => {
    setCurrentUser(user);
    saveUserAccount(user);
    showNotification(`Switched user access to ${user.email}`, 'info');
  };

  // Convert File call
  const handleExportPDF = (doc: Document) => {
    convertDocumentToPDF(doc.title, doc.content, doc.type);
    showNotification(`Compiled ${doc.title} to PDF successfully`, 'success');
  };

  const handleWipeDatabase = () => {
    if (window.confirm("Are you sure you want to delete all local documents? This will completely reset your active workspace!")) {
      setDocuments([]);
      saveLocalDocuments([]);
      setActiveDoc(null);
      showNotification("Workspace cleared. Ready for fresh documents!", "info");
    }
  };

  const handleReseedDemoData = () => {
    const defaultEmail = currentUser?.email || 'guest@yanga.io';
    const demoDocs: Document[] = [
      {
        id: `md-welcome`,
        title: `Welcome to Yanga Docs`,
        content: `# Welcome to Yanga Docs\n\nThis is a highly structured markdown and rich text workspace designed with maximum desktop precision, off-line synchronization, and robust conflict resolution controls.\n\n### Core Workspace Highlights\n- **Offline First**: Work directly without fear. Swapping network status queues updates in IndexedDB.\n- **Surgical Sync Reconciliation**: Toggle mode states to inspect server differentials side-by-side.\n- **Diagnostic Engine**: Check memory and cache limits anytime in the live Settings Drawer.\n\n### Formatted list styles\n- Custom checklist item 1\n- High contract text widgets\n- Flexible responsive grid layout\n\n\`\`\`javascript\n// Feel free to write code samples too\nconst appName = "Yanga Docs";\nconsole.log(\`Launched elegant workspace: \${appName}\`);\n\`\`\`\n\nUse the sidebar to create, upload, preview, and share your technical reports instantly!`,
        type: 'md',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now() - 3600000,
        lastOpenedAt: Date.now() - 5000,
        size: 0,
        syncStatus: 'synced',
        isOfflineDraft: false,
        originalContent: '',
        permissions: {
          owner: defaultEmail,
          sharedWith: [],
          linkSharing: 'private'
        }
      },
      {
        id: `docx-annual`,
        title: `Annual Performance Analysis`,
        content: `<h1>Annual Growth Analysis</h1><p>Our progressive web framework leverages rapid, fluid offline caching with direct IndexedDB support.</p><h2>Workspace Metrics</h2><p>Experience clean responsiveness coupled with precise layout spacing and display typography.</p>`,
        type: 'docx',
        createdAt: Date.now() - 1800000,
        updatedAt: Date.now() - 1800000,
        lastOpenedAt: Date.now() - 10000,
        size: 0,
        syncStatus: 'synced',
        isOfflineDraft: false,
        originalContent: '',
        permissions: {
          owner: defaultEmail,
          sharedWith: [],
          linkSharing: 'private'
        }
      }
    ];

    demoDocs.forEach(d => {
      d.size = getByteSize(d.content);
      d.originalContent = d.content;
    });

    const sorted = demoDocs.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    setDocuments(sorted);
    saveLocalDocuments(sorted);
    setActiveDoc(sorted[0]);
    localStorage.setItem('yanga_last_opened_doc_id', sorted[0].id);
    setActiveMode('view');
    showNotification("Reset & seeded workspace with demo templates", "success");
  };

  // Dynamic simulation builder to FORCE mock conflicts
  const simulateCloudConflictWrite = () => {
    if (!activeDoc) return;
    
    // Create an override version directly on the mock server
    const remoteDocOverride: Document = {
      ...activeDoc,
      content: `[SIMULATED CLOUD CONFLICT VERSION]\n\nThis content was written directly on the cloud database by another collaborator while you were working offline!\n\nThis demonstration allows you to test out Document Yanga's robust conflict comparison layout and overwrite features.`,
      updatedAt: Date.now() + 1000, // Make it newer than active doc
    };
    
    // Save directly to raw simulated cloud db bypassed clients
    const cloudDocs = loadCloudDocuments();
    const index = cloudDocs.findIndex(d => d.id === activeDoc.id);
    if (index >= 0) {
      cloudDocs[index] = remoteDocOverride;
    } else {
      cloudDocs.push(remoteDocOverride);
    }
    localStorage.setItem('yanga_cloud_mock', JSON.stringify(cloudDocs));

    // Force offline client state to trigger conflict on sync
    const forcedPendingClientDoc: Document = {
      ...activeDoc,
      syncStatus: 'pending' as const,
      originalContent: activeDoc.content, // Old content
    };

    const updatedList = documents.map((doc) => doc.id === activeDoc.id ? forcedPendingClientDoc : doc);
    setDocuments(updatedList);
    saveLocalDocuments(updatedList);
    setActiveDoc(forcedPendingClientDoc);

    showNotification('Injected conflict onto Server schema. Attempting sync...', 'info');
    
    // Trigger sync check immediately
    setTimeout(() => {
      // Temporarily toggle online to catch the sync collision
      setIsOffline(false);
      triggerAutoSyncAll();
    }, 1200);
  };

  return (
    <div className="h-screen flex bg-[#0a0b0f] text-slate-100 overflow-hidden font-sans" id="applet-body-container">
      {/* Drawer Workspace Sidebar */}
      <Sidebar
        documents={documents}
        activeDoc={activeDoc}
        setActiveDoc={handleSelectDocument}
        onCreateDoc={handleCreateDocument}
        onDeleteDoc={handleDeleteDocument}
        onImportDoc={handleImportDocument}
        isOffline={isOffline}
        setIsOffline={setIsOffline}
        currentUser={currentUser}
        onUserUpdate={handleUserUpdate}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        onToggleSettings={() => setShowSettingsDrawer(!showSettingsDrawer)}
      />

      {/* Editor Main Canvas Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 relative" id="main-canvas-wrapper">
        {/* Sync Status Banner */}
        {isOffline && (
          <div className="bg-[#181510] border-b border-amber-950/40 px-6 py-2 flex items-center justify-between text-xs text-amber-500" id="offline-network-banner">
            <span className="flex items-center space-x-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>Offline Workspace active: draft is stored on device.</span>
            </span>
            <button 
              onClick={() => setIsOffline(false)} 
              className="px-2 py-0.5 rounded bg-amber-950/20 text-[10px] hover:bg-amber-950/40 font-bold transition-all font-mono uppercase cursor-pointer"
            >
              Go Online
            </button>
          </div>
        )}

        {/* Dynamic Activity Notifications */}
        {notification && (
          <div 
            className={`absolute top-4 right-4 z-50 p-2.5 px-3.5 rounded-lg shadow-lg border border-slate-800 text-xs font-sans font-medium flex items-center space-x-2.5 max-w-sm animate-scaleUp ${
              notification.type === 'success' ? 'bg-[#121815] border-emerald-800/40 text-emerald-400' :
              notification.type === 'error' ? 'bg-[#1c1214] border-rose-800/40 text-rose-400' :
              'bg-[#12141a] border-[#222530] text-slate-200'
            }`}
            id="notification-toast"
          >
            {notification.type === 'success' ? (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            )}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Editor component workspace */}
        <Editor
          document={activeDoc}
          onContentChange={handleContentChange}
          onTitleChange={handleTitleChange}
          currentUser={currentUser}
          isOffline={isOffline}
          activeMode={activeMode}
          setActiveMode={setActiveMode}
          onUpdatePermissions={handleUpdatePermissions}
          onTriggerSync={(id) => {
            triggerAutoSyncAll();
          }}
          onResolveConflict={handleResolveConflict}
          onExportPDF={handleExportPDF}
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          onToggleSettings={() => setShowSettingsDrawer(!showSettingsDrawer)}
          documentsList={documents}
          onSelectDoc={handleSelectDocument}
        />

        {/* Minimal Sliding Settings Drawer */}
        {showSettingsDrawer && (
          <div 
            className="absolute top-0 right-0 h-full w-80 md:w-90 bg-[#12141a] border-l border-[#1d1f27] text-slate-300 shadow-2xl z-50 flex flex-col animate-slideLeft"
            id="workspace-settings-drawer"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-[#1d1f27] flex items-center justify-between bg-[#101217]">
              <div className="flex items-center space-x-2">
                <Settings className="h-4 w-4 text-slate-450" />
                <h3 className="font-sans font-semibold text-xs tracking-tight text-slate-100">
                  Workspace Settings
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsDrawer(false)}
                className="p-1 rounded text-slate-500 hover:text-slate-100 transition-colors cursor-pointer"
                title="Close settings menu"
                id="close-settings-drawer-btn"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Telemetry Section */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono flex items-center space-x-1">
                  <Database className="h-3 w-3 text-slate-400" />
                  <span>Workspace Volume</span>
                </h4>
                <div className="bg-[#181a22] p-3.5 rounded-lg border border-[#21232e] space-y-2 font-mono text-xs">
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-500">Document count:</span>
                    <span className="font-medium text-slate-100">{documents.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">Database buffer:</span>
                    <span className="font-bold text-slate-200">
                      {(documents.reduce((acc, d) => acc + (d.size || 0), 0) / 1024).toFixed(2)} KB
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-500">Storage target:</span>
                    <span className="text-[#a4abb9] font-semibold text-[10px] font-mono">
                      IndexedDB Engine
                    </span>
                  </div>
                </div>
              </div>

              {/* Compression and Storage parameters */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono flex items-center space-x-1">
                  <Layers className="h-3 w-3 text-slate-400" />
                  <span>Performance</span>
                </h4>
                <div className="space-y-3.5 bg-[#181a22] p-3.5 rounded-lg border border-[#21232e]">
                  <div className="flex items-start justify-between">
                    <div className="space-y-0.5">
                      <label className="text-xs font-semibold text-slate-200 block">
                        Payload Zip
                      </label>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Zips schemas before queue commits.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCompressionEnabled(!compressionEnabled)}
                      className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        compressionEnabled ? 'bg-slate-300' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-slate-950 transition duration-200 ease-in-out ${
                          compressionEnabled ? 'translate-x-3.5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-slate-200">
                        Lazy Loading Buffer
                      </label>
                      <span className="text-[10px] font-mono text-slate-300 font-bold">
                        {lazyLoadLimit} KB
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="500"
                      step="10"
                      value={lazyLoadLimit}
                      onChange={(e) => setLazyLoadLimit(Number(e.target.value))}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-slate-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Reset Actions & Simulations Section */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono flex items-center space-x-1">
                  <Settings className="h-3 w-3 text-slate-400" />
                  <span>Maintenance Tools</span>
                </h4>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleReseedDemoData}
                    className="w-full py-1.5 px-3 rounded bg-transparent border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <span>Reseed Demo Templates</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleWipeDatabase}
                    className="w-full py-1.5 px-3 rounded bg-transparent border border-rose-900/40 text-rose-450 hover:bg-rose-955/10 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <span>Wipe Workspace local db</span>
                  </button>
                </div>
              </div>

              {/* Cloud Conflict Simulation section inside drawer to keep workspace pure */}
              {activeDoc && (
                <div className="p-3 bg-[#171213] border border-rose-950/40 rounded-lg space-y-2 mt-4" id="simulated-conflict-widget">
                  <h4 className="text-[10px] uppercase font-mono text-rose-450 font-bold flex items-center gap-1.5">
                    <span className="h-1 w-1 bg-rose-500 rounded-full animate-ping" />
                    Conflict Simulation
                  </h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Instantly simulate a server reconciliation clash for "{activeDoc.title}". This injects an off-line collision conflict into the remote cache pipeline, so you can test document resolution workflows flawlessly.
                  </p>
                  <button
                    onClick={simulateCloudConflictWrite}
                    type="button"
                    className="w-full py-1.5 px-3 rounded bg-rose-950/20 hover:bg-rose-950/40 border border-rose-800/40 text-rose-300 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Inject Server Sync Conflict
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
