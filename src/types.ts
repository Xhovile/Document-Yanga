/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DocumentType = 'txt' | 'md' | 'docx' | 'pdf';

export type SharingPermission = 'private' | 'view' | 'edit';

export interface UserPermission {
  email: string;
  role: 'view' | 'edit';
}

export interface DocumentPermissions {
  owner: string; // Email of the document owner
  sharedWith: UserPermission[];
  linkSharing: SharingPermission;
}

export type SyncStatusType = 'synced' | 'pending' | 'conflict';

export interface Document {
  id: string;
  title: string;
  content: string; // HTML, MD, or Plain Text content
  type: DocumentType;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  size: number;
  syncStatus: SyncStatusType;
  isOfflineDraft: boolean;
  originalContent?: string; // Content of the document before offline changes (to detect conflict)
  permissions: DocumentPermissions;
}

export interface DocumentVersion {
  versionId: string;
  documentId: string;
  content: string;
  updatedAt: number;
  updatedBy: string;
}

export interface AppUser {
  email: string;
  name: string;
  isLoggedIn: boolean;
}

export type WorkspaceMode = 'view' | 'edit' | 'sync' | 'share';

export interface FileChunk {
  fileId: string;
  index: number;
  data: string;
}
