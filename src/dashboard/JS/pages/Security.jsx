import React, { useEffect, useState } from 'react';

export default function Security() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const guildId =
          localStorage.getItem('guildId');

        const response = await fetch(
          `/api/security/overview?guildId=${guildId}`
        );

        const result = await response.json();

        setData(result);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

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
        Failed to load security data.
      </div>
    );
  }

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

      <div className="grid grid-cols-4 gap-4">
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
      </div>

      <div className="rounded-xl bg-zinc-900 p-4">
        <h2 className="text-xl font-bold mb-4">
          Recent Incidents
        </h2>

        <div className="space-y-3">
          {data.incidents.recent.map(
            (incident, index) => (
              <div
                key={index}
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
                        'No reason'}
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
        </div>
      </div>
    </div>
  );
}