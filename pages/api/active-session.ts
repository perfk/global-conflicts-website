import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../lib/mongodb";
import { CREDENTIAL } from "../../middleware/check_auth_perms";
import { hasCredsAny } from "../../lib/credsChecker";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { callBotDeleteMessage } from "../../lib/discordPoster";
import { logReforgerAction, LOG_ACTION } from "../../lib/logging";

const apiRoute = nextConnect({
    onError(error, req: NextApiRequest, res: NextApiResponse) {
        res.status(500).json({ error: `${error.message}` });
    },
    onNoMatch(req, res: NextApiResponse) {
        res.status(405).json({ error: `Method '${req.method}' Not Allowed` });
    },
});

function hasAccess(session: any) {
    return hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.GM, CREDENTIAL.MISSION_REVIEWER]);
}

/**
 * GET /api/active-session
 * Returns the current active session + enriched session history with stage info.
 */
apiRoute.get(async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);
    if (!hasAccess(session)) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const db = (await MyMongo).db("prod");
    const configs = await db
        .collection("configs")
        .findOne({}, { projection: { activeSession: 1, sessionHistory: 1 } });

    // Filter to last 2 weeks
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const sessionHistory: any[] = (configs?.sessionHistory ?? []).filter(
        (s) => s.loadedAt && new Date(s.loadedAt) >= twoWeeksAgo
    );

    // Enrich each session entry with stage info from mission history
    const messageIds = sessionHistory.map((s) => s.messageId).filter(Boolean);
    const stageMap = new Map<string, { stage: string; outcome?: string; missionId?: string }>();

    if (messageIds.length > 0) {
        const metaDocs = await db
            .collection("reforger_mission_metadata")
            .find(
                { "history.discordMessageId": { $in: messageIds } },
                { projection: { missionId: 1, "history.discordMessageId": 1, "history.outcome": 1 } }
            )
            .toArray();

        for (const meta of metaDocs) {
            for (const h of meta.history ?? []) {
                if (h.discordMessageId && messageIds.includes(h.discordMessageId)) {
                    stageMap.set(h.discordMessageId, {
                        stage: h.outcome ? "outcome_added" : "playing",
                        outcome: h.outcome ?? undefined,
                        missionId: meta.missionId ?? undefined,
                    });
                }
            }
        }
    }

    const enrichedHistory = sessionHistory.map((s) => ({
        ...s,
        stage: stageMap.get(s.messageId)?.stage ?? "loaded",
        outcome: stageMap.get(s.messageId)?.outcome,
        missionId: stageMap.get(s.messageId)?.missionId,
    }));

    return res.status(200).json({
        activeSession: configs?.activeSession ?? null,
        sessionHistory: enrichedHistory,
    });
});

/**
 * DELETE /api/active-session?messageId=...&threadId=...
 * Deletes a Discord message and removes it from sessionHistory.
 */
apiRoute.delete(async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);
    if (!hasAccess(session)) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const messageId = req.query.messageId as string | undefined;
    const threadId = req.query.threadId as string | undefined;
    if (!messageId) {
        return res.status(400).json({ error: "messageId is required" });
    }

    // Best-effort: delete from Discord (may already be gone)
    if (threadId) {
        try {
            await callBotDeleteMessage({ messageId, threadId });
        } catch (err: any) {
            console.warn("[active-session DELETE] Discord delete failed:", err?.message);
        }
    }

    // Remove from sessionHistory in configs
    const db = (await MyMongo).db("prod");
    const configs = await db.collection("configs").findOne({}, { projection: { sessionHistory: 1 } });
    const removedEntry = (configs?.sessionHistory ?? []).find((s: any) => s.messageId === messageId);

    await db.collection("configs").updateOne(
        {},
        { $pull: { sessionHistory: { messageId } } as any }
    );

    await logReforgerAction(
        LOG_ACTION.DISCORD_MESSAGE_DELETE,
        { messageId, threadId, missionName: removedEntry?.missionName ?? null },
        { discord_id: session.user["discord_id"], username: session.user["username"] }
    );

    return res.status(200).json({ ok: true });
});

export default apiRoute;
