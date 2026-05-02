import { notFound, redirect } from 'next/navigation';

import { getServerSession } from 'next-auth/next';

import { Card, CardContent } from '@/components/ui/card';
import { fetchAuditLogsForOrganization } from '@/lib/audit-log-service';
import { authOptions } from '@/lib/auth';
import { isServerFeatureEnabled } from '@/lib/features/server';
import { getUserOrganizationContext } from '@/lib/microservice-auth';
import { getServerTranslation } from '@/lib/server-translation';

const PRIVILEGED_ROLES = new Set(['owner', 'admin']);

function formatTimestamp(value: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

type AuditLogPageParams = {
  tenant: string;
};

export default async function AuditLogPage({
  params,
}: {
  params: Promise<AuditLogPageParams>;
}) {
  if (!isServerFeatureEnabled('auditLog')) {
    notFound();
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const { tenant } = await params;
  const { t, language: locale } = await getServerTranslation();

  const organizationContext = await getUserOrganizationContext(
    session.user.id,
    tenant,
  );

  if (!PRIVILEGED_ROLES.has(organizationContext.role)) {
    redirect(`/${tenant}/dashboard`);
  }

  const { logs } = await fetchAuditLogsForOrganization(
    organizationContext.organizationId,
    { page: 1, pageSize: 50 },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{t('auditLog.title')}</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {t('auditLog.subtitle')}
          </p>
        </div>
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('auditLog.emptyState')}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop / tablet: table */}
          <div className="hidden overflow-hidden rounded-md border md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t('auditLog.columns.timestamp')}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t('auditLog.columns.actor')}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t('auditLog.columns.action')}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t('auditLog.columns.target')}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t('auditLog.columns.metadata')}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t('auditLog.columns.context')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-background">
                  {logs.map((log) => {
                    const actorName =
                      log.actor?.name ||
                      log.actor?.email ||
                      t('auditLog.systemActor');
                    return (
                      <tr key={log.id} className="align-top">
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {formatTimestamp(log.createdAt, locale)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-medium">{actorName}</span>
                            {log.actor?.email && (
                              <span className="text-xs text-muted-foreground">
                                {log.actor.email}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <code className="rounded bg-muted px-2 py-1 text-xs">
                            {log.action}
                          </code>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {log.targetType ? (
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {log.targetType}
                              </span>
                              {log.targetId && (
                                <span className="text-xs text-muted-foreground break-all">
                                  {log.targetId}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              {t('auditLog.noTarget')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {Object.keys(log.metadata).length === 0 ? (
                            <span className="text-muted-foreground">
                              {t('auditLog.noMetadata')}
                            </span>
                          ) : (
                            <details className="group">
                              <summary className="cursor-pointer text-primary underline-offset-2 group-open:underline">
                                {t('auditLog.viewMetadata')}
                              </summary>
                              <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-3 text-xs">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </details>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          <div className="flex flex-col gap-1">
                            {log.ipAddress && (
                              <span>
                                <span className="font-medium">
                                  {t('auditLog.ipAddressLabel')}:
                                </span>{' '}
                                {log.ipAddress}
                              </span>
                            )}
                            {log.userAgent && (
                              <span className="break-words">
                                <span className="font-medium">
                                  {t('auditLog.userAgentLabel')}:
                                </span>{' '}
                                {log.userAgent}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: card stack */}
          <ul className="flex flex-col gap-3 md:hidden">
            {logs.map((log) => {
              const actorName =
                log.actor?.name ||
                log.actor?.email ||
                t('auditLog.systemActor');
              const hasMetadata = Object.keys(log.metadata).length > 0;
              return (
                <li
                  key={log.id}
                  className="flex flex-col gap-3 rounded-lg border border-border/60 p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{actorName}</span>
                      {log.actor?.email && (
                        <span className="truncate text-xs text-muted-foreground">
                          {log.actor.email}
                        </span>
                      )}
                    </div>
                    <span className="flex-shrink-0 text-xs text-muted-foreground">
                      {formatTimestamp(log.createdAt, locale)}
                    </span>
                  </div>

                  <div>
                    <code className="inline-block rounded bg-muted px-2 py-1 text-xs break-all">
                      {log.action}
                    </code>
                  </div>

                  <div className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">
                      {t('auditLog.columns.target')}
                    </span>
                    {log.targetType ? (
                      <div className="flex flex-col">
                        <span className="font-medium">{log.targetType}</span>
                        {log.targetId && (
                          <span className="text-muted-foreground break-all">
                            {log.targetId}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        {t('auditLog.noTarget')}
                      </span>
                    )}
                  </div>

                  {hasMetadata && (
                    <details className="group text-xs">
                      <summary className="cursor-pointer text-primary underline-offset-2 group-open:underline">
                        {t('auditLog.viewMetadata')}
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-3">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </details>
                  )}

                  {(log.ipAddress || log.userAgent) && (
                    <div className="flex flex-col gap-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                      {log.ipAddress && (
                        <span>
                          <span className="font-medium">
                            {t('auditLog.ipAddressLabel')}:
                          </span>{' '}
                          {log.ipAddress}
                        </span>
                      )}
                      {log.userAgent && (
                        <span className="break-words">
                          <span className="font-medium">
                            {t('auditLog.userAgentLabel')}:
                          </span>{' '}
                          {log.userAgent}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}


