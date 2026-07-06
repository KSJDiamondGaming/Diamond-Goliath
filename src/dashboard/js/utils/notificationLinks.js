export function buildNotificationRoute(notification = {}) {
  const metadata = notification.metadata || {};
  const source = String(notification.source || metadata.source || '').toLowerCase();
  const baseRoute = notification.route || '';
  const params = new URLSearchParams();

  const set = (key, value) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  };

  set('notificationId', notification.id);
  set('source', source);

  if (source === 'tickets') {
    set('ticketId', metadata.ticketId);
    set('displayId', metadata.displayId);
    set('status', metadata.status);
    return withQuery('/tickets', params);
  }

  if (source === 'forms') {
    set('submissionId', metadata.submissionId);
    set('formId', metadata.formId);
    set('status', metadata.status);
    return withQuery('/forms', params);
  }

  if (source === 'automation') {
    set('ruleId', metadata.ruleId);
    set('executionId', metadata.executionId);
    set('trigger', metadata.trigger);
    return withQuery('/automation', params);
  }

  if (source === 'security') {
    set('threat', metadata.threat);
    set('score', metadata.score);
    set('incidentId', metadata.incidentId);
    return withQuery('/security', params);
  }

  if (source === 'runtime') {
    set('error', metadata.error);
    set('latencyMs', metadata.latencyMs);
    return withQuery('/overview', params);
  }

  if (source === 'deployment') {
    set('environment', metadata.environment);
    set('commitSha', metadata.commitSha);
    return withQuery('/owner/deployments', params);
  }

  if (source === 'backup') {
    set('backupId', metadata.backupId);
    set('backupType', metadata.backupType);
    set('environment', metadata.environment);
    return withQuery('/owner/backups', params);
  }

  return withQuery(baseRoute || '/notifications', params);
}

function withQuery(path, params) {
  const query = params.toString();
  return `${path || '/notifications'}${query ? `?${query}` : ''}`;
}

export default buildNotificationRoute;
