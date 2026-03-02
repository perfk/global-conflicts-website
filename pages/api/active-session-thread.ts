import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../lib/mongodb";
import { CREDENTIAL } from "../../middleware/check_auth_perms";
import { hasCredsAny } from "../../lib/credsChecker";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { callBotDeleteThread } from "../../lib/discordPoster";
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
 * DELETE /api/active-session-thread?threadId=...
 * Asks the bot to delete the entire Discord forum thread.
 * The bot refuses if the thread has more than 2 non-bot messages.
 * On success, removes all sessionHistory entries for the thread from configs.
 */
apiRoute.delete(async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);
    if (!hasAccess(session)) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const threadId = req.query.threadId as string | undefined;
    if (!threadId) {
        return res.status(400).json({ error: "threadId is required" });
    }

    // Ask bot to delete the thread — bot enforces the non-bot message count check
    let deleteResult: { deleted: boolean; reason?: string; messageCount?: number };
    try {
        deleteResult = await callBotDeleteThread({ threadId });
    } catch (err: any) {
        return res.status(502).json({
            error: "Failed to reach Discord bot: " + (err?.message ?? "unknown error"),
        });
    }

    if (!deleteResult.deleted) {
        return res.status(422).json({
            error: deleteResult.reason ?? "Thread cannot be deleted",
            messageCount: deleteResult.messageCount,
        });
    }

    // Remove all sessionHistory entries for this thread
    const db = (await MyMongo).db("prod");
    const configs = await db.collection("configs").findOne({}, { projection: { sessionHistory: 1 } });
    const removedEntries = (configs?.sessionHistory ?? []).filter((s: any) => s.threadId === threadId);

    await db.collection("configs").updateOne(
        {},
        { $pull: { sessionHistory: { threadId } } as any }
    );

    await logReforgerAction(
        LOG_ACTION.DISCORD_THREAD_DELETE,
        {
            threadId,
            removedEntries: removedEntries.map((e: any) => ({
                messageId: e.messageId,
                missionName: e.missionName,
            })),
        },
        { discord_id: session.user["discord_id"], username: session.user["username"] }
    );

    return res.status(200).json({ ok: true });
});

export default apiRoute;
