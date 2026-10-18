export function backupDumpArguments(connection: URL): string[] {
    return [
        '--format=custom',
        '--compress=6',
        // Keep the table schema and retention settings; diagnostic samples are
        // disposable and must not dominate every full database backup.
        '--exclude-table-data=public.xera_node_health_logs',
        '--exclude-table-data=public.xera_session_recordings',
        `--dbname=${connection}`,
    ];
}
