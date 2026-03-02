import { Dialog, Transition } from "@headlessui/react";
import React, { Fragment, useState, useEffect } from "react";
import { RefreshIcon, ExternalLinkIcon, TrashIcon } from "@heroicons/react/outline";
import axios from "axios";
import { toast } from "react-toastify";
import { useSession } from "next-auth/react";
import { CREDENTIAL } from "../../middleware/check_auth_perms";
import { hasCredsAny } from "../../lib/credsChecker";
import moment from "moment";

const SESSION_CUTOFF_UTC_HOUR = 10;

/** Compute the session date label from a loadedAt timestamp (matches server logic). */
function getSessionLabel(loadedAt: string | Date): string {
    const d = new Date(loadedAt);
    const sessionDate = new Date(d);
    if (d.getUTCHours() < SESSION_CUTOFF_UTC_HOUR) {
        sessionDate.setUTCDate(sessionDate.getUTCDate() - 1);
    }
    const weekday = sessionDate.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
    const dd = String(sessionDate.getUTCDate()).padStart(2, "0");
    const mm = String(sessionDate.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = sessionDate.getUTCFullYear();
    return `${weekday}, ${dd}/${mm}/${yyyy}`;
}

const STAGE_CONFIG: Record<string, { label: string; cls: string }> = {
    loaded:        { label: "Loaded",        cls: "badge badge-sm badge-neutral" },
    playing:       { label: "Playing",       cls: "badge badge-sm badge-info" },
    outcome_added: { label: "Outcome Added", cls: "badge badge-sm badge-success" },
};

export default function GmControlsModal({ isOpen, onClose }) {
    const { data: session } = useSession();
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Session history state
    const [sessionData, setSessionData] = useState<{
        activeSession: any;
        sessionHistory: any[];
    } | null>(null);
    const [isLoadingSession, setIsLoadingSession] = useState(false);
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
    const [deletingThreadIds, setDeletingThreadIds] = useState<Set<string>>(new Set());

    async function fetchSessionData() {
        setIsLoadingSession(true);
        try {
            const res = await axios.get("/api/active-session");
            setSessionData(res.data);
        } catch {
            toast.error("Failed to load session data.");
        } finally {
            setIsLoadingSession(false);
        }
    }

    useEffect(() => {
        if (isOpen) fetchSessionData();
    }, [isOpen]);

    const handleRefreshUsers = async () => {
        setIsRefreshing(true);
        try {
            const res = await axios.post("/api/discord-users");
            toast.success(
                `Discord users refreshed: ${res.data.count} users cached (${res.data.upserted} new, ${res.data.updated} updated).`
            );
        } catch (error) {
            const msg = error.response?.data?.error || "Failed to refresh Discord users.";
            toast.error(msg);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleDeleteMessage = async (entry: any) => {
        if (!confirm(`Delete Discord message for "${entry.missionName}"?\n\nThis will remove it from Discord and from the session history list. This cannot be undone.`)) {
            return;
        }
        setDeletingIds((prev) => new Set(prev).add(entry.messageId));
        try {
            await axios.delete("/api/active-session", {
                params: { messageId: entry.messageId, threadId: entry.threadId },
            });
            setSessionData((prev) =>
                prev
                    ? { ...prev, sessionHistory: prev.sessionHistory.filter((s) => s.messageId !== entry.messageId) }
                    : prev
            );
            toast.success(`Discord message for "${entry.missionName}" deleted.`);
        } catch (err: any) {
            toast.error("Delete failed: " + (err.response?.data?.error || err.message));
        } finally {
            setDeletingIds((prev) => { const s = new Set(prev); s.delete(entry.messageId); return s; });
        }
    };

    const handleDeleteThread = async (group: { label: string; threadId: string; entries: any[] }) => {
        if (!confirm(`Delete the Discord thread for "${group.label}"?\n\nThis will permanently delete the entire thread from Discord and remove all session history entries for it. This cannot be undone.`)) {
            return;
        }
        setDeletingThreadIds((prev) => new Set(prev).add(group.threadId));
        try {
            await axios.delete("/api/active-session-thread", {
                params: { threadId: group.threadId },
            });
            setSessionData((prev) =>
                prev
                    ? { ...prev, sessionHistory: prev.sessionHistory.filter((s) => s.threadId !== group.threadId) }
                    : prev
            );
            toast.success(`Discord thread deleted.`);
        } catch (err: any) {
            toast.error("Delete failed: " + (err.response?.data?.error || err.message));
        } finally {
            setDeletingThreadIds((prev) => { const s = new Set(prev); s.delete(group.threadId); return s; });
        }
    };

    // Group sessionHistory by threadId, newest thread and newest entries first
    const groups: { label: string; isCurrentSession: boolean; threadId: string; entries: any[] }[] = [];
    if (sessionData?.sessionHistory?.length) {
        const activeThreadId = sessionData.activeSession?.threadId;

        const threadOrder: string[] = [];
        const byThread: Record<string, any[]> = {};

        // Iterate newest-first so threadOrder and entries within each group are newest-first
        for (const e of [...sessionData.sessionHistory].reverse()) {
            if (!byThread[e.threadId]) {
                threadOrder.push(e.threadId);
                byThread[e.threadId] = [];
            }
            byThread[e.threadId].push(e);
        }

        for (const threadId of threadOrder) {
            const entries = byThread[threadId];
            const isCurrentSession = threadId === activeThreadId;
            const sessionLabel = entries[0]?.loadedAt
                ? getSessionLabel(entries[0].loadedAt)
                : "Unknown Session";
            groups.push({
                isCurrentSession,
                threadId,
                label: isCurrentSession
                    ? `Current Session — ${sessionData.activeSession?.threadName ?? sessionLabel}`
                    : `Previous Session — ${sessionLabel}`,
                entries,
            });
        }
    }

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog
                as="div"
                className="fixed inset-0 z-50 overflow-y-auto"
                onClose={onClose}
            >
                <div className="min-h-screen px-4 text-center">
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
                    </Transition.Child>

                    <span className="inline-block h-screen align-middle" aria-hidden="true">
                        &#8203;
                    </span>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0 scale-95"
                        enterTo="opacity-100 scale-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100 scale-100"
                        leaveTo="opacity-0 scale-95"
                    >
                        <div className="inline-block w-full max-w-2xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl dark:bg-gray-800">
                            <Dialog.Title
                                as="h3"
                                className="text-xl font-bold leading-6 text-gray-900 dark:text-white"
                            >
                                GM Controls
                            </Dialog.Title>
                            <div className="flex gap-1 mt-1 mb-5 pb-3 border-b dark:border-gray-700">
                                <span className="badge badge-sm badge-neutral">GM</span>
                                <span className="badge badge-sm badge-neutral">Admin</span>
                                <span className="badge badge-sm badge-neutral">Mission Review Team</span>
                            </div>

                            <div className="flex flex-col space-y-6">

                                {/* Session Mission List */}
                                {hasCredsAny(session, [CREDENTIAL.GM, CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER]) && (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-semibold text-sm uppercase tracking-wide text-gray-900 dark:text-white">
                                                Session Missions
                                            </h4>
                                            <button
                                                className="btn btn-xs btn-ghost"
                                                onClick={fetchSessionData}
                                                disabled={isLoadingSession}
                                            >
                                                <RefreshIcon className={`w-3.5 h-3.5 mr-1 ${isLoadingSession ? "animate-spin" : ""}`} />
                                                Refresh
                                            </button>
                                        </div>

                                        {isLoadingSession ? (
                                            <div className="flex justify-center py-6">
                                                <span className="loading loading-spinner loading-md" />
                                            </div>
                                        ) : groups.length === 0 ? (
                                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                                                No sessions found in the last 2 weeks.
                                            </p>
                                        ) : (
                                            <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
                                                {groups.map((group) => (
                                                    <div key={group.label}>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                                {group.label}
                                                            </p>
                                                            <button
                                                                className={`btn btn-xs btn-error btn-outline ${deletingThreadIds.has(group.threadId) ? "loading" : ""}`}
                                                                disabled={deletingThreadIds.has(group.threadId)}
                                                                onClick={() => handleDeleteThread(group)}
                                                                title="Delete Discord Thread"
                                                            >
                                                                {!deletingThreadIds.has(group.threadId) && <TrashIcon className="w-3 h-3 mr-1" />}
                                                                Delete Thread
                                                            </button>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {group.entries.map((entry) => {
                                                                const stageCfg = STAGE_CONFIG[entry.stage] ?? STAGE_CONFIG.loaded;
                                                                const missionSlug = entry.missionId ?? entry.uniqueName;
                                                                const loadedTime = entry.loadedAt
                                                                    ? moment(entry.loadedAt).format("HH:mm")
                                                                    : null;
                                                                const isDeleting = deletingIds.has(entry.messageId);

                                                                return (
                                                                    <div
                                                                        key={entry.messageId}
                                                                        className="flex items-start gap-2 p-2.5 rounded-lg border border-base-300 dark:border-gray-700 bg-base-100 dark:bg-gray-900/40"
                                                                    >
                                                                        {/* Mission info */}
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate" title={entry.missionName}>
                                                                                    {entry.missionName}
                                                                                </span>
                                                                                <span className={stageCfg.cls}>{stageCfg.label}</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex-wrap">
                                                                                {loadedTime && <span>{loadedTime}</span>}
                                                                                {entry.messageId && (
                                                                                    <span
                                                                                        className="font-mono text-gray-400 dark:text-gray-300 select-all break-all"
                                                                                        title="Message ID — click to select all"
                                                                                    >
                                                                                        {entry.messageId}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* Actions */}
                                                                        <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                                                            {missionSlug && (
                                                                                <a
                                                                                    href={`/reforger-missions/${missionSlug}`}
                                                                                    target="_blank"
                                                                                    rel="noreferrer"
                                                                                    className="btn btn-xs btn-ghost text-gray-400"
                                                                                    title="View mission"
                                                                                >
                                                                                    <ExternalLinkIcon className="w-3.5 h-3.5" />
                                                                                </a>
                                                                            )}
                                                                            {entry.discordMessageUrl && (
                                                                                <a
                                                                                    href={entry.discordMessageUrl}
                                                                                    target="_blank"
                                                                                    rel="noreferrer"
                                                                                    className="btn btn-xs btn-ghost text-gray-300 dark:text-gray-300"
                                                                                    title="View in Discord"
                                                                                >
                                                                                    Discord
                                                                                </a>
                                                                            )}
                                                                            <button
                                                                                className={`btn btn-xs btn-error btn-outline ${isDeleting ? "loading" : ""}`}
                                                                                disabled={isDeleting}
                                                                                onClick={() => handleDeleteMessage(entry)}
                                                                                title="Delete Discord Message"
                                                                            >
                                                                                {!isDeleting && <TrashIcon className="w-3.5 h-3.5" />}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Discord User Cache */}
                                {hasCredsAny(session, [CREDENTIAL.GM, CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER]) && (
                                    <div className="pt-4 border-t dark:border-gray-700 space-y-3">
                                        <h4 className="font-semibold text-sm uppercase tracking-wide text-gray-900 dark:text-white">
                                            Discord User Cache
                                        </h4>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            Refreshes the cached list of Discord server members used
                                            for the leader selection dropdown in gameplay history.
                                        </p>
                                        <button
                                            disabled={isRefreshing}
                                            onClick={handleRefreshUsers}
                                            className={`btn btn-primary w-full ${isRefreshing ? "loading" : ""}`}
                                        >
                                            {!isRefreshing && <RefreshIcon className="w-5 h-5 mr-2" />}
                                            Refresh Discord Users
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="mt-6 flex justify-end">
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={onClose}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </Transition.Child>
                </div>
            </Dialog>
        </Transition>
    );
}
