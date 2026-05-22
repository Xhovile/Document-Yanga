/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Document, AppUser, DocumentType } from './types';

// Native IndexedDB Settings
const DB_NAME = 'yanga_indexed_db';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

// Storage keys for small settings
const STORAGE_USER_KEY = 'yanga_user';
const STORAGE_OFFLINE_KEY = 'yanga_offline_mode';
const STORAGE_CLOUD_MOCK_KEY = 'yanga_cloud_mock';
const STORAGE_LAST_OPENED_DOC_KEY = 'yanga_last_opened_doc_id';
const STORAGE_SIDEBAR_COLLAPSED_KEY = 'yanga_sidebar_collapsed';

// Baseline seed documents updated with lastOpenedAt properties
const DEFAULT_DOCUMENTS: Document[] = [
  {
    id: 'intro-markdown',
    title: 'Welcome to Document Yanga.md',
    content: `# Welcome to Document Yanga! 🚀

Document Yanga is a **lightweight, offline-first document workspace** designed to be simple to use but powerful underneath.

## Core Features
1. **Four Dedicated Modes**: 
   - **View Mode**: Render and read files fast, without formatting clutter.
   - **Edit Mode**: Quick markdown or light formatting for rich-text manipulation.
   - **Sync Mode**: Work completely offline, see pending drafts, resolve sync conflicts.
   - **Share Mode**: Manage permissions (Private, Link View, Link Edit, Invited Members).

2. **Off-line Resilience** 📶
   - Go offline any time.
   - Edit, delete, and mock drafts locally. They are stored in your browser's persistent workspace.
   - Sync safely once you reconnect.

3. **In-Browser Conversions** 🔄
   - Convert **Markdown to PDF** instantly.
   - Convert **TXT Plain Text to PDF** instantly.
   - Render and read DOCX and raw metadata fast!

4. **Multi-user Permissions Sandbox** 👥
   - Simulate changing links from **Private** to **Link Edit** or **Link View**.
   - Invite emails (e.g., \`editor@yanga.app\`) with customized read/write privileges.

---
*Created with love and modular craftsmanship.* Yanga represents the leanest, cleanest MVP formula!`,
    type: 'md',
    createdAt: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
    updatedAt: Date.now() - 1000 * 60 * 30, // 30 mins ago
    lastOpenedAt: Date.now() - 1000 * 60 * 5, // 5 mins ago
    size: 1048,
    syncStatus: 'synced',
    isOfflineDraft: false,
    permissions: {
      owner: 'isaacmtsiriza310@gmail.com',
      sharedWith: [],
      linkSharing: 'view',
    },
  },
  {
    id: 'large-data-spec',
    title: 'Yanga Technical Specs.txt',
    content: `DOCUMENT YANGA: REGULATORY ARCHITECTURE SPECIFICATION
======================================================
Version: 1.4.1
Date: May 22, 2026

This is a large plain text document intended to demonstrate the high-performance text-rendering, file metadata analysis, and multi-chunk storage capability of Document Yanga.

Our file loading engine dynamically reads this document and presents statistical data, sizes, and word counts without locking the primary React rendering thread.

------------------------------------------------------
SECTION I: MODULAR DOMAIN BOUNDARIES
------------------------------------------------------
The system is divided into four highly-decoupled workflows:
1. READER: Direct-to-DOM parser avoiding expensive react-rerendering. Supports lazy viewport layout when files exceed chunk boundaries.
2. WRITER: A custom light-formatting visual editor supplying headings, standard weights, and clean formatting tags.
3. CONVERTER: Local PDF compiler compiling clean layouts. Uses absolute positioning parameters to map rich paragraphs.
4. SYNCHRONIZER: State queues storing delta steps until a connection transition is detected.

------------------------------------------------------
SECTION II: LARGE FILE LOADING ENGINE (LAZY LOAD)
------------------------------------------------------
For files exceeding 100KB, Document Yanga processes contents in a chunked pipeline:
- Memory utilization: Avoids holding raw DOM node arrays.
- Canvas preview: Displays heavy files instantly as scrollable texts.
- Local Database schema: Documents are split into index files for progressive retrieval.

------------------------------------------------------
SECTION III: PERMISSIONS SCHEMATICS
------------------------------------------------------
Every digital document holds a Permission Signature containing:
- Owner email address (verified).
- Access Control List (ACL) grouping other emails with roles:
  * Viewer: Read-only, conversion permitted.
  * Editor: Read, write, sync queue entry permitted.
- Share link visibility mode: Private, View, or Edit.

If linkSharing is set to 'view', any anonymous reader can access Content.
If set to 'edit', anyone with the link can edit. This configuration adapts immediately to local network states.

------------------------------------------------------
END OF SPECIFICATION FILE
------------------------------------------------------`,
    type: 'txt',
    createdAt: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    updatedAt: Date.now() - 1000 * 60 * 60 * 12, // 12 hours ago
    lastOpenedAt: Date.now() - 1000 * 60 * 60, // 1 hour ago
    size: 1890,
    syncStatus: 'synced',
    isOfflineDraft: false,
    permissions: {
      owner: 'isaacmtsiriza310@gmail.com',
      sharedWith: [
        { email: 'reviewer@yanga.org', role: 'view' }
      ],
      linkSharing: 'private',
    },
  },
  {
    id: 'sample-docx',
    title: 'Yanga Release Review.docx',
    content: `Yanga Release Progress Report
===============================================
This simulated DOCX file represents imported Microsoft Word content. 

In Yanga, we support:
- Standard Heading Structures (H1, H2, Title layouts)
- Bold text markup
- Unordered lists
- Fast, secure text retrieval representing office drafts.

Current Status: Complete and ready for distribution.
The integration tests have been successfully passed across all tested browser containers.`,
    type: 'docx',
    createdAt: Date.now() - 1000 * 60 * 60 * 5,
    updatedAt: Date.now() - 1000 * 60 * 60 * 5,
    lastOpenedAt: Date.now() - 1000 * 60 * 15, // 15 mins ago
    size: 2154,
    syncStatus: 'synced',
    isOfflineDraft: false,
    permissions: {
      owner: 'isaacmtsiriza310@gmail.com',
      sharedWith: [],
      linkSharing: 'private',
    },
  }
];

