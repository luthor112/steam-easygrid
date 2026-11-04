import { create_backup, list_backups, restore_backup, load_store } from "./backend";
import {
    pluginConfig, mergeStoredOverrides, mergeStoredCustomizationStates, safeParseStoredJSON,
    OVERRIDES_STORAGE_KEY, CUSTOMIZATION_STORAGE_KEY,
} from "./config";

export type BackupInfo = {
    name: string;
    path: string;
    created: number;
    grid_files: number;
    users: number;
};

export type BackupResult = { ok: boolean; empty?: boolean; error?: string; name?: string; path?: string; grid_files?: number };

export type RestoreResult = { ok: boolean; error?: string; restored?: number; skipped_users?: unknown; safety_backup?: string };

function parseBackendJson(raw: unknown): any {
    let value: any = raw;
    for (let i = 0; i < 2 && typeof value === "string"; i++) {
        try {
            value = JSON.parse(value);
        } catch {
            break;
        }
    }
    return typeof value === "object" && value !== null ? value : {};
}

function asList<T>(value: unknown): T[] {
    return Array.isArray(value) ? value : [];
}

export async function createBackup(): Promise<BackupResult> {
    try {
        return parseBackendJson(await create_backup({ a_root: pluginConfig.backup_folder, b_keep: pluginConfig.backup_keep })) as BackupResult;
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

export async function listBackups(path: string): Promise<{ backups: BackupInfo[]; defaultRoot: string }> {
    try {
        const answer = parseBackendJson(await list_backups({ a_path: path }));
        return { backups: asList<BackupInfo>(answer.backups), defaultRoot: answer.default_root ?? "" };
    } catch (e) {
        console.error("[steam-easygrid 4] Failed to list backups:", e);
        return { backups: [], defaultRoot: "" };
    }
}

async function reloadStoredState() {
    const overrides = await load_store({ a_key: OVERRIDES_STORAGE_KEY });
    if (overrides) mergeStoredOverrides(safeParseStoredJSON(overrides, "restored overrides"));
    const customization = await load_store({ a_key: CUSTOMIZATION_STORAGE_KEY });
    if (customization) mergeStoredCustomizationStates(safeParseStoredJSON(customization, "restored customization"));
}

export async function restoreBackup(backupPath: string): Promise<RestoreResult> {
    try {
        const result = parseBackendJson(await restore_backup({ a_backup_path: backupPath, b_safety_root: pluginConfig.backup_folder, c_keep: pluginConfig.backup_keep })) as RestoreResult;
        if (result.ok) await reloadStoredState();
        return result;
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

export function describeBackup(backup: BackupInfo): string {
    const when = backup.created ? new Date(backup.created * 1000).toLocaleString() : backup.name;
    const safety = backup.name.endsWith("-pre-restore") ? " (before a restore)" : "";
    return `${when}${safety} - ${backup.grid_files} files`;
}

export function describeBackupResult(result: BackupResult): string {
    return result.ok ? `Backup created (${result.grid_files} files)` : `Backup failed: ${result.error}`;
}

export function describeRestoreResult(result: RestoreResult): string {
    if (!result.ok) return `Restore failed: ${result.error}`;
    const skipped = asList<string>(result.skipped_users).length;
    const skippedText = skipped ? `, ${skipped} unknown Steam account${skipped === 1 ? "" : "s"} skipped` : "";
    return `Restored ${result.restored} files${skippedText} - restart Steam to see them`;
}

// Returns an error to show once the run has finished; having nothing to back up is not an error
export async function autoBackup(): Promise<string | undefined> {
    if (!pluginConfig.auto_backup) return undefined;
    const result = await createBackup();
    if (result.ok || result.empty) return undefined;
    console.error("[steam-easygrid 4] Automatic backup failed:", result.error);
    return `Backup failed: ${result.error}`;
}
