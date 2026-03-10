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

apiRoute.get(async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER, CREDENTIAL.GM])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    try {
        const db = (await MyMongo).db("prod");
        
        // Find the most recent session to anchor our timeline
        const latestSession = await db.collection("server_sessions")
            .find({ snapshots: { $exists: true, $not: { $size: 0 } } })
            .sort({ startedAt: -1 })
            .limit(1)
            .project({ startedAt: 1, endedAt: 1 })
            .toArray();

        if (latestSession.length === 0) {
            return res.status(200).json({ timeline: [] });
        }

        const anchorTime = latestSession[0].endedAt ? new Date(latestSession[0].endedAt) : new Date();
        const windowEnd = anchorTime;
        const windowStart = new Date(anchorTime.getTime() - 8 * 60 * 60 * 1000);

        // Fetch all snapshots from sessions that were active within this window
        const sessions = await db.collection("server_sessions").find({
            startedAt: { $lte: windowEnd },
            $or: [
                { endedAt: { $gte: windowStart } },
                { endedAt: null }
            ]
        }).project({
            missionString: 1,
            startedAt: 1,
            endedAt: 1,
            snapshots: 1
        }).toArray();

        // Process snapshots into a flat timeline
        const timeline: { timestamp: Date; players: number; mission: string }[] = [];
        
        sessions.forEach(s => {
            if (s.snapshots && Array.isArray(s.snapshots)) {
                s.snapshots.forEach((snap: any) => {
                    const ts = new Date(snap.time);
                    if (ts >= windowStart && ts <= windowEnd) {
                        timeline.push({
                            timestamp: ts,
                            players: snap.players || 0,
                            mission: s.missionString || "Unknown Mission"
                        });
                    }
                });
            }
        });

        // Sort by timestamp
        timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        return res.status(200).json({ timeline });
    } catch (error) {
        console.error("Chart API error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default apiRoute;