// Open connection to browser native IndexedDB
function getDBConnection(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      console.error('IndexedDB path opening crash:', request.error);
      reject(request.error);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// Loads local client documents from IndexedDB
export async function loadLocalDocuments(): Promise<Document[]> {
  try {
    const db = await getDBConnection();
    const docs = await new Promise<Document[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const query = store.getAll();
      query.onsuccess = () => resolve(query.result || []);
      query.onerror = () => reject(query.error);
    });

    if (docs && docs.length > 0) {
      // Return documents sorted by lastOpenedAt descending
      return docs.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    }
    
    // Seed default documents if storage is completely clean
    await saveLocalDocuments(DEFAULT_DOCUMENTS);
    
    // Seed simulated mock cloud too
    try {
      localStorage.setItem(STORAGE_CLOUD_MOCK_KEY, JSON.stringify(DEFAULT_DOCUMENTS));
    } catch (e) {
      console.error('Local cloud mock seeding failed', e);
    }

    return DEFAULT_DOCUMENTS.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  } catch (err) {
    console.error('loadLocalDocuments failed, reverting to memory seed:', err);
    return DEFAULT_DOCUMENTS;
  }
}

// Saves/Updates all documents inside IndexedDB atomically
export async function saveLocalDocuments(docs: Document[]): Promise<void> {
  try {
    const db = await getDBConnection();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      
      // Clear store to maintain clean indices, then bulk insert
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        if (docs.length === 0) {
          resolve();
          return;
        }
        
        let completed = 0;
        let failed = false;
        
        docs.forEach((doc) => {
          const putReq = store.put(doc);
          putReq.onsuccess = () => {
            completed++;
            if (completed === docs.length && !failed) {
              resolve();
            }
          };
          putReq.onerror = () => {
            if (!failed) {
              failed = true;
              reject(putReq.error);
            }
          };
        });
      };
      
      clearReq.onerror = () => reject(clearReq.error);
    });
  } catch (err) {
    console.error('saveLocalDocuments to IndexedDB failed', err);
  }
}

// Initialize small workspace settings
export function loadOfflineModeState(): boolean {
  try {
    const item = localStorage.getItem(STORAGE_OFFLINE_KEY);
    return item ? JSON.parse(item) : false;
  } catch {
    return false;
  }
}

export function saveOfflineModeState(isOffline: boolean) {
  try {
    localStorage.setItem(STORAGE_OFFLINE_KEY, JSON.stringify(isOffline));
  } catch (e) {
    console.error('Failed to save offline status', e);
  }
}

export function loadUserAccount(): AppUser {
  try {
    const userJson = localStorage.getItem(STORAGE_USER_KEY);
    if (userJson) {
      return JSON.parse(userJson);
    }
  } catch (e) {
    console.error('Failed to load user', e);
  }
  
  const defaultUser: AppUser = {
    email: 'isaacmtsiriza310@gmail.com',
    name: 'Isaac M.',
    isLoggedIn: true,
  };
  localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(defaultUser));
  return defaultUser;
}

