'use client';

/**
 * Collaborator list component for project sharing.
 */

import React, { useState } from 'react';
import { X, Mail, UserPlus, ChevronDown } from 'lucide-react';

type Role = 'owner' | 'admin' | 'editor' | 'viewer';

interface Collaborator {
  id: string;
  user_id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role: Role;
}

interface CollaboratorListProps {
  collaborators: Collaborator[];
  currentUserId: string;
  isOwner: boolean;
  onRemove: (userId: string) => void;
  onRoleChange: (userId: string, role: Role) => void;
  onInvite: (email: string, role: Role) => void;
}

const roleLabels: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

const roleColors: Record<Role, string> = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  editor: 'bg-green-100 text-green-800',
  viewer: 'bg-gray-100 text-gray-800',
};

export function CollaboratorList({
  collaborators,
  currentUserId,
  isOwner,
  onRemove,
  onRoleChange,
  onInvite,
}: CollaboratorListProps) {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('viewer');
  const [editingRole, setEditingRole] = useState<string | null>(null);

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteEmail) {
      onInvite(inviteEmail, inviteRole);
      setInviteEmail('');
      setInviteRole('viewer');
      setShowInvite(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Collaborators</h3>
        {isOwner && (
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
          >
            <UserPlus className="w-4 h-4" />
            Invite
          </button>
        )}
      </div>

      {showInvite && (
        <form onSubmit={handleInvite} className="p-3 bg-gray-50 rounded-lg space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email address"
                className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowInvite(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Send Invite
            </button>
          </div>
        </form>
      )}

      <ul className="space-y-2">
        {collaborators.map((collab) => (
          <li
            key={collab.id}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
          >
            {collab.avatar_url ? (
              <img
                src={collab.avatar_url}
                alt=""
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium text-gray-600">
                {(collab.full_name || collab.email).charAt(0).toUpperCase()}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {collab.full_name || collab.email}
                {collab.user_id === currentUserId && (
                  <span className="text-gray-500 font-normal"> (you)</span>
                )}
              </p>
              <p className="text-xs text-gray-500 truncate">{collab.email}</p>
            </div>

            <div className="relative">
              {editingRole === collab.id && isOwner && collab.role !== 'owner' ? (
                <select
                  value={collab.role}
                  onChange={(e) => {
                    onRoleChange(collab.user_id, e.target.value as Role);
                    setEditingRole(null);
                  }}
                  onBlur={() => setEditingRole(null)}
                  autoFocus
                  className="px-2 py-1 text-xs border border-gray-300 rounded"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <button
                  onClick={() => isOwner && collab.role !== 'owner' && setEditingRole(collab.id)}
                  className={`px-2 py-1 text-xs rounded ${roleColors[collab.role]} ${
                    isOwner && collab.role !== 'owner' ? 'cursor-pointer' : 'cursor-default'
                  }`}
                  disabled={!isOwner || collab.role === 'owner'}
                >
                  {roleLabels[collab.role]}
                  {isOwner && collab.role !== 'owner' && (
                    <ChevronDown className="w-3 h-3 inline ml-1" />
                  )}
                </button>
              )}
            </div>

            {isOwner && collab.user_id !== currentUserId && collab.role !== 'owner' && (
              <button
                onClick={() => onRemove(collab.user_id)}
                className="p-1 text-gray-400 hover:text-red-600"
                title="Remove collaborator"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {collaborators.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">
          No collaborators yet. Invite someone to get started.
        </p>
      )}
    </div>
  );
}
