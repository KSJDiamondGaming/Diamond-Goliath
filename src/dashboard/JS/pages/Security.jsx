import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { io } from 'socket.io-client';

export default function Security() {
  const [loading, setLoading] = useState(true);

  const [data, setData] = useState({
    ok: true,

    threatLevel: 'low',

    incidents: {
      total: 0,
      critical: 0,
      recent: [],
    },

    lockdown: {
      active: false,
    },

    quarantine: {
      users: {},
    },
  });

  const guildId = useMemo(() => {
    return (
      localStorage.getItem('guildId') ||
      localStorage.getItem('selectedGuildId')
    );
  }, []);

  useEffect(() => {
    async function load() {
      try {
        if (!guildId || guildId === 'null') {
          setData({
            ok: false,
            error: 'Select a server first.',
          });

          return;
        }

        const response = await fetch(
          `/api/security/overview?guildId=${guildId}`
        );

        const result = await response.json();

        setData(result);
      } catch (error) {
        console.error(
          '[Security] Failed to load:',
          error
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [guildId]);

  useEffect(() => {
    if (!guildId || guildId === 'null') {
      return;
    }

    const socket = io();

    socket.emit('joinGuild', guildId);

    socket.on('guild:update', (update) => {
      if (!update) return;

      console.log(
        '[Security] Live update:',
        update
      );

      if (
        update.type === 'security:event' &&
        update.incident
      ) {
        setData((previous) => {
          const current =
            previous || {};

          const incidents =
            current.incidents || {};

          const recent = Array.isArray(
            incidents.recent
          )
            ? incidents.recent
            : [];

          const updatedRecent = [
            update.incident,
            ...recent,
          ].slice(0, 25);

          return {
            ...current,

            threatLevel:
              update.incident.severity ||
              current.threatLevel,

            incidents: {
              ...incidents,

              total:
                Number(
                  incidents.total || 0
                ) + 1,

              critical:
                update.incident
                  .severity ===
                'critical'
                  ? Number(
                      incidents.critical ||
                        0
                    ) + 1
                  : Number(
                      incidents.critical ||
                        0
                    ),

              recent: updatedRecent,
            },
          };
        });
      }

      if (
        update.type ===
        'security:lockdown'
      ) {
        setData((previous) => ({
          ...previous,

          lockdown: {
            ...(previous.lockdown ||
              {}),

            ...(update.lockdown ||
              {}),
          },
        }));
      }

      if (
        update.type ===
        'security:quarantine'
      ) {
        setData((previous) => ({
          ...previous,

          quarantine: {
            ...(previous.quarantine ||
              {}),

            ...(update.quarantine ||
              {}),
          },
        }));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [guildId]);

  if (loading) {
    return (
      <div className="p-6">
        Loading security overview...
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="p-6 text-red-400">
        {data?.error ||
          'Failed to load security data.'}
      </div>
    );
  }

  const quarantineCount = Object.keys(
    data.quarantine?.users || {}
  ).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          Security Center
        </h1>

        <p className="text-zinc-400">
          Live Goliath protection overview
        </p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="rounded-xl bg-zinc-900 p-4">
          <p className="text-zinc-400 text-sm">
            Threat Level
          </p>

          <h2 className="text-2xl font-bold capitalize">
            {data.threatLevel}
          </h2>
        </div>

        <div className="rounded-xl bg-zinc-900 p-4">
          <p className="text-zinc-400 text-sm">
            Total Incidents
          </p>

          <h2 className="text-2xl font-bold">
            {data.incidents.total}
          </h2>
        </div>

        <div className="rounded-xl bg-zinc-900 p-4">
          <p className="text-zinc-400 text-sm">
            Critical Incidents
          </p>

          <h2 className="text-2xl font-bold text-red-400">
            {data.incidents.critical}
          </h2>
        </div>

        <div className="rounded-xl bg-zinc-900 p-4">
          <p className="text-zinc-400 text-sm">
            Lockdown
          </p>

          <h2 className="text-2xl font-bold">
            {data.lockdown?.active
              ? 'ACTIVE'
              : 'Inactive'}
          </h2>
        </div>

        <div className="rounded-xl bg-zinc-900 p-4">
          <p className="text-zinc-400 text-sm">
            Quarantined
          </p>

          <h2 className="text-2xl font-bold">
            {quarantineCount}
          </h2>
        </div>
      </div>

      <div className="rounded-xl bg-zinc-900 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">
            Live Security Feed
          </h2>

          <div className="text-xs text-green-400">
            LIVE
          </div>
        </div>

        <div className="space-y-3">
          {data.incidents.recent.map(
            (incident, index) => (
              <div
                key={
                  incident.id || index
                }
                className="rounded-lg bg-zinc-800 p-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">
                      {incident.type ||
                        'Unknown Incident'}
                    </p>

                    <p className="text-sm text-zinc-400">
                      {incident.reason ||
                        'No reason provided'}
                    </p>
                  </div>

                  <div className="text-sm capitalize">
                    {incident.severity ||
                      'low'}
                  </div>
                </div>
              </div>
            )
          )}

          {!data.incidents.recent.length && (
            <div className="text-zinc-500 text-sm">
              No incidents detected.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}