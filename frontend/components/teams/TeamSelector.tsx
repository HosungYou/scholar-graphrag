'use client';

/**
 * Team selector component for project sharing.
 */

import React, { useState } from 'react';
import { Users, Plus, Check, X } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  description?: string;
  member_count: number;
}

interface TeamSelectorProps {
  teams: Team[];
  selectedTeamIds: string[];
  onSelectionChange: (teamIds: string[]) => void;
  onCreateTeam?: () => void;
}

export function TeamSelector({
  teams,
  selectedTeamIds,
  onSelectionChange,
  onCreateTeam,
}: TeamSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleTeam = (teamId: string) => {
    if (selectedTeamIds.includes(teamId)) {
      onSelectionChange(selectedTeamIds.filter(id => id !== teamId));
    } else {
      onSelectionChange([...selectedTeamIds, teamId]);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
      >
        <Users className="w-4 h-4" />
        <span>
          {selectedTeamIds.length === 0
            ? 'Share with teams'
            : `${selectedTeamIds.length} team${selectedTeamIds.length > 1 ? 's' : ''} selected`}
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200">
          <div className="p-2">
            {teams.length === 0 ? (
              <p className="text-sm text-gray-500 p-2">No teams yet</p>
            ) : (
              <ul className="space-y-1">
                {teams.map(team => (
                  <li key={team.id}>
                    <button
                      onClick={() => toggleTeam(team.id)}
                      className="w-full flex items-center gap-2 p-2 rounded hover:bg-gray-50 text-left"
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                        selectedTeamIds.includes(team.id)
                          ? 'bg-indigo-600 border-indigo-600'
                          : 'border-gray-300'
                      }`}>
                        {selectedTeamIds.includes(team.id) && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{team.name}</p>
                        <p className="text-xs text-gray-500">
                          {team.member_count} member{team.member_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {onCreateTeam && (
            <>
              <hr />
              <button
                onClick={() => {
                  setIsOpen(false);
                  onCreateTeam();
                }}
                className="w-full flex items-center gap-2 p-3 text-sm text-indigo-600 hover:bg-indigo-50"
              >
                <Plus className="w-4 h-4" />
                Create new team
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
