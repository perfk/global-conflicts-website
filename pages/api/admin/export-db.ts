import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../../lib/mongodb";
import { CREDENTIAL } from "../../../middleware/check_auth_perms";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { hasCredsAny } from "../../../lib/credsChecker";

export const config = {
    api: {
        responseLimit: false,
    },
};

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
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const db = (await MyMongo).db("prod");

    // Filter server_sessions to the last 90 days to keep the payload lean
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [
        reforger_missions,
        reforger_mission_metadata,
        configs,
        discord_users,
        events,
        users,
        server_sessions
    ] = await Promise.all([
        db.collection("reforger_missions").find({}).toArray(),
        db.collection("reforger_mission_metadata").find({}).toArray(),
        db.collection("configs").find({}).toArray(),
        db.collection("discord_users").find({}).toArray(),
        db.collection("events").find({}).toArray(),
        db.collection("users").find({}).toArray(),
        db.collection("server_sessions").find({ startedAt: { $gte: ninetyDaysAgo } }).toArray()
    ]);

    const exportData = {
        reforger_missions,
        reforger_mission_metadata,
        configs,
        discord_users,
        events,
        users,
        server_sessions
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="gc_db_export_${new Date().toISOString().split('T')[0]}.json"`);
    
    // We send directly instead of returning a JSON object to allow the large response
    res.status(200).send(JSON.stringify(exportData));
});

export default apiRoute;