export function saveUserAccount(user: AppUser) {
  try {
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Failed to save user info', e);
  }
}

// Mock "Cloud Database Instance" to simulate online sync, conflict generation, and shared databases
export function loadCloudDocuments(): Document[] {
  try {
    const cloudJson = localStorage.getItem(STORAGE_CLOUD_MOCK_KEY);
    if (cloudJson) {
      return JSON.parse(cloudJson);
    }
  } catch (e) {
    console.error('Failed to load cloud database mock', e);
  }
  localStorage.setItem(STORAGE_CLOUD_MOCK_KEY, JSON.stringify(DEFAULT_DOCUMENTS));
  return DEFAULT_DOCUMENTS;
}

export function saveCloudDocument(doc: Document) {
  try {
    const cloudDocs = loadCloudDocuments();
    const index = cloudDocs.findIndex(d => d.id === doc.id);
    const updatedDoc = { ...doc, syncStatus: 'synced' as const, isOfflineDraft: false };
    if (index >= 0) {
      cloudDocs[index] = updatedDoc;
    } else {
      cloudDocs.push(updatedDoc);
    }
    localStorage.setItem(STORAGE_CLOUD_MOCK_KEY, JSON.stringify(cloudDocs));
  } catch (e) {
    console.error('Failed to sync onto mock cloud', e);
  }
}

export function deleteCloudDocument(id: string) {
  try {
    const cloudDocs = loadCloudDocuments();
    const filtered = cloudDocs.filter(d => d.id !== id);
    localStorage.setItem(STORAGE_CLOUD_MOCK_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to delete in cloud mock', e);
  }
}

/**
 * Triggers a file-by-file update or sync query.
 * Detects whether there's a conflict
 */
export function syncDocumentToServer(doc: Document): { success: boolean; conflictWith?: Document } {
  if (loadOfflineModeState()) {
    return { success: false };
  }

  const cloudDocs = loadCloudDocuments();
  const remoteDoc = cloudDocs.find(d => d.id === doc.id);

  if (remoteDoc) {
    if (remoteDoc.updatedAt > (doc.originalContent ? doc.updatedAt : 0) && remoteDoc.content !== doc.originalContent) {
      if (remoteDoc.content !== doc.content) {
        return { success: false, conflictWith: remoteDoc };
      }
    }
  }

  saveCloudDocument(doc);
  return { success: true };
}

/**
 * Helper to force binary size representation for simulated files
 */
export function getByteSize(str: string): number {
  return new Blob([str]).size;
}

/**
 * Deletes a single document from IndexedDB
 */
export async function deleteLocalDocument(id: string): Promise<void> {
  try {
    const db = await getDBConnection();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('deleteLocalDocument from IndexedDB failed', err);
  }
}

/**
 * Saves or updates a single document inside IndexedDB
 */
export async function saveSingleLocalDocument(doc: Document): Promise<void> {
  try {
    const db = await getDBConnection();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(doc);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('saveSingleLocalDocument to IndexedDB failed', err);
  }
}

/**
 * Gets the last opened document ID from local storage key
 */
export function getLastOpenedDocumentId(): string | null {
  try {
    return localStorage.getItem(STORAGE_LAST_OPENED_DOC_KEY);
  } catch {
    return null;
  }
}

/**
 * Sets the last opened document ID in local storage key
 */
export function setLastOpenedDocumentId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(STORAGE_LAST_OPENED_DOC_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_LAST_OPENED_DOC_KEY);
    }
  } catch (e) {
    console.error('Failed to set last opened document ID', e);
  }
}

/**
 * Saves autosave backup data for a document
 */
export function saveAutosaveBackup(docId: string, content: string): void {
  try {
    localStorage.setItem(`yanga_autosave_${docId}`, content);
  } catch (e) {
    console.error('Failed to save autosave backup', e);
  }
}

/**
 * Loads autosave backup data for a document
 */
export function getAutosaveBackup(docId: string): string | null {
  try {
    return localStorage.getItem(`yanga_autosave_${docId}`);
  } catch {
    return null;
  }
}

/**
 * Clears autosave backup data for a document
 */
export function clearAutosaveBackup(docId: string): void {
  try {
    localStorage.removeItem(`yanga_autosave_${docId}`);
  } catch {
    // ignore
  }
}

/**
 * Loads and returns recent documents sorted by lastOpenedAt descending
 */
export async function getRecentDocuments(): Promise<Document[]> {
  const docs = await loadLocalDocuments();
  return docs.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

