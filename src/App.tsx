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
  Sparkles, Layers, ArrowRight, Database
} from 'lucide-react';

export default function App() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser>({ email: '', name: '', isLoggedIn: false });
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<WorkspaceMode>('view');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Load initial settings and documents
  useEffect(() => {
    const loadedDocs = loadLocalDocuments();
    setDocuments(loadedDocs);
    
    const loadedUser = loadUserAccount();
    setCurrentUser(loadedUser);
    
    const loadedOffline = loadOfflineModeState();
    setIsOffline(loadedOffline);

    if (loadedDocs.length > 0) {
      setActiveDoc(loadedDocs[0]);
    }
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

    const updated = [newDocObj, ...documents];
    setDocuments(updated);
    saveLocalDocuments(updated);
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
      setActiveDoc(updated.length > 0 ? updated[0] : null);
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

    const updated = [newDocObj, ...documents];
    setDocuments(updated);
    saveLocalDocuments(updated);
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
    <div className="h-screen flex bg-slate-950 text-slate-100 overflow-hidden font-sans" id="applet-body-container">
      {/* Drawer Workspace Sidebar */}
      <Sidebar
        documents={documents}
        activeDoc={activeDoc}
        setActiveDoc={(doc) => {
          setActiveDoc(doc);
          setActiveMode('view');
        }}
        onCreateDoc={handleCreateDocument}
        onDeleteDoc={handleDeleteDocument}
        onImportDoc={handleImportDocument}
        isOffline={isOffline}
        setIsOffline={setIsOffline}
        currentUser={currentUser}
        onUserUpdate={handleUserUpdate}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
      />

      {/* Editor Main Canvas Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 relative" id="main-canvas-wrapper">
        {/* Sync Status Banner */}
        {isOffline && (
          <div className="bg-amber-955/20 border-b border-amber-900 px-6 py-2 flex items-center justify-between text-xs text-amber-400" id="offline-network-banner">
            <span className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span><b>Offline Workspace active:</b> Edits are safely stored in local browser db drafts.</span>
            </span>
            <button 
              onClick={() => setIsOffline(false)} 
              className="px-2 py-0.5 rounded bg-amber-900/40 text-[10px] hover:bg-amber-950 font-bold transition-colors font-mono uppercase cursor-pointer"
            >
              Go Online
            </button>
          </div>
        )}

        {/* Dynamic Activity Notifications */}
        {notification && (
          <div 
            className={`absolute top-4 right-4 z-50 p-3 rounded-lg shadow-lg border border-slate-800 text-xs font-medium flex items-center space-x-2.5 max-w-sm animate-scaleUp ${
              notification.type === 'success' ? 'bg-emerald-990 border-emerald-800 text-emerald-400' :
              notification.type === 'error' ? 'bg-rose-990 border-rose-800 text-rose-400' :
              'bg-slate-900 border-slate-800 text-cyan-400'
            }`}
            id="notification-toast"
          >
            {notification.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
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
        />

        {/* Cloud Conflict Simulation floating button for evaluation inside index sync */}
        {activeDoc && activeMode === 'sync' && (
          <div className="absolute bottom-4 right-4 z-40" id="simulation-injector-trigger">
            <button
              onClick={simulateCloudConflictWrite}
              className="flex items-center space-x-2 bg-gradient-to-r from-rose-600 to-indigo-650 hover:from-rose-500 hover:to-indigo-550 text-white font-mono text-xs font-bold py-2.5 px-4 rounded-xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              title="Click here to immediately mock a server conflict for current open draft"
              id="simulate-conflict-btn"
            >
              <Database className="h-3.5 w-3.5 animate-bounce" />
              <span>Simulate Cloud Sync Conflict</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
