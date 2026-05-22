/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Document, AppUser, DocumentType } from './types';

// Storage keys
const STORAGE_DOCS_KEY = 'yanga_documents';
const STORAGE_USER_KEY = 'yanga_user';
const STORAGE_OFFLINE_KEY = 'yanga_offline_mode';
const STORAGE_CLOUD_MOCK_KEY = 'yanga_cloud_mock';

// Baseline seed documents
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

// Initialize storage helpers
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
  // Default fallback user
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

// Loads local client documents
export function loadLocalDocuments(): Document[] {
  try {
    const docsJson = localStorage.getItem(STORAGE_DOCS_KEY);
    if (docsJson) {
      return JSON.parse(docsJson);
    }
  } catch (e) {
    console.error('Failed to load local docs', e);
  }

  // Seed default docs and back up to both Cloud and Local stores
  localStorage.setItem(STORAGE_DOCS_KEY, JSON.stringify(DEFAULT_DOCUMENTS));
  localStorage.setItem(STORAGE_CLOUD_MOCK_KEY, JSON.stringify(DEFAULT_DOCUMENTS));
  return DEFAULT_DOCUMENTS;
}

export function saveLocalDocuments(docs: Document[]) {
  try {
    localStorage.setItem(STORAGE_DOCS_KEY, JSON.stringify(docs));
  } catch (e) {
    console.error('Failed to save local docs', e);
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
 * Detects whether there's a conflict (i.e. the file was modified in simulated cloud,
 * distinct from the client's original state, while client edited offline).
 */
export function syncDocumentToServer(doc: Document): { success: boolean; conflictWith?: Document } {
  // If offline mode is enabled, can't sync! Mark as pending.
  if (loadOfflineModeState()) {
    return { success: false };
  }

  const cloudDocs = loadCloudDocuments();
  const remoteDoc = cloudDocs.find(d => d.id === doc.id);

  if (remoteDoc) {
    // If the remote version is newer and different, and the client modified it offline,
    // we have a collision/conflict!
    if (remoteDoc.updatedAt > (doc.originalContent ? doc.updatedAt : 0) && remoteDoc.content !== doc.originalContent) {
      if (remoteDoc.content !== doc.content) {
        // Yes, real conflict! Return the remote file to handle conflict resolution UI
        return { success: false, conflictWith: remoteDoc };
      }
    }
  }

  // No conflict, merge and write to simulated Cloud
  saveCloudDocument(doc);
  return { success: true };
}

/**
 * Helper to force binary size representation for simulated files
 */
export function getByteSize(str: string): number {
  return new Blob([str]).size;
}
