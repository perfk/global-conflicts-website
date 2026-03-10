import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../../lib/mongodb";
import { CREDENTIAL } from "../../../middleware/check_auth_perms";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { hasCredsAny } from "../../../lib/credsChecker";

const apiRoute = nextConnect({
    onError(error, req: NextApiRequest, res: NextApiResponse) {
        res.status(500).json({ error: `${error.message}` });
    },
    onNoMatch(req, res: NextApiResponse) {
        res.status(405).json({ error: `Method '${req.method}' Not Allowed` });
    },
});

apiRoute.post(async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER, CREDENTIAL.GM])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const db = (await MyMongo).db("prod");
    const now = new Date();

    await db.collection("configs").updateOne(
        {},
        {
            $set: {
                [`activeGMs.${session.user["discord_id"]}`]: {
                    username: session.user["username"] ?? session.user["nickname"] ?? "Unknown GM",
                    discord_id: session.user["discord_id"],
                    lastSeen: now,
                }
            }
        },
        { upsert: true }
    );

    // Clean up GMs not seen in the last 1 minute
    const staleThreshold = new Date(now.getTime() - 60 * 1000);
    const configs = await db.collection("configs").findOne({}, { projection: { activeGMs: 1 } });
    
    if (configs?.activeGMs) {
        const updates: any = {};
        let hasUpdates = false;

        for (const [discordId, data] of Object.entries(configs.activeGMs)) {
            if ((data as any).lastSeen < staleThreshold) {
                updates[`activeGMs.${discordId}`] = "";
                hasUpdates = true;
            }
        }

        if (hasUpdates) {
            await db.collection("configs").updateOne({}, { $unset: updates });
        }
    }

    res.status(200).json({ ok: true });
});

apiRoute.get(async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER, CREDENTIAL.GM])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const db = (await MyMongo).db("prod");
    const configs = await db.collection("configs").findOne({}, { projection: { activeGMs: 1 } });

    // Filter out stale GMs on read just in case
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 60 * 1000);
    
    const activeGMs = [];
    if (configs?.activeGMs) {
        for (const data of Object.values(configs.activeGMs)) {
            if ((data as any).lastSeen >= staleThreshold) {
                activeGMs.push(data);
            }
        }
    }

    // Sort by most recently seen
    activeGMs.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

    res.status(200).json({ activeGMs });
});

export default apiRoute;
